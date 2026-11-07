import * as THREE from "three";
import { Brep, CompoundBrep } from "../geometry";
import {
  SceneElement,
  BooleanOperation,
  BooleanOperationOptions,
  nodeId as toNodeId,
} from "./types";
import { createMeshFromGeometry, disposeAndRemove } from "./mesh-operations";
import { OccWorkerClient } from "../services/OccWorkerClient";
import type { WorkerBooleanResult } from "../workers/occ-worker-types";
import {
  reconstructEdgeGeometry,
  reconstructFaceGeometry,
} from "../workers/geometry-reconstruction";
import { toVec3, toEulerJSON } from "../vectorHelpers";
import { Result, ok, err } from "./result";

export type { BooleanOperation } from "./types";

export interface BooleanOpResult {
  updatedElements: SceneElement[];
  updatedSelectedElements: string[];
  nextIdCounter: number;
}

// Union flattens compound children directly. Difference and intersection take the
// unified (post-merge) brep of each operand, boolean ops on a compound's children
// individually would produce wrong results.
async function collectChildBreps(
  operation: BooleanOperation,
  selectedElementsData: SceneElement[],
): Promise<Brep[]> {
  if (operation === "union") {
    return selectedElementsData.flatMap((el) =>
      el.brep instanceof CompoundBrep ? el.brep.children : [el.brep],
    );
  }
  const result: Brep[] = [];
  for (const el of selectedElementsData) {
    if (el.brep instanceof CompoundBrep) {
      result.push(await el.brep.getUnifiedBRep());
    } else {
      result.push(el.brep);
    }
  }
  return result;
}

export async function booleanOp(
  operation: BooleanOperation,
  elements: SceneElement[],
  selectedElements: string[],
  idCounter: number,
  objectsMap: Map<string, THREE.Object3D>,
  options?: BooleanOperationOptions,
): Promise<Result<BooleanOpResult>> {
  const effectiveSelected = options
    ? [options.targetId, ...options.toolIds]
    : selectedElements;

  if (effectiveSelected.length < 2) {
    return err("at least 2 elements required");
  }

  const selectedElementsData = effectiveSelected
    .map((nodeId) => elements.find((el) => el.nodeId === nodeId))
    .filter((el): el is SceneElement => el !== undefined);

  if (selectedElementsData.length < 2) {
    return err(
      "at least 2 elements required (some referenced elements no longer exist)",
    );
  }

  const childBreps = await collectChildBreps(operation, selectedElementsData);

  try {
    const operands = selectedElementsData.map((el) => ({
      brepJson: el.brep.toJSON(),
      position: toVec3(el.position),
      occBrep: el.occBrep,
      isCompound: el.brep instanceof CompoundBrep,
      compoundBrepJson:
        el.brep instanceof CompoundBrep ? el.brep.toJSON() : undefined,
      rotation: el.rotation ? toEulerJSON(el.rotation) : undefined,
    }));

    const client = OccWorkerClient.getInstance();
    const raw = await client.send<WorkerBooleanResult>({
      type: "boolean",
      payload: {
        operation,
        operands,
        options: options
          ? {
              targetId: options.targetId,
              toolIds: options.toolIds,
              keepTools: options.keepTools,
            }
          : undefined,
      },
    });

    const resultBrep = Brep.fromJSON(raw.brepJson);
    const worldCenter = new THREE.Vector3(
      raw.position.x,
      raw.position.y,
      raw.position.z,
    );
    const resultEdgeGeometry = raw.edgePositions
      ? reconstructEdgeGeometry(raw.edgePositions)
      : undefined;
    const resultVertexPositions = raw.vertexPositions ?? undefined;
    const resultGeometry = raw.faceGeometry
      ? reconstructFaceGeometry(raw.faceGeometry)
      : undefined;

    if (!resultGeometry) {
      throw new Error(
        `${operation} operation failed - no face geometry in result`,
      );
    }

    const compound = new CompoundBrep(childBreps);
    compound.setUnifiedBrep(resultBrep);

    const nextId = idCounter + 1;
    const nodeId = toNodeId(`node_${nextId}`);

    const resultMesh = createMeshFromGeometry(
      resultGeometry,
      resultEdgeGeometry,
    );
    resultMesh.position.set(0, 0, 0);

    const resultGroup = new THREE.Group();
    resultGroup.userData = { nodeId };
    resultGroup.add(resultMesh);
    resultGroup.position.copy(worldCenter);

    const newElement: SceneElement = {
      brep: compound,
      nodeId,
      position: worldCenter,
      selected: false,
      edgeGeometry: resultEdgeGeometry,
      vertexPositions: resultVertexPositions,
      occBrep: raw.occBrep,
    };

    objectsMap.set(nodeId, resultGroup);

    // keepTools (difference/intersection only): only remove target, preserve tools.
    // Union historically ignored keepTools; preserve that behavior unless explicitly set.
    const idsToRemove =
      options?.keepTools && operation !== "union"
        ? [options.targetId]
        : effectiveSelected;
    idsToRemove.forEach((id) => {
      disposeAndRemove(objectsMap.get(id));
      objectsMap.delete(id);
    });

    const updatedElements = [
      ...elements.filter((el) => !idsToRemove.includes(el.nodeId)),
      newElement,
    ];

    return ok({
      updatedElements,
      updatedSelectedElements: [],
      nextIdCounter: nextId,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
