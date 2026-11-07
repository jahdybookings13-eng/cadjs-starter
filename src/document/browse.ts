// src/document/browse.ts — pure list/search/sort rules for the Documents page.

import type { CadDocument, DocumentTabKind } from "./model";

export type DocumentSort = "updated" | "name" | "created";
export type DocumentKindFilter = "all" | DocumentTabKind;
export type DocumentScope = "all" | "recent" | "trash";

export interface DocumentBrowseOptions {
  query?: string;
  sort?: DocumentSort;
  kind?: DocumentKindFilter;
  scope?: DocumentScope;
  now?: number;
}

const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

export function browseDocuments(
  docs: readonly CadDocument[],
  opts: DocumentBrowseOptions = {},
): CadDocument[] {
  const query = opts.query?.trim().toLowerCase() ?? "";
  const kind = opts.kind ?? "all";
  const scope = opts.scope ?? "all";
  const now = opts.now ?? Date.now();

  return docs
    .filter((doc) => {
      if (scope === "trash") return Boolean(doc.trashedAt);
      if (doc.trashedAt) return false;
      if (scope === "recent" && now - doc.updatedAt > RECENT_MS) return false;
      if (query && !doc.name.toLowerCase().includes(query)) return false;
      if (kind !== "all" && !doc.tabs.some((tab) => tab.kind === kind))
        return false;
      return true;
    })
    .sort((a, b) => {
      switch (opts.sort ?? "updated") {
        case "name":
          return a.name.localeCompare(b.name);
        case "created": {
          const ac = a.tabs.reduce(
            (min, tab) => Math.min(min, tab.createdAt),
            Number.POSITIVE_INFINITY,
          );
          const bc = b.tabs.reduce(
            (min, tab) => Math.min(min, tab.createdAt),
            Number.POSITIVE_INFINITY,
          );
          return bc - ac;
        }
        case "updated":
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
}

export function documentKindLabel(doc: CadDocument): string {
  const kinds = new Set(doc.tabs.map((tab) => tab.kind));
  if (kinds.size === 1) {
    const kind = [...kinds][0]!;
    return kind === "partstudio"
      ? "Part Studio"
      : kind === "variablestudio"
        ? "Variable Studio"
        : kind === "featurestudio"
          ? "Feature Studio"
          : kind.charAt(0).toUpperCase() + kind.slice(1);
  }
  return "Mixed";
}
