export type Dim = Record<string, number>;

export interface ScopedValue {
  value: number;
  dim: Dim;
}

export type ScopeInput = number | ScopedValue;
export type Scope = Record<string, ScopeInput>;

export const DIM_LENGTH: Dim = { m: 1 };
export const DIM_ANGLE: Dim = { rad: 1 };
export const DIM_NONE: Dim = {};

export const UNIT_FACTORS: Record<string, { value: number; dim: Dim }> = {
  mm: { value: 0.001, dim: DIM_LENGTH },
  cm: { value: 0.01, dim: DIM_LENGTH },
  m: { value: 1, dim: DIM_LENGTH },
  in: { value: 0.0254, dim: DIM_LENGTH },
  ft: { value: 0.3048, dim: DIM_LENGTH },
  deg: { value: Math.PI / 180, dim: DIM_ANGLE },
  rad: { value: 1, dim: DIM_ANGLE },
};

export type EvalResult =
  | { ok: true; value: number; dim: Dim }
  | { ok: false; error: string };

export function normalizeDim(d: Dim): Dim {
  const out: Dim = {};
  for (const [k, v] of Object.entries(d)) if (v !== 0) out[k] = v;
  return out;
}

export function dimsEqual(a: Dim, b: Dim): boolean {
  const na = normalizeDim(a);
  const nb = normalizeDim(b);
  const ka = Object.keys(na).sort();
  const kb = Object.keys(nb).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && na[k] === nb[k]);
}

export function dimLabel(d: Dim): string {
  const n = normalizeDim(d);
  const parts = Object.entries(n).map(([k, v]) => (v === 1 ? k : `${k}^${v}`));
  return parts.length ? parts.join("·") : "number";
}

function combine(a: Dim, b: Dim, sign: 1 | -1): Dim {
  const out: Dim = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + sign * v;
  return normalizeDim(out);
}

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "eof" };

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c && "+-*/()".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c && /[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] ?? "")) j++;
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) return `bad number at ${i}`;
      out.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (c && /[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] ?? "")) j++;
      out.push({ t: "id", v: src.slice(i, j) ?? "" });
      i = j;
      continue;
    }
    return `unexpected char '${c}' at ${i}`;
  }
  out.push({ t: "eof" });
  return out;
}

class Parser {
  private pos = 0;
  constructor(
    private toks: Token[],
    private scope: Scope,
  ) {}
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private peek(): Token {
    return this.toks[this.pos] ?? { t: "eof" };
  }
  private take(): Token {
    const t = this.toks[this.pos] ?? { t: "eof" };
    this.pos++;
    return t;
  }
  parse(): EvalResult {
    const r = this.expr();
    if (!r.ok) return r;
    if (this.peek().t !== "eof") return { ok: false, error: "trailing input" };
    return r;
  }
  private expr(): EvalResult {
    let left = this.term();
    if (!left.ok) return left;
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.take() as { t: "op"; v: string }).v;
      const right = this.term();
      if (!right.ok) return right;
      if (!dimsEqual(left.dim, right.dim))
        return {
          ok: false,
          error: `cannot ${op === "+" ? "add" : "subtract"} ${dimLabel(left.dim)} and ${dimLabel(right.dim)}`,
        };
      left = {
        ok: true,
        value: op === "+" ? left.value + right.value : left.value - right.value,
        dim: left.dim,
      };
    }
    return left;
  }
  private term(): EvalResult {
    let left = this.factor();
    if (!left.ok) return left;
    for (;;) {
      let op: string | null = null;
      if (this.isOp("*") || this.isOp("/")) {
        op = (this.take() as { t: "op"; v: string }).v;
      } else {
        const nx = this.peek();
        if (nx.t === "num" || nx.t === "id") op = "*";
      }
      if (op === null) break;
      const right = this.factor();
      if (!right.ok) return right;
      left = {
        ok: true,
        value: op === "*" ? left.value * right.value : left.value / right.value,
        dim: combine(left.dim, right.dim, op === "*" ? 1 : -1),
      };
    }
    return left;
  }
  private factor(): EvalResult {
    const t = this.peek();
    if (t.t === "op" && t.v === "-") {
      this.take();
      const inner = this.factor();
      if (!inner.ok) return inner;
      return { ok: true, value: -inner.value, dim: inner.dim };
    }
    if (t.t === "op" && t.v === "(") {
      this.take();
      const inner = this.expr();
      if (!inner.ok) return inner;
      if (!this.isOp(")")) return { ok: false, error: "missing )" };
      this.take();
      return inner;
    }
    if (t.t === "num") {
      this.take();
      return { ok: true, value: t.v, dim: DIM_NONE };
    }
    if (t.t === "id") {
      this.take();
      const unit = UNIT_FACTORS[t.v];
      if (unit) return { ok: true, value: unit.value, dim: unit.dim };
      const named = this.scope[t.v];
      if (named !== undefined) {
        if (typeof named === "number")
          return { ok: true, value: named, dim: DIM_NONE };
        return { ok: true, value: named.value, dim: named.dim };
      }
      return { ok: false, error: `unknown identifier '${t.v}'` };
    }
    return { ok: false, error: "unexpected end of expression" };
  }
}

export function evalExpr(expression: string, scope: Scope = {}): EvalResult {
  const toks = tokenize(expression);
  if (typeof toks === "string") return { ok: false, error: toks };
  return new Parser(toks, scope).parse();
}

export function formatSi(valueSi: number, units: string): string {
  const u = UNIT_FACTORS[units];
  if (u === undefined) return String(valueSi);
  const rounded = Math.round((valueSi / u.value) * 1e6) / 1e6;
  return `${rounded}*${units}`;
}

export function identifiersIn(expression: string): string[] {
  const toks = tokenize(expression);
  if (typeof toks === "string") return [];
  const out: string[] = [];
  for (const t of toks) {
    if (t.t === "id" && !(t.v in UNIT_FACTORS)) out.push(t.v);
  }
  return out;
}
