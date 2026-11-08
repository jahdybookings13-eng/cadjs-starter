// Local CAM post-processors. All output is plain G-code generated from the
// same toolpaths the preview and setup sheet use. No cloud post service.

import {
  CamError,
  camToolById,
  validateCamDocument,
  type CamDocument,
  type CamOperation,
  type PostId,
} from "./model";
import {
  formatMinutes,
  generateToolpaths,
  type CamMove,
  type CamToolpath,
} from "./toolpath";

export interface PostDefinition {
  id: PostId;
  label: string;
  description: string;
  /** Supported operation kinds. Unsupported kinds fail by name. */
  supports: readonly CamOperation["kind"][];
}

export const POST_DEFINITIONS: readonly PostDefinition[] = [
  {
    id: "grbl",
    label: "GRBL",
    description: "GRBL 1.1 milling, mm/in units, T/M6, G0/G1.",
    supports: [
      "face",
      "contour",
      "pocket",
      "drill",
      "chamfer",
      "adaptive",
      "parallel",
      "pencil",
      "rest",
    ],
  },
  {
    id: "linuxcnc",
    label: "LinuxCNC",
    description: "LinuxCNC 2.9 milling, modal G0/G1, T/M6.",
    supports: [
      "face",
      "contour",
      "pocket",
      "drill",
      "chamfer",
      "adaptive",
      "parallel",
      "pencil",
      "rest",
    ],
  },
  {
    id: "fanuc",
    label: "Generic Fanuc",
    description: "Generic Fanuc mill, G20/G21, T/M6, G0/G1.",
    supports: [
      "face",
      "contour",
      "pocket",
      "drill",
      "chamfer",
      "adaptive",
      "parallel",
      "pencil",
      "rest",
    ],
  },
];

export interface PostedOperation {
  index: number;
  name: string;
  kind: string;
  tool: string;
}

export interface PostResult {
  post: PostId;
  program: string;
  operations: PostedOperation[];
  estimatedMinutes: number;
  unitCode: "G20" | "G21";
}

export function postDefinition(id: PostId): PostDefinition {
  const found = POST_DEFINITIONS.find((post) => post.id === id);
  if (!found) {
    throw new CamError("POST_ID", `Unknown post processor "${String(id)}".`);
  }
  return found;
}

function fmt(value: number): string {
  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return rounded.toFixed(3);
}

function moveLine(move: CamMove): string {
  const command = move.kind === "rapid" ? "G0" : "G1";
  const feed =
    move.kind === "cut" && move.feed && move.feed > 0
      ? ` F${fmt(move.feed)}`
      : "";
  return `${command} X${fmt(move.x)} Y${fmt(move.y)} Z${fmt(move.z)}${feed}`;
}

function operationToolName(
  document: CamDocument,
  operation: CamOperation,
): string {
  return camToolById(document, operation.toolId)?.name ?? "(missing tool)";
}

/** Named unsupported-operation check, separate from the shipped posts. */
export function assertPostSupports(
  document: CamDocument,
  post: Pick<PostDefinition, "label" | "supports">,
): void {
  const unsupported = document.operations.filter(
    (operation) => !post.supports.includes(operation.kind),
  );
  if (unsupported.length > 0) {
    throw new CamError(
      "POST_UNSUPPORTED",
      `${post.label} does not support ${unsupported
        .map((operation) => operation.name)
        .join(", ")}.`,
    );
  }
}

function header(
  document: CamDocument,
  post: PostDefinition,
  unitCode: "G20" | "G21",
): string[] {
  return [
    `(${post.label} post)`,
    `(Program: ${document.name})`,
    `(Stock: ${document.stock.kind} ${fmt(document.stock.size.x)} x ${fmt(document.stock.size.y)} x ${fmt(document.stock.size.z)} ${document.stock.units})`,
    `(Work origin: X${fmt(document.stock.origin.x)} Y${fmt(document.stock.origin.y)} Z${fmt(document.stock.origin.z)})`,
    `(Operations: ${document.operations.length})`,
    `${unitCode} G90 G17 G94`,
  ];
}

function footer(post: PostDefinition): string[] {
  return ["M5", "G0 Z10.000", "M30", `(${post.label} end)`];
}

/**
 * Post the document in operation order. The emitted comments are the
 * machine-readable operation list used by the setup sheet and round-trip
 * check; a failed path never yields a partial program marked complete.
 */
export function postProcess(
  document: CamDocument,
  postId: PostId = document.post,
): PostResult {
  const issues = validateCamDocument(document);
  if (issues.length > 0) {
    throw new CamError(
      "CAM_VALIDATION",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
  if (document.operations.length === 0) {
    throw new CamError(
      "NO_OPERATIONS",
      "Add at least one operation before posting.",
    );
  }
  const post = postDefinition(postId);
  assertPostSupports(document, post);
  const toolpaths = generateToolpaths(document);
  const unitCode = document.stock.units === "in" ? "G20" : "G21";
  const lines: string[] = [...header(document, post, unitCode)];
  const operations: PostedOperation[] = [];
  for (const [index, path] of toolpaths.paths.entries()) {
    const operation = document.operations.find(
      (candidate) => candidate.id === path.operationId,
    );
    if (!operation) continue;
    const tool = camToolById(document, operation.toolId);
    const toolNumber =
      document.tools.findIndex((item) => item.id === operation.toolId) + 1;
    lines.push(
      `(OP ${index + 1}: ${operation.name} | ${operation.kind} | ${operationToolName(document, operation)})`,
    );
    if (tool) {
      lines.push(
        `(TOOL ${toolNumber}: ${tool.name} Ø${fmt(tool.diameter)} ${document.stock.units})`,
      );
      lines.push(`T${toolNumber} M6`, `S${Math.round(tool.speed)} M3`);
    }
    for (const move of path.moves) lines.push(moveLine(move));
    lines.push("M5");
    operations.push({
      index: index + 1,
      name: operation.name,
      kind: operation.kind,
      tool: operationToolName(document, operation),
    });
  }
  lines.push(...footer(post));
  return {
    post: post.id,
    program: lines.join("\n") + "\n",
    operations,
    estimatedMinutes: toolpaths.estimatedMinutes,
    unitCode,
  };
}

/** Parse the operation comments emitted by `postProcess`. */
export function parsePostedOperations(program: string): PostedOperation[] {
  const operations: PostedOperation[] = [];
  for (const line of program.split(/\r?\n/)) {
    const match = /^\(OP (\d+): (.*?) \| (.*?) \| (.*?)\)$/.exec(line.trim());
    if (!match) continue;
    operations.push({
      index: Number(match[1]),
      name: match[2]!,
      kind: match[3]!,
      tool: match[4]!,
    });
  }
  return operations;
}

export function formatPostSummary(result: PostResult): string {
  return `${result.post.toUpperCase()} · ${result.operations.length} operation(s) · ${formatMinutes(result.estimatedMinutes)}`;
}

export function postPathCount(paths: readonly CamToolpath[]): number {
  return paths.reduce((sum, path) => sum + path.moves.length, 0);
}
