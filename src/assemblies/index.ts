// Assembly subsystem skeleton (Phase 5) — additive, no core changes.
export * from "./model";
export * from "./geometry";
export * from "./placement";
export const ASSEMBLY_ACTIONS = [
  "assembly.insert",
  "assembly.addMate",
  "assembly.solve",
] as const;
