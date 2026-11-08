// Local toolpath simulation checks. This is deliberately a geometry/feed check,
// not a rendered material-removal animation: it verifies rapid safety, bounds,
// gouges against the height-map surface, linking and remaining stock coverage.

import {
  CamError,
  camToolById,
  stockBounds,
  type Box3,
  type CamDocument,
  type CamSurface,
  type CamTool,
} from "./model";
import type { CamToolpathResult } from "./toolpath";

export interface CamSimulationIssue {
  code:
    | "SIM_RAPID_COLLISION"
    | "SIM_GOUGE"
    | "SIM_OUT_OF_BOUNDS"
    | "SIM_MISSING_LINK"
    | "SIM_MISSING_TOOL";
  path: string;
  message: string;
}

export interface CamSimulationResult {
  issues: CamSimulationIssue[];
  collisions: number;
  gouges: number;
  outOfBounds: number;
  missingLinks: number;
  /** Approximate material left after the cut moves, from a stock XY grid. */
  remainingPercent: number;
  checkedMoves: number;
}

export interface CamSimulationOptions {
  signal?: AbortSignal | undefined;
  shouldCancel?: (() => boolean) | undefined;
}

const EPS = 1e-6;

function surfaceDepthAt(surface: CamSurface, x: number, y: number): number {
  const gx = Math.max(
    0,
    Math.min(
      surface.cols - 1,
      Math.round((x - surface.origin.x) / surface.cell),
    ),
  );
  const gy = Math.max(
    0,
    Math.min(
      surface.rows - 1,
      Math.round((y - surface.origin.y) / surface.cell),
    ),
  );
  return surface.heights[gy * surface.cols + gx] ?? 0;
}

function safeZ(stock: Box3, tool: CamTool): number {
  return stock.max.z + tool.safeZ;
}

function cancelIfNeeded(options: CamSimulationOptions): void {
  if (options.signal?.aborted || options.shouldCancel?.()) {
    throw new CamError("CAM_CANCELLED", "Toolpath simulation cancelled.");
  }
}

function coverageGrid(
  stock: Box3,
  result: CamToolpathResult,
  toolFor: (id: string) => CamTool | null,
): number {
  const cells = 24;
  const cut = new Uint8Array(cells * cells);
  for (const path of result.paths) {
    const tool = toolFor(path.toolId);
    if (!tool) continue;
    const radius = tool.diameter / 2;
    for (const move of path.moves) {
      if (move.kind !== "cut") continue;
      const x = Math.floor(
        ((move.x - stock.min.x) / (stock.max.x - stock.min.x)) * cells,
      );
      const y = Math.floor(
        ((move.y - stock.min.y) / (stock.max.y - stock.min.y)) * cells,
      );
      const r = Math.max(
        0,
        Math.ceil((radius / (stock.max.x - stock.min.x)) * cells),
      );
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ix = x + dx;
          const iy = y + dy;
          if (ix < 0 || iy < 0 || ix >= cells || iy >= cells) continue;
          if (dx * dx + dy * dy <= r * r) cut[iy * cells + ix] = 1;
        }
      }
    }
  }
  let covered = 0;
  for (const value of cut) covered += value;
  return Math.round(((cells * cells - covered) / (cells * cells)) * 1000) / 10;
}

export function simulateToolpaths(
  document: CamDocument,
  result: CamToolpathResult,
  options: CamSimulationOptions = {},
): CamSimulationResult {
  const stock = stockBounds(document.stock);
  const issues: CamSimulationIssue[] = [];
  let collisions = 0;
  let gouges = 0;
  let outOfBounds = 0;
  let missingLinks = 0;
  let checkedMoves = 0;
  let previousPathEnd: { z: number; label: string } | null = null;

  for (const path of result.paths) {
    cancelIfNeeded(options);
    const tool = camToolById(document, path.toolId);
    if (!tool) {
      issues.push({
        code: "SIM_MISSING_TOOL",
        path: path.operationId,
        message: `Operation "${path.operationName}" has no tool to simulate.`,
      });
      continue;
    }
    const retract = safeZ(stock, tool);
    if (previousPathEnd && previousPathEnd.z < retract - EPS) {
      missingLinks += 1;
      issues.push({
        code: "SIM_MISSING_LINK",
        path: path.operationId,
        message: `Operation "${path.operationName}" starts without a safe link from "${previousPathEnd.label}".`,
      });
    }
    for (const [index, move] of path.moves.entries()) {
      cancelIfNeeded(options);
      checkedMoves += 1;
      const inBounds =
        move.x >= stock.min.x - EPS &&
        move.x <= stock.max.x + EPS &&
        move.y >= stock.min.y - EPS &&
        move.y <= stock.max.y + EPS;
      if (!inBounds) {
        outOfBounds += 1;
        issues.push({
          code: "SIM_OUT_OF_BOUNDS",
          path: `${path.operationId}.moves.${index}`,
          message: `Move ${index} is outside the stock XY bounds.`,
        });
      }
      if (move.kind === "rapid" && move.z < retract - EPS) {
        collisions += 1;
        issues.push({
          code: "SIM_RAPID_COLLISION",
          path: `${path.operationId}.moves.${index}`,
          message: `Rapid move ${index} is below safe Z (${move.z.toFixed(3)} < ${retract.toFixed(3)}).`,
        });
      }
      if (move.kind === "cut") {
        const radius = tool.kind === "ballmill" ? tool.diameter / 2 : 0;
        const bottom = move.z - radius;
        const operation = document.operations.find(
          (candidate) => candidate.id === path.operationId,
        );
        const is3d =
          operation?.kind === "adaptive" ||
          operation?.kind === "parallel" ||
          operation?.kind === "pencil" ||
          operation?.kind === "rest";
        const surface = is3d ? document.surface : undefined;
        const allowed = surface
          ? stock.max.z - surfaceDepthAt(surface, move.x, move.y)
          : stock.min.z;
        if (bottom < allowed - EPS) {
          gouges += 1;
          issues.push({
            code: "SIM_GOUGE",
            path: `${path.operationId}.moves.${index}`,
            message: `Cut move ${index} is below the part surface by ${(allowed - bottom).toFixed(3)}.`,
          });
        }
        if (move.z < stock.min.z - EPS || move.z > stock.max.z + EPS) {
          outOfBounds += 1;
          issues.push({
            code: "SIM_OUT_OF_BOUNDS",
            path: `${path.operationId}.moves.${index}`,
            message: `Cut move ${index} is outside the stock Z bounds.`,
          });
        }
      }
    }
    const last = path.moves[path.moves.length - 1];
    previousPathEnd = last
      ? { z: last.z, label: path.operationName }
      : previousPathEnd;
  }

  return {
    issues,
    collisions,
    gouges,
    outOfBounds,
    missingLinks,
    remainingPercent: coverageGrid(stock, result, (id) =>
      camToolById(document, id),
    ),
    checkedMoves,
  };
}

export function assertSimulationClean(simulation: CamSimulationResult): void {
  if (simulation.issues.length > 0) {
    throw new CamError(
      "CAM_SIMULATION",
      simulation.issues.map((issue) => issue.message).join("; "),
    );
  }
}
