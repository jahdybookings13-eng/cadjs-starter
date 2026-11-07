// Pure sketch-state transforms (add/remove primitive, add/remove constraint,
// trim/extend/split helpers). Solver and IO failures live in
// SketchSolverService / SketchToBrepService, which have their own error
// channels. No Result<T> here. See ./result.ts for the policy.
import {
  Sketch,
  SketchPlane,
  SketchPrimitive,
  SketchConstraint,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  isSketchPoint,
  isSketchLine,
  isSketchCircle,
  isSketchArc,
  findSketchPoint,
  findSketchLine,
  findSketchCircle,
} from "../types/sketch-types";
import {
  SKETCH_PARAM_ENDPOINT_TOL,
  SKETCH_PARAM_MATCH_TOL,
} from "../sketch-tolerances";

// Reference length used when defining the origin axis lines in sketch space.
// The lines are visually extended beyond these endpoints at render time to appear infinite;
// this value only determines the axis direction stored for the planegcs solver.
const AXIS_REF_LEN = 100;

export function createSketch(
  plane: SketchPlane,
  idCounter: number,
): { sketch: Sketch; nextId: number } {
  const sketchId = `sketch_${idCounter}`;

  const originPointId = `${sketchId}_origin`;
  const xAxisEndId = `${sketchId}_xAxisEnd`;
  const yAxisEndId = `${sketchId}_yAxisEnd`;
  const xAxisLineId = `${sketchId}_xAxisLine`;
  const yAxisLineId = `${sketchId}_yAxisLine`;

  const originPoint: SketchPoint = {
    id: originPointId,
    type: "point",
    x: 0,
    y: 0,
    fixed: true,
    origin: true,
  };
  const xAxisEnd: SketchPoint = {
    id: xAxisEndId,
    type: "point",
    x: AXIS_REF_LEN,
    y: 0,
    fixed: true,
    origin: true,
  };
  const yAxisEnd: SketchPoint = {
    id: yAxisEndId,
    type: "point",
    x: 0,
    y: AXIS_REF_LEN,
    fixed: true,
    origin: true,
  };
  const xAxisLine: SketchLine = {
    id: xAxisLineId,
    type: "line",
    p1Id: originPointId,
    p2Id: xAxisEndId,
    origin: true,
  };
  const yAxisLine: SketchLine = {
    id: yAxisLineId,
    type: "line",
    p1Id: originPointId,
    p2Id: yAxisEndId,
    origin: true,
  };

  const sketch: Sketch = {
    id: sketchId,
    plane,
    primitives: [originPoint, xAxisEnd, yAxisEnd, xAxisLine, yAxisLine],
    constraints: [],
    layers: [
      {
        id: `${sketchId}_layer0`,
        name: "Layer 0",
        color: "#cbd5e1",
        visible: true,
        linetype: "continuous",
      },
    ],
    blocks: [],
    dof: 0,
    status: "fully_constrained",
  };

  return {
    sketch,
    nextId: idCounter + 1,
  };
}

export function addPrimitiveToSketch(
  sketch: Sketch,
  primitive: SketchPrimitive,
  idCounter: number,
): { sketch: Sketch; nextId: number } {
  const primitiveWithId: SketchPrimitive = primitive.id
    ? primitive
    : { ...primitive, id: `prim_${idCounter}` };

  const updatedSketch: Sketch = {
    ...sketch,
    primitives: [...sketch.primitives, primitiveWithId],
    dof: sketch.dof + (isSketchPoint(primitiveWithId) ? 2 : 0),
    status: "underconstrained",
  };

  return {
    sketch: updatedSketch,
    nextId: primitive.id ? idCounter : idCounter + 1,
  };
}

export function addConstraintToSketch(
  sketch: Sketch,
  constraint: SketchConstraint,
  idCounter: number,
): { sketch: Sketch; nextId: number } {
  const constraintWithId: SketchConstraint = constraint.id
    ? constraint
    : { ...constraint, id: `const_${idCounter}` };

  for (const primitiveId of constraintWithId.primitiveIds) {
    const exists = sketch.primitives.some((p) => p.id === primitiveId);
    if (!exists) {
      console.warn(
        `Constraint references non-existent primitive: ${primitiveId}`,
      );
    }
  }

  const updatedSketch: Sketch = {
    ...sketch,
    constraints: [...sketch.constraints, constraintWithId],
    // DOF reduction here is approximate; the solver computes the precise value.
    dof: Math.max(0, sketch.dof - 1),
    status: "underconstrained",
  };

  return {
    sketch: updatedSketch,
    nextId: constraint.id ? idCounter : idCounter + 1,
  };
}

export function removePrimitiveFromSketch(
  sketch: Sketch,
  primitiveId: string,
): { sketch: Sketch } {
  const primitiveToRemove = sketch.primitives.find((p) => p.id === primitiveId);

  if (!primitiveToRemove) {
    console.warn(`Primitive not found: ${primitiveId}`);
    return { sketch };
  }

  if ((primitiveToRemove as { origin?: boolean }).origin) {
    return { sketch };
  }

  const updatedPrimitives = sketch.primitives.filter(
    (p) => p.id !== primitiveId,
  );

  const updatedConstraints = sketch.constraints.filter(
    (c) => !c.primitiveIds.includes(primitiveId),
  );

  // Cascade: hatches that referenced the removed boundary go too.
  const hatchesToRemove = new Set(
    sketch.primitives
      .filter((p) => p.type === "hatch" && p.boundaryIds.includes(primitiveId))
      .map((p) => p.id),
  );

  // Cascade: lines/circles/arcs/ellipses that reference the removed primitive go too.
  const dependentIds = new Set<string>();
  for (const p of sketch.primitives) {
    if (p.id === primitiveId) continue;

    if (p.type === "line") {
      if (p.p1Id === primitiveId || p.p2Id === primitiveId) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "circle") {
      if (p.centerId === primitiveId) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "ellipse") {
      if (p.centerId === primitiveId) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "ellipticalArc") {
      if (p.centerId === primitiveId) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "spline") {
      if (
        p.pointIds.includes(primitiveId) ||
        p.startId === primitiveId ||
        p.endId === primitiveId
      ) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "bezier") {
      if (p.pointIds.includes(primitiveId)) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "conic") {
      if (
        p.startId === primitiveId ||
        p.controlId === primitiveId ||
        p.endId === primitiveId
      ) {
        dependentIds.add(p.id);
      }
    } else if (p.type === "arc") {
      if (
        p.centerId === primitiveId ||
        p.startId === primitiveId ||
        p.endId === primitiveId
      ) {
        dependentIds.add(p.id);
      }
    }
  }

  const finalPrimitives = updatedPrimitives.filter(
    (p) =>
      (!dependentIds.has(p.id) && !hatchesToRemove.has(p.id)) ||
      (p as { origin?: boolean }).origin,
  );

  const finalConstraints = updatedConstraints.filter(
    (c) => !c.primitiveIds.some((id) => dependentIds.has(id)),
  );

  const updatedSketch: Sketch = {
    ...sketch,
    primitives: finalPrimitives,
    constraints: finalConstraints,
    status: "underconstrained",
  };

  return { sketch: updatedSketch };
}

export function removeConstraintFromSketch(
  sketch: Sketch,
  constraintId: string,
): { sketch: Sketch } {
  const constraintToRemove = sketch.constraints.find(
    (c) => c.id === constraintId,
  );

  if (!constraintToRemove) {
    console.warn(`Constraint not found: ${constraintId}`);
    return { sketch };
  }

  const updatedConstraints = sketch.constraints.filter(
    (c) => c.id !== constraintId,
  );

  const updatedSketch: Sketch = {
    ...sketch,
    constraints: updatedConstraints,
    dof: sketch.dof + 1,
    status: "underconstrained",
  };

  return { sketch: updatedSketch };
}

export function updatePrimitiveInSketch(
  sketch: Sketch,
  primitiveId: string,
  updates: Partial<SketchPrimitive>,
): Sketch {
  const updatedPrimitives = sketch.primitives.map((p) => {
    if (p.id === primitiveId) {
      return { ...p, ...updates } as SketchPrimitive;
    }
    return p;
  });

  return {
    ...sketch,
    primitives: updatedPrimitives,
  };
}

export function updateConstraintInSketch(
  sketch: Sketch,
  constraintId: string,
  updates: Partial<SketchConstraint>,
): Sketch {
  const updatedConstraints: SketchConstraint[] = sketch.constraints.map((c) => {
    if (c.id === constraintId) {
      // Cast: see useSketchSession.updateConstraint, spreading widens the
      // discriminated union; the runtime invariant that `type` never changes
      // keeps the merged object in the same arm.
      return { ...c, ...updates } as SketchConstraint;
    }
    return c;
  });

  return {
    ...sketch,
    constraints: updatedConstraints,
  };
}

export function getPointById(
  sketch: Sketch,
  pointId: string,
): SketchPoint | undefined {
  const primitive = sketch.primitives.find((p) => p.id === pointId);
  if (primitive && isSketchPoint(primitive)) {
    return primitive;
  }
  return undefined;
}

export function getAllPoints(sketch: Sketch): SketchPoint[] {
  return sketch.primitives.filter(isSketchPoint);
}

export function getConstraintsForPrimitive(
  sketch: Sketch,
  primitiveId: string,
): SketchConstraint[] {
  return sketch.constraints.filter((c) => c.primitiveIds.includes(primitiveId));
}

// Geometric constraints transfer to the first surviving segment;
// dimensional constraints are dropped because the length changed.
export function splitLineAtParams(
  sketch: Sketch,
  lineId: string,
  splitParams: number[],
  idCounter: number,
): {
  sketch: Sketch;
  newPointIds: string[];
  newLineIds: string[];
  nextId: number;
} {
  const line = findSketchLine(sketch.primitives, lineId);
  if (!line)
    return { sketch, newPointIds: [], newLineIds: [], nextId: idCounter };

  const p1 = findSketchPoint(sketch.primitives, line.p1Id);
  const p2 = findSketchPoint(sketch.primitives, line.p2Id);
  if (!p1 || !p2)
    return { sketch, newPointIds: [], newLineIds: [], nextId: idCounter };

  const sorted = [...new Set(splitParams)]
    .filter(
      (t) => t > SKETCH_PARAM_ENDPOINT_TOL && t < 1 - SKETCH_PARAM_ENDPOINT_TOL,
    )
    .sort((a, b) => a - b);

  if (sorted.length === 0)
    return { sketch, newPointIds: [], newLineIds: [], nextId: idCounter };

  let nextId = idCounter;
  const newPoints: SketchPoint[] = [];
  const newLines: SketchLine[] = [];

  for (const t of sorted) {
    nextId++;
    const pt: SketchPoint = {
      id: `point_${nextId}`,
      type: "point",
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    };
    newPoints.push(pt);
  }

  const orderedPointIds = [line.p1Id, ...newPoints.map((p) => p.id), line.p2Id];
  for (let i = 0; i < orderedPointIds.length - 1; i++) {
    nextId++;
    newLines.push({
      id: `line_${nextId}`,
      type: "line",
      p1Id: orderedPointIds[i]!,
      p2Id: orderedPointIds[i + 1]!,
      construction: line.construction,
    });
  }

  let updatedPrimitives = sketch.primitives.filter((p) => p.id !== lineId);
  updatedPrimitives = [...updatedPrimitives, ...newPoints, ...newLines];

  const updatedConstraints = sketch.constraints
    .map((c) => {
      if (!c.primitiveIds.includes(lineId)) return c;

      if (
        [
          "horizontal",
          "vertical",
          "parallel",
          "perpendicular",
          "equal",
        ].includes(c.type)
      ) {
        return {
          ...c,
          primitiveIds: c.primitiveIds.map((id) =>
            id === lineId ? newLines[0]!.id : id,
          ),
        };
      }

      // Coincident references point IDs (not line IDs), so the original entry still applies.
      if (c.type === "coincident") {
        return c;
      }

      if (["distance", "distanceX", "distanceY"].includes(c.type)) {
        return null;
      }

      return c;
    })
    .filter((c): c is SketchConstraint => c !== null);

  return {
    sketch: {
      ...sketch,
      primitives: updatedPrimitives,
      constraints: updatedConstraints,
      status: "underconstrained",
    },
    newPointIds: newPoints.map((p) => p.id),
    newLineIds: newLines.map((l) => l.id),
    nextId,
  };
}

// Removes the line and any of its endpoints not referenced by other primitives.
export function removeLineSegment(sketch: Sketch, lineId: string): Sketch {
  const line = findSketchLine(sketch.primitives, lineId);
  if (!line) return sketch;

  const pointIdsToCheck = [line.p1Id, line.p2Id];
  const exclusivePointIds = pointIdsToCheck.filter((ptId) => {
    const usedBy = sketch.primitives.filter((p) => {
      if (p.id === lineId) return false;
      if (isSketchLine(p)) return p.p1Id === ptId || p.p2Id === ptId;
      if (isSketchCircle(p)) return p.centerId === ptId;
      if (isSketchArc(p))
        return p.centerId === ptId || p.startId === ptId || p.endId === ptId;
      return false;
    });
    return usedBy.length === 0;
  });

  const removeIds = new Set([lineId, ...exclusivePointIds]);
  const updatedPrimitives = sketch.primitives.filter(
    (p) => !removeIds.has(p.id),
  );
  const updatedConstraints = sketch.constraints.filter(
    (c) => !c.primitiveIds.some((id) => removeIds.has(id)),
  );

  return {
    ...sketch,
    primitives: updatedPrimitives,
    constraints: updatedConstraints,
    status: "underconstrained",
  };
}

// End-segment cursor → shorten by replacing the line with a new shorter one (preserves the
// untouched corner). Middle-segment cursor → split, then drop the middle piece.
export function trimLineAtSegment(
  sketch: Sketch,
  lineId: string,
  startParam: number,
  endParam: number,
  intersectionParams: number[],
  idCounter: number,
): { sketch: Sketch; nextId: number } {
  const line = findSketchLine(sketch.primitives, lineId);
  if (!line) return { sketch, nextId: idCounter };

  const p1 = findSketchPoint(sketch.primitives, line.p1Id);
  const p2 = findSketchPoint(sketch.primitives, line.p2Id);
  if (!p1 || !p2) return { sketch, nextId: idCounter };

  const isStartSegment = startParam < SKETCH_PARAM_ENDPOINT_TOL;
  const isEndSegment = endParam > 1 - SKETCH_PARAM_ENDPOINT_TOL;

  if (isStartSegment && isEndSegment) {
    return {
      sketch: removeLineSegment(sketch, lineId),
      nextId: idCounter,
    };
  }

  if (isStartSegment) {
    // Replace, don't move, moving the shared corner would warp adjacent edges.
    const newX = p1.x + endParam * (p2.x - p1.x);
    const newY = p1.y + endParam * (p2.y - p1.y);
    let nextId = idCounter;

    let updatedPrimitives = sketch.primitives.filter((p) => p.id !== lineId);

    nextId++;
    const newPtId = `point_${nextId}`;
    const newPoint: SketchPoint = {
      id: newPtId,
      type: "point",
      x: newX,
      y: newY,
    };

    nextId++;
    const newLineId = `line_${nextId}`;
    const newLine: SketchLine = {
      id: newLineId,
      type: "line",
      p1Id: newPtId,
      p2Id: line.p2Id,
      construction: line.construction,
    };

    updatedPrimitives = [...updatedPrimitives, newPoint, newLine];

    const updatedConstraints = sketch.constraints
      .map((c) => {
        if (!c.primitiveIds.includes(lineId)) return c;
        if (
          [
            "horizontal",
            "vertical",
            "parallel",
            "perpendicular",
            "equal",
          ].includes(c.type)
        ) {
          return {
            ...c,
            primitiveIds: c.primitiveIds.map((id) =>
              id === lineId ? newLineId : id,
            ),
          };
        }
        if (c.type === "coincident") return c;
        if (["distance", "distanceX", "distanceY"].includes(c.type))
          return null;
        return c;
      })
      .filter((c): c is SketchConstraint => c !== null);

    return {
      sketch: {
        ...sketch,
        primitives: updatedPrimitives,
        constraints: updatedConstraints,
        status: "underconstrained",
      },
      nextId,
    };
  }

  if (isEndSegment) {
    const newX = p1.x + startParam * (p2.x - p1.x);
    const newY = p1.y + startParam * (p2.y - p1.y);
    let nextId = idCounter;

    let updatedPrimitives = sketch.primitives.filter((p) => p.id !== lineId);

    nextId++;
    const newPtId = `point_${nextId}`;
    const newPoint: SketchPoint = {
      id: newPtId,
      type: "point",
      x: newX,
      y: newY,
    };

    nextId++;
    const newLineId = `line_${nextId}`;
    const newLine: SketchLine = {
      id: newLineId,
      type: "line",
      p1Id: line.p1Id,
      p2Id: newPtId,
      construction: line.construction,
    };

    updatedPrimitives = [...updatedPrimitives, newPoint, newLine];

    const updatedConstraints = sketch.constraints
      .map((c) => {
        if (!c.primitiveIds.includes(lineId)) return c;
        if (
          [
            "horizontal",
            "vertical",
            "parallel",
            "perpendicular",
            "equal",
          ].includes(c.type)
        ) {
          return {
            ...c,
            primitiveIds: c.primitiveIds.map((id) =>
              id === lineId ? newLineId : id,
            ),
          };
        }
        if (c.type === "coincident") return c;
        if (["distance", "distanceX", "distanceY"].includes(c.type))
          return null;
        return c;
      })
      .filter((c): c is SketchConstraint => c !== null);

    return {
      sketch: {
        ...sketch,
        primitives: updatedPrimitives,
        constraints: updatedConstraints,
        status: "underconstrained",
      },
      nextId,
    };
  }

  // Middle segment: split, then drop the segment whose [start..end] params match the cursor.
  const splitResult = splitLineAtParams(
    sketch,
    lineId,
    intersectionParams,
    idCounter,
  );

  const sortedParams = [...intersectionParams]
    .filter(
      (t) => t > SKETCH_PARAM_ENDPOINT_TOL && t < 1 - SKETCH_PARAM_ENDPOINT_TOL,
    )
    .sort((a, b) => a - b);
  let segmentIndex = -1;
  const boundaries = [0, ...sortedParams, 1];
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (
      Math.abs(boundaries[i]! - startParam) < SKETCH_PARAM_MATCH_TOL &&
      Math.abs(boundaries[i + 1]! - endParam) < SKETCH_PARAM_MATCH_TOL
    ) {
      segmentIndex = i;
      break;
    }
  }

  if (segmentIndex >= 0 && segmentIndex < splitResult.newLineIds.length) {
    const lineToRemove = splitResult.newLineIds[segmentIndex]!;
    return {
      sketch: removeLineSegment(splitResult.sketch, lineToRemove),
      nextId: splitResult.nextId,
    };
  }

  return { sketch: splitResult.sketch, nextId: splitResult.nextId };
}

// Removes the [removeStartAngle, removeEndAngle] sweep; the surviving arc is the complement.
export function convertCircleToArc(
  sketch: Sketch,
  circleId: string,
  removeStartAngle: number,
  removeEndAngle: number,
  idCounter: number,
): { sketch: Sketch; arcId: string; nextId: number } {
  const circle = findSketchCircle(sketch.primitives, circleId);
  if (!circle) return { sketch, arcId: "", nextId: idCounter };

  const center = findSketchPoint(sketch.primitives, circle.centerId);
  if (!center) return { sketch, arcId: "", nextId: idCounter };

  let nextId = idCounter;

  // Surviving arc spans from removeEndAngle CCW back to removeStartAngle.
  nextId++;
  const startPt: SketchPoint = {
    id: `point_${nextId}`,
    type: "point",
    x: center.x + circle.radius * Math.cos(removeEndAngle),
    y: center.y + circle.radius * Math.sin(removeEndAngle),
  };

  nextId++;
  const endPt: SketchPoint = {
    id: `point_${nextId}`,
    type: "point",
    x: center.x + circle.radius * Math.cos(removeStartAngle),
    y: center.y + circle.radius * Math.sin(removeStartAngle),
  };

  nextId++;
  const arc: SketchArc = {
    id: `arc_${nextId}`,
    type: "arc",
    centerId: circle.centerId,
    startId: startPt.id,
    endId: endPt.id,
    radius: circle.radius,
    construction: circle.construction,
  };

  let updatedPrimitives = sketch.primitives.filter((p) => p.id !== circleId);
  updatedPrimitives = [...updatedPrimitives, startPt, endPt, arc];

  const updatedConstraints = sketch.constraints
    .map((c) => {
      if (!c.primitiveIds.includes(circleId)) return c;

      // Radius/diameter/concentric/pointOnCircle remap to the new arc; others are dropped.
      if (
        c.type === "radius" ||
        c.type === "diameter" ||
        c.type === "concentric" ||
        c.type === "pointOnCircle"
      ) {
        return {
          ...c,
          primitiveIds: c.primitiveIds.map((id) =>
            id === circleId ? arc.id : id,
          ),
        };
      }
      return null;
    })
    .filter((c): c is SketchConstraint => c !== null);

  return {
    sketch: {
      ...sketch,
      primitives: updatedPrimitives,
      constraints: updatedConstraints,
      status: "underconstrained",
    },
    arcId: arc.id,
    nextId,
  };
}

export function cleanupOrphanedPoints(sketch: Sketch): {
  sketch: Sketch;
  removedIds: string[];
} {
  const usedPointIds = new Set<string>();
  for (const p of sketch.primitives) {
    if (isSketchLine(p)) {
      usedPointIds.add(p.p1Id);
      usedPointIds.add(p.p2Id);
    }
    if (isSketchCircle(p)) {
      usedPointIds.add(p.centerId);
    }
    if (isSketchArc(p)) {
      usedPointIds.add(p.centerId);
      usedPointIds.add(p.startId);
      usedPointIds.add(p.endId);
    }
  }
  const orphanIds = sketch.primitives
    .filter((p) => isSketchPoint(p) && !usedPointIds.has(p.id))
    .map((p) => p.id);
  if (orphanIds.length === 0) return { sketch, removedIds: [] };
  const removeSet = new Set(orphanIds);
  return {
    sketch: {
      ...sketch,
      primitives: sketch.primitives.filter((p) => !removeSet.has(p.id)),
      constraints: sketch.constraints.filter(
        (c) => !c.primitiveIds.some((id) => removeSet.has(id)),
      ),
    },
    removedIds: orphanIds,
  };
}
