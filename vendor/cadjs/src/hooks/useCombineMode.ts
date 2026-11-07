import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useCadCore } from "../contexts/CoreContext";
import { useCadVisualizer } from "../contexts/VisualizerContext";
import { notify } from "../config";
import {
  collectPicksUnderCursor,
  makeBodyOrProfileLabel,
  PickItem,
} from "../scene-operations/mesh-operations";
import {
  isElement3D,
  CombineOperationType,
  NodeId,
  nodeId as toNodeId,
  OP_LABEL,
} from "../scene-operations/types";
import { COMBINE, BODY } from "../theme";
import { useRaycastToObjects } from "./shared/useRaycastToObjects";
import { createModeInputHandlers } from "./shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "./shared/useModeInputHoldRefs";

export interface UseCombineModeResult {
  handleCombineMouseDown: (event: MouseEvent) => void;
  handleCombineMouseMove: (event: MouseEvent) => void;
  handleCombineMouseUp: (event: MouseEvent) => void;
  handleCombineContextMenu: (event: MouseEvent) => void;
  performCombine: () => Promise<void>;
  canCombine: boolean;
  operationType: CombineOperationType;
  setOperationType: (type: CombineOperationType) => void;
  targetBody: NodeId | null;
  toolBodies: NodeId[];
  keepTools: boolean;
  setKeepTools: (keep: boolean) => void;
  resetSelection: () => void;
  cleanup: () => void;
}

export function useCombineMode(): UseCombineModeResult {
  const { elements, getObject, combineSelectedElements } = useCadCore();

  const { navToolActiveRef, selectOtherRef, forceSceneUpdate } =
    useCadVisualizer();

  const [operationType, setOperationTypeRaw] =
    useState<CombineOperationType>("join");
  const [targetBody, setTargetBody] = useState<NodeId | null>(null);
  const [toolBodies, setToolBodies] = useState<NodeId[]>([]);
  const [keepTools, setKeepTools] = useState(false);
  const hoveredRef = useRef<NodeId | null>(null);
  const isApplyingRef = useRef(false);

  // Latest values pinned to refs so the memoized factory spec doesn't
  // capture stale state between renders.
  const targetBodyRef = useRef(targetBody);
  targetBodyRef.current = targetBody;
  const toolBodiesRef = useRef(toolBodies);
  toolBodiesRef.current = toolBodies;

  const setOperationType = useCallback((type: CombineOperationType) => {
    setOperationTypeRaw(type);
    if (type === "join") setKeepTools(false);
  }, []);

  const canCombine = targetBody !== null && toolBodies.length >= 1;

  const setElementColor = useCallback(
    (nodeId: string, color: number) => {
      const obj = getObject(nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !child.userData.isEdgeOverlay &&
          !child.userData.isHelper
        ) {
          (child.material as THREE.MeshStandardMaterial).color.set(color);
        }
      });
      // On-demand renderer: tinting alone doesn't schedule a frame, so combine's
      // hover and pick highlights would render only when OrbitControls happens
      // to fire a change event. Request a frame explicitly.
      forceSceneUpdate();
    },
    [getObject, forceSceneUpdate],
  );

  const resetAllColors = useCallback(() => {
    if (targetBodyRef.current)
      setElementColor(targetBodyRef.current, BODY.default);
    toolBodiesRef.current.forEach((id) => setElementColor(id, BODY.default));
    if (hoveredRef.current) {
      setElementColor(hoveredRef.current, BODY.default);
      hoveredRef.current = null;
    }
  }, [setElementColor]);

  const resetSelection = useCallback(() => {
    resetAllColors();
    setTargetBody(null);
    setToolBodies([]);
  }, [resetAllColors]);

  const cleanup = resetSelection;

  // Mode-content registry mounts this hook only while mode === "combine", so unmount
  // == leaving the mode. Latest closure pinned via ref; unmount effect runs once.
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => cleanupRef.current(), []);

  const applyPick = useCallback(
    (elementId: NodeId) => {
      const currentTarget = targetBodyRef.current;
      const currentTools = toolBodiesRef.current;
      if (!currentTarget) {
        setTargetBody(elementId);
        setElementColor(elementId, COMBINE.targetHighlight);
      } else if (elementId === currentTarget) {
        setElementColor(elementId, BODY.default);
        setTargetBody(null);
      } else if (currentTools.includes(elementId)) {
        setElementColor(elementId, BODY.default);
        setToolBodies((prev) => prev.filter((id) => id !== elementId));
      } else {
        setToolBodies((prev) => [...prev, elementId]);
        setElementColor(elementId, COMBINE.toolHighlight);
      }
    },
    [setElementColor],
  );

  const applyHoverPreview = useCallback(
    (item: PickItem | null) => {
      const currentTarget = targetBodyRef.current;
      const currentTools = toolBodiesRef.current;
      if (item) {
        const elementId = toNodeId(item.elementId);
        if (elementId !== currentTarget && !currentTools.includes(elementId)) {
          const hoverColor = !currentTarget
            ? COMBINE.targetHover
            : COMBINE.toolHover;
          setElementColor(elementId, hoverColor);
        }
      } else {
        elements.forEach((el) => {
          if (
            el.nodeId !== currentTarget &&
            !currentTools.includes(el.nodeId)
          ) {
            setElementColor(el.nodeId, BODY.default);
          }
        });
      }
    },
    [elements, setElementColor],
  );

  const { raycasterFromEvent } = useRaycastToObjects();
  const holdRefs = useModeInputHoldRefs<{
    elementId: NodeId;
    justAppliedTo: NodeId;
  }>();

  const handlers = useMemo(
    () =>
      createModeInputHandlers<
        { elementId: NodeId; justAppliedTo: NodeId },
        never
      >(
        {
          pickTargets: (raycaster) => {
            const picks = collectPicksUnderCursor(
              raycaster,
              elements,
              getObject,
              {
                filter: isElement3D,
                nameFor: makeBodyOrProfileLabel(elements),
              },
            );
            if (picks.length === 0) return null;
            const elementId = toNodeId(picks[0]!.elementId);
            return { picks, resolved: { elementId, justAppliedTo: elementId } };
          },
          hoverTargets: (raycaster) => {
            const picks = collectPicksUnderCursor(
              raycaster,
              elements,
              getObject,
              {
                filter: isElement3D,
              },
            );
            if (picks.length === 0) return null;
            const elementId = toNodeId(picks[0]!.elementId);
            return { elementId, justAppliedTo: elementId };
          },
          onPickStart: ({ elementId }) => {
            applyPick(elementId);
          },
          onPickFromMenu: (item) => {
            applyPick(toNodeId(item.elementId));
          },
          onHover: (resolved) => {
            // Mousemove hover: tint the body under the cursor unless it's
            // already target/tool. Clear the previously hovered body.
            const hoveredId = resolved?.elementId ?? null;
            const prevHovered = hoveredRef.current;
            const currentTarget = targetBodyRef.current;
            const currentTools = toolBodiesRef.current;
            if (prevHovered && prevHovered !== hoveredId) {
              if (
                prevHovered !== currentTarget &&
                !currentTools.includes(prevHovered)
              ) {
                setElementColor(prevHovered, BODY.default);
              }
            }
            if (
              hoveredId &&
              hoveredId !== currentTarget &&
              !currentTools.includes(hoveredId)
            ) {
              const hoverColor = !currentTarget
                ? COMBINE.targetHover
                : COMBINE.toolHover;
              setElementColor(hoveredId, hoverColor);
            }
            hoveredRef.current = hoveredId;
            return null;
          },
          // Menu hover wants the *hovered* row's body, not the original pick.
          onMenuHover: applyHoverPreview,
          // While the menu is open, roll back the immediate target/tool toggle
          // so only the hovered row is highlighted. On cancel: re-apply the
          // original click (i.e. another toggle) so the no-menu state matches
          // a regular click. On menu pick: `applyPick(item.elementId)` runs
          // through `onPickFromMenu`; the rollback in `onMenuOpen` already
          // cleared the original click, so the menu pick toggles cleanly.
          onMenuOpen: ({ justAppliedTo }) => applyPick(justAppliedTo),
          onMenuCancel: ({ justAppliedTo }) => applyPick(justAppliedTo),
          onCancel: () => {},
          enableContextMenu: true,
        },
        {
          raycasterFromEvent,
          selectOtherRef,
          navToolActiveRef,
          isApplyingRef,
        },
        holdRefs,
      ),
    [
      elements,
      getObject,
      applyPick,
      applyHoverPreview,
      setElementColor,
      raycasterFromEvent,
      selectOtherRef,
      navToolActiveRef,
      holdRefs,
    ],
  );

  const performCombine = useCallback(async () => {
    if (!canCombine || !targetBody) return;

    const currentToolBodies = [...toolBodies];
    const result = await combineSelectedElements(operationType, {
      targetId: targetBody,
      toolIds: currentToolBodies,
      keepTools,
    });

    if (result !== true) {
      notify(
        `${OP_LABEL[operationType]} failed: ${typeof result === "string" ? result : "unknown error"}`,
        "error",
      );
      resetAllColors();
    } else if (result === true && keepTools) {
      currentToolBodies.forEach((id) => setElementColor(id, BODY.default));
    }

    setTargetBody(null);
    setToolBodies([]);
    hoveredRef.current = null;
    forceSceneUpdate();
  }, [
    canCombine,
    targetBody,
    toolBodies,
    operationType,
    keepTools,
    combineSelectedElements,
    forceSceneUpdate,
    resetAllColors,
    setElementColor,
  ]);

  return {
    handleCombineMouseDown: handlers.handleMouseDown,
    handleCombineMouseMove: handlers.handleMouseMove,
    handleCombineMouseUp: handlers.handleMouseUp,
    handleCombineContextMenu: handlers.handleContextMenu,
    performCombine,
    canCombine,
    operationType,
    setOperationType,
    targetBody,
    toolBodies,
    keepTools,
    setKeepTools,
    resetSelection,
    cleanup,
  };
}
