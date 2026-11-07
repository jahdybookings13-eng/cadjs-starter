import {
  make_gcs_wrapper,
  GcsWrapper,
  Algorithm,
  SolveStatus,
  type SketchPrimitive as GcsSketchPrimitive,
  type SketchPoint as GcsSketchPoint,
  type SketchLine as GcsSketchLine,
  type SketchCircle as GcsSketchCircle,
  type SketchArc as GcsSketchArc,
} from "@salusoft89/planegcs";
import {
  Sketch,
  SketchPrimitive,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchConstraint,
  SolveResult,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
  findSketchLine,
} from "../types/sketch-types";
import { resolvePlanegcsWasmUrl } from "../config";

export class SketchSolverService {
  private static instance: SketchSolverService;
  private gcsWrapper: GcsWrapper | null = null;
  private initPromise: Promise<GcsWrapper> | null = null;

  private constructor() {}

  static getInstance(): SketchSolverService {
    if (!SketchSolverService.instance) {
      SketchSolverService.instance = new SketchSolverService();
    }
    return SketchSolverService.instance;
  }

  resetInit(): void {
    this.gcsWrapper = null;
    this.initPromise = null;
  }

  async getGCS(): Promise<GcsWrapper> {
    if (this.gcsWrapper) {
      return this.gcsWrapper;
    }

    if (!this.initPromise) {
      // Pass the resolved URL, planegcs's internal default only resolves under Vite.
      this.initPromise = make_gcs_wrapper(resolvePlanegcsWasmUrl());
    }

    try {
      this.gcsWrapper = await this.initPromise;
      return this.gcsWrapper;
    } catch (error) {
      console.error("Error initializing planegcs:", error);
      throw error;
    }
  }

  async solve(sketch: Sketch): Promise<SolveResult> {
    const gcs = await this.getGCS();

    gcs.clear_data();

    const gcsPrimitives = this.primitivesToGcsFormat(sketch.primitives);
    gcs.push_primitives_and_params(gcsPrimitives);

    const gcsConstraints = this.constraintsToGcsFormat(
      sketch.constraints,
      sketch.primitives,
    );
    for (const constraint of gcsConstraints) {
      gcs.push_primitive(constraint);
    }

    const status = gcs.solve(Algorithm.DogLeg);
    const success =
      status === SolveStatus.Success || status === SolveStatus.Converged;

    if (success) {
      gcs.apply_solution();
    }

    const dof = gcs.gcs.dof();

    const updatedSketch = this.applyGcsSolution(sketch, gcs);

    const redundantIds: string[] = gcs.get_gcs_redundant_constraints?.()
      ? (gcs.get_gcs_redundant_constraints() as string[])
      : [];
    const conflictingIds: string[] = gcs.get_gcs_conflicting_constraints?.()
      ? (gcs.get_gcs_conflicting_constraints() as string[])
      : [];

    // Only true contradictions count as overconstrained, redundant-but-satisfied is fine.
    let sketchStatus:
      | "underconstrained"
      | "fully_constrained"
      | "overconstrained";
    if (conflictingIds.length > 0) {
      sketchStatus = "overconstrained";
    } else if (dof === 0) {
      sketchStatus = "fully_constrained";
    } else {
      sketchStatus = "underconstrained";
    }

    return {
      success,
      sketch: {
        ...updatedSketch,
        dof,
        status: sketchStatus,
      },
      dof,
      status: sketchStatus,
      redundantConstraintIds:
        redundantIds.length > 0 ? redundantIds : undefined,
      conflictingConstraintIds:
        conflictingIds.length > 0 ? conflictingIds : undefined,
    };
  }

  async getDOF(sketch: Sketch): Promise<number> {
    const gcs = await this.getGCS();

    gcs.clear_data();

    const gcsPrimitives = this.primitivesToGcsFormat(sketch.primitives);
    gcs.push_primitives_and_params(gcsPrimitives);

    const gcsConstraints = this.constraintsToGcsFormat(
      sketch.constraints,
      sketch.primitives,
    );
    for (const constraint of gcsConstraints) {
      gcs.push_primitive(constraint);
    }

    // planegcs computes DOF as a side-effect of running the solver --
    // gcs.dof() returns -1 until the subsystems have been initialised.
    gcs.solve(Algorithm.DogLeg);
    return gcs.gcs.dof();
  }

  private primitivesToGcsFormat(
    primitives: SketchPrimitive[],
  ): GcsSketchPrimitive[] {
    const result: GcsSketchPrimitive[] = [];

    for (const primitive of primitives) {
      if (isSketchPoint(primitive)) {
        result.push(this.pointToGcs(primitive));
      } else if (isSketchLine(primitive)) {
        result.push(this.lineToGcs(primitive));
      } else if (isSketchCircle(primitive)) {
        result.push(this.circleToGcs(primitive));
      } else if (isSketchArc(primitive)) {
        result.push(this.arcToGcs(primitive, primitives));
      }
    }

    return result;
  }

  private pointToGcs(point: SketchPoint): GcsSketchPoint {
    return {
      id: point.id,
      type: "point",
      x: point.x,
      y: point.y,
      fixed: point.fixed ?? false,
    };
  }

  private lineToGcs(line: SketchLine): GcsSketchLine {
    return {
      id: line.id,
      type: "line",
      p1_id: line.p1Id,
      p2_id: line.p2Id,
    };
  }

  private circleToGcs(circle: SketchCircle): GcsSketchCircle {
    return {
      id: circle.id,
      type: "circle",
      c_id: circle.centerId,
      radius: circle.radius,
    };
  }

  private arcToGcs(
    arc: SketchArc,
    primitives: SketchPrimitive[],
  ): GcsSketchArc {
    const centerPrim = findSketchPoint(primitives, arc.centerId);
    const startPrim = findSketchPoint(primitives, arc.startId);
    const endPrim = findSketchPoint(primitives, arc.endId);

    let startAngle = 0;
    let endAngle = Math.PI;
    if (centerPrim && startPrim && endPrim) {
      startAngle = Math.atan2(
        startPrim.y - centerPrim.y,
        startPrim.x - centerPrim.x,
      );
      endAngle = Math.atan2(endPrim.y - centerPrim.y, endPrim.x - centerPrim.x);
    }

    return {
      id: arc.id,
      type: "arc",
      c_id: arc.centerId,
      start_id: arc.startId,
      end_id: arc.endId,
      radius: arc.radius,
      start_angle: startAngle,
      end_angle: endAngle,
    };
  }

  private constraintsToGcsFormat(
    constraints: SketchConstraint[],
    primitives: SketchPrimitive[],
  ): GcsSketchPrimitive[] {
    const result: GcsSketchPrimitive[] = [];

    for (const constraint of constraints) {
      const gcsConstraint = this.constraintToGcs(constraint, primitives);
      if (gcsConstraint) {
        result.push(gcsConstraint);
      }
    }

    return result;
  }

  private constraintToGcs(
    constraint: SketchConstraint,
    primitives: SketchPrimitive[],
  ): GcsSketchPrimitive | null {
    const driving = constraint.driving ?? true;

    switch (constraint.type) {
      case "coincident": {
        if (constraint.primitiveIds.length === 2) {
          return {
            id: constraint.id,
            type: "p2p_coincident",
            p1_id: constraint.primitiveIds[0],
            p2_id: constraint.primitiveIds[1],
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "horizontal": {
        // 1 primitive → horizontal line; 2 primitives → horizontal distance.
        if (constraint.primitiveIds.length === 1) {
          return {
            id: constraint.id,
            type: "horizontal_l",
            l_id: constraint.primitiveIds[0],
            driving,
          } as GcsSketchPrimitive;
        } else if (constraint.primitiveIds.length === 2) {
          return {
            id: constraint.id,
            type: "horizontal_pp",
            p1_id: constraint.primitiveIds[0],
            p2_id: constraint.primitiveIds[1],
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "vertical": {
        if (constraint.primitiveIds.length === 1) {
          return {
            id: constraint.id,
            type: "vertical_l",
            l_id: constraint.primitiveIds[0],
            driving,
          } as GcsSketchPrimitive;
        } else if (constraint.primitiveIds.length === 2) {
          return {
            id: constraint.id,
            type: "vertical_pp",
            p1_id: constraint.primitiveIds[0],
            p2_id: constraint.primitiveIds[1],
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "parallel": {
        if (constraint.primitiveIds.length === 2) {
          return {
            id: constraint.id,
            type: "parallel",
            l1_id: constraint.primitiveIds[0],
            l2_id: constraint.primitiveIds[1],
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "perpendicular": {
        if (constraint.primitiveIds.length === 2) {
          return {
            id: constraint.id,
            type: "perpendicular_ll",
            l1_id: constraint.primitiveIds[0],
            l2_id: constraint.primitiveIds[1],
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "tangent": {
        if (constraint.primitiveIds.length === 2) {
          const p1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const p2 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );

          if (p1 && p2 && isSketchLine(p1) && isSketchCircle(p2)) {
            return {
              id: constraint.id,
              type: "tangent_lc",
              l_id: constraint.primitiveIds[0],
              c_id: constraint.primitiveIds[1],
              driving,
            } as GcsSketchPrimitive;
          } else if (p1 && p2 && isSketchCircle(p1) && isSketchLine(p2)) {
            return {
              id: constraint.id,
              type: "tangent_lc",
              l_id: constraint.primitiveIds[1],
              c_id: constraint.primitiveIds[0],
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "equal": {
        // Either equal-length (line, line) or equal-radius (circle, circle).
        if (constraint.primitiveIds.length === 2) {
          const p1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const p2 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );

          if (p1 && p2 && isSketchLine(p1) && isSketchLine(p2)) {
            return {
              id: constraint.id,
              type: "equal_length",
              l1_id: constraint.primitiveIds[0],
              l2_id: constraint.primitiveIds[1],
              driving,
            } as GcsSketchPrimitive;
          } else if (p1 && p2 && isSketchCircle(p1) && isSketchCircle(p2)) {
            return {
              id: constraint.id,
              type: "equal_radius_cc",
              c1_id: constraint.primitiveIds[0],
              c2_id: constraint.primitiveIds[1],
              driving,
            } as GcsSketchPrimitive;
          } else if (p1 && p2 && isSketchArc(p1) && isSketchArc(p2)) {
            return {
              id: constraint.id,
              type: "equal_radius_aa",
              a1_id: constraint.primitiveIds[0],
              a2_id: constraint.primitiveIds[1],
              driving,
            } as GcsSketchPrimitive;
          } else if (p1 && p2 && isSketchCircle(p1) && isSketchArc(p2)) {
            return {
              id: constraint.id,
              type: "equal_radius_ca",
              c1_id: constraint.primitiveIds[0],
              a2_id: constraint.primitiveIds[1],
              driving,
            } as GcsSketchPrimitive;
          } else if (p1 && p2 && isSketchArc(p1) && isSketchCircle(p2)) {
            return {
              id: constraint.id,
              type: "equal_radius_ca",
              c1_id: constraint.primitiveIds[1],
              a2_id: constraint.primitiveIds[0],
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "distance": {
        if (constraint.value !== undefined) {
          if (constraint.primitiveIds.length === 2) {
            return {
              id: constraint.id,
              type: "p2p_distance",
              p1_id: constraint.primitiveIds[0],
              p2_id: constraint.primitiveIds[1],
              distance: constraint.value,
              driving,
            } as GcsSketchPrimitive;
          } else if (constraint.primitiveIds.length === 1) {
            // Single-line form is sugar for "distance between its endpoints".
            const lineId = constraint.primitiveIds[0];
            const line = lineId
              ? findSketchLine(primitives, lineId)
              : undefined;
            if (line) {
              return {
                id: constraint.id,
                type: "p2p_distance",
                p1_id: line.p1Id,
                p2_id: line.p2Id,
                distance: constraint.value,
                driving,
              } as GcsSketchPrimitive;
            }
          }
        }
        break;
      }

      case "distanceX": {
        if (constraint.value !== undefined) {
          let p1Id = constraint.primitiveIds[0];
          let p2Id = constraint.primitiveIds[1];
          if (constraint.primitiveIds.length === 1) {
            const line = findSketchLine(primitives, constraint.primitiveIds[0]!);
            p1Id = line?.p1Id;
            p2Id = line?.p2Id;
          }
          if (p1Id && p2Id) {
            return {
              id: constraint.id,
              type: "difference",
              param1: { o_id: p1Id, prop: "x" },
              param2: { o_id: p2Id, prop: "x" },
              difference: constraint.value,
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "distanceY": {
        if (constraint.value !== undefined) {
          let p1Id = constraint.primitiveIds[0];
          let p2Id = constraint.primitiveIds[1];
          if (constraint.primitiveIds.length === 1) {
            const line = findSketchLine(primitives, constraint.primitiveIds[0]!);
            p1Id = line?.p1Id;
            p2Id = line?.p2Id;
          }
          if (p1Id && p2Id) {
            return {
              id: constraint.id,
              type: "difference",
              param1: { o_id: p1Id, prop: "y" },
              param2: { o_id: p2Id, prop: "y" },
              difference: constraint.value,
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "angle": {
        if (
          constraint.primitiveIds.length === 2 &&
          constraint.value !== undefined
        ) {
          return {
            id: constraint.id,
            type: "l2l_angle_ll",
            l1_id: constraint.primitiveIds[0],
            l2_id: constraint.primitiveIds[1],
            angle: constraint.value,
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "radius": {
        if (
          constraint.primitiveIds.length === 1 &&
          constraint.value !== undefined
        ) {
          return {
            id: constraint.id,
            type: "circle_radius",
            c_id: constraint.primitiveIds[0],
            radius: constraint.value,
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "diameter": {
        // planegcs only has circle_radius, so halve.
        if (
          constraint.primitiveIds.length === 1 &&
          constraint.value !== undefined
        ) {
          return {
            id: constraint.id,
            type: "circle_radius",
            c_id: constraint.primitiveIds[0],
            radius: constraint.value / 2,
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "pointOnLine": {
        if (constraint.primitiveIds.length === 2) {
          // Caller may pass (point, line) or (line, point), and the "point" may be a circle's center.
          const prim0 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const prim1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );
          let pointId = constraint.primitiveIds[0];
          let lineId = constraint.primitiveIds[1];

          if (prim0 && prim1) {
            if (
              isSketchLine(prim0) &&
              (isSketchPoint(prim1) || isSketchCircle(prim1))
            ) {
              lineId = constraint.primitiveIds[0];
              pointId = isSketchCircle(prim1)
                ? prim1.centerId
                : constraint.primitiveIds[1];
            } else if (isSketchCircle(prim0)) {
              pointId = prim0.centerId;
            }
          }

          return {
            id: constraint.id,
            type: "point_on_line_pl",
            p_id: pointId,
            l_id: lineId,
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "pointOnCircle": {
        if (constraint.primitiveIds.length === 2) {
          const prim0 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const prim1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );
          let pointId = constraint.primitiveIds[0];
          let circleId = constraint.primitiveIds[1];

          if (
            prim0 &&
            prim1 &&
            prim1.type === "point" &&
            prim0.type === "circle"
          ) {
            pointId = constraint.primitiveIds[1];
            circleId = constraint.primitiveIds[0];
          }

          return {
            id: constraint.id,
            type: "point_on_circle",
            p_id: pointId,
            c_id: circleId,
            driving,
          } as GcsSketchPrimitive;
        }
        break;
      }

      case "midpoint": {
        // A point is the midpoint of a line when the line's endpoints are
        // centrally symmetric about that point. planegcs has no point+line
        // midpoint primitive, but this central-symmetry form is exact.
        if (constraint.primitiveIds.length === 2) {
          const prim0 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const prim1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );

          const point =
            prim0 && isSketchPoint(prim0)
              ? prim0
              : prim1 && isSketchPoint(prim1)
                ? prim1
                : undefined;
          const line =
            prim0 && isSketchLine(prim0)
              ? prim0
              : prim1 && isSketchLine(prim1)
                ? prim1
                : undefined;

          if (point && line) {
            return {
              id: constraint.id,
              type: "p2p_symmetric_ppp",
              p1_id: line.p1Id,
              p2_id: line.p2Id,
              p_id: point.id,
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "symmetric": {
        // Two points symmetric about a line, or about a third point.
        if (constraint.primitiveIds.length === 3) {
          const selected = constraint.primitiveIds
            .map((id) => primitives.find((p) => p.id === id))
            .filter((p): p is SketchPrimitive => !!p);
          const points = selected.filter(isSketchPoint);
          const line = selected.find(isSketchLine);

          if (points.length === 2 && line) {
            return {
              id: constraint.id,
              type: "p2p_symmetric_ppl",
              p1_id: points[0]!.id,
              p2_id: points[1]!.id,
              l_id: line.id,
              driving,
            } as GcsSketchPrimitive;
          }

          if (points.length === 3) {
            return {
              id: constraint.id,
              type: "p2p_symmetric_ppp",
              p1_id: points[0]!.id,
              p2_id: points[1]!.id,
              p_id: points[2]!.id,
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }

      case "concentric": {
        if (constraint.primitiveIds.length === 2) {
          const p1 = primitives.find(
            (p) => p.id === constraint.primitiveIds[0],
          );
          const p2 = primitives.find(
            (p) => p.id === constraint.primitiveIds[1],
          );

          if (p1 && p2 && isSketchCircle(p1) && isSketchCircle(p2)) {
            return {
              id: constraint.id,
              type: "p2p_coincident",
              p1_id: p1.centerId,
              p2_id: p2.centerId,
              driving,
            } as GcsSketchPrimitive;
          }
        }
        break;
      }
      default: {
        // Compile-time exhaustiveness: errors if a new ConstraintType member
        // is added without a case above. Falls through to the warn + return
        // null path so legitimate fall-through cases (e.g. wrong primitive-id
        // arity) still return null instead of throwing.
        const _exhaustive: never = constraint;
        void _exhaustive;
        break;
      }
    }

    console.warn(`Unsupported constraint type: ${constraint.type}`);
    return null;
  }

  private applyGcsSolution(sketch: Sketch, gcs: GcsWrapper): Sketch {
    const updatedPrimitives: SketchPrimitive[] = [];

    for (const primitive of sketch.primitives) {
      if (isSketchPoint(primitive)) {
        const gcsPrimitive = gcs.sketch_index.get_primitive(primitive.id);
        if (gcsPrimitive && gcsPrimitive.type === "point") {
          const gcsPoint = gcsPrimitive as GcsSketchPoint;
          updatedPrimitives.push({
            ...primitive,
            x: gcsPoint.x,
            y: gcsPoint.y,
          });
        } else {
          updatedPrimitives.push(primitive);
        }
      } else if (isSketchCircle(primitive)) {
        const gcsPrimitive = gcs.sketch_index.get_primitive(primitive.id);
        if (gcsPrimitive && gcsPrimitive.type === "circle") {
          const gcsCircle = gcsPrimitive as GcsSketchCircle;
          updatedPrimitives.push({
            ...primitive,
            radius: gcsCircle.radius,
          });
        } else {
          updatedPrimitives.push(primitive);
        }
      } else if (isSketchArc(primitive)) {
        const gcsPrimitive = gcs.sketch_index.get_primitive(primitive.id);
        if (gcsPrimitive && gcsPrimitive.type === "arc") {
          const gcsArc = gcsPrimitive as GcsSketchArc;
          updatedPrimitives.push({
            ...primitive,
            radius: gcsArc.radius,
          });
        } else {
          updatedPrimitives.push(primitive);
        }
      } else {
        updatedPrimitives.push(primitive);
      }
    }

    return {
      ...sketch,
      primitives: updatedPrimitives,
    };
  }
}
