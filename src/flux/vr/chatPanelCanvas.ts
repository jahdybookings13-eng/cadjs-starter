// flux/vr/chatPanelCanvas.ts — the one floating chat window, canvas 2D.
//
// Twin of `paramPanelCanvas.ts`: pure 2D canvas, no renderer, no DOM. The
// caller (VR hand-tracked panel or desktop floating window) supplies a canvas,
// forwards pointer events, and reads back:
//   * hit regions (for the radial menu + input line)
//   * a single ordered stream of TraceRows — the "one thread per file" stream.
//
// The panel renders ONE column: intent rows, tool-call rows, tool-result rows,
// and the input line. Agent rows are tagged with a colored agent chip (pcb /
// mcad / firmware / parts / orchestrator) so sub-agent posts are visible
// WITHOUT being separate windows.
//
// Units: canvas px. The canvas is sized by the caller; the layout is
// deterministic for a given row list + size (testable without a GPU).

import type { TraceRow, AgentId } from "../agent/trace";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatRegion =
  | { kind: "scroll"; delta: number }
  | { kind: "input" }
  | { kind: "submit" }
  | { kind: "menu" } // opens the radial action picker
  | { kind: "row"; traceId: string };

export interface ChatTheme {
  bg: string;
  header: string;
  text: string;
  dim: string;
  accent: string;
  inputBg: string;
  inputBorder: string;
  agentColors: Record<AgentId, string>;
  font: string;
  radius: number;
}

export const CHAT_THEME: ChatTheme = {
  bg: "#0e1119",
  header: "#8fb7ff",
  text: "#e8edf7",
  dim: "#7d879c",
  accent: "#3f7bff",
  inputBg: "#161b26",
  inputBorder: "#2c3546",
  agentColors: {
    orchestrator: "#8fb7ff",
    pcb: "#5fd0a0",
    mcad: "#e0b34a",
    firmware: "#c58af9",
    parts: "#f28f6b",
    ecad: "#7fe3ff",
  },
  font: "13px ui-monospace, Menlo, monospace",
  radius: 10,
};

export interface ChatRowLayout {
  traceId: string;
  agent: AgentId;
  kind: TraceRow["kind"];
  y: number;
  h: number;
  text: string;
}

export interface ChatLayout {
  width: number;
  height: number;
  rows: ChatRowLayout[];
  input: { x: number; y: number; w: number; h: number };
  submit: { x: number; y: number; w: number; h: number };
  menu: { x: number; y: number; w: number; h: number };
  /** The visible scroll offset (px from the top of the row list). */
  scroll: number;
  /** Total content height (px). */
  contentH: number;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const PAD = 10;
const ROW_H = 26;
const ROW_GAP = 4;
const HEADER_H = 38;
const INPUT_H = 34;
const BTN_W = 96;

export function layoutChat(
  rows: TraceRow[],
  width: number,
  height: number,
  scroll = 0,
): ChatLayout {
  const top = HEADER_H;
  const stack: ChatRowLayout[] = [];
  let y = top;
  for (const r of rows) {
    stack.push({
      traceId: r.id,
      agent: r.agent,
      kind: r.kind,
      y,
      h: ROW_H,
      text: rowText(r),
    });
    y += ROW_H + ROW_GAP;
  }
  const contentH = y - top;
  // Clamp scroll to [0, max(0, contentH - (height - top - INPUT_H - PAD*2))].
  const viewportH = Math.max(0, height - top - INPUT_H - PAD * 2);
  const maxScroll = Math.max(0, contentH - viewportH);
  const clamped = Math.max(0, Math.min(scroll, maxScroll));
  for (const r of stack) r.y -= clamped;
  const inputY = height - INPUT_H - PAD;
  return {
    width,
    height,
    rows: stack,
    input: {
      x: PAD,
      y: inputY,
      w: width - PAD * 2 - BTN_W * 2 - PAD,
      h: INPUT_H,
    },
    submit: {
      x: width - PAD - BTN_W,
      y: inputY,
      w: BTN_W,
      h: INPUT_H,
    },
    menu: { x: PAD, y: PAD, w: BTN_W, h: HEADER_H - PAD },
    scroll: clamped,
    contentH,
  };
}

function rowText(r: TraceRow): string {
  const tag = `[${r.agent}:${r.kind}]`;
  const body = r.detail ?? r.op;
  const s = `${tag} ${body}`;
  return s.length > 140 ? s.slice(0, 137) + "..." : s;
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

export function chatHitTest(
  layout: ChatLayout,
  x: number,
  y: number,
): ChatRegion | null {
  const inRect = (r: { x: number; y: number; w: number; h: number }): boolean =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inRect(layout.menu)) return { kind: "menu" };
  if (inRect(layout.input)) return { kind: "input" };
  if (inRect(layout.submit)) return { kind: "submit" };
  for (const r of layout.rows) {
    if (x >= 0 && x <= layout.width && y >= r.y && y <= r.y + r.h) {
      return { kind: "row", traceId: r.traceId };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Render (pure — draws to a 2D context, returns void)
// ---------------------------------------------------------------------------
// `drawChat` is deterministic: same rows + size + theme => same pixels.
// The caller owns the canvas + ctx (genuine-visual panel). We only draw.

export function drawChat(
  ctx: CanvasRenderingContext2D,
  layout: ChatLayout,
  theme: ChatTheme = CHAT_THEME,
): void {
  const { width, height } = layout;
  ctx.clearRect(0, 0, width, height);
  // bg
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  // header + agent colours
  ctx.fillStyle = theme.header;
  ctx.font = `600 ${theme.font}`;
  ctx.fillText("FLUX · one thread", PAD, PAD + 18);

  // rows
  for (const r of layout.rows) {
    const col = theme.agentColors[r.agent];
    ctx.fillStyle = col;
    ctx.fillRect(PAD, r.y, 3, r.h);
    ctx.fillStyle = r.kind === "error" ? "#ff6b6b" : theme.text;
    ctx.font = theme.font;
    ctx.fillText(r.text, PAD + 8, r.y + r.h - 8, width - PAD * 2 - 8);
  }

  // input
  const i = layout.input;
  roundRect(ctx, i.x, i.y, i.w, i.h, theme.radius);
  ctx.fillStyle = theme.inputBg;
  ctx.fill();
  ctx.strokeStyle = theme.inputBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // submit
  const s = layout.submit;
  roundRect(ctx, s.x, s.y, s.w, s.h, theme.radius);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${theme.font}`;
  ctx.fillText("Send", s.x + 12, s.y + s.h - 10);

  // menu button
  const m = layout.menu;
  roundRect(ctx, m.x, m.y, m.w, m.h, theme.radius);
  ctx.strokeStyle = theme.accent;
  ctx.stroke();
  ctx.fillStyle = theme.header;
  ctx.font = theme.font;
  ctx.fillText("Actions", m.x + 8, m.y + m.h / 2 + 4);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
