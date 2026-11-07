import * as THREE from "three";
import { CompoundBrep } from "../../src/geometry";
import { extrudeBRep } from "../../src/scene-operations/resize-operations";
import { filletBRep } from "../../src/scene-operations/fillet-operations";
import { isElement3D } from "../../src/scene-operations/types";
import { WorkflowState } from "../helpers/workflowState";
import {
  buildBoxSolid,
  buildRectProfile,
  buildAnalyticCircleProfile,
} from "../helpers/profileBuilders";

describe("scene workflows", () => {
  describe("element CRUD", () => {
    it("addElement assigns sequential nodeIds and registers into objectsMap", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(2, 2, 2);
      const b = await buildBoxSolid(2, 2, 2);
      const idA = ws.addElement(a.brep, new THREE.Vector3(-2, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));

      expect(ws.elements.length).toBe(2);
      expect(idA).toBe("node_1");
      expect(idB).toBe("node_2");
      expect(ws.objectsMap.has(idA)).toBe(true);
      expect(ws.objectsMap.has(idB)).toBe(true);
      expect(ws.idCounter).toBe(2);
    });

    it("removeElement drops the element from elements + selection + objectsMap", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(2, 2, 2);
      const id = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      ws.selectElement(id);
      expect(ws.selectedElements).toContain(id);

      ws.removeElement(id);

      expect(ws.elements.length).toBe(0);
      expect(ws.selectedElements).not.toContain(id);
      expect(ws.objectsMap.has(id)).toBe(false);
    });

    it("updateElementPosition updates element + Three.js object position together", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(2, 2, 2);
      const id = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));

      ws.updateElementPosition(id, new THREE.Vector3(5, 0, 0));

      expect(ws.getElement(id)!.position.x).toBe(5);
      expect(ws.objectsMap.get(id)!.position.x).toBe(5);
    });
  });

  describe("boolean operations", () => {
    it("union of two overlapping cubes produces a single CompoundBrep with 2 children", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(4, 4, 4);
      const b = await buildBoxSolid(4, 4, 4);
      const idA = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));
      ws.elements = ws.elements.map((el, i) =>
        i === 0 ? { ...el, occBrep: a.occBrep } : { ...el, occBrep: b.occBrep },
      );
      ws.selectElement(idA);
      ws.selectElement(idB);

      const ok = await ws.union();

      expect(ok).toBe(true);
      expect(ws.elements.length).toBe(1);
      const result = ws.elements[0];
      expect(result.brep).toBeInstanceOf(CompoundBrep);
      expect((result.brep as CompoundBrep).children.length).toBe(2);
      expect(result.occBrep).toBeDefined();
      expect(isElement3D(result)).toBe(true);
    });

    it("difference of two overlapping cubes produces a single result element", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(4, 4, 4);
      const b = await buildBoxSolid(2, 2, 2);
      const idA = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));
      ws.elements = ws.elements.map((el, i) =>
        i === 0 ? { ...el, occBrep: a.occBrep } : { ...el, occBrep: b.occBrep },
      );
      ws.selectElement(idA);
      ws.selectElement(idB);

      const ok = await ws.difference();

      expect(ok).toBe(true);
      expect(ws.elements.length).toBe(1);
    });

    it("intersection of two overlapping cubes produces a smaller solid", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(4, 4, 4);
      const b = await buildBoxSolid(4, 4, 4);
      const idA = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));
      ws.elements = ws.elements.map((el, i) =>
        i === 0 ? { ...el, occBrep: a.occBrep } : { ...el, occBrep: b.occBrep },
      );
      ws.selectElement(idA);
      ws.selectElement(idB);

      const ok = await ws.intersection();

      expect(ok).toBe(true);
      expect(ws.elements.length).toBe(1);
      const result = ws.elements[0];
      const xs = result.brep.vertices.map((v) => v.x);
      const xRange = Math.max(...xs) - Math.min(...xs);
      // Intersection of two 4-wide cubes offset by 2 on x is 2 wide on x
      expect(xRange).toBeLessThan(4);
    });

    it("union with keepTools option preserves the original tool elements", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(4, 4, 4);
      const b = await buildBoxSolid(4, 4, 4);
      const idA = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));
      ws.elements = ws.elements.map((el, i) =>
        i === 0 ? { ...el, occBrep: a.occBrep } : { ...el, occBrep: b.occBrep },
      );

      const ok = await ws.difference({
        targetId: idA,
        toolIds: [idB],
        keepTools: true,
      });

      expect(ok).toBe(true);
      // target was replaced by result; tool was kept
      expect(ws.elements.find((el) => el.nodeId === idB)).toBeDefined();
    });
  });

  describe("operation chains", () => {
    it("extrude rect profile -> fillet edge produces a solid with extra faces from the fillet", async () => {
      const profile = await buildRectProfile(4, 4);
      const extruded = await extrudeBRep(
        profile.brep,
        4,
        1,
        { x: 0, y: 0, z: 1 },
        profile.occBrep,
      );
      if (!extruded.ok) throw new Error(`extrude failed: ${extruded.reason}`);
      expect(extruded.value.occBrep).toBeDefined();

      // Apply a small fillet to one edge of the extruded box
      const filleted = await filletBRep(
        extruded.value.brep,
        new THREE.Vector3(0, 0, 0),
        [1],
        0.5,
        extruded.value.occBrep,
      );
      if (!filleted.ok) throw new Error(`fillet failed: ${filleted.reason}`);

      // Filleting adds rounded geometry → result must have more faces than the base box
      expect(filleted.value.brep.faces.length).toBeGreaterThan(
        extruded.value.brep.faces.length,
      );
      expect(filleted.value.edgeGeometry).toBeDefined();
    });

    it("extrude analytic circle profile produces a cylinder result with occBrep", async () => {
      const profile = await buildAnalyticCircleProfile(3);
      const extruded = await extrudeBRep(
        profile.brep,
        6,
        1,
        { x: 0, y: 0, z: 1 },
        profile.occBrep,
      );

      if (!extruded.ok) throw new Error(`extrude failed: ${extruded.reason}`);
      expect(extruded.value.occBrep).toBeDefined();
      expect(extruded.value.brep.vertices.length).toBeGreaterThan(0);
      expect(extruded.value.brep.faces.length).toBeGreaterThan(0);
      // positionOffset Z should reflect symmetric extrusion — center of [0, 6] is 3
      expect(extruded.value.positionOffset.z).toBeCloseTo(3, 1);
    });
  });

  describe("selection invariants", () => {
    it("selecting then deselecting an element clears the selection", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(2, 2, 2);
      const id = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));

      ws.selectElement(id);
      expect(ws.selectedElements).toContain(id);

      ws.deselectElement(id);
      expect(ws.selectedElements).not.toContain(id);
    });

    it("selectedElements drains after a successful union (compound result is unselected)", async () => {
      const ws = new WorkflowState();
      const a = await buildBoxSolid(4, 4, 4);
      const b = await buildBoxSolid(4, 4, 4);
      const idA = ws.addElement(a.brep, new THREE.Vector3(0, 0, 0));
      const idB = ws.addElement(b.brep, new THREE.Vector3(2, 0, 0));
      ws.elements = ws.elements.map((el, i) =>
        i === 0 ? { ...el, occBrep: a.occBrep } : { ...el, occBrep: b.occBrep },
      );
      ws.selectElement(idA);
      ws.selectElement(idB);

      await ws.union();

      expect(ws.selectedElements.length).toBe(0);
    });
  });
});
