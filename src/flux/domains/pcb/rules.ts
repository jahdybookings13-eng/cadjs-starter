// flux/domains/pcb/rules.ts — PcbGlobalRules + ERC/DRC (pure).
//
// RE evidence (PcbGlobalRules.js, 2026-11-04): rule sets carry ruleSetOrigin
// (user/inherited — matches docs "cascade and inheritance") and a typed
// selector (via, …). We implement the cascade/inherit resolution + a battery
// of pure electrical checks that need no kernel: unconnected pins, floating
// nets, shorts, missing power, NC pins that need a pull.

import type { PcbProject, PcbElement, PcbNet } from "./project";

export type RuleOrigin = "user" | "inherited";
export type RuleSelector =
  | "via"
  | "pad"
  | "net"
  | "element"
  | "zone"
  | "routeSegment";

export interface PcbRule {
  id: string;
  selector: RuleSelector;
  /** Property name on the selected entity. */
  property: string;
  /** Allowed values (empty = any). */
  allowed?: string[];
  origin: RuleOrigin;
  /** Severity when violated. */
  severity: "error" | "warning";
}

export interface RuleSet {
  id: string;
  name: string;
  rules: PcbRule[];
}

export interface Violation {
  rule: string;
  severity: "error" | "warning";
  where: string;
  msg: string;
}

// ---------------------------------------------------------------------------
// Cascade / inherit resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective rule list for a child given the parent chain.
 * A user rule at a deeper level overrides an inherited rule with the same
 * id+selector. Returns deepest-first (most specific wins).
 */
export function resolveRules(
  chain: RuleSet[], // root → leaf order
): PcbRule[] {
  const byKey = new Map<string, PcbRule>();
  for (const set of chain) {
    for (const r of set.rules) {
      const k = `${r.id}:${r.selector}`;
      // first (root) sets the base; a later user rule overrides.
      const prev = byKey.get(k);
      if (!prev || r.origin === "user") byKey.set(k, r);
    }
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Pure ERC / DRC checks (no kernel)
// ---------------------------------------------------------------------------

const POWER_NETS = new Set([
  "vcc",
  "vdd",
  "vss",
  "gnd",
  "vbat",
  "v33",
  "v5",
  "v12",
]);

function isPowerName(name: string): boolean {
  return POWER_NETS.has(name.toLowerCase());
}

export function runErcDrc(proj: PcbProject): Violation[] {
  const out: Violation[] = [];
  const els = allWithNets(proj);

  // 1. Unconnected pins (no net). Signals flagged; NC ignored.
  for (const el of els) {
    for (const p of el.pins) {
      if (p.kind === "nc") continue;
      if (!p.net) {
        out.push({
          rule: "erc.unconnected",
          severity: "warning",
          where: `${el.designator}.${p.pin}`,
          msg: "Pin has no net assigned",
        });
      }
    }
  }

  // 2. Floating nets (net with <2 pins).
  for (const n of proj.nets) {
    if (n.pins.length < 2) {
      out.push({
        rule: "erc-floating-net",
        severity: "warning",
        where: n.name,
        msg: "Net connects fewer than 2 pins (floating)",
      });
    }
  }

  // 3. Shorted nets (power net co-joined with a different power net).
  const netPower = new Map<string, string>();
  for (const n of proj.nets) {
    if (isPowerName(n.name)) netPower.set(n.name, n.name);
  }
  for (const el of els) {
    const seen = new Set<string>();
    for (const p of el.pins) {
      if (!p.net) continue;
      const pw = netPower.get(p.net.toLowerCase());
      if (pw) {
        if (seen.has(pw)) continue;
        seen.add(pw);
      }
    }
  }
  // Detect two distinct power nets sharing a pin set (short).
  const byPinset = new Map<string, Set<string>>();
  for (const n of proj.nets) {
    if (!isPowerName(n.name)) continue;
    for (const p of n.pins) {
      const k = `${p.designator}.${p.pin}`;
      if (!byPinset.has(k)) byPinset.set(k, new Set());
      byPinset.get(k)!.add(n.name.toLowerCase());
    }
  }
  for (const [k, names] of byPinset) {
    if (names.size > 1) {
      out.push({
        rule: "erc-short",
        severity: "error",
        where: k,
        msg: `Power nets shorted at ${k}: ${[...names].join(", ")}`,
      });
    }
  }

  // 4. Missing power: IC-like parts (type contains "IC"/"U" prefix) without a
  //    power pin.
  for (const el of els) {
    const looksIc =
      el.designator.startsWith("U") ||
      (el.type?.toUpperCase().includes("IC") ?? false);
    if (!looksIc) continue;
    const hasPwr = el.pins.some((p) => p.net && isPowerName(p.net));
    if (!hasPwr) {
      out.push({
        rule: "erc-missing-power",
        severity: "error",
        where: el.designator,
        msg: "IC has no power pin on a power net",
      });
    }
  }

  // 5. NC pins that need a pull (heuristic: any NC on an IC = flag).
  for (const el of els) {
    for (const p of el.pins) {
      if (p.kind === "nc") {
        out.push({
          rule: "erc-nc-needs-pull",
          severity: "warning",
          where: `${el.designator}.${p.pin}`,
          msg: "Unconnected pin — verify whether a pull is required",
        });
      }
    }
  }
  return out;
}

function allWithNets(proj: PcbProject): PcbElement[] {
  const els: PcbElement[] = [];
  const walk = (n: {
    kind: string;
    designator?: string;
    pins?: { pin: string; net?: string; kind?: string }[];
    children?: Array<{
      kind: string;
      designator?: string;
      pins?: { pin: string; net?: string; kind?: string }[];
      children?: unknown[];
    }>;
  }): void => {
    if (n.kind === "element" && n.designator) {
      els.push(n as unknown as PcbElement);
    }
    if (n.children) for (const c of n.children) walk(c as never);
  };
  walk(proj.root);
  return els;
}

// ---------------------------------------------------------------------------
// BoM (pure)
// ---------------------------------------------------------------------------

export interface BomRow {
  designator: string[];
  type: string;
  value?: string;
  mpn?: string;
  qty: number;
}

export function buildBom(proj: PcbProject): BomRow[] {
  const els = allWithNets(proj);
  const key = (e: PcbElement) =>
    [e.type ?? "", e.value ?? "", e.mpn ?? ""].join("|");
  const byKey = new Map<string, BomRow>();
  for (const e of els) {
    const k = key(e);
    const row = byKey.get(k);
    if (row) {
      row.designator.push(e.designator);
      row.qty += 1;
    } else {
      byKey.set(k, {
        designator: [e.designator],
        type: e.type ?? "",
        ...(e.value ? { value: e.value } : {}),
        ...(e.mpn ? { mpn: e.mpn } : {}),
        qty: 1,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.designator[0]!.localeCompare(b.designator[0]!, undefined, {
      numeric: true,
    }),
  );
}

/** Passive

/** Passive parts that could share one MPN (same type+value, different MPN). */
export function consolidatePassives(proj: PcbProject): string[] {
  const els = allWithNets(proj);
  const pass = els.filter((e) => {
    const d = e.designator[0]!.toUpperCase();
    return "RCL".includes(d);
  });
  const byTv = new Map<string, Set<string>>();
  for (const e of pass) {
    const k = `${e.type ?? ""}|${e.value ?? ""}`;
    if (!byTv.has(k)) byTv.set(k, new Set());
    if (e.mpn) byTv.get(k)!.add(e.mpn);
  }
  const out: string[] = [];
  for (const [k, mpns] of byTv) {
    if (mpns.size > 1) out.push(k);
  }
  return out;
}
