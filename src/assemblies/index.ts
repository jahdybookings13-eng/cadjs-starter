// Assembly subsystem (Phase 4) — model, solver, document payload and BOM.
export * from "./model";
export * from "./geometry";
export * from "./placement";
export * from "./connectors";
export * from "./interference";
export * from "./document";
export * from "./bom";
export * from "./standardContent";
export * from "./performance";
export * from "./render";
export const ASSEMBLY_ACTIONS = [
  "assembly.insert",
  "assembly.addMate",
  "assembly.solve",
] as const;
