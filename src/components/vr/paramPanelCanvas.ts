// Parameter panel canvas — renders ParamPanel rows and reports hit regions.
// Pure 2D canvas: no DOM events, no three.js. The caller (desktop or VR)
// supplies a canvas, forwards pointer events, and reads back hit regions.
// Keeps the panel logic testable without a renderer.
import type { PanelRow, ParamPanel } from "../../model/paramPanel";

export interface PanelHit {
  rowIndex: number;
  parameterId: string;
  /** Which control within the row was hit. */
  region: "label" | "value" | "decrement" | "increment" | "toggle" | "enum";
  /** For enum hits: the selected option index. */
  optionIndex?: number;
}

export interface PanelLayout {
  width: number;
  height: number;
  rows: Array<{
    row: PanelRow;
    y: number;
    height: number;
    regions: Array<{
      region: PanelHit["region"];
      x: number;
      w: number;
      optionIndex?: number;
    }>;
  }>;
}

export interface PanelTheme {
  bg: string;
  header: string;
  text: string;
  dim: string;
  accent: string;
  field: string;
  fieldBorder: string;
  linked: string;
  font: string;
}

export const DEFAULT_THEME: PanelTheme = {
  bg: "#12161f",
  header: "#8fb7ff",
  text: "#e8edf7",
  dim: "#7d879c",
  accent: "#3f7bff",
  field: "#1c2230",
  fieldBorder: "#2c3546",
  linked: "#ffcf6b",
  font: "13px ui-monospace, Menlo, monospace",
};

const PAD = 10;
const ROW_H = 30;
const HEADER_H = 34;
const LABEL_W = 0.42; // fraction of content width
const BTN_W = 24;

export function layoutPanel(
  panel: ParamPanel,
  width: number,
  theme: PanelTheme = DEFAULT_THEME,
): PanelLayout {
  void theme;
  const contentW = width - PAD * 2;
  const labelW = Math.max(70, contentW * LABEL_W);
  const rows: PanelLayout["rows"] = [];
  let y = HEADER_H + PAD;
  for (const row of panel.rows) {
    const regions: PanelLayout["rows"][number]["regions"] = [];
    const fieldX = PAD + labelW + 6;
    const fieldW = contentW - labelW - 6;
    switch (row.kind) {
      case "quantity":
        regions.push({ region: "decrement", x: fieldX, w: BTN_W });
        regions.push({
          region: "increment",
          x: fieldX + fieldW - BTN_W,
          w: BTN_W,
        });
        regions.push({
          region: "value",
          x: fieldX + BTN_W,
          w: fieldW - BTN_W * 2,
        });
        break;
      case "string":
        regions.push({ region: "value", x: fieldX, w: fieldW });
        break;
      case "boolean":
        regions.push({ region: "toggle", x: fieldX, w: BTN_W + 6 });
        break;
      case "enum": {
        const opts = row.enumValues ?? [];
        const ow = opts.length ? fieldW / opts.length : fieldW;
        opts.forEach((_: string, i: number) => {
          regions.push({
            region: "enum",
            x: fieldX + i * ow,
            w: ow,
            optionIndex: i,
          });
        });
        break;
      }
      default:
        regions.push({ region: "value", x: fieldX, w: fieldW });
    }
    regions.push({ region: "label", x: PAD, w: labelW });
    rows.push({ row, y, height: ROW_H, regions });
    y += ROW_H;
  }
  const height = Math.min(560, y + PAD);
  return { width, height, rows };
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  panel: ParamPanel,
  width: number,
  theme: PanelTheme = DEFAULT_THEME,
): PanelLayout {
  const layout = layoutPanel(panel, width, theme);
  const { height } = layout;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.font = theme.font;
  ctx.textBaseline = "middle";

  // Header
  ctx.fillStyle = theme.header;
  ctx.font = "bold 15px ui-monospace, Menlo, monospace";
  ctx.fillText(panel.label, PAD, HEADER_H / 2 + 4);
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillStyle = theme.dim;
  ctx.textAlign = "right";
  ctx.fillText(panel.status.toUpperCase(), width - PAD, HEADER_H / 2 + 4);
  ctx.textAlign = "left";
  ctx.strokeStyle = theme.fieldBorder;
  ctx.beginPath();
  ctx.moveTo(PAD, HEADER_H);
  ctx.lineTo(width - PAD, HEADER_H);
  ctx.stroke();

  ctx.font = theme.font;
  for (const { row, y, regions } of layout.rows) {
    const cy = y + ROW_H / 2;

    // label
    ctx.fillStyle = row.usingDefault ? theme.dim : theme.text;
    ctx.fillText(row.label, PAD, cy);

    const valueRegion = regions.find((r) => r.region === "value");

    switch (row.kind) {
      case "quantity": {
        const dec = regions.find((r) => r.region === "decrement")!;
        const inc = regions.find((r) => r.region === "increment")!;
        drawButton(ctx, dec.x, y + 4, dec.w, ROW_H - 8, "−", theme);
        drawButton(ctx, inc.x, y + 4, inc.w, ROW_H - 8, "+", theme);
        if (valueRegion) {
          drawField(ctx, valueRegion.x, y + 4, valueRegion.w, ROW_H - 8, theme);
          const shown =
            row.linkedVariable ?? row.expression ?? String(row.value);
          ctx.fillStyle = row.linkedVariable ? theme.linked : theme.text;
          ctx.textAlign = "center";
          ctx.fillText(short(shown, 18), valueRegion.x + valueRegion.w / 2, cy);
          ctx.textAlign = "left";
        }
        break;
      }
      case "string":
      case "queryList":
      case "matrix": {
        if (valueRegion) {
          drawField(ctx, valueRegion.x, y + 4, valueRegion.w, ROW_H - 8, theme);
          ctx.fillStyle = theme.text;
          const shown =
            row.kind === "string"
              ? String(row.value)
              : `(${countOf(row.value)} item${countOf(row.value) === 1 ? "" : "s"})`;
          ctx.textAlign = "center";
          ctx.fillText(short(shown, 22), valueRegion.x + valueRegion.w / 2, cy);
          ctx.textAlign = "left";
        }
        break;
      }
      case "boolean": {
        const tg = regions.find((r) => r.region === "toggle")!;
        drawToggle(
          ctx,
          tg.x,
          y + 8,
          tg.w,
          ROW_H - 16,
          Boolean(row.value),
          theme,
        );
        break;
      }
      case "enum": {
        const opts = row.enumValues ?? [];
        for (const r of regions.filter((x) => x.region === "enum")) {
          const i = r.optionIndex ?? 0;
          const selected = opts[i] === row.value;
          drawChip(
            ctx,
            r.x,
            y + 4,
            r.w,
            ROW_H - 8,
            short(opts[i] ?? "", 12),
            selected,
            theme,
          );
        }
        break;
      }
    }
  }

  // footer hint for defaulted rows
  if (panel.rows.some((r: PanelRow) => r.usingDefault)) {
    const footY = height - PAD;
    ctx.fillStyle = theme.dim;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText("· dimmed = using default value", PAD, footY - 2);
    ctx.font = theme.font;
  }

  return layout;
}

export function hitTest(
  layout: PanelLayout,
  px: number,
  py: number,
): PanelHit | null {
  for (let i = 0; i < layout.rows.length; i++) {
    const entry = layout.rows[i];
    if (!entry) continue;
    const { y, height, regions, row } = entry;
    if (py < y || py > y + height) continue;
    for (const r of regions) {
      if (px >= r.x && px <= r.x + r.w) {
        const hit: PanelHit = {
          rowIndex: i,
          parameterId: row.parameterId,
          region: r.region,
        };
        if (r.optionIndex !== undefined) hit.optionIndex = r.optionIndex;
        return hit;
      }
    }
  }
  return null;
}

/**
 * Apply a hit as a semantic value change and return the new value for the row,
 * or null when the hit is informational (label/value focus without stepping).
 * The caller persists the returned value through applyPanelEdit.
 */
export function resolveHitValue(row: PanelRow, hit: PanelHit): unknown | null {
  const step = row.step ?? defaultStep(row);
  switch (hit.region) {
    case "increment":
      if (row.kind === "quantity") {
        const v = Number(row.value) + step;
        return row.max !== undefined ? Math.min(v, row.max) : v;
      }
      return null;
    case "decrement":
      if (row.kind === "quantity") {
        const v = Number(row.value) - step;
        return row.min !== undefined ? Math.max(v, row.min) : v;
      }
      return null;
    case "toggle":
      if (row.kind === "boolean") return !row.value;
      return null;
    case "enum":
      if (row.kind === "enum" && hit.optionIndex !== undefined) {
        return row.enumValues?.[hit.optionIndex] ?? row.value;
      }
      return null;
    default:
      return null;
  }
}

function defaultStep(row: PanelRow): number {
  // 1mm in SI unless the value is already tiny
  const v = Math.abs(Number(row.value));
  return v > 0 && v < 0.01 ? 0.0005 : 0.001;
}

function short(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function countOf(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function drawField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: PanelTheme,
) {
  ctx.fillStyle = theme.field;
  ctx.strokeStyle = theme.fieldBorder;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  theme: PanelTheme,
) {
  ctx.fillStyle = theme.field;
  ctx.strokeStyle = theme.fieldBorder;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = "left";
}

function drawToggle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  on: boolean,
  theme: PanelTheme,
) {
  ctx.fillStyle = on ? theme.accent : theme.field;
  ctx.strokeStyle = theme.fieldBorder;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = on ? "#fff" : theme.dim;
  ctx.textAlign = "center";
  ctx.fillText(on ? "on" : "off", x + w / 2, y + h / 2 + 1);
  ctx.textAlign = "left";
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  selected: boolean,
  theme: PanelTheme,
) {
  ctx.fillStyle = selected ? theme.accent : theme.field;
  ctx.strokeStyle = theme.fieldBorder;
  roundRect(ctx, x + 1, y, w - 2, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = selected ? "#fff" : theme.dim;
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = "left";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
