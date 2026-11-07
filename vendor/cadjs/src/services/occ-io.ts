/** STL & STEP read & write. */
import type { OpenCascadeInstance, TopoDS_Shape } from "opencascade.js";
import { fixShape, tessellate, withProgressRange } from "./occ-facade";
import { TESSELLATE_LINEAR, TESSELLATE_ANGULAR } from "../tolerances";

export function readSTLHelper(
  oc: OpenCascadeInstance,
  fileBytes: Uint8Array,
): TopoDS_Shape {
  const filePath = "/tmp/import.stl";
  oc.FS.writeFile(filePath, fileBytes);
  const reader = new oc.StlAPI_Reader();
  const shape = new oc.TopoDS_Shape();
  const success = reader.Read(shape, filePath);
  if (!success) {
    reader.delete();
    shape.delete();
    oc.FS.unlink(filePath);
    throw new Error("STL import failed");
  }
  reader.delete();
  oc.FS.unlink(filePath);
  return shape;
}

export function writeSTLHelper(
  oc: OpenCascadeInstance,
  compound: TopoDS_Shape,
): Uint8Array {
  const filePath = "/tmp/export.stl";
  tessellate(oc, compound, TESSELLATE_LINEAR, TESSELLATE_ANGULAR);
  const writer = new oc.StlAPI_Writer();
  const fileData = withProgressRange(oc, (pr) => {
    const success = writer.Write(compound, filePath, pr);
    if (!success) {
      writer.delete();
      throw new Error("STL export failed");
    }
    return oc.FS.readFile(filePath);
  });
  oc.FS.unlink(filePath);
  writer.delete();
  return new Uint8Array(fileData);
}

// ── STEP ────────────────────────────────────────────────────────────────────
// Process-global STEP defaults (units, schema). Set once per worker via
// `configureStepDefaults`; calling per-op would race if any future code
// dispatches concurrent STEP I/O against the same WASM heap.

let stepDefaultsConfigured = false;

/**
 * Configure STEP unit / schema defaults on the current OCC instance. Idempotent
 * within a single worker, guards against re-set, but `Interface_Static` is
 * process-global so settings persist across reader/writer instances anyway.
 */
export function configureStepDefaults(oc: OpenCascadeInstance): void {
  if (stepDefaultsConfigured) return;
  oc.Interface_Static.SetCVal("xstep.cascade.unit", "MM");
  oc.Interface_Static.SetCVal("write.step.unit", "MM");
  oc.Interface_Static.SetCVal("write.step.schema", "AP214CD");
  stepDefaultsConfigured = true;
}

/**
 * Read a STEP file. Always allocates a fresh `STEPControl_Reader_1`, reuse
 * across imports has been reported to segfault. The result is run through
 * `ShapeFix_Shape` because third-party STEP files commonly carry tolerance
 * and orientation drift that breaks downstream BOPs.
 */
export function readSTEPHelper(
  oc: OpenCascadeInstance,
  fileBytes: Uint8Array,
): TopoDS_Shape {
  const filePath = "/tmp/import.step";
  oc.FS.writeFile(filePath, fileBytes);
  const reader = new oc.STEPControl_Reader_1();
  try {
    const readStatus = reader.ReadFile(filePath);
    if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(
        `STEP read failed: ReadFile status ${String(readStatus)}`,
      );
    }
    const nbRoots = withProgressRange(oc, (pr) => reader.TransferRoots(pr));
    if (nbRoots <= 0) {
      throw new Error("STEP read produced no roots");
    }
    const rawShape = reader.OneShape();
    const fixed = fixShape(oc, rawShape);
    rawShape.delete();
    return fixed;
  } finally {
    reader.delete();
    oc.FS.unlink(filePath);
  }
}

/**
 * Write one or more shapes to a STEP file. Each shape becomes its own STEP
 * root via a separate `Transfer` call, so downstream tools (Fusion, FreeCAD)
 * see them as distinct bodies in the assembly tree. `STEPControl_AsIs` lets
 * OCC pick the best per-shape encoding (solids → manifold_solid_brep,
 * shells → shell_based_surface_model, …), do *not* hard-code
 * `STEPControl_ManifoldSolidBrep` here, it silently drops faces and wires.
 */
export function writeSTEPHelper(
  oc: OpenCascadeInstance,
  shapes: TopoDS_Shape[],
): Uint8Array {
  if (shapes.length === 0) {
    throw new Error("STEP export: no shapes to write");
  }
  const filePath = "/tmp/export.step";
  const writer = new oc.STEPControl_Writer_1();
  try {
    const mode = oc.STEPControl_StepModelType
      .STEPControl_AsIs as typeof oc.STEPControl_StepModelType;
    for (const shape of shapes) {
      const transferStatus = withProgressRange(oc, (pr) =>
        writer.Transfer(shape, mode, true, pr),
      );
      if (transferStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        throw new Error(
          `STEP export failed: Transfer status ${String(transferStatus)}`,
        );
      }
    }
    const writeStatus = writer.Write(filePath);
    if (writeStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(
        `STEP export failed: Write status ${String(writeStatus)}`,
      );
    }
    const fileData = oc.FS.readFile(filePath);
    return new Uint8Array(fileData);
  } finally {
    writer.delete();
    try {
      oc.FS.unlink(filePath);
    } catch {
      /* file may not exist if Write failed */
    }
  }
}
