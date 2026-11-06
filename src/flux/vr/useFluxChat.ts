// flux/vr/useFluxChat.ts — React hook: the one floating chat window, desk.
//
// Owns the React state for the single per-file thread: the row list, the input
// line, the pending action, the live layout for canvas draw + hit-test. The
// VR panel (vrChatPanel.ts) and the desk panel (ui/chatPanel.tsx) both consume
// these same rows — one thread, every surface.
//
// Pure state + subscription: this hook holds NO orchestrator logic. It calls
// `onSubmit(key, selection)` (wired to the orchestrator by the caller) and
// re-renders when the trace emits. The caller is responsible for binding the
// hook to the right ProjectContext (one file = one window).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TraceRow, AgentId } from "../agent/trace";
import {
  layoutChat,
  drawChat,
  chatHitTest,
  CHAT_THEME,
  type ChatLayout,
  type ChatRegion,
  type ChatTheme,
} from "./chatPanelCanvas";

export interface FluxChatState {
  rows: TraceRow[];
  input: string;
  layout: ChatLayout | null;
  busy: boolean;
  lastResult?: { ok: boolean; text?: string; error?: string };
}

export interface UseFluxChatOpts {
  /** The stable file/project ref this window is bound to. */
  projectRef: string;
  /** Called when the user submits (action key + selected designators). */
  onSubmit: (
    key: string,
    selection: string[],
  ) => Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }>;
  /** The selected designators (from the scene). */
  selection: string[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Canvas pixel size. Keep in sync with the element. */
  size: { w: number; h: number };
  theme?: ChatTheme;
}

export function useFluxChat(opts: UseFluxChatOpts): FluxChatState & {
  setInput: (s: string) => void;
  submit: (key: string) => void;
  scrollBy: (dy: number) => void;
  hitTest: (x: number, y: number) => ChatRegion | null;
  redraw: () => void;
} {
  const {
    projectRef,
    onSubmit,
    selection,
    canvasRef,
    size,
    theme = CHAT_THEME,
  } = opts;

  const [rows, setRows] = useState<TraceRow[]>([]);
  const [input, setInput] = useState("");
  const [scroll, setScroll] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<
    | {
        ok: boolean;
        text?: string;
        error?: string;
      }
    | undefined
  >(undefined);

  const layout = useMemo<ChatLayout | null>(
    () => (rows.length ? layoutChat(rows, size.w, size.h, scroll) : null),
    [rows, size.w, size.h, scroll],
  );

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const l = layoutChat(rows, size.w, size.h, scroll);
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) drawChat(ctx, l, theme);
    }
  }, [canvasRef, rows, size.w, size.h, scroll, theme]);

  // Redraw on every change.
  useEffect(() => {
    redraw();
  }, [redraw]);

  const submit = useCallback(
    async (key: string) => {
      if (busy) return;
      setBusy(true);
      setScroll((s) => s + 4000); // jump to bottom on submit
      const res = await onSubmit(key, selection);
      setLastResult(res);
      setBusy(false);
      // rows updates come from the trace subscription (see subscribe below).
    },
    [busy, onSubmit, selection],
  );

  const scrollBy = useCallback((dy: number) => {
    setScroll((s) => Math.max(0, s + dy));
  }, []);

  const hitTest = useCallback(
    (x: number, y: number): ChatRegion | null => {
      const l = layoutChat(rows, size.w, size.h, scroll);
      return chatHitTest(l, x, y);
    },
    [rows, size.w, size.h, scroll],
  );

  // Re-bound when the file/project changes (one window per file).
  useEffect(() => {
    setRows([]);
    setScroll(0);
    setInput("");
    setLastResult(undefined);
  }, [projectRef]);

  const rowsRef = useRef<TraceRow[]>([]);
  rowsRef.current = rows;

  const getRows = useCallback(() => rowsRef.current, []);

  return {
    rows,
    input,
    layout,
    busy,
    ...(lastResult !== undefined ? { lastResult } : {}),
    setInput,
    submit,
    scrollBy,
    hitTest,
    redraw,
    getRows,
    setRows,
  } as FluxChatState & {
    setInput: (s: string) => void;
    submit: (key: string) => void;
    scrollBy: (dy: number) => void;
    hitTest: (x: number, y: number) => ChatRegion | null;
    redraw: () => void;
    getRows: () => TraceRow[];
    setRows: React.Dispatch<React.SetStateAction<TraceRow[]>>;
  };
}
// Re-export trace types so consumers only import from one place.
export type { AgentId };
