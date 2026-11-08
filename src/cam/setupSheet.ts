// Local setup-sheet generator. The sheet is self-contained HTML with no
// external assets; screenshots are optional data URLs supplied by the caller.

import {
  CamError,
  camToolById,
  validateCamDocument,
  type CamDocument,
} from "./model";
import { postDefinition } from "./post";
import { formatMinutes, generateToolpaths } from "./toolpath";

export interface SetupSheetOptions {
  screenshots?: readonly string[];
  generatedAt?: number;
}

export interface SetupSheetResult {
  html: string;
  fileName: string;
  estimatedMinutes: number;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function validScreenshot(value: string): boolean {
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function setupSheetFileName(document: CamDocument): string {
  const safe =
    document.name
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cam-setup";
  return `${safe}-setup.html`;
}

/**
 * Build the setup sheet from the same validated document as the post. Missing
 * tools, invalid stock and non-image screenshots fail by name rather than
 * producing a sheet with blanks.
 */
export function buildSetupSheet(
  document: CamDocument,
  options: SetupSheetOptions = {},
): SetupSheetResult {
  const issues = validateCamDocument(document);
  if (issues.length > 0) {
    throw new CamError(
      "CAM_VALIDATION",
      issues.map((issue) => issue.message).join("; "),
      issues,
    );
  }
  for (const [index, screenshot] of (options.screenshots ?? []).entries()) {
    if (!validScreenshot(screenshot)) {
      throw new CamError(
        "SETUP_SHEET_SCREENSHOT",
        `Screenshot ${index + 1} must be a PNG/JPEG/WebP data URL.`,
      );
    }
  }
  const post = postDefinition(document.post);
  const paths = generateToolpaths(document);
  const generatedAt = new Date(options.generatedAt ?? Date.now());
  const stock = document.stock;
  const stockSize =
    stock.kind === "cylinder"
      ? `${stock.diameter} Ø × ${stock.height} ${stock.units}`
      : `${stock.size.x} × ${stock.size.y} × ${stock.size.z} ${stock.units}`;
  const tools = document.tools
    .map((tool, index) => {
      const operationCount = document.operations.filter(
        (operation) => operation.toolId === tool.id,
      ).length;
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(tool.name)}</td>
        <td>${escapeHtml(tool.kind)}</td>
        <td>${tool.diameter} ${stock.units}</td>
        <td>${tool.flutes}</td>
        <td>${escapeHtml(tool.material)}</td>
        <td>${tool.feed} ${stock.units}/min</td>
        <td>${tool.speed} rpm</td>
        <td>${operationCount}</td>
      </tr>`;
    })
    .join("");
  const operations = [...document.operations]
    .sort((a, b) => a.order - b.order)
    .map((operation, index) => {
      const tool = camToolById(document, operation.toolId);
      const path = paths.paths.find(
        (candidate) => candidate.operationId === operation.id,
      );
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(operation.name)}</td>
        <td>${escapeHtml(operation.kind)}</td>
        <td>${escapeHtml(tool?.name ?? "(missing tool)")}</td>
        <td>${operation.depth} ${stock.units}</td>
        <td>${operation.stepdown} / ${operation.stepover}</td>
        <td>${path ? formatMinutes(path.estimatedMinutes) : "—"}</td>
      </tr>`;
    })
    .join("");
  const screenshots = (options.screenshots ?? [])
    .map(
      (screenshot, index) =>
        `<figure><img src="${screenshot}" alt="Setup screenshot ${index + 1}"><figcaption>Setup view ${index + 1}</figcaption></figure>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(document.name)} — Setup Sheet</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}figure{display:inline-block;margin:8px;max-width:48%}img{max-width:100%;border:1px solid #bbb}code{font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(document.name)}</h1>
<p>Generated ${generatedAt.toISOString()} · ${escapeHtml(post.label)} · ${document.tools.length} tool(s) · ${document.operations.length} operation(s)</p>
<h2>Stock / work origin</h2>
<table><tbody>
<tr><th>Stock</th><td>${escapeHtml(stock.kind)}</td></tr>
<tr><th>Size</th><td>${escapeHtml(stockSize)}</td></tr>
<tr><th>Margin</th><td>${stock.margin} ${stock.units}</td></tr>
<tr><th>Origin</th><td>X ${stock.origin.x} · Y ${stock.origin.y} · Z ${stock.origin.z}</td></tr>
<tr><th>Post</th><td>${escapeHtml(post.label)}</td></tr>
<tr><th>Estimated cutting time</th><td>${formatMinutes(paths.estimatedMinutes)}</td></tr>
</tbody></table>
<h2>Tools</h2>
<table><thead><tr><th>#</th><th>Name</th><th>Kind</th><th>Diameter</th><th>Flutes</th><th>Material</th><th>Feed</th><th>Speed</th><th>Ops</th></tr></thead><tbody>${tools}</tbody></table>
<h2>Operations</h2>
<table><thead><tr><th>#</th><th>Name</th><th>Kind</th><th>Tool</th><th>Depth</th><th>Stepdown / stepover</th><th>Est. time</th></tr></thead><tbody>${operations}</tbody></table>
${screenshots ? `<h2>Setup views</h2>${screenshots}` : ""}
</body>
</html>
`;
  return {
    html,
    fileName: setupSheetFileName(document),
    estimatedMinutes: paths.estimatedMinutes,
  };
}
