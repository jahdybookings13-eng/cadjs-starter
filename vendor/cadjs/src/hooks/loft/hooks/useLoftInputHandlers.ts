import { useMemo } from "react";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  collectPickableMeshes,
  collectPicksUnderCursor,
  isDescendantOf,
  makeBodyOrProfileLabel,
} from "../../../scene-operations/mesh-operations";
import { SELECTION } from "../../../theme";
import { useRaycastToObjects } from "../../shared/useRaycastToObjects";
import { createModeInputHandlers } from "../../shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "../../shared/useModeInputHoldRefs";
import { tintMeshes } from "../../shared/tintMeshes";
import { isFlatShape } from "../loft-helpers";
import type { LoftApplyBag } from "./useLoftApply";
import type { LoftStateBag } from "./useLoftState";

interface UseLoftInputHandlersParams {
  stateBag: LoftStateBag;
  apply: LoftApplyBag;
  cleanup: () => void;
}

export function useLoftInputHandlers({
  stateBag,
  apply,
  cleanup,
}: UseLoftInputHandlersParams) {
  const { elements, getObject } = useCadCore();
  const { forceSceneUpdate, navToolActiveRef, selectOtherRef } =
    useCadVisualizer();
  const { raycasterFromEvent } = useRaycastToObjects();
  const {
    state,
    hoveredId,
    setHoveredId,
    hoverPreviewRef,
    menuOpenRef,
    heldSnapshotRef,
    resetHover,
    profileFilter,
    toggleProfileSelection,
    applyHoverPreview,
    restoreFromSnapshot,
  } = stateBag;
  const { performLoft, canLoft } = apply;

  // Ref-based gate to avoid recomputing the whole factory invocation when
  // isApplying flips. The factory reads .current at handler-invocation time.
  const isApplyingRef = useMemo(
    () => ({ current: state.isApplying }),
    [state.isApplying],
  );
  const holdRefs = useModeInputHoldRefs<string>();

  return useMemo(() => {
    return createModeInputHandlers<string, void>(
      {
        pickTargets: (raycaster) => {
          const picks = collectPicksUnderCursor(
            raycaster,
            elements,
            getObject,
            {
              filter: profileFilter,
              nameFor: makeBodyOrProfileLabel(elements),
            },
          );
          if (picks.length === 0) return null;
          return { picks, resolved: picks[0]!.elementId };
        },
        hoverTargets: (raycaster) => {
          const meshes = collectPickableMeshes(elements, getObject);
          const intersects = raycaster.intersectObjects(meshes, false);
          if (intersects.length === 0) return null;
          const pickedObject = intersects[0]!.object;
          for (const el of elements) {
            const obj = getObject(el.nodeId);
            if (obj && isDescendantOf(pickedObject, obj)) {
              if (el.elementType !== "path" && isFlatShape(el.brep))
                return el.nodeId;
              return null;
            }
          }
          return null;
        },
        onPickStart: (firstId) => {
          // Snapshot before toggle so the menu callbacks can roll back to it.
          const snapshot = [...state.selectedProfiles];
          heldSnapshotRef.current = snapshot;
          toggleProfileSelection(firstId);
        },
        onPickFromMenu: (item) => {
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          const snapshot = heldSnapshotRef.current ?? [];
          restoreFromSnapshot(snapshot);
          toggleProfileSelection(item.elementId);
        },
        onHover: (foundId) => {
          if (
            foundId &&
            foundId !== hoveredId &&
            !state.selectedProfiles.includes(foundId)
          ) {
            resetHover();
            setHoveredId(foundId);
            tintMeshes(getObject, foundId, SELECTION.hover);
            forceSceneUpdate();
          } else if (!foundId && hoveredId) {
            resetHover();
            forceSceneUpdate();
          }
          // Bridging: applyHoverPreview is the menu-row hover preview, called
          // by the factory only via the SelectOther onHover path. Hover-without-
          // menu (the regular mousemove pass) doesn't reach into applyHoverPreview.
          void applyHoverPreview;
          return null;
        },
        onMenuOpen: () => {
          menuOpenRef.current = true;
          // Pause the immediate toggle visually so only the hovered row is highlighted.
          const snapshot = heldSnapshotRef.current ?? [];
          restoreFromSnapshot(snapshot);
        },
        onMenuCancel: (firstId) => {
          menuOpenRef.current = false;
          hoverPreviewRef.current = null;
          // Re-apply the immediate click toggle since the user dismissed the
          // menu, onMenuOpen restored the snapshot to "pause" the toggle.
          toggleProfileSelection(firstId);
        },
        onCancel: cleanup,
        onCommit: () => {
          if (canLoft) performLoft();
        },
        enableContextMenu: true,
      },
      {
        raycasterFromEvent,
        selectOtherRef,
        navToolActiveRef,
        isApplyingRef,
      },
      holdRefs,
    );
  }, [
    elements,
    getObject,
    profileFilter,
    toggleProfileSelection,
    applyHoverPreview,
    restoreFromSnapshot,
    resetHover,
    forceSceneUpdate,
    raycasterFromEvent,
    selectOtherRef,
    navToolActiveRef,
    isApplyingRef,
    holdRefs,
    state.selectedProfiles,
    hoveredId,
    setHoveredId,
    hoverPreviewRef,
    menuOpenRef,
    heldSnapshotRef,
    cleanup,
    canLoft,
    performLoft,
  ]);
}
