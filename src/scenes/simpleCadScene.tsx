import React, { useRef, useEffect, useState, useMemo } from "react";
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
      },
    };
    {
      const dbg = (
        window as unknown as {
          __cadDebug: { scadgen: Record<string, unknown> };
        }
      ).__cadDebug;
      dbg.scadgen.bus = createSceneBus(dbg.scadgen as unknown as HookBag);
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
  const ModeContent =
    inVR && mode === "sketch" ? undefined : MODE_COMPONENTS[mode];

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
