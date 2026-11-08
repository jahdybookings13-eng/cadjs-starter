/** STL, STEP & IGES read & write. */
import type {
  OpenCascadeInstance,
  TDF_Label,
  TopoDS_Shape,
} from "opencascade.js";
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

export interface StepShapeMetadata {
  name?: string | undefined;
  color?: string | undefined;
}

function stepColor(hex: string | undefined): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
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
  metadata: readonly StepShapeMetadata[] = [],
): Uint8Array {
  if (shapes.length === 0) {
    throw new Error("STEP export: no shapes to write");
  }
  const hasMetadata = metadata.some(
    (entry) => entry.name?.trim() || stepColor(entry.color),
  );
  if (hasMetadata) return writeSTEPCAFHelper(oc, shapes, metadata);
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

function writeSTEPCAFHelper(
  oc: OpenCascadeInstance,
  shapes: TopoDS_Shape[],
  metadata: readonly StepShapeMetadata[],
): Uint8Array {
  const filePath = "/tmp/export.step";
  const doc = new oc.TDocStd_Document(
    new oc.TCollection_ExtendedString_2("MDTV-XCAF", true),
  );
  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const writer = new oc.STEPCAFControl_Writer_1();
  try {
    const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
    const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get();
    for (const [index, shape] of shapes.entries()) {
      const entry = metadata[index];
      const label = shapeTool.AddShape(shape, false, false);
      if (entry?.name?.trim()) {
        const name = oc.TDataStd_Name.Set_1(
          label,
          new oc.TCollection_ExtendedString_2(entry.name.trim(), true),
        );
        name.delete();
      }
      const rgb = stepColor(entry?.color);
      if (rgb) {
        const color = new oc.Quantity_Color_3(
          rgb[0],
          rgb[1],
          rgb[2],
          oc.Quantity_TypeOfColor.Quantity_TOC_sRGB as never,
        );
        colorTool.SetColor_2(
          label,
          color,
          oc.XCAFDoc_ColorType.XCAFDoc_ColorGen as never,
        );
        color.delete();
      }
    }
    writer.SetNameMode(true);
    writer.SetColorMode(true);
    const ok = withProgressRange(oc, (pr) =>
      writer.Perform_2(docHandle, filePath, pr),
    );
    if (!ok) throw new Error("STEP export failed: CAF Perform returned false");
    return new Uint8Array(oc.FS.readFile(filePath));
  } finally {
    writer.delete();
    docHandle.delete();
    try {
      oc.FS.unlink(filePath);
    } catch {
      /* file may not exist if Write failed */
    }
  }
}

export interface StepImportShape {
  shape: TopoDS_Shape;
  name?: string | undefined;
  color?: string | undefined;
}

function productNames(fileBytes: Uint8Array): string[] {
  const text = new TextDecoder().decode(fileBytes);
  return [...text.matchAll(/PRODUCT\('([^']+)'/g)]
    .map((match) => match[1]!.replace(/\\X2\\/g, "").trim())
    .filter((name) => name && name !== "OPEN CASCADE SHAPE MODEL");
}

/** Read a STEP document through CAF so product names and RGB colours survive. */
export function readSTEPCAFHelper(
  oc: OpenCascadeInstance,
  fileBytes: Uint8Array,
): StepImportShape[] {
  const filePath = "/tmp/import.step";
  oc.FS.writeFile(filePath, fileBytes);
  const reader = new oc.STEPCAFControl_Reader_1();
  const doc = new oc.TDocStd_Document(
    new oc.TCollection_ExtendedString_2("MDTV-XCAF", true),
  );
  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const labels = new oc.TDF_LabelSequence_1();
  try {
    reader.SetNameMode(true);
    reader.SetColorMode(true);
    const readStatus = reader.ReadFile(filePath);
    if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(
        `STEP read failed: ReadFile status ${String(readStatus)}`,
      );
    }
    if (!withProgressRange(oc, (pr) => reader.Transfer_1(docHandle, pr))) {
      throw new Error("STEP read failed: CAF transfer returned false");
    }
    const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main()).get();
    const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main()).get();
    shapeTool.GetFreeShapes(labels);
    const names = productNames(fileBytes);
    const textColors = [
      ...new TextDecoder()
        .decode(fileBytes)
        .matchAll(/COLOUR_RGB\([^,]*,\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g),
    ].map(
      (match) =>
        `#${match
          .slice(1, 4)
          .map((channel) =>
            Math.round(Number(channel) * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`,
    );
    const out: StepImportShape[] = [];
    for (let index = 1; index <= labels.Length(); index++) {
      const metadataIndex = labels.Length() - index;
      const label = labels.Value(index);
      const rawShape = oc.XCAFDoc_ShapeTool.GetShape_2(label);
      if (!rawShape || rawShape.IsNull()) continue;
      const fixed = fixShape(oc, rawShape);
      rawShape.delete();
      const color = new oc.Quantity_Color_3(
        0,
        0,
        0,
        oc.Quantity_TypeOfColor.Quantity_TOC_sRGB as never,
      );
      const hasColor =
        colorTool.GetColor_1(label, color) ||
        colorTool.GetColor_4(
          label,
          oc.XCAFDoc_ColorType.XCAFDoc_ColorGen as never,
          color,
        );
      const cafHex = hasColor
        ? `#${[color.Red(), color.Green(), color.Blue()]
            .map((channel) =>
              Math.round(channel * 255)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")}`
        : undefined;
      // CAF's free-shape labels and COLOUR_RGB records are both in reverse
      // product order in this OCC build; names are mapped separately above.
      const hex = textColors[index - 1] ?? cafHex;
      color.delete();
      const name = names[metadataIndex];
      out.push({
        shape: fixed,
        ...(name ? { name } : {}),
        ...(hex ? { color: hex } : {}),
      });
    }
    if (out.length === 0) {
      const fallback = reader.Reader().OneShape();
      if (!fallback.IsNull()) out.push({ shape: fixShape(oc, fallback) });
      fallback.delete();
    }
    if (out.length === 0) throw new Error("STEP read produced no roots");
    // CAF returns free shapes in reverse product order; expose product order.
    return out.reverse();
  } finally {
    labels.delete();
    docHandle.delete();
    reader.delete();
    try {
      oc.FS.unlink(filePath);
    } catch {
      /* file may not exist */
    }
  }
}

// ── IGES ────────────────────────────────────────────────────────────────────
// IGES is the second analytic interchange path. Read into one shape compound
// (the import handler decomposes roots), write each body as its own IGES
// entity. Units are millimetres, matching the document's native unit.

export function readIGESHelper(
  oc: OpenCascadeInstance,
  fileBytes: Uint8Array,
): TopoDS_Shape {
  const filePath = "/tmp/import.igs";
  oc.FS.writeFile(filePath, fileBytes);
  const reader = new oc.IGESControl_Reader_1();
  try {
    const readStatus = reader.ReadFile(filePath);
    if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(
        `IGES read failed: ReadFile status ${String(readStatus)}`,
      );
    }
    const nbRoots = withProgressRange(oc, (pr) => reader.TransferRoots(pr));
    if (nbRoots <= 0) {
      throw new Error("IGES read failed: produced no roots");
    }
    const rawShape = reader.OneShape();
    if (rawShape.IsNull()) {
      rawShape.delete();
      throw new Error("IGES read produced an empty shape");
    }
    const fixed = fixShape(oc, rawShape);
    rawShape.delete();
    return fixed;
  } finally {
    reader.delete();
    try {
      oc.FS.unlink(filePath);
    } catch {
      /* file may not exist when ReadFile failed */
    }
  }
}

export function writeIGESHelper(
  oc: OpenCascadeInstance,
  shapes: TopoDS_Shape[],
): Uint8Array {
  if (shapes.length === 0) {
    throw new Error("IGES export: no shapes to write");
  }
  const filePath = "/tmp/export.igs";
  // Mode 1 is BRep. Mode 0 writes one trimmed-surface root per face, which
  // would turn a single solid into six separate imported bodies.
  const writer = new oc.IGESControl_Writer_2("MM", 1);
  try {
    for (const shape of shapes) {
      const added = withProgressRange(oc, (pr) => writer.AddShape(shape, pr));
      if (!added) {
        throw new Error("IGES export failed: AddShape returned false");
      }
    }
    writer.ComputeModel();
    // `false` selects the standard ASCII IGES writer. Passing `true` asks
    // OCC for its internal FNES binary representation, which is not an IGES
    // file and cannot be read by other CAD tools.
    const success = writer.Write_2(filePath, false);
    if (!success) {
      throw new Error("IGES export failed: Write returned false");
    }
    return new Uint8Array(oc.FS.readFile(filePath));
  } finally {
    writer.delete();
    try {
      oc.FS.unlink(filePath);
    } catch {
      /* file may not exist if Write failed */
    }
  }
}
