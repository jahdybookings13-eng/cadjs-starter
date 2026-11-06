import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import type {
  Mesh as ThreeMesh,
  MeshStandardMaterial as ThreeMat,
  Object3D as ThreeObj,
} from "three";
import {
  HELPERS,
  SceneMode,
  buildBrowserSections,
  buildElementHelpers,
  debugLog,
  ImportExportService,
} from "@vitekk02/cadjs";
import { buildInsertNode } from "../model/onshapeHistory";
import { registerImportAsset } from "../model/assets";
import { variablesForFeature, variablesPanelRows } from "../model/variables";
import {
  buildBoxNodes,
  buildCylinderNodes,
  buildMirrorNodes,
  buildSphereNodes,
  buildTorusNodes,
  buildCircularPatternNode,
  buildCurvePatternNode,
  buildDeleteBodiesNode,
  buildDeleteFaceNode,
  buildCreatePlaneNode,
  buildCurveOnFaceNode,
  buildMoveFaceNode,
  buildSectionNode,
  buildSplitNode,
  buildDraftNode,
  buildFillSurfaceNode,
  buildBoundarySurfaceNode,
  buildConstrainedSurfaceNode,
  buildHoleNode,
  buildOffsetSurfaceNode,
  buildProjectCurvesNode,
  buildRectangleProfileNodes,
  buildRuledSurfaceNode,
  buildDatumSketchExtrudeNodes,
  buildFeaturePatternNode,
  buildFlangeNode,
  buildHemNode,
  buildUnfoldNode,
  buildWrapNode,
  buildThreadNode,
  buildScaleNode,
  buildShellNode,
  buildThickenNode,
} from "../model/primitives";
import {
  buildFastenerPresetNode,
  buildScrewHolePresetNode,
} from "../model/fasteners";
import type { FastenerSpec } from "../model/fastenerPresets";
import { buildShape, type ShapeKind } from "../model/primitiveLibrary";
import {
  buildConstraintNode,
  extendSnapshot,
  trimSnapshot,
  type SketchSnapLike,
} from "../model/constraints";
import { buildEdgeFilletNode, modifyFillet } from "../model/filletEdit";
import {
  edgeLength,
  nearestVertexDistance,
  polylineLength,
  straightEdgeAngle,
} from "../model/measure";
import { scadgenHistory } from "../model/featureEngine";
import { faceOwnerOf, scadgenExecutor } from "../model/executor";
import { scadgenSceneSync, type ElementAppearance } from "../model/sceneSync";
import { createSceneBus, type HookBag } from "../model/actionBus";
import { loadProject, saveProject } from "../model/documentStore";
import "../model/bootstrap";
import { makeElementAuthor, pairNewElements } from "../model/elementAuthoring";
import {
  AssemblyNode,
  buildTree,
  identity,
  placeObject,
  solve,
  type Assembly,
  type Mate,
  type RefMap,
} from "../assemblies";

let scadgenIdCounter = 0;
import {
  NamedView,
  useCadCore,
  useCadVisualizer,
  useCameraAnimation,
  useSelectOther,
} from "@vitekk02/cadjs/react";
import { useToast } from "../contexts/ToastContext";
import ViewCube from "../components/ViewCube";
import { BrowserSidePanel } from "../components/BrowserSidePanel";
import { SketchPropertiesSidePanel } from "../components/SketchPropertiesSidePanel";
import { useLineMaterialResize } from "../hooks/useLineMaterialResize";
import { useOriginHelpers } from "../hooks/useOriginHelpers";
import { StatusBar } from "../components/StatusBar";
import { AssemblyPanel } from "../components/AssemblyPanel";
import { PrintWizard } from "../components/PrintWizard";
import { EcadPanel } from "../components/EcadPanel";
import { installEcad } from "../ecad/install";
import { registerEcadAgent } from "../ecad/agent";
import {
  exportSelectionStl,
  selectionBboxMM,
  type SelectionStl,
} from "../printers/exportSelection";
import { PrimaryToolbar } from "../components/PrimaryToolbar";
import { SceneOverlays } from "../components/SceneOverlays";
import { useSceneKeyboardBindings } from "../hooks/useSceneKeyboardBindings";
import { MODE_COMPONENTS } from "./modes";
import { useVRSession } from "../components/vr/useVRSession";
import { VRButton } from "../components/vr/VRButton";
import {
  OrchestratorView,
  makeFluxSession,
  registerFluxBus,
  type FluxSession,
  type SelectedPart,
} from "../flux";
interface SimpleCadSceneProps {
  initialMode?: SceneMode;
}

const SimpleCadScene: React.FC<SimpleCadSceneProps> = ({
  initialMode = "move",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const pendingAuthorFixups = useRef(
    new Map<string, import("../model/executor").BodyOutput>(),
  );
  const seenElementIds = useRef(new Set<string>());
  const {
    selectElement,
    deselectElement,
    elements,
    addElement,
    getObject,
    idCounter,
    updateElementBrep,
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
  const [printOpen, setPrintOpen] = useState(false);
  // ECAD: virtual microcontrollers + screens (desk/VR/voice/AI share one bus).
  // The sim/layer persist app-wide; installEcad re-registers actions whenever
  // this effect rebuilds the ActionBus, and the flux effect wires the AI agent.
  const [ecadOpen, setEcadOpen] = useState(false);
  const ecadRef = useRef<import("../ecad/install").Ecad | null>(null);

  // In-scene assembly state (driven by the action bus: assembly.*).
  const assemblyRef = useRef<{ asm: Assembly; refs: RefMap | undefined }>({
    asm: { id: "root", instances: [], mates: [] },
    refs: undefined,
  });
  const busRef = useRef<import("../model/actionBus").ActionBus | null>(null);

  // E2E test hook: only mounted in dev/test builds. Tree-shaken from production.
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "test") return;
    (window as unknown as { __cadDebug?: object }).__cadDebug = {
      getElements: () =>
        elements.map((el) => ({
          nodeId: el.nodeId,
          position: [el.position.x, el.position.y, el.position.z],
          visible: (
            getObject as (id: string) => { visible?: boolean } | undefined
          )(el.nodeId)?.visible,
        })),
      getMode: () => mode,
      getSelection: () =>
        selectedElements.map((id) => {
          const el = elements.find((e) => e.nodeId === id);
          return {
            nodeId: id,
            position: el ? [el.position.x, el.position.y, el.position.z] : null,
          };
        }),
      selectElement: (id: string) => selectElement(id),
      deselectElement: (id: string) => deselectElement(id),
      getSelectionContext: () => {
        if (selectedElements.length === 0)
          return { kind: "none", ids: [], position: null };
        const el = elements.find((e) => e.nodeId === selectedElements[0]);
        return {
          kind: selectedElements.length > 1 ? "bodies" : "body",
          ids: [...selectedElements],
          position: el ? [el.position.x, el.position.y, el.position.z] : null,
        };
      },
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
      scadgen: {
        nextId: () => `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`,
        configureSync: () =>
          scadgenSceneSync.configure(
            {
              updateElementBrep,
              postCreate: (nodeId, out) => {
                pendingAuthorFixups.current.set(nodeId, out);
              },
              createElement: makeElementAuthor(
                (b, p) =>
                  (addElement as unknown as (b: unknown, p: unknown) => void)(
                    b,
                    p,
                  ),
                () => idCounter,
              ),
              setElementHidden: (id, hidden) => {
                const o = getObject(id);
                if (o) o.visible = !hidden;
              },
              setElementAppearance: (id, ap) => {
                const o = getObject(id) as ThreeObj | undefined;
                if (!o) return;
                o.traverse((child) => {
                  const mesh = child as ThreeMesh & {
                    isMesh?: boolean;
                    material?: ThreeMat | ThreeMat[];
                  };
                  if (!mesh.isMesh) return;
                  const mats = Array.isArray(mesh.material)
                    ? mesh.material
                    : [mesh.material];
                  for (const mm of mats) {
                    if (!mm) continue;
                    if (ap.color !== undefined)
                      (mm as ThreeMat).color.set(ap.color!);
                    if (ap.opacity !== undefined) {
                      mm.opacity = ap.opacity;
                      mm.transparent = ap.opacity < 1;
                      mm.depthWrite = ap.opacity >= 1;
                    }
                    mm.needsUpdate = true;
                  }
                });
              },
            },
            scadgenHistory,
          ),
        box: (
          w: number,
          h: number,
          d: number,
          opts?: { midplane?: boolean; opposite?: boolean },
        ) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          for (const n of buildBoxNodes(fid, "Box", w, h, d, opts))
            scadgenHistory.add(n);
          return fid;
        },
        cylinder: (r: number, h: number) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          for (const n of buildCylinderNodes(fid, "Cyl", r, h))
            scadgenHistory.add(n);
          return fid;
        },
        primitive: (kind: ShapeKind, opts: Record<string, unknown> = {}) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          const r = buildShape(fid, kind, opts);
          for (const n of r.nodes) scadgenHistory.add(n);
          return {
            featureId: r.bodyFeatureId,
            profileFeatureId: r.profileFeatureId,
          };
        },
        sphere: (r: number) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          for (const n of buildSphereNodes(fid, "Sph", r))
            scadgenHistory.add(n);
          return fid;
        },
        torus: (ringR: number, tubeR: number) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          for (const n of buildTorusNodes(fid, "Torus", ringR, tubeR))
            scadgenHistory.add(n);
          return fid;
        },
        mirror: (src: string, axis: "X" | "Y" | "Z") => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildMirrorNodes(fid, "Mirror", src, axis));
          return fid;
        },
        rect: (w: number, h: number) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          const nodes = buildRectangleProfileNodes(fid, "Rect", {
            width: w,
            height: h,
          });
          for (const n of nodes) scadgenHistory.add(n);
          return nodes[0]?.featureId ?? fid;
        },
        constrain: (
          sketchFid: string,
          type: string,
          primitiveIds: string[],
          value?: number,
        ) => {
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildConstraintNode({
              featureId: fid,
              sketchFeatureId: sketchFid,
              type: type as never,
              primitiveIds,
              ...(value !== undefined ? { value } : {}),
            }),
          );
          return fid;
        },
        trimAt: (sketchFid: string, primId: string, x: number, y: number) => {
          const node = scadgenHistory
            .evaluatedNodes()
            .find((n) => n.featureId === sketchFid);
          const snap = node?.extensions?.sketch as SketchSnapLike | undefined;
          if (!snap) return null;
          const r = trimSnapshot(snap, primId, { x, y });
          if (!r) return null;
          scadgenHistory.setSnapshot(sketchFid, r.snapshot as never);
          return r.removed;
        },
        extendTo: (sketchFid: string, lineId: string, isStart: boolean) => {
          const node = scadgenHistory
            .evaluatedNodes()
            .find((n) => n.featureId === sketchFid);
          const snap = node?.extensions?.sketch as SketchSnapLike | undefined;
          if (!snap) return false;
          const r = extendSnapshot(snap, lineId, isStart);
          if (!r) return false;
          scadgenHistory.setSnapshot(sketchFid, r as never);
          return true;
        },
        faceDirs: (fid: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          if (!o) return null;
          const json = o.brep.toJSON();
          const verts = json.vertices;
          const sc = verts.length
            ? verts.reduce(
                (a, v) => ({
                  x: a.x + v.x / verts.length,
                  y: a.y + v.y / verts.length,
                  z: a.z + v.z / verts.length,
                }),
                { x: 0, y: 0, z: 0 },
              )
            : { x: 0, y: 0, z: 0 };
          return json.faces.map((f, i) => {
            const fv = f.vertices ?? [];
            const c = fv.length
              ? fv.reduce(
                  (a, v) => ({
                    x: a.x + v.x / fv.length,
                    y: a.y + v.y / fv.length,
                    z: a.z + v.z / fv.length,
                  }),
                  { x: 0, y: 0, z: 0 },
                )
              : sc;
            const r = {
              x: c.x - sc.x,
              y: c.y - sc.y,
              z: c.z - sc.z,
            };
            const len = Math.hypot(r.x, r.y, r.z) || 1;
            return {
              tag: o.faceTags[i] ?? String(i),
              center: c,
              normal: { x: r.x / len, y: r.y / len, z: r.z / len },
            };
          });
        },
        ftags: (fid: string) =>
          scadgenExecutor.outputs.get(fid)?.faceTags ?? null,
        shell: (fid: string, tag: string, t: number) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildShellNode(nf, "Shell", fid, [tag], t));
          return nf;
        },
        draft: (
          fid: string,
          tags: string[],
          angleDeg: number,
          neutral: string,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildDraftNode(nf, "Draft", fid, tags, angleDeg, neutral),
          );
          return nf;
        },
        hole: (
          fid: string,
          centers: [number, number, number][],
          r: number,
          d: number,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildHoleNode(nf, "Hole", fid, centers, r, d));
          return nf;
        },
        circPattern: (
          fid: string,
          count: number,
          extra?: string[],
          separate?: boolean,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildCircularPatternNode(
              nf,
              "Circular Pattern",
              fid,
              count,
              [0, 0, 1],
              360,
              extra ?? [],
              !!separate,
            ),
          );
          return nf;
        },
        delBodies: (owners: string[]) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildDeleteBodiesNode(nf, "Delete Bodies", owners),
          );
          return nf;
        },
        bodiesOf: (fid: string) =>
          (scadgenExecutor.bodySets.get(fid) ?? []).map((b) => b.featureId),
        curvePattern: (
          fid: string,
          pts: [number, number, number][],
          count: number,
          align?: boolean,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildCurvePatternNode(
              nf,
              "Curve Pattern",
              fid,
              pts,
              count,
              !!align,
            ),
          );
          return nf;
        },
        projectCurves: (
          srcFid: string,
          tgtFid: string,
          tags: string[],
          dir: [number, number, number],
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildProjectCurvesNode(
              nf,
              "Projected Curves",
              srcFid,
              tgtFid,
              tags,
              dir,
            ),
          );
          return nf;
        },
        ruledSurface: (fid: string, tagA: string, tagB: string) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildRuledSurfaceNode(nf, "Ruled Surface", fid, tagA, tagB),
          );
          return nf;
        },
        fillSurface: (fid: string, faceTag: string) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildFillSurfaceNode(nf, "Fill Surface", fid, faceTag),
          );
          return nf;
        },
        boundarySurface: (fid: string, faceTag: string) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildBoundarySurfaceNode(nf, "Boundary Surface", fid, faceTag),
          );
          return nf;
        },
        constrainedSurface: (fid: string, faceTag: string) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildConstrainedSurfaceNode(
              nf,
              "Constrained Surface",
              fid,
              faceTag,
            ),
          );
          return nf;
        },
        offsetSurface: (fid: string, faceTag: string, d: number) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildOffsetSurfaceNode(nf, "Offset Surface", fid, faceTag, d),
          );
          return nf;
        },
        split: (
          fid: string,
          origin: [number, number, number],
          normal: [number, number, number],
          keep?: "positive" | "negative" | "both",
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildSplitNode(
              nf,
              "Split",
              fid,
              origin,
              normal,
              keep ?? "positive",
            ),
          );
          return nf;
        },
        thicken: (fid: string, tag: string, t: number) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildThickenNode(nf, "Thicken", fid, [tag], t));
          return nf;
        },
        hem: (
          fid: string,
          edgeTag: string,
          thickness?: number,
          lip?: number,
          relief?: number,
          radius?: number,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildHemNode(
              nf,
              "Hem",
              fid,
              edgeTag,
              thickness ?? 0.001,
              lip ?? 0.004,
              relief ?? 0.0004,
              radius ?? 0,
            ),
          );
          return nf;
        },
        setAppearance: (
          fid: string,
          ap: { color?: string; opacity?: number },
        ) => {
          const n = scadgenHistory.get(fid);
          if (!n) return false;
          n.extensions = {
            ...(n.extensions as Record<string, unknown> | undefined),
            appearance: ap,
          };
          scadgenHistory.touch(fid);
          scadgenSceneSync.applyAppearance(fid, ap);
          return true;
        },
        appearanceOf: (fid: string) => {
          const n = scadgenHistory.get(fid);
          return (
            (n?.extensions as { appearance?: unknown } | undefined)
              ?.appearance ?? null
          );
        },
        materialOf: (fid: string) => {
          const el = scadgenSceneSync.elementOf(fid);
          if (!el) return null;
          const o = getObject(el) as ThreeObj | undefined;
          let out: { color: string; opacity: number } | null = null;
          o?.traverse((c) => {
            const mm = c as ThreeMesh & { isMesh?: boolean };
            if (!out && mm.isMesh && !Array.isArray(mm.material)) {
              const m2 = mm.material as ThreeMat;
              out = {
                color: `#${m2.color.getHexString()}`,
                opacity: m2.opacity,
              };
            }
          });
          return out;
        },
        unfold: (sourceFid: string, foldFids: string[]) => {
          const folds = foldFids
            .map((f) => scadgenHistory.get(f))
            .filter((n): n is NonNullable<typeof n> => !!n)
            .map((n) => {
              const q = (id: string, dflt = 0) => {
                const p0 = n.parameters.find(
                  (pp) => pp.kind === "quantity" && pp.parameterId === id,
                ) as { value?: number } | undefined;
                return typeof p0?.value === "number" ? p0.value : dflt;
              };
              const isHem = n.featureType === "hem";
              return {
                angle: isHem ? Math.PI / 2 : q("angle", Math.PI / 2),
                length: isHem ? q("lip", 0.004) * 1.8 : q("length", 0),
                thickness: q("thickness", 0.001),
                radius: q("radius", 0),
              };
            });
          if (!folds.length) return "";
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildUnfoldNode(nf, "Flat Pattern", sourceFid, folds),
          );
          return nf;
        },
        wrap: (fid: string, polylines: number[][][]) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildWrapNode(nf, "Wrap", fid, polylines));
          return nf;
        },
        flange: (
          fid: string,
          edgeTag: string,
          angleDeg: number,
          thickness?: number,
          relief?: number,
          radius?: number,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildFlangeNode(
              nf,
              "Flange",
              fid,
              edgeTag,
              (angleDeg * Math.PI) / 180,
              thickness ?? 0.001,
              relief ?? 0,
              radius ?? 0,
            ),
          );
          return nf;
        },
        featurePattern: (
          sourceFids: string[],
          axis: [number, number, number],
          spacing: number,
          count: number,
        ) => {
          const nodes = sourceFids
            .map((f) => scadgenHistory.get(f))
            .filter((n): n is NonNullable<typeof n> => !!n);
          if (!nodes.length) return "";
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildFeaturePatternNode(
              nf,
              "Pattern Features",
              nodes,
              axis,
              spacing,
              count,
            ),
          );
          return nf;
        },
        sketchOnDatum: (
          datumFid: string,
          w: number,
          h: number,
          depth: number,
        ) => {
          const base = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          const nodes = buildDatumSketchExtrudeNodes(
            base,
            "Datum pad",
            datumFid,
            w,
            h,
            depth,
          );
          for (const nd of nodes) scadgenHistory.add(nd);
          return base;
        },
        thread: (
          fid: string,
          size: string,
          kind?: "external" | "internal",
          standard?: "iso" | "unified" | "npt",
          mode?: "coarse" | "fine",
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildThreadNode(
              nf,
              `Thread ${size}`,
              fid,
              size,
              kind ?? "external",
              standard,
              mode,
            ),
          );
          return nf;
        },
        fastener: (spec: Partial<FastenerSpec>) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          const full: FastenerSpec = {
            id: spec.id ?? `fastener-${nf}`,
            family: spec.family ?? "bolt",
            standard: spec.standard ?? "iso",
            size: spec.size ?? "M6",
            mode: spec.mode ?? "coarse",
            head: spec.head ?? "hex",
            tip: spec.tip ?? "threaded",
            length: spec.length ?? 0.02,
            label: spec.label ?? `Fastener ${spec.size}`,
            ...(spec.engagement !== undefined
              ? { engagement: spec.engagement }
              : {}),
            ...(spec.clearance !== undefined
              ? { clearance: spec.clearance }
              : {}),
          };
          try {
            const node =
              full.family === "screwHole"
                ? buildScrewHolePresetNode(full, nf)
                : buildFastenerPresetNode(full, nf);
            debugLog(
              `fastener hook: adding ${nf} family=${full.family} size=${full.size}`,
            );
            scadgenHistory.add(node);
          } catch (e) {
            console.error(
              "fastener hook:",
              e instanceof Error ? e.message : String(e),
            );
          }
          return nf;
        },
        screwHole: (spec: Partial<FastenerSpec>) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          const full: FastenerSpec = {
            id: spec.id ?? `screwHole-${nf}`,
            family: "screwHole",
            standard: spec.standard ?? "iso",
            size: spec.size ?? "M6",
            mode: spec.mode ?? "coarse",
            head: "none",
            tip: "none",
            length: spec.length ?? 0.02,
            label: spec.label ?? `Screw hole ${spec.size}`,
            ...(spec.engagement !== undefined
              ? { engagement: spec.engagement }
              : {}),
            ...(spec.clearance !== undefined
              ? { clearance: spec.clearance }
              : {}),
          };
          try {
            scadgenHistory.add(buildScrewHolePresetNode(full, nf));
          } catch (e) {
            console.error(
              "screwHole hook:",
              e instanceof Error ? e.message : String(e),
            );
          }
          return nf;
        },
        createPlane: (
          origin: [number, number, number],
          normal: [number, number, number],
          size?: number,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildCreatePlaneNode(nf, "Plane", origin, normal, size ?? 0.25),
          );
          return nf;
        },
        curveOnFace: (
          srcFid: string,
          tgtFid: string,
          tags: string[],
          faceTag: string,
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildCurveOnFaceNode(
              nf,
              "Curve on Face",
              srcFid,
              tgtFid,
              tags,
              faceTag,
            ),
          );
          return nf;
        },
        scale: (fid: string, f: number, origin?: [number, number, number]) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildScaleNode(nf, "Scale", fid, f, origin ?? [0, 0, 0]),
          );
          return nf;
        },
        moveFace: (fid: string, tag: string, d: number) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildMoveFaceNode(nf, "Move Face", fid, tag, d));
          return nf;
        },
        section: (
          fid: string,
          origin: [number, number, number],
          normal: [number, number, number],
        ) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildSectionNode(nf, "Section", fid, origin, normal),
          );
          return nf;
        },
        delFace: (fid: string, tag: string) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildDeleteFaceNode(nf, "Delete Face", fid, [tag]),
          );
          return nf;
        },
        fillet: (fid: string, tags: string[], r: number, radii?: number[]) => {
          const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(
            buildEdgeFilletNode(nf, "Fillet", fid, tags, r, radii),
          );
          return nf;
        },
        modBox: (fid: string, d: number) => {
          scadgenHistory.updateParameter(fid, {
            kind: "quantity",
            parameterId: "depth",
            value: d,
            units: "m",
            expression: `${Math.round(d * 1000)} mm`,
          });
          return fid;
        },
        modFillet: (fid: string, r?: number, tags?: string[]) =>
          modifyFillet(scadgenHistory, fid, {
            ...(r !== undefined ? { radius: r } : {}),
            ...(tags ? { edgeTags: tags } : {}),
          }),
        tagMap: (fid: string) => scadgenExecutor.stabilityOf(fid),
        tagChain: (fid: string) => scadgenExecutor.tagChainOf(fid),
        resolveTag: (fid: string, oldTag: string, kind?: "face" | "edge") =>
          scadgenExecutor.resolveTag(fid, oldTag, kind ?? "face"),
        etags: (fid: string) =>
          scadgenExecutor.outputs.get(fid)?.edgeTags ?? null,
        measPolyline: (fid: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          return o ? polylineLength(o) : null;
        },
        measAngle: (fid: string, a: string, b: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          return o ? straightEdgeAngle(o, a, b) : null;
        },
        measDist: (fa: string, fb: string) => {
          const oa = scadgenExecutor.outputs.get(fa);
          const ob = scadgenExecutor.outputs.get(fb);
          return oa && ob ? nearestVertexDistance(oa, ob) : null;
        },
        measEdge: async (fid: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          if (!o) return null;
          const out: number[] = [];
          for (const t of o.edgeTags) out.push(await edgeLength(o, t));
          return out;
        },
        states: () => scadgenHistory.toListResponse().featureStates,
        tags: (fid: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          return o
            ? {
                edges: o.edgeTags.length,
                faces: o.faceTags.length,
                faceOwner: o.faceTags.length
                  ? faceOwnerOf(o.faceTags[0] ?? "")
                  : null,
              }
            : null;
        },
        varRows: () => variablesPanelRows(scadgenHistory.evaluatedNodes()),
        varsFor: (fid: string) =>
          variablesForFeature(scadgenHistory.evaluatedNodes(), fid),
        describeScene: () => {
          const authored = new Map<string, string>();
          for (const pair of scadgenSceneSync.authoredIds()) {
            const i = pair.indexOf("->");
            if (i > 0) authored.set(pair.slice(0, i), pair.slice(i + 2));
          }
          const states = scadgenHistory.toListResponse()
            .featureStates as unknown as Record<
            string,
            { featureStatus?: string }
          >;
          const nodes = scadgenHistory.evaluatedNodes();
          const bodies = [];
          for (const n of nodes) {
            const fid = n.featureId;
            const out = scadgenExecutor.outputs.get(fid);
            const elId = authored.get(fid);
            const el = elId
              ? elements.find((e) => e.nodeId === elId)
              : undefined;
            const faces = out?.faceTags.length ?? 0;
            const edges = out?.edgeTags.length ?? 0;
            if (!out && !elId) continue;
            let bbox = null;
            const vp = out?.vertexPositions;
            if (vp && vp.length >= 3) {
              const mn = [Infinity, Infinity, Infinity];
              const mx = [-Infinity, -Infinity, -Infinity];
              for (let i = 0; i + 2 < vp.length; i += 3) {
                for (let k = 0; k < 3; k++) {
                  const v = vp[i + k];
                  const lo = mn[k];
                  const hi = mx[k];
                  if (v === undefined || lo === undefined || hi === undefined)
                    continue;
                  if (v < lo) mn[k] = v;
                  if (v > hi) mx[k] = v;
                }
              }
              bbox = [...mn, ...mx];
            }
            bodies.push({
              fid,
              type: n.featureType,
              name: n.name,
              state: states[fid]?.featureStatus ?? "UNKNOWN",
              suppressed: !!n.suppressed,
              elementId: elId ?? null,
              visible: elId
                ? ((
                    getObject as (
                      id: string,
                    ) => { visible?: boolean } | undefined
                  )(elId)?.visible ?? true)
                : null,
              position: el
                ? [el.position.x, el.position.y, el.position.z]
                : null,
              faces,
              edges,
              faceTags: out?.faceTags ?? [],
              bbox,
            });
          }
          return {
            mode,
            selection: {
              ids: [...selectedElements],
              kind:
                selectedElements.length === 0
                  ? "none"
                  : selectedElements.length > 1
                    ? "bodies"
                    : "body",
            },
            camera: camera
              ? [
                  camera.quaternion.x,
                  camera.quaternion.y,
                  camera.quaternion.z,
                  camera.quaternion.w,
                ]
              : null,
            bodies,
          };
        },
        exportSceneStl: () =>
          ImportExportService.getInstance()
            .export(elements)
            .then((blob) => blob.arrayBuffer())
            .then((buf) => new Uint8Array(buf)),
        exportSceneStep: () =>
          ImportExportService.getInstance()
            .exportStep(elements)
            .then((blob) => blob.arrayBuffer())
            .then((buf) => new Uint8Array(buf)),
        insertStl: (bytes: number[]) => {
          const assetId = `stl_${Date.now().toString(36)}`;
          registerImportAsset(
            assetId,
            "stl",
            "inserted",
            new Uint8Array(bytes),
          );
          const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
          scadgenHistory.add(buildInsertNode(fid, "Inserted", assetId, "stl"));
          return fid;
        },
        authoredIds: () => scadgenSceneSync.authoredIds(),
        geom: (fid: string) => {
          const o = scadgenExecutor.outputs.get(fid);
          return o
            ? {
                edges: o.brep.edges.length,
                faces: o.brep.faces.length,
                vertices: o.brep.vertices.length,
              }
            : null;
        },
        saveProject: () => saveProject(),
        loadProject: (text?: string) => loadProject(text),
        idle: () =>
          scadgenExecutor.whenIdle().then(() => scadgenExecutor.lastReport),
        assembly: {
          addInstance: (inst: {
            id: string;
            partId?: string;
            transform?: number[];
          }) => {
            const a = assemblyRef.current.asm;
            const next = {
              ...a,
              instances: [
                ...a.instances,
                {
                  id: inst.id,
                  partId: inst.partId ?? "p",
                  transform: inst.transform ?? identity(),
                },
              ],
            };
            assemblyRef.current = { asm: next, refs: assemblyRef.current.refs };
            return inst.id;
          },
          addMate: (mate: Mate) => {
            const a = assemblyRef.current.asm;
            assemblyRef.current = {
              ...assemblyRef.current,
              asm: { ...a, mates: [...a.mates, mate] },
            };
            return mate.id;
          },
          register: (asm: Assembly) => {
            assemblyRef.current = { asm, refs: assemblyRef.current.refs };
            return asm;
          },
          setRef: (instId: string, refName: string, transform: number[]) => {
            const a = assemblyRef.current.asm;
            const base: RefMap = {};
            for (const i of a.instances)
              base[i.id] = { body: { transform: identity() } };
            (base[instId] ??= {})[refName] = { transform };
            assemblyRef.current = { ...assemblyRef.current, refs: base };
            return true;
          },
          solve: (): {
            ok: boolean;
            dof: number;
            issues: string[];
            residual: number;
            placed: number;
            instances: { id: string; transform: number[] }[];
          } => {
            const { asm, refs } = assemblyRef.current;
            const r = solve(asm, refs ?? undefined);
            if (!r.assembly)
              return {
                ok: false,
                dof: r.dof,
                issues: r.issues,
                residual: r.residual,
                placed: 0,
                instances: [],
              };
            let placed = 0;
            const listing: { id: string; transform: number[] }[] = [];
            for (const inst of r.assembly.instances) {
              const fid = inst.id;
              const el = scadgenSceneSync.elementOf(fid);
              const obj = el
                ? (getObject as (id: string) => ThreeObj | undefined)(el)
                : undefined;
              if (obj && placeObject(obj, inst.transform)) placed++;
              listing.push({ id: inst.id, transform: inst.transform });
            }
            return {
              ok: r.ok,
              dof: r.dof,
              issues: r.issues,
              residual: r.residual,
              placed,
              instances: listing,
            };
          },
          state: (): Assembly => assemblyRef.current.asm,
          tree: () => {
            const t = buildTree(assemblyRef.current.asm);
            if (!t) return [];
            const toPlaintext = (
              n: AssemblyNode,
            ): {
              instanceId: string;
              children: {
                instanceId: string;
                children: { instanceId: string; children: never[] }[];
              }[];
            } => {
              const kids = n.children.map((c: AssemblyNode) => ({
                instanceId: c.instanceId,
                children: c.children.map((gc: AssemblyNode) => ({
                  instanceId: gc.instanceId,
                  children: [] as never[],
                })),
              }));
              return { instanceId: n.instanceId, children: kids };
            };
            return [toPlaintext(t)];
          },
        },
      },
    };
    {
      const dbg = (
        window as unknown as {
          __cadDebug: {
            scadgen: Record<string, unknown> & {
              bus?: import("../model/actionBus").ActionBus;
            };
          };
        }
      ).__cadDebug;
      dbg.scadgen.bus = createSceneBus(dbg.scadgen as unknown as HookBag);
      busRef.current = dbg.scadgen
        .bus as import("../model/actionBus").ActionBus;
      // ECAD subsystem: same bus for desk/VR/voice/AI (exit-ramp rule).
      const ecad = installEcad({
        scene,
        bus: dbg.scadgen.bus as import("../model/actionBus").ActionBus,
      });
      ecadRef.current = ecad;
      dbg.scadgen.ecad = ecad;
      (window as unknown as { __ecad?: unknown }).__ecad = ecad;
      dbg.scadgen.bus.register({
        id: "ecad.openPanel",
        kind: "command",
        aliases: [],
        run: () => setEcadOpen(true),
      });
      dbg.scadgen.bus.register({
        id: "ecad.closePanel",
        kind: "command",
        aliases: [],
        run: () => setEcadOpen(false),
      });
      // Assembly actions: registered here (solve + insert + addMate) so
      // desk/VR/voice dispatch to the same solver through the bus
      // (exit-ramp rule).
      const asmApi = (
        dbg.scadgen as unknown as {
          assembly?: {
            addInstance: (i: {
              id: string;
              partId?: string;
              transform?: number[];
            }) => string;
            addMate: (m: Mate) => string;
            register: (a: Assembly) => Assembly;
            setRef: (inst: string, name: string, t: number[]) => boolean;
            solve: () => unknown;
            state: () => Assembly;
            tree: () => unknown;
          };
        }
      ).assembly;
      const bus = dbg.scadgen.bus as import("../model/actionBus").ActionBus;
      bus.register({
        id: "assembly.solve",
        kind: "command",
        aliases: [],
        run: () => asmApi?.solve(),
      });
      bus.register({
        id: "assembly.insert",
        kind: "command",
        aliases: ["assembly.addInstance"],
        run: (i: unknown) =>
          asmApi?.addInstance(
            i as { id: string; partId?: string; transform?: number[] },
          ),
      });
      bus.register({
        id: "assembly.addMate",
        kind: "command",
        aliases: [],
        run: (m: unknown) => asmApi?.addMate(m as Mate),
      });
      (
        [
          ["primitive-box", "box"],
          ["primitive-prism", "prism"],
          ["primitive-pyramid", "pyramid"],
          ["primitive-wedge", "wedge"],
          ["primitive-cylinder", "cylinder"],
          ["primitive-cone", "cone"],
          ["primitive-torus", "torus"],
          ["primitive-pipe", "pipe"],
        ] as [string, ShapeKind][]
      ).forEach(([id, kind]) => {
        bus.register({
          id,
          kind: "op",
          aliases: [],
          run: (opts: unknown) =>
            (
              dbg.scadgen as {
                primitive: (
                  k: ShapeKind,
                  o: Record<string, unknown>,
                ) => { featureId: string; profileFeatureId: string };
              }
            ).primitive(kind, (opts as Record<string, unknown>) ?? {}),
        });
      });
      bus.register({
        id: "printer.openWizard",
        kind: "op",
        aliases: [],
        run: () => setPrintOpen(true),
      });
      bus.register({
        id: "printer.closeWizard",
        kind: "op",
        aliases: [],
        run: () => setPrintOpen(false),
      });
    }
    return () => {
      delete (window as unknown as { __cadDebug?: object }).__cadDebug;
    };
  }, [
    elements,
    mode,
    featureTree,
    camera,
    updateElementBrep,
    addElement,
    getObject,
    idCounter,
    setPrintOpen,
  ]);

  useEffect(() => {
    if (!pendingAuthorFixups.current.size) {
      for (const el of elements) seenElementIds.current.add(el.nodeId);
      return;
    }
    const ids = elements.map((el) => el.nodeId);
    const pending = [...pendingAuthorFixups.current].map(
      ([predictedId, out]) => ({
        predictedId,
        brep: out.brep,
        position: out.position,
        occBrep: out.occBrep,
        edgeGeometry: out.edgeGeometry,
        faceGeometry: out.faceGeometry,
        vertexPositions: out.vertexPositions,
      }),
    );
    const pairs = pairNewElements(ids, seenElementIds.current, pending);
    for (const { actualId, item } of pairs) {
      if (actualId !== item.predictedId)
        scadgenSceneSync.remapElementId(item.predictedId, actualId);
      updateElementBrep(
        actualId,
        item.brep as never,
        item.position as never,
        undefined,
        item.edgeGeometry as never,
        item.occBrep,
        item.faceGeometry as never,
        item.vertexPositions as never,
      );
      pendingAuthorFixups.current.delete(item.predictedId);
    }
  }, [elements, updateElementBrep]);

  const { inVR, vrSupported, enterVR, exitVR, assemblyBridgeRef } =
    useVRSession();

  // Wire the VR grip → assembly bridge so grabbing an assembled instance in VR
  // mirrors the selection into the assembly subsystem (and vice-versa).
  useEffect(() => {
    assemblyBridgeRef.current = {
      onGrab: (instanceId: string) => {
        const a = assemblyRef.current.asm;
        if (a.instances.some((i) => i.id === instanceId)) {
          // Future: highlight / grab-lock the instance.
          // For now, the selection already went through selectElement above.
          debugLog(`[assembly] VR grabbed: ${instanceId}`);
        }
      },
      onRelease: () => {
        // Future: release grab-lock, restore solver position.
      },
      onHover: (instanceId: string | null) => {
        // Future: highlight hovered instance.
      },
    };
    return () => {
      assemblyBridgeRef.current = null;
    };
  }, [assemblyBridgeRef]);

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
  const ModeContent =
    inVR && mode === "sketch" ? undefined : MODE_COMPONENTS[mode];

  const [undoDropdownOpen, setUndoDropdownOpen] = useState(false);
  const [redoDropdownOpen, setRedoDropdownOpen] = useState(false);
  const [planeOffset, setPlaneOffset] = useState(0);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const selectedElementsRef = useRef(selectedElements);
  selectedElementsRef.current = selectedElements;
  const pickExport = useCallback(() => selectedElementsRef.current ?? [], []);
  const onGetStl = useCallback(async () => {
    const ids = pickExport();
    const els = elementsRef.current;
    const r = await exportSelectionStl(els, ids, (subset) =>
      ImportExportService.getInstance().export(subset as never),
    );
    return r.stlBytes;
  }, [pickExport]);
  const onGetBbox = useCallback(async (): Promise<{
    min: [number, number, number];
    max: [number, number, number];
  }> => {
    const els = elementsRef.current;
    const ids = pickExport();
    const bbox = selectionBboxMM(els, ids);
    if (!bbox) throw new Error("no vertex data for selection bbox");
    return {
      min: [bbox[0]!, bbox[1]!, bbox[2]!] as [number, number, number],
      max: [bbox[3]!, bbox[4]!, bbox[5]!] as [number, number, number],
    };
  }, [pickExport]);
  const onGetSelectionStl = useCallback(async (): Promise<SelectionStl> => {
    const ids = pickExport();
    const els = elementsRef.current;
    return exportSelectionStl(els, ids, (subset) =>
      ImportExportService.getInstance().export(subset as never),
    );
  }, [pickExport]);

  const busRun = (action: string, payload?: unknown) =>
    busRef.current?.run(action, payload);
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

  // Assembly side panel — re-renders when instance/mate counts change
  const asm = assemblyRef.current.asm;
  const [asmTick, setAsmTick] = useState(0);
  void asmTick;

  const assemblyPanel = (
    <AssemblyPanel
      asm={asm}
      onAddInstance={(i) => {
        busRun("assembly.insert", i);
        setAsmTick((t) => t + 1);
      }}
      onAddMate={(m) => {
        busRun("assembly.addMate", m);
        setAsmTick((t) => t + 1);
      }}
      onSolve={() =>
        busRun("assembly.solve") as {
          ok: boolean;
          dof: number;
          issues: string[];
          residual: number;
          placed: number;
        } | null
      }
    />
  );

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

  // Flux copilot: one session (the master orchestrator + its trace) per open
  // project file. The same session backs the desk OrchestratorView, the VR
  // chat panel, voice, and the ActionBus — one thread, four entry points
  // (exit-ramp rule). Created once per mount; projectRef = the file/project id.
  const [fluxOpen, setFluxOpen] = useState(false);
  const fluxSessionRef = useRef<FluxSession | null>(null);
  if (fluxSessionRef.current === null) {
    fluxSessionRef.current = makeFluxSession({
      projectRef: "scadgen-file",
      projectName: "Current project",
      brain: { provider: "local" },
    });
  }
  const fluxSession = fluxSessionRef.current;
  useEffect(() => {
    const bus = busRef.current;
    if (!bus) return;
    registerFluxBus(bus, fluxSession.orchestrator);
    if (ecadRef.current) registerEcadAgent(fluxSession, ecadRef.current);
  }, [fluxSession]);
  // Per-frame ECAD sync: LEDs, servos, screens, hex-tier emulator clock.
  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      ecadRef.current?.layer.update(Math.min(64, t - last));
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene]);
  // Keep the VR chat panel fed with the live orchestrator trace. The scene
  // pushes a session getter (one per file) into __vrMechanics; useVRSession's
  // render loop reads it each frame. No per-frame allocation, no polling —
  // the getter is the live thread.
  useEffect(() => {
    const win = window as unknown as {
      __vrMechanics?: {
        setFluxSession?: (
          g: () => {
            ref: string;
            rows: import("../flux/agent/trace").TraceRow[];
          },
        ) => void;
      };
    };
    win.__vrMechanics?.setFluxSession?.(() => {
      const t = fluxSession.orchestrator.trace;
      return { ref: fluxSession.ref, rows: t.rows };
    });
  }, [fluxSession]);
  // Selection → flux designators: each selected CAD element's nodeId becomes a
  // flux designator so the copilot can reference what the user picked. Design-
  // a-tive actions (addResistor, runErcDrc, …) carry their own PCB context; the
  // nodeId just tags the current selection for brain-context prompts.
  const fluxSelection = useMemo<SelectedPart[]>(
    () => selectedElements.map((id) => ({ designator: id })),
    [selectedElements],
  );

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
          onSelectFastener={(spec) => {
            const dbg = (
              window as unknown as {
                __cadDebug: { scadgen: Record<string, unknown> };
              }
            ).__cadDebug;
            const hook = dbg?.scadgen?.fastener as
              | ((s: Partial<FastenerSpec>) => string)
              | undefined;
            if (hook) hook(spec);
          }}
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

            {/* Flux copilot — the master orchestrator window (desk surface).
                One thread per file; sub-agents post rows into this same panel.
                Toggled by the "⚡ Flux" button below. */}
            {fluxOpen && (
              <OrchestratorView
                projectRef={fluxSession.ref}
                projectName={fluxSession.name}
                orchestrator={fluxSession.orchestrator}
                selection={fluxSelection}
                brain={{ provider: "local" }}
              />
            )}

            {/* Flux toggle — the copilot entry point on the desk. */}
            <button
              onClick={() => setFluxOpen((v) => !v)}
              title="Toggle the Flux copilot (⚡)"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded bg-gray-800/95 border border-gray-700 hover:border-blue-500 text-xs text-gray-200"
            >
              {fluxOpen ? "✕ Flux" : "⚡ Flux"}
            </button>

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
          {assemblyPanel}
          {ecadOpen && ecadRef.current && (
            <EcadPanel
              ecad={ecadRef.current}
              onClose={() => setEcadOpen(false)}
            />
          )}
          {printOpen && (
            <PrintWizard
              onClose={() => setPrintOpen(false)}
              onGetStl={onGetStl}
              onGetBbox={onGetBbox}
              onGetSelectionStl={onGetSelectionStl}
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
