import { useEffect } from "react";
import { SceneMode } from "@vitekk02/cadjs";

type NamedView = "front" | "back" | "left" | "right" | "top" | "bottom" | "isometric";

/**
 * Centralizes scene-level keyboard listeners. Each `useEffect` here listens
 * via `window.addEventListener("keydown", ...)` so all the global hotkeys
 * live in one place — easier to reason about than scattered effects in the
 * scene component.
 *
 * Per-mode keydown handlers (sketch, extrude, fillet, sweep, loft, revolve,
 * measure) are owned by their respective `*ModeContent` components — each
 * registers its own listener while mounted.
 *
 * **Cross-mode shortcuts**: undo/redo, duplicate, view-shortcuts attach
 * regardless of mode (with mode-aware short-circuits inside the handlers).
 */
export interface SceneKeyboardBindingsParams {
  mode: SceneMode;
  setMode: (m: SceneMode) => void;

  // Undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
  activeSketch: boolean;
  undo: () => void;
  redo: () => void;
  undoSketch: () => void;
  redoSketch: () => void;

  // Ctrl+D duplicate
  isOperationPending: boolean;
  selectedElements: string[];
  duplicateSelectedElements: () => void;

  // View shortcuts (numpad / 1, 3, 5, 7, 0, F)
  animateToView: (view: NamedView) => void;
  handleFitAll: () => void;
  toggleProjection: () => void;
}

export function useSceneKeyboardBindings(
  params: SceneKeyboardBindingsParams,
): void {
  const {
    mode,
    setMode,
    activeSketch,
    undo,
    redo,
    undoSketch,
    redoSketch,
    isOperationPending,
    selectedElements,
    duplicateSelectedElements,
    animateToView,
    handleFitAll,
    toggleProjection,
  } = params;

  // Global keyboard listener for undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).
  // In sketch mode with active sketch, routes to sketch undo/redo exclusively.
  useEffect(() => {
    const handleUndoRedoKeys = (event: KeyboardEvent) => {
      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        event.key === "z" &&
        !event.shiftKey;
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key === "y" ||
          (event.key === "z" && event.shiftKey) ||
          (event.key === "Z" && event.shiftKey));

      if (!isUndo && !isRedo) return;
      event.preventDefault();

      const inSketchMode = mode === "sketch" && activeSketch;

      if (isUndo) {
        if (inSketchMode) undoSketch();
        else undo();
      } else {
        if (inSketchMode) redoSketch();
        else redo();
      }
    };

    window.addEventListener("keydown", handleUndoRedoKeys);
    return () => window.removeEventListener("keydown", handleUndoRedoKeys);
  }, [mode, activeSketch, undo, redo, undoSketch, redoSketch]);

  // Global Escape key — exits non-sketch modes back to "move".
  // Sketch mode handles its own Esc via useSketchInputHandlers:
  //   1st Esc: cancels in-progress drawing (line following cursor, etc.)
  //   2nd Esc: finishes sketch and exits (handled in SketchModeContent)
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mode === "move") return;
      if (mode === "sketch") return;

      event.preventDefault();
      setMode("move");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mode, setMode]);

  // Global keyboard listener for Ctrl+D (duplicate)
  useEffect(() => {
    const handleDuplicate = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        event.preventDefault();
        if (mode === "sketch" && activeSketch) return;
        if (isOperationPending) return;
        if (selectedElements.length === 0) return;
        duplicateSelectedElements();
      }
    };
    window.addEventListener("keydown", handleDuplicate);
    return () => window.removeEventListener("keydown", handleDuplicate);
  }, [
    mode,
    activeSketch,
    isOperationPending,
    selectedElements,
    duplicateSelectedElements,
  ]);

  // View shortcut keys (numpad + number keys)
  useEffect(() => {
    const handleViewKeys = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      // R and F keys conflict with sketch / fillet — skip those modes.
      if (mode === "sketch" || mode === "fillet") return;

      switch (event.key) {
        case "1":
        case "Numpad1":
          animateToView("front");
          event.preventDefault();
          break;
        case "3":
        case "Numpad3":
          animateToView("right");
          event.preventDefault();
          break;
        case "7":
        case "Numpad7":
          animateToView("top");
          event.preventDefault();
          break;
        case "0":
        case "Numpad0":
          animateToView("isometric");
          event.preventDefault();
          break;
        case "5":
        case "Numpad5":
          if (mode !== "sketch") toggleProjection();
          event.preventDefault();
          break;
        case "f":
          // Move-mode-only Fit All — avoid conflict with fillet's 'F' toggle.
          if (mode === "move") {
            handleFitAll();
            event.preventDefault();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleViewKeys);
    return () => window.removeEventListener("keydown", handleViewKeys);
  }, [mode, animateToView, handleFitAll, toggleProjection]);
}
