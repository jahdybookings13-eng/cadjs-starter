// 3D board assembly: component solids with real transforms, an enclosure
// cavity/lid the board is checked against, and collision reporting.
//
// These are the same solids the viewport renders; nothing is recomputed twice.

import { footprintOf } from "./layout";
import type { Pcb3dBox, PcbStudioDocument } from "./types";

export interface PcbAssemblySolid extends Pcb3dBox {
  kind: "board" | "component";
  rotationDeg: number;
}

export interface MechanicalSolid {
  id: string;
  label: string;
  min: [number, number, number];
  max: [number, number, number];
}

export interface PcbCollision {
  componentId: string;
  mechanicalId: string;
  depthMM: number;
  msg: string;
}

export interface PcbAssemblyReport {
  solids: PcbAssemblySolid[];
  mechanical: MechanicalSolid[];
  collisions: PcbCollision[];
  pass: boolean;
  boardTopZ: number;
  maxComponentHeightMM: number;
  componentCount: number;
}

/** Board + component solids at real millimetre scale, z-up. */
export function pcbAssemblySolids(doc: PcbStudioDocument): PcbAssemblySolid[] {
  const solids: PcbAssemblySolid[] = [
    {
      id: "board",
      label: doc.name,
      kind: "board",
      x: doc.board.widthMM / 2,
      y: doc.board.heightMM / 2,
      z: doc.board.thicknessMM / 2,
      width: doc.board.widthMM,
      depth: doc.board.heightMM,
      height: doc.board.thicknessMM,
      color: doc.board.solderMask,
      rotationDeg: 0,
    },
  ];
  const walk = (node: import("../flux/domains/pcb/project").PcbNode): void => {
    if (node.kind === "element") {
      const part = footprintOf(doc, node);
      if (!part) return;
      solids.push({
        id: node.designator,
        label: node.designator,
        kind: "component",
        x: node.position.x,
        y: node.position.y,
        z: doc.board.thicknessMM + part.height3DMM / 2,
        width: part.widthMM,
        depth: part.heightMM,
        height: part.height3DMM,
        color: part.color,
        rotationDeg: node.rotation || 0,
      });
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(doc.project.root);
  return solids;
}

/**
 * The enclosure lid as a real mechanical solid above the board. A component
 * that pokes through it is a collision with a measured depth.
 */
export function enclosureLid(
  doc: PcbStudioDocument,
  cavityHeightMM = 8,
  wallMM = 1.5,
): MechanicalSolid {
  const top = doc.board.thicknessMM + Math.max(1, cavityHeightMM);
  return {
    id: "enclosure-lid",
    label: "Enclosure lid",
    min: [-wallMM, -wallMM, top],
    max: [doc.board.widthMM + wallMM, doc.board.heightMM + wallMM, top + 2],
  };
}

function aabbOverlapMM(
  a: PcbAssemblySolid,
  b: MechanicalSolid,
): [number, number, number] {
  const amin = [
    a.x - a.width / 2,
    a.y - a.depth / 2,
    a.z - a.height / 2,
  ] as const;
  const amax = [
    a.x + a.width / 2,
    a.y + a.depth / 2,
    a.z + a.height / 2,
  ] as const;
  return [
    Math.min(amax[0], b.max[0]) - Math.max(amin[0], b.min[0]),
    Math.min(amax[1], b.max[1]) - Math.max(amin[1], b.min[1]),
    Math.min(amax[2], b.max[2]) - Math.max(amin[2], b.min[2]),
  ];
}

export function checkPcbAssembly(
  doc: PcbStudioDocument,
  mechanical: MechanicalSolid[] = [enclosureLid(doc)],
): PcbAssemblyReport {
  const solids = pcbAssemblySolids(doc);
  const collisions: PcbCollision[] = [];
  for (const solid of solids) {
    if (solid.kind !== "component") continue;
    for (const part of mechanical) {
      const overlap = aabbOverlapMM(solid, part);
      if (overlap[0] > 0 && overlap[1] > 0 && overlap[2] > 0) {
        collisions.push({
          componentId: solid.id,
          mechanicalId: part.id,
          depthMM: Math.min(...overlap),
          msg: `${solid.id} collides with ${part.label} by ${Math.min(
            ...overlap,
          ).toFixed(2)} mm`,
        });
      }
    }
  }
  const components = solids.filter((solid) => solid.kind === "component");
  const maxComponentHeightMM = components.reduce(
    (max, solid) => Math.max(max, solid.height + (solid.z - solid.height / 2)),
    doc.board.thicknessMM,
  );
  return {
    solids,
    mechanical,
    collisions,
    pass: collisions.length === 0,
    boardTopZ: doc.board.thicknessMM,
    maxComponentHeightMM,
    componentCount: components.length,
  };
}

/** Component transforms for an external assembly / scene importer. */
export function pcbAssemblyTransforms(doc: PcbStudioDocument): Array<{
  id: string;
  position: [number, number, number];
  rotationDeg: number;
  size: [number, number, number];
}> {
  return pcbAssemblySolids(doc).map((solid) => ({
    id: solid.id,
    position: [solid.x, solid.y, solid.z],
    rotationDeg: solid.rotationDeg,
    size: [solid.width, solid.depth, solid.height],
  }));
}
