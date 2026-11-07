// src/project/index.ts — public surface for the project/suit model.
//
//   import { getOrCreateActiveProject, resolveSettings } from "../project";
//
// The model (shape, defaults, share links, settings merge) is pure + tested.
// The store (localStorage persistence, migration, active project) is the I/O
// seam — the only place that touches `localStorage` / will later touch a cloud.
export * from "./model";
export * from "./store";
export * from "./suitPanel";
export * from "./session";
export * from "./sessionBus";
export {
  startSession,
  stopSession,
  setSurface,
  publishSelection,
  remoteSelections,
  announceDocSaved,
  onRemoteDoc,
  getSessionSnapshot,
  getRole,
  canEditSession,
  setPeerRole,
} from "./sessionRuntime";
export type { SessionSnapshot, RemoteSelection } from "./sessionRuntime";
