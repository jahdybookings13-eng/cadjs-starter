import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useCadCore } from "../contexts/CoreContext";
import { useCadVisualizer } from "../contexts/VisualizerContext";
import {
  collectPicksUnderCursor,
  makeBodyOrProfileLabel,
  PickItem,
} from "../scene-operations/mesh-operations";
import { BODY, SELECTION } from "../theme";
import { useRaycastToObjects } from "./shared/useRaycastToObjects";
import { createModeInputHandlers } from "./shared/createModeInputHandlers";
import { useModeInputHoldRefs } from "./shared/useModeInputHoldRefs";

export interface MoveModeState {
  selectedObject: string | null;
}

export interface MoveModeActions {
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseMove: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  clearSelection: () => void;
  cleanup: () => void;
}

type MovePick = { kind: "element"; elementId: string } | { kind: "empty" };

export function useMoveMode(): [MoveModeState, MoveModeActions] {
  const {
    elements,
    getObject,
    updateElementPosition,
    updateElementRotation,
    pushUndo,
    removeElement,
  } = useCadCore();

  const {
    camera,
    renderer,
    scene,
    controls: orbitControls,
    forceSceneUpdate,
    showGroundPlane,
    navToolActiveRef,
    selectOtherRef,
    gridSpacing,
    gridSnapEnabled,
    setContinuousRender,
  } = useCadVisualizer();

  const hoverPreviewRef = useRef<string | null>(null);
  const menuOpenRef = useRef(false);

  const showGroundPlaneRef = useRef(showGroundPlane);
  const gridSpacingRef = useRef(gridSpacing);
  const gridSnapEnabledRef = useRef(gridSnapEnabled);

  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const selectedObjectRef = useRef<string | null>(null);

  const [isRotating, setIsRotating] = useState<boolean>(false);

  const updateElementPositionRef = useRef(updateElementPosition);
  const updateElementRotationRef = useRef(updateElementRotation);
  const pushUndoRef = useRef(pushUndo);
  const removeElementRef = useRef(removeElement);
  const isRotatingRef = useRef(isRotating);
  const forceSceneUpdateRef = useRef(forceSceneUpdate);
  const isApplyingRef = useRef(false);
  const shiftHeldRef = useRef(false);

  useEffect(() => {
    selectedObjectRef.current = selectedObject;
  }, [selectedObject]);

  useEffect(() => {
    showGroundPlaneRef.current = showGroundPlane;
  }, [showGroundPlane]);

  useEffect(() => {
    gridSpacingRef.current = gridSpacing;
    gridSnapEnabledRef.current = gridSnapEnabled;
  }, [gridSpacing, gridSnapEnabled]);

  useEffect(() => {
    updateElementPositionRef.current = updateElementPosition;
    updateElementRotationRef.current = updateElementRotation;
    pushUndoRef.current = pushUndo;
    removeElementRef.current = removeElement;
    forceSceneUpdateRef.current = forceSceneUpdate;
  }, [
    updateElementPosition,
    updateElementRotation,
    pushUndo,
    removeElement,
    forceSceneUpdate,
  ]);

  useEffect(() => {
    isRotatingRef.current = isRotating;
  }, [isRotating]);

  const transformControlsRef = useRef<TransformControls | null>(null);
  const dragStartPositionRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!scene || !camera || !renderer) {
      console.error("Scene, camera, or renderer not available");
      return;
    }

    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = Boolean(event.value);
      if (dragging) {
        pushUndoRef.current(isRotatingRef.current ? "Rotate" : "Move");
        if (transformControlsRef.current?.object) {
          dragStartPositionRef.current =
            transformControlsRef.current.object.position.clone();
        }
      } else {
        dragStartPositionRef.current = null;
      }
      if (orbitControls) {
        orbitControls.enabled = !dragging;
      }
      // Keep the loop running through the drag so the gizmo stays in sync with
      // the cursor; on-demand rendering would otherwise only redraw on
      // `objectChange` events.
      setContinuousRender(dragging);
    };

    const onObjectChange = () => {
      if (selectedObjectRef.current && transformControlsRef.current?.object) {
        const position = new THREE.Vector3();
        transformControlsRef.current.object.getWorldPosition(position);

        if (
          showGroundPlaneRef.current &&
          gridSnapEnabledRef.current &&
          !shiftHeldRef.current &&
          transformControlsRef.current.mode === "translate" &&
          dragStartPositionRef.current
        ) {
          // Snap the *delta*, snapping the absolute position would jolt objects already off-grid.
          const gridSize = gridSpacingRef.current;
          const startPos = dragStartPositionRef.current;
          const delta = position.clone().sub(startPos);
          delta.x = Math.round(delta.x / gridSize) * gridSize;
          delta.y = Math.round(delta.y / gridSize) * gridSize;
          const snappedPosition = startPos.clone().add(delta);

          if (!position.equals(snappedPosition)) {
            transformControlsRef.current.object.position.copy(snappedPosition);
          }

          updateElementPositionRef.current(
            selectedObjectRef.current,
            snappedPosition,
          );
        } else {
          updateElementPositionRef.current(selectedObjectRef.current, position);
        }

        if (
          transformControlsRef.current.mode === "rotate" &&
          transformControlsRef.current.object
        ) {
          const obj = transformControlsRef.current.object;
          updateElementRotationRef.current(
            selectedObjectRef.current,
            obj.rotation.clone(),
          );
        }
      }
    };

    if (transformControlsRef.current) {
      transformControlsRef.current.removeEventListener(
        "dragging-changed",
        onDraggingChanged,
      );
      transformControlsRef.current.removeEventListener(
        "objectChange",
        onObjectChange,
      );

      transformControlsRef.current.detach();

      const oldGizmo = transformControlsRef.current.getHelper();
      scene.remove(oldGizmo);

      transformControlsRef.current.dispose();
      transformControlsRef.current = null;
    }

    const transformControls = new TransformControls(
      camera,
      renderer.domElement,
    );

    transformControls.setMode("translate");
    transformControls.setSpace("local");
    transformControls.setSize(1.25);
    transformControls.enabled = true;

    transformControls.addEventListener("dragging-changed", onDraggingChanged);
    transformControls.addEventListener("objectChange", onObjectChange);

    const gizmo = transformControls.getHelper();
    gizmo.userData.helperType = "gizmo";
    scene.add(gizmo);

    transformControlsRef.current = transformControls;

    forceSceneUpdate();

    return () => {
      if (transformControlsRef.current) {
        transformControlsRef.current.removeEventListener(
          "dragging-changed",
          onDraggingChanged,
        );
        transformControlsRef.current.removeEventListener(
          "objectChange",
          onObjectChange,
        );

        transformControlsRef.current.detach();

        const cleanupGizmo = transformControlsRef.current.getHelper();
        if (scene) scene.remove(cleanupGizmo);

        transformControlsRef.current.dispose();
        transformControlsRef.current = null;
      }
    };
  }, [scene, camera, renderer, orbitControls, setContinuousRender]);

  useEffect(() => {
    // Handlers read live state via refs so listeners attach once per mount; without
    // this they re-bind on every showGroundPlane/isRotating change during normal use.
    const resetToTranslate = () => {
      // Recover from desync (Alt-Tab, WM-stolen keyup, OS menu grabs).
      shiftHeldRef.current = false;
      if (transformControlsRef.current) {
        transformControlsRef.current.setMode("translate");
        transformControlsRef.current.setRotationSnap(null);
        // setMode swaps which gizmo helpers are visible but does not request a
        // frame; on-demand renderer would otherwise leave the old gizmo on screen
        // until the next mouse move.
        forceSceneUpdateRef.current();
      }
      setIsRotating(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        event.preventDefault();
        if (transformControlsRef.current) {
          transformControlsRef.current.setMode("rotate");
          // Rotation snap is mode-scoped so it can never fire during translate.
          if (showGroundPlaneRef.current && !shiftHeldRef.current) {
            transformControlsRef.current.setRotationSnap(Math.PI / 12);
          } else {
            transformControlsRef.current.setRotationSnap(null);
          }
          forceSceneUpdateRef.current();
          setIsRotating(true);
        }
      }
      if (event.key === "Shift") {
        shiftHeldRef.current = true;
        if (transformControlsRef.current) {
          transformControlsRef.current.setRotationSnap(null);
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const nodeId = selectedObjectRef.current;
        if (nodeId) {
          if (transformControlsRef.current) {
            transformControlsRef.current.detach();
          }
          setSelectedObject(null);
          removeElementRef.current(nodeId);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        // Reset unconditionally, guarding on isRotatingRef can lock the user out
        // when keydown/keyup pairs were broken by a window-focus event.
        resetToTranslate();
      }
      if (event.key === "Shift") {
        shiftHeldRef.current = false;
        if (
          transformControlsRef.current &&
          transformControlsRef.current.mode === "rotate" &&
          showGroundPlaneRef.current
        ) {
          transformControlsRef.current.setRotationSnap(Math.PI / 12);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetToTranslate);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetToTranslate);
    };
  }, []);

  useEffect(() => {
    const transformControls = transformControlsRef.current;
    if (!transformControls) return;
    if (!scene) return;

    if (selectedObject) {
      const obj = getObject(selectedObject);
      if (!obj) return;
      transformControls.attach(obj);
      (transformControls as unknown as { visible: boolean }).visible = true;
      forceSceneUpdate();
    } else {
      transformControls.detach();
      // On-demand renderer: detach() flips _root.visible to false and
      // clearSelection has already reset body color, but neither triggers a
      // frame. Without this the screen keeps showing the old selected state.
      forceSceneUpdate();
    }
  }, [selectedObject, scene, getObject, forceSceneUpdate]);

  const updateWireframeHelpers = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return;

      const obj = getObject(nodeId);
      if (!obj) return;

      obj.traverse((child) => {
        if (
          child.userData.helperType === "edge" ||
          child.userData.helperType === "vertex"
        ) {
          child.visible = true;
        }
      });
    },
    [getObject],
  );

  const resetObjectVisuals = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (!obj) return;
      // Two passes, combining color reset and helper-hide into one traverse would
      // skip the helper children we want to hide.
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            const m = mat as THREE.MeshStandardMaterial;
            m.color.setHex(BODY.default);
            m.polygonOffset = false;
            m.polygonOffsetFactor = 0;
            m.polygonOffsetUnits = 0;
            m.needsUpdate = true;
          }
        }
      });
      obj.traverse((child) => {
        if (
          child.userData.helperType === "edge" ||
          child.userData.helperType === "vertex"
        ) {
          child.visible = false;
        }
      });
    },
    [getObject],
  );

  const applySelectionColor = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (!obj) return;
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            const m = mat as THREE.MeshStandardMaterial;
            m.color.setHex(SELECTION.selected);
            // Nudge the depth values toward the camera so the selected profile
            // wins z-fighting against an unselected coplanar neighbour.
            m.polygonOffset = true;
            m.polygonOffsetFactor = -1;
            m.polygonOffsetUnits = -1;
            m.needsUpdate = true;
          }
        }
      });
    },
    [getObject],
  );

  const clearSelection = useCallback(() => {
    if (selectedObjectRef.current) {
      resetObjectVisuals(selectedObjectRef.current);
    }

    if (transformControlsRef.current) {
      transformControlsRef.current.detach();
    }

    setSelectedObject(null);
  }, [resetObjectVisuals]);

  const cleanup = useCallback(() => {
    if (selectedObjectRef.current) {
      resetObjectVisuals(selectedObjectRef.current);
    }
    if (transformControlsRef.current) {
      transformControlsRef.current.detach();
      transformControlsRef.current.getHelper().visible = false;
    }
    setSelectedObject(null);
  }, [resetObjectVisuals]);

  const selectElementById = useCallback(
    (elementId: string) => {
      if (
        selectedObjectRef.current &&
        selectedObjectRef.current !== elementId
      ) {
        resetObjectVisuals(selectedObjectRef.current);
      }
      setSelectedObject(elementId);
      applySelectionColor(elementId);
      updateWireframeHelpers(elementId);
    },
    [applySelectionColor, resetObjectVisuals, updateWireframeHelpers],
  );

  const restoreHoverPreview = useCallback(
    (nodeId: string) => {
      const obj = getObject(nodeId);
      if (!obj) return;
      // Restore depth-test + render-order so the body stops drawing through occluders.
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            (mat as THREE.MeshStandardMaterial).depthTest = true;
          }
          (child as THREE.Mesh).renderOrder = 0;
        }
      });
      // The select-other menu temporarily pauses the persistent selection tint so the
      // hovered row is the only highlight; we restore it on close.
      if (!menuOpenRef.current && nodeId === selectedObjectRef.current) {
        applySelectionColor(nodeId);
      } else {
        resetObjectVisuals(nodeId);
      }
    },
    [getObject, applySelectionColor, resetObjectVisuals],
  );

  const applyHoverPreview = useCallback(
    (item: PickItem | null) => {
      // Depth-test override makes occluded bodies visible "through" their occluders (Fusion-style).
      const prev = hoverPreviewRef.current;
      if (prev && (!item || item.elementId !== prev)) {
        restoreHoverPreview(prev);
        hoverPreviewRef.current = null;
      }
      if (!item) return;
      const obj = getObject(item.elementId);
      if (!obj) return;
      obj.traverse((child) => {
        if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            (mat as THREE.MeshStandardMaterial).color.setHex(SELECTION.hover);
            (mat as THREE.MeshStandardMaterial).depthTest = false;
          }
          (child as THREE.Mesh).renderOrder = 999;
        }
      });
      hoverPreviewRef.current = item.elementId;
    },
    [getObject, restoreHoverPreview],
  );

  const { raycasterFromEvent } = useRaycastToObjects();
  const holdRefs = useModeInputHoldRefs<MovePick>();

  const handlers = useMemo(
    () =>
      createModeInputHandlers<MovePick, never>(
        {
          pickTargets: (raycaster) => {
            // Suppress mode-pick clicks while the gizmo is being dragged so the
            // user can't accidentally re-select another element mid-drag.
            if (transformControlsRef.current?.dragging) return null;

            const picks = collectPicksUnderCursor(
              raycaster,
              elements,
              getObject,
              {
                nameFor: makeBodyOrProfileLabel(elements),
              },
            );
            if (picks.length === 0) {
              return { picks: [], resolved: { kind: "empty" } };
            }
            return {
              picks,
              resolved: { kind: "element", elementId: picks[0]!.elementId },
            };
          },
          onPickStart: (resolved) => {
            if (resolved.kind === "element") {
              selectElementById(resolved.elementId);
            } else {
              clearSelection();
            }
          },
          onPickFromMenu: (item) => {
            menuOpenRef.current = false;
            hoverPreviewRef.current = null;
            selectElementById(item.elementId);
          },
          onMenuOpen: (resolved) => {
            menuOpenRef.current = true;
            if (resolved.kind === "element") {
              resetObjectVisuals(resolved.elementId);
            }
          },
          onMenuCancel: () => {
            menuOpenRef.current = false;
            hoverPreviewRef.current = null;
            if (selectedObjectRef.current) {
              applySelectionColor(selectedObjectRef.current);
            }
          },
          onMenuHover: applyHoverPreview,
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
      selectElementById,
      clearSelection,
      resetObjectVisuals,
      applySelectionColor,
      applyHoverPreview,
      raycasterFromEvent,
      selectOtherRef,
      navToolActiveRef,
      holdRefs,
    ],
  );

  return [
    { selectedObject },
    {
      handleMouseDown: handlers.handleMouseDown,
      handleMouseMove: handlers.handleMouseMove,
      handleMouseUp: handlers.handleMouseUp,
      handleContextMenu: handlers.handleContextMenu,
      clearSelection,
      cleanup,
    },
  ];
}
