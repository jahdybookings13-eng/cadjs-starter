import { describe, expect, it, vi } from "vitest";

// oneToOne.ts is dependency-free (the 1:1 LAW, made checkable). EcadLayer and
// scene.ts, which the guard walks, import THREE at module scope (a
// CanvasTexture, a placeholder Group, and a tree of geometry/materials built
// in buildBoard). Node has no DOM/webgl, so we mock THREE with a permissive
// Proxy: every construction returns a stand-in object whose members answer
// permissively. The 1:1 guard itself (assertOneToOneScale / isPhysicalSizeM /
// boardMassKg / mmToM) never touches THREE — it only reads the layer's real
// meter sizes.
vi.mock("three", () => {
  // A permissive proxy: every member is itself a permissive, callable value.
  // Kept `any`-typed on purpose — it is a test shim, not real code.
  const permissive: (extra?: Record<string, unknown>) => any = (
    extra: Record<string, unknown> = {},
  ) =>
    new Proxy(function () {}, {
      get(_t, k) {
        const key = k as string | symbol;
        if (key === Symbol.toPrimitive) return () => 0;
        if (key === "then") return undefined;
        if (typeof key === "string" && key in extra) return extra[key];
        return permissive();
      },
      set() {
        return true;
      },
      apply(): any {
        return permissive();
      },
      construct(): any {
        return permissive();
      },
    } as ProxyHandler<() => void>);
  const mk = (base: Record<string, unknown> = {}): any =>
    class {
      constructor(..._args: unknown[]) {
        return permissive(base);
      }
    };
  return {
    CanvasTexture: mk({
      image: permissive({ width: 320, height: 240, toDataURL: () => "" }),
    }),
    Group: mk(),
    Mesh: mk(),
    Line: mk(),
    Points: mk(),
    MeshStandardMaterial: mk(),
    MeshPhysicalMaterial: mk(),
    MeshBasicMaterial: mk(),
    LineBasicMaterial: mk(),
    PointsMaterial: mk(),
    BoxGeometry: mk({ setFromPoints: () => permissive() }),
    PlaneGeometry: mk({ setFromPoints: () => permissive() }),
    CircleGeometry: mk({ setFromPoints: () => permissive() }),
    CylinderGeometry: mk({ setFromPoints: () => permissive() }),
    ConeGeometry: mk({ setFromPoints: () => permissive() }),
    ShapeGeometry: mk({ setFromPoints: () => permissive() }),
    BufferGeometry: mk({ setFromPoints: () => permissive() }),
    Shape: mk({ holes: [] }),
    Float32BufferAttribute: mk({ count: 0 }),
    Vector2: mk({ x: 0, y: 0 }),
    Vector3: mk({ x: 0, y: 0, z: 0 }),
    Color: mk(),
    Euler: mk({ x: 0, y: 0, z: 0 }),
    Quaternion: mk({ x: 0, y: 0, z: 0, w: 1 }),
    Matrix4: mk(),
    Raycaster: mk({
      ray: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } },
    }),
    AdditiveBlending: 2,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1,
    SRGBColorSpace: "srgb",
    PCFSoftShadowMap: 1,
  };
});

import {
  assertOneToOneScale,
  boardMassKg,
  isPhysicalSizeM,
  mmToM,
  mToMm,
  OneToOneScaleError,
  PHYSICAL_MIN_M,
  PHYSICAL_MAX_M,
} from "../ecad/oneToOne";
import { EcadSim } from "../ecad/sim";
import { allParts, type BoardPart } from "../ecad/catalog";
import { EcadLayer, instanceMeters } from "../ecad/scene";

// Derive a structurally-complete board part from the real catalog (all
// required BoardPart fields present) and override its size. Keeps the guard
// test honest: a valid part, not a stub with missing chips/headers/tiers.
const templateBoard: BoardPart =
  (allParts().find((p) => p.category === "board") as BoardPart) ??
  ({} as BoardPart);
const boardPart = (id: string, w: number, h: number, t: number): BoardPart => ({
  ...templateBoard,
  id,
  name: `${id} board`,
  size: { w, h, t },
});

describe("1:1 LAW — oneToOne.ts (the nag, made a test)", () => {
  it("mmToM / mToMm are inverse unit conversions", () => {
    expect(mmToM(1000)).toBeCloseTo(1, 6);
    expect(mmToM(100)).toBeCloseTo(0.1, 6);
    expect(mToMm(0.1)).toBeCloseTo(100, 6);
    expect(mmToM(mToMm(3.14159))).toBeCloseTo(3.14159, 9);
  });

  it("isPhysicalSizeM admits real sizes, rejects the giant / sub-physical class", () => {
    expect(isPhysicalSizeM(0.1)).toBe(true); // 100mm board
    expect(isPhysicalSizeM(0.001)).toBe(true); // 1mm SMD pad
    expect(isPhysicalSizeM(2)).toBe(true); // 2m part
    expect(isPhysicalSizeM(0.00001)).toBe(false); // 10um — below physical floor
    expect(isPhysicalSizeM(500)).toBe(false); // 500m — a scaling bug
    expect(isPhysicalSizeM(-0.1)).toBe(true); // magnitude (sign = orientation)
  });

  it("the physical bounds are real-world", () => {
    expect(PHYSICAL_MIN_M * 1000).toBeCloseTo(0.2, 3); // 0.2mm floor
    expect(PHYSICAL_MAX_M).toBeCloseTo(5, 3); // 5m ceiling
  });

  it("boardMassKg gives REAL weight (volume * FR4 density)", () => {
    const g = boardMassKg(100, 50, 1.6); // 100 x 50 x 1.6mm
    expect(g).toBeCloseTo(0.0148, 4); // ≈ 14.8g
    expect(g).toBeGreaterThan(0);
  });

  it("a physical board passes the guard (1:1 holds)", () => {
    const sim = new EcadSim();
    const boardId = sim.insertInlinePart(boardPart("b1", 100, 50, 1.6)).id;
    const layer = new EcadLayer(sim);
    layer.add(boardId);
    expect(() => assertOneToOneScale(layer)).not.toThrow();
  });

  it("a scaled-up board (the forbidden giant mode) is caught", () => {
    const sim = new EcadSim();
    const boardId = sim.insertInlinePart(boardPart("big", 400000, 50, 1.6)).id; // 400m
    const layer = new EcadLayer(sim);
    layer.add(boardId);
    expect(() => assertOneToOneScale(layer)).toThrow(OneToOneScaleError);
    try {
      assertOneToOneScale(layer);
    } catch (e) {
      const off = (e as OneToOneScaleError).offenders[0];
      expect(off).toBeDefined();
      if (!off) return;
      expect(off.id).toBe(boardId);
      expect(off.meters[0]).toBeCloseTo(400, 0); // 400000mm = 400m
    }
  });

  it("instanceMeters converts a part's mm size to real meters (1:1)", () => {
    const m = instanceMeters(boardPart("b2", 120, 80, 1.6));
    expect(m.w).toBeCloseTo(0.12, 6);
    expect(m.h).toBeCloseTo(0.08, 6);
    expect(m.t).toBeCloseTo(0.0016, 8);
  });

  it("EcadLayer.meters() reports the real meter size of a placed board", () => {
    const sim = new EcadSim();
    const boardId = sim.insertInlinePart(boardPart("b3", 150, 60, 1.6)).id;
    const layer = new EcadLayer(sim);
    layer.add(boardId);
    const m = layer.meters(boardId);
    expect(m).not.toBeNull();
    expect(m?.w).toBeCloseTo(0.15, 5);
    expect(m?.h).toBeCloseTo(0.06, 5);
    expect(m?.t).toBeCloseTo(0.0016, 7);
  });
});
