import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as THREE from "three";
import type {
  Mesh as ThreeMesh,
  MeshStandardMaterial as ThreeMat,
  Object3D as ThreeObj,
} from "three";
import {
  HELPERS,
  SceneMode,
  buildBrowserSections,
  type BrowserItem,
  buildElementHelpers,
  debugLog,
  ImportExportService,
  setUndoExternalStateAdapter,
} from "@vitekk02/cadjs";
import { resolveHitToTag } from "../model/hitResolver";
import type { DisplayStyle, SectionAxis } from "../model/display";
import { pathForPrimitive } from "../model/sweepPath";
import { createSubPrimSelector } from "../components/vr/subPrimSelector";
import {
  buildBooleanNode,
  buildChamferNode,
  buildInsertNode,
  buildLoftNode,
  buildSketchNode,
  buildSweepNode,
  buildExtrudeNode,
  formatQuantityExpression,
  provenanceForFeature,
  type ProvenanceQuery,
  type ScadgenFeatureNode,
} from "../model/onshapeHistory";
import { registerImportAsset } from "../model/assets";
import { variablesForFeature, variablesPanelRows } from "../model/variables";
import {
  buildBoxNodes,
  buildConeNodes,
  buildCylinderNodes,
  buildLinearPatternNodes,
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
  buildTransformNode,
} from "../model/primitives";
import {
  consumedByFeature,
  exportableBodies,
  materialById,
  scadgenParts,
  type BodyRecord,
} from "../model/parts";
import {
  buildBossFeatureNode,
  buildBridgingCurveNode,
  buildCoilFeatureNode,
  buildDeriveNode,
  buildDomeFeatureNode,
  buildEmbossNode,
  buildEncloseNode,
  buildFitSplineNode,
  buildGussetFeatureNode,
  buildHelixCurveNode,
  buildRibFeatureNode,
  buildWebFeatureNode,
  type BossOptions,
  type CoilOptions,
  type DeriveOptions,
  type DomeFeatureOptions,
  type RibOptions,
} from "../model/featuresF";

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
import {
  rollbackDescription,
  scadgenHistory,
  type FeatureHistorySnapshot,
} from "../model/featureEngine";
import {
  CLOSED_FEATURE_DIALOG,
  closeFeatureDialog,
  draftParameterFor,
  editFeatureDialog,
  featureDialogParameters,
  openFeatureDialog,
  resetFeatureDialog,
  type FeatureDialogState,
} from "../model/featureDialog";
import {
  groupBrowserByPart,
  groupBrowserItems,
} from "../components/featureTreeGroups";
import {
  faceOwnerOf,
  scadgenExecutor,
  type BodyOutput,
} from "../model/executor";
import { scadgenSceneSync, type ElementAppearance } from "../model/sceneSync";
import { createSceneBus, type HookBag } from "../model/actionBus";
import {
  canonicalProjectJson,
  loadProject,
  saveProject,
} from "../model/documentStore";
import { auditPhase3Acceptance } from "../model/acceptanceAudit";
import { geometrySummary } from "../model/geometryDigest";
import {
  activeTab as activeDocumentTab,
  addTab as addDocumentTab,
  deleteTab as deleteDocumentTab,
  deleteTabs as deleteDocumentTabs,
  duplicateTab as duplicateDocumentTab,
  duplicateTabs as duplicateDocumentTabs,
  ensureDocument,
  getDocumentStorageStatus,
  moveTab as moveDocumentTab,
  newDocumentTab,
  TAB_KIND_LABEL,
  normalizeDocument,
  renameDocument as renameCadDocument,
  renameTab as renameDocumentTab,
  saveDocument,
  setActiveTab as setActiveDocumentTab,
  setDocumentThumbnail,
  subscribeDocumentStorage,
  writeTabDesign,
  type CadDocument,
  type DocumentSnapshot,
  type DocumentStorageStatus,
  type DocumentTab,
  type DocumentTabKind,
} from "../document";
import { downloadDocumentFile } from "../document/file";
import { DocumentTabBar } from "../components/DocumentTabBar";
import DocumentToolbar from "../components/DocumentToolbar";
import DocumentsPage from "../components/DocumentsPage";
import DocumentPanel from "../components/DocumentPanel";
import SketchControlsHelp from "../components/SketchControlsHelp";
import {
  canRoleEdit,
  getAccount,
  getProject,
  resolveBootProject,
  resolveSettings,
  getOverlay,
  saveProject as saveProjectDoc,
  type ProjectDoc,
  type ShareRole,
} from "../project";
import {
  canEditSession,
  getSessionSnapshot,
  onRemoteDoc,
  announceDocSaved,
  publishSelection,
  startSession,
  stopSession,
  subscribeSession,
} from "../project/sessionRuntime";
import "../model/bootstrap";
import { makeElementAuthor, pairNewElements } from "../model/elementAuthoring";
import {
  ASSEMBLY_BUDGET,
  AssemblyNode,
  buildRefMap,
  buildThreeLevelBenchmark,
  buildTree,
  dragInstance,
  findPlacedInstance,
  flattenAssembly,
  identity,
  insertCatalogInstance,
  insertSubassemblyReference,
  linkPartStudioBodies,
  measureAssemblyPerformance,
  placeObject,
  planAssemblyRender,
  solve,
  type Assembly,
  type AssemblyFeature,
  type AssemblyPerformanceReport,
  type BodyBounds,
  type BodyBrepGeometry,
  type BodyMesh,
  type Mate,
  type RefMap,
  type StandardPartSpec,
} from "../assemblies";
import {
  emptyAssemblyTab,
  parseAssemblyTab,
  serializeAssemblyTab,
  type AssemblyPosition,
  type AssemblySolveSnapshot,
  type AssemblyTabData,
} from "../assemblies/document";
import { assemblyBom } from "../assemblies/bom";
import {
  circlesFromEdgeLoops,
  emptyDrawingTab,
  parseDrawingTab,
  serializeDrawingTab,
  type DrawingBody,
  type DrawingTabData,
} from "../drawings/model";
import {
  parseContextSketches,
  referencesFromBoxes,
  referencesFromEdges,
  type ContextSketchDocument,
} from "../model/contextSketch";
import { ContextSketchDialog } from "../components/ContextSketchDialog";

let scadgenIdCounter = 0;

const PRIMITIVE_LABELS: Record<ShapeKind, string> = {
  box: "Box",
  prism: "Prism",
  pyramid: "Pyramid",
  wedge: "Wedge",
  cylinder: "Cylinder",
  cone: "Cone",
  torus: "Torus",
  sphere: "Sphere",
  pipe: "Pipe",
  ellipsoid: "Ellipsoid",
  capsule: "Capsule",
  dome: "Dome",
};

function assemblyBoundsFrom(
  elements: ReadonlyArray<{
    nodeId: string;
    brep: {
      vertices?: ReadonlyArray<{ x: number; y: number; z: number }>;
      edges?: ReadonlyArray<{
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
      }>;
    };
  }>,
): Record<string, BodyBounds> {
  const out: Record<string, BodyBounds> = {};
  for (const el of elements) {
    const featureId =
      scadgenSceneSync.featureForElement(el.nodeId) ?? el.nodeId;
    const points: { x: number; y: number; z: number }[] = [
      ...(el.brep.vertices ?? []),
    ];
    for (const edge of el.brep.edges ?? []) {
      points.push(edge.start, edge.end);
    }
    if (!points.length) continue;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
    out[featureId] = { min, max };
  }
  return out;
}

function bodyBoundsFromOutput(out: BodyOutput): BodyBounds | null {
  const points: { x: number; y: number; z: number }[] = [
    ...(out.brep.vertices ?? []),
  ];
  for (const edge of out.brep.edges ?? []) points.push(edge.start, edge.end);
  if (!points.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { min, max };
}

function assemblyBrepsFrom(
  elements: ReadonlyArray<{
    nodeId: string;
    brep: { toJSON: () => BodyBrepGeometry["brepJson"] };
    occBrep?: string | undefined;
  }>,
): Record<string, BodyBrepGeometry> {
  const out: Record<string, BodyBrepGeometry> = {};
  for (const el of elements) {
    const featureId =
      scadgenSceneSync.featureForElement(el.nodeId) ?? el.nodeId;
    out[featureId] = {
      brepJson: el.brep.toJSON(),
      ...(el.occBrep ? { occBrep: el.occBrep } : {}),
    };
  }
  return out;
}

function assemblyMeshesFrom(
  elements: ReadonlyArray<{
    nodeId: string;
    brep: {
      faces?: ReadonlyArray<{
        vertices: ReadonlyArray<{ x: number; y: number; z: number }>;
      }>;
    };
  }>,
): Record<string, BodyMesh> {
  const out: Record<string, BodyMesh> = {};
  for (const el of elements) {
    const featureId =
      scadgenSceneSync.featureForElement(el.nodeId) ?? el.nodeId;
    const triangles: Array<
      [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
      ]
    > = [];
    for (const face of el.brep.faces ?? []) {
      const vertices = face.vertices;
      for (let i = 1; i + 1 < vertices.length; i++) {
        const a = vertices[0]!;
        const b = vertices[i]!;
        const c = vertices[i + 1]!;
        triangles.push([
          { x: a.x, y: a.y, z: a.z },
          { x: b.x, y: b.y, z: b.z },
          { x: c.x, y: c.y, z: c.z },
        ]);
      }
    }
    if (triangles.length) out[featureId] = { triangles };
  }
  return out;
}

function drawingBodiesFrom(
  elements: ReadonlyArray<{
    nodeId: string;
    position: { x: number; y: number; z: number };
    brep: {
      edges: ReadonlyArray<{
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
      }>;
      faces?: ReadonlyArray<{
        vertices: ReadonlyArray<{ x: number; y: number; z: number }>;
      }>;
    };
  }>,
  bodies: readonly BodyRecord[],
): DrawingBody[] {
  return elements.flatMap((el) => {
    const featureId =
      scadgenSceneSync.featureForElement(el.nodeId) ?? el.nodeId;
    const record = bodies.find((b) => b.id === featureId) ?? {
      id: featureId,
      name: featureId,
      partId: null,
      materialId: null,
      appearance: {},
      state: "keep" as const,
      hidden: false,
      transparent: false,
    };
    const edges = el.brep.edges.map(
      (edge) =>
        [
          {
            x: edge.start.x + el.position.x,
            y: edge.start.y + el.position.y,
            z: edge.start.z + el.position.z,
          },
          {
            x: edge.end.x + el.position.x,
            y: edge.end.y + el.position.y,
            z: edge.end.z + el.position.z,
          },
        ] as [DrawingBody["edges"][number][0], DrawingBody["edges"][number][1]],
    );
    const faces: Array<
      [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
      ]
    > = [];
    for (const face of el.brep.faces ?? []) {
      const vertices = face.vertices.map((p) => ({
        x: p.x + el.position.x,
        y: p.y + el.position.y,
        z: p.z + el.position.z,
      }));
      for (let i = 1; i + 1 < vertices.length; i++) {
        faces.push([vertices[0]!, vertices[i]!, vertices[i + 1]!]);
      }
    }
    const part = scadgenParts.part(record.partId);
    return [
      {
        id: record.id,
        name: record.name,
        partNumber: part?.number ?? "",
        materialId: record.materialId,
        bomKey: record.partId ?? record.id,
        edges,
        faces,
        circles: circlesFromEdgeLoops(edges),
      },
    ];
  });
}
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
import FeatureDialog from "../components/FeatureDialog";
import { CollaborationPanel } from "../components/CollaborationPanel";
import { SessionPresenceStrip } from "../components/SessionPresenceStrip";
import { ShareGate } from "../components/ShareGate";
import { ViewerToolbar } from "../components/ViewerToolbar";
import { SketchPropertiesSidePanel } from "../components/SketchPropertiesSidePanel";
import {
  BodyPropertiesPanel,
  type BodySelectionEntry,
} from "../components/BodyPropertiesPanel";
import { AppearancePanel } from "../components/AppearancePanel";
import { CanvasContextMenu } from "../components/CanvasContextMenu";
import { bodyPropertiesOf } from "../model/bodyProperties";
import {
  classifyPhase6Body,
  phase6BodyKindLabel,
  type Phase6BodyKind,
} from "../model/phase6";
import { phase6TreeFolder } from "../model/phase6b";
import {
  applyConfigurationConditionsToBomRows,
  applyConfigurationToAssembly,
  applyConfigurationToBomRows,
  applyConfigurationToNodes,
  configurationOverrides,
  configurationVariableScope,
  type ConfigurationTable,
} from "../phase7/configurations";
import type { FeatureScriptFeature } from "../phase7/featurescript";
import type { P7Value } from "../phase7/expression";
import {
  emptyPhase7TabDesign,
  featureStudioFromDesign,
  featureStudioTabDesign,
  documentVariableValues,
  refreshDocumentVariables,
  scadgenPhase7Part,
  setDocumentVariableValues,
  variableStudioFromDesign,
  variableStudioTabDesign,
  withConfigurationVariables,
  type Phase7PartState,
} from "../phase7/store";
import {
  buildCustomFeatureNode,
  type FeatureStudioDocument,
} from "../phase7/featureStudio";
import {
  migrateSketchVariables,
  type VariableStudioDocument,
} from "../phase7/variables";
import { inspectBody, inspectBodies } from "../model/inspect";
import { useLineMaterialResize } from "../hooks/useLineMaterialResize";
import { useOriginHelpers } from "../hooks/useOriginHelpers";
import { StatusBar } from "../components/StatusBar";
import type {
  AssemblyPick,
  AssemblySolveResult,
} from "../components/AssemblyWorkspace";

const AssemblyWorkspace = React.lazy(() =>
  import("../components/AssemblyWorkspace").then((module) => ({
    default: module.AssemblyWorkspace,
  })),
);
const DrawingWorkspace = React.lazy(() =>
  import("../components/DrawingWorkspace").then((module) => ({
    default: module.DrawingWorkspace,
  })),
);
const PrintWizard = React.lazy(() =>
  import("../components/PrintWizard").then((module) => ({
    default: module.PrintWizard,
  })),
);
const CamStudioWorkspace = React.lazy(() =>
  import("../components/CamStudioWorkspace").then((module) => ({
    default: module.CamStudioWorkspace,
  })),
);
const RenderStudioWorkspace = React.lazy(() =>
  import("../components/RenderStudioWorkspace").then((module) => ({
    default: module.RenderStudioWorkspace,
  })),
);
const SimulationStudioWorkspace = React.lazy(() =>
  import("../components/SimulationStudioWorkspace").then((module) => ({
    default: module.SimulationStudioWorkspace,
  })),
);
const ScadStudioPcbWorkspace = React.lazy(() =>
  import("../components/ScadStudioPcbWorkspace").then((module) => ({
    default: module.ScadStudioPcbWorkspace,
  })),
);
const EcadPanel = React.lazy(() =>
  import("../components/EcadPanel").then((module) => ({
    default: module.EcadPanel,
  })),
);
const workspaceFallback = (
  <div className="flex h-full items-center justify-center text-sm text-gray-400">
    Loading workspace…
  </div>
);
import { CustomFeaturePanel } from "../components/CustomFeaturePanel";
import { VariableStudioWorkspace } from "../components/VariableStudioWorkspace";
import { FeatureStudioWorkspace } from "../components/FeatureStudioWorkspace";
import {
  camStudioFromDesign,
  camStudioTabDesign,
  emptyCamDocument,
  type CamDocument,
} from "../cam/model";
import {
  emptyRenderDocument,
  renderStudioFromDesign,
  renderStudioTabDesign,
  type RenderDocument,
} from "../render/model";
import {
  emptySimulationDocument,
  simulationStudioFromDesign,
  simulationStudioTabDesign,
  type SimDocument,
} from "../sim/model";
import { emptyPcbStudio, pcbStudioTabDesign } from "../pcb/empty";
import type { PcbStudioDocument } from "../pcb/model";
import { isStudioTabKind, tabKindDisabledReason } from "../document/studios";
const ConfigurationPanel = React.lazy(() =>
  import("../components/ConfigurationPanel").then((module) => ({
    default: module.ConfigurationPanel,
  })),
);
import type { Ecad } from "../ecad/install";
import {
  exportSelectionStl,
  selectionBboxMM,
  type SelectionStl,
} from "../printers/exportSelection";
import { PrimaryToolbar } from "../components/PrimaryToolbar";
import { GlobalToolSearch } from "../components/GlobalToolSearch";
import {
  RUN_SKETCH_COMMAND_EVENT,
  type ToolSearchEntry,
} from "../model/toolSearch";
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
function bodyOutputByFeatureId(featureId: string) {
  const direct = scadgenExecutor.outputs.get(featureId);
  if (direct) return direct;
  for (const out of scadgenExecutor.outputs.values()) {
    const extra = out.additionalBodies?.find((b) => b.featureId === featureId);
    if (extra) return extra;
  }
  for (const set of scadgenExecutor.bodySets.values()) {
    const hit = set.find((b) => b.featureId === featureId);
    if (hit) return hit;
  }
  return null;
}

/** Nearest brep vertex index on the picked face, in world space. */
function nearestBrepVertexLocal(
  featureId: string,
  point: THREE.Vector3,
): [number, number, number] | null {
  const out = bodyOutputByFeatureId(featureId);
  if (!out) return null;
  let best: [number, number, number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const vertex of out.brep.vertices) {
    const dx = vertex.x - point.x;
    const dy = vertex.y - point.y;
    const dz = vertex.z - point.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [vertex.x, vertex.y, vertex.z];
    }
  }
  return best;
}

function nearestBrepEdgeLocal(
  featureId: string,
  point: THREE.Vector3,
): { point: [number, number, number]; axis: [number, number, number] } | null {
  const out = bodyOutputByFeatureId(featureId);
  if (!out) return null;
  let best: {
    point: [number, number, number];
    axis: [number, number, number];
  } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const edge of out.brep.edges) {
    const ax = edge.start.x;
    const ay = edge.start.y;
    const az = edge.start.z;
    const bx = edge.end.x;
    const by = edge.end.y;
    const bz = edge.end.z;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const lengthSq = abx * abx + aby * aby + abz * abz;
    const t =
      lengthSq <= 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - ax) * abx +
                (point.y - ay) * aby +
                (point.z - az) * abz) /
                lengthSq,
            ),
          );
    const px = ax + abx * t;
    const py = ay + aby * t;
    const pz = az + abz * t;
    const dx = px - point.x;
    const dy = py - point.y;
    const dz = pz - point.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance >= bestDistance) continue;
    const length = Math.sqrt(lengthSq) || 1;
    bestDistance = distance;
    best = {
      point: [px, py, pz],
      axis: [abx / length, aby / length, abz / length],
    };
  }
  return best;
}

function nearestVertexIndex(
  featureId: string,
  faceTag: string,
  worldPoint: THREE.Vector3,
): number | null {
  const out = bodyOutputByFeatureId(featureId);
  if (!out) return null;
  const match = /_F(\d+)$/.exec(faceTag);
  const faceIndex = match?.[1] !== undefined ? Number(match[1]) : -1;
  const face = faceIndex >= 0 ? out.brep.faces[faceIndex] : undefined;
  const faceKeys = new Set(
    (face?.vertices ?? []).map((v) => `${v.x},${v.y},${v.z}`),
  );
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  out.brep.vertices.forEach((v, index) => {
    if (faceKeys.size && !faceKeys.has(`${v.x},${v.y},${v.z}`)) return;
    const dx = v.x + out.position.x - worldPoint.x;
    const dy = v.y + out.position.y - worldPoint.y;
    const dz = v.z + out.position.z - worldPoint.z;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best >= 0 ? best : null;
}

function snapshotFeatureHistory() {
  const nodes = scadgenHistory.serializeNodes();
  const rollback = scadgenHistory.getRollbackIndex();
  return {
    nodes,
    states: scadgenHistory.toListResponse().featureStates,
    details: Object.fromEntries(
      Object.entries(scadgenExecutor.lastReport).map(([id, report]) => [
        id,
        report.detail ?? "",
      ]),
    ),
    rollback,
    rollbackLabel: rollbackDescription(nodes, rollback) ?? undefined,
  };
}

interface DisplayMaterialBase {
  color?: THREE.Color;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  depthTest: boolean;
  wireframe?: boolean;
  linewidth?: number;
}

type DisplayMaterial = THREE.Material & {
  color?: THREE.Color;
  wireframe?: boolean;
  linewidth?: number;
  clippingPlanes?: THREE.Plane[] | null;
  clipShadows?: boolean;
};

function displayMaterialBase(material: DisplayMaterial): DisplayMaterialBase {
  const existing = material.userData.__displayBase as
    | DisplayMaterialBase
    | undefined;
  if (existing) return existing;
  const base: DisplayMaterialBase = {
    ...(material.color ? { color: material.color.clone() } : {}),
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    ...(material.wireframe !== undefined
      ? { wireframe: material.wireframe }
      : {}),
    ...(material.linewidth !== undefined
      ? { linewidth: material.linewidth }
      : {}),
  };
  material.userData.__displayBase = base;
  return base;
}

function applyMeshDisplayStyle(
  material: DisplayMaterial,
  base: DisplayMaterialBase,
  style: DisplayStyle,
) {
  material.wireframe = false;
  material.depthTest = base.depthTest;
  if (style === "hidden-edges-removed" || style === "hidden-edges-visible") {
    material.color?.set(0xffffff);
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    return;
  }
  if (style === "translucent") {
    if (base.color) material.color?.copy(base.color);
    material.opacity = Math.min(base.opacity, 0.35);
    material.transparent = true;
    material.depthWrite = false;
    return;
  }
  if (base.color) material.color?.copy(base.color);
  material.opacity = base.opacity;
  material.transparent = base.transparent;
  material.depthWrite = base.depthWrite;
}

function applyEdgeDisplayStyle(
  material: DisplayMaterial,
  base: DisplayMaterialBase,
  style: DisplayStyle,
) {
  const baseWidth = base.linewidth ?? 1.5;
  if (style === "hidden-edges-removed" || style === "hidden-edges-visible") {
    const removed = style === "hidden-edges-removed";
    material.color?.set(removed ? 0x1a1a1a : 0x7a7a7a);
    material.linewidth = removed ? 2.1 : 1.35;
    material.depthTest = removed;
    material.depthWrite = false;
    material.opacity = removed ? 1 : 0.8;
    material.transparent = !removed;
    return;
  }
  if (style === "shaded-hidden-edges") {
    material.color?.set(0x7a7a7a);
    material.linewidth = Math.max(baseWidth, 1.2);
    material.depthTest = false;
    material.depthWrite = false;
    material.opacity = 0.55;
    material.transparent = true;
    return;
  }
  if (base.color) material.color?.copy(base.color);
  material.linewidth = baseWidth;
  material.depthTest = base.depthTest;
  material.depthWrite = base.depthWrite;
  material.opacity = style === "translucent" ? 0.6 : base.opacity;
  material.transparent = style === "translucent" ? true : base.transparent;
}

interface SimpleCadSceneProps {
  initialMode?: SceneMode;
}

const SimpleCadScene: React.FC<SimpleCadSceneProps> = ({
  initialMode = "move",
}) => {
  const { showToast } = useToast();
  const mountRef = useRef<HTMLDivElement>(null);
  const pendingAuthorFixups = useRef(
    new Map<string, import("../model/executor").BodyOutput>(),
  );
  const seenElementIds = useRef(new Set<string>());
  const {
    selectElement,
    deselectElement,
    elements,
    sketches,
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
    pushUndo,
    dropLastUndo,
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
    sceneReady,
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
  const [hiddenBodyElements, setHiddenBodyElements] = useState<Set<string>>(
    () => new Set(),
  );
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>("shaded");
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>("off");
  const [sectionOffset, setSectionOffset] = useState(0);
  const [sectionFlip, setSectionFlip] = useState(false);
  const sectionLimit = useMemo(() => {
    const box = new THREE.Box3();
    let found = false;
    for (const element of elements) {
      const object = getObject(element.nodeId) as ThreeObj | undefined;
      if (!object) continue;
      box.expandByObject(object);
      found = true;
    }
    if (!found) return 0.1;
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z, 0.1);
  }, [elements, getObject]);
  const sectionStep = Math.max(sectionLimit / 200, 0.0005);
  // Parts/body metadata is document data held in a mutable registry; this
  // counter forces the Browser and inspector to re-render on every change.
  const [partsRevision, setPartsRevision] = useState(0);
  const initialGroundPlaneHidden = useRef(false);
  useEffect(() => {
    if (initialGroundPlaneHidden.current) return;
    initialGroundPlaneHidden.current = true;
    if (showGroundPlane) toggleGroundPlane();
  }, [showGroundPlane, toggleGroundPlane]);
  const initialOriginHidden = useRef(false);
  useEffect(() => {
    if (initialOriginHidden.current) return;
    initialOriginHidden.current = true;
    for (const id of [
      "origin-xy",
      "origin-xz",
      "origin-yz",
      "origin-x-axis",
      "origin-y-axis",
      "origin-z-axis",
      "origin-point",
    ]) {
      if (originVisibility[id]) toggleOriginVisibility(id);
    }
  }, [originVisibility, toggleOriginVisibility]);
  useEffect(() => {
    if (!sceneReady || !scene) return;
    scene.background = new THREE.Color(0xf8f9fa);
  }, [scene, sceneReady]);

  // Display styles are view state, not model data. Apply them to the live body
  // materials and edge overlays, then let normal appearance updates re-apply
  // the style after a rebuild.
  useEffect(() => {
    if (!sceneReady || !scene) return;
    const axis =
      sectionAxis === "x"
        ? new THREE.Vector3(1, 0, 0)
        : sectionAxis === "y"
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    if (sectionFlip) axis.multiplyScalar(-1);
    const sectionPlanes =
      sectionAxis === "off"
        ? null
        : [new THREE.Plane(axis, sectionFlip ? sectionOffset : -sectionOffset)];
    if (renderer) renderer.localClippingEnabled = sectionAxis !== "off";

    for (const element of elements) {
      const object = getObject(element.nodeId) as ThreeObj | undefined;
      if (!object) continue;
      object.traverse((child) => {
        const isEdge = child.userData.isEdgeOverlay === true;
        const mesh = child as ThreeMesh & {
          isMesh?: boolean;
          material?: DisplayMaterial | DisplayMaterial[];
        };
        if (!mesh.isMesh && !isEdge) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const material of materials) {
          if (!material) continue;
          const base = displayMaterialBase(material);
          if (isEdge) {
            child.visible = displayStyle !== "shaded-no-edges";
            applyEdgeDisplayStyle(material, base, displayStyle);
          } else {
            applyMeshDisplayStyle(material, base, displayStyle);
          }
          material.clippingPlanes = sectionPlanes;
          material.clipShadows = true;
          material.needsUpdate = true;
        }
      });
    }
    forceSceneUpdate();
  }, [
    displayStyle,
    elements,
    forceSceneUpdate,
    getObject,
    partsRevision,
    renderer,
    scene,
    sceneReady,
    sectionAxis,
    sectionFlip,
    sectionOffset,
  ]);
  useEffect(
    () => scadgenParts.onChange(() => setPartsRevision((v) => v + 1)),
    [],
  );
  // History-only rows have no body element; this keeps their row selected and
  // keeps multi-body extras (featureId#k) highlighted through the owner row.
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null,
  );
  const [historySnapshot, setHistorySnapshot] = useState(
    snapshotFeatureHistory,
  );

  // Tree operations (suppress, move, rename, delete, rollback, folder) push a
  // cadjs undo entry before mutating. This adapter puts the feature history in
  // every snapshot so the document undo/redo stack restores it as well.
  useEffect(() => {
    return setUndoExternalStateAdapter({
      capture: () => scadgenHistory.snapshotState(),
      restore: (snapshot) => {
        if (snapshot && typeof snapshot === "object")
          scadgenHistory.restoreState(snapshot as FeatureHistorySnapshot);
      },
    });
  }, []);

  // Browser rows carry history status/actions; recompute when the feature
  // history changes (suppress, rollback, reorder, parameter update).
  useEffect(() => {
    const sync = () => setHistorySnapshot(snapshotFeatureHistory());
    sync();
    const offHistory = scadgenHistory.onRecompute(sync);
    const offRebuilt = scadgenExecutor.onRebuilt(sync);
    return () => {
      offHistory();
      offRebuilt();
    };
  }, []);

  // Resolve the URL once. A share link selects its project and role before the
  // scene ever hydrates; a bad/revoked link keeps the design behind the gate.
  const bootAccessRef = useRef<ReturnType<typeof resolveBootProject> | null>(
    null,
  );
  if (bootAccessRef.current === null) {
    try {
      bootAccessRef.current = resolveBootProject(
        window.location.pathname,
        window.location.search,
      );
    } catch {
      bootAccessRef.current = {
        doc: null,
        role: "view",
        allowVr: false,
        denied: true,
        share: null,
      };
    }
  }
  const bootAccess = bootAccessRef.current;
  const [sessionRole, setSessionRole] = useState<ShareRole>(bootAccess.role);
  const [shareDenied] = useState(bootAccess.denied);
  const [vrGateOpen, setVrGateOpen] = useState(Boolean(bootAccess.share?.vr));
  const [collabOpen, setCollabOpen] = useState(false);
  const [, setShareRevision] = useState(0);
  const canEdit = canRoleEdit(sessionRole);

  // ECAD: virtual microcontrollers + screens (desk/VR/voice/AI share one bus).
  // The sim/layer persist app-wide; installEcad re-registers actions whenever
  // this effect rebuilds the ActionBus, and the flux effect wires the AI agent.
  const [ecadOpen, setEcadOpen] = useState(false);
  const [ecadReady, setEcadReady] = useState(false);
  const ecadRef = useRef<Ecad | null>(null);
  const ecadEnsureRef = useRef<(() => Promise<Ecad>) | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(scene);
  sceneRef.current = scene;

  // The visualizer can mount before the document chrome settles to its final
  // height. On the first desktop frame that leaves a transparent strip at the
  // top of the canvas until something forces a resize. Re-apply the current
  // container size once after layout so the first paint is full-bleed.
  useEffect(() => {
    if (!sceneReady || !renderer || !scene || !camera) return;
    const container = mountRef.current;
    if (!container) return;
    const syncRendererSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
    };
    const frame = requestAnimationFrame(syncRendererSize);
    const timer = window.setTimeout(syncRendererSize, 250);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [camera, renderer, scene, sceneReady]);

  // In-scene assembly state (driven by the action bus: assembly.*).
  const assemblyRef = useRef<{ asm: Assembly; refs: RefMap | undefined }>({
    asm: emptyAssemblyTab("").assembly,
    refs: undefined,
  });
  const assemblyUiRef = useRef<{
    explode: number;
    positions: AssemblyPosition[];
    bomMode: "structured" | "indented" | "flat";
    solve: AssemblySolveSnapshot | null;
  }>({
    explode: 0,
    positions: [{ name: "Default", explode: 0 }],
    bomMode: "structured",
    solve: null,
  });
  const [assemblyPerf, setAssemblyPerf] =
    useState<AssemblyPerformanceReport | null>(null);
  const assemblyGhostsRef = useRef<ThreeObj[]>([]);
  const assemblyMarkerGroupRef = useRef<THREE.Group | null>(null);
  const [assemblyPickMode, setAssemblyPickMode] = useState<
    AssemblyPick["kind"] | null
  >(null);
  const [assemblyReturnTab, setAssemblyReturnTab] = useState<string | null>(
    null,
  );
  const [assemblyViewportMode, setAssemblyViewportMode] = useState(false);
  const assemblyViewportDragIdRef = useRef("");
  const assemblyViewportDragRef = useRef<{ x: number; y: number } | null>(null);
  const assemblySourceRollbackRef = useRef<number | null>(null);
  const assemblyRenderStatsRef = useRef({
    instancedBatches: 0,
    instancedLeaves: 0,
    lodCounts: { full: 0, reduced: 0, proxy: 0 },
  });
  const assemblyPickResolverRef = useRef<
    ((pick: AssemblyPick | null) => void) | null
  >(null);
  const assemblyTabPayload = (
    sourceTabId: string,
    assembly: Assembly,
    explodeValue: number,
    positionsValue: AssemblyPosition[],
  ): string =>
    serializeAssemblyTab({
      v: 1,
      kind: "assembly",
      sourceTabId,
      assembly,
      explode: explodeValue,
      positions: positionsValue,
      bomMode: assemblyUiRef.current.bomMode,
      ...(assemblyUiRef.current.solve
        ? { solve: assemblyUiRef.current.solve }
        : {}),
    });
  const drawingRef = useRef<DrawingTabData>(emptyDrawingTab("", null));
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [phase7PartState, setPhase7PartState] = useState<Phase7PartState>(() =>
    scadgenPhase7Part.snapshot(),
  );
  const configurationBaseRef = useRef<FeatureHistorySnapshot | null>(null);
  const loadedPartStudioIdRef = useRef<string | null>(null);
  const [workspaceTick, setWorkspaceTick] = useState(0);
  const busRef = useRef<import("../model/actionBus").ActionBus | null>(null);
  const [availableOps, setAvailableOps] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Document tabs: one persisted CadDocument per project. The active tab owns
  // the serialized design blob, so a reload (and every tab switch) restores
  // the Part Studio the user was actually in. View-only shares can open tabs
  // but not mutate the document.
  const documentRef = useRef<CadDocument | null>(null);
  if (documentRef.current === null && bootAccess.doc) {
    try {
      documentRef.current = ensureDocument(bootAccess.doc);
    } catch {
      documentRef.current = null;
    }
  }
  const [cadDocument, setCadDocument] = useState<CadDocument | null>(
    documentRef.current,
  );
  const activeTab = cadDocument ? activeDocumentTab(cadDocument) : null;
  const activeTabKind = activeTab?.kind ?? "partstudio";
  const activeVariableStudio = useMemo(
    () =>
      activeTabKind === "variablestudio" && activeTab
        ? variableStudioFromDesign(activeTab.design)
        : null,
    [activeTab?.id, activeTab?.design, activeTabKind],
  );
  const activeFeatureStudio = useMemo(
    () =>
      activeTabKind === "featurestudio" && activeTab
        ? featureStudioFromDesign(activeTab.design)
        : null,
    [activeTab?.id, activeTab?.design, activeTabKind],
  );
  const activeCamStudio = useMemo(
    () =>
      activeTabKind === "camstudio" && activeTab
        ? camStudioFromDesign(activeTab.design)
        : null,
    [activeTab?.id, activeTab?.design, activeTabKind],
  );
  const activeRenderStudio = useMemo(
    () =>
      activeTabKind === "renderstudio" && activeTab
        ? renderStudioFromDesign(activeTab.design)
        : null,
    [activeTab?.id, activeTab?.design, activeTabKind],
  );
  const activeSimulationStudio = useMemo(
    () =>
      activeTabKind === "simulationstudio" && activeTab
        ? simulationStudioFromDesign(activeTab.design)
        : null,
    [activeTab?.id, activeTab?.design, activeTabKind],
  );
  const [activePcbStudio, setActivePcbStudio] =
    useState<PcbStudioDocument | null>(null);
  const activePcbDesign = activeTab?.design;
  useEffect(() => {
    if (activeTabKind !== "pcbstudio" || !activePcbDesign) {
      setActivePcbStudio(null);
      return;
    }
    let cancelled = false;
    void import("../pcb/model").then(({ pcbStudioFromDesign }) => {
      if (!cancelled) setActivePcbStudio(pcbStudioFromDesign(activePcbDesign));
    });
    return () => {
      cancelled = true;
    };
  }, [activePcbDesign, activeTabKind]);
  const setDocument = useCallback((next: CadDocument) => {
    documentRef.current = next;
    setCadDocument(next);
    try {
      saveDocument(next);
    } catch {
      /* quota — the in-memory document is still authoritative */
    }
  }, []);
  // Document variables are shared by every Part Studio in the document. Publish
  // them before a rebuild so feature expressions resolve document-level names.
  const refreshPhase7Scope = useCallback((doc: CadDocument | null) => {
    if (!doc) return;
    refreshDocumentVariables(doc.tabs);
    scadgenExecutor.requestRebuild();
  }, []);
  // Derived Part Studio: resolve the source tab's persisted design on every
  // rebuild, so edits in another tab propagate instead of copying stale
  // geometry once at creation.
  useEffect(() => {
    scadgenExecutor.setDeriveResolver((tabId) => {
      const tab = documentRef.current?.tabs.find((t) => t.id === tabId);
      return tab?.design ?? null;
    });
    return () => scadgenExecutor.setDeriveResolver(null);
  }, []);
  // Boot hydration is one-shot: restoring a tab must not re-run every time a
  // tab edit updates the document object.
  const hydratedTabRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [docPanelOpen, setDocPanelOpen] = useState(false);
  const [appearancePanelOpen, setAppearancePanelOpen] = useState(false);
  const [canvasMenu, setCanvasMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [storageStatus, setStorageStatus] = useState<DocumentStorageStatus>(
    getDocumentStorageStatus(),
  );
  const suppressDirtyRef = useRef(true);
  const dirtyKeyRef = useRef("");
  const lastStorageErrorRef = useRef<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const fitAllRef = useRef<() => void>(() => {});

  useEffect(() => subscribeDocumentStorage(setStorageStatus), []);
  useEffect(() => {
    const error = storageStatus.lastError;
    if (!error || error === lastStorageErrorRef.current) return;
    lastStorageErrorRef.current = error;
    showToast(error, "warning");
  }, [showToast, storageStatus.lastError]);

  /**
   * Replace the whole scene with a serialized design. Dropping the authored
   * bodies and feature→element map is required: restoring an empty tab over an
   * existing design would otherwise leave the other tab's geometry behind.
   */
  const applyDesign = useCallback(
    (text?: string, tabId?: string) => {
      for (const el of elementsRef.current) removeElement(el.nodeId);
      for (const ghost of assemblyGhostsRef.current)
        ghost.parent?.remove(ghost);
      assemblyGhostsRef.current = [];
      const markerGroup = assemblyMarkerGroupRef.current;
      if (markerGroup) {
        markerGroup.parent?.remove(markerGroup);
        assemblyMarkerGroupRef.current = null;
      }
      scadgenSceneSync.reset();
      scadgenHistory.clear();
      // A tab switch must not inherit the previous tab's parts; loadProject
      // restores this design's registry (or an empty one).
      scadgenParts.reset();
      loadProject(text);
      loadedPartStudioIdRef.current = tabId ?? null;
      forceSceneUpdate();
    },
    [removeElement, forceSceneUpdate],
  );

  const loadTabDesign = useCallback(
    (tab: DocumentTab) => {
      hydratedTabRef.current = true;
      suppressDirtyRef.current = true;
      setDirty(false);
      try {
        if (tab.kind === "partstudio") {
          applyDesign(tab.design, tab.id);
          setPhase7PartState(scadgenPhase7Part.snapshot());
          refreshPhase7Scope(documentRef.current);
          return;
        }
        if (
          tab.kind === "camstudio" ||
          tab.kind === "renderstudio" ||
          tab.kind === "simulationstudio" ||
          tab.kind === "pcbstudio"
        ) {
          // These studios are document editors; they deliberately do not
          // replace the source Part Studio scene when they become active.
          setWorkspaceTick((value) => value + 1);
          return;
        }
        const current = documentRef.current;
        const sourceId = (() => {
          if (tab.kind === "assembly")
            return parseAssemblyTab(tab.design)?.sourceTabId ?? "";
          if (tab.kind === "drawing")
            return parseDrawingTab(tab.design)?.sourceTabId ?? "";
          return "";
        })();
        const source =
          current?.tabs.find(
            (candidate) =>
              candidate.id === sourceId && candidate.kind === "partstudio",
          ) ??
          current?.tabs.find((candidate) => candidate.kind === "partstudio");
        if (source && loadedPartStudioIdRef.current !== source.id) {
          applyDesign(source.design, source.id);
        }
        if (tab.kind === "assembly") {
          const data =
            parseAssemblyTab(tab.design) ?? emptyAssemblyTab(source?.id ?? "");
          assemblyRef.current = { asm: data.assembly, refs: undefined };
          assemblyUiRef.current = {
            explode: data.explode,
            positions: data.positions,
            bomMode: data.bomMode ?? "structured",
            solve: data.solve ?? null,
          };
        } else if (tab.kind === "drawing") {
          drawingRef.current =
            parseDrawingTab(tab.design) ??
            emptyDrawingTab(source?.id ?? "", null);
        }
        if (tab.kind === "variablestudio" || tab.kind === "featurestudio") {
          refreshPhase7Scope(current ?? null);
        }
        setWorkspaceTick((value) => value + 1);
      } catch {
        /* corrupt tab blob: keep the tab, leave the current scene as-is */
      }
    },
    [applyDesign, refreshPhase7Scope],
  );

  // Restore the active tab once the scene exists. Deferred a tick so the
  // scene-sync bridge (mounted by the visualizer/VR hooks) is configured
  // before the restored feature history rebuilds.
  useEffect(() => {
    if (!sceneReady || hydratedTabRef.current || !cadDocument) return;
    const tab = activeDocumentTab(cadDocument);
    if (!tab || !tab.design) return;
    const timer = window.setTimeout(() => {
      if (hydratedTabRef.current) return;
      loadTabDesign(tab);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sceneReady, cadDocument, loadTabDesign]);

  const dirtyKey = `${undoStack.length}:${elements.length}:${sketches.length}:${partsRevision}`;
  useEffect(() => {
    if (!sceneReady) return;
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      dirtyKeyRef.current = dirtyKey;
      return;
    }
    if (dirtyKey === dirtyKeyRef.current) return;
    dirtyKeyRef.current = dirtyKey;
    setDirty(true);
  }, [dirtyKey, sceneReady]);

  /**
   * Persist the loaded Part Studio scene back into its tab. Assembly-context
   * features are authored in the source history, so an assembly save that
   * only wrote its own JSON would lose those features on the next reload.
   */
  const writeLoadedSource = (
    current: CadDocument,
    sourceId: string,
  ): CadDocument => {
    if (!sourceId || loadedPartStudioIdRef.current !== sourceId) return current;
    const source = current.tabs.find(
      (tab) => tab.id === sourceId && tab.kind === "partstudio",
    );
    if (!source) return current;
    // An assembly source round-trip can briefly leave the live scene empty
    // while the source design is applied. Never replace the stored source with
    // that transient empty snapshot.
    if (scadgenHistory.size() === 0) return current;
    try {
      return writeTabDesign(
        current,
        sourceId,
        saveProject(ecadRef.current?.sim.snapshot()),
      );
    } catch {
      return current;
    }
  };

  /**
   * One save path for the whole project: CAD nodes + the ECAD scene and its
   * firmware. The desk save action, the ECAD panel after a deploy/run, and any
   * surface dispatching `project.save` all land here, so code written in the
   * studio survives a reload instead of dying with the session.
   */
  const persistProject = useCallback((): string => {
    if (!canEditSession()) return "";
    const current = documentRef.current;
    const active = current ? activeDocumentTab(current) : null;
    if (current && active?.kind === "assembly") {
      const sourceId = parseAssemblyTab(active.design)?.sourceTabId ?? "";
      setDocument(
        writeTabDesign(
          writeLoadedSource(current, sourceId),
          active.id,
          assemblyTabPayload(
            sourceId,
            assemblyRef.current.asm,
            assemblyUiRef.current.explode,
            assemblyUiRef.current.positions,
          ),
        ),
      );
      setDirty(false);
      announceDocSaved();
      return "";
    }
    if (current && active?.kind === "drawing") {
      setDocument(
        writeTabDesign(
          current,
          active.id,
          serializeDrawingTab(drawingRef.current),
        ),
      );
      setDirty(false);
      announceDocSaved();
      return "";
    }
    // Studio workspaces persist their own payloads on every edit. Autosave and
    // explicit Save must not replace them with the live Part Studio design.
    if (
      active &&
      (active.kind === "variablestudio" ||
        active.kind === "featurestudio" ||
        isStudioTabKind(active.kind))
    ) {
      setDirty(false);
      announceDocSaved();
      return active.design;
    }
    const snap = ecadRef.current?.sim.snapshot();
    const doc = scadgenProjectRef.current;
    const text = saveProject(snap);
    // Keep the project doc and the active tab on the same serialized design.
    if (doc) {
      try {
        const saved = JSON.parse(text) as {
          savedAt?: number;
          nodes?: unknown[];
          assets?: unknown[];
          ecad?: unknown;
          parts?: unknown;
        };
        doc.design = {
          savedAt: saved.savedAt ?? Date.now(),
          nodes: saved.nodes ?? [],
          assets: saved.assets ?? [],
          ...(saved.parts !== undefined ? { parts: saved.parts } : {}),
          ...(saved.ecad !== undefined ? { ecad: saved.ecad } : {}),
        };
        doc.updatedAt = Date.now();
        saveProjectDoc(doc);
      } catch {
        /* keep the last good project doc */
      }
    }
    if (current) {
      setDocument(writeTabDesign(current, current.activeTabId, text));
    }
    setDirty(false);
    // Let the other surface reload instead of rendering stale bodies.
    announceDocSaved();
    return text;
  }, [setDocument]);

  const saveCurrentDocument = useCallback(() => {
    if (!canEdit) return;
    setSaving(true);
    try {
      persistProject();
      setDirty(false);
      showToast("Document saved", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setSaving(false);
    }
  }, [canEdit, persistProject, showToast]);

  /* ---------------------------------------------------------------------- */
  /* Document tab operations                                                */
  /* ---------------------------------------------------------------------- */

  // Switching mid-sketch (or during an async rebuild) would discard work, so
  // the bar is disabled then; this is the matching guard for direct calls.
  const tabsLocked = () =>
    !canEdit || isOperationPending || (mode === "sketch" && !!activeSketch);

  /** Serialize the live scene or workspace into the active tab. */
  const captureTabs = (): CadDocument | null => {
    const current = documentRef.current;
    if (!current) return null;
    if (!canEditSession()) return current;
    const active = activeDocumentTab(current);
    if (!active) return current;
    try {
      // Studio payloads are written directly by their workspaces. Never
      // serialize the live Part Studio scene into a studio tab while switching
      // away from it, or the studio state is lost.
      if (
        active.kind === "variablestudio" ||
        active.kind === "featurestudio" ||
        isStudioTabKind(active.kind)
      ) {
        return current;
      }
      if (active.kind === "assembly") {
        const sourceId = parseAssemblyTab(active.design)?.sourceTabId ?? "";
        return writeTabDesign(
          writeLoadedSource(current, sourceId),
          active.id,
          assemblyTabPayload(
            sourceId,
            assemblyRef.current.asm,
            assemblyUiRef.current.explode,
            assemblyUiRef.current.positions,
          ),
        );
      }
      if (active.kind === "drawing") {
        return writeTabDesign(
          current,
          active.id,
          serializeDrawingTab(drawingRef.current),
        );
      }
      // Returning from in-context source editing must not overwrite the source
      // with an empty scene while its design is still being applied.
      if (assemblyReturnTab && scadgenHistory.size() === 0) return current;
      return writeTabDesign(
        current,
        active.id,
        saveProject(ecadRef.current?.sim.snapshot()),
      );
    } catch {
      return current;
    }
  };

  const handleTabSelect = (tabId: string) => {
    if (tabsLocked()) return;
    const current = captureTabs();
    if (!current || current.activeTabId === tabId) return;
    const next = setActiveDocumentTab(current, tabId);
    const tab = activeDocumentTab(next);
    if (!tab || tab.id !== tabId) return;
    setDocument(next);
    loadTabDesign(tab);
  };

  const handleTabCreate = (kind: DocumentTabKind) => {
    if (tabsLocked() || tabKindDisabledReason(kind)) return;
    const current = captureTabs();
    if (!current) return;
    const active = activeDocumentTab(current);
    const source =
      active?.kind === "partstudio"
        ? active
        : current.tabs.find((candidate) => candidate.kind === "partstudio");
    const design =
      kind === "assembly"
        ? serializeAssemblyTab(emptyAssemblyTab(source?.id ?? ""))
        : kind === "drawing"
          ? serializeDrawingTab(
              emptyDrawingTab(
                source?.id ?? "",
                current.tabs.find((candidate) => candidate.kind === "assembly")
                  ?.id ?? null,
              ),
            )
          : kind === "variablestudio" || kind === "featurestudio"
            ? emptyPhase7TabDesign(kind)
            : kind === "camstudio"
              ? camStudioTabDesign(emptyCamDocument())
              : kind === "renderstudio"
                ? renderStudioTabDesign(emptyRenderDocument())
                : kind === "simulationstudio"
                  ? simulationStudioTabDesign(emptySimulationDocument())
                  : kind === "pcbstudio"
                    ? pcbStudioTabDesign(emptyPcbStudio())
                    : undefined;
    const tab = newDocumentTab(kind, design ? { design } : {});
    setDocument(addDocumentTab(current, tab));
    loadTabDesign(tab);
  };

  const handleTabRename = (tabId: string, name: string) => {
    if (!canEdit) return;
    const current = documentRef.current;
    if (!current) return;
    setDocument(renameDocumentTab(current, tabId, name));
  };

  const handleTabDuplicate = (tabId: string) => {
    if (tabsLocked()) return;
    const current = captureTabs();
    if (!current) return;
    const result = duplicateDocumentTab(current, tabId);
    if (!result) return;
    setDocument(result.document);
    loadTabDesign(result.tab);
  };

  const handleTabMove = (tabId: string, toIndex: number) => {
    if (tabsLocked()) return;
    const current = documentRef.current;
    if (!current) return;
    setDocument(moveDocumentTab(current, tabId, toIndex));
  };

  const handleTabDelete = (tabId: string) => {
    if (tabsLocked()) return;
    const current = captureTabs();
    if (!current) return;
    const wasActive = current.activeTabId === tabId;
    const next = deleteDocumentTab(current, tabId);
    if (!next) return;
    setDocument(next);
    if (wasActive) {
      const tab = activeDocumentTab(next);
      if (tab) loadTabDesign(tab);
    }
  };

  const commitPhase7PartState = (next: Phase7PartState) => {
    setPhase7PartState(scadgenPhase7Part.update(() => next));
  };

  const handleVariableStudioChange = (next: VariableStudioDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "variablestudio") return;
    const updated = writeTabDesign(
      current,
      tab.id,
      variableStudioTabDesign(next),
    );
    setDocument(updated);
    refreshPhase7Scope(updated);
    setDirty(true);
  };

  const handleFeatureStudioChange = (next: FeatureStudioDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "featurestudio") return;
    setDocument(writeTabDesign(current, tab.id, featureStudioTabDesign(next)));
    setDirty(true);
  };

  const handleCamStudioChange = (next: CamDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "camstudio") return;
    setDocument(writeTabDesign(current, tab.id, camStudioTabDesign(next)));
    setDirty(true);
  };

  const handleRenderStudioChange = (next: RenderDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "renderstudio") return;
    setDocument(writeTabDesign(current, tab.id, renderStudioTabDesign(next)));
    setDirty(true);
  };

  const handleSimulationStudioChange = (next: SimDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "simulationstudio") return;
    setDocument(
      writeTabDesign(current, tab.id, simulationStudioTabDesign(next)),
    );
    setDirty(true);
  };

  const handlePcbStudioChange = (next: PcbStudioDocument) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "pcbstudio") return;
    setDocument(writeTabDesign(current, tab.id, pcbStudioTabDesign(next)));
    setDirty(true);
  };

  const handleInsertCustomFeature = (
    feature: FeatureScriptFeature,
    values: Record<string, P7Value>,
  ): { ok: boolean; message: string } => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || !tab || tab.kind !== "featurestudio")
      return { ok: false, message: "Open a Feature Studio tab first" };
    const studio = featureStudioFromDesign(tab.design);
    if (!studio)
      return { ok: false, message: "Feature Studio source is corrupt" };
    const built = buildCustomFeatureNode(studio, feature.id, { values });
    if (!built.node)
      return {
        ok: false,
        message:
          built.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join("; ") || "Could not build the custom feature",
      };
    scadgenHistory.add(built.node);
    const source = current.tabs.find((entry) => entry.kind === "partstudio");
    if (source) {
      const text = saveProject(ecadRef.current?.sim.snapshot());
      setDocument(writeTabDesign(current, source.id, text));
    }
    return { ok: true, message: `Inserted ${feature.label}` };
  };

  const handleConfigurationTablesChange = (
    tables: ConfigurationTable[],
    activeTableId: string | null,
  ) => {
    commitPhase7PartState({
      ...phase7PartState,
      configurations: tables,
      activeConfigurationId: activeTableId,
    });
    persistProject();
  };

  const handleActivateConfiguration = (tableId: string, rowId: string) => {
    const table = phase7PartState.configurations.find(
      (entry) => entry.id === tableId,
    );
    const row = table?.rows.find((entry) => entry.id === rowId);
    if (!table || !row) return;
    const base =
      phase7PartState.base ??
      configurationBaseRef.current ??
      scadgenHistory.snapshotState();
    configurationBaseRef.current = base;
    const working = row.isDefault
      ? base.nodes
      : applyConfigurationToNodes(base.nodes, table, rowId).nodes;
    scadgenHistory.restoreNodes(working, base.rollbackIndex);
    const doc = documentRef.current;
    if (doc) {
      const vars = refreshDocumentVariables(doc.tabs);
      if (!row.isDefault) {
        const overrides = configurationOverrides(table, rowId);
        setDocumentVariableValues(
          withConfigurationVariables(
            vars.values,
            configurationVariableScope(overrides, vars.values),
          ),
          vars.issues,
        );
      }
    }
    scadgenExecutor.requestRebuild();
    commitPhase7PartState({
      ...phase7PartState,
      activeConfigurationId: tableId,
      activeRowId: rowId,
      base,
    });
    persistProject();
    setDirty(true);
  };

  const handleBulkDuplicate = (tabIds: string[]) => {
    if (tabsLocked() || tabIds.length === 0) return;
    const current = captureTabs();
    if (!current) return;
    const result = duplicateDocumentTabs(current, tabIds);
    if (result.tabs.length === 0) return;
    setDocument(result.document);
    loadTabDesign(result.tabs[result.tabs.length - 1]!);
  };

  const handleBulkDelete = (tabIds: string[]) => {
    if (tabsLocked() || tabIds.length === 0) return;
    const current = captureTabs();
    if (!current) return;
    const wasActive = tabIds.includes(current.activeTabId);
    const next = deleteDocumentTabs(current, tabIds);
    if (!next) return;
    setDocument(next);
    if (wasActive) {
      const tab = activeDocumentTab(next);
      if (tab) loadTabDesign(tab);
    }
  };

  const handleRestoreSnapshot = (snapshot: DocumentSnapshot) => {
    if (!canEdit) return;
    const current = documentRef.current;
    if (!current) return;
    const restored = normalizeDocument(snapshot.doc);
    if (!restored) {
      showToast("Snapshot is corrupt", "error");
      return;
    }
    const next = { ...restored, id: current.id, updatedAt: Date.now() };
    setDocument(next);
    const tab = activeDocumentTab(next);
    if (tab) loadTabDesign(tab);
    setDirty(false);
    showToast(`Restored “${snapshot.name}”`, "success");
  };

  // The desk path needs the same scene-sync bridge as VR: history features
  // author bodies into cadjs, and browser rows need the feature→element map.
  const configureSceneSync = useCallback(() => {
    scadgenSceneSync.configure(
      {
        updateElementBrep,
        postCreate: (nodeId, out) => {
          pendingAuthorFixups.current.set(nodeId, out);
        },
        createElement: makeElementAuthor(
          (b, p) =>
            (
              addElement as unknown as (
                b: unknown,
                p: unknown,
                object?: unknown,
                recordUndo?: boolean,
              ) => void
            )(b, p, undefined, false),
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
              const displayMaterial = mm as DisplayMaterial;
              const base = displayMaterial.userData.__displayBase as
                | DisplayMaterialBase
                | undefined;
              if (ap.color !== undefined) {
                (mm as ThreeMat).color.set(ap.color!);
                base?.color?.set(ap.color!);
              }
              if (ap.opacity !== undefined) {
                mm.opacity = ap.opacity;
                mm.transparent = ap.opacity < 1;
                mm.depthWrite = ap.opacity >= 1;
                if (base) {
                  base.opacity = ap.opacity;
                  base.transparent = ap.opacity < 1;
                  base.depthWrite = ap.opacity >= 1;
                }
              }
              mm.needsUpdate = true;
            }
          });
        },
      },
      scadgenHistory,
    );
  }, [addElement, getObject, idCounter, updateElementBrep]);

  useEffect(() => {
    if (sceneReady) configureSceneSync();
  }, [configureSceneSync, sceneReady]);

  // First-party primitive creation is a real desk path, not a debug-only hook:
  // the toolbar picker and the action bus both append the same feature nodes.
  const createPrimitive = useCallback(
    (kind: ShapeKind, opts: Record<string, unknown> = {}) => {
      const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
      const result = buildShape(fid, kind, opts);
      const label = PRIMITIVE_LABELS[kind];
      const existing = scadgenHistory
        .toListResponse()
        .features.filter(
          (feature) =>
            (feature.name === label || feature.name.startsWith(`${label} `)) &&
            !feature.name.includes(" sketch"),
        ).length;
      const name = `${label} ${existing + 1}`;
      for (const node of result.nodes) scadgenHistory.add(node);
      scadgenHistory.rename(result.op.featureId, name);
      scadgenHistory.rename(result.sketch.featureId, `${name} sketch`);
      return result;
    },
    [],
  );

  // Scene hook bag + ActionBus. The bag itself is small; ECAD is imported
  // lazily below so it stays out of the initial production payload.
  useEffect(() => {
    let preloadTimer = 0;
    const scadgen = {
      nextId: () => `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`,
      history: () => scadgenHistory.toListResponse(),
      setSuppressed: (fid: string, suppressed: boolean) =>
        scadgenHistory.setSuppressed(fid, suppressed),
      setRollback: (index: number | null) =>
        scadgenHistory.setRollbackTo(index),
      moveFeature: (fid: string, toIndex: number) =>
        scadgenHistory.move(fid, toIndex),
      renameFeature: (fid: string, name: string) =>
        scadgenHistory.rename(fid, name),
      configureSync: configureSceneSync,
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
        const result = createPrimitive(kind, opts);
        return {
          featureId: result.bodyFeatureId,
          profileFeatureId: result.profileFeatureId,
        };
      },
      sphere: (r: number) => {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        for (const n of buildSphereNodes(fid, "Sph", r)) scadgenHistory.add(n);
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
      sweepSimple: () => {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        const profileSketch = `${fid}_psk`;
        const pathSketch = `${fid}_path`;
        const plane = {
          type: "XY",
          origin: [0, 0, 0],
          normal: [0, 0, 1],
          xAxis: [1, 0, 0],
          yAxis: [0, 1, 0],
        };
        const rect = (w: number, h: number) => [
          { id: "p1", type: "point", x: 0, y: 0 },
          { id: "p2", type: "point", x: w, y: 0 },
          { id: "p3", type: "point", x: w, y: h },
          { id: "p4", type: "point", x: 0, y: h },
          { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
          { id: "l2", type: "line", p1Id: "p2", p2Id: "p3" },
          { id: "l3", type: "line", p1Id: "p3", p2Id: "p4" },
          { id: "l4", type: "line", p1Id: "p4", p2Id: "p1" },
        ];
        scadgenHistory.add(
          buildSketchNode(
            profileSketch,
            "Sweep profile",
            ["l1", "l2", "l3", "l4"],
            null,
            {
              id: profileSketch,
              plane,
              primitives: rect(0.01, 0.01),
              constraints: [],
            },
          ),
        );
        // A sketch body must be closed (the executor rejects open wires),
        // but pathPointsFromSnapshot reads only its line: arc + chord gives a
        // valid profile and a straight two-point sweep path.
        scadgenHistory.add(
          buildSketchNode(pathSketch, "Sweep path", ["a1", "l1"], null, {
            id: pathSketch,
            plane,
            primitives: [
              { id: "p1", type: "point", x: 0, y: 0 },
              { id: "p2", type: "point", x: 0.05, y: 0 },
              { id: "pc", type: "point", x: 0.025, y: 0 },
              {
                id: "a1",
                type: "arc",
                centerId: "pc",
                startId: "p1",
                endId: "p2",
                radius: 0.025,
              },
              { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
            ],
            constraints: [],
          }),
        );
        scadgenHistory.add(
          buildSweepNode(
            fid,
            "Sweep",
            [provenanceForFeature(profileSketch, "SKETCH_ENTITY", "l1")],
            [provenanceForFeature(pathSketch, "SKETCH_ENTITY", "l1")],
          ),
        );
        return fid;
      },
      loftSimple: () => {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        const skA = `${fid}_ska`;
        const skB = `${fid}_skb`;
        const planeAt = (z: number) => ({
          type: "XY",
          origin: [0, 0, z],
          normal: [0, 0, 1],
          xAxis: [1, 0, 0],
          yAxis: [0, 1, 0],
        });
        const rect = (w: number, h: number) => [
          { id: "p1", type: "point", x: 0, y: 0 },
          { id: "p2", type: "point", x: w, y: 0 },
          { id: "p3", type: "point", x: w, y: h },
          { id: "p4", type: "point", x: 0, y: h },
          { id: "l1", type: "line", p1Id: "p1", p2Id: "p2" },
          { id: "l2", type: "line", p1Id: "p2", p2Id: "p3" },
          { id: "l3", type: "line", p1Id: "p3", p2Id: "p4" },
          { id: "l4", type: "line", p1Id: "p4", p2Id: "p1" },
        ];
        scadgenHistory.add(
          buildSketchNode(skA, "Loft base", ["l1", "l2", "l3", "l4"], null, {
            id: skA,
            plane: planeAt(0),
            primitives: rect(0.02, 0.02),
            constraints: [],
          }),
        );
        scadgenHistory.add(
          buildSketchNode(skB, "Loft top", ["l1", "l2", "l3", "l4"], null, {
            id: skB,
            plane: planeAt(0.02),
            primitives: rect(0.01, 0.01),
            constraints: [],
          }),
        );
        scadgenHistory.add(
          buildLoftNode(
            fid,
            "Loft",
            [
              provenanceForFeature(skA, "SKETCH_ENTITY", "l1"),
              provenanceForFeature(skB, "SKETCH_ENTITY", "l1"),
            ],
            [],
            false,
          ),
        );
        return fid;
      },
      booleanUnion: (targetFid: string, toolFid: string) => {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildBooleanNode(
            fid,
            "Union",
            [provenanceForFeature(targetFid, "FACE", "")],
            [provenanceForFeature(toolFid, "FACE", "")],
            "ADD",
          ),
        );
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
      extrudeRect: (w: number, h: number, depth: number) => {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        const sketchFid = `${fid}_sk`;
        const nodes = buildRectangleProfileNodes(sketchFid, "Extrude profile", {
          width: w,
          height: h,
        });
        for (const n of nodes) scadgenHistory.add(n);
        const extrudeFid = `${fid}_ex`;
        scadgenHistory.add(
          buildExtrudeNode(
            extrudeFid,
            "Extrude",
            [
              provenanceForFeature(
                nodes[0]?.featureId ?? sketchFid,
                "SKETCH_ENTITY",
                "l1",
              ),
            ],
            { value: depth, units: "m", expression: String(depth) },
          ),
        );
        return { sketch: sketchFid, extrude: extrudeFid };
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
        opts?: {
          holeType?: "SIMPLE" | "COUNTERBORE" | "COUNTERSINK" | "TAPPED";
          counterboreRadius?: number;
          counterboreDepth?: number;
        },
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildHoleNode(nf, "Hole", fid, centers, r, d, [0, 0, -1], true, opts),
        );
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
        scadgenHistory.add(buildDeleteBodiesNode(nf, "Delete Bodies", owners));
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
          buildCurvePatternNode(nf, "Curve Pattern", fid, pts, count, !!align),
        );
        return nf;
      },
      bodyPattern: (
        fid: string,
        count: number,
        direction: [number, number, number],
        spacing: number,
        opts?: {
          separate?: boolean;
          spacingMode?: "SPACING" | "EXTENT" | "EQUAL";
        },
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildLinearPatternNodes(
            nf,
            "Body Pattern",
            fid,
            count,
            direction,
            spacing,
            { patternType: "body", ...opts },
          ),
        );
        return nf;
      },
      facePattern: (
        fid: string,
        faceTags: string[],
        count: number,
        direction: [number, number, number],
        spacing: number,
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildLinearPatternNodes(
            nf,
            "Face Pattern",
            fid,
            count,
            direction,
            spacing,
            {
              patternType: "face",
              sourceFeatureId: fid,
              faceTags,
            },
          ),
        );
        return nf;
      },
      transform: (
        fid: string,
        transformType: "MOVE" | "ROTATE" | "COPY",
        translation: [number, number, number] = [0, 0, 0],
        rotationAxis: [number, number, number] = [0, 0, 1],
        rotationAngle = 0,
        copy = false,
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildTransformNode(
            nf,
            "Transform",
            fid,
            transformType,
            translation,
            rotationAxis,
            rotationAngle,
            copy,
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
          buildConstrainedSurfaceNode(nf, "Constrained Surface", fid, faceTag),
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
          buildSplitNode(nf, "Split", fid, origin, normal, keep ?? "positive"),
        );
        return nf;
      },
      splitSurface: (
        fid: string,
        toolFid: string,
        keep: "positive" | "negative" | "both" = "both",
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildSplitNode(nf, "Split Surface", fid, [0, 0, 0], [1, 0, 0], keep, {
            splitBy: "surface",
            toolFeatureId: toolFid,
          }),
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
          (n?.extensions as { appearance?: unknown } | undefined)?.appearance ??
          null
        );
      },
      featureParam: (fid: string, parameterId: string) => {
        const n = scadgenHistory.get(fid);
        return n?.parameters.find((p) => p.parameterId === parameterId) ?? null;
      },
      openFeatureDialog: (fid: string) => {
        if (!scadgenHistory.get(fid)) return false;
        handleOpenFeatureDialog(fid);
        return true;
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
      rib: (fid: string | null, opts?: RibOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildRibFeatureNode(nf, "Rib", fid, opts));
        return nf;
      },
      gusset: (fid: string | null, opts?: RibOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildGussetFeatureNode(nf, "Gusset", fid, opts));
        return nf;
      },
      web: (fid: string | null, opts?: RibOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildWebFeatureNode(nf, "Web", fid, opts));
        return nf;
      },
      boss: (fid: string | null, opts?: BossOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildBossFeatureNode(nf, "Boss", fid, opts));
        return nf;
      },
      emboss: (
        fid: string,
        polylines: number[][][],
        opts?: { depth?: number; width?: number },
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildEmbossNode(nf, "Emboss", fid, polylines, opts));
        return nf;
      },
      domeFeature: (fid: string | null, opts?: DomeFeatureOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildDomeFeatureNode(nf, "Dome Feature", fid, opts));
        return nf;
      },
      coil: (fid: string | null, opts?: CoilOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildCoilFeatureNode(nf, "Coil / Spring", fid, opts),
        );
        return nf;
      },
      helixCurve: (opts?: CoilOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildHelixCurveNode(nf, "Helix Curve", opts));
        return nf;
      },
      fitSpline: (points: number[][], closed?: boolean) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildFitSplineNode(nf, "Fit Spline", points, closed),
        );
        return nf;
      },
      bridgingCurve: (start: number[], end: number[]) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildBridgingCurveNode(
            nf,
            "Bridging Curve",
            start as [number, number, number],
            end as [number, number, number],
          ),
        );
        return nf;
      },
      enclose: (fid: string, edgeTags: string[]) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildEncloseNode(nf, "Enclose / Endcap", fid, edgeTags),
        );
        return nf;
      },
      derive: (opts: DeriveOptions) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildDeriveNode(nf, "Derive Part Studio", opts));
        return nf;
      },
      recognition: (fid: string) => {
        const n = scadgenHistory.get(fid);
        const p = n?.parameters.find(
          (x) => x.kind === "string" && x.parameterId === "recognition",
        );
        if (!p || p.kind !== "string" || !p.value) return null;
        try {
          return JSON.parse(p.value) as unknown;
        } catch {
          return null;
        }
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
        scadgenHistory.add(buildDeleteFaceNode(nf, "Delete Face", fid, [tag]));
        return nf;
      },
      fillet: (fid: string, tags: string[], r: number, radii?: number[]) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildEdgeFilletNode(nf, "Fillet", fid, tags, r, radii),
        );
        return nf;
      },
      chamfer: (
        fid: string,
        tags: string[],
        d: number,
        distances?: number[],
      ) => {
        const nf = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildChamferNode(
            nf,
            "Chamfer",
            tags.map((t) => provenanceForFeature(fid, "EDGE", t)),
            "DIST_DISTS",
            {
              value: d,
              units: "m",
              expression: formatQuantityExpression(d, "m"),
            },
            distances
              ? [
                  {
                    kind: "string",
                    parameterId: "distances",
                    value: JSON.stringify(distances),
                  },
                ]
              : [],
          ),
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
          const el = elId ? elements.find((e) => e.nodeId === elId) : undefined;
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
                  getObject as (id: string) => { visible?: boolean } | undefined
                )(elId)?.visible ?? true)
              : null,
            position: el ? [el.position.x, el.position.y, el.position.z] : null,
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
      exportSceneIges: () =>
        ImportExportService.getInstance()
          .exportIges(elements)
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf)),
      exportScene3mf: () =>
        ImportExportService.getInstance()
          .export3mf(elements)
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf)),
      exportBodyStl: (fid: string) => {
        const el = elements.find(
          (e) => e.nodeId === scadgenSceneSync.elementOf(fid),
        );
        if (!el)
          return Promise.reject(new Error(`no scene element for ${fid}`));
        return ImportExportService.getInstance()
          .export([el])
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf));
      },
      exportBodyStep: (fid: string) => {
        const el = elements.find(
          (e) => e.nodeId === scadgenSceneSync.elementOf(fid),
        );
        if (!el)
          return Promise.reject(new Error(`no scene element for ${fid}`));
        return ImportExportService.getInstance()
          .exportStep([el])
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf));
      },
      exportBodyIges: (fid: string) => {
        const el = elements.find(
          (e) => e.nodeId === scadgenSceneSync.elementOf(fid),
        );
        if (!el)
          return Promise.reject(new Error(`no scene element for ${fid}`));
        return ImportExportService.getInstance()
          .exportIges([el])
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf));
      },
      exportBody3mf: (fid: string) => {
        const el = elements.find(
          (e) => e.nodeId === scadgenSceneSync.elementOf(fid),
        );
        if (!el)
          return Promise.reject(new Error(`no scene element for ${fid}`));
        return ImportExportService.getInstance()
          .export3mf([el])
          .then((blob) => blob.arrayBuffer())
          .then((buf) => new Uint8Array(buf));
      },
      insertStl: (bytes: number[]) => {
        const assetId = `stl_${Date.now().toString(36)}`;
        registerImportAsset(assetId, "stl", "inserted", new Uint8Array(bytes));
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(buildInsertNode(fid, "Inserted", assetId, "stl"));
        return fid;
      },
      insertStep: (bytes: number[]) => {
        const assetId = `step_${Date.now().toString(36)}`;
        registerImportAsset(
          assetId,
          "step",
          "inserted.step",
          new Uint8Array(bytes),
        );
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildInsertNode(fid, "Inserted STEP", assetId, "step"),
        );
        return fid;
      },
      insertIges: (bytes: number[]) => {
        const assetId = `iges_${Date.now().toString(36)}`;
        registerImportAsset(
          assetId,
          "iges",
          "inserted.iges",
          new Uint8Array(bytes),
        );
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildInsertNode(fid, "Inserted IGES", assetId, "iges"),
        );
        return fid;
      },
      insert3mf: (bytes: number[]) => {
        const assetId = `3mf_${Date.now().toString(36)}`;
        registerImportAsset(
          assetId,
          "3mf",
          "inserted.3mf",
          new Uint8Array(bytes),
        );
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildInsertNode(fid, "Inserted 3MF", assetId, "3mf"),
        );
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
      saveProject: () => persistProject(),
      loadProject: (text?: string) => loadProject(text),
      idle: () =>
        scadgenExecutor.whenIdle().then(() => scadgenExecutor.lastReport),
      assembly: {
        addInstance: (inst: {
          id: string;
          partId?: string;
          bodyId?: string;
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
                ...(inst.bodyId ? { bodyId: inst.bodyId } : {}),
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
          assembly?: Assembly;
          instances: { id: string; transform: number[] }[];
        } => {
          const { asm, refs } = assemblyRef.current;
          const liveBounds = assemblyBoundsFrom(elementsRef.current);
          const liveRefs = refs ?? buildRefMap(asm, liveBounds);
          const r = solve(asm, liveRefs);
          if (!r.assembly)
            return {
              ok: false,
              dof: r.dof,
              issues: r.issues,
              residual: r.residual,
              placed: 0,
              instances: [],
            };
          assemblyRef.current = { asm: r.assembly, refs: liveRefs };
          let placed = 0;
          const listing: { id: string; transform: number[] }[] = [];
          for (const leaf of flattenAssembly(r.assembly)) {
            const fid = leaf.bodyId ?? leaf.instanceId;
            const el = scadgenSceneSync.elementOf(fid);
            const obj = el
              ? (getObject as (id: string) => ThreeObj | undefined)(el)
              : undefined;
            if (obj) obj.visible = leaf.visible;
            if (obj && leaf.visible && placeObject(obj, leaf.transform))
              placed++;
            listing.push({
              id: leaf.instanceId,
              transform: leaf.transform,
            });
          }
          return {
            ok: r.ok,
            dof: r.dof,
            issues: r.issues,
            residual: r.residual,
            placed,
            assembly: r.assembly,
            instances: listing,
          };
        },
        state: (): Assembly => assemblyRef.current.asm,
        renderStats: () => ({ ...assemblyRenderStatsRef.current }),
        loadBenchmark: () => {
          loadBenchmarkAssembly();
          return flattenAssembly(assemblyRef.current.asm).length;
        },
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
    } as Record<string, unknown> & {
      bus?: import("../model/actionBus").ActionBus;
      ecad?: unknown;
    };
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
      // Project a world point to client coordinates so picker tests can click
      // the real viewport instead of bypassing the pick layer.
      projectWorld: (point: [number, number, number]) => {
        if (!renderer || !camera) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(...point).project(camera);
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
          visible: v.z > -1 && v.z < 1,
        };
      },
      featureParam: (fid: string, parameterId: string) => {
        const node = scadgenHistory
          .evaluatedNodes()
          .find((n) => n.featureId === fid);
        const param = node?.parameters.find(
          (p) => p.parameterId === parameterId,
        );
        if (!param) return null;
        return "queries" in param
          ? param.queries.length
          : "value" in param
            ? param.value
            : null;
      },
      scadgen,
    };
    {
      const bus = createSceneBus(scadgen as unknown as HookBag);
      scadgen.bus = bus;
      busRef.current = bus;
      // ECAD lives in its own lazy chunk. The commands exist immediately, but
      // the simulator is fetched on idle (and on first open) so the feature bus
      // does not pull ECAD into the initial production payload.
      const ensureEcad = async (): Promise<Ecad> => {
        const [{ installEcad }, { isEcadSnapshot }] = await Promise.all([
          import("../ecad/install"),
          import("../ecad/persist"),
        ]);
        const ecad = installEcad({
          scene: sceneRef.current,
          bus,
          session: fluxSessionRef.current,
        });
        if (ecadEnsureRef.current !== ensureEcad) return ecad;
        ecadRef.current = ecad;
        // Rebuild the saved ECAD scene + firmware. Restore keeps instance ids
        // stable, so wires and per-board firmware still point at the right
        // parts after a reload.
        const savedEcad = scadgenProjectRef.current?.design.ecad;
        if (isEcadSnapshot(savedEcad)) {
          const restored = ecad.sim.restore(savedEcad);
          for (const instId of ecad.sim.instances.keys())
            ecad.layer.add(instId);
          debugLog(`ecad: restored ${restored} parts + firmware`);
        }
        scadgen.ecad = ecad;
        (window as unknown as { __ecad?: unknown }).__ecad = ecad;
        // Publish the live EcadLayer so the VR session (useVRSession) can build
        // its 1:1 physics world + bind boards. The layer, not its group, is the
        // object with .sim + .meters(); the scene only mounts layer.group.
        (
          window as unknown as { __scadgen?: Record<string, unknown> }
        ).__scadgen ??= {};
        (
          window as unknown as { __scadgen: Record<string, unknown> }
        ).__scadgen.ecadLayer = ecad.layer;
        setEcadReady(true);
        return ecad;
      };
      ecadEnsureRef.current = ensureEcad;
      const preload = () => {
        void ensureEcad().catch((error) => {
          debugLog(
            `ecad: lazy load failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      };
      // Do not compete with first paint; the feature bus is usable while this
      // chunk downloads.
      preloadTimer = window.setTimeout(preload, 0);
      bus.register({
        id: "ecad.openPanel",
        kind: "command",
        aliases: [],
        run: () => {
          void ensureEcad()
            .then(() => setEcadOpen(true))
            .catch((error) => {
              showToast(
                error instanceof Error ? error.message : "ECAD failed to load",
                "error",
              );
            });
        },
      });
      bus.register({
        id: "ecad.closePanel",
        kind: "command",
        aliases: [],
        run: () => setEcadOpen(false),
      });
      // Persist from any surface (ECAD panel after deploy/run, VR, AI).
      if (!bus.has("project.save")) {
        bus.register({
          id: "project.save",
          kind: "op",
          aliases: [],
          run: () => persistProject(),
        });
      }
      // Assembly actions: registered here (solve + insert + addMate) so
      // desk/VR/voice dispatch to the same solver through the bus
      // (exit-ramp rule).
      const asmApi = (
        scadgen as unknown as {
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
          ["primitive-sphere", "sphere"],
          ["primitive-prism", "prism"],
          ["primitive-pyramid", "pyramid"],
          ["primitive-wedge", "wedge"],
          ["primitive-cylinder", "cylinder"],
          ["primitive-cone", "cone"],
          ["primitive-torus", "torus"],
          ["primitive-pipe", "pipe"],
          ["primitive-ellipsoid", "ellipsoid"],
          ["primitive-capsule", "capsule"],
          ["primitive-dome", "dome"],
        ] as [string, ShapeKind][]
      ).forEach(([id, kind]) => {
        bus.register({
          id,
          kind: "op",
          aliases: [],
          run: (opts: unknown) => {
            const result = (
              scadgen as {
                primitive: (
                  k: ShapeKind,
                  o: Record<string, unknown>,
                ) => { featureId: string; profileFeatureId: string };
              }
            ).primitive(kind, (opts as Record<string, unknown>) ?? {});
            setFitRequest((n) => n + 1);
            return result;
          },
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
      // Snapshot only after every registration (including the primitive ops
      // above) so the palette never hides a feature the live bus can run.
      const runnableOps = new Set(
        bus.ids("op").filter((id) => bus.isRunnable(id)),
      );
      setAvailableOps((current) => {
        if (
          current.size === runnableOps.size &&
          [...runnableOps].every((id) => current.has(id))
        )
          return current;
        return runnableOps;
      });
    }
    return () => {
      window.clearTimeout(preloadTimer);
      ecadEnsureRef.current = null;
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
    createPrimitive,
  ]);

  // The visualizer's `scene` context value is a stale sceneRef.current
  // captured at provider render time; the actual THREE scene exists only
  // after mountRenderer() runs and sceneReady flips true. Attach the ECAD
  // layer group to the LIVE scene whenever it becomes available (detached
  // otherwise, boards would be ungrabbable / invisible in VR).
  useEffect(() => {
    if (!sceneReady || !scene) return;
    ecadRef.current?.attach(scene);
  }, [sceneReady, scene]);

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
        false,
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
  const ModeContent = inVR || !canEdit ? undefined : MODE_COMPONENTS[mode];

  const [undoDropdownOpen, setUndoDropdownOpen] = useState(false);
  const [redoDropdownOpen, setRedoDropdownOpen] = useState(false);
  const [featureDialog, setFeatureDialog] = useState<FeatureDialogState>(
    CLOSED_FEATURE_DIALOG,
  );
  // Which feature-dialog row is waiting for a viewport pick (end reference).
  const [pickingRow, setPickingRow] = useState<string | null>(null);

  // Guide and parting-edge picks are sketch curves. They are not separate
  // scene objects when the feature dialog is open, so the pick layer projects
  // each sampled curve to screen space and hit-tests against the pointer.
  const sketchCurveOptions = useMemo(() => {
    if (featureDialog.phase !== "editing") return [];
    const out: Array<{
      label: string;
      query: ProvenanceQuery;
      points: Array<{ x: number; y: number; z: number }>;
    }> = [];
    for (const node of scadgenHistory.serializeNodes()) {
      const snap = node.extensions?.sketch as
        | {
            plane?: {
              origin: number[];
              xAxis: number[];
              yAxis: number[];
            };
            primitives?: Array<{
              id?: string;
              type?: string;
              construction?: boolean;
            }>;
          }
        | undefined;
      if (!snap?.plane || !snap.primitives) continue;
      for (const primitive of snap.primitives) {
        if (!primitive.id || primitive.construction) continue;
        if (
          primitive.type !== "line" &&
          primitive.type !== "arc" &&
          primitive.type !== "circle" &&
          primitive.type !== "ellipse" &&
          primitive.type !== "ellipticalArc" &&
          primitive.type !== "spline" &&
          primitive.type !== "bezier" &&
          primitive.type !== "conic"
        )
          continue;
        const points = pathForPrimitive(
          snap as { plane: never; primitives: unknown[] },
          primitive.id,
        );
        if (points.length < 2) continue;
        out.push({
          label: `${node.name} · ${primitive.id}`,
          query: provenanceForFeature(
            node.featureId,
            "SKETCH_ENTITY",
            primitive.id,
          ),
          points,
        });
      }
    }
    return out;
  }, [featureDialog.phase, historySnapshot]);
  const featureDialogBaseline = useRef<FeatureHistorySnapshot | null>(null);
  const featureDialogUndo = useRef(false);
  const [planeOffset, setPlaneOffset] = useState(0);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const selectedElementsRef = useRef(selectedElements);
  selectedElementsRef.current = selectedElements;

  // One live session over the open project. Both surfaces share it: this
  // webview publishes what the tree has selected, the headset publishes what
  // it is holding, and a peer's pick tints the same body here that gets an
  // outline in VR.
  useEffect(() => {
    const doc = scadgenProjectRef.current;
    if (!doc) return;
    try {
      startSession({
        doc,
        account: getAccount(),
        surface: "2d",
        role: bootAccess.role,
      });
      const initial = getSessionSnapshot();
      if (initial) setSessionRole(initial.self.role);
    } catch {
      return;
    }

    let prev: string[] = [];
    const unsub = subscribeSession(() => {
      const snap = getSessionSnapshot();
      if (snap) {
        setSessionRole((current) =>
          current === snap.self.role ? current : snap.self.role,
        );
      }
      const next = snap
        ? snap.peers.flatMap((p) => (p.surface === "2d" ? p.selection : []))
        : [];
      const local = selectedElementsRef.current;
      for (const id of prev) {
        if (!next.includes(id) && !local.includes(id)) unhighlightElement(id);
      }
      for (const id of next) {
        if (!local.includes(id) && !prev.includes(id)) highlightElement(id);
      }
      prev = next;
    });

    // A peer saved the design: reload the shared doc rather than serving
    // geometry from our last local write.
    const offDoc = onRemoteDoc(() => {
      try {
        const current = scadgenProjectRef.current;
        if (current) {
          const refreshed = getProject(current.id);
          if (refreshed) scadgenProjectRef.current = refreshed;
        }
        applyDesign();
        // The peer's save owns the live design now; fold it into this tab so
        // switching away and back does not resurrect stale geometry.
        const currentDoc = documentRef.current;
        if (currentDoc) {
          try {
            setDocument(
              writeTabDesign(
                currentDoc,
                currentDoc.activeTabId,
                saveProject(ecadRef.current?.sim.snapshot()),
              ),
            );
          } catch {
            /* keep the local tab blob */
          }
        }
        setShareRevision((v) => v + 1);
      } catch {
        /* a malformed peer doc must not take the desk down */
      }
    });

    return () => {
      unsub();
      offDoc();
      for (const id of prev) {
        if (!selectedElementsRef.current.includes(id)) unhighlightElement(id);
      }
      stopSession();
    };
  }, [
    bootAccess.role,
    highlightElement,
    unhighlightElement,
    forceSceneUpdate,
    applyDesign,
    setDocument,
  ]);

  // Publish my tree selection for the headset's outline. While VR owns the
  // seat the desk stays quiet, and vice versa.
  useEffect(() => {
    if (!inVR) publishSelection(selectedElements, "2d");
  }, [selectedElements, inVR]);
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
    // A removed body keeps its hidden element, so a selection can still name
    // it. Remove means remove from the model, including exports.
    const ids = pickExport().filter((elementId) => {
      const bodyId = scadgenSceneSync.featureForElement(elementId);
      return !bodyId || scadgenParts.body(bodyId)?.state !== "removed";
    });
    const els = elementsRef.current;
    const bodies = ids
      .map((elementId) => scadgenSceneSync.featureForElement(elementId))
      .filter((id): id is string => !!id);
    const partIds = new Set(
      bodies.map((id) => scadgenParts.body(id)?.partId ?? null),
    );
    const sharedPartId = partIds.size === 1 ? [...partIds][0] : null;
    const name =
      scadgenParts.part(sharedPartId)?.name ??
      (bodies.length === 1 ? scadgenParts.body(bodies[0]!)?.name : null) ??
      undefined;
    const bodyKind =
      bodies.length === 1 ? scadgenParts.body(bodies[0]!)?.kind : undefined;
    return exportSelectionStl(
      els,
      ids,
      (subset) => ImportExportService.getInstance().export(subset as never),
      name,
      bodyKind,
    );
  }, [pickExport]);
  const exportSelectedBodyStl = useCallback(async () => {
    try {
      const r = await onGetSelectionStl();
      const bytes = new Uint8Array(r.stlBytes);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "model/stl",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.stlName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${r.stlName}`, "success");
    } catch (err) {
      showToast(
        `STL export failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
  }, [onGetSelectionStl, showToast]);
  const exportPartStl = useCallback(
    async (partId: string) => {
      const partBodies = exportableBodies(scadgenParts.bodiesOfPart(partId));
      const ids = partBodies
        .map((body) => scadgenSceneSync.elementOf(body.id))
        .filter((id): id is string => id !== null);
      const kinds = new Set(
        partBodies
          .map((body) => body.kind)
          .filter((kind) => kind !== undefined),
      );
      if (ids.length === 0) {
        showToast("Part has no bodies in the scene", "error");
        return;
      }
      try {
        const r = await exportSelectionStl(
          elementsRef.current,
          ids,
          (subset) => ImportExportService.getInstance().export(subset as never),
          scadgenParts.part(partId)?.name,
          kinds.size === 1 ? [...kinds][0] : undefined,
        );
        const bytes = new Uint8Array(r.stlBytes);
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: "model/stl",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = r.stlName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`Exported ${r.stlName}`, "success");
      } catch (err) {
        showToast(
          `Part STL export failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    },
    [showToast],
  );

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
  fitAllRef.current = handleFitAll;

  // A toolbar-created primitive should land in view, as it does in Onshape.
  // `fitRequest` forces a render after the operation, so this effect also runs
  // when the evaluated body and the operation land in the same React batch.
  useEffect(() => {
    if (!fitRequest || elements.length === 0) return;
    const timer = window.setTimeout(() => {
      fitAllRef.current();
      setFitRequest(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [fitRequest, elements.length]);

  // Picker tests need a framed view before projecting world points to clicks.
  useEffect(() => {
    const dbg = (window as unknown as { __cadDebug?: { fitView?: () => void } })
      .__cadDebug;
    if (dbg) dbg.fitView = handleFitAll;
  });

  const browserSections = useMemo(() => {
    const sections = buildBrowserSections(
      featureTree,
      sectionExpandedState,
      originVisibility,
    );
    // Assembly features are authored outside the Part Studio history, so the
    // main feature tree previously had no row for them at all. Append a real
    // section with their rebuild error and dependency state.
    const assemblyFeatures =
      activeTabKind === "assembly"
        ? (assemblyRef.current.asm.features ?? [])
        : [];
    const sectionTemplate = sections[0];
    if (sectionTemplate && assemblyFeatures.length) {
      sections.push({
        ...sectionTemplate,
        id: "assembly-features",
        label: "Assembly features",
        sectionType: "bodies",
        count: assemblyFeatures.length,
        items: assemblyFeatures.map(
          (feature): BrowserItem => ({
            id: `assembly-feature-${feature.id}`,
            label: feature.label ?? `${feature.kind} · ${feature.instanceId}`,
            itemType: "body",
            visible: true,
            featureStatus: feature.error ? "ERROR" : "OK",
            ...(feature.error ? { featureDetail: feature.error } : {}),
            ...(feature.historyId ? { sourceNodeId: feature.historyId } : {}),
            featureDependents: (feature.historyIds ?? []).map((id) => ({
              id,
              name: id,
            })),
            featureOnly: true,
          }),
        ),
      });
    }
    const { nodes, states, details, rollback } = historySnapshot;
    const byElement = new Map<string, number>();
    nodes.forEach((node, index) => {
      const ext = node.extensions as { elementNodeId?: unknown } | undefined;
      if (typeof ext?.elementNodeId === "string")
        byElement.set(ext.elementNodeId, index);
    });
    const authoredPairs = scadgenSceneSync
      .authoredIds()
      .map((pair) => {
        const split = pair.indexOf("->");
        return split < 0
          ? null
          : {
              featureId: pair.slice(0, split),
              elementId: pair.slice(split + 2),
            };
      })
      .filter(
        (pair): pair is { featureId: string; elementId: string } =>
          pair !== null,
      );
    for (const pair of authoredPairs) {
      const index = nodes.findIndex((n) => n.featureId === pair.featureId);
      if (index >= 0) byElement.set(pair.elementId, index);
    }

    const decorate = (items: BrowserItem[]): BrowserItem[] =>
      items.map((item) => {
        // History-only rows are already about one feature. Mapping them by
        // their shared body element would retarget them at the element's
        // owner (a failed fillet would act on the box it was applied to).
        // Extra-body rows have no source node, so they still inherit the
        // owning feature's index and actions through this map.
        if (item.featureOnly && item.sourceNodeId) return item;
        const index = item.elementId
          ? byElement.get(item.elementId)
          : undefined;
        const node = index === undefined ? undefined : nodes[index];
        if (!node || index === undefined) return item;
        const rolledBack = rollback !== null && index >= rollback;
        const bodyId = item.elementId
          ? scadgenSceneSync.featureForElement(item.elementId)
          : null;
        const bodyRecord = bodyId ? scadgenParts.body(bodyId) : null;
        const bodyPart = bodyRecord
          ? scadgenParts.part(bodyRecord.partId)
          : null;
        const kindLabel = bodyRecord?.kind
          ? ` · ${phase6BodyKindLabel(bodyRecord.kind)}`
          : "";
        return {
          ...item,
          label:
            item.itemType === "body" && bodyRecord
              ? `${bodyRecord.name}${kindLabel}`
              : item.label,
          visible:
            item.visible &&
            !(bodyRecord ? scadgenParts.isHidden(bodyRecord.id) : false),
          featureId: node.featureId,
          featureStatus: rolledBack
            ? "ROLLED_BACK"
            : (states[node.featureId]?.featureStatus ?? "UNKNOWN"),
          featureDetail:
            !rolledBack && details[node.featureId]
              ? details[node.featureId]
              : undefined,
          suppressed: node.suppressed,
          featureIndex: index,
          featureCount: nodes.length,
          featureFolder:
            scadgenHistory.folderOf(node.featureId) ??
            phase6TreeFolder(node.featureType) ??
            undefined,
          featureDependents: scadgenHistory.dependentsOf(node.featureId),
          bodyId: bodyRecord?.id,
          bodyName: bodyRecord?.name,
          bodyPartId: bodyPart?.id,
          bodyPartName: bodyPart?.name,
          bodyMaterial: bodyRecord?.materialId
            ? (materialById(bodyRecord.materialId)?.label ?? undefined)
            : undefined,
          bodyRemoved: bodyRecord?.state === "removed",
          bodyTransparent: bodyRecord?.transparent,
          bodyConsumedBy: bodyRecord
            ? (consumedByFeature(nodes, bodyRecord.id)?.name ?? undefined)
            : undefined,
        };
      });

    // Feature history owns rebuild order; the cadjs tree is creation-ordered.
    // Sort decorated rows so Move Up/Down is visible in the browser.
    const order = (items: BrowserItem[]): BrowserItem[] =>
      decorate(items)
        .sort(
          (a, b) =>
            (a.featureIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.featureIndex ?? Number.MAX_SAFE_INTEGER),
        )
        .map((item) =>
          item.children ? { ...item, children: order(item.children) } : item,
        );

    // History features that have no cadjs tree row still belong in the feature
    // list. Debug/action-bus features land here; cadjs-authored rows are
    // deduplicated through their feature→element mapping.
    const represented = new Set<string>();
    const usedElements = new Set<string>();
    const markRepresented = (items: BrowserItem[]) => {
      for (const item of items) {
        if (item.elementId) usedElements.add(item.elementId);
        const index = item.elementId
          ? byElement.get(item.elementId)
          : undefined;
        if (index !== undefined && nodes[index]) {
          represented.add(nodes[index]!.featureId);
        }
        if (item.children) markRepresented(item.children);
      }
    };
    sections.forEach((section) => markRepresented(section.items));

    const historyOnly = nodes
      .map((node, index): BrowserItem | null => {
        if (represented.has(node.featureId)) return null;
        const elementId =
          scadgenSceneSync.elementOf(node.featureId) ?? undefined;
        // Several features can resolve to the same element when an operation
        // updates a body in place (the ellipsoid's radii scale is one). The
        // element is one body, so only its first row belongs in the list —
        // except for failed features, which must keep a visible row so the
        // error can be read and retried.
        const failed = states[node.featureId]?.featureStatus === "ERROR";
        if (elementId && usedElements.has(elementId) && !failed) return null;
        if (elementId) usedElements.add(elementId);
        const isSketch =
          node.featureType === "newSketch" || node.featureType === "sketch";
        const rolledBack = rollback !== null && index >= rollback;
        const bodyRecord = isSketch
          ? null
          : scadgenParts.recordOf(node.featureId, node.name);
        const bodyPart = bodyRecord
          ? scadgenParts.part(bodyRecord.partId)
          : null;
        const consumed = bodyRecord
          ? consumedByFeature(nodes, bodyRecord.id)
          : null;
        return {
          id: `history-${node.featureId}`,
          label: bodyRecord?.name ?? node.name,
          itemType: isSketch ? "sketch" : "body",
          visible:
            !node.suppressed &&
            !(bodyRecord ? scadgenParts.isHidden(bodyRecord.id) : false),
          bodyId: bodyRecord?.id,
          bodyName: bodyRecord?.name,
          bodyPartId: bodyPart?.id,
          bodyPartName: bodyPart?.name,
          bodyMaterial: bodyRecord?.materialId
            ? (materialById(bodyRecord.materialId)?.label ?? undefined)
            : undefined,
          bodyRemoved: bodyRecord?.state === "removed",
          bodyTransparent: bodyRecord?.transparent,
          bodyConsumedBy: consumed?.name,
          sourceNodeId: node.featureId,
          elementId: elementId as BrowserItem["elementId"],
          featureId: node.featureId,
          featureStatus: rolledBack
            ? "ROLLED_BACK"
            : (states[node.featureId]?.featureStatus ?? "UNKNOWN"),
          featureDetail:
            !rolledBack && details[node.featureId]
              ? details[node.featureId]
              : undefined,
          suppressed: node.suppressed,
          featureIndex: index,
          featureCount: nodes.length,
          featureFolder:
            scadgenHistory.folderOf(node.featureId) ??
            phase6TreeFolder(node.featureType) ??
            undefined,
          featureDependents: scadgenHistory.dependentsOf(node.featureId),
          featureOnly: true,
        };
      })
      .filter((item): item is BrowserItem => item !== null);

    // Split/pattern extras are real authored bodies (F#1, F#2, ...) but have
    // no history node of their own. Give each one a selectable Body row so
    // the Browser count and the inspector agree with the scene.
    const extraBodyRows: BrowserItem[] = [];
    for (const pair of authoredPairs) {
      const hash = pair.featureId.lastIndexOf("#");
      if (hash <= 0) continue;
      const bodyNumber = Number(pair.featureId.slice(hash + 1));
      if (!Number.isInteger(bodyNumber) || bodyNumber < 1) continue;
      if (usedElements.has(pair.elementId)) continue;
      const index = nodes.findIndex(
        (n) => n.featureId === pair.featureId.slice(0, hash),
      );
      const node = index >= 0 ? nodes[index] : undefined;
      if (!node) continue;
      usedElements.add(pair.elementId);
      const rolledBack = rollback !== null && index >= rollback;
      const bodyRecord = scadgenParts.recordOf(pair.featureId, node.name);
      const bodyPart = scadgenParts.part(bodyRecord.partId);
      const consumed = consumedByFeature(nodes, bodyRecord.id);
      extraBodyRows.push({
        id: `history-${pair.featureId}`,
        label: `${bodyRecord.name}${
          bodyRecord.kind ? ` · ${phase6BodyKindLabel(bodyRecord.kind)}` : ""
        }`,
        itemType: "body",
        visible:
          !node.suppressed &&
          !rolledBack &&
          !scadgenParts.isHidden(bodyRecord.id) &&
          !hiddenBodyElements.has(pair.elementId) &&
          getObject(pair.elementId)?.visible !== false,
        bodyId: bodyRecord.id,
        bodyName: bodyRecord.name,
        bodyPartId: bodyPart?.id,
        bodyPartName: bodyPart?.name,
        bodyMaterial: bodyRecord.materialId
          ? (materialById(bodyRecord.materialId)?.label ?? undefined)
          : undefined,
        bodyRemoved: bodyRecord.state === "removed",
        bodyTransparent: bodyRecord.transparent,
        bodyConsumedBy: consumed?.name,
        elementId: pair.elementId as BrowserItem["elementId"],
        featureStatus: rolledBack
          ? "ROLLED_BACK"
          : (states[node.featureId]?.featureStatus ?? "UNKNOWN"),
        featureDetail:
          !rolledBack && details[node.featureId]
            ? details[node.featureId]
            : undefined,
        suppressed: node.suppressed,
        featureIndex: index,
        featureCount: nodes.length,
        featureFolder:
          scadgenHistory.folderOf(node.featureId) ??
          phase6TreeFolder(node.featureType) ??
          undefined,
        featureDependents: scadgenHistory.dependentsOf(node.featureId),
        featureOnly: true,
      });
    }

    return sections.map((section) => {
      const extra =
        section.sectionType === "sketches"
          ? historyOnly.filter((item) => item.itemType === "sketch")
          : section.sectionType === "bodies"
            ? [
                ...historyOnly.filter((item) => item.itemType !== "sketch"),
                ...extraBodyRows,
              ]
            : [];
      return {
        ...section,
        count: section.count + extra.length,
        items: groupBrowserByPart(
          groupBrowserItems(order([...section.items, ...extra])),
        ),
      };
    });
  }, [
    featureTree,
    sectionExpandedState,
    originVisibility,
    historySnapshot,
    hiddenBodyElements,
    getObject,
    partsRevision,
    activeTabKind,
    workspaceTick,
  ]);

  // Selection sync: tree → 3D viewport. Extra bodies (featureId#k) resolve
  // back to their owning feature row so the Browser selection stays visible.
  const handleBrowserSelect = (
    elementId: string,
    featureIdOverride?: string,
  ) => {
    deselectAll();
    selectElement(elementId);
    // A row can retarget another body's element (a failed feature resolves to
    // the body it was applied to). Keep the row's own feature so the
    // inspector reports that feature's status, not the source body's.
    const feature =
      featureIdOverride ?? scadgenSceneSync.featureForElement(elementId);
    setSelectedFeatureId(feature ? feature.split("#")[0]! : null);
  };

  const handleSelectFeature = (featureId: string) => {
    setSelectedFeatureId(featureId);
    const elementId = scadgenSceneSync.elementOf(featureId);
    if (!elementId) return;
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

  const handleToggleElementVisibility = (elementId: string) => {
    // Route body rows through the persisted registry so the eye toggle
    // survives save/reload and stays consistent with part-level visibility.
    const bodyId = scadgenSceneSync.featureForElement(elementId);
    if (bodyId) {
      const node = scadgenHistory.get(bodyId.split("#")[0]!);
      const rec = scadgenParts.ensureBody(bodyId, node?.name ?? bodyId);
      scadgenParts.isolate(null);
      scadgenParts.setHidden(bodyId, !rec.hidden);
      return;
    }
    const hidden = hiddenBodyElements.has(elementId);
    const obj = getObject(elementId);
    if (obj) obj.visible = hidden;
    setHiddenBodyElements((prev) => {
      const next = new Set(prev);
      if (hidden) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  };

  const withTreeUndo = (actionName: string, mutate: () => void) => {
    if (!canEdit) return;
    pushUndo(actionName);
    mutate();
  };

  // ---- Part / body metadata actions ----
  // A body row can be selected before the rebuild hook has registered
  // extras, so every action first materialises the record it mutates.
  const ensureBodyRecords = (ids: string[]) => {
    for (const id of ids) {
      const node = scadgenHistory.get(id.split("#")[0]!);
      scadgenParts.ensureBody(id, node?.name ?? id);
      const out =
        scadgenExecutor.outputs.get(id) ??
        scadgenExecutor.outputs.get(id.split("#")[0]!);
      if (out) {
        scadgenParts.setBodyKind(
          id,
          classifyPhase6Body(out, node?.featureType).kind,
        );
      }
    }
  };

  const handleRenameBody = (bodyId: string, name: string) => {
    if (!canEdit) return;
    ensureBodyRecords([bodyId]);
    if (scadgenParts.renameBody(bodyId, name))
      showToast(`Renamed body to ${scadgenParts.body(bodyId)?.name ?? name}`);
  };

  const handleCreatePart = () => {
    if (!canEdit) return;
    const input = window.prompt("Part name", "Part");
    if (input === null) return;
    const part = scadgenParts.addPart({ name: input.trim() || "Part" });
    const ids = selectedBodyEntries.map((b) => b.meta.id);
    ensureBodyRecords(ids);
    if (ids.length) scadgenParts.assignBodies(ids, part.id);
    showToast(
      ids.length
        ? `Created ${part.name} with ${ids.length} bod${ids.length === 1 ? "y" : "ies"}`
        : `Created ${part.name}`,
    );
  };

  const handleAssignPart = (ids: string[], partId: string | null) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    const count = scadgenParts.assignBodies(ids, partId);
    if (!count) return;
    const name = partId ? (scadgenParts.part(partId)?.name ?? "part") : null;
    showToast(
      name
        ? `Assigned ${count} bod${count === 1 ? "y" : "ies"} to ${name}`
        : `Removed ${count} bod${count === 1 ? "y" : "ies"} from part`,
    );
  };

  const handleUpdatePart = (
    partId: string,
    patch: { name?: string; number?: string; description?: string },
  ) => {
    if (!canEdit) return;
    scadgenParts.updatePart(partId, patch);
  };

  const handleSetMaterial = (ids: string[], materialId: string | null) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    for (const id of ids) scadgenParts.setMaterial(id, materialId);
  };

  const handleSetBodyColor = (ids: string[], color: string) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    for (const id of ids) scadgenParts.setAppearance(id, { color });
  };

  const handleSetBodyHidden = (ids: string[], hidden: boolean) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    scadgenParts.isolate(null);
    for (const id of ids) scadgenParts.setHidden(id, hidden);
  };

  const handleSetBodyTransparent = (ids: string[], transparent: boolean) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    for (const id of ids) scadgenParts.setTransparent(id, transparent);
  };

  const handleSetBodyOpacity = (ids: string[], opacity: number) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    const next = Math.max(0.05, Math.min(1, opacity));
    for (const id of ids) scadgenParts.setAppearance(id, { opacity: next });
  };

  const handleResetBodyAppearance = (ids: string[]) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    for (const id of ids) {
      scadgenParts.setTransparent(id, false);
      scadgenParts.setAppearance(id, { color: "#a8a9ad", opacity: 1 });
    }
  };

  const handleSelectBodyFromAppearance = (bodyId: string) => {
    const elementId = scadgenSceneSync.elementOf(bodyId);
    if (elementId) selectElement(elementId);
  };

  const handleSetBodyRemoved = (ids: string[], removed: boolean) => {
    if (!canEdit) return;
    ensureBodyRecords(ids);
    for (const id of ids) scadgenParts.setRemoved(id, removed);
  };

  const handleIsolateBody = (bodyId: string | null) => {
    if (!canEdit) return;
    if (bodyId) ensureBodyRecords([bodyId]);
    scadgenParts.isolate(scadgenParts.isolated() === bodyId ? null : bodyId);
  };

  const handleTransformBodies = (ids: string[], mode: "MOVE" | "COPY") => {
    if (!canEdit) return;
    withTreeUndo(mode === "COPY" ? "Copy Body" : "Move Body", () => {
      for (const id of ids) {
        const featureId = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        scadgenHistory.add(
          buildTransformNode(
            featureId,
            mode === "COPY" ? "Copy Body" : "Move Body",
            id,
            mode,
            mode === "MOVE" ? [0.01, 0, 0] : [0, 0, 0],
            [0, 0, 1],
            0,
            mode === "COPY",
          ),
        );
      }
    });
    showToast(
      `${mode === "COPY" ? "Copied" : "Moved"} ${ids.length} bod${ids.length === 1 ? "y" : "ies"}`,
    );
  };

  const handleSetFeatureSuppressed = (
    featureId: string,
    suppressed: boolean,
  ) => {
    const node = scadgenHistory.get(featureId);
    if (!node || Boolean(node.suppressed) === suppressed) return;
    withTreeUndo(suppressed ? "Suppress Feature" : "Unsuppress Feature", () => {
      const changed = scadgenHistory.setSuppressedCascade(
        featureId,
        suppressed,
      );
      if (changed.length > 1)
        showToast(
          `${suppressed ? "Suppressed" : "Restored"} ${changed.length} features`,
          "info",
        );
    });
  };

  const handleRenameFeature = (featureId: string, newName: string) => {
    const node = scadgenHistory.get(featureId);
    const unique = scadgenHistory.uniqueName(newName, featureId);
    if (!node || !unique || node.name === unique) return;
    withTreeUndo("Rename Feature", () =>
      scadgenHistory.rename(featureId, newName),
    );
  };

  const featureNodeExists = (nodes: typeof featureTree, id: string): boolean =>
    nodes.some(
      (node) =>
        node.id === id ||
        (node.children ? featureNodeExists(node.children, id) : false),
    );

  const handleDeleteFeature = (featureId: string, nodeId: string) => {
    if (!canEdit || !scadgenHistory.get(featureId)) return;
    if (featureNodeExists(featureTree, nodeId)) {
      // deleteNode pushes the single undo entry before either tree is changed.
      // Its snapshot therefore contains both the cadjs node and the history
      // feature, so one undo restores the row and its geometry together.
      deleteNode(nodeId);
      scadgenHistory.remove(featureId);
      scadgenSceneSync.forget(featureId);
      return;
    }
    withTreeUndo("Delete Feature", () => {
      scadgenHistory.remove(featureId);
      scadgenSceneSync.forget(featureId);
    });
  };

  const handleRollbackToFeature = (featureId: string) => {
    const index = scadgenHistory.indexOf(featureId);
    if (index < 0) return;
    withTreeUndo("Rollback", () => scadgenHistory.setRollbackTo(index + 1));
  };

  const handleStepRollback = (delta: -1 | 1) => {
    if (scadgenHistory.getRollbackIndex() === null) return;
    withTreeUndo(delta === 1 ? "Roll Forward" : "Roll Back", () =>
      scadgenHistory.stepRollback(delta),
    );
  };

  // Retry is a real rebuild, not a UI clear: a parametrically broken feature
  // stays ERROR, a transient kernel failure can recover without touching the
  // rest of the tree.
  const handleRetryFeature = (featureId: string) => {
    if (!canEdit) return;
    if (!scadgenHistory.markRetry(featureId)) {
      showToast("Feature is not in an error state", "info");
      return;
    }
    scadgenHistory.touch(featureId);
    void scadgenExecutor.whenIdle().then(() => {
      const status =
        scadgenHistory.toListResponse().featureStates[featureId]?.featureStatus;
      if (status === "ERROR") {
        const detail = scadgenExecutor.lastReport[featureId]?.detail;
        showToast(`Retry failed${detail ? `: ${detail}` : ""}`, "error");
      } else {
        showToast("Feature rebuilt", "success");
      }
    });
  };

  const handleMoveFeatureWithDependents = (
    featureId: string,
    direction: -1 | 1,
  ) => {
    const dependents = scadgenHistory.allDependentsOf(featureId);
    if (!dependents.length) {
      handleMoveFeature(featureId, direction);
      return;
    }
    const before = scadgenHistory
      .serializeNodes()
      .map((n) => n.featureId)
      .join();
    withTreeUndo("Reorder With Dependents", () =>
      scadgenHistory.stepWithDependents(featureId, direction),
    );
    const after = scadgenHistory
      .serializeNodes()
      .map((n) => n.featureId)
      .join();
    if (before === after) {
      dropLastUndo();
      showToast("Already at the end of the build order", "info");
      return;
    }
    showToast(
      `Moved with ${dependents.length} dependent ${dependents.length === 1 ? "feature" : "features"}`,
      "info",
    );
  };

  const handleClearRollback = () => {
    if (scadgenHistory.getRollbackIndex() === null) return;
    withTreeUndo("Clear Rollback", () => scadgenHistory.setRollbackTo(null));
  };

  const handleMoveFeature = (featureId: string, direction: -1 | 1) => {
    const index = scadgenHistory.indexOf(featureId);
    if (index < 0) return;
    const plan = scadgenHistory.reorderPlan(featureId, index + direction);
    if (plan.to === plan.from) {
      if (plan.adjusted)
        showToast(
          "Cannot move past a dependent; use Move with Dependents",
          "warning",
        );
      return;
    }
    withTreeUndo("Reorder Feature", () =>
      scadgenHistory.move(featureId, plan.to),
    );
    if (plan.adjusted)
      showToast("Moved just before its dependent feature", "info");
  };

  const handleReorderFeature = (featureId: string, toIndex: number) => {
    const index = scadgenHistory.indexOf(featureId);
    if (index < 0 || index === toIndex) return;
    const plan = scadgenHistory.reorderPlan(featureId, toIndex);
    if (plan.to === plan.from) {
      if (plan.adjusted)
        showToast("Cannot move past a dependent feature", "warning");
      return;
    }
    withTreeUndo("Reorder Feature", () =>
      scadgenHistory.move(featureId, plan.to),
    );
    if (plan.adjusted)
      showToast("Moved just before its dependent feature", "info");
  };

  const handleSetFeatureFolder = (featureId: string, folder: string | null) => {
    if (scadgenHistory.folderOf(featureId) === folder) return;
    withTreeUndo(folder ? "Move to Folder" : "Remove from Folder", () =>
      scadgenHistory.setFolder(featureId, folder),
    );
  };

  // Feature dialog: opening captures a baseline, every accepted edit previews
  // by restoring that baseline and replaying the dirty params. Cancel restores
  // the baseline; Apply restores it once more, then records a single undo entry
  // and commits the final parameters, so one undo returns to the pre-edit tree.
  const previewFeatureDialog = (state: FeatureDialogState) => {
    const baseline = featureDialogBaseline.current;
    const featureId = state.featureId;
    if (!baseline || !featureId) return;
    scadgenHistory.restoreState(baseline);
    for (const param of featureDialogParameters(state))
      scadgenHistory.updateParameter(featureId, param);
  };

  const handleOpenFeatureDialog = (featureId: string) => {
    if (!canEdit) return;
    const next = openFeatureDialog(
      scadgenHistory.serializeNodes(),
      featureId,
      scadgenHistory.allDependentsOf(featureId),
    );
    if (!next) return;
    setSelectedFeatureId(featureId);
    setPickingRow(null);
    featureDialogBaseline.current = scadgenHistory.snapshotState();
    featureDialogUndo.current = false;
    setFeatureDialog(next);
  };

  const commitFeatureDialog = (next: FeatureDialogState) => {
    if (next === featureDialog) return;
    setFeatureDialog(next);
    if (next.error || featureDialogParameters(next).length === 0) return;
    if (!featureDialogUndo.current && featureDialogBaseline.current) {
      // Capture the pre-edit scene + history before the first preview. Rebuild
      // syncs that follow are marked non-undoable, so this stays the one entry.
      pushUndo("Edit Feature");
      featureDialogUndo.current = true;
    }
    previewFeatureDialog(next);
  };

  const handleEditFeatureParameter = (parameterId: string, value: unknown) => {
    commitFeatureDialog(editFeatureDialog(featureDialog, parameterId, value));
  };

  // A pick writes the end condition and its reference together: a reference
  // stored under BLIND would never reach the kernel.
  const applyEndReference = (query: ProvenanceQuery) => {
    let next = featureDialog;
    const endBound = String(next.draft["endBound"] ?? "BLIND");
    if (
      endBound !== "UP_TO_FACE" &&
      endBound !== "UP_TO_SURFACE" &&
      endBound !== "UP_TO_VERTEX"
    ) {
      next = editFeatureDialog(
        next,
        "endBound",
        query.entityType === "VERTEX" ? "UP_TO_VERTEX" : "UP_TO_FACE",
      );
    }
    next = editFeatureDialog(next, "endBoundEntity", [query]);
    setPickingRow(null);
    commitFeatureDialog(next);
  };

  /** Nearest sampled sketch curve to the pointer, in screen space. */
  const pickSketchCurveAt = (clientX: number, clientY: number) => {
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const screen = (p: { x: number; y: number; z: number }) => {
      const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
      return {
        x: ((v.x + 1) / 2) * rect.width,
        y: ((1 - v.y) / 2) * rect.height,
        visible: v.z > -1 && v.z < 1,
      };
    };
    const pointSegmentDistance = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 1e-9) return Math.hypot(px - ax, py - ay);
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2),
      );
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    };

    let best: {
      option: (typeof sketchCurveOptions)[number];
      distance: number;
    } | null = null;
    for (const option of sketchCurveOptions) {
      const projected = option.points.map(screen);
      for (let i = 1; i < projected.length; i++) {
        const a = projected[i - 1]!;
        const b = projected[i]!;
        if (!a.visible || !b.visible) continue;
        const distance = pointSegmentDistance(a.x, a.y, b.x, b.y);
        if (distance <= 12 && (!best || distance < best.distance)) {
          best = { option, distance };
        }
      }
    }
    return best?.option ?? null;
  };

  const pickEndReferenceAt = (clientX: number, clientY: number) => {
    if (!pickingRow || !renderer || !camera || !scene) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (pickingRow === "guideSubqueries" || pickingRow === "draftPartingEdge") {
      const curve = pickSketchCurveAt(clientX, clientY);
      if (!curve) {
        showToast(
          pickingRow === "guideSubqueries"
            ? "Pick a sketch curve to use as a guide"
            : "Pick a sketch line to use as the parting edge",
          "warning",
        );
        return;
      }
      if (pickingRow === "guideSubqueries") applyGuide(curve.query);
      else applyPartingEdge(curve.query);
      return;
    }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = createSubPrimSelector().cast(
      raycaster.ray.origin,
      raycaster.ray.direction,
      scene,
      1000,
    );
    if (!hit) {
      showToast("Pick a face on a body to use as the end reference", "warning");
      return;
    }
    const ownerId = String(
      hit.object.userData.id ??
        hit.object.userData.nodeId ??
        hit.object.name ??
        "",
    );
    const resolved = resolveHitToTag(ownerId, hit.tri);
    if (!resolved) {
      showToast("That pick has no matching model face", "warning");
      return;
    }
    // The feature's own result is not a valid reference: it did not exist when
    // the feature was evaluated.
    if (resolved.featureId.split("#")[0] === featureDialog.featureId) {
      showToast(
        "Pick a face on another body, not this feature's own result",
        "warning",
      );
      return;
    }
    if (pickingRow === "draftNeutralFace") {
      applyNeutralFace(
        provenanceForFeature(resolved.featureId, "FACE", resolved.faceTag),
      );
      return;
    }
    const wantsVertex =
      pickingRow === "connectors" ||
      String(featureDialog.draft["endBound"] ?? "") === "UP_TO_VERTEX";
    if (wantsVertex) {
      const index = nearestVertexIndex(
        resolved.featureId,
        resolved.faceTag,
        hit.position,
      );
      if (index === null) {
        showToast("Could not find a vertex on that face", "warning");
        return;
      }
      const query = provenanceForFeature(
        resolved.featureId,
        "VERTEX",
        `${resolved.featureId}_V${index}`,
      );
      if (pickingRow === "connectors") applyConnector(query);
      else applyEndReference(query);
      return;
    }
    applyEndReference(
      provenanceForFeature(resolved.featureId, "FACE", resolved.faceTag),
    );
  };

  // A connector is a seam vertex on one of the loft's own profiles. Picks
  // accumulate so two or more sections can be constrained in one session.
  const applyNeutralFace = (query: ProvenanceQuery) => {
    setPickingRow(null);
    commitFeatureDialog(
      editFeatureDialog(featureDialog, "draftNeutralFace", [query]),
    );
  };

  const applyGuide = (query: ProvenanceQuery) => {
    const current =
      (featureDialog.draft["guideSubqueries"] as
        | ProvenanceQuery[]
        | undefined) ?? [];
    if (
      current.some(
        (q) =>
          q.creationFeatureId === query.creationFeatureId &&
          q.entityTag === query.entityTag,
      )
    )
      return;
    commitFeatureDialog(
      editFeatureDialog(featureDialog, "guideSubqueries", [...current, query]),
    );
  };

  const applyPartingEdge = (query: ProvenanceQuery) => {
    setPickingRow(null);
    commitFeatureDialog(
      editFeatureDialog(featureDialog, "draftPartingEdge", [query]),
    );
  };

  const applyConnector = (query: ProvenanceQuery) => {
    const profiles =
      (featureDialog.draft["profiles"] as ProvenanceQuery[] | undefined) ?? [];
    if (
      !profiles.some((q) => q.creationFeatureId === query.creationFeatureId)
    ) {
      showToast("Pick a vertex on one of the loft profiles", "warning");
      return;
    }
    const current =
      (featureDialog.draft["connectors"] as ProvenanceQuery[] | undefined) ??
      [];
    if (current.some((q) => q.entityTag === query.entityTag)) return;
    commitFeatureDialog(
      editFeatureDialog(featureDialog, "connectors", [...current, query]),
    );
  };

  const handlePickRow = (parameterId: string) => {
    setPickingRow((current) => (current === parameterId ? null : parameterId));
  };

  const handleResetFeatureDialog = () => {
    setPickingRow(null);
    setFeatureDialog((current) => resetFeatureDialog(current));
    const baseline = featureDialogBaseline.current;
    if (baseline) scadgenHistory.restoreState(baseline);
    if (featureDialogUndo.current) {
      dropLastUndo();
      featureDialogUndo.current = false;
    }
  };

  const handleApplyFeatureDialog = () => {
    const params = featureDialogParameters(featureDialog);
    const featureId = featureDialog.featureId;
    const undoPushed = featureDialogUndo.current;
    setPickingRow(null);
    featureDialogBaseline.current = null;
    featureDialogUndo.current = false;
    setFeatureDialog(closeFeatureDialog());
    if (!featureId || !params.length) {
      // Nothing survived the draft: drop the entry captured for the preview.
      if (undoPushed) dropLastUndo();
      return;
    }
    // The live preview already left history at these values; commit once more so
    // the result never depends on an interrupted rebuild.
    for (const param of params)
      scadgenHistory.updateParameter(featureId, param);
  };

  const handleApplyCustomFeature = (node: ScadgenFeatureNode) => {
    if (!canEdit) return;
    withTreeUndo("Edit Custom Feature", () => {
      for (const parameter of node.parameters)
        scadgenHistory.updateParameter(node.featureId, parameter);
    });
  };

  const handleCancelFeatureDialog = () => {
    const baseline = featureDialogBaseline.current;
    const undoPushed = featureDialogUndo.current;
    setPickingRow(null);
    featureDialogBaseline.current = null;
    featureDialogUndo.current = false;
    setFeatureDialog(closeFeatureDialog());
    if (baseline) scadgenHistory.restoreState(baseline);
    if (undoPushed) dropLastUndo();
  };

  // Determine which element is currently selected for tree highlight.
  const selectedElementId =
    selectedElements.length === 1 ? selectedElements[0] : undefined;
  const selectedCustomFeatureNode = useMemo<ScadgenFeatureNode | null>(() => {
    if (!selectedFeatureId) return null;
    const node = historySnapshot.nodes.find(
      (entry) => entry.featureId === selectedFeatureId,
    );
    return node?.featureType === "customFeature" ? node : null;
  }, [selectedFeatureId, historySnapshot]);
  const customFeatureStudio = useMemo(() => {
    const tab = cadDocument?.tabs.find(
      (entry) => entry.kind === "featurestudio",
    );
    return tab ? featureStudioFromDesign(tab.design) : null;
  }, [cadDocument?.tabs]);

  // Inspector selection: one entry per selected body, so the panel can show
  // aggregate mass properties and apply part/material/state to all of them.
  const appearanceBodies = useMemo(() => {
    return scadgenParts.allBodies().flatMap((record) => {
      const output =
        scadgenExecutor.outputs.get(record.id) ??
        scadgenExecutor.outputs.get(record.id.split("#")[0]!);
      // Sketches register a profile record for their closed loop; profiles
      // are construction geometry, not bodies with an appearance.
      if (output?.kind === "profile") return [];
      const appearance = scadgenParts.appearanceFor(record.id);
      const material = materialById(record.materialId);
      return [
        {
          record,
          part: scadgenParts.part(record.partId),
          materialLabel: material?.label ?? "No material",
          color: appearance.color ?? material?.color ?? "#a8a9ad",
          opacity: appearance.opacity ?? (record.transparent ? 0.35 : 1),
        },
      ];
    });
  }, [partsRevision]);

  const selectedBodyEntries = useMemo<BodySelectionEntry[]>(() => {
    if (!historySnapshot) return [];
    const nodes = historySnapshot.nodes;
    const entries: BodySelectionEntry[] = [];
    for (const elementId of selectedElements) {
      const bodyId = scadgenSceneSync.featureForElement(elementId);
      if (!bodyId) continue;
      const bodyOutput = scadgenExecutor.outputs.get(bodyId);
      if (!bodyOutput) continue;
      const baseId = bodyId.split("#")[0]!;
      const node = scadgenHistory.get(baseId);
      const record = scadgenParts.recordOf(bodyId, node?.name ?? bodyId);
      const material = materialById(record.materialId);
      const el = elements.find((e) => e.nodeId === elementId);
      const bbox = selectionBboxMM(elements, [elementId]);
      const props = bodyPropertiesOf({
        featureId: bodyId,
        node,
        out: bodyOutput,
        elementId,
        bboxMM: bbox,
        position: (el
          ? [el.position.x, el.position.y, el.position.z]
          : [0, 0, 0]) as [number, number, number],
        visible: !scadgenParts.isHidden(bodyId),
        densityKgM3: material?.densityKgM3 ?? null,
        nameOverride: record.name,
      });
      if (!props) continue;
      // A failed feature keeps its own Browser row but resolves to the body
      // it was applied to. When the user picked that row, report the row's
      // feature (ERROR + detail), not the source body's status.
      const statusId =
        selectedElements.length === 1 &&
        selectedFeatureId &&
        historySnapshot.states[selectedFeatureId]
          ? selectedFeatureId
          : baseId;
      const statusNode =
        statusId !== baseId ? scadgenHistory.get(statusId) : null;
      entries.push({
        body: props,
        meta: record,
        part: scadgenParts.part(record.partId),
        material,
        featureStatus:
          historySnapshot.states[statusId]?.featureStatus ?? "UNKNOWN",
        featureDetail: historySnapshot.details[statusId] ?? null,
        featureName: statusNode?.name ?? null,
        featureType: statusNode?.featureType ?? null,
        consumedBy: consumedByFeature(nodes, bodyId)?.name ?? null,
        inspection: inspectBody(bodyOutput, {
          densityKgM3: material?.densityKgM3 ?? null,
        }),
      });
    }
    return entries;
  }, [
    selectedElements,
    selectedFeatureId,
    elements,
    historySnapshot,
    partsRevision,
  ]);
  const selectionInspection = useMemo(() => {
    // Pairwise work is only needed for multi-selection; a single body already
    // carries its inspection on the entry above.
    if (!historySnapshot || selectedElements.length < 2) return null;
    const outs = [];
    for (const elementId of selectedElements) {
      const bodyId = scadgenSceneSync.featureForElement(elementId);
      const out = bodyId ? scadgenExecutor.outputs.get(bodyId) : null;
      if (out) outs.push(out);
    }
    return outs.length ? inspectBodies(outs) : null;
  }, [selectedElements, historySnapshot]);

  // Keep the registry in step with every rebuild: register new bodies, then
  // re-apply keep/remove, visibility and material appearance to their elements.
  const syncBodyRegistry = useCallback(() => {
    const nodes = scadgenHistory.evaluatedNodes();
    const names = new Map(nodes.map((node) => [node.featureId, node.name]));
    const removed = new Set<string>();
    const registered = new Set<string>();
    const register = (
      id: string,
      fallbackName: string,
      kind?: Phase6BodyKind,
    ) => {
      if (registered.has(id)) return;
      registered.add(id);
      const record = scadgenParts.ensureBody(id, fallbackName);
      if (record.state === "removed") removed.add(id);
      if (kind) scadgenParts.setBodyKind(id, kind);
      scadgenSceneSync.applyBodyState(id, scadgenParts.visualState(id));
    };
    for (const node of nodes) {
      const out = scadgenExecutor.outputs.get(node.featureId);
      if (!out) continue;
      const kind = classifyPhase6Body(out, node.featureType).kind;
      register(node.featureId, node.name, kind);
      (out.additionalBodies ?? []).forEach((_, index) =>
        register(`${node.featureId}#${index + 1}`, node.name, kind),
      );
    }
    // Split/pattern extras also live in bodySets, which is authoritative even
    // when the owner's output does not list additional bodies.
    for (const [featureId, set] of scadgenExecutor.bodySets) {
      const out = scadgenExecutor.outputs.get(featureId);
      const kind = out
        ? classifyPhase6Body(out, scadgenHistory.get(featureId)?.featureType)
            .kind
        : undefined;
      for (let index = 1; index < set.length; index++)
        register(
          `${featureId}#${index}`,
          names.get(featureId) ?? featureId,
          kind,
        );
    }
    if (removed.size) scadgenExecutor.deleteBodies([...removed]);
  }, []);

  useEffect(() => {
    syncBodyRegistry();
  }, [syncBodyRegistry, historySnapshot, elements, partsRevision]);

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

  useEffect(() => {
    if (!canEdit && mode !== "move") setMode("move");
  }, [canEdit, mode, setMode]);

  useSceneKeyboardBindings({
    enabled: canEdit,
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

  // Assembly/drawing workspaces share the active Part Studio geometry. The
  // workspace payloads are persisted in the tab's own design string.
  const asm = assemblyRef.current.asm;
  const assemblySourceId =
    activeTabKind === "assembly" && activeTab
      ? (parseAssemblyTab(activeTab.design)?.sourceTabId ?? "")
      : "";
  const assemblySourceLabel = cadDocument?.tabs.find(
    (tab) => tab.id === assemblySourceId,
  )?.name;
  const assemblyLinkedTabs = (cadDocument?.tabs ?? [])
    .filter(
      (tab) =>
        tab.id !== activeTab?.id &&
        (tab.kind === "partstudio" || tab.kind === "assembly"),
    )
    .map((tab) => ({
      id: tab.id,
      name: tab.name,
      kind: tab.kind as "partstudio" | "assembly",
    }));
  const assemblyBounds = useMemo(
    () => assemblyBoundsFrom(elements),
    [elements],
  );
  const assemblyMeshes = useMemo(
    () => assemblyMeshesFrom(elements),
    [elements],
  );
  const assemblyBreps = useMemo(() => assemblyBrepsFrom(elements), [elements]);
  const assemblyBodies = scadgenParts
    .allBodies()
    .filter(
      (record) => scadgenExecutor.outputs.get(record.id)?.kind === "body",
    );
  const assemblyParts = scadgenParts.parts();
  const drawingBodies = drawingBodiesFrom(elements, assemblyBodies);
  const contextSketchTab =
    activeTabKind === "assembly" || activeTabKind === "drawing"
      ? activeTab
      : null;
  const contextSketchSketches = useMemo(
    () =>
      contextSketchTab
        ? parseContextSketches(
            (contextSketchTab.kind === "assembly"
              ? parseAssemblyTab(contextSketchTab.design)
              : parseDrawingTab(contextSketchTab.design)
            )?.contextSketches ?? [],
          )
        : [],
    [contextSketchTab],
  );
  const contextSketchReferences = useMemo(() => {
    if (!contextSketchTab) return [];
    if (contextSketchTab.kind === "assembly")
      return referencesFromBoxes(
        Object.entries(assemblyBounds).map(([id, bounds]) => ({
          id,
          name: id,
          min: bounds.min,
          max: bounds.max,
        })),
        "XY",
        1,
      );
    return referencesFromEdges(drawingBodies, "XY", 1);
  }, [contextSketchTab, assemblyBounds, drawingBodies]);
  const linkedAssemblyTab = drawingRef.current.assemblyTabId
    ? cadDocument?.tabs.find(
        (tab) =>
          tab.id === drawingRef.current.assemblyTabId &&
          tab.kind === "assembly",
      )
    : activeTabKind === "assembly"
      ? activeTab
      : cadDocument?.tabs.find((tab) => tab.kind === "assembly");
  const linkedAssembly =
    linkedAssemblyTab && linkedAssemblyTab.kind === "assembly"
      ? (parseAssemblyTab(linkedAssemblyTab.design)?.assembly ?? asm)
      : asm;
  const activeConfigurationTable =
    phase7PartState.configurations.find(
      (entry) => entry.id === phase7PartState.activeConfigurationId,
    ) ?? null;
  const drawingBom = useMemo(() => {
    if (!activeConfigurationTable)
      return assemblyBom(linkedAssembly, assemblyBodies, assemblyParts);
    const configuredAssembly = applyConfigurationToAssembly(
      linkedAssembly,
      activeConfigurationTable,
      phase7PartState.activeRowId,
    ).assembly;
    const overrides = configurationOverrides(
      activeConfigurationTable,
      phase7PartState.activeRowId,
    );
    const rows = applyConfigurationToBomRows(
      assemblyBom(configuredAssembly, assemblyBodies, assemblyParts),
      overrides,
    );
    return applyConfigurationConditionsToBomRows(
      rows,
      activeConfigurationTable,
      phase7PartState.activeRowId,
    );
  }, [
    linkedAssembly,
    assemblyBodies,
    assemblyParts,
    activeConfigurationTable,
    phase7PartState.activeRowId,
  ]);
  void workspaceTick;

  const applyAssemblyAppearance = (
    obj: ThreeObj,
    appearance: { color?: string; opacity?: number } | undefined,
  ) => {
    if (!appearance) return;
    obj.traverse((child) => {
      const mesh = child as ThreeMesh & {
        isMesh?: boolean;
        material?: ThreeMat | ThreeMat[];
      };
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        if (appearance.color)
          (material as ThreeMat).color.set(appearance.color);
        if (appearance.opacity !== undefined) {
          material.opacity = appearance.opacity;
          material.transparent = appearance.opacity < 1;
          material.depthWrite = appearance.opacity >= 1;
        }
        material.needsUpdate = true;
      }
    });
  };

  const showAssemblyAt = (next: Assembly, explode: number) => {
    const started = performance.now();
    const leaves = flattenAssembly(next);
    const placedLeaves = leaves.filter((leaf) => leaf.visible);
    const center: [number, number, number] = [0, 0, 0];
    if (placedLeaves.length) {
      for (const leaf of placedLeaves) {
        center[0] += leaf.transform[3] ?? 0;
        center[1] += leaf.transform[7] ?? 0;
        center[2] += leaf.transform[11] ?? 0;
      }
      center[0] /= placedLeaves.length;
      center[1] /= placedLeaves.length;
      center[2] /= placedLeaves.length;
    }
    // Resolve explode before planning; the plan's LOD and batching then see
    // the same transforms the viewport draws.
    const placements = leaves.map((leaf, index) => {
      const transform = [...leaf.transform];
      const dx = (transform[3] ?? 0) - center[0];
      const dy = (transform[7] ?? 0) - center[1];
      const dz = (transform[11] ?? 0) - center[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      const step =
        (explode + (leaf.instance.explode ?? 0)) / 1000 +
        index * (explode / 1000) * 0.15;
      if (step !== 0) {
        transform[3] = (transform[3] ?? 0) + (dx / length) * step;
        transform[7] = (transform[7] ?? 0) + (dy / length) * step;
        transform[11] = (transform[11] ?? 0) + (dz / length) * step;
      }
      return { ...leaf, transform };
    });
    const cameraPos: [number, number, number] = camera
      ? [camera.position.x, camera.position.y, camera.position.z]
      : [0, 0, 0];
    const plan = planAssemblyRender(placements, cameraPos);
    for (const ghost of assemblyGhostsRef.current) ghost.parent?.remove(ghost);
    assemblyGhostsRef.current = [];
    const usedBodies = new Set<string>();
    const localMeshCache = new Map<
      string,
      {
        geometry: THREE.BufferGeometry;
        material: ThreeMat | ThreeMat[];
        local: THREE.Matrix4;
      }[]
    >();
    const instancedBatches: {
      groupKey: string;
      bodyId: string;
      lod: string;
      leaves: typeof plan.leaves;
    }[] = [];

    for (const group of plan.groups) {
      const bodyId = group.bodyId;
      const leaf = group.leaves[0];
      if (!leaf) continue;
      const el = scadgenSceneSync.elementOf(bodyId);
      if (!el) continue;
      const obj = getObject(el);
      if (!obj) continue;
      const alreadyUsed = usedBodies.has(bodyId);
      if (!alreadyUsed) {
        usedBodies.add(bodyId);
        placeObject(obj, leaf.transform);
        applyAssemblyAppearance(obj, leaf.instance.appearance);
        obj.visible = true;
        obj.matrixAutoUpdate = false;
        obj.updateMatrix();
        obj.frustumCulled = true;
        obj.userData.assemblyGhost = true;
        obj.userData.assemblyLod = leaf.lod;
        if (leaf.lod !== "full") {
          obj.traverse((child) => {
            const mesh = child as ThreeMesh & { isMesh?: boolean };
            if (!mesh.isMesh) return;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          });
        }
      }
      const instancedLeaves = alreadyUsed
        ? group.leaves
        : group.leaves.slice(1);
      if (!instancedLeaves.length) continue;
      instancedBatches.push({
        groupKey: group.key,
        bodyId,
        lod: group.lod,
        leaves: instancedLeaves,
      });
    }

    for (const batch of instancedBatches) {
      const el = scadgenSceneSync.elementOf(batch.bodyId);
      const obj = el ? getObject(el) : undefined;
      if (!obj) continue;
      obj.updateMatrixWorld(true);
      let localMeshes = localMeshCache.get(batch.bodyId);
      if (!localMeshes) {
        const inverse = new THREE.Matrix4().copy(obj.matrixWorld).invert();
        localMeshes = [];
        obj.traverse((child) => {
          const mesh = child as ThreeMesh & {
            isMesh?: boolean;
            geometry?: THREE.BufferGeometry;
            material?: ThreeMat | ThreeMat[];
          };
          if (!mesh.isMesh || !mesh.geometry || !mesh.material) return;
          localMeshes!.push({
            geometry: mesh.geometry,
            material: mesh.material,
            local: new THREE.Matrix4().copy(inverse).multiply(mesh.matrixWorld),
          });
        });
        localMeshCache.set(batch.bodyId, localMeshes);
      }
      if (!localMeshes.length) continue;
      const proxy = batch.lod === "proxy";
      const appearance = batch.leaves[0]?.instance.appearance;
      const materialFor = (
        source: ThreeMat | ThreeMat[],
      ): ThreeMat | ThreeMat[] => {
        const make = (material: ThreeMat) => {
          if (proxy) {
            const color = (material as ThreeMat & { color?: THREE.Color })
              .color;
            return new THREE.MeshBasicMaterial({
              color: color ? color.clone() : 0x9aa4ad,
              transparent:
                (appearance?.opacity ?? material.opacity) < 1 ||
                material.transparent,
              opacity: appearance?.opacity ?? material.opacity,
            }) as unknown as ThreeMat;
          }
          const clone = material.clone() as ThreeMat;
          if (appearance?.color)
            (clone as ThreeMat & { color?: THREE.Color }).color?.set(
              appearance.color,
            );
          if (appearance?.opacity !== undefined) {
            clone.opacity = appearance.opacity;
            clone.transparent = appearance.opacity < 1;
            clone.depthWrite = appearance.opacity >= 1;
          }
          return clone;
        };
        return Array.isArray(source) ? source.map(make) : make(source);
      };
      for (const localMesh of localMeshes) {
        const instanced = new THREE.InstancedMesh(
          localMesh.geometry,
          materialFor(localMesh.material) as THREE.Material,
          batch.leaves.length,
        );
        instanced.userData.assemblyGhost = true;
        instanced.userData.assemblyInstanced = true;
        instanced.userData.assemblyLod = batch.lod;
        instanced.frustumCulled = true;
        instanced.castShadow = batch.lod === "full";
        instanced.receiveShadow = batch.lod === "full";
        batch.leaves.forEach((leaf, index) => {
          const matrix = new THREE.Matrix4()
            .fromArray(leaf.transform)
            .multiply(localMesh.local);
          instanced.setMatrixAt(index, matrix);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.computeBoundingSphere();
        scene?.add(instanced);
        assemblyGhostsRef.current.push(instanced);
      }
    }
    assemblyRenderStatsRef.current = {
      instancedBatches: instancedBatches.length,
      instancedLeaves: instancedBatches.reduce(
        (sum, batch) => sum + batch.leaves.length,
        0,
      ),
      lodCounts: plan.lodCounts,
    };
    const openMs = performance.now() - started;
    // A real GPU submit: render the scene now and use the frame time for the
    // orbit budget rather than a model-only projection.
    let orbitMs = 0;
    if (renderer && scene && camera) {
      const frames: number[] = [];
      for (let frame = 0; frame < 3; frame++) {
        const frameStart = performance.now();
        renderer.render(scene, camera);
        frames.push(performance.now() - frameStart);
      }
      frames.sort((a, b) => a - b);
      orbitMs = frames[1] ?? frames[0] ?? 0;
    } else {
      const orbitStart = performance.now();
      flattenAssembly(next);
      orbitMs = performance.now() - orbitStart;
    }
    let levels = 0;
    const visit = (assembly: Assembly, depth: number) => {
      levels = Math.max(levels, depth);
      for (const instance of assembly.instances)
        if (instance.subassembly) visit(instance.subassembly, depth + 1);
    };
    visit(next, 1);
    const report: AssemblyPerformanceReport = {
      openMs,
      orbitMs,
      instances: leaves.length,
      levels,
      triangles: leaves.length * 12,
      bounds: ASSEMBLY_BUDGET,
      openOk: openMs <= ASSEMBLY_BUDGET.openMs,
      orbitOk: orbitMs <= ASSEMBLY_BUDGET.orbitMs,
      instanceOk: leaves.length >= ASSEMBLY_BUDGET.minInstances,
      ok:
        openMs <= ASSEMBLY_BUDGET.openMs &&
        orbitMs <= ASSEMBLY_BUDGET.orbitMs &&
        leaves.length >= ASSEMBLY_BUDGET.minInstances,
      measuredAt: Date.now(),
    };
    setAssemblyPerf(report);
  };

  const showInterferenceMarkers = (instanceIds: string[]) => {
    const existing = assemblyMarkerGroupRef.current;
    if (existing) {
      existing.parent?.remove(existing);
      existing.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      assemblyMarkerGroupRef.current = null;
    }
    if (!scene || !instanceIds.length) return;
    const leaves = flattenAssembly(assemblyRef.current.asm);
    const group = new THREE.Group();
    group.userData.isHelper = true;
    const geometry = new THREE.SphereGeometry(0.015, 12, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff3355,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    for (const instanceId of instanceIds) {
      const leaf = leaves.find((item) => item.instanceId === instanceId);
      if (!leaf?.visible) continue;
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(
        leaf.transform[3] ?? 0,
        leaf.transform[7] ?? 0,
        leaf.transform[11] ?? 0,
      );
      marker.renderOrder = 999;
      group.add(marker);
    }
    if (group.children.length) {
      scene.add(group);
      assemblyMarkerGroupRef.current = group;
    } else {
      geometry.dispose();
      material.dispose();
    }
  };

  // A rebuild can add the body for a newly inserted catalog part after the
  // assembly change already ran. Re-place on element/registry changes so the
  // new instance appears without waiting for another assembly interaction.
  useEffect(() => {
    if (activeTabKind !== "assembly") return;
    showAssemblyAt(assemblyRef.current.asm, assemblyUiRef.current.explode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKind, elements.length, partsRevision]);

  const persistAssembly = (
    next: Assembly,
    explode: number,
    positions: AssemblyPosition[],
  ) => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!current || tab?.kind !== "assembly") return;
    setDocument(
      writeTabDesign(
        current,
        tab.id,
        assemblyTabPayload(
          parseAssemblyTab(tab.design)?.sourceTabId ?? "",
          next,
          explode,
          positions,
        ),
      ),
    );
  };

  const handleAssemblyChange = (next: Assembly, explode?: number) => {
    const nextExplode = explode ?? assemblyUiRef.current.explode;
    assemblyRef.current = { asm: next, refs: assemblyRef.current.refs };
    assemblyUiRef.current = {
      ...assemblyUiRef.current,
      explode: nextExplode,
    };
    showAssemblyAt(next, nextExplode);
    persistAssembly(next, nextExplode, assemblyUiRef.current.positions);
    setWorkspaceTick((value) => value + 1);
  };

  const handlePositionsChange = (positions: AssemblyPosition[]) => {
    assemblyUiRef.current = { ...assemblyUiRef.current, positions };
    persistAssembly(
      assemblyRef.current.asm,
      assemblyUiRef.current.explode,
      positions,
    );
    setWorkspaceTick((value) => value + 1);
  };

  const applyAssemblyFeature = async (
    feature: AssemblyFeature,
  ): Promise<{
    ok: boolean;
    message: string;
    historyId?: string;
    historyIds?: string[];
  }> => {
    if (!canEdit) return { ok: false, message: "View-only assembly" };
    const leaf = findPlacedInstance(
      assemblyRef.current.asm,
      feature.instanceId,
    );
    if (!leaf) return { ok: false, message: "Instance not found" };
    const bodyKey = leaf.bodyId ?? leaf.instanceId;
    let output = bodyOutputByFeatureId(bodyKey);
    let bounds =
      assemblyBoundsFrom(elementsRef.current)[bodyKey] ??
      (output ? bodyBoundsFromOutput(output) : null);
    // Returning from in-context source editing can leave the rebuild queued.
    // Resolve the body before reporting missing bounds so the feature applies
    // against the restored source instead of the transient empty scene.
    if (!bounds) {
      scadgenExecutor.requestRebuild();
      await scadgenExecutor.whenIdle();
      output = bodyOutputByFeatureId(bodyKey);
      bounds =
        assemblyBoundsFrom(elementsRef.current)[bodyKey] ??
        (output ? bodyBoundsFromOutput(output) : null);
    }
    if (!bounds) return { ok: false, message: "Body bounds unavailable" };
    // Assembly controls are in millimetres; Part Studio quantities are SI.
    const localCenter: [number, number, number] = [
      (bounds.min.x + bounds.max.x) / 2 + feature.offset[0] / 1000,
      (bounds.min.y + bounds.max.y) / 2 + feature.offset[1] / 1000,
      (bounds.min.z + bounds.max.z) / 2 + feature.offset[2] / 1000,
    ];
    const axis: [number, number, number] =
      feature.axis === "x"
        ? [1, 0, 0]
        : feature.axis === "y"
          ? [0, 1, 0]
          : [0, 0, 1];
    try {
      // Every assembly feature lands in the source Part Studio history, so it
      // survives tab switches and project saves instead of being a transient
      // scene edit.
      const fid = `Fasm_${Date.now().toString(36)}_${++scadgenIdCounter}`;
      const radius = Math.max(0.00001, feature.radius / 1000);
      const depth = Math.max(0.00001, feature.depth / 1000);
      if (feature.kind === "boss" || feature.kind === "revolve") {
        const label =
          feature.kind === "revolve" ? "Assembly revolve" : "Assembly boss";
        const bossId = `${fid}_${feature.kind}`;
        const shapeNodes =
          feature.kind === "revolve"
            ? buildConeNodes(bossId, label, radius, depth)
            : buildCylinderNodes(bossId, label, radius, depth);
        for (const node of shapeNodes) scadgenHistory.add(node);
        const movedId = `${bossId}_move`;
        scadgenHistory.add(
          buildTransformNode(
            movedId,
            `${label} placement`,
            bossId,
            "MOVE",
            localCenter,
            [0, 0, 1],
            0,
            false,
          ),
        );
        scadgenHistory.add(
          buildBooleanNode(
            `${fid}_bool`,
            label,
            [provenanceForFeature(bodyKey, "FACE", "*")],
            [provenanceForFeature(movedId, "FACE", "*")],
            "ADD",
          ),
        );
        return {
          ok: true,
          message: `In-context ${feature.kind} on ${leaf.instanceId}`,
          historyId: `${fid}_bool`,
          historyIds: [
            `${fid}_${feature.kind}`,
            `${fid}_${feature.kind}_move`,
            `${fid}_bool`,
          ],
        };
      }
      if (feature.kind === "fillet" || feature.kind === "chamfer") {
        if (feature.kind === "fillet") {
          scadgenHistory.add(
            buildEdgeFilletNode(fid, "Assembly fillet", bodyKey, ["*"], radius),
          );
        } else {
          scadgenHistory.add(
            buildChamferNode(
              fid,
              "Assembly chamfer",
              [provenanceForFeature(bodyKey, "EDGE", "*")],
              "DIST_DISTS",
              {
                value: radius,
                units: "m",
                expression: formatQuantityExpression(radius, "m"),
              },
            ),
          );
        }
        return {
          ok: true,
          message: `In-context ${feature.kind} on ${leaf.instanceId}`,
          historyId: fid,
          historyIds: [fid],
        };
      }
      scadgenHistory.add(
        buildHoleNode(
          fid,
          feature.kind === "cut" ? "Assembly cut" : "Assembly hole",
          bodyKey,
          [localCenter],
          radius,
          depth,
          axis,
          false,
          { holeType: "SIMPLE" },
        ),
      );
      return {
        ok: true,
        message: `In-context ${feature.kind} through ${leaf.instanceId}`,
        historyId: fid,
        historyIds: [fid],
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const handleBomModeChange = (mode: "structured" | "indented" | "flat") => {
    assemblyUiRef.current = { ...assemblyUiRef.current, bomMode: mode };
    persistAssembly(
      assemblyRef.current.asm,
      assemblyUiRef.current.explode,
      assemblyUiRef.current.positions,
    );
    setWorkspaceTick((value) => value + 1);
  };

  const rememberAssemblySolve = (result: AssemblySolveResult | null) => {
    const snapshot: AssemblySolveSnapshot | null = result
      ? {
          ok: result.ok,
          dof: result.dof,
          residual: result.residual,
          converged: result.converged ?? result.ok,
          issues: result.issues,
          ...(result.mateIds ? { mateIds: result.mateIds } : {}),
          ...(result.instanceIds ? { instanceIds: result.instanceIds } : {}),
          at: Date.now(),
        }
      : null;
    assemblyUiRef.current = { ...assemblyUiRef.current, solve: snapshot };
    persistAssembly(
      assemblyRef.current.asm,
      assemblyUiRef.current.explode,
      assemblyUiRef.current.positions,
    );
    setWorkspaceTick((value) => value + 1);
  };

  const openAssemblySource = () => {
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (!tab || tab.kind !== "assembly") return;
    const sourceId = parseAssemblyTab(tab.design)?.sourceTabId;
    if (!sourceId) {
      showToast("This assembly has no source Part Studio", "warning");
      return;
    }
    setAssemblyReturnTab(tab.id);
    // Source editing starts from the full model, but remember where the user
    // was so returning does not silently change assembly-context features.
    assemblySourceRollbackRef.current = scadgenHistory.getRollbackIndex();
    scadgenHistory.setRollbackTo(null);
    handleTabSelect(sourceId);
  };

  const returnToAssembly = () => {
    if (!assemblyReturnTab) return;
    const target = assemblyReturnTab;
    setAssemblyReturnTab(null);
    handleTabSelect(target);
    scadgenExecutor.requestRebuild();
  };

  const insertStandardPart = async (
    spec: StandardPartSpec,
    config: { lengthMM: number; radiusMM: number; count: number },
  ): Promise<{ ok: boolean; message: string; historyId?: string }> => {
    if (!canEdit) return { ok: false, message: "View-only assembly" };
    const count = Math.max(1, Math.min(24, Math.floor(config.count)));
    const radius = Math.max(0.0005, config.radiusMM / 1000);
    const length = Math.max(0.001, config.lengthMM / 1000);
    const created: { bodyId: string; partId: string; name: string }[] = [];
    try {
      for (let index = 0; index < count; index++) {
        const fid = `Fgen_${Date.now().toString(36)}_${++scadgenIdCounter}`;
        const label = count > 1 ? `${spec.name} ${index + 1}` : spec.name;
        if (spec.kind === "bolt") {
          const shank = `${fid}_shank`;
          const head = `${fid}_head`;
          const headMove = `${head}_move`;
          for (const node of buildCylinderNodes(
            shank,
            `${label} shank`,
            radius,
            length,
          ))
            scadgenHistory.add(node);
          const headHeight = Math.max(0.002, radius * 1.2);
          for (const node of buildCylinderNodes(
            head,
            `${label} head`,
            Math.max(radius * 1.6, radius + 0.0005),
            headHeight,
          ))
            scadgenHistory.add(node);
          scadgenHistory.add(
            buildTransformNode(
              headMove,
              `${label} head placement`,
              head,
              "MOVE",
              [0, 0, length],
              [0, 0, 1],
              0,
              false,
            ),
          );
          scadgenHistory.add(
            buildBooleanNode(
              fid,
              label,
              [provenanceForFeature(shank, "FACE", "*")],
              [provenanceForFeature(headMove, "FACE", "*")],
              "ADD",
            ),
          );
        } else {
          const outer = `${fid}_outer`;
          const inner = `${fid}_inner`;
          const innerMove = `${inner}_move`;
          for (const node of buildCylinderNodes(
            outer,
            `${label} outer`,
            radius,
            length,
          ))
            scadgenHistory.add(node);
          for (const node of buildCylinderNodes(
            inner,
            `${label} bore`,
            Math.max(0.0002, spec.innerRadiusMM / 1000),
            length * 2,
          ))
            scadgenHistory.add(node);
          scadgenHistory.add(
            buildTransformNode(
              innerMove,
              `${label} bore placement`,
              inner,
              "MOVE",
              [0, 0, -length / 2],
              [0, 0, 1],
              0,
              false,
            ),
          );
          scadgenHistory.add(
            buildBooleanNode(
              fid,
              label,
              [provenanceForFeature(outer, "FACE", "*")],
              [provenanceForFeature(innerMove, "FACE", "*")],
              "CUT",
            ),
          );
        }
        const part = scadgenParts.addPart({
          name: label,
          number: `${spec.standard} ${spec.size}`,
          description: spec.name,
        });
        scadgenParts.ensureBody(fid, label);
        scadgenParts.assignBody(fid, part.id);
        scadgenParts.setMaterial(fid, spec.materialId);
        created.push({ bodyId: fid, partId: part.id, name: label });
      }
      let next = assemblyRef.current.asm;
      created.forEach((part, index) => {
        const transform = identity();
        transform[3] =
          0.04 * (assemblyRef.current.asm.instances.length + index) +
          index * 0.035;
        next = insertCatalogInstance(next, {
          partId: part.partId,
          bodyId: part.bodyId,
          name: part.name,
          metadata: {
            number: `${spec.standard} ${spec.size}`,
            description: spec.name,
            material: spec.materialId,
            vendor: spec.standard,
          },
          material: spec.materialId,
          transform,
        });
      });
      handleAssemblyChange(next);
      showToast(`Inserted ${count} × ${spec.name}`, "success");
      return {
        ok: true,
        message: `Inserted ${count} × ${spec.name} into the source Part Studio`,
        ...(created[0] ? { historyId: created[0].bodyId } : {}),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const insertLinkedTab = async (
    tabId: string,
    kind: "partstudio" | "assembly" | "drawing",
  ): Promise<{ ok: boolean; message: string }> => {
    if (!canEdit) return { ok: false, message: "View-only assembly" };
    const current = documentRef.current;
    const tab = current?.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return { ok: false, message: "Linked tab not found" };
    let next = assemblyRef.current.asm;
    if (kind === "assembly") {
      const source = parseAssemblyTab(tab.design);
      if (!source)
        return { ok: false, message: "Linked assembly is unreadable" };
      next = insertSubassemblyReference(next, source.assembly, tab.name);
    } else if (kind === "partstudio") {
      try {
        const raw = JSON.parse(tab.design) as {
          parts?: {
            parts?: Array<{
              id?: unknown;
              number?: unknown;
              description?: unknown;
              name?: unknown;
            }>;
            bodies?: Array<{
              id?: unknown;
              state?: unknown;
              partId?: unknown;
              name?: unknown;
              materialId?: unknown;
            }>;
          };
        };
        const partById = new Map(
          (raw.parts?.parts ?? []).flatMap((part) =>
            typeof part.id === "string" ? [[part.id, part] as const] : [],
          ),
        );
        const entries = (raw.parts?.bodies ?? []).flatMap((body) => {
          if (typeof body.id !== "string" || body.state === "removed")
            return [];
          const part =
            typeof body.partId === "string"
              ? partById.get(body.partId)
              : undefined;
          return [
            {
              bodyId: body.id,
              ...(typeof body.partId === "string" && body.partId
                ? { partId: body.partId }
                : {}),
              ...(typeof body.name === "string" && body.name
                ? { name: body.name }
                : {}),
              metadata: {
                ...(typeof part?.number === "string" && part.number
                  ? { number: part.number }
                  : {}),
                ...(typeof part?.description === "string" && part.description
                  ? { description: part.description }
                  : {}),
                ...(typeof body.materialId === "string" && body.materialId
                  ? { material: body.materialId }
                  : {}),
              },
            },
          ];
        });
        if (!entries.length)
          return {
            ok: false,
            message: "That Part Studio has no persisted bodies",
          };
        next = linkPartStudioBodies(next, tab.id, tab.name, entries);
      } catch {
        return { ok: false, message: "Linked Part Studio is unreadable" };
      }
    } else {
      return { ok: false, message: "Drawings cannot be linked as geometry" };
    }
    handleAssemblyChange(next);
    return {
      ok: true,
      message: `Linked ${tab.name} by reference (${tab.kind})`,
    };
  };

  const deleteAssemblyFeature = async (
    feature: AssemblyFeature,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!canEdit) return { ok: false, message: "View-only assembly" };
    const historyIds = feature.historyIds?.length
      ? feature.historyIds
      : [feature.historyId ?? feature.id];
    const removedCount = historyIds.filter((historyId) =>
      scadgenHistory.remove(historyId),
    ).length;
    if (historyIds.length > 0 && removedCount === 0)
      return {
        ok: false,
        message: `Source feature ${historyIds[0]} was not found`,
      };
    const next = {
      ...assemblyRef.current.asm,
      features: (assemblyRef.current.asm.features ?? []).filter(
        (item) => item.id !== feature.id,
      ),
    };
    handleAssemblyChange(next);
    return {
      ok: true,
      message: `Deleted ${feature.label ?? feature.kind}`,
    };
  };

  const finishAssemblyPick = (pick: AssemblyPick | null) => {
    const resolve = assemblyPickResolverRef.current;
    assemblyPickResolverRef.current = null;
    setAssemblyPickMode(null);
    resolve?.(pick);
  };

  const pickAssemblyFace = (
    kind: AssemblyPick["kind"] = "face",
  ): Promise<AssemblyPick | null> => {
    if (!canEdit) return Promise.resolve(null);
    if (assemblyPickResolverRef.current) assemblyPickResolverRef.current(null);
    setAssemblyPickMode(kind);
    return new Promise((resolve) => {
      assemblyPickResolverRef.current = resolve;
    });
  };

  const pickAssemblyFaceAt = (clientX: number, clientY: number) => {
    if (!renderer || !camera || !scene) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = createSubPrimSelector().cast(
      raycaster.ray.origin,
      raycaster.ray.direction,
      scene,
      1000,
    );
    if (!hit) {
      showToast("Pick a face on a body", "warning");
      return;
    }
    const ownerId = String(
      hit.object.userData.id ?? hit.object.userData.nodeId ?? "",
    );
    const leaf = flattenAssembly(assemblyRef.current.asm).find(
      (item) => (item.bodyId ?? item.instanceId) === ownerId,
    );
    const inverse = new THREE.Matrix4()
      .fromArray(leaf?.transform ?? identity())
      .invert();
    const localPoint = new THREE.Vector3(
      hit.position.x,
      hit.position.y,
      hit.position.z,
    ).applyMatrix4(inverse);
    const worldNormal = hit.normal ?? new THREE.Vector3(0, 0, 1);
    const localNormal = worldNormal
      .clone()
      .transformDirection(inverse)
      .normalize();
    const picked = assemblyPickMode ?? (hit.type as AssemblyPick["kind"]);
    const kind: AssemblyPick["kind"] =
      picked === "edge" || picked === "axis" || picked === "point"
        ? picked
        : hit.type === "edge"
          ? "edge"
          : hit.type === "vertex"
            ? "point"
            : "face";
    const bodyKey = leaf?.bodyId ?? ownerId;
    let pickedPoint: [number, number, number] = [
      localPoint.x,
      localPoint.y,
      localPoint.z,
    ];
    let pickedAxis: [number, number, number] = [
      localNormal.x,
      localNormal.y,
      localNormal.z,
    ];
    if (kind === "point") {
      pickedPoint = nearestBrepVertexLocal(bodyKey, localPoint) ?? pickedPoint;
      pickedAxis = [0, 0, 1];
    } else if (kind === "edge" || kind === "axis") {
      const edge = nearestBrepEdgeLocal(bodyKey, localPoint);
      if (edge) {
        pickedPoint = edge.point;
        pickedAxis = edge.axis;
      }
    }
    finishAssemblyPick({
      point: pickedPoint,
      normal:
        kind === "point"
          ? pickedAxis
          : [localNormal.x, localNormal.y, localNormal.z],
      kind,
      ...(kind === "edge" || kind === "axis" ? { axis: pickedAxis } : {}),
      ...(leaf ? { instanceId: leaf.instanceId } : {}),
    });
  };

  useEffect(() => {
    if (!assemblyPickMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishAssemblyPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assemblyPickMode]);

  const handleAssemblyViewportMode = (
    enabled: boolean,
    selectedInstanceId: string,
  ) => {
    setAssemblyViewportMode(enabled);
    if (selectedInstanceId)
      assemblyViewportDragIdRef.current = selectedInstanceId;
  };

  /** Move the selected instance on the camera plane from a pointer delta. */
  const dragAssemblyByScreen = (dx: number, dy: number) => {
    const instanceId = assemblyViewportDragIdRef.current;
    if (!instanceId || !camera || !renderer) return;
    const leaf = findPlacedInstance(assemblyRef.current.asm, instanceId);
    if (!leaf) return;
    const target = new THREE.Vector3(
      leaf.transform[3] ?? 0,
      leaf.transform[7] ?? 0,
      leaf.transform[11] ?? 0,
    );
    const distance = camera.position.distanceTo(target);
    const height = renderer.domElement.clientHeight || 1;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const scale = (2 * distance * Math.tan((fov * Math.PI) / 360)) / height;
    const right = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0,
    );
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const delta = right
      .multiplyScalar(dx * scale)
      .add(up.multiplyScalar(-dy * scale));
    const moved = dragInstance(assemblyRef.current.asm, instanceId, [
      delta.x,
      delta.y,
      delta.z,
    ]);
    const refs =
      assemblyRef.current.refs ??
      buildRefMap(moved, assemblyBoundsFrom(elementsRef.current));
    const result = solve(moved, refs);
    const next = result.assembly ?? moved;
    handleAssemblyChange(next);
    rememberAssemblySolve({
      ok: result.ok,
      dof: result.dof,
      issues: result.issues,
      residual: result.residual,
      placed: flattenAssembly(next).filter((item) => item.visible).length,
      converged: result.converged ?? result.ok,
      ...(result.mateIds ? { mateIds: result.mateIds } : {}),
      ...(result.instanceIds ? { instanceIds: result.instanceIds } : {}),
    });
  };

  const focusAssemblyInstance = (instanceId: string) => {
    assemblyViewportDragIdRef.current = instanceId;
    const leaf = findPlacedInstance(assemblyRef.current.asm, instanceId);
    if (!leaf) return;
    const nodeId = scadgenSceneSync.elementOf(leaf.bodyId ?? leaf.instanceId);
    if (!nodeId) return;
    selectElement(nodeId);
    const obj = getObject(nodeId);
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const controls = controlsRef.current as unknown as {
      target?: THREE.Vector3;
    } | null;
    if (controls?.target) controls.target.copy(center);
    camera?.lookAt(center);
  };

  const loadBenchmarkAssembly = () => {
    const benchmark = buildThreeLevelBenchmark();
    assemblyRef.current = { asm: benchmark.assembly, refs: undefined };
    assemblyUiRef.current = {
      ...assemblyUiRef.current,
      explode: 0,
      positions: [{ name: "Default", explode: 0 }],
      solve: null,
    };
    handleAssemblyChange(benchmark.assembly, 0);
    setAssemblyViewportMode(true);
    showToast(
      `Loaded benchmark · ${flattenAssembly(benchmark.assembly).length} leaves · 3 levels`,
      "success",
    );
  };

  const runAssemblyBenchmark = (): AssemblyPerformanceReport => {
    const benchmark = buildThreeLevelBenchmark();
    const report = measureAssemblyPerformance(
      benchmark.assembly,
      benchmark.bounds,
    );
    setAssemblyPerf(report);
    showToast(
      report.ok
        ? `Assembly budget passes · ${report.instances} leaves · open ${report.openMs.toFixed(1)} ms`
        : `Assembly budget fails · open ${report.openMs.toFixed(1)} ms · orbit ${report.orbitMs.toFixed(1)} ms`,
      report.ok ? "success" : "warning",
    );
    return report;
  };

  const handleDrawingChange = (data: DrawingTabData) => {
    drawingRef.current = data;
    const current = documentRef.current;
    const tab = current ? activeDocumentTab(current) : null;
    if (current && tab?.kind === "drawing")
      setDocument(writeTabDesign(current, tab.id, serializeDrawingTab(data)));
    setWorkspaceTick((value) => value + 1);
  };

  const handleContextSketchesChange = (sketches: ContextSketchDocument[]) => {
    const current = documentRef.current;
    if (!current) return;
    const tab = activeDocumentTab(current);
    if (!tab) return;
    if (tab.kind === "assembly") {
      const data = parseAssemblyTab(tab.design) ?? emptyAssemblyTab("");
      setDocument(
        writeTabDesign(
          current,
          tab.id,
          serializeAssemblyTab({ ...data, contextSketches: sketches }),
        ),
      );
    } else if (tab.kind === "drawing") {
      const data = parseDrawingTab(tab.design) ?? emptyDrawingTab("", null);
      setDocument(
        writeTabDesign(
          current,
          tab.id,
          serializeDrawingTab({ ...data, contextSketches: sketches }),
        ),
      );
    } else {
      return;
    }
    setDirty(true);
  };

  // Lock UI during active sketch or async operations
  const inActiveSketch = mode === "sketch" && !!activeSketch;
  const isLocked = inActiveSketch || isOperationPending;

  // Debounced autosave. Explicit Save uses the same path; this just prevents a
  // dropped tab/scene from losing the last edit when the page closes.
  useEffect(() => {
    if (!dirty || !canEdit || isLocked) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      try {
        persistProject();
      } finally {
        setSaving(false);
        setDirty(false);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [dirty, canEdit, isLocked, persistProject]);

  const showSecondaryBar =
    activeTabKind === "partstudio" &&
    canEdit &&
    ((mode === "sketch" && !sketchIsSelectingPlane && activeSketch) ||
      isBooleanMode ||
      mode === "extrude" ||
      mode === "fillet" ||
      mode === "sweep" ||
      mode === "loft" ||
      mode === "revolve" ||
      mode === "measure");

  // Flux copilot: one session (the master orchestrator + its trace) per open
  // project file. The same session backs the desk OrchestratorView, the VR
  // chat panel, voice, and the ActionBus — one thread, four entry points
  // (exit-ramp rule). Created once per mount; projectRef = the file/project id.
  const [fluxOpen, setFluxOpen] = useState(false);
  const [contextSketchOpen, setContextSketchOpen] = useState(false);
  useEffect(() => {
    setContextSketchOpen(false);
  }, [activeTab?.id]);
  const fluxSessionRef = useRef<FluxSession | null>(null);
  const scadgenProjectRef = useRef<import("../project").ProjectDoc | null>(
    null,
  );
  if (fluxSessionRef.current === null) {
    // Resolve the active project from the local store (migrating the pre-model
    // single-doc blob so nothing is lost). On any storage failure fall back to
    // the bare "scadgen-file" id rather than crashing the scene.
    const doc: ProjectDoc | null = bootAccess.doc;
    scadgenProjectRef.current = doc;
    // Expose the resolved project + settings to the world (VR room, print
    // wizard, share links, AI). One node of truth.
    const win = window as unknown as {
      __scadgen?: Record<string, unknown>;
      __vrMechanics?: Record<string, unknown>;
    };
    win.__scadgen = win.__scadgen ?? {};
    win.__scadgen.project = doc;
    // Acceptance surface for the delegated Phase 3 H browser pass. Read-only:
    // audit the feature coverage, fingerprint current geometry, or produce the
    // byte-stable project text after a reload.
    win.__scadgen.phase3 = {
      audit: () => auditPhase3Acceptance(scadgenHistory.serializeNodes()),
      geometry: () => geometrySummary([...scadgenExecutor.outputs.values()]),
      projectJson: () => canonicalProjectJson(),
    };
    win.__scadgen.share = bootAccess.share;
    win.__scadgen.access = {
      role: bootAccess.role,
      allowVr: bootAccess.allowVr,
      denied: bootAccess.denied,
    };
    win.__scadgen.settings = doc
      ? {
          ...doc.settings,
          resolved: resolveSettings(doc, getOverlay(doc.ownerId)),
        }
      : null;
    fluxSessionRef.current = makeFluxSession({
      projectRef: doc?.id ?? "scadgen-file",
      projectName: doc?.name ?? "Current project",
      brain: { provider: "local" },
    });
  }
  const fluxSession = fluxSessionRef.current;
  const projectDoc = scadgenProjectRef.current;

  // A PCB tab persists the same live project the session owns. Opening one
  // restores that session tree; every edit flows back through setProject.
  useEffect(() => {
    if (activePcbStudio) fluxSession.setProject(activePcbStudio.project);
  }, [activePcbStudio, fluxSession]);

  const handleDocumentRename = (name: string) => {
    if (!canEdit) return;
    const current = documentRef.current;
    if (!current) return;
    const next = renameCadDocument(current, name);
    if (next === current) return;
    setDocument(next);
    if (projectDoc) {
      projectDoc.name = next.name;
      projectDoc.updatedAt = Date.now();
      saveProjectDoc(projectDoc);
    }
  };

  const openDocumentsPage = () => {
    const current = documentRef.current;
    if (current && renderer && scene && camera) {
      try {
        renderer.render(scene, camera);
        const thumbnail = renderer.domElement.toDataURL("image/jpeg", 0.6);
        if (thumbnail.startsWith("data:image/") && thumbnail.length > 2000) {
          setDocument(setDocumentThumbnail(current, thumbnail));
        }
      } catch {
        /* canvas capture is best-effort; the page still opens */
      }
    }
    setDocPanelOpen(false);
    setDocumentsOpen(true);
  };

  const exportCurrentDocument = () => {
    if (!cadDocument) return;
    try {
      downloadDocumentFile(cadDocument, projectDoc);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  useEffect(() => {
    const bus = busRef.current;
    if (!bus) return;
    registerFluxBus(bus, fluxSession.orchestrator);
    if (ecadRef.current) {
      void import("../ecad/agent").then(({ registerEcadAgent }) => {
        if (ecadRef.current) registerEcadAgent(fluxSession, ecadRef.current);
      });
    }
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

  // The Operations menu is the toolbar's path to every feature the live bus
  // can run. Modes stay interactive; body features get the current selection
  // plus modest defaults so a one-click command still produces geometry the
  // user can edit from the feature tree (the same path search and VR use).
  const handleRunOperation = (id: string) => {
    const modeFor: Partial<Record<string, SceneMode>> = {
      extrude: "extrude",
      revolve: "revolve",
      loft: "loft",
      sweep: "sweep",
      fillet: "fillet",
      boolean: "combine",
      measure: "measure",
      move: "move",
    };
    if (id === "new-sketch" || id === "sketch") {
      setMode("sketch");
      setSketchStartCounter((count) => count + 1);
      return;
    }
    const nextMode = modeFor[id];
    if (nextMode) {
      setMode(nextMode);
      return;
    }

    const bus = busRef.current;
    if (!bus) {
      showToast("Actions are not ready in this tab", "warning");
      return;
    }
    const body = selectedBodyEntries[0];
    const bodyId =
      body?.meta.id ??
      (selectedElements[0]
        ? scadgenSceneSync.featureForElement(selectedElements[0])
        : null);
    const output = bodyId ? scadgenExecutor.outputs.get(bodyId) : undefined;
    const faceTags = output?.faceTags ?? [];
    const edgeTags = output?.edgeTags ?? [];
    const bbox = body?.body.bboxMM;
    const center = (
      bbox
        ? [
            (bbox[0] + bbox[3]) / 2000,
            (bbox[1] + bbox[4]) / 2000,
            (bbox[2] + bbox[5]) / 2000,
          ]
        : [0, 0, 0]
    ) as [number, number, number];
    const size = (body?.body.sizeMM ?? [50, 50, 50]).map((value) =>
      Math.max(value / 1000, 0.005),
    ) as [number, number, number];
    const spacing = Math.max(size[0] * 1.5, 0.02);
    const topZ = bbox ? bbox[5] / 1000 : center[2] + size[2] / 2;

    const requireBody = () => {
      if (bodyId) return true;
      showToast("Select a body first, then run this operation", "warning");
      return false;
    };
    const requireFace = () => {
      if (!requireBody()) return false;
      if (faceTags[0]) return true;
      showToast("Select a face on the body for this operation", "warning");
      return false;
    };
    const requireEdge = () => {
      if (!requireBody()) return false;
      if (edgeTags[0]) return true;
      showToast("Select an edge on the body for this operation", "warning");
      return false;
    };
    const requireSecondBody = () => {
      if (selectedBodyEntries[1]) return true;
      showToast("Select a source body and a target body", "warning");
      return false;
    };
    const run = (action: string, ...args: unknown[]) =>
      bus.run(action, ...args);

    try {
      let result: unknown = null;
      switch (id) {
        case "primitive-box":
        case "primitive-sphere":
        case "primitive-prism":
        case "primitive-pyramid":
        case "primitive-wedge":
        case "primitive-cylinder":
        case "primitive-cone":
        case "primitive-torus":
        case "primitive-pipe":
        case "primitive-ellipsoid":
        case "primitive-capsule":
        case "primitive-dome":
          result = run(id, {});
          break;
        case "create-plane":
          result = run(
            "create-plane",
            center,
            [0, 0, 1],
            Math.max(size[0], size[1]) * 1.5,
          );
          break;
        case "appearance":
          setAppearancePanelOpen(true);
          return;
        case "shell":
          if (!requireFace()) return;
          result = run("shell", bodyId, faceTags[0], 0.002);
          break;
        case "thicken":
          if (!requireFace()) return;
          result = run("thicken", bodyId, faceTags[0], 0.002);
          break;
        case "draft":
          if (!requireFace()) return;
          result = run("draft", bodyId, [faceTags[0]], 2, faceTags[0]);
          break;
        case "hole":
          if (!requireBody()) return;
          result = run(
            "hole",
            bodyId,
            [[center[0], center[1], topZ]] as [number, number, number][],
            Math.max(Math.min(size[0], size[1]) * 0.08, 0.001),
            Math.max(
              topZ - (bbox ? bbox[2] / 1000 : center[2] - size[2] / 2),
              0.005,
            ),
          );
          break;
        case "chamfer":
          if (!requireEdge()) return;
          result = run("chamfer", bodyId, [edgeTags[0]], 0.002);
          break;
        case "modify-fillet":
          if (!requireEdge()) return;
          result = run("modify-fillet", bodyId, 0.002, [edgeTags[0]]);
          break;
        case "mirror":
          if (!requireBody()) return;
          result = run("mirror", bodyId, "X");
          break;
        case "linear-pattern":
          if (!requireBody()) return;
          result = run("body-pattern", bodyId, 2, [1, 0, 0], spacing);
          break;
        case "body-pattern":
          if (!requireBody()) return;
          result = run("body-pattern", bodyId, 2, [1, 0, 0], spacing);
          break;
        case "face-pattern":
          if (!requireFace()) return;
          result = run(
            "face-pattern",
            bodyId,
            [faceTags[0]],
            2,
            [1, 0, 0],
            spacing,
          );
          break;
        case "circular-pattern":
          if (!requireBody()) return;
          result = run("circular-pattern", bodyId, 4);
          break;
        case "curve-pattern":
          if (!requireBody()) return;
          result = run(
            "curve-pattern",
            bodyId,
            [
              center,
              [center[0] + spacing, center[1], center[2]],
              [center[0] + spacing, center[1] + spacing, center[2]],
            ],
            3,
            true,
          );
          break;
        case "feature-pattern":
          if (!requireBody()) return;
          result = run("feature-pattern", [bodyId], [1, 0, 0], spacing, 2);
          break;
        case "transform":
          if (!requireBody()) return;
          result = run("transform", bodyId, "MOVE", [spacing, 0, 0]);
          break;
        case "scale":
          if (!requireBody()) return;
          result = run("scale", bodyId, 1.1, center);
          break;
        case "delete-bodies":
          if (!requireBody()) return;
          result = run("delete-bodies", [bodyId]);
          break;
        case "section":
          if (!requireBody()) return;
          result = run("section", bodyId, center, [0, 0, 1]);
          break;
        case "split":
          if (!requireBody()) return;
          result = run("split", bodyId, center, [0, 0, 1], "both");
          break;
        case "move-face":
          if (!requireFace()) return;
          result = run("move-face", bodyId, faceTags[0], 0.002);
          break;
        case "delete-face":
          if (!requireFace()) return;
          result = run("delete-face", bodyId, faceTags[0]);
          break;
        case "thread":
          if (!requireBody()) return;
          result = run("thread", bodyId, "M6");
          break;
        case "sheet-metal":
          if (!requireEdge()) return;
          result = run("flange", bodyId, edgeTags[0], 90);
          break;
        case "hem":
          if (!requireEdge()) return;
          result = run("hem", bodyId, edgeTags[0]);
          break;
        case "enclose":
          if (!requireEdge()) return;
          result = run("enclose", bodyId, edgeTags);
          break;
        case "ruled-fill-surface":
          if (!requireBody()) return;
          if (!edgeTags[1]) {
            showToast("Select two edges to build a ruled surface", "warning");
            return;
          }
          result = run("ruled-fill-surface", bodyId, edgeTags[0], edgeTags[1]);
          break;
        case "curve-on-face":
        case "project-curves": {
          if (!requireSecondBody()) return;
          const source = selectedBodyEntries[0]!.meta.id;
          const target = selectedBodyEntries[1]!.meta.id;
          const sourceEdges =
            scadgenExecutor.outputs.get(source)?.edgeTags ?? [];
          const targetFaces =
            scadgenExecutor.outputs.get(target)?.faceTags ?? [];
          if (!sourceEdges[0]) {
            showToast("Select an edge on the source body", "warning");
            return;
          }
          if (id === "project-curves") {
            result = run(
              "project-curves",
              source,
              target,
              sourceEdges,
              [0, 0, 1],
            );
          } else {
            if (!targetFaces[0]) {
              showToast("Select a face on the target body", "warning");
              return;
            }
            result = run(
              "curve-on-face",
              source,
              target,
              sourceEdges,
              targetFaces[0],
            );
          }
          break;
        }
        case "rib":
          result = run("rib", bodyId);
          break;
        case "gusset":
          result = run("gusset", bodyId);
          break;
        case "web":
          result = run("web", bodyId);
          break;
        case "boss":
          result = run("boss", bodyId, {
            x: center[0],
            y: center[1],
            z: topZ,
            diameter: Math.min(size[0], size[1]) * 0.4,
            height: Math.max(size[2] * 0.25, 0.002),
          });
          break;
        case "dome-feature":
          result = run("dome-feature", bodyId, {
            x: center[0],
            y: center[1],
            z: topZ,
            radius: Math.min(size[0], size[1]) * 0.3,
            height: Math.max(size[2] * 0.2, 0.002),
          });
          break;
        case "coil":
          result = run("coil", bodyId, {
            x: center[0],
            y: center[1],
            z: topZ,
            radius: Math.min(size[0], size[1]) * 0.25,
            wireRadius: Math.max(Math.min(size[0], size[1]) * 0.02, 0.0005),
          });
          break;
        case "helix-curve":
          result = run("helix-curve", {});
          break;
        case "fit-spline":
          result = run("fit-spline", [
            [center[0] - spacing, center[1], center[2]],
            [center[0], center[1] + spacing / 2, center[2]],
            [center[0] + spacing, center[1], center[2]],
          ]);
          break;
        case "bridging-curve":
          result = run(
            "bridging-curve",
            [center[0] - spacing / 2, center[1], center[2]],
            [center[0] + spacing / 2, center[1], center[2] + spacing / 4],
          );
          break;
        case "wrap":
        case "emboss": {
          if (!requireBody()) return;
          const z = topZ;
          const polylines = [
            [
              [center[0] - spacing / 4, center[1] - spacing / 4, z],
              [center[0] + spacing / 4, center[1] - spacing / 4, z],
              [center[0] + spacing / 4, center[1] + spacing / 4, z],
              [center[0] - spacing / 4, center[1] + spacing / 4, z],
              [center[0] - spacing / 4, center[1] - spacing / 4, z],
            ],
          ];
          result = run(id, bodyId, polylines);
          break;
        }
        case "insert":
          showToast(
            "Use Document → Import to insert an STL or STEP file",
            "info",
          );
          return;
        case "derive":
          showToast("Select a source Part Studio tab to derive", "info");
          return;
        case "variables":
          showToast("Variables are edited from the feature list", "info");
          return;
        default:
          result = run(id);
          break;
      }
      if (typeof result === "string" && result) {
        setSelectedFeatureId(result);
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "That operation is unavailable",
        "warning",
      );
    }
  };

  const handleToolSearchRun = (entry: ToolSearchEntry) => {
    if (entry.kind === "mode") {
      if (entry.id === "sketch") {
        setMode("sketch");
        setSketchStartCounter((count) => count + 1);
      } else {
        setMode(entry.id as SceneMode);
      }
      return;
    }
    if (entry.kind === "op") {
      handleRunOperation(entry.id);
      return;
    }
    if (entry.kind === "sketch") {
      window.dispatchEvent(
        new CustomEvent(RUN_SKETCH_COMMAND_EVENT, { detail: { id: entry.id } }),
      );
      return;
    }
    switch (entry.id) {
      case "fit":
        handleFitAll();
        break;
      case "grid":
        toggleGroundPlane();
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "save":
        saveCurrentDocument();
        break;
      case "export":
        exportCurrentDocument();
        break;
      case "documents":
        openDocumentsPage();
        break;
      case "help":
        setHelpOpen(true);
        break;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      {shareDenied && (
        <ShareGate
          projectName="Shared project"
          role={sessionRole}
          vrRequested={Boolean(bootAccess.share?.vr)}
          vrAllowed={false}
          denied
          onContinue={() => setVrGateOpen(false)}
          onOpenProject={() => {
            window.location.href = "/";
          }}
        />
      )}
      {!shareDenied && vrGateOpen && projectDoc && (
        <ShareGate
          projectName={projectDoc.name}
          role={sessionRole}
          vrRequested={Boolean(bootAccess.share?.vr)}
          vrAllowed={bootAccess.allowVr}
          onContinue={() => setVrGateOpen(false)}
          onOpenProject={() => {
            window.location.href = "/";
          }}
          {...(bootAccess.allowVr
            ? {
                onEnterVR: () => {
                  setVrGateOpen(false);
                  enterVR();
                },
              }
            : {})}
        />
      )}
      {cadDocument && (
        <DocumentToolbar
          projectName={projectDoc?.name ?? "Untitled"}
          documentName={cadDocument.name}
          dirty={dirty}
          saving={saving}
          canEdit={canEdit}
          panelOpen={docPanelOpen}
          projectionType={projectionType}
          displayStyle={displayStyle}
          showGroundPlane={showGroundPlane}
          sectionAxis={sectionAxis}
          sectionOffset={sectionOffset}
          sectionMin={-sectionLimit}
          sectionMax={sectionLimit}
          sectionStep={sectionStep}
          sectionFlip={sectionFlip}
          originVisibility={originVisibility}
          onToggleOrigin={toggleOriginVisibility}
          onOpenDocuments={openDocumentsPage}
          onSave={saveCurrentDocument}
          onExport={exportCurrentDocument}
          onTogglePanel={() => setDocPanelOpen((value) => !value)}
          onHelp={() => setHelpOpen(true)}
          onToggleProjection={toggleProjection}
          onDisplayStyleChange={setDisplayStyle}
          onToggleGroundPlane={toggleGroundPlane}
          onSectionAxisChange={(axis) => {
            setSectionAxis(axis);
            if (axis !== "off") setSectionOffset(0);
          }}
          onSectionOffsetChange={setSectionOffset}
          onSectionFlipChange={setSectionFlip}
          onShare={() => setCollabOpen(true)}
        />
      )}

      {activeTabKind === "partstudio" &&
        (canEdit ? (
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
            onSelectPrimitive={(kind, opts) => {
              const result = createPrimitive(kind, opts);
              setFitRequest((n) => n + 1);
              return result;
            }}
            availableOps={availableOps}
            onRunOperation={handleRunOperation}
            appearancePanelOpen={appearancePanelOpen}
            onToggleAppearance={() => setAppearancePanelOpen((value) => !value)}
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
        ) : (
          <ViewerToolbar
            projectName={projectDoc?.name ?? "Shared project"}
            role={sessionRole}
            onShare={() => setCollabOpen(true)}
            onFitAll={handleFitAll}
          />
        ))}

      {showSecondaryBar && (
        <div className="z-20 flex h-10 flex-none items-center border-b border-[var(--cad-border)] bg-[var(--cad-chrome)]">
          <div
            className="flex min-w-0 flex-1 items-center overflow-visible px-3"
            ref={setModePanelSlot}
          />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-row">
        <BrowserSidePanel
          sections={browserSections}
          selectedElementId={selectedElementId}
          selectedFeatureId={selectedFeatureId ?? undefined}
          onSelectNode={handleBrowserSelect}
          onSelectFeature={canEdit ? handleSelectFeature : undefined}
          onToggleVisibility={canEdit ? handleToggleVisibility : () => {}}
          onToggleElementVisibility={
            canEdit ? handleToggleElementVisibility : undefined
          }
          onToggleSectionExpanded={toggleSectionExpanded}
          onToggleItemExpanded={toggleNodeExpanded}
          onRenameNode={canEdit ? renameNode : () => {}}
          onDeleteNode={canEdit ? deleteNode : () => {}}
          onRenameFeature={canEdit ? handleRenameFeature : undefined}
          onDeleteFeature={canEdit ? handleDeleteFeature : undefined}
          onEditSketch={canEdit ? editSketch : () => {}}
          rollbackActive={historySnapshot.rollback !== null}
          rollbackLabel={historySnapshot.rollbackLabel}
          onSetFeatureSuppressed={
            canEdit ? handleSetFeatureSuppressed : undefined
          }
          onRollbackToFeature={canEdit ? handleRollbackToFeature : undefined}
          onClearRollback={canEdit ? handleClearRollback : undefined}
          onMoveFeature={canEdit ? handleMoveFeature : undefined}
          onReorderFeature={canEdit ? handleReorderFeature : undefined}
          onSetFeatureFolder={canEdit ? handleSetFeatureFolder : undefined}
          onEditFeature={canEdit ? handleOpenFeatureDialog : undefined}
          onRetryFeature={canEdit ? handleRetryFeature : undefined}
          onMoveFeatureWithDependents={
            canEdit ? handleMoveFeatureWithDependents : undefined
          }
          onStepRollback={canEdit ? handleStepRollback : undefined}
        />

        <FeatureDialog
          state={featureDialog}
          onEdit={handleEditFeatureParameter}
          onApply={handleApplyFeatureDialog}
          onReset={handleResetFeatureDialog}
          onCancel={handleCancelFeatureDialog}
          onPickRow={handlePickRow}
          pickingRow={pickingRow}
        />

        {documentsOpen && cadDocument && (
          <DocumentsPage
            currentProjectId={cadDocument.id}
            onClose={() => setDocumentsOpen(false)}
            onOpen={() => window.location.assign("/")}
          />
        )}

        {/* Center column: document tabs + toolbars + canvas */}
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col min-w-0"
        >
          {/* Canvas + right panel row */}
          <div className="flex-1 flex flex-row min-h-0">
            {/* Canvas area */}
            <div
              className="flex-1 relative min-h-0 overflow-hidden"
              onContextMenu={(event) => {
                if (mode === "sketch" && activeSketch) return;
                event.preventDefault();
                setCanvasMenu({ x: event.clientX, y: event.clientY });
              }}
            >
              <div
                ref={mountRef}
                className="cad-canvas-bg absolute inset-0"
                data-testid="cad-canvas"
              />

              {vrSupported && bootAccess.allowVr && (
                <div className="absolute left-3 top-10 z-20">
                  <VRButton
                    vrSupported
                    inVR={inVR}
                    onEnterVR={enterVR}
                    onExitVR={exitVR}
                  />
                </div>
              )}

              {pickingRow && (
                <div
                  data-testid="end-reference-pick-layer"
                  className="absolute inset-0 z-30 cursor-crosshair bg-blue-500/5"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    pickEndReferenceAt(event.clientX, event.clientY);
                  }}
                >
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/90 px-3 py-1 text-xs text-gray-200">
                    {pickingRow === "guideSubqueries"
                      ? "Click a sketch curve · each click adds a guide · Esc cancels"
                      : pickingRow === "draftPartingEdge"
                        ? "Click a sketch line to use as the parting edge · Esc cancels"
                        : "Click a face on a body · Esc cancels the pick"}
                  </div>
                </div>
              )}

              {assemblyPickMode && (
                <div
                  data-testid="assembly-pick-layer"
                  className="absolute inset-0 z-30 cursor-crosshair bg-emerald-500/5"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    pickAssemblyFaceAt(event.clientX, event.clientY);
                  }}
                >
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/90 px-3 py-1 text-xs text-gray-200">
                    Click a {assemblyPickMode} on the instance · Esc cancels
                  </div>
                </div>
              )}

              {activeTabKind === "partstudio" && assemblyReturnTab && (
                <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded border border-sky-600 bg-gray-900/95 px-3 py-1 text-xs text-sky-200">
                  <button type="button" onClick={returnToAssembly}>
                    ← Return to assembly
                  </button>
                  <span className="text-gray-500">|</span>
                  <label className="flex items-center gap-1 text-[10px] text-gray-300">
                    Source rollback
                    <input
                      aria-label="Assembly source rollback"
                      type="range"
                      min={0}
                      max={Math.max(0, historySnapshot.nodes.length - 1)}
                      value={
                        historySnapshot.rollback ??
                        Math.max(0, historySnapshot.nodes.length - 1)
                      }
                      onChange={(event) =>
                        scadgenHistory.setRollbackTo(Number(event.target.value))
                      }
                      className="w-24"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => scadgenHistory.setRollbackTo(null)}
                    className="text-[10px] text-emerald-300"
                  >
                    Resume
                  </button>
                </div>
              )}

              {activeTabKind === "assembly" && assemblyViewportMode && (
                <div
                  data-testid="assembly-viewport-drag"
                  className="absolute bottom-0 left-80 right-0 top-10 z-10 cursor-move"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    assemblyViewportDragRef.current = {
                      x: event.clientX,
                      y: event.clientY,
                    };
                  }}
                  onPointerMove={(event) => {
                    const previous = assemblyViewportDragRef.current;
                    if (!previous) return;
                    const dx = event.clientX - previous.x;
                    const dy = event.clientY - previous.y;
                    assemblyViewportDragRef.current = {
                      x: event.clientX,
                      y: event.clientY,
                    };
                    dragAssemblyByScreen(dx, dy);
                  }}
                  onPointerUp={(event) => {
                    assemblyViewportDragRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => {
                    assemblyViewportDragRef.current = null;
                  }}
                >
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/90 px-3 py-1 text-xs text-gray-200">
                    Drag to move the selected instance · BOM returns to the list
                  </div>
                </div>
              )}

              {/* Who is in the suit, and what they are touching. */}
              <SessionPresenceStrip />

              {docPanelOpen && cadDocument && (
                <DocumentPanel
                  doc={cadDocument}
                  projectId={cadDocument.id}
                  projectName={projectDoc?.name ?? cadDocument.name}
                  dirty={dirty}
                  storage={storageStatus}
                  onClose={() => setDocPanelOpen(false)}
                  onRenameDocument={handleDocumentRename}
                  onSelectTab={handleTabSelect}
                  onMoveTab={handleTabMove}
                  onDuplicateTabs={handleBulkDuplicate}
                  onDeleteTabs={handleBulkDelete}
                  onRestoreSnapshot={handleRestoreSnapshot}
                />
              )}

              {collabOpen && !shareDenied && projectDoc && (
                <CollaborationPanel
                  doc={projectDoc}
                  selfId={getAccount().id}
                  role={sessionRole}
                  selectedIds={selectedElements}
                  tree={browserSections}
                  vrAllowed={bootAccess.allowVr}
                  onClose={() => setCollabOpen(false)}
                  onSave={() => {
                    saveProjectDoc(projectDoc);
                    announceDocSaved();
                  }}
                  {...(bootAccess.allowVr ? { onEnterVR: enterVR } : {})}
                />
              )}

              {/* ViewCube — responsive container */}
              {/* Assembly source return affordance is rendered above the canvas. */}
              <div
                className={`absolute right-2 md:right-4 h-20 w-20 md:h-[120px] md:w-[120px] ${
                  activeTabKind === "assembly" && assemblyViewportMode
                    ? "top-14 z-40"
                    : "top-2 md:top-4 z-10"
                }`}
              >
                <ViewCube camera={camera} onViewChange={handleViewCubeClick} />
              </div>

              {activeTabKind === "partstudio" && ModeContent && (
                <ModeContent
                  panelSlot={modePanelSlot}
                  setMoveSelectedObject={setMoveSelectedObject}
                  setSketchIsSelectingPlane={setSketchIsSelectingPlane}
                  originGroupRef={originGroupRef}
                  sketchStartCounter={sketchStartCounter}
                  setSketchSelectedPrimitives={setSketchSelectedPrimitives}
                />
              )}

              {activeTabKind === "assembly" && (
                <React.Suspense fallback={workspaceFallback}>
                  <AssemblyWorkspace
                    asm={asm}
                    bodies={assemblyBodies}
                    parts={assemblyParts}
                    bounds={assemblyBounds}
                    meshes={assemblyMeshes}
                    breps={assemblyBreps}
                    explode={assemblyUiRef.current.explode}
                    positions={assemblyUiRef.current.positions}
                    bomMode={assemblyUiRef.current.bomMode}
                    bomConfiguration={
                      activeConfigurationTable
                        ? {
                            table: activeConfigurationTable,
                            rowId: phase7PartState.activeRowId,
                          }
                        : null
                    }
                    solveInfo={assemblyUiRef.current.solve}
                    perf={assemblyPerf}
                    {...(assemblySourceLabel
                      ? { sourceLabel: assemblySourceLabel }
                      : {})}
                    linkedTabs={assemblyLinkedTabs}
                    readOnly={!canEdit}
                    onAssemblyChange={handleAssemblyChange}
                    onExplodeChange={(value) =>
                      handleAssemblyChange(assemblyRef.current.asm, value)
                    }
                    onPositionsChange={handlePositionsChange}
                    onBomModeChange={handleBomModeChange}
                    onApplyFeature={applyAssemblyFeature}
                    onDeleteFeature={deleteAssemblyFeature}
                    onPickFace={pickAssemblyFace}
                    onInsertStandardPart={insertStandardPart}
                    onInsertLinkedTab={insertLinkedTab}
                    onOpenSource={openAssemblySource}
                    onReturnToAssembly={returnToAssembly}
                    canReturn={Boolean(assemblyReturnTab)}
                    onFocusInstance={focusAssemblyInstance}
                    onInterferenceMarkers={showInterferenceMarkers}
                    onRunBenchmark={runAssemblyBenchmark}
                    onLoadBenchmark={loadBenchmarkAssembly}
                    onViewportModeChange={handleAssemblyViewportMode}
                    onSolve={() => {
                      const result = busRun(
                        "assembly.solve",
                      ) as AssemblySolveResult | null;
                      rememberAssemblySolve(result);
                      return result;
                    }}
                  />
                </React.Suspense>
              )}

              {activeTabKind === "drawing" && (
                <React.Suspense fallback={workspaceFallback}>
                  <DrawingWorkspace
                    data={drawingRef.current}
                    bodies={drawingBodies}
                    bom={drawingBom}
                    sourceLabel={
                      cadDocument?.tabs.find(
                        (tab) => tab.id === drawingRef.current.sourceTabId,
                      )?.name ?? "Active Part Studio"
                    }
                    onChange={handleDrawingChange}
                  />
                </React.Suspense>
              )}

              {activeTabKind === "variablestudio" && activeVariableStudio && (
                <VariableStudioWorkspace
                  studio={activeVariableStudio}
                  readOnly={!canEdit}
                  onChange={handleVariableStudioChange}
                  onImportSketchVariables={(studio) =>
                    migrateSketchVariables(
                      scadgenHistory.serializeNodes(),
                      studio,
                    )
                  }
                />
              )}

              {activeTabKind === "featurestudio" && activeFeatureStudio && (
                <FeatureStudioWorkspace
                  studio={activeFeatureStudio}
                  readOnly={!canEdit}
                  onChange={handleFeatureStudioChange}
                  onInsertFeature={handleInsertCustomFeature}
                />
              )}

              {activeTabKind === "camstudio" && activeCamStudio && (
                <React.Suspense fallback={workspaceFallback}>
                  <CamStudioWorkspace
                    document={activeCamStudio}
                    readOnly={!canEdit}
                    onChange={handleCamStudioChange}
                  />
                </React.Suspense>
              )}

              {activeTabKind === "renderstudio" && activeRenderStudio && (
                <React.Suspense fallback={workspaceFallback}>
                  <RenderStudioWorkspace
                    document={activeRenderStudio}
                    bodies={elements.map((element) => ({
                      id: element.nodeId,
                      name: String(
                        (element as { name?: unknown }).name ?? element.nodeId,
                      ),
                    }))}
                    readOnly={!canEdit}
                    onChange={handleRenderStudioChange}
                  />
                </React.Suspense>
              )}

              {activeTabKind === "simulationstudio" &&
                activeSimulationStudio && (
                  <React.Suspense fallback={workspaceFallback}>
                    <SimulationStudioWorkspace
                      document={activeSimulationStudio}
                      bodies={Object.entries(assemblyMeshes).map(
                        ([id, mesh]) => ({
                          id,
                          name: String(
                            (
                              elements.find(
                                (element) => element.nodeId === id,
                              ) as { name?: unknown } | undefined
                            )?.name ?? id,
                          ),
                          triangles: mesh.triangles.map(([a, b, c]) => ({
                            a,
                            b,
                            c,
                          })),
                        }),
                      )}
                      readOnly={!canEdit}
                      onChange={handleSimulationStudioChange}
                    />
                  </React.Suspense>
                )}

              {activeTabKind === "pcbstudio" && activePcbStudio && (
                <React.Suspense fallback={workspaceFallback}>
                  <ScadStudioPcbWorkspace
                    document={activePcbStudio}
                    session={fluxSession}
                    readOnly={!canEdit}
                    onChange={handlePcbStudioChange}
                  />
                </React.Suspense>
              )}

              {contextSketchTab && (
                <button
                  type="button"
                  onClick={() => setContextSketchOpen(true)}
                  data-testid="context-sketch-open"
                  className="cad-tool absolute bottom-9 right-3 z-30 border border-[var(--cad-border)] bg-[var(--cad-chrome)]/95 shadow-sm"
                >
                  In-context sketch
                </button>
              )}

              {contextSketchOpen && contextSketchTab && (
                <ContextSketchDialog
                  context={
                    contextSketchTab.kind === "assembly"
                      ? "assembly"
                      : "drawing"
                  }
                  sourceLabel={contextSketchTab.name}
                  references={contextSketchReferences}
                  sketches={contextSketchSketches}
                  readOnly={!canEdit}
                  onSketchesChange={handleContextSketchesChange}
                  onClose={() => setContextSketchOpen(false)}
                />
              )}

              {/* Flux copilot — the master orchestrator window (desk surface).
                One thread per file; sub-agents post rows into this same panel.
                Toggled by the "⚡ Flux" button below. */}
              {canEdit && fluxOpen && (
                <OrchestratorView
                  projectRef={fluxSession.ref}
                  projectName={fluxSession.name}
                  orchestrator={fluxSession.orchestrator}
                  selection={fluxSelection}
                  brain={{ provider: "local" }}
                />
              )}

              {/* Flux toggle — the copilot entry point on the desk. */}
              {canEdit && activeTabKind === "partstudio" && (
                <button
                  onClick={() => setFluxOpen((v) => !v)}
                  title="Toggle the Flux copilot (⚡)"
                  className="cad-tool absolute bottom-9 left-3 z-30 border border-[var(--cad-border)] bg-[var(--cad-chrome)]/95 shadow-sm"
                >
                  {fluxOpen ? "✕ Flux" : "⚡ Flux"}
                </button>
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
                aria-label={`Display: ${projectionType}`}
                className={`cad-icon-button absolute right-3 top-[96px] z-10 !h-8 !w-8 border border-[var(--cad-border)] bg-white/95 shadow-sm backdrop-blur-sm md:right-4 md:top-[144px] ${
                  mode === "sketch" ? "cursor-not-allowed opacity-40" : ""
                }`}
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.6}
                    d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10"
                  />
                </svg>
              </button>

              <SceneOverlays
                mode={mode}
                selectOtherMenu={selectOtherMenu}
                setSelectOtherMenu={setSelectOtherMenu}
                isSelectingPlane={sketchIsSelectingPlane}
                controlsRef={controlsRef}
                navToolActiveRef={navToolActiveRef}
                onFitAll={handleFitAll}
                onViewChange={handleViewCubeClick}
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
            {activeTabKind === "partstudio" &&
              mode !== "sketch" &&
              selectedCustomFeatureNode && (
                <CustomFeaturePanel
                  node={selectedCustomFeatureNode}
                  studio={customFeatureStudio}
                  readOnly={!canEdit}
                  onApply={handleApplyCustomFeature}
                  onClose={() => setSelectedFeatureId(null)}
                />
              )}
            {activeTabKind === "partstudio" &&
              mode !== "sketch" &&
              appearancePanelOpen && (
                <AppearancePanel
                  bodies={appearanceBodies}
                  onClose={() => setAppearancePanelOpen(false)}
                  onSelect={handleSelectBodyFromAppearance}
                  onSetColor={handleSetBodyColor}
                  onSetMaterial={handleSetMaterial}
                  onSetOpacity={handleSetBodyOpacity}
                  onSetHidden={handleSetBodyHidden}
                  onReset={handleResetBodyAppearance}
                />
              )}
            {activeTabKind === "partstudio" &&
              mode !== "sketch" &&
              !appearancePanelOpen &&
              selectedBodyEntries.length > 0 && (
                <BodyPropertiesPanel
                  bodies={selectedBodyEntries}
                  parts={scadgenParts.parts()}
                  onRenameBody={handleRenameBody}
                  onCreatePart={handleCreatePart}
                  onAssignPart={handleAssignPart}
                  onUpdatePart={handleUpdatePart}
                  onSetMaterial={handleSetMaterial}
                  onSetColor={handleSetBodyColor}
                  onSetHidden={handleSetBodyHidden}
                  onSetTransparent={handleSetBodyTransparent}
                  onSetRemoved={handleSetBodyRemoved}
                  onIsolate={handleIsolateBody}
                  onTransform={handleTransformBodies}
                  onExportStl={exportSelectedBodyStl}
                  onExportPartStl={exportPartStl}
                  inspection={selectionInspection}
                />
              )}
            {canEdit && ecadOpen && ecadReady && ecadRef.current && (
              <React.Suspense fallback={workspaceFallback}>
                <EcadPanel
                  ecad={ecadRef.current}
                  onClose={() => setEcadOpen(false)}
                />
              </React.Suspense>
            )}
            {activeTabKind === "partstudio" && canEdit && (
              <button
                type="button"
                onClick={() => setConfigPanelOpen((value) => !value)}
                data-testid="configurations-toggle"
                className="cad-tool absolute bottom-9 right-3 z-20 border border-[var(--cad-border)] bg-[var(--cad-chrome)]/95 shadow-sm"
              >
                {configPanelOpen ? "Close configurations" : "Configurations"}
              </button>
            )}
            {configPanelOpen && activeTabKind === "partstudio" && (
              <React.Suspense fallback={workspaceFallback}>
                <ConfigurationPanel
                  tables={phase7PartState.configurations}
                  activeTableId={phase7PartState.activeConfigurationId}
                  nodes={historySnapshot.nodes}
                  variableNames={Object.keys(documentVariableValues())}
                  readOnly={!canEdit}
                  onChange={handleConfigurationTablesChange}
                  onActivate={handleActivateConfiguration}
                  onClose={() => setConfigPanelOpen(false)}
                />
              </React.Suspense>
            )}
            {printOpen && (
              <React.Suspense fallback={workspaceFallback}>
                <PrintWizard
                  onClose={() => setPrintOpen(false)}
                  onGetStl={onGetStl}
                  onGetBbox={onGetBbox}
                  onGetSelectionStl={onGetSelectionStl}
                />
              </React.Suspense>
            )}
          </div>
          {/* end canvas + right panel row */}
        </div>
        {/* end center column */}
      </div>
      {/* end workspace row */}
      {cadDocument && (
        <DocumentTabBar
          doc={cadDocument}
          readOnly={!canEdit}
          busy={isOperationPending || (mode === "sketch" && !!activeSketch)}
          onSelect={handleTabSelect}
          onCreate={handleTabCreate}
          onRename={handleTabRename}
          onDuplicate={handleTabDuplicate}
          onMove={handleTabMove}
          onDelete={handleTabDelete}
          onOpenTabManager={() => setDocPanelOpen(true)}
        />
      )}
      {canvasMenu && activeTabKind === "partstudio" && (
        <CanvasContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          selectionKind={
            selectedElements.length > 0 || selectedFeatureId ? "body" : "empty"
          }
          availableOps={availableOps}
          onClose={() => setCanvasMenu(null)}
          onRunOperation={handleRunOperation}
          onAppearance={() => setAppearancePanelOpen(true)}
        />
      )}
      <SketchControlsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GlobalToolSearch
        inSketch={mode === "sketch" && !!activeSketch}
        availableOps={availableOps}
        onRun={handleToolSearchRun}
      />
    </div>
  );
};

export default SimpleCadScene;
