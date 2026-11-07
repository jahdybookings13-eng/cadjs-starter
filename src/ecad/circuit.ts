// ecad/circuit.ts — the component-level electrical layer.
//
// A nodal (MNA) solver runs every tick over the placed discrete parts and the
// pins firmware drives. Device models are continuous, not switches dressed up:
// - diode / LED: Shockley junction (Is, n) + series resistance + reverse
//   breakdown (Zener/avalanche) + voltage-dependent junction capacitance
// - BJT (NPN): Ebers-Moll transport model with forward/reverse beta and Early
//   voltage — it amplifies in the active region and saturates when driven
// - MOSFET: Shichman-Hodges square law (triode + saturation, channel-length
//   modulation) with gate capacitance
// - resistor / capacitor / coil / battery: Ohm, backward-Euler companions
// Temperature is a solver setting: Is scales with T, so Vf/Vbe drift.
//
// AC small-signal analysis linearises every device at the DC operating point
// and solves the complex nodal system across a frequency sweep (gain + phase).
//
// Boards keep their own ground node: GND pins of one board are internally
// joined, different boards only share a ground when wired together (an
// unwired board is assumed to sit on the bench reference). Each board's logic
// supply is per-family (AVR 5 V, ARM/ESP 3.3 V) and can be overridden.

export type CircuitDevice =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "led"
  | "battery"
  | "npn"
  | "mosfet";

export interface CircuitElement {
  /** Placed part instance id (state + readout key). */
  id: string;
  device: CircuitDevice;
  /** First terminal (A / + / 1 / B / G). */
  a: string;
  /** Second terminal (K / − / 2 / C / D). */
  b: string;
  /** Third terminal for transistors (E / S). */
  c?: string;
  /** Primary value: ohms, farads, henries, volts, Vf/Vth nominal. */
  value: number;
  /** Series resistance (diode/LED). */
  rOn?: number;
  /** Junction saturation current, A (diode/LED/BJT). */
  is?: number;
  /** Emission coefficient. */
  n?: number;
  /** Forward / reverse current gain (BJT). */
  bf?: number;
  br?: number;
  /** Early voltage, V (BJT). */
  vaf?: number;
  /** Reverse breakdown voltage, V (diode). */
  vbr?: number;
  /** Zero-bias junction capacitance, F. */
  cj?: number;
  /** MOSFET transconductance parameter, A/V². */
  k?: number;
  /** MOSFET channel-length modulation, 1/V. */
  lambda?: number;
  /** Breakdown saturation current / coefficient (diode). */
  isZ?: number;
  nz?: number;
}

export interface PinSource {
  board: string;
  pin: string;
  key: string;
  /** Board ground this source returns to. */
  gnd: string;
  volts: number;
  ohms: number;
}

export interface PinProbe {
  board: string;
  pin: string;
  key: string;
  /** Logic supply the ADC is ratiometric against. */
  vdd: number;
}

export interface BoardGround {
  board: string;
  /** Every GND pin key on that board (internally connected). */
  keys: string[];
}

export interface Netlist {
  elements: CircuitElement[];
  /** Every wire as a pair of pin keys: this is the connectivity graph. */
  wires: { a: string; b: string }[];
  /** Board output pins, as Thevenin sources to their own ground. */
  sources: PinSource[];
  /** Board ADC pins to read back after the solve. */
  probes: PinProbe[];
  /** Per-board ground pins; boards share only what is wired. */
  boards: BoardGround[];
}

export interface CircuitResult {
  /** Every node key mapped to its solved voltage. */
  volts: Map<string, number>;
  /** LED instance → forward current in amps. */
  ledAmps: Map<string, number>;
  probes: { board: string; pin: string; volts: number; vdd: number }[];
  solved: boolean;
}

export interface AcRequest {
  drive: { key: string; gnd: string; volts: number; ohms?: number };
  probe: string;
  fromHz: number;
  toHz: number;
  points: number;
}

export interface AcPoint {
  hz: number;
  gainDb: number;
  phaseDeg: number;
}

const G_TINY = 1e-12;
const DIODE_RON = 10;
const BATTERY_RON = 0.05;
const T_NOMINAL = 300.15;
const EG = 1.11;
const KB_Q = 8.617333262e-5;
const MAX_ITER = 90;
const TOL = 1e-5;

class UnionFind {
  private parent = new Map<string, string>();
  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }
  find(key: string): string {
    const p = this.parent.get(key);
    if (p === undefined) {
      this.parent.set(key, key);
      return key;
    }
    if (p === key) return key;
    const root = this.find(p);
    this.parent.set(key, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface Topology {
  uf: UnionFind;
  index: Map<string, number>;
  idx: (key: string) => number | null;
  allKeys: string[];
  junctionKey: (e: CircuitElement) => string;
}

/**
 * Stateful nodal solver: capacitor voltages and coil currents persist between
 * ticks so transients are integrated; temperature is a solver-wide setting.
 */
export class CircuitSolver {
  private capV = new Map<string, number>();
  private coilI = new Map<string, number>();
  private lastVolts = new Map<string, number>();
  private temperatureC = 27;

  reset(): void {
    this.capV.clear();
    this.coilI.clear();
    this.lastVolts.clear();
  }

  setTemperature(celsius: number): void {
    if (Number.isFinite(celsius)) this.temperatureC = celsius;
  }

  get temperature(): number {
    return this.temperatureC;
  }

  private vt(): number {
    return KB_Q * (273.15 + this.temperatureC);
  }

  /** Is scales with temperature, giving the real ~-2 mV/°C Vf drift. */
  private isAt(is: number, n: number): number {
    const t = 273.15 + this.temperatureC;
    return (
      is *
      Math.pow(t / T_NOMINAL, 3) *
      Math.exp((EG / (n * KB_Q * T_NOMINAL) - EG / (n * this.vt())) / 1)
    );
  }

  private topology(netlist: Netlist): Topology {
    const uf = new UnionFind();
    const add = (k: string) => uf.add(k);
    const wireKeys = new Set<string>();
    for (const w of netlist.wires) {
      add(w.a);
      add(w.b);
      wireKeys.add(w.a);
      wireKeys.add(w.b);
    }
    for (const e of netlist.elements) {
      add(e.a);
      add(e.b);
      if (e.c) add(e.c);
      if (this.hasJunction(e)) add(`${e.id}#j`);
    }
    for (const s of netlist.sources) {
      add(s.key);
      add(s.gnd);
    }
    for (const p of netlist.probes) add(p.key);
    for (const b of netlist.boards) for (const k of b.keys) add(k);
    for (const w of netlist.wires) uf.union(w.a, w.b);

    // A board's GND pins are one node; boards are isolated until wired.
    for (const b of netlist.boards) {
      for (const k of b.keys) uf.union(b.keys[0]!, k);
    }
    // Reference: battery negative if present, else the first board ground.
    const batteryNeg = netlist.elements
      .filter((e) => e.device === "battery")
      .map((e) => e.b);
    const ref =
      batteryNeg[0] ??
      netlist.boards[0]?.keys[0] ??
      netlist.elements[0]?.a ??
      "gnd";
    for (const k of batteryNeg) uf.union(ref, k);
    // An unwired board sits on the bench reference; a wired one keeps its net.
    for (const b of netlist.boards) {
      const wired = b.keys.some((k) => wireKeys.has(k));
      if (!wired) uf.union(ref, b.keys[0]!);
    }
    const groundRoot = uf.find(ref);

    const index = new Map<string, number>();
    const allKeys: string[] = [];
    const consider = (key: string) => {
      if (!key) return;
      allKeys.push(key);
      const root = uf.find(key);
      if (root === groundRoot) return;
      if (!index.has(root)) index.set(root, index.size);
    };
    for (const e of netlist.elements) {
      consider(e.a);
      consider(e.b);
      if (e.c) consider(e.c);
      if (this.hasJunction(e)) consider(`${e.id}#j`);
    }
    for (const w of netlist.wires) {
      consider(w.a);
      consider(w.b);
    }
    for (const s of netlist.sources) {
      consider(s.key);
      consider(s.gnd);
    }
    for (const p of netlist.probes) consider(p.key);
    for (const b of netlist.boards) for (const k of b.keys) consider(k);
    const idx = (key: string): number | null => {
      const root = uf.find(key);
      if (root === groundRoot) return null;
      return index.get(root) ?? null;
    };
    return {
      uf,
      index,
      idx,
      allKeys,
      junctionKey: (e: CircuitElement) =>
        this.hasJunction(e) ? `${e.id}#j` : e.a,
    };
  }

  private hasJunction(e: CircuitElement): boolean {
    return (
      (e.device === "diode" || e.device === "led") &&
      (e.rOn ?? DIODE_RON) > 0.01
    );
  }

  solve(netlist: Netlist, dtMs: number): CircuitResult {
    const dt = Math.max(1e-6, dtMs / 1000);
    const topo = this.topology(netlist);
    const { idx, allKeys } = topo;
    const n = topo.index.size;
    let guess = new Map<string, number>(this.lastVolts);
    const v0 = (key: string) => guess.get(key) ?? 0;
    let volts = new Map<string, number>();
    let solved = false;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const A: number[][] = Array.from({ length: n }, () =>
        new Array<number>(n).fill(0),
      );
      const b = new Array<number>(n).fill(0);
      const g = (u: string, v: string, value: number): void => {
        const iu = idx(u);
        const iv = idx(v);
        if (iu !== null) A[iu]![iu]! += value;
        if (iv !== null) A[iv]![iv]! += value;
        if (iu !== null && iv !== null) {
          A[iu]![iv]! -= value;
          A[iv]![iu]! -= value;
        }
      };
      const inject = (u: string, amps: number): void => {
        const iu = idx(u);
        if (iu !== null) b[iu]! += amps;
      };
      /** Current `amps` injected into u, drawn from v. */
      const cur = (u: string, v: string, amps: number): void => {
        inject(u, amps);
        inject(v, -amps);
      };
      const stampJ = (u: string, v: string, value: number): void => {
        const iu = idx(u);
        const iv = idx(v);
        if (iu !== null && iv !== null) A[iu]![iv]! += value;
      };
      const stampDevice = (
        terms: string[],
        currents: number[],
        J: number[][],
        nodes: string[],
      ): void => {
        for (let t = 0; t < terms.length; t++) {
          for (let u = 0; u < terms.length; u++) {
            stampJ(terms[t]!, nodes[u]!, J[t]![u]!);
          }
          let eq = currents[t]!;
          for (let u = 0; u < terms.length; u++)
            eq -= J[t]![u]! * v0(nodes[u]!);
          inject(terms[t]!, -eq);
        }
      };
      const cap = (
        u: string,
        v: string,
        farads: number,
        prev: number,
      ): void => {
        const gc = farads / dt;
        if (gc <= 0) return;
        g(u, v, gc);
        cur(u, v, gc * prev);
      };

      for (const e of netlist.elements) {
        switch (e.device) {
          case "resistor":
            g(e.a, e.b, 1 / Math.max(1e-3, e.value));
            break;
          case "capacitor": {
            const gc = Math.max(1e-15, e.value) / dt;
            g(e.a, e.b, gc);
            cur(e.a, e.b, gc * (this.capV.get(e.id) ?? 0));
            break;
          }
          case "inductor": {
            const gl = dt / Math.max(1e-12, e.value);
            g(e.a, e.b, gl);
            cur(e.a, e.b, -(this.coilI.get(e.id) ?? 0));
            break;
          }
          case "battery": {
            const gb = 1 / BATTERY_RON;
            g(e.a, e.b, gb);
            cur(e.a, e.b, e.value * gb);
            break;
          }
          case "diode":
          case "led": {
            const junction = topo.junctionKey(e);
            if (junction !== e.a) g(e.a, junction, 1 / (e.rOn ?? DIODE_RON));
            const m = this.diodeModel(e);
            const vj = v0(junction) - v0(e.b);
            const { i, gc } = diodeCurrent(vj, m, this.vt());
            stampDevice(
              [junction, e.b],
              [i, -i],
              [
                [gc, -gc],
                [-gc, gc],
              ],
              [junction, e.b],
            );
            const cj = junctionCap(e.cj ?? 0, vj);
            cap(junction, e.b, cj, this.capV.get(`${e.id}#j`) ?? 0);
            break;
          }
          case "npn": {
            if (!e.c) break;
            const m = this.bjtModel(e);
            const nodes = [e.a, e.b, e.c];
            const { ib, ic, ie, dibDvbe, dibDvbc, dicDvbe, dicDvbc, dicDvce } =
              bjtCurrents(
                v0(e.a) - v0(e.c),
                v0(e.a) - v0(e.b),
                v0(e.b) - v0(e.c),
                m,
                this.vt(),
              );
            const J = [
              new Array<number>(3).fill(0),
              new Array<number>(3).fill(0),
              new Array<number>(3).fill(0),
            ];
            const row = (
              r: number,
              dvbe: number,
              dvbc: number,
              dvce: number,
            ) => {
              J[r]![0]! += dvbe + dvbc;
              J[r]![1]! += -dvbc + dvce;
              J[r]![2]! += -dvbe - dvce;
            };
            row(0, dibDvbe, dibDvbc, 0);
            row(1, dicDvbe, dicDvbc, dicDvce);
            row(2, -dibDvbe - dicDvbe, -dibDvbc - dicDvbc, -dicDvce);
            stampDevice(nodes, [ib, ic, ie], J, nodes);
            const cj = e.cj ?? 4e-12;
            cap(e.a, e.c, 2 * cj, this.capV.get(`${e.id}#be`) ?? 0);
            cap(e.a, e.b, cj, this.capV.get(`${e.id}#bc`) ?? 0);
            break;
          }
          case "mosfet": {
            if (!e.c) break;
            const m = this.mosModel(e);
            const nodes = [e.a, e.b, e.c];
            const { id, gm, gds } = mosCurrents(
              v0(e.a) - v0(e.c),
              v0(e.b) - v0(e.c),
              m,
            );
            const J = [
              [0, 0, 0],
              [gm, gds, -(gm + gds)],
              [-gm, -gds, gm + gds],
            ];
            stampDevice(nodes, [0, id, -id], J, nodes);
            cap(e.a, e.c, e.cj ?? 50e-12, this.capV.get(`${e.id}#gs`) ?? 0);
            break;
          }
        }
      }

      for (const s of netlist.sources) {
        const gs = 1 / Math.max(1e-3, s.ohms);
        g(s.key, s.gnd, gs);
        cur(s.key, s.gnd, s.volts * gs);
      }
      for (let i = 0; i < n; i++) A[i]![i]! += G_TINY;

      const next = solveLinear(A, b);
      if (!next)
        return { volts, ledAmps: new Map(), probes: [], solved: false };
      const solvedVolts = new Map<string, number>();
      for (const key of allKeys) {
        const i = idx(key);
        solvedVolts.set(key, i === null ? 0 : (next[i] ?? 0));
      }
      let delta = 0;
      for (const [key, value] of solvedVolts)
        delta = Math.max(delta, Math.abs(value - v0(key)));
      if (delta > 2) {
        // Junction limiting: blend toward the solution so an exponential
        // device cannot overshoot by volts in one Newton step.
        const damped = new Map<string, number>();
        for (const [key, value] of solvedVolts)
          damped.set(key, v0(key) + 0.35 * (value - v0(key)));
        guess = damped;
        volts = solvedVolts;
        solved = true;
        continue;
      }
      volts = solvedVolts;
      guess = solvedVolts;
      solved = true;
      if (delta < TOL) break;
    }

    for (const e of netlist.elements) {
      if (e.device === "capacitor")
        this.capV.set(e.id, (volts.get(e.a) ?? 0) - (volts.get(e.b) ?? 0));
      if (e.device === "inductor") {
        const gl = dt / Math.max(1e-12, e.value);
        this.coilI.set(
          e.id,
          (this.coilI.get(e.id) ?? 0) +
            gl * ((volts.get(e.a) ?? 0) - (volts.get(e.b) ?? 0)),
        );
      }
      if (e.device === "diode" || e.device === "led") {
        const junction = topo.junctionKey(e);
        this.capV.set(
          `${e.id}#j`,
          (volts.get(junction) ?? 0) - (volts.get(e.b) ?? 0),
        );
      }
      if (e.device === "npn" && e.c) {
        this.capV.set(
          `${e.id}#be`,
          (volts.get(e.a) ?? 0) - (volts.get(e.c) ?? 0),
        );
        this.capV.set(
          `${e.id}#bc`,
          (volts.get(e.a) ?? 0) - (volts.get(e.b) ?? 0),
        );
      }
      if (e.device === "mosfet" && e.c)
        this.capV.set(
          `${e.id}#gs`,
          (volts.get(e.a) ?? 0) - (volts.get(e.c) ?? 0),
        );
    }

    const ledAmps = new Map<string, number>();
    for (const e of netlist.elements) {
      if (e.device !== "led") continue;
      const junction = topo.junctionKey(e);
      const m = this.diodeModel(e);
      const { i } = diodeCurrent(
        (volts.get(junction) ?? 0) - (volts.get(e.b) ?? 0),
        m,
        this.vt(),
      );
      ledAmps.set(e.id, i > 1e-6 ? i : 0);
    }

    this.lastVolts = new Map(volts);
    return {
      volts,
      ledAmps,
      probes: netlist.probes.map((p) => ({
        board: p.board,
        pin: p.pin,
        volts: volts.get(p.key) ?? 0,
        vdd: p.vdd,
      })),
      solved,
    };
  }

  /**
   * AC small-signal sweep: linearise every device at the DC operating point,
   * solve the complex nodal system at each frequency, and report gain/phase.
   */
  ac(netlist: Netlist, req: AcRequest): AcPoint[] {
    // A long timestep makes capacitors open and coils short at DC.
    this.solve(netlist, 1e6);
    const op = this.lastVolts;
    const topo = this.topology(netlist);
    const { idx } = topo;
    const n = topo.index.size;
    const opAt = (key: string) => op.get(key) ?? 0;
    if (n === 0) return [];

    const points: AcPoint[] = [];
    const { fromHz, toHz } = req;
    const count = Math.max(2, Math.floor(req.points));
    const driveOhms = req.drive.ohms ?? 50;
    const driveG = 1 / Math.max(1e-3, driveOhms);
    for (let k = 0; k < count; k++) {
      const hz =
        count === 1
          ? fromHz
          : fromHz * Math.pow(toHz / fromHz, k / (count - 1));
      const w = 2 * Math.PI * hz;
      const A: Complex[][] = Array.from({ length: n }, () =>
        Array.from({ length: n }, (): Complex => [0, 0]),
      );
      const b: Complex[] = Array.from({ length: n }, (): Complex => [0, 0]);
      const add = (iu: number | null, iv: number | null, z: Complex) => {
        if (iu !== null) A[iu]![iu] = cadd(A[iu]![iu]!, z);
        if (iv !== null) A[iv]![iv] = cadd(A[iv]![iv]!, z);
        if (iu !== null && iv !== null) {
          A[iu]![iv] = csub(A[iu]![iv]!, z);
          A[iv]![iu] = csub(A[iv]![iu]!, z);
        }
      };
      const g = (u: string, v: string, value: number) =>
        add(idx(u), idx(v), [value, 0]);

      for (const e of netlist.elements) {
        switch (e.device) {
          case "resistor":
            g(e.a, e.b, 1 / Math.max(1e-3, e.value));
            break;
          case "capacitor":
            add(idx(e.a), idx(e.b), [0, w * Math.max(1e-15, e.value)]);
            break;
          case "inductor": {
            const zr = 1e-3;
            const zi = w * Math.max(1e-12, e.value);
            const den = zr * zr + zi * zi;
            add(idx(e.a), idx(e.b), [zr / den, -zi / den]);
            break;
          }
          case "battery":
            g(e.a, e.b, 1 / BATTERY_RON);
            break;
          case "diode":
          case "led": {
            const junction = topo.junctionKey(e);
            if (junction !== e.a) g(e.a, junction, 1 / (e.rOn ?? DIODE_RON));
            const m = this.diodeModel(e);
            const { gc } = diodeCurrent(
              opAt(junction) - opAt(e.b),
              m,
              this.vt(),
            );
            g(junction, e.b, gc);
            add(idx(junction), idx(e.b), [
              0,
              w * junctionCap(e.cj ?? 0, opAt(junction) - opAt(e.b)),
            ]);
            break;
          }
          case "npn": {
            if (!e.c) break;
            const m = this.bjtModel(e);
            const nodes = [e.a, e.b, e.c];
            const cur = bjtCurrents(
              opAt(e.a) - opAt(e.c),
              opAt(e.a) - opAt(e.b),
              opAt(e.b) - opAt(e.c),
              m,
              this.vt(),
            );
            const J = [
              new Array<number>(3).fill(0),
              new Array<number>(3).fill(0),
              new Array<number>(3).fill(0),
            ];
            const row = (
              r: number,
              dvbe: number,
              dvbc: number,
              dvce: number,
            ) => {
              J[r]![0]! += dvbe + dvbc;
              J[r]![1]! += -dvbc + dvce;
              J[r]![2]! += -dvbe - dvce;
            };
            row(0, cur.dibDvbe, cur.dibDvbc, 0);
            row(1, cur.dicDvbe, cur.dicDvbc, cur.dicDvce);
            row(
              2,
              -cur.dibDvbe - cur.dicDvbe,
              -cur.dibDvbc - cur.dicDvbc,
              -cur.dicDvce,
            );
            for (let t = 0; t < 3; t++) {
              const it = idx(nodes[t]!);
              if (it === null) continue;
              for (let u = 0; u < 3; u++) {
                const iu = idx(nodes[u]!);
                if (iu !== null && J[t]![u])
                  A[it]![iu] = cadd(A[it]![iu]!, [J[t]![u]!, 0]);
              }
            }
            const cj = e.cj ?? 4e-12;
            add(idx(e.a), idx(e.c), [0, w * 2 * cj]);
            add(idx(e.a), idx(e.b), [0, w * cj]);
            break;
          }
          case "mosfet": {
            if (!e.c) break;
            const m = this.mosModel(e);
            const { gm, gds } = mosCurrents(
              opAt(e.a) - opAt(e.c),
              opAt(e.b) - opAt(e.c),
              m,
            );
            g(e.b, e.c, gds);
            const it = idx(e.b);
            const ig = idx(e.a);
            const is = idx(e.c);
            if (it !== null && ig !== null)
              A[it]![ig] = cadd(A[it]![ig]!, [gm, 0]);
            if (it !== null && is !== null)
              A[it]![is] = csub(A[it]![is]!, [gm + gds, 0]);
            add(idx(e.a), idx(e.c), [0, w * (e.cj ?? 50e-12)]);
            break;
          }
        }
      }

      for (const s of netlist.sources) {
        const gs = 1 / Math.max(1e-3, s.ohms);
        g(s.key, s.gnd, gs);
      }
      // AC drive: 1 V behind its source impedance.
      g(req.drive.key, req.drive.gnd, driveG);
      const di = idx(req.drive.key);
      if (di !== null) b[di] = cadd(b[di]!, [driveG * req.drive.volts, 0]);
      for (let i = 0; i < n; i++) A[i]![i] = cadd(A[i]![i]!, [G_TINY, 0]);

      const x = solveComplex(A, b);
      if (!x) continue;
      const pi = idx(req.probe);
      const v: Complex = pi === null ? [0, 0] : x[pi]!;
      points.push({
        hz,
        gainDb: 20 * Math.log10(Math.max(1e-12, Math.hypot(v[0], v[1]))),
        phaseDeg: (Math.atan2(v[1], v[0]) * 180) / Math.PI,
      });
    }
    return points;
  }

  private diodeModel(e: CircuitElement) {
    const n = e.n ?? 1.75;
    return {
      is: this.isAt(e.is ?? 1e-11, n),
      n,
      vbr: e.vbr ?? 0,
      isZ: e.isZ ?? 1e-9,
      nz: e.nz ?? 0.2,
    };
  }

  private bjtModel(e: CircuitElement) {
    return {
      is: e.is ?? 6.7e-15,
      nf: e.n ?? 1,
      nr: 1,
      bf: e.bf ?? 200,
      br: e.br ?? 4,
      vaf: e.vaf ?? 75,
      isT: this.isAt(e.is ?? 6.7e-15, e.n ?? 1),
    };
  }

  private mosModel(e: CircuitElement) {
    return {
      vth: e.value,
      k: e.k ?? 0.15,
      lambda: e.lambda ?? 0.02,
    };
  }
}

interface DiodeModel {
  is: number;
  n: number;
  vbr: number;
  isZ: number;
  nz: number;
}

function diodeCurrent(
  v: number,
  m: DiodeModel,
  vt: number,
): { i: number; gc: number } {
  const nvt = Math.max(1e-6, m.n * vt);
  const ex = Math.exp(clamp(v / nvt, -40, 40));
  let i = m.is * (ex - 1);
  let gc = (m.is * ex) / nvt;
  if (m.vbr > 0) {
    const vz = -v - m.vbr;
    if (vz > -1) {
      const nzvt = Math.max(1e-6, m.nz * vt);
      const ez = Math.exp(clamp(vz / nzvt, -40, 40));
      i -= m.isZ * (ez - 1);
      gc += (m.isZ * ez) / nzvt;
    }
  }
  return { i, gc };
}

function junctionCap(cj: number, v: number): number {
  if (cj <= 0) return 0;
  const bias = v < 0 ? -v : 0;
  const c = cj / Math.sqrt(1 + bias / 0.7);
  return Math.min(c * 4, cj * 4);
}

function bjtCurrents(
  vbe: number,
  vbc: number,
  vce: number,
  m: {
    isT: number;
    nf: number;
    nr: number;
    bf: number;
    br: number;
    vaf: number;
  },
  vt: number,
): {
  ib: number;
  ic: number;
  ie: number;
  dibDvbe: number;
  dibDvbc: number;
  dicDvbe: number;
  dicDvbc: number;
  dicDvce: number;
} {
  const e1 = Math.exp(clamp(vbe / (m.nf * vt), -40, 40));
  const e2 = Math.exp(clamp(vbc / (m.nr * vt), -40, 40));
  const iF = m.isT * (e1 - 1);
  const iR = m.isT * (e2 - 1);
  const alphaF = m.bf / (m.bf + 1);
  const early = Math.max(0.05, 1 + vce / Math.max(1, m.vaf));
  const ic = (alphaF * iF - iR) * early;
  const ib = iF / m.bf + iR / m.br;
  const diF = (m.isT * e1) / Math.max(1e-6, m.nf * vt);
  const diR = (m.isT * e2) / Math.max(1e-6, m.nr * vt);
  return {
    ib,
    ic,
    ie: -(ib + ic),
    dibDvbe: diF / m.bf,
    dibDvbc: diR / m.br,
    dicDvbe: alphaF * diF * early,
    dicDvbc: -diR * early,
    dicDvce: (alphaF * iF - iR) / Math.max(1, m.vaf),
  };
}

function mosCurrents(
  vgs: number,
  vdsRaw: number,
  m: { vth: number; k: number; lambda: number },
): { id: number; gm: number; gds: number } {
  const vds = Math.max(0, vdsRaw);
  const vov = vgs - m.vth;
  if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  const lam = Math.max(0, m.lambda);
  if (vds < vov) {
    const id = m.k * (vov * vds - 0.5 * vds * vds) * (1 + lam * vds);
    const gm = m.k * vds * (1 + lam * vds);
    const gds =
      m.k * (vov - vds) * (1 + lam * vds) +
      m.k * (vov * vds - 0.5 * vds * vds) * lam;
    return { id, gm, gds };
  }
  const id = 0.5 * m.k * vov * vov * (1 + lam * vds);
  return {
    id,
    gm: m.k * vov * (1 + lam * vds),
    gds: 0.5 * m.k * vov * vov * lam,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

type Complex = [number, number];
const cadd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const csub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1] || 1e-30;
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

function solveComplex(A: Complex[][], b: Complex[]): Complex[] | null {
  const n = b.length;
  if (n === 0) return [];
  const m = A.map((row, i) => [...row, b[i] ?? [0, 0]] as Complex[]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.hypot(...m[r]![col]!) > Math.hypot(...m[piv]![col]!)) piv = r;
    }
    if (Math.hypot(...m[piv]![col]!) < 1e-14) return null;
    [m[col], m[piv]] = [m[piv]!, m[col]!];
    const d = m[col]![col]!;
    for (let c = col; c <= n; c++) m[col]![c] = cdiv(m[col]![c]!, d);
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (f[0] === 0 && f[1] === 0) continue;
      for (let c = col; c <= n; c++)
        m[r]![c] = csub(m[r]![c]!, cmul(f, m[col]![c]!));
    }
  }
  return m.map((row) => row[n] ?? [0, 0]);
}

/** Dense Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const m = A.map((row, i) => {
    const r = row.slice();
    r.push(b[i] ?? 0);
    return r;
  });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    }
    if (Math.abs(m[piv]![col]!) < 1e-14) return null;
    const tmp = m[col]!;
    m[col] = m[piv]!;
    m[piv] = tmp;
    const d = m[col]![col]!;
    for (let c = col; c <= n; c++) m[col]![c]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (!f) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row) => row[n] ?? 0);
}
