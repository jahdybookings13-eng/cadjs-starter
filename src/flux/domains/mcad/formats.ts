// flux/domains/mcad/formats.ts — format matrix adapters.
//
// RE evidence: upload/export matrix = step, stpz, iges, igs, brep, gltf, glb,
// scad, build123d, smlibpy, fabricator, cadquery, stl, obj, 3mf, kicad_mod,
// dxf, csv, json, curvature. OpenSCAD/CadQuery/build123d are first-class
// interchange. One adapter interface; heavy exporters delegate to the
// existing ImportExportService (STL/STEP already wired) so we don't duplicate
// kernel paths.

export type CadFormat =
  | "step"
  | "stpz"
  | "iges"
  | "igs"
  | "brep"
  | "gltf"
  | "glb"
  | "scad"
  | "build123d"
  | "smlibpy"
  | "fabricator"
  | "cadquery"
  | "stl"
  | "obj"
  | "3mf"
  | "kicad_mod"
  | "dxf"
  | "csv"
  | "json"
  | "curvature";

export interface FormatInfo {
  ext: string;
  mime: string;
  class: "mesh3d" | "cadcode" | "drawing2d" | "data";
  native: boolean;
}

export const FORMAT_MATRIX: Record<CadFormat, FormatInfo> = {
  step: { ext: "step", mime: "model/step", class: "mesh3d", native: true },
  stpz: { ext: "step", mime: "model/step", class: "mesh3d", native: true },
  iges: {
    ext: "iges",
    mime: "application/iges",
    class: "mesh3d",
    native: false,
  },
  igs: { ext: "igs", mime: "application/iges", class: "mesh3d", native: false },
  brep: {
    ext: "brep",
    mime: "application/octet-stream",
    class: "mesh3d",
    native: false,
  },
  gltf: { ext: "gltf", mime: "model/gltf", class: "mesh3d", native: false },
  glb: {
    ext: "glb",
    mime: "model/gltf-binary",
    class: "mesh3d",
    native: false,
  },
  scad: { ext: "scad", mime: "text/plain", class: "cadcode", native: false },
  build123d: {
    ext: "py",
    mime: "text/x-python",
    class: "cadcode",
    native: false,
  },
  smlibpy: {
    ext: "py",
    mime: "text/x-python",
    class: "cadcode",
    native: false,
  },
  fabricator: {
    ext: "fab",
    mime: "application/json",
    class: "cadcode",
    native: false,
  },
  cadquery: {
    ext: "py",
    mime: "text/x-python",
    class: "cadcode",
    native: false,
  },
  stl: { ext: "stl", mime: "model/stl", class: "mesh3d", native: true },
  obj: { ext: "obj", mime: "model/obj", class: "mesh3d", native: false },
  "3mf": { ext: "3mf", mime: "model/3mf", class: "mesh3d", native: false },
  kicad_mod: {
    ext: "kicad_mod",
    mime: "application/octet-stream",
    class: "cadcode",
    native: false,
  },
  dxf: {
    ext: "dxf",
    mime: "application/dxf",
    class: "drawing2d",
    native: true,
  },
  csv: { ext: "csv", mime: "text/csv", class: "data", native: false },
  json: { ext: "json", mime: "application/json", class: "data", native: false },
  curvature: {
    ext: "curv",
    mime: "application/octet-stream",
    class: "data",
    native: false,
  },
};

export function isNativeFormat(f: CadFormat): boolean {
  return FORMAT_MATRIX[f].native;
}
export function extOf(f: CadFormat): string {
  return FORMAT_MATRIX[f].ext;
}
