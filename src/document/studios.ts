// Studio tab availability is explicit. A tab kind may exist in the document
// schema before its workspace is implemented; the create menu then shows the
// reason instead of opening an empty shell.

import type { DocumentTabKind } from "./model";

export const STUDIO_TAB_KINDS: readonly DocumentTabKind[] = [
  "renderstudio",
  "simulationstudio",
  "camstudio",
  "pcbstudio",
];

// Every declared studio now has a workspace; keep the hook so a future studio
// can ship its schema before its editor and still explain itself in the menu.
export const TAB_KIND_DISABLED_REASON: Partial<
  Record<DocumentTabKind, string>
> = {};

export function tabKindDisabledReason(kind: DocumentTabKind): string | null {
  return TAB_KIND_DISABLED_REASON[kind] ?? null;
}

export function isStudioTabKind(kind: DocumentTabKind): boolean {
  return STUDIO_TAB_KINDS.includes(kind);
}
