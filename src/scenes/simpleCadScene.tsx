import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  NamedView,
  useCadCore,
  useCadVisualizer,
  useCameraAnimation,
  useSelectOther,
} from "@vitekk02/cadjs/react";
import {
  HELPERS,
  SceneMode,
  buildBrowserSections,
  buildElementHelpers,
} from "@vitekk02/cadjs";
import { useToast } from "../contexts/ToastContext";
import ViewCube from "../components/ViewCube";
import { BrowserSidePanel } from "../components/BrowserSidePanel";
import { SketchPropertiesSidePanel } from "../components/SketchPropertiesSidePanel";
import { useLineMaterialResize } from "../hooks/useLineMaterialResize";
import { useOriginHelpers } from "../hooks/useOriginHelpers";
import { StatusBar } from "../components/StatusBar";
import { PrimaryToolbar } from "../components/PrimaryToolbar";
import { SceneOverlays } from "../components/SceneOverlays";
import { useSceneKeyboardBindings } from "../hooks/useSceneKeyboardBindings";
import { MODE_COMPONENTS } from "./modes";
import { useVRSession } from "../components/vr/useVRSession";
import { VRButton } from "../components/vr/VRButton";
interface SimpleCadSceneProps {
  initialMode?: SceneMode;
}

const SimpleCadScene: React.FC<SimpleCadSceneProps> = ({
  initialMode = "move",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const {
    selectElement,
    deselectElement,
    elements,
    getObject,
    mode,
    removeElement,
    selectedElements,
    setMode,
    updateElementPosition,
    activeSketch,
    finishSketch,
    cancelSketch,
    editSketch,
    solveSketch,
    featureTree,
    toggleNodeVisibility,
    toggleNodeExpanded,
    renameNode,
    deleteNode,
    sectionExpandedState,
    toggleSectionExpanded,
    originVisibility,
    toggleOriginVisibility,
    deselectAll,
    undo,
    redo,
    canUndo,
    canRedo,
    undoActionName,
    redoActionName,
    undoStack,
    redoStack,
    undoSketch,
    redoSketch,
    canUndoSketch,
    canRedoSketch,
    isOperationPending,
    duplicateSelectedElements,
    updatePrimitivesAndSolve,
    updatePrimitivePropertyAndSolve,
    addConstraintAndSolve,
    removeConstraint: removeSketchConstraint,
    pushSketchUndo,
  } = useCadCore();
  const {
    forceSceneUpdate,
    getMouseIntersection,
    highlightElement,
    mountRenderer,
    renderer,
    camera,
    scene,
    unhighlightElement,
    unmountRenderer,
    showGroundPlane,
    toggleGroundPlane,
    cursorPosition,
    updateCursorPosition,
    controls,
    projectionType,
    toggleProjection,
    navToolActiveRef,
    controlsRef,
    selectOtherRef,
    gridSpacing,
    setGridSpacing,
    gridSnapEnabled,
    setGridSnapEnabled,
  } = useCadVisualizer();

  // E2E test hook: only mounted in dev/test builds. Tree-shaken from production.
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "test") return;
    (window as unknown as { __cadDebug?: object }).__cadDebug = {
      getElements: () =>
        elements.map((el) => ({
          nodeId: el.nodeId,
          position: [el.position.x, el.position.y, el.position.z],
        })),
      getMode: () => mode,
      getFeatureTree: () => featureTree,
      getCameraQuat: () =>
        camera
          ? [
              camera.quaternion.x,
              camera.quaternion.y,
              camera.quaternion.z,
              camera.quaternion.w,
            ]
          : null,
    };
    return () => {
      delete (window as unknown as { __cadDebug?: object }).__cadDebug;
    };
  }, [elements, mode, featureTree, camera]);

  const { inVR, vrSupported, enterVR, exitVR } = useVRSession();

  const {
    api: selectOtherApi,
    menu: selectOtherMenu,
    setMenu: setSelectOtherMenu,
  } = useSelectOther();
  useEffect(() => {
    selectOtherRef.current = selectOtherApi;
    return () => {
      selectOtherRef.current = null;
    };
  }, [selectOtherApi, selectOtherRef]);
  // Close the menu whenever mode changes — otherwise a stale onPick would
  // target the previous mode. Treat as a cancel so the prior mode can restore
  // any visuals it paused while the menu was open.
  useEffect(() => {
    setSelectOtherMenu((prev) => {
      prev?.onCancel?.();
      return null;
    });
  }, [mode, setSelectOtherMenu]);
  const { showToast } = useToast();
  const [modePanelSlot, setModePanelSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [moveSelectedObject, setMoveSelectedObject] = useState<string | null>(
    null,
  );
  const [sketchIsSelectingPlane, setSketchIsSelectingPlane] = useState(false);
  const [sketchStartCounter, setSketchStartCounter] = useState(0);
  const [sketchSelectedPrimitives, setSketchSelectedPrimitives] = useState<
    string[]
  >([]);
  const originGroupRef = useOriginHelpers(scene, originVisibility);
  const ModeContent = inVR && mode === "sketch" ? undefined : MODE_COMPONENTS[mode];

  const [undoDropdownOpen, setUndoDropdownOpen] = useState(false);
  const [redoDropdownOpen, setRedoDropdownOpen] = useState(false);
  const [planeOffset, setPlaneOffset] = useState(0);
  const undoDropdownRef = useRef<HTMLDivElement>(null);
  const redoDropdownRef = useRef<HTMLDivElement>(null);

  const { animateToView, fitAll } = useCameraAnimation(camera, controls);

  const handleViewCubeClick = (viewName: NamedView) => {
    animateToView(viewName);
  };

  const handleFitAll = () => {
    fitAll(elements, getObject);
  };

  const browserSections = useMemo(
    () =>
      buildBrowserSections(featureTree, sectionExpandedState, originVisibility),
    [featureTree, sectionExpandedState, originVisibility],
  );

  // Selection sync: tree → 3D viewport
  const handleBrowserSelect = (elementId: string) => {
    // Deselect any currently selected elements first
    deselectAll();
    selectElement(elementId);
  };

  // Route visibility toggles: origin items → originVisibility, others → featureTree
  const handleToggleVisibility = (nodeId: string) => {
    if (nodeId.startsWith("origin-")) {
      toggleOriginVisibility(nodeId);
    } else {
      toggleNodeVisibility(nodeId);
    }
  };

  // Determine which element is currently selected for tree highlight
  const selectedElementId =
    selectedElements.length === 1 ? selectedElements[0] : undefined;

  useEffect(() => {
    if (!mountRef.current) return;

    if (renderer) {
      unmountRenderer();
    }

    const cleanup = mountRenderer(mountRef.current);
    return cleanup;
  }, []);

  useEffect(() => {
    if (!scene) return;
    elements.forEach((element) => {
      const obj = getObject(element.nodeId);
      if (obj) {
        buildElementHelpers(obj, element, {
          edgeColor: HELPERS.edgeColor,
          edgeWidth: HELPERS.edgeWidth,
          vertexColor: HELPERS.vertexColor,
        });
      }
    });
  }, [elements, scene, getObject]);

  useLineMaterialResize(scene);

  useEffect(() => {
    if (!renderer) return;

    const handleMouseMove = (event: MouseEvent) => {
      updateCursorPosition(event);
    };

    renderer.domElement.addEventListener("mousemove", handleMouseMove);

    return () => {
      renderer.domElement.removeEventListener("mousemove", handleMouseMove);
    };
  }, [renderer, updateCursorPosition]);

  // Centralized mode cleanup: when mode changes, clean up the previous mode.
  // Extrude/sweep/loft are NOT listed here — those hooks self-clean via their
  // own `useEffect` keyed on `mode`. Listing them again would double-fire.
  const modeCleanupMap = useMemo<
    Partial<Record<SceneMode, (() => void) | null>>
  >(
    () => ({
      sketch: null, // managed by finishSketch/cancelSketch
    }),
    [],
  );

  const prevModeRef = useRef(mode);
  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode !== mode) {
      const cleanupFn = modeCleanupMap[prevMode];
      if (cleanupFn) cleanupFn();
    }
    prevModeRef.current = mode;
  }, [mode, modeCleanupMap]);

  useSceneKeyboardBindings({
    mode,
    setMode,
    activeSketch: !!activeSketch,
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
  });

  // Close undo/redo dropdowns on click outside
  useEffect(() => {
    if (!undoDropdownOpen && !redoDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        undoDropdownOpen &&
        undoDropdownRef.current &&
        !undoDropdownRef.current.contains(event.target as Node)
      ) {
        setUndoDropdownOpen(false);
      }
      if (
        redoDropdownOpen &&
        redoDropdownRef.current &&
        !redoDropdownRef.current.contains(event.target as Node)
      ) {
        setRedoDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [undoDropdownOpen, redoDropdownOpen]);

  // (Per-mode mouse and plane-selection listeners now live in their respective
  // *ModeContent components.)

  const isBooleanMode = mode === "combine";

  // Lock UI during active sketch or async operations
  const inActiveSketch = mode === "sketch" && !!activeSketch;
  const isLocked = inActiveSketch || isOperationPending;

  const showSecondaryBar =
    (mode === "sketch" && !sketchIsSelectingPlane && activeSketch) ||
    isBooleanMode ||
    mode === "extrude" ||
    mode === "fillet" ||
    mode === "sweep" ||
    mode === "loft" ||
    mode === "revolve" ||
    mode === "measure";

  return (
    <div className="w-full h-screen flex overflow-hidden">
      <BrowserSidePanel
        sections={browserSections}
        selectedElementId={selectedElementId}
        onSelectNode={handleBrowserSelect}
        onToggleVisibility={handleToggleVisibility}
        onToggleSectionExpanded={toggleSectionExpanded}
        onToggleItemExpanded={toggleNodeExpanded}
        onRenameNode={renameNode}
        onDeleteNode={deleteNode}
        onEditSketch={editSketch}
      />

      {/* Center column: toolbars + canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <PrimaryToolbar
          mode={mode}
          setMode={setMode}
          isLocked={isLocked}
          isOperationPending={isOperationPending}
          isBooleanMode={isBooleanMode}
          sketchIsSelectingPlane={sketchIsSelectingPlane}
          onSketchClick={() => {
            if (mode !== "sketch") {
              setMode("sketch");
              setSketchStartCounter((c) => c + 1);
            } else if (!activeSketch) {
              setSketchStartCounter((c) => c + 1);
            }
          }}
          showGroundPlane={showGroundPlane}
          toggleGroundPlane={toggleGroundPlane}
          onFitAll={handleFitAll}
          inSketch={mode === "sketch" && !!activeSketch}
          canUndoSketch={canUndoSketch}
          canRedoSketch={canRedoSketch}
          undoSketch={undoSketch}
          redoSketch={redoSketch}
          canUndo={canUndo}
          canRedo={canRedo}
          undo={undo}
          redo={redo}
          undoActionName={undoActionName}
          redoActionName={redoActionName}
          undoStack={undoStack}
          redoStack={redoStack}
          undoDropdownOpen={undoDropdownOpen}
          redoDropdownOpen={redoDropdownOpen}
          setUndoDropdownOpen={setUndoDropdownOpen}
          setRedoDropdownOpen={setRedoDropdownOpen}
          undoDropdownRef={undoDropdownRef}
          redoDropdownRef={redoDropdownRef}
        />

        <VRButton
          vrSupported={vrSupported}
          inVR={inVR}
          onEnterVR={enterVR}
          onExitVR={exitVR}
        />

        {/* Secondary Action Bar */}
        {showSecondaryBar && (
          <div className="flex-none h-10 bg-gray-800 border-b border-gray-700 flex items-center z-20">
            <div
              className="flex items-center px-3 min-w-0 flex-1 overflow-visible"
              ref={setModePanelSlot}
            />
          </div>
        )}

        {/* Canvas + right panel row */}
        <div className="flex-1 flex flex-row min-h-0">
          {/* Canvas area */}
          <div className="flex-1 relative min-h-0 overflow-hidden">
            <div
              ref={mountRef}
              className="absolute inset-0"
              data-testid="cad-canvas"
            />

            {/* ViewCube — responsive container */}
            <div className="absolute top-2 right-2 md:top-4 md:right-4 w-20 h-20 md:w-[120px] md:h-[120px] z-10">
              <ViewCube camera={camera} onViewChange={handleViewCubeClick} />
            </div>

            {ModeContent && (
              <ModeContent
                panelSlot={modePanelSlot}
                setMoveSelectedObject={setMoveSelectedObject}
                setSketchIsSelectingPlane={setSketchIsSelectingPlane}
                originGroupRef={originGroupRef}
                sketchStartCounter={sketchStartCounter}
                setSketchSelectedPrimitives={setSketchSelectedPrimitives}
              />
            )}

            {/* Projection toggle */}
            <button
              onClick={toggleProjection}
              disabled={mode === "sketch"}
              title={
                mode === "sketch"
                  ? "Orthographic enforced in sketch mode"
                  : `Switch to ${projectionType === "perspective" ? "Orthographic" : "Perspective"} (5)`
              }
              className="absolute top-[92px] md:top-[140px] right-[8px] md:right-[16px] z-10 px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{
                width: 120,
                backgroundColor: "rgba(90, 90, 90, 0.85)",
                color: "#e0e0e0",
                border: "1px solid #444",
                opacity: mode === "sketch" ? 0.4 : 1,
                cursor: mode === "sketch" ? "not-allowed" : "pointer",
              }}
            >
              {projectionType === "perspective"
                ? "Perspective"
                : "Orthographic"}
            </button>

            <SceneOverlays
              mode={mode}
              selectOtherMenu={selectOtherMenu}
              setSelectOtherMenu={setSelectOtherMenu}
              isSelectingPlane={sketchIsSelectingPlane}
              controlsRef={controlsRef}
              navToolActiveRef={navToolActiveRef}
              onFitAll={handleFitAll}
              activeSketch={!!activeSketch}
            />

            <StatusBar
              cursorPosition={cursorPosition}
              mode={mode}
              activeSketch={activeSketch}
              moveSelectedObject={moveSelectedObject}
              elements={elements}
            />
          </div>

          {mode === "sketch" && activeSketch && (
            <SketchPropertiesSidePanel
              activeSketch={activeSketch}
              selectedPrimitives={sketchSelectedPrimitives}
              onUpdatePoint={updatePrimitivesAndSolve}
              onUpdatePrimitiveProperty={updatePrimitivePropertyAndSolve}
            />
          )}
        </div>
        {/* end canvas + right panel row */}
      </div>
      {/* end center column */}
    </div>
  );
};

export default SimpleCadScene;
