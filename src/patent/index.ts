// ScadGen patent-drawing adapter.
//
// Wraps external tools (Claude-Patent-Creator MCP, PatentFig API, drawing-agent)
// and enforces USPTO MPEP 608.02 / 37 CFR 1.84 compliance rules client-side.
// Actions registered separately via ActionBus.

import { callService } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeometryView {
  /** Path or URL to the rendered view (SVG / DXF / PNG). */
  path: string;
  /** Cameral angle label, e.g. "front", "isometric". */
  viewName: string;
}

export interface PatentFigureRequest {
  geometryViews: GeometryView[];
  figureLabel: string; // e.g. "FIG. 1"
  claimsText?: string;
}

export interface ComplianceIssue {
  rule: string;
  severity: "error" | "warning";
  message: string;
  figureIndex?: number;
}

export interface PatentFigureResult {
  sheetPath: string; // exported PDF/TIFF
  compliant: boolean;
  issues: ComplianceIssue[];
}

// ---------------------------------------------------------------------------
// USPTO / 37 CFR 1.84 rule constants
// ---------------------------------------------------------------------------

export const RULES = {
  BLACK_LINES_ONLY: "37 CFR 1.84(b) - black lines only, no shading or color",
  MARGIN_BOTTOM: "37 CFR 1.84(h) - minimum bottom margin 1.25 in (3.17 cm)",
  MARGIN_RIGHT: "37 CFR 1.84(h) - minimum right margin 0.75 in (1.91 cm)",
  MARGIN_TOP: "37 CFR 1.84(h) - minimum top margin 0.75 in (1.91 cm)",
  MARGIN_LEFT: "37 CFR 1.84(h) - minimum left margin 1.0 in (2.54 cm)",
  FIGURE_NUMBER:
    "37 CFR 1.84(i) - each figure must be numbered (FIG. 1, FIG. 2, …)",
  REFERENCE_NUMERAL:
    "37 CFR 1.152 - reference numerals must identify all parts",
  CONSISTENCY:
    "MPEP 608.02 - same reference numeral used consistently across views",
  NO_PHOTO: "37 CFR 1.84(c) - photography restricted; line drawings preferred",
  SHEET_SIZE: "37 CFR 1.85(g) - drawing sheet must be letter (8.5×11 in) or A4",
} as const;

// ---------------------------------------------------------------------------
// Client-side compliance check (no network round-trip required)
// ---------------------------------------------------------------------------

/**
 * Validates a set of geometry views against USPTO drawing rules.
 * This is a heuristic pre-flight check; the final authority is the
 * patent-office examiner.
 */
export function checkComplianceLocal(
  req: PatentFigureRequest,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  if (req.geometryViews.length === 0) {
    issues.push({
      rule: RULES.REFERENCE_NUMERAL,
      severity: "error",
      message: "No geometry views supplied; at least one figure is required.",
    });
    return issues;
  }

  const label = req.figureLabel.trim().toUpperCase();
  if (!/^FIG\.\s*\d+/.test(label)) {
    issues.push({
      rule: RULES.FIGURE_NUMBER,
      severity: "error",
      message: `Figure label "${req.figureLabel}" does not match required form "FIG. N".`,
    });
  }

  // Heuristic: each view path should reference a line-drawing format, not a photo.
  const PHOTO_EXTS = /\.(jpe?g|png|tiff?|bmp|heic)$/i;
  req.geometryViews.forEach((v, i) => {
    if (PHOTO_EXTS.test(v.path)) {
      issues.push({
        rule: RULES.NO_PHOTO,
        severity: "warning",
        message: `View "${v.viewName}" references a raster image (${v.path}). Line drawings (SVG/DXF) are preferred.`,
        figureIndex: i,
      });
    }
  });

  // Reference numeral consistency: looks for the same entity label reused
  // across multiple views (heuristic via the claims text if present).
  const claims = req.claimsText;
  if (claims) {
    const numeralRe = /\b(\d{1,4})\b/g;
    const seen = new Set<string>();
    for (const m of claims.matchAll(numeralRe)) {
      const n = m[1];
      if (n) seen.add(n);
    }
    // We cannot fully enforce consistency across multiple figures from one
    // request, so just flag if claims text is entirely missing numerals.
    if (seen.size === 0) {
      issues.push({
        rule: RULES.REFERENCE_NUMERAL,
        severity: "warning",
        message:
          "Claims text contains no reference numerals. Each part should be identified by a numeral.",
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Remote calls (delegated to the patent service on :8790)
// ---------------------------------------------------------------------------

export async function generateFigure(
  req: PatentFigureRequest,
): Promise<PatentFigureResult> {
  try {
    const issues = checkComplianceLocal(req);
    const r = await callService<{
      sheetPath?: string;
      issues?: ComplianceIssue[];
    }>("/figure", req);
    return {
      sheetPath: r.sheetPath ?? "",
      compliant: issues.filter((i) => i.severity === "error").length === 0,
      issues: issues.concat(r.issues ?? ([] as ComplianceIssue[])),
    };
  } catch (e) {
    return {
      sheetPath: "",
      compliant: false,
      issues: [{ rule: "NETWORK", severity: "error", message: String(e) }],
    };
  }
}

export async function checkCompliance(
  req: PatentFigureRequest,
): Promise<ComplianceIssue[]> {
  try {
    const local = checkComplianceLocal(req);
    const remote = await callService<{ issues?: ComplianceIssue[] }>(
      "/compliance",
      req,
    );
    const remoteIssues = (remote.issues ?? []) as ComplianceIssue[];
    return local.concat(remoteIssues);
  } catch {
    return checkComplianceLocal(req);
  }
}

export async function exportSheet(
  req: PatentFigureRequest,
): Promise<{ sheetPath: string }> {
  const r = await callService<{ sheetPath?: string }>("/exportSheet", req);
  return { sheetPath: r.sheetPath ?? "" };
}

// ---------------------------------------------------------------------------
// ActionBus actions
// ---------------------------------------------------------------------------

export const PATENT_ACTIONS = [
  "patent.generateFigure",
  "patent.checkCompliance",
  "patent.exportSheet",
] as const;
export type PatentAction = (typeof PATENT_ACTIONS)[number];
