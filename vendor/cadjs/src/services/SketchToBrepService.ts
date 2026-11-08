/**
 * Sketch to BRep Conversion Service
 *
 * Converts 2D sketch primitives (points, lines, circles, arcs) into
 * 3D BRep geometry using the OCC Web Worker for heavy operations.
 * The two main public methods (convertSketchToBrep, convertSketchToProfiles)
 * are thin async proxies that delegate to the worker.
 *
 * @module services/SketchToBrepService
 */

import { Brep } from "../geometry";
import { debugLog } from "../config";
import { OccWorkerClient } from "./OccWorkerClient";
import type {
  WorkerSketchBrepResult,
  WorkerSketchProfilesResult,
  WorkerSketchWireResult,
} from "../workers/occ-worker-types";
import {
  isSketchLine,
  isSketchArc,
  type Sketch,
  type SketchPrimitive,
  type SketchConversionResult,
} from "../types/sketch-types";
import { POINT_COINCIDENCE_TOL_MM } from "../sketch-tolerances";

// Optional flags shared by sketch primitives, `construction` is set by user to
// mark a line/circle/arc as helper geometry; `origin` is set on auto-generated
// origin axes/points. Both are excluded from BRep conversion. Using a typed
// narrow here avoids `as any` casts at every call site.
function isExcludedFromBrep(p: SketchPrimitive): boolean {
  if (p.type === "hatch") return true;
  const flags = p as { construction?: boolean; origin?: boolean };
  return Boolean(flags.construction) || Boolean(flags.origin);
}

/**
 * Singleton service that converts sketches to BRep.
 * Heavy operations are delegated to the OCC Web Worker.
 */
export class SketchToBrepService {
  private static instance: SketchToBrepService;

  private constructor() {}

  static getInstance(): SketchToBrepService {
    if (!SketchToBrepService.instance) {
      SketchToBrepService.instance = new SketchToBrepService();
    }
    return SketchToBrepService.instance;
  }

  /**
   * Convert a sketch to BRep via the Web Worker.
   *
   * Sends primitives and plane to the worker, which performs all OCC
   * operations (edge building, face creation, union, plane transform)
   * and returns a serialized BRep JSON.
   */
  async convertSketchToBrep(sketch: Sketch): Promise<Brep> {
    return (await this.convertSketchToBrepWithShape(sketch)).brep;
  }

  /**
   * Convert a sketch and keep the exact OCC shape as well as the JSON BRep.
   * The exact shape is what preserves inner wires (holes) and disconnected
   * regions through an extrude.
   */
  async convertSketchToBrepWithShape(
    sketch: Sketch,
  ): Promise<{ brep: Brep; occBrep?: string | undefined }> {
    if (!sketch.primitives.length) {
      return { brep: new Brep([], [], []) };
    }

    const client = OccWorkerClient.getInstance();
    const result = await client.send<WorkerSketchBrepResult>({
      type: "sketchToBrep",
      payload: {
        primitives: sketch.primitives,
        plane: sketch.plane,
      },
    });

    const brep = Brep.fromJSON(result.brepJson);
    debugLog(
      `[SketchToBrepService] Built BRep with ${brep.faces.length} faces, ${brep.vertices.length} vertices`,
    );
    return {
      brep,
      ...(result.occBrep !== undefined ? { occBrep: result.occBrep } : {}),
    };
  }

  /**
   * Convert a sketch to multiple profiles (Fusion 360-style) via the Web Worker.
   *
   * Sends primitives, plane, and sketch ID to the worker, which performs
   * intersection detection, region finding, and profile extraction.
   * Returns reconstructed profile objects with Brep instances.
   */
  async convertSketchToProfiles(
    sketch: Sketch,
  ): Promise<SketchConversionResult> {
    if (!sketch.primitives || sketch.primitives.length === 0) {
      console.warn("[SketchToBrepService] Empty sketch");
      return { profiles: [], success: false };
    }

    try {
      const client = OccWorkerClient.getInstance();
      const result = await client.send<WorkerSketchProfilesResult>({
        type: "sketchToProfiles",
        payload: {
          primitives: sketch.primitives,
          plane: sketch.plane,
          sketchId: sketch.id,
        },
      });

      // Reconstruct Brep instances from JSON
      const profiles = result.profiles.map((p) => ({
        id: p.id,
        brep: Brep.fromJSON(p.brepJson),
        area: p.area,
        isOuter: p.isOuter,
        center: p.center,
        occBrep: p.occBrep,
      }));

      debugLog(`[SketchToBrepService] Created ${profiles.length} profiles`);
      return { profiles, success: result.success };
    } catch (error) {
      console.error("[SketchToBrepService] Profile conversion failed:", error);
      return { profiles: [], success: false };
    }
  }

  /**
   * Check if a sketch forms at least one closed loop.
   * An open sketch (only open chains of lines/arcs, no circles) is a path candidate for sweep.
   */
  isSketchClosed(sketch: Sketch): boolean {
    const nonConstructionPrimitives = sketch.primitives.filter(
      (p) => !isExcludedFromBrep(p),
    );

    // Circles and ellipses are always self-closing
    if (
      nonConstructionPrimitives.some(
        (p) => p.type === "circle" || p.type === "ellipse",
      )
    ) {
      return true;
    }

    const pointMap = this.buildPointMap(sketch.primitives);
    const lines = nonConstructionPrimitives.filter(isSketchLine);
    const arcs = nonConstructionPrimitives.filter(isSketchArc);
    const splines = nonConstructionPrimitives.filter(
      (p) => p.type === "spline",
    );
    const beziers = nonConstructionPrimitives.filter(
      (p) => p.type === "bezier",
    );
    const conics = nonConstructionPrimitives.filter((p) => p.type === "conic");

    if (
      lines.length === 0 &&
      arcs.length === 0 &&
      splines.length === 0 &&
      beziers.length === 0 &&
      conics.length === 0
    ) {
      return false;
    }

    // Build adjacency using coordinate keys (not point IDs).
    // After trimming, two different point IDs may exist at the same geometric
    // location (e.g. a trimmed line end and a trimmed arc start). Using
    // coordinate-based keys treats them as the same vertex.
    const coordEdgeCount = new Map<string, number>();
    const addEdge = (pId: string) => {
      const pt = pointMap.get(pId);
      if (!pt) return;
      const key = this.pointToKey([pt.x, pt.y, 0]);
      coordEdgeCount.set(key, (coordEdgeCount.get(key) || 0) + 1);
    };
    for (const line of lines) {
      addEdge(line.p1Id);
      addEdge(line.p2Id);
    }
    for (const arc of arcs) {
      addEdge(arc.startId);
      addEdge(arc.endId);
    }
    for (const spline of splines) {
      if (spline.pointIds.length < 2) return false;
      addEdge(spline.startId ?? spline.pointIds[0]!);
      addEdge(spline.endId ?? spline.pointIds[spline.pointIds.length - 1]!);
    }
    for (const bezier of beziers) {
      if (bezier.pointIds.length !== 4) return false;
      addEdge(bezier.pointIds[0]!);
      addEdge(bezier.pointIds[3]!);
    }
    for (const conic of conics) {
      addEdge(conic.startId);
      addEdge(conic.endId);
    }

    // A degree-1 vertex is a dangling endpoint → open path.
    // Degree ≥ 2 (including odd like 3 at T-junctions) can still form closed loops.
    for (const [, count] of coordEdgeCount) {
      if (count === 1) return false;
    }

    // All vertices have even degree → at least one closed loop exists
    return true;
  }

  /**
   * Convert an open sketch (chain of lines/arcs) to an ordered point list.
   * Used for sweep path creation. OCC operations run in the worker.
   */
  async convertSketchToWire(
    sketch: Sketch,
  ): Promise<{ points: { x: number; y: number; z: number }[] } | null> {
    try {
      const client = OccWorkerClient.getInstance();
      const result = await client.send<WorkerSketchWireResult | null>({
        type: "sketchToWire",
        payload: {
          primitives: sketch.primitives,
          plane: sketch.plane,
        },
      });

      if (!result || result.points.length < 2) {
        console.warn(
          "[SketchToBrepService] Wire conversion returned no points",
        );
        return null;
      }

      debugLog(
        `[SketchToBrepService] Built wire path with ${result.points.length} points`,
      );
      return { points: result.points };
    } catch (error) {
      console.error("[SketchToBrepService] Wire conversion failed:", error);
      return null;
    }
  }

  /**
   * Build a map of point IDs to coordinates.
   */
  private buildPointMap(
    primitives: SketchPrimitive[],
  ): Map<string, { x: number; y: number }> {
    const pointMap = new Map<string, { x: number; y: number }>();
    for (const prim of primitives) {
      if (prim.type === "point") {
        pointMap.set(prim.id, { x: prim.x, y: prim.y });
      }
    }
    return pointMap;
  }

  /**
   * Normalize a point to a string key for graph operations.
   */
  private pointToKey(p: [number, number, number]): string {
    const precision = POINT_COINCIDENCE_TOL_MM;
    const x = Math.round(p[0] / precision) * precision;
    const y = Math.round(p[1] / precision) * precision;
    const z = Math.round(p[2] / precision) * precision;
    return `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
  }
}
