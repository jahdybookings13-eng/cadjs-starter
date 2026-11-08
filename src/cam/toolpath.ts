// Pure 2.5D toolpath generation for the CAM Studio.
//
// The generator works on the stock box and a rectangular profile. It does not
// invent curved part geometry: face and drill use the stock/hole data,
// contour/pocket/chamfer use the operation's explicit profile.

import {
  CAM_MAX_MOVES,
  CAM_MAX_MOVES_PER_OPERATION,
  CAM_MAX_OPERATIONS,
  CamError,
  camToolById,
  stockBounds,
  type Box3,
  type CamDocument,
  type CamOperation,
  type CamSurface,
  type CamTool,
  type Vec3,
} from "./model";

export interface CamMove {
  kind: "rapid" | "cut";
  x: number;
  y: number;
  z: number;
  /** Optional feed override for this move, in document units/minute. */
  feed?: number;
}

export interface CamToolpath {
  operationId: string;
  operationName: string;
  toolId: string;
  moves: CamMove[];
  cutLength: number;
  rapidLength: number;
  estimatedMinutes: number;
}

export interface CamToolpathResult {
  paths: CamToolpath[];
  cutLength: number;
  rapidLength: number;
  estimatedMinutes: number;
}

function distance(a: CamMove, b: CamMove): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pushMove(
  moves: CamMove[],
  move: CamMove,
  length: { cut: number; rapid: number },
): void {
  if (moves.length >= CAM_MAX_MOVES_PER_OPERATION) {
    throw new CamError(
      "CAM_MOVE_LIMIT",
      `Toolpath exceeds the per-operation move limit of ${CAM_MAX_MOVES_PER_OPERATION.toLocaleString()}.`,
    );
  }
  const previous = moves[moves.length - 1];
  if (previous) {
    const d = distance(previous, move);
    if (move.kind === "rapid") length.rapid += d;
    else length.cut += d;
  }
  moves.push(move);
}

function checkOperationBudget(count: number): void {
  if (count > CAM_MAX_OPERATIONS) {
    throw new CamError(
      "CAM_OPERATION_LIMIT",
      `A CAM program may contain at most ${CAM_MAX_OPERATIONS} operations.`,
    );
  }
}

function zAt(stock: Box3, depth: number): number {
  return stock.max.z - depth;
}

function safeZ(stock: Box3, tool: CamTool): number {
  return stock.max.z + tool.safeZ;
}

function passDepths(operation: CamOperation): number[] {
  const depths: number[] = [];
  let depth = 0;
  while (depth < operation.depth - 1e-9) {
    depth = Math.min(operation.depth, depth + operation.stepdown);
    depths.push(depth);
  }
  return depths.length > 0 ? depths : [operation.depth];
}

function rectanglePass(
  moves: CamMove[],
  length: { cut: number; rapid: number },
  profile: CamOperation["profile"],
  z: number,
  retract: number,
  leadIn: number,
  leadOut: number,
  feed: number,
): void {
  const left = profile.x;
  const right = profile.x + profile.width;
  const bottom = profile.y;
  const top = profile.y + profile.height;
  const start = { x: left - leadIn, y: bottom - leadIn, z };
  pushMove(
    moves,
    { kind: "rapid", x: start.x, y: start.y, z: retract },
    length,
  );
  pushMove(moves, { kind: "cut", x: start.x, y: start.y, z, feed }, length);
  pushMove(moves, { kind: "cut", x: left, y: bottom, z, feed }, length);
  pushMove(moves, { kind: "cut", x: right, y: bottom, z, feed }, length);
  pushMove(moves, { kind: "cut", x: right, y: top, z, feed }, length);
  pushMove(moves, { kind: "cut", x: left, y: top, z, feed }, length);
  pushMove(moves, { kind: "cut", x: left, y: bottom, z, feed }, length);
  if (leadOut > 0) {
    pushMove(
      moves,
      { kind: "cut", x: left - leadOut, y: bottom - leadOut, z, feed },
      length,
    );
  }
}

function contourPath(
  stock: Box3,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const feed = tool.feed;
  const retract = safeZ(stock, tool);
  const depths = passDepths(operation);
  for (const [index, depth] of depths.entries()) {
    const z = zAt(stock, depth);
    const lastPass = index === depths.length - 1;
    const tabs =
      lastPass && operation.tabs && operation.tabs.count > 0
        ? operation.tabs
        : null;
    if (!tabs) {
      rectanglePass(
        moves,
        length,
        operation.profile,
        z,
        retract,
        operation.leadIn,
        operation.leadOut,
        feed,
      );
      continue;
    }
    // Final pass: leave `count` evenly spaced tabs. The tool lifts to the tab
    // height over each tab and resumes cutting after it, instead of cutting a
    // continuous profile.
    const profile = operation.profile;
    const left = profile.x;
    const right = profile.x + profile.width;
    const bottom = profile.y;
    const top = profile.y + profile.height;
    const perimeter = 2 * (profile.width + profile.height);
    const spacing = perimeter / tabs.count;
    const tabHeight = Math.max(0, tabs.height);
    pushMove(
      moves,
      {
        kind: "rapid",
        x: left - operation.leadIn,
        y: bottom - operation.leadIn,
        z: retract,
      },
      length,
    );
    pushMove(moves, { kind: "cut", x: left, y: bottom, z, feed }, length);
    let travelled = 0;
    const corners: Vec3[] = [
      { x: right, y: bottom, z },
      { x: right, y: top, z },
      { x: left, y: top, z },
      { x: left, y: bottom, z },
    ];
    let previous = { x: left, y: bottom, z };
    for (const corner of corners) {
      const segment = Math.hypot(corner.x - previous.x, corner.y - previous.y);
      const steps = Math.max(1, Math.ceil(segment / 2));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const x = previous.x + (corner.x - previous.x) * t;
        const y = previous.y + (corner.y - previous.y) * t;
        const along = travelled + segment * t;
        const inTab = spacing > 0 && along % spacing < tabs.width;
        const move: CamMove = {
          kind: "cut",
          x,
          y,
          z: inTab ? z + tabHeight : z,
          feed,
        };
        pushMove(moves, move, length);
      }
      previous = corner;
      travelled += segment;
    }
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

function pocketPath(
  stock: Box3,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const profile = operation.profile;
  const inset = Math.max(tool.diameter / 2, operation.stepover);
  const count = Math.max(
    1,
    Math.ceil(Math.min(profile.width, profile.height) / (2 * inset)),
  );
  for (const depth of passDepths(operation)) {
    const z = zAt(stock, depth);
    for (let index = 0; index < count; index++) {
      const offset = index * inset;
      const width = profile.width - offset * 2;
      const height = profile.height - offset * 2;
      if (width <= 0 || height <= 0) break;
      rectanglePass(
        moves,
        length,
        {
          x: profile.x + offset,
          y: profile.y + offset,
          width,
          height,
        },
        z,
        safeZ(stock, tool),
        index === 0 ? operation.leadIn : 0,
        index === count - 1 ? operation.leadOut : 0,
        tool.feed,
      );
    }
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

function facePath(
  stock: Box3,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const stepover = Math.max(tool.diameter * 0.7, operation.stepover);
  const rows = Math.max(1, Math.ceil((stock.max.y - stock.min.y) / stepover));
  for (const depth of passDepths(operation)) {
    const z = zAt(stock, depth);
    for (let row = 0; row <= rows; row++) {
      const y = Math.min(stock.max.y, stock.min.y + row * stepover);
      const leftToRight = row % 2 === 0;
      const x0 = leftToRight ? stock.min.x : stock.max.x;
      const x1 = leftToRight ? stock.max.x : stock.min.x;
      pushMove(
        moves,
        { kind: "rapid", x: x0, y, z: safeZ(stock, tool) },
        length,
      );
      pushMove(moves, { kind: "cut", x: x0, y, z, feed: tool.feed }, length);
      pushMove(moves, { kind: "cut", x: x1, y, z, feed: tool.feed }, length);
    }
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

function drillPath(
  stock: Box3,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const retract = safeZ(stock, tool);
  const z = zAt(stock, operation.depth);
  for (const hole of operation.holes) {
    pushMove(
      moves,
      { kind: "rapid", x: hole.x, y: hole.y, z: retract },
      length,
    );
    pushMove(
      moves,
      { kind: "cut", x: hole.x, y: hole.y, z, feed: tool.feed },
      length,
    );
    pushMove(
      moves,
      { kind: "rapid", x: hole.x, y: hole.y, z: retract },
      length,
    );
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

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

function surfaceCutZ(stock: Box3, depth: number, tool: CamTool): number {
  const radius = tool.kind === "ballmill" ? tool.diameter / 2 : 0;
  return stock.max.z - depth + radius;
}

function parallelPath(
  stock: Box3,
  surface: CamSurface,
  operation: CamOperation,
  tool: CamTool,
  restOnly = false,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const profile = operation.profile;
  const step = Math.max(surface.cell, operation.stepover, tool.diameter * 0.5);
  const rows = Math.max(1, Math.ceil(profile.height / step));
  const cols = Math.max(2, Math.ceil(profile.width / step));
  const threshold = restOnly
    ? Math.max(operation.stepdown, tool.diameter * 0.25)
    : -1;
  for (let row = 0; row <= rows; row++) {
    const y = Math.min(profile.y + profile.height, profile.y + row * step);
    const leftToRight = row % 2 === 0;
    const points: Array<{ x: number; z: number }> = [];
    for (let col = 0; col <= cols; col++) {
      const t = col / cols;
      const x = leftToRight
        ? profile.x + profile.width * t
        : profile.x + profile.width * (1 - t);
      const depth = surfaceDepthAt(surface, x, y);
      if (restOnly && depth < threshold) continue;
      points.push({
        x,
        z: surfaceCutZ(stock, Math.min(depth, operation.depth), tool),
      });
    }
    if (points.length < 2) continue;
    pushMove(
      moves,
      {
        kind: "rapid",
        x: points[0]!.x,
        y,
        z: safeZ(stock, tool),
      },
      length,
    );
    for (const point of points) {
      pushMove(
        moves,
        { kind: "cut", x: point.x, y, z: point.z, feed: tool.feed },
        length,
      );
    }
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

function adaptivePath(
  stock: Box3,
  surface: CamSurface,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  // Adaptive clearing follows the surface at a tighter stepover. It never
  // plunges to a fixed Z below the height-map surface.
  return parallelPath(
    stock,
    surface,
    { ...operation, stepover: Math.max(tool.diameter * 0.45, 0.5) },
    tool,
  );
}

function pencilPath(
  stock: Box3,
  surface: CamSurface,
  operation: CamOperation,
  tool: CamTool,
): { moves: CamMove[]; cut: number; rapid: number } {
  const moves: CamMove[] = [];
  const length = { cut: 0, rapid: 0 };
  const radius = tool.diameter / 2;
  for (let row = 0; row < surface.rows; row++) {
    for (let col = 0; col < surface.cols; col++) {
      const x = surface.origin.x + col * surface.cell;
      const y = surface.origin.y + row * surface.cell;
      if (
        x < operation.profile.x ||
        x > operation.profile.x + operation.profile.width
      )
        continue;
      if (
        y < operation.profile.y ||
        y > operation.profile.y + operation.profile.height
      )
        continue;
      const depth = surfaceDepthAt(surface, x, y);
      const right = surfaceDepthAt(surface, x + surface.cell, y);
      const up = surfaceDepthAt(surface, x, y + surface.cell);
      const steep =
        Math.abs(depth - right) > 0.25 || Math.abs(depth - up) > 0.25;
      if (!steep || depth > operation.depth) continue;
      pushMove(moves, { kind: "rapid", x, y, z: safeZ(stock, tool) }, length);
      pushMove(
        moves,
        {
          kind: "cut",
          x: x + surface.cell,
          y: y + surface.cell,
          z: stock.max.z - Math.min(depth, operation.depth) + radius,
          feed: tool.feed,
        },
        length,
      );
      pushMove(
        moves,
        { kind: "rapid", x: x, y, z: safeZ(stock, tool) },
        length,
      );
    }
  }
  return { moves, cut: length.cut, rapid: length.rapid };
}

export interface GenerateToolpathOptions {
  signal?: AbortSignal | undefined;
  shouldCancel?: (() => boolean) | undefined;
  onProgress?: ((completed: number, total: number) => void) | undefined;
}

function cancelled(options: GenerateToolpathOptions): boolean {
  return Boolean(options.signal?.aborted || options.shouldCancel?.());
}

function finishPaths(paths: CamToolpath[]): CamToolpathResult {
  return {
    paths,
    cutLength: paths.reduce((sum, path) => sum + path.cutLength, 0),
    rapidLength: paths.reduce((sum, path) => sum + path.rapidLength, 0),
    estimatedMinutes: paths.reduce(
      (sum, path) =>
        sum +
        (Number.isFinite(path.estimatedMinutes) ? path.estimatedMinutes : 0),
      0,
    ),
  };
}

function generatePathWithSurface(
  document: CamDocument,
  operation: CamOperation,
): { moves: CamMove[]; cut: number; rapid: number } {
  const tool = camToolById(document, operation.toolId);
  if (!tool) {
    throw new CamError(
      "OPERATION_TOOL",
      `Operation "${operation.name}" references a missing tool.`,
    );
  }
  const stock = stockBounds(document.stock);
  const surface = document.surface;
  if (!surface) {
    throw new CamError(
      "OPERATION_SURFACE",
      `Operation "${operation.name}" needs a part surface height map.`,
    );
  }
  const generated =
    operation.kind === "adaptive"
      ? adaptivePath(stock, surface, operation, tool)
      : operation.kind === "parallel"
        ? parallelPath(stock, surface, operation, tool)
        : operation.kind === "pencil"
          ? pencilPath(stock, surface, operation, tool)
          : parallelPath(stock, surface, operation, tool, true);
  return generated;
}

export function generateOperationPath(
  document: CamDocument,
  operation: CamOperation,
): CamToolpath {
  const tool = camToolById(document, operation.toolId);
  if (!tool) {
    throw new CamError(
      "OPERATION_TOOL",
      `Operation "${operation.name}" references a missing tool.`,
    );
  }
  const stock = stockBounds(document.stock);
  const generated: { moves: CamMove[]; cut: number; rapid: number } =
    operation.kind === "adaptive" ||
    operation.kind === "parallel" ||
    operation.kind === "pencil" ||
    operation.kind === "rest"
      ? generatePathWithSurface(document, operation)
      : operation.kind === "face"
        ? facePath(stock, operation, tool)
        : operation.kind === "drill"
          ? drillPath(stock, operation, tool)
          : operation.kind === "pocket"
            ? pocketPath(stock, operation, tool)
            : contourPath(stock, operation, tool);
  const last = generated.moves[generated.moves.length - 1];
  if (last && last.z < safeZ(stock, tool) - 1e-9) {
    generated.moves.push({
      kind: "rapid",
      x: last.x,
      y: last.y,
      z: safeZ(stock, tool),
    });
    generated.rapid += safeZ(stock, tool) - last.z;
  }
  const estimatedMinutes =
    tool.feed > 0 ? generated.cut / tool.feed : Number.POSITIVE_INFINITY;
  return {
    operationId: operation.id,
    operationName: operation.name,
    toolId: operation.toolId,
    moves: generated.moves,
    cutLength: generated.cut,
    rapidLength: generated.rapid,
    estimatedMinutes,
  };
}

export function generateToolpaths(
  document: CamDocument,
  options: GenerateToolpathOptions = {},
): CamToolpathResult {
  const operations = [...document.operations].sort((a, b) => a.order - b.order);
  checkOperationBudget(operations.length);
  const paths: CamToolpath[] = [];
  let moves = 0;
  options.onProgress?.(0, operations.length);
  for (const [index, operation] of operations.entries()) {
    if (cancelled(options)) {
      throw new CamError("CAM_CANCELLED", "Toolpath generation cancelled.");
    }
    const path = generateOperationPath(document, operation);
    moves += path.moves.length;
    if (moves > CAM_MAX_MOVES) {
      throw new CamError(
        "CAM_MEMORY",
        `Toolpath generation exceeds the total move limit of ${CAM_MAX_MOVES.toLocaleString()}.`,
      );
    }
    paths.push(path);
    options.onProgress?.(index + 1, operations.length);
  }
  return finishPaths(paths);
}

/** Chunked wrapper for the UI so Cancel can run between operations. */
export async function generateToolpathsAsync(
  document: CamDocument,
  options: GenerateToolpathOptions = {},
): Promise<CamToolpathResult> {
  const operations = [...document.operations].sort((a, b) => a.order - b.order);
  checkOperationBudget(operations.length);
  const paths: CamToolpath[] = [];
  let moves = 0;
  options.onProgress?.(0, operations.length);
  for (const [index, operation] of operations.entries()) {
    if (cancelled(options)) {
      throw new CamError("CAM_CANCELLED", "Toolpath generation cancelled.");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (cancelled(options)) {
      throw new CamError("CAM_CANCELLED", "Toolpath generation cancelled.");
    }
    const path = generateOperationPath(document, operation);
    moves += path.moves.length;
    if (moves > CAM_MAX_MOVES) {
      throw new CamError(
        "CAM_MEMORY",
        `Toolpath generation exceeds the total move limit of ${CAM_MAX_MOVES.toLocaleString()}.`,
      );
    }
    paths.push(path);
    options.onProgress?.(index + 1, operations.length);
  }
  return finishPaths(paths);
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 s";
  const seconds = Math.round(minutes * 60);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;
}
