import React, { useEffect, useMemo, useState } from "react";
import {
  CONNECTOR_LABELS,
  MATE_KINDS,
  MATE_LABELS,
  addConnector,
  applyAssemblyPosition,
  applyDisplayStateWithAppearance,
  assemblyBom,
  autoExplode,
  bomColumns,
  bomCsv,
  buildRefMap,
  clearancePairs as computeClearancePairs,
  collisionReport,
  diagnoseConflicts,
  dofAnalysis,
  duplicateInstance,
  flattenAssembly,
  flattenBom,
  groupSubassembly,
  identity,
  patternLinear,
  removeConnector,
  removeInstance,
  removeMate,
  renameInstance,
  saveDisplayStateWithAppearance,
  setBomColumnVisible,
  setInstanceAppearance,
  clearInstanceAppearance,
  setInstanceExplode,
  setInstanceFolder,
  setInstanceGrounded,
  setInstanceSuppressed,
  setInstanceVisible,
  setMateEnabled,
  setMateSuppressed,
  ungroupSubassembly,
  updateBomOverride,
  updateInstanceMetadata,
  updateMate,
  type Assembly,
  type AssemblyConnector,
  type AssemblyFeature,
  type AssemblyInstance,
  type AssemblyInstanceMetadata,
  type AssemblyPerformanceReport,
  type BomColumnId,
  type BomMode,
  type Mate,
  type MateKind,
  type StandardPartSpec,
  type StandardPartKind,
  STANDARD_CONTENT,
  standardPartById,
} from "../assemblies";
import type {
  AssemblyPosition,
  AssemblySolveSnapshot,
} from "../assemblies/document";
import {
  exactInterferencePairs,
  interferencePairs,
  type BodyBrepGeometry,
  type BodyMesh,
  type InterferencePair,
} from "../assemblies/interference";
import type { BodyBounds } from "../assemblies/connectors";
import {
  applyConfigurationConditionsToBomRows,
  applyConfigurationToAssembly,
  applyConfigurationToBomRows,
  configurationOverrides,
  type ConfigurationTable,
} from "../phase7/configurations";
import { MATERIALS, type BodyRecord, type PartRecord } from "../model/parts";

export interface AssemblySolveResult {
  ok: boolean;
  dof: number;
  issues: string[];
  residual: number;
  placed: number;
  converged?: boolean;
  mateIds?: string[];
  instanceIds?: string[];
  assembly?: Assembly;
}

export interface AssemblyPick {
  /** Body-local picked point, in metres. */
  point: [number, number, number];
  normal: [number, number, number];
  kind: "face" | "edge" | "axis" | "point";
  /** Picked edge/axis direction, when the pick carries one. */
  axis?: [number, number, number];
  instanceId?: string;
}

export interface AssemblyFeatureOutcome {
  ok: boolean;
  message: string;
  historyId?: string;
  historyIds?: string[];
}

export interface AssemblyLinkedTab {
  id: string;
  name: string;
  kind: "partstudio" | "assembly" | "drawing";
}

interface AssemblyWorkspaceProps {
  asm: Assembly;
  bodies: readonly BodyRecord[];
  parts: readonly PartRecord[];
  bounds: Readonly<Record<string, BodyBounds>>;
  meshes?: Readonly<Record<string, BodyMesh>>;
  breps?: Readonly<Record<string, BodyBrepGeometry>>;
  explode: number;
  positions: readonly AssemblyPosition[];
  readOnly?: boolean;
  sourceLabel?: string;
  linkedTabs?: readonly AssemblyLinkedTab[];
  bomMode?: BomMode;
  bomConfiguration?: {
    table: ConfigurationTable;
    rowId: string | null;
  } | null;
  solveInfo?: AssemblySolveSnapshot | null;
  perf?: AssemblyPerformanceReport | null;
  onAssemblyChange: (asm: Assembly, explode?: number) => void;
  onExplodeChange: (explode: number) => void;
  onPositionsChange: (positions: AssemblyPosition[]) => void;
  onBomModeChange?: (mode: BomMode) => void;
  onApplyFeature?: (
    feature: AssemblyFeature,
  ) => Promise<AssemblyFeatureOutcome>;
  onDeleteFeature?: (
    feature: AssemblyFeature,
  ) => Promise<AssemblyFeatureOutcome>;
  onPickFace?: (kind?: AssemblyPick["kind"]) => Promise<AssemblyPick | null>;
  onInsertStandardPart?: (
    spec: StandardPartSpec,
    config: { lengthMM: number; radiusMM: number; count: number },
  ) => Promise<AssemblyFeatureOutcome>;
  onInsertLinkedTab?: (
    tabId: string,
    kind: AssemblyLinkedTab["kind"],
  ) => Promise<AssemblyFeatureOutcome>;
  onOpenSource?: () => void;
  onReturnToAssembly?: () => void;
  canReturn?: boolean;
  onFocusInstance?: (instanceId: string) => void;
  onInterferenceMarkers?: (instanceIds: string[]) => void;
  onRunBenchmark?: () => AssemblyPerformanceReport | null;
  onLoadBenchmark?: () => void;
  onViewportModeChange?: (enabled: boolean, selectedInstanceId: string) => void;
  onSolve: () => AssemblySolveResult | null;
}

function uniqueInstanceId(asm: Assembly, base: string): string {
  let id = `inst_${base}`;
  let n = 2;
  while (asm.instances.some((i) => i.id === id)) id = `inst_${base}_${n++}`;
  return id;
}

function leafPath(asm: Assembly, instanceId: string): string {
  const leaf = flattenAssembly(asm).find(
    (item) => item.instanceId === instanceId,
  );
  return leaf ? leaf.path.join(" / ") : instanceId;
}

/** Apply an instance edit at any nesting depth. */
function updateInstanceDeep(
  asm: Assembly,
  id: string,
  update: (instance: AssemblyInstance) => AssemblyInstance,
): Assembly {
  return {
    ...asm,
    instances: asm.instances.map((instance) => {
      if (instance.id === id) return update(instance);
      if (instance.subassembly)
        return {
          ...instance,
          subassembly: updateInstanceDeep(instance.subassembly, id, update),
        };
      return instance;
    }),
  };
}

function removeInstanceDeep(asm: Assembly, id: string): Assembly {
  return {
    ...asm,
    instances: asm.instances
      .filter((instance) => instance.id !== id)
      .map((instance) =>
        instance.subassembly
          ? {
              ...instance,
              subassembly: removeInstanceDeep(instance.subassembly, id),
            }
          : instance,
      ),
    mates: asm.mates.filter(
      (mate) => mate.a.bodyId !== id && mate.b.bodyId !== id,
    ),
    features: (asm.features ?? []).filter(
      (feature) => feature.instanceId !== id,
    ),
  };
}

function replaceInstanceDeep(
  asm: Assembly,
  id: string,
  replacement: { bodyId: string; partId: string; name?: string },
): Assembly {
  return updateInstanceDeep(asm, id, (instance) => ({
    ...instance,
    bodyId: replacement.bodyId,
    partId: replacement.partId,
    ...(replacement.name ? { name: replacement.name } : {}),
  }));
}

function folderNames(asm: Assembly): string[] {
  return [
    ...new Set(
      asm.instances
        .map((instance) => instance.folder)
        .filter((folder): folder is string => Boolean(folder)),
    ),
  ];
}

function numberValue(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function materialLabel(id: string | null | undefined): string {
  return MATERIALS.find((material) => material.id === id)?.label ?? "—";
}

const FEATURE_LABELS: Record<AssemblyFeature["kind"], string> = {
  hole: "Hole",
  cut: "Cut",
  boss: "Extrude boss",
  revolve: "Revolve boss",
  fillet: "Fillet",
  chamfer: "Chamfer",
};

type AssemblyGlyphName =
  | "insert"
  | "mate"
  | "move"
  | "explode"
  | "cube"
  | "bom"
  | "solve";

function AssemblyGlyph({ name }: { name: AssemblyGlyphName }) {
  const common = {
    className: "h-4 w-4 flex-none",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "insert":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 5v14M5 12h14M4 4h6M4 4v6M20 20h-6m6 0v-6"
          />
        </svg>
      );
    case "mate":
      return (
        <svg {...common}>
          <circle cx="9" cy="12" r="4" strokeWidth={1.7} />
          <circle cx="15" cy="12" r="4" strokeWidth={1.7} />
        </svg>
      );
    case "move":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5m-2.5 15-2.5-2.5m2.5 2.5 2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5m15-2.5-2.5-2.5m2.5 2.5-2.5 2.5"
          />
        </svg>
      );
    case "explode":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2-2.8 2.8"
          />
          <circle cx="12" cy="12" r="3" strokeWidth={1.7} />
        </svg>
      );
    case "cube":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5m-8-4.5 8 4.5m0 9v-9"
          />
        </svg>
      );
    case "bom":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M5 6h14M5 12h14M5 18h9M3 4v16"
          />
        </svg>
      );
    case "solve":
      return (
        <svg {...common}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="m5 12 4 4L19 6"
          />
        </svg>
      );
  }
}

export const AssemblyWorkspace: React.FC<AssemblyWorkspaceProps> = ({
  asm,
  bodies,
  parts,
  bounds,
  meshes = {},
  breps = {},
  explode,
  positions,
  readOnly = false,
  sourceLabel,
  linkedTabs = [],
  bomMode = "structured",
  bomConfiguration = null,
  solveInfo = null,
  perf = null,
  onAssemblyChange,
  onExplodeChange,
  onPositionsChange,
  onBomModeChange,
  onApplyFeature,
  onDeleteFeature,
  onPickFace,
  onInsertStandardPart,
  onInsertLinkedTab,
  onOpenSource,
  onReturnToAssembly,
  canReturn = false,
  onFocusInstance,
  onInterferenceMarkers,
  onRunBenchmark,
  onLoadBenchmark,
  onViewportModeChange,
  onSolve,
}) => {
  const [bodyId, setBodyId] = useState(bodies[0]?.id ?? "");
  const [mateKind, setMateKind] = useState<MateKind>("coincident");
  const [mateA, setMateA] = useState("");
  const [mateB, setMateB] = useState("");
  const [mateValue, setMateValue] = useState("10");
  const [mateMin, setMateMin] = useState("");
  const [mateMax, setMateMax] = useState("");
  const [connectorA, setConnectorA] = useState("body");
  const [connectorB, setConnectorB] = useState("body");
  const [connectorName, setConnectorName] = useState("Connector 1");
  const [connectorBase, setConnectorBase] = useState("body");
  const [connectorOffset, setConnectorOffset] = useState<
    [string, string, string]
  >(["0", "0", "0"]);
  const [connectorFlip, setConnectorFlip] = useState(false);
  const [connectorInstance, setConnectorInstance] = useState("");
  const [connectorStatus, setConnectorStatus] = useState("");
  const [connectorPickKind, setConnectorPickKind] = useState<
    "face" | "edge" | "axis" | "point"
  >("face");
  const [viewportMode, setViewportMode] = useState(true);
  const [bomModeLocal, setBomModeLocal] = useState<BomMode>(bomMode);
  const [positionName, setPositionName] = useState("");
  const [clearance, setClearance] = useState("0");
  const [patternId, setPatternId] = useState("");
  const [patternAxis, setPatternAxis] = useState<"x" | "y" | "z">("x");
  const [patternCount, setPatternCount] = useState("3");
  const [patternSpacing, setPatternSpacing] = useState("20");
  const [result, setResult] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [subName, setSubName] = useState("");
  const [replaceBodyId, setReplaceBodyId] = useState("");
  const [featureInstance, setFeatureInstance] = useState("");
  const [featureKind, setFeatureKind] =
    useState<AssemblyFeature["kind"]>("hole");
  const [featureAxis, setFeatureAxis] = useState<"x" | "y" | "z">("z");
  const [featureRadius, setFeatureRadius] = useState("3");
  const [featureDepth, setFeatureDepth] = useState("100");
  const [featureOffset, setFeatureOffset] = useState<[string, string, string]>([
    "0",
    "0",
    "0",
  ]);
  const [featureStatus, setFeatureStatus] = useState("");
  const [editingFeatureId, setEditingFeatureId] = useState("");
  const [exactPairs, setExactPairs] = useState<InterferencePair[] | null>(null);
  const [exactBusy, setExactBusy] = useState(false);
  const [conflicts, setConflicts] = useState<{
    mateIds: string[];
    issues: string[];
  } | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogKind, setCatalogKind] = useState<StandardPartKind | "all">(
    "all",
  );
  const [catalogId, setCatalogId] = useState(STANDARD_CONTENT[0]!.id);
  const [catalogLength, setCatalogLength] = useState(
    String(STANDARD_CONTENT[0]!.lengthMM),
  );
  const [catalogRadius, setCatalogRadius] = useState(
    String(STANDARD_CONTENT[0]!.radiusMM),
  );
  const [catalogCount, setCatalogCount] = useState("1");
  const [catalogStatus, setCatalogStatus] = useState("");
  const [linkedTabId, setLinkedTabId] = useState(linkedTabs[0]?.id ?? "");
  const [linkedStatus, setLinkedStatus] = useState("");
  const [stateName, setStateName] = useState("");
  const [displayStateId, setDisplayStateId] = useState("");
  const [appearanceColor, setAppearanceColor] = useState("#9aa4ad");
  const [appearanceOpacity, setAppearanceOpacity] = useState("1");
  const [dragDelta, setDragDelta] = useState<[string, string, string]>([
    "5",
    "0",
    "0",
  ]);
  const [dragResult, setDragResult] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");

  const leaves = useMemo(() => flattenAssembly(asm), [asm]);
  const effectiveFeatureInstance =
    featureInstance || leaves[0]?.instanceId || "";
  const selectedInstance = useMemo(
    () =>
      flattenAssembly(asm).find(
        (leaf) => leaf.instanceId === selectedInstanceId,
      ),
    [asm, selectedInstanceId],
  );
  const focusInstance = (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setViewportMode(true);
    onFocusInstance?.(instanceId);
  };
  const scrollToPanel = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const closeInsertMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  useEffect(() => {
    onViewportModeChange?.(viewportMode, selectedInstanceId);
  }, [onViewportModeChange, selectedInstanceId, viewportMode]);
  const selectedMeta = selectedInstance?.instance.metadata ?? {};
  const refs = useMemo(() => buildRefMap(asm, bounds), [asm, bounds]);
  const dofReport = useMemo(() => dofAnalysis(asm, refs), [asm, refs]);
  const bom = useMemo(() => {
    const base = bomConfiguration
      ? applyConfigurationToAssembly(
          asm,
          bomConfiguration.table,
          bomConfiguration.rowId,
        ).assembly
      : asm;
    let rows = assemblyBom(base, bodies, parts);
    if (bomConfiguration) {
      const overrides = configurationOverrides(
        bomConfiguration.table,
        bomConfiguration.rowId,
      );
      rows = applyConfigurationToBomRows(rows, overrides);
      rows = applyConfigurationConditionsToBomRows(
        rows,
        bomConfiguration.table,
        bomConfiguration.rowId,
      );
    }
    return flattenBom(rows, bomModeLocal);
  }, [asm, bodies, parts, bomModeLocal, bomConfiguration]);
  const columns = useMemo(() => bomColumns(asm), [asm]);
  const effectivePatternId = patternId || asm.instances[0]?.id || "";
  const clearanceValue = Math.max(0, Number(clearance) || 0);
  const faceInterference = useMemo(
    () => interferencePairs(asm, bounds, clearanceValue, meshes),
    [asm, bounds, clearanceValue, meshes],
  );
  const collision = useMemo(
    () => collisionReport(asm, bounds, clearanceValue, meshes),
    [asm, bounds, clearanceValue, meshes],
  );
  const clearancePairs = useMemo(
    () => computeClearancePairs(asm, bounds, Math.max(1, clearanceValue)),
    [asm, bounds, clearanceValue],
  );

  useEffect(() => {
    onInterferenceMarkers?.([
      ...new Set(
        [...collision.penetrating, ...collision.contacting].flatMap((pair) => [
          pair.a,
          pair.b,
        ]),
      ),
    ]);
    // Marker updates follow the report, not the callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collision]);

  useEffect(() => setBomModeLocal(bomMode), [bomMode]);

  useEffect(() => {
    if (Object.keys(breps).length === 0) {
      setExactPairs(null);
      return;
    }
    let cancelled = false;
    setExactBusy(true);
    void exactInterferencePairs(asm, bounds, clearanceValue, breps, meshes)
      .then((pairs) => {
        if (!cancelled) setExactPairs(pairs);
      })
      .catch(() => {
        if (!cancelled) setExactPairs(null);
      })
      .finally(() => {
        if (!cancelled) setExactBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asm, bounds, breps, clearanceValue, meshes]);

  const interference = exactPairs ?? faceInterference;
  const catalogSpec = standardPartById(catalogId) ?? STANDARD_CONTENT[0]!;
  const filteredCatalog = STANDARD_CONTENT.filter((spec) => {
    if (catalogKind !== "all" && spec.kind !== catalogKind) return false;
    if (!catalogQuery.trim()) return true;
    const query = catalogQuery.toLowerCase();
    return `${spec.name} ${spec.standard} ${spec.size} ${spec.kind}`
      .toLowerCase()
      .includes(query);
  });

  const selectCatalog = (id: string) => {
    const spec = standardPartById(id);
    if (!spec) return;
    setCatalogId(id);
    setCatalogLength(String(spec.lengthMM));
    setCatalogRadius(String(spec.radiusMM));
  };

  const writeAsm = (next: Assembly, nextExplode?: number) => {
    if (readOnly) return;
    onAssemblyChange(next, nextExplode);
  };

  const addInstanceForBody = (requestedBodyId = bodyId) => {
    if (readOnly) return;
    const body =
      bodies.find((candidate) => candidate.id === requestedBodyId) ?? bodies[0];
    if (!body) return;
    const next = {
      ...asm,
      instances: [
        ...asm.instances,
        {
          id: uniqueInstanceId(asm, body.id),
          partId: body.partId ?? body.id,
          bodyId: body.id,
          transform: identity(),
        },
      ],
    };
    writeAsm(next);
    setPatternId((id) => id || next.instances[0]!.id);
    setViewportMode(true);
  };
  const addInstance = () => addInstanceForBody();

  const insertStandard = async () => {
    if (readOnly || !onInsertStandardPart) return;
    setCatalogStatus("Building catalog part…");
    const outcome = await onInsertStandardPart(catalogSpec, {
      lengthMM: Math.max(1, numberValue(catalogLength, catalogSpec.lengthMM)),
      radiusMM: Math.max(0.5, numberValue(catalogRadius, catalogSpec.radiusMM)),
      count: Math.max(
        1,
        Math.min(24, Math.floor(numberValue(catalogCount, 1))),
      ),
    });
    setCatalogStatus(outcome.message);
  };

  const insertLinked = async (tabId = linkedTabId) => {
    if (readOnly || !onInsertLinkedTab || !tabId) return;
    const tab = linkedTabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    setLinkedTabId(tab.id);
    setLinkedStatus("Linking reference…");
    const outcome = await onInsertLinkedTab(tab.id, tab.kind);
    setLinkedStatus(outcome.message);
    setViewportMode(true);
  };

  const toggleExplode = () => {
    if (readOnly) return;
    const exploded = asm.instances.some(
      (instance) => (instance.explode ?? 0) !== 0,
    );
    writeAsm(autoExplode(asm, exploded ? 0 : 10));
    setViewportMode(true);
  };

  const addMate = () => {
    if (readOnly) return;
    const a = mateA || asm.instances[0]?.id;
    const b = mateB || asm.instances[1]?.id;
    if (!a || !b || a === b) return;
    const needsValue =
      mateKind === "distance" ||
      mateKind === "angle" ||
      mateKind === "screw" ||
      mateKind === "width";
    const value = numberValue(mateValue);
    const min = mateMin.trim() ? numberValue(mateMin) : undefined;
    const max = mateMax.trim() ? numberValue(mateMax) : undefined;
    const mate: Mate = {
      id: `mate_${Date.now().toString(36)}`,
      kind: mateKind,
      a: { bodyId: a, ref: connectorA },
      b: { bodyId: b, ref: connectorB },
      ...(needsValue ? { value } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
    writeAsm({ ...asm, mates: [...asm.mates, mate] });
  };

  const addCustomConnector = () => {
    if (readOnly) return;
    const target = connectorInstance || asm.instances[0]?.id;
    if (!target) return;
    const connector: Omit<AssemblyConnector, "id"> = {
      name:
        connectorName.trim() ||
        `Connector ${(asm.instances.find((i) => i.id === target)?.connectors?.length ?? 0) + 1}`,
      base: connectorBase,
      offset: [
        numberValue(connectorOffset[0]) / 1000,
        numberValue(connectorOffset[1]) / 1000,
        numberValue(connectorOffset[2]) / 1000,
      ],
      ...(connectorFlip ? { flip: true } : {}),
    };
    writeAsm(addConnector(asm, target, connector));
  };

  const solve = () => {
    if (readOnly) return;
    setConflicts(null);
    const outcome = onSolve();
    if (!outcome) {
      setResult("No solve result");
      return;
    }
    if (outcome.assembly) writeAsm(outcome.assembly);
    setResult(
      `${outcome.ok ? "SOLVED" : "NOT SOLVED"} · DOF ${dofReport.assemblyDof} · residual ${outcome.residual.toFixed(5)} · placed ${outcome.placed}${outcome.issues.length ? ` · ${outcome.issues.join("; ")}` : ""}`,
    );
    if (!outcome.ok) setConflicts(diagnoseConflicts(asm, refs));
  };

  const drag = (override?: [string, string, string]) => {
    if (readOnly || !selectedInstanceId) return;
    const source = override ?? dragDelta;
    const delta: [number, number, number] = [
      numberValue(source[0]) / 1000,
      numberValue(source[1]) / 1000,
      numberValue(source[2]) / 1000,
    ];
    const moved = updateInstanceDeep(asm, selectedInstanceId, (instance) => {
      const transform = [...instance.transform];
      transform[3] = (transform[3] ?? 0) + delta[0];
      transform[7] = (transform[7] ?? 0) + delta[1];
      transform[11] = (transform[11] ?? 0) + delta[2];
      return { ...instance, transform };
    });
    writeAsm(moved);
    const outcome = onSolve();
    if (outcome?.assembly) writeAsm(outcome.assembly);
    setDragResult(
      outcome
        ? `residual ${outcome.residual.toFixed(5)} · ${outcome.ok ? "converged" : "check mates"}`
        : "Moved; solver unavailable",
    );
  };

  const exportBom = () => {
    const blob = new Blob([bomCsv(bom, columns)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${asm.id || "assembly"}-bom.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const savePosition = () => {
    if (readOnly) return;
    const name = positionName.trim() || `Position ${positions.length + 1}`;
    const transforms: Record<string, number[]> = {};
    const visibility: Record<string, boolean> = {};
    for (const instance of asm.instances) {
      transforms[instance.id] = [...instance.transform];
      visibility[instance.id] = instance.visible !== false;
    }
    onPositionsChange([
      ...positions.filter((position) => position.name !== name),
      {
        name,
        explode,
        transforms,
        visibility,
        ...(displayStateId ? { displayStateId } : {}),
      },
    ]);
    setPositionName("");
  };

  const applyPosition = (position: AssemblyPosition) => {
    if (readOnly) return;
    let next = applyAssemblyPosition(asm, position);
    if (position.displayStateId)
      next = applyDisplayStateWithAppearance(next, position.displayStateId);
    onAssemblyChange(next, position.explode);
  };

  const addPattern = () => {
    if (readOnly || !effectivePatternId) return;
    writeAsm(
      patternLinear(
        asm,
        effectivePatternId,
        patternAxis,
        numberValue(patternCount, 1),
        numberValue(patternSpacing),
      ),
    );
  };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((value) => value !== id),
    );

  const makeSubassembly = () => {
    if (readOnly || selectedIds.length === 0) return;
    const next = groupSubassembly(
      asm,
      selectedIds,
      subName.trim() || undefined,
    );
    writeAsm(next);
    setSelectedIds([]);
    setSubName("");
  };

  const dissolveSubassembly = (id: string) => {
    if (readOnly) return;
    writeAsm(ungroupSubassembly(asm, id));
  };

  const startEditFeature = (feature: AssemblyFeature) => {
    setEditingFeatureId(feature.id);
    setFeatureInstance(feature.instanceId);
    setFeatureKind(feature.kind);
    setFeatureAxis(feature.axis);
    setFeatureRadius(String(feature.radius));
    setFeatureDepth(String(feature.depth));
    setFeatureOffset(feature.offset.map(String) as [string, string, string]);
    setFeatureStatus(`Editing ${feature.label ?? feature.kind}`);
  };

  const applyFeature = async () => {
    if (readOnly || !onApplyFeature || !effectiveFeatureInstance) return;
    const existing = (asm.features ?? []).find(
      (feature) => feature.id === editingFeatureId,
    );
    const feature: AssemblyFeature = {
      id: existing?.id ?? `asmf_${Date.now().toString(36)}`,
      kind: featureKind,
      instanceId: effectiveFeatureInstance,
      axis: featureAxis,
      radius: Math.max(0.01, numberValue(featureRadius, 3)),
      depth: Math.max(0.01, numberValue(featureDepth, 100)),
      offset: [
        numberValue(featureOffset[0]),
        numberValue(featureOffset[1]),
        numberValue(featureOffset[2]),
      ],
      ...(existing?.label ? { label: existing.label } : {}),
    };
    if (existing && onDeleteFeature) {
      const removed = await onDeleteFeature(existing);
      if (!removed.ok) {
        setFeatureStatus(removed.message);
        return;
      }
    }
    setFeatureStatus(`Building in-context ${feature.kind}…`);
    const outcome = await onApplyFeature(feature);
    setFeatureStatus(outcome.message);
    if (outcome.ok) {
      const stored: AssemblyFeature = {
        ...feature,
        ...(outcome.historyId ? { historyId: outcome.historyId } : {}),
        ...(outcome.historyIds ? { historyIds: outcome.historyIds } : {}),
        ...(outcome.ok ? {} : { error: outcome.message }),
      };
      if (!outcome.ok) stored.error = outcome.message;
      writeAsm({
        ...asm,
        features: [
          ...(asm.features ?? []).filter((item) => item.id !== feature.id),
          stored,
        ],
      });
      setEditingFeatureId("");
    }
  };

  const deleteFeature = async (feature: AssemblyFeature) => {
    if (readOnly || !onDeleteFeature) return;
    const outcome = await onDeleteFeature(feature);
    if (!outcome.ok) {
      setFeatureStatus(outcome.message);
      return;
    }
    writeAsm({
      ...asm,
      features: (asm.features ?? []).filter((item) => item.id !== feature.id),
    });
    setFeatureStatus(outcome.message);
    if (editingFeatureId === feature.id) setEditingFeatureId("");
  };

  const pickConnector = async () => {
    const target = connectorInstance || selectedInstanceId;
    if (!target || !onPickFace || readOnly) return;
    setConnectorStatus(`Pick a ${connectorPickKind} in the viewport…`);
    const pick = await onPickFace(connectorPickKind);
    if (!pick) {
      setConnectorStatus("Pick cancelled");
      return;
    }
    const name = `Picked ${pick.kind} ${(asm.instances.find((i) => i.id === target)?.connectors?.length ?? 0) + 1}`;
    const direction = pick.axis ?? pick.normal;
    writeAsm(
      addConnector(asm, target, {
        name,
        base: "body",
        kind: pick.kind,
        offset: pick.point,
        ...(pick.kind === "face" ? { normal: direction } : {}),
        ...(pick.kind === "edge" || pick.kind === "axis"
          ? { axis: direction }
          : {}),
        ...(pick.kind === "point" ? { radius: 0 } : {}),
      }),
    );
    setConnectorName(name);
    setConnectorStatus(
      `${pick.kind} connector added at ${pick.point.map((value) => (value * 1000).toFixed(1)).join(", ")} mm`,
    );
  };

  const pickFace = async () => {
    if (!onPickFace || readOnly) return;
    const pick = await onPickFace();
    if (!pick) return;
    const leaf = leaves.find(
      (item) => item.instanceId === effectiveFeatureInstance,
    );
    const bodyKey = leaf?.bodyId ?? leaf?.instanceId ?? "";
    const box = bounds[bodyKey];
    const center: [number, number, number] = box
      ? [
          (box.min.x + box.max.x) / 2,
          (box.min.y + box.max.y) / 2,
          (box.min.z + box.max.z) / 2,
        ]
      : [0, 0, 0];
    setFeatureOffset(
      [0, 1, 2].map((index) =>
        String(((pick.point[index] ?? 0) - (center[index] ?? 0)) * 1000),
      ) as [string, string, string],
    );
    const absolute = pick.normal.map(Math.abs);
    const ax = absolute[0] ?? 0;
    const ay = absolute[1] ?? 0;
    const az = absolute[2] ?? 0;
    setFeatureAxis(ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z");
    setFeatureStatus("Face pick applied to the feature origin and axis");
  };

  const saveState = () => {
    if (readOnly) return;
    const next = saveDisplayStateWithAppearance(
      asm,
      stateName || `State ${(asm.displayStates?.length ?? 0) + 1}`,
    );
    writeAsm(next);
    setStateName("");
  };

  const applyState = (id: string) => {
    if (readOnly) return;
    setDisplayStateId(id);
    writeAsm(applyDisplayStateWithAppearance(asm, id));
  };

  const applySelectedAppearance = () => {
    if (readOnly || !selectedInstanceId) return;
    const color = /^#[0-9a-fA-F]{6}$/.test(appearanceColor)
      ? appearanceColor
      : undefined;
    writeAsm(
      setInstanceAppearance(asm, selectedInstanceId, {
        ...(color ? { color } : {}),
        opacity: Math.max(0, Math.min(1, numberValue(appearanceOpacity, 1))),
      }),
    );
  };

  const topInstances = asm.instances;
  const folders = folderNames(asm);
  const exploded = asm.instances.some(
    (instance) => (instance.explode ?? 0) !== 0,
  );

  return (
    <div
      data-testid="assembly-workspace"
      className={`cad-studio-light absolute inset-0 z-20 flex flex-col text-xs text-gray-200 ${
        viewportMode ? "pointer-events-none bg-transparent" : "bg-gray-950/95"
      }`}
    >
      <div
        data-testid="assembly-toolbar"
        className="pointer-events-auto flex h-10 flex-none items-center gap-0.5 border-b border-[var(--cad-border)] bg-[var(--cad-chrome)] px-2"
      >
        <details className="relative">
          <summary
            className="cad-tool cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            title="Insert"
          >
            <AssemblyGlyph name="insert" />
            Insert
          </summary>
          <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded border border-[var(--cad-border)] bg-white p-1 shadow-lg">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--cad-text-muted)]">
              Source bodies
            </div>
            {bodies.map((body) => (
              <button
                key={body.id}
                type="button"
                aria-label={`Insert ${body.name}`}
                data-testid="assembly-insert-body"
                disabled={readOnly}
                onClick={(event) => {
                  closeInsertMenu(event);
                  addInstanceForBody(body.id);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-[var(--cad-text)] hover:bg-[#f1f3f4] disabled:opacity-40"
              >
                <span className="min-w-0 flex-1 truncate">{body.name}</span>
                <span className="text-[9px] text-[var(--cad-text-faint)]">
                  body
                </span>
              </button>
            ))}
            {bodies.length === 0 && (
              <div className="px-2 py-1 text-[10px] text-[var(--cad-text-faint)]">
                No source bodies in the linked Part Studio.
              </div>
            )}
            <div className="my-1 border-t border-[var(--cad-border)]" />
            <button
              type="button"
              onClick={(event) => {
                closeInsertMenu(event);
                scrollToPanel("assembly-standard-content");
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-[var(--cad-text)] hover:bg-[#f1f3f4]"
            >
              Browse standard content…
            </button>
            {linkedTabs.length > 0 && (
              <>
                <div className="my-1 border-t border-[var(--cad-border)]" />
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--cad-text-muted)]">
                  Linked tabs
                </div>
                {linkedTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-label={`Insert linked ${tab.name}`}
                    data-testid="assembly-insert-linked-menu"
                    disabled={readOnly || !onInsertLinkedTab}
                    onClick={(event) => {
                      closeInsertMenu(event);
                      void insertLinked(tab.id);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-[var(--cad-text)] hover:bg-[#f1f3f4] disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1 truncate">{tab.name}</span>
                    <span className="text-[9px] text-[var(--cad-text-faint)]">
                      {tab.kind}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </details>
        <button
          type="button"
          aria-label="Mate"
          title="Mate"
          disabled={readOnly || asm.instances.length < 2}
          onClick={() => {
            setViewportMode(true);
            scrollToPanel("assembly-mates-section");
          }}
          className="cad-tool"
        >
          <AssemblyGlyph name="mate" />
          Mate
        </button>
        <button
          type="button"
          aria-label="Move instance"
          title="Move instance"
          disabled={!leaves.length}
          onClick={() => {
            const id = selectedInstanceId || leaves[0]?.instanceId;
            if (id) focusInstance(id);
          }}
          className="cad-tool"
        >
          <AssemblyGlyph name="move" />
          Move
        </button>
        <button
          type="button"
          aria-label="Explode assembly"
          title={exploded ? "Collapse assembly" : "Explode assembly"}
          aria-pressed={exploded}
          disabled={readOnly || !leaves.length}
          onClick={toggleExplode}
          className="cad-tool"
          data-active={exploded}
        >
          <AssemblyGlyph name="explode" />
          {exploded ? "Collapse" : "Explode"}
        </button>
        <div className="cad-divider" />
        <button
          type="button"
          aria-label="Show 3D view"
          title="3D view"
          aria-pressed={viewportMode}
          onClick={() => setViewportMode(true)}
          className="cad-tool"
          data-active={viewportMode}
        >
          <AssemblyGlyph name="cube" />
          3D
        </button>
        <button
          type="button"
          aria-label="Show BOM"
          title="Bill of materials"
          aria-pressed={!viewportMode}
          onClick={() => setViewportMode(false)}
          className="cad-tool"
          data-active={!viewportMode}
        >
          <AssemblyGlyph name="bom" />
          BOM
        </button>
        <div className="cad-divider" />
        <button
          type="button"
          aria-label="Solve assembly"
          title="Solve assembly"
          disabled={readOnly}
          onClick={solve}
          className="cad-tool"
        >
          <AssemblyGlyph name="solve" />
          Solve
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--cad-text-muted)]">
          <span>
            {leaves.length} instance{leaves.length === 1 ? "" : "s"} ·{" "}
            {asm.mates.length} mate{asm.mates.length === 1 ? "" : "s"}
          </span>
          {readOnly && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800">
              View only
            </span>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="pointer-events-auto w-80 flex-none overflow-y-auto border-r border-gray-700 bg-gray-950/95">
          <div className="border-b border-gray-700 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Assembly</div>
              {readOnly && (
                <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200">
                  View only
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500">
              {asm.instances.length} top-level · {leaves.length} leaves ·{" "}
              {asm.mates.length} mates · DOF {dofReport.assemblyDof}
            </div>
            <div className="mt-1 flex gap-2 text-[10px]">
              <span className="text-gray-500">
                {sourceLabel
                  ? `Source: ${sourceLabel}`
                  : "No source Part Studio"}
              </span>
              {onOpenSource && (
                <button
                  type="button"
                  onClick={onOpenSource}
                  disabled={readOnly}
                  className="ml-auto text-sky-300 hover:text-sky-200 disabled:opacity-30"
                >
                  Open source
                </button>
              )}
              {canReturn && onReturnToAssembly && (
                <button
                  type="button"
                  onClick={onReturnToAssembly}
                  className="text-sky-300 hover:text-sky-200"
                >
                  Return to assembly
                </button>
              )}
            </div>
          </div>

          <section
            id="assembly-standard-content"
            className="scroll-mt-12 space-y-2 border-b border-gray-800 p-3"
          >
            <div className="font-semibold">Standard content</div>
            <input
              aria-label="Catalog search"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search fasteners, bearings…"
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
            />
            <div className="flex gap-1">
              {(["all", "bolt", "washer", "bearing"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={`Filter catalog by ${kind}`}
                  onClick={() => setCatalogKind(kind)}
                  className={`rounded px-1.5 py-0.5 text-[9px] ${catalogKind === kind ? "bg-sky-700 text-white" : "bg-gray-800 text-gray-400"}`}
                >
                  {kind}
                </button>
              ))}
            </div>
            <select
              aria-label="Catalog part"
              value={catalogId}
              onChange={(event) => selectCatalog(event.target.value)}
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
            >
              {filteredCatalog.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.name} · {spec.standard} {spec.size}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[9px] uppercase text-gray-500">
                Length
                <input
                  aria-label="Catalog length"
                  value={catalogLength}
                  onChange={(event) => setCatalogLength(event.target.value)}
                  disabled={readOnly}
                  className="mt-0.5 w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] text-gray-200"
                />
              </label>
              <label className="text-[9px] uppercase text-gray-500">
                Radius
                <input
                  aria-label="Catalog radius"
                  value={catalogRadius}
                  onChange={(event) => setCatalogRadius(event.target.value)}
                  disabled={readOnly}
                  className="mt-0.5 w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] text-gray-200"
                />
              </label>
              <label className="text-[9px] uppercase text-gray-500">
                Qty
                <input
                  aria-label="Catalog count"
                  value={catalogCount}
                  onChange={(event) => setCatalogCount(event.target.value)}
                  disabled={readOnly}
                  className="mt-0.5 w-full rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] text-gray-200"
                />
              </label>
            </div>
            <button
              type="button"
              data-testid="assembly-insert-standard"
              onClick={() => void insertStandard()}
              disabled={
                readOnly ||
                !onInsertStandardPart ||
                filteredCatalog.length === 0
              }
              className="w-full rounded bg-emerald-800 py-1 hover:bg-emerald-700 disabled:opacity-40"
            >
              Insert {catalogSpec.name}
            </button>
            {catalogStatus && (
              <p className="break-all text-[10px] text-gray-400">
                {catalogStatus}
              </p>
            )}
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="font-semibold">Linked references</div>
            <select
              aria-label="Linked tab"
              data-testid="assembly-linked-tab"
              value={linkedTabId}
              onChange={(event) => setLinkedTabId(event.target.value)}
              disabled={readOnly || !linkedTabs.length}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] disabled:opacity-50"
            >
              {linkedTabs.length === 0 && (
                <option value="">No other tabs</option>
              )}
              {linkedTabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.name} ({tab.kind})
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="assembly-insert-linked"
              onClick={() => void insertLinked()}
              disabled={readOnly || !onInsertLinkedTab || !linkedTabId}
              className="w-full rounded bg-gray-700 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              Insert linked{" "}
              {linkedTabs.find((tab) => tab.id === linkedTabId)?.kind ?? "tab"}
            </button>
            {linkedStatus && (
              <p className="break-all text-[10px] text-gray-400">
                {linkedStatus}
              </p>
            )}
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="font-semibold">Instances</div>
            <select
              aria-label="Assembly body"
              value={bodyId}
              onChange={(event) => setBodyId(event.target.value)}
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 disabled:opacity-50"
            >
              {bodies.map((body) => (
                <option key={body.id} value={body.id}>
                  {body.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addInstance}
              disabled={readOnly || bodies.length === 0}
              className="w-full rounded bg-gray-700 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              + Add source body
            </button>
            {bodies.length === 0 && (
              <p className="text-[10px] text-amber-300">
                This source Part Studio has no solid bodies.
              </p>
            )}

            {folders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {["all", ...folders].map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    aria-label={
                      folder === "all"
                        ? "Show all folders"
                        : `Filter by ${folder}`
                    }
                    data-testid="assembly-folder-filter"
                    onClick={() => setFolderFilter(folder)}
                    className={`rounded px-1.5 py-0.5 text-[9px] ${folderFilter === folder ? "bg-sky-700 text-white" : "bg-gray-800 text-gray-400"}`}
                  >
                    {folder === "all" ? "All folders" : folder}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1">
              {topInstances.length === 0 && (
                <div className="rounded border border-dashed border-gray-700 px-2 py-3 text-[10px] text-gray-500">
                  No instances yet. Use Insert to add a source body, standard
                  content, or linked tab.
                </div>
              )}
              {topInstances
                .filter(
                  (instance) =>
                    folderFilter === "all" || instance.folder === folderFilter,
                )
                .map((inst) => {
                  const subassembly = inst.subassembly;
                  const label = subassembly
                    ? (inst.name ?? subassembly.name ?? "Subassembly")
                    : (inst.name ??
                      bodies.find(
                        (candidate) =>
                          candidate.id === (inst.bodyId ?? inst.partId),
                      )?.name ??
                      inst.partId);
                  const hasLeafChildren = leaves.some(
                    (leaf) => leaf.parentId === inst.id,
                  );
                  return (
                    <div
                      key={inst.id}
                      className="rounded bg-gray-800/60 px-2 py-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${inst.id}`}
                          data-testid="assembly-select-instance"
                          checked={selectedIds.includes(inst.id)}
                          disabled={readOnly}
                          onChange={(event) =>
                            toggleSelected(inst.id, event.target.checked)
                          }
                        />
                        <button
                          type="button"
                          data-testid={`assembly-instance-${inst.id}`}
                          onClick={() => setSelectedInstanceId(inst.id)}
                          className={`min-w-0 flex-1 truncate text-left ${selectedInstanceId === inst.id ? "text-sky-300" : ""}`}
                        >
                          {label}
                          {subassembly
                            ? ` (${subassembly.instances.length})`
                            : ""}
                        </button>
                        <label
                          className="flex items-center gap-0.5 text-[9px] text-gray-500"
                          title="Visible"
                        >
                          V
                          <input
                            type="checkbox"
                            aria-label={`Visible ${inst.id}`}
                            data-testid="assembly-visible-instance"
                            checked={inst.visible !== false}
                            disabled={readOnly}
                            onChange={(event) =>
                              writeAsm(
                                setInstanceVisible(
                                  asm,
                                  inst.id,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                        </label>
                        <label
                          className="flex items-center gap-0.5 text-[9px] text-gray-500"
                          title="Suppressed"
                        >
                          S
                          <input
                            type="checkbox"
                            aria-label={`Suppressed ${inst.id}`}
                            checked={inst.suppressed === true}
                            disabled={readOnly}
                            onChange={(event) =>
                              writeAsm(
                                setInstanceSuppressed(
                                  asm,
                                  inst.id,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                        </label>
                        <label
                          className="flex items-center gap-0.5 text-[9px] text-gray-500"
                          title="Grounded"
                        >
                          G
                          <input
                            type="checkbox"
                            aria-label={`Grounded ${inst.id}`}
                            checked={inst.grounded === true}
                            disabled={readOnly}
                            onChange={(event) =>
                              writeAsm(
                                setInstanceGrounded(
                                  asm,
                                  inst.id,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          aria-label={`Rename ${inst.id}`}
                          data-testid="assembly-rename-instance"
                          defaultValue={inst.name ?? ""}
                          placeholder="Name"
                          disabled={readOnly}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value)
                              writeAsm(renameInstance(asm, inst.id, value));
                          }}
                          className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[10px]"
                        />
                        <input
                          aria-label={`Folder ${inst.id}`}
                          data-testid="assembly-folder-instance"
                          defaultValue={inst.folder ?? ""}
                          placeholder="Folder"
                          disabled={readOnly}
                          onBlur={(event) =>
                            writeAsm(
                              setInstanceFolder(
                                asm,
                                inst.id,
                                event.target.value.trim() || null,
                              ),
                            )
                          }
                          className="w-16 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[10px]"
                        />
                        <input
                          aria-label={`Explode ${inst.id}`}
                          data-testid="assembly-explode-instance"
                          type="number"
                          value={inst.explode ?? 0}
                          disabled={readOnly}
                          onChange={(event) =>
                            writeAsm(
                              setInstanceExplode(
                                asm,
                                inst.id,
                                Number(event.target.value) || 0,
                              ),
                            )
                          }
                          className="w-12 rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[10px]"
                        />
                        <button
                          type="button"
                          aria-label={`Duplicate ${inst.id}`}
                          disabled={readOnly}
                          onClick={() =>
                            writeAsm(
                              duplicateInstance(asm, inst.id, [0.03, 0, 0]),
                            )
                          }
                          className="text-[9px] text-sky-300 hover:text-sky-200 disabled:opacity-30"
                        >
                          dup
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${inst.id}`}
                          data-testid="assembly-remove-instance"
                          disabled={readOnly}
                          onClick={() => writeAsm(removeInstance(asm, inst.id))}
                          className="text-red-300 hover:text-red-200 disabled:opacity-30"
                        >
                          ×
                        </button>
                      </div>
                      {subassembly && hasLeafChildren && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[9px] text-gray-500">
                            {subassembly.instances.length} nested instance
                            {subassembly.instances.length === 1 ? "" : "s"}
                          </summary>
                          <div className="mt-1 space-y-1 border-l border-gray-700 pl-2">
                            {leaves
                              .filter((leaf) => leaf.path.includes(inst.id))
                              .map((leaf) => (
                                <div
                                  key={leaf.instanceId}
                                  className="flex items-center gap-1 text-[10px]"
                                >
                                  <button
                                    type="button"
                                    aria-label={`Select instance ${leaf.instanceId}`}
                                    onClick={() =>
                                      setSelectedInstanceId(leaf.instanceId)
                                    }
                                    className={`min-w-0 flex-1 truncate text-left ${selectedInstanceId === leaf.instanceId ? "text-sky-300" : ""}`}
                                  >
                                    {leaf.path.join(" / ")}
                                  </button>
                                  <label className="flex items-center gap-0.5 text-[9px] text-gray-500">
                                    V
                                    <input
                                      type="checkbox"
                                      aria-label={`Visible ${leaf.instanceId}`}
                                      data-testid="assembly-visible-nested"
                                      checked={leaf.visible}
                                      disabled={readOnly}
                                      onChange={(event) =>
                                        writeAsm(
                                          updateInstanceDeep(
                                            asm,
                                            leaf.instanceId,
                                            (child) => ({
                                              ...child,
                                              visible: event.target.checked,
                                            }),
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    aria-label={`Focus ${leaf.instanceId}`}
                                    data-testid="assembly-focus-nested"
                                    onClick={() =>
                                      focusInstance(leaf.instanceId)
                                    }
                                    className="text-[9px] text-sky-300"
                                  >
                                    focus
                                  </button>
                                </div>
                              ))}
                          </div>
                        </details>
                      )}
                      {subassembly && (
                        <button
                          type="button"
                          aria-label={`Ungroup ${inst.id}`}
                          data-testid="assembly-ungroup"
                          disabled={readOnly}
                          onClick={() => dissolveSubassembly(inst.id)}
                          className="mt-1 text-[9px] text-sky-300 hover:text-sky-200 disabled:opacity-30"
                        >
                          ungroup
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="flex gap-1">
              <input
                aria-label="Subassembly name"
                value={subName}
                onChange={(event) => setSubName(event.target.value)}
                placeholder="Subassembly name"
                disabled={readOnly}
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
              />
              <button
                type="button"
                data-testid="assembly-group"
                onClick={makeSubassembly}
                disabled={readOnly || selectedIds.length === 0}
                className="rounded bg-gray-700 px-2 py-1 text-[10px] hover:bg-gray-600 disabled:opacity-40"
              >
                Group
              </button>
            </div>

            <div className="rounded border border-gray-700 p-2">
              <div className="mb-1 text-[10px] font-semibold text-gray-400">
                Selected instance
              </div>
              {selectedInstance ? (
                <div className="space-y-1" key={selectedInstance.instanceId}>
                  <div className="truncate text-[10px] text-gray-400">
                    {selectedInstance.path.join(" / ")}
                    {selectedInstance.instance.linkedTabId ? " · linked" : ""}
                  </div>
                  <input
                    aria-label="Instance name"
                    defaultValue={selectedInstance.instance.name ?? ""}
                    placeholder="Display name"
                    disabled={readOnly}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value)
                        writeAsm(
                          updateInstanceDeep(
                            asm,
                            selectedInstance.instanceId,
                            (instance) => ({
                              ...instance,
                              name: value,
                            }),
                          ),
                        );
                    }}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                  />
                  {(
                    [
                      ["number", "Part number"],
                      ["description", "Description"],
                      ["material", "Material"],
                      ["revision", "Revision"],
                      ["vendor", "Vendor"],
                    ] as [keyof AssemblyInstanceMetadata, string][]
                  ).map(([key, label]) => (
                    <input
                      key={key}
                      aria-label={`Instance ${key}`}
                      defaultValue={selectedMeta[key] ?? ""}
                      placeholder={label}
                      disabled={readOnly}
                      onBlur={(event) =>
                        writeAsm(
                          updateInstanceMetadata(
                            asm,
                            selectedInstance.instanceId,
                            {
                              [key]: event.target.value,
                            },
                          ),
                        )
                      }
                      className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    />
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      aria-label="Instance appearance color"
                      type="color"
                      value={appearanceColor}
                      onChange={(event) =>
                        setAppearanceColor(event.target.value)
                      }
                      disabled={readOnly}
                      className="h-5 w-8 rounded border border-gray-700 bg-gray-800"
                    />
                    <input
                      aria-label="Instance appearance opacity"
                      value={appearanceOpacity}
                      onChange={(event) =>
                        setAppearanceOpacity(event.target.value)
                      }
                      disabled={readOnly}
                      className="w-10 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={applySelectedAppearance}
                      disabled={readOnly}
                      className="rounded bg-gray-700 px-2 py-0.5 text-[9px] hover:bg-gray-600 disabled:opacity-40"
                    >
                      Appearance
                    </button>
                    <button
                      type="button"
                      data-testid="assembly-clear-appearance"
                      onClick={() =>
                        writeAsm(
                          clearInstanceAppearance(
                            asm,
                            selectedInstance.instanceId,
                          ),
                        )
                      }
                      disabled={readOnly}
                      className="rounded bg-gray-800 px-2 py-0.5 text-[9px] text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label="Replacement body"
                      value={replaceBodyId}
                      onChange={(event) => setReplaceBodyId(event.target.value)}
                      disabled={readOnly}
                      className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    >
                      <option value="">Replace with…</option>
                      {bodies.map((body) => (
                        <option key={body.id} value={body.id}>
                          {body.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-testid="assembly-replace-body"
                      disabled={readOnly || !replaceBodyId}
                      onClick={() => {
                        const body = bodies.find(
                          (item) => item.id === replaceBodyId,
                        );
                        if (!body) return;
                        writeAsm(
                          replaceInstanceDeep(
                            asm,
                            selectedInstance.instanceId,
                            {
                              bodyId: body.id,
                              partId: body.partId ?? body.id,
                              ...(body.name ? { name: body.name } : {}),
                            },
                          ),
                        );
                      }}
                      className="rounded bg-gray-700 px-2 py-0.5 text-[9px] hover:bg-gray-600 disabled:opacity-40"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      data-testid="assembly-delete-instance"
                      disabled={readOnly}
                      onClick={() =>
                        writeAsm(
                          removeInstanceDeep(asm, selectedInstance.instanceId),
                        )
                      }
                      className="rounded bg-red-900/60 px-2 py-0.5 text-[9px] text-red-200 hover:bg-red-800 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => focusInstance(selectedInstance.instanceId)}
                    disabled={!onFocusInstance}
                    className="w-full rounded bg-gray-800 py-0.5 text-[9px] text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Focus in viewport
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-gray-600">
                  Select an instance row or nested child.
                </p>
              )}
            </div>
          </section>

          <section
            id="assembly-mates-section"
            className="scroll-mt-12 space-y-2 border-b border-gray-800 p-3"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">Mates</div>
              <span className="text-[10px] text-gray-500">
                {dofReport.constraints} constraints · rank {dofReport.rank}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Mate instance A"
                value={mateA}
                onChange={(event) => setMateA(event.target.value)}
                disabled={readOnly}
                className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="">Instance A…</option>
                {asm.instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name ?? instance.id}
                  </option>
                ))}
              </select>
              <select
                aria-label="Mate instance B"
                value={mateB}
                onChange={(event) => setMateB(event.target.value)}
                disabled={readOnly}
                className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="">Instance B…</option>
                {asm.instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name ?? instance.id}
                  </option>
                ))}
              </select>
              <select
                aria-label="Mate connector A"
                value={connectorA}
                onChange={(event) => setConnectorA(event.target.value)}
                disabled={readOnly}
                className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                {[
                  ...new Set([
                    ...Object.keys(CONNECTOR_LABELS),
                    ...(
                      asm.instances.find(
                        (instance) =>
                          instance.id === (mateA || asm.instances[0]?.id),
                      )?.connectors ?? []
                    ).map((connector) => connector.name),
                  ]),
                ].map((name) => (
                  <option key={name} value={name}>
                    {CONNECTOR_LABELS[name as keyof typeof CONNECTOR_LABELS] ??
                      name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Mate connector B"
                value={connectorB}
                onChange={(event) => setConnectorB(event.target.value)}
                disabled={readOnly}
                className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                {[
                  ...new Set([
                    ...Object.keys(CONNECTOR_LABELS),
                    ...(
                      asm.instances.find(
                        (instance) =>
                          instance.id === (mateB || asm.instances[1]?.id),
                      )?.connectors ?? []
                    ).map((connector) => connector.name),
                  ]),
                ].map((name) => (
                  <option key={name} value={name}>
                    {CONNECTOR_LABELS[name as keyof typeof CONNECTOR_LABELS] ??
                      name}
                  </option>
                ))}
              </select>
            </div>
            <select
              aria-label="Mate type"
              value={mateKind}
              onChange={(event) => setMateKind(event.target.value as MateKind)}
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 disabled:opacity-50"
            >
              {MATE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {MATE_LABELS[kind]}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-1">
              <input
                aria-label="Mate value"
                value={mateValue}
                onChange={(event) => setMateValue(event.target.value)}
                disabled={readOnly}
                placeholder="Value"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
              <input
                aria-label="Mate minimum"
                value={mateMin}
                onChange={(event) => setMateMin(event.target.value)}
                disabled={readOnly}
                placeholder="Min"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
              <input
                aria-label="Mate maximum"
                value={mateMax}
                onChange={(event) => setMateMax(event.target.value)}
                disabled={readOnly}
                placeholder="Max"
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            </div>
            <p className="text-[9px] text-gray-500">
              Distance/width: mm · Angle: degrees · Limits are stored on the
              mate
            </p>
            <button
              type="button"
              onClick={addMate}
              disabled={readOnly || asm.instances.length < 2}
              className="w-full rounded bg-gray-700 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              + Mate selected instances
            </button>

            <div className="rounded border border-gray-700 p-2">
              <div className="mb-1 text-[10px] font-semibold text-gray-400">
                Named connector
              </div>
              <div className="mb-1 grid grid-cols-2 gap-1">
                <select
                  aria-label="Connector instance"
                  value={connectorInstance}
                  onChange={(event) => setConnectorInstance(event.target.value)}
                  disabled={readOnly}
                  className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                >
                  <option value="">Instance…</option>
                  {asm.instances.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name ?? instance.id}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Connector base"
                  value={connectorBase}
                  onChange={(event) => setConnectorBase(event.target.value)}
                  disabled={readOnly}
                  className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                >
                  {Object.entries(CONNECTOR_LABELS).map(([name, label]) => (
                    <option key={name} value={name}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                aria-label="Connector name"
                value={connectorName}
                onChange={(event) => setConnectorName(event.target.value)}
                disabled={readOnly}
                placeholder="Name"
                className="mb-1 w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
              />
              <div className="mb-1 grid grid-cols-3 gap-1">
                {(["X", "Y", "Z"] as const).map((label, index) => (
                  <input
                    key={label}
                    aria-label={`Connector offset ${label}`}
                    value={connectorOffset[index]}
                    onChange={(event) =>
                      setConnectorOffset((current) => {
                        const next: [string, string, string] = [...current];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                    disabled={readOnly}
                    placeholder={`${label} mm`}
                    className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  <input
                    type="checkbox"
                    aria-label="Flip connector"
                    checked={connectorFlip}
                    onChange={(event) => setConnectorFlip(event.target.checked)}
                    disabled={readOnly}
                  />
                  Flip orientation
                </label>
                <select
                  aria-label="Connector pick kind"
                  value={connectorPickKind}
                  onChange={(event) =>
                    setConnectorPickKind(
                      event.target.value as "face" | "edge" | "axis" | "point",
                    )
                  }
                  disabled={readOnly}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[9px]"
                >
                  <option value="face">Face</option>
                  <option value="edge">Edge</option>
                  <option value="axis">Axis</option>
                  <option value="point">Point</option>
                </select>
                <button
                  type="button"
                  onClick={() => void pickConnector()}
                  disabled={
                    readOnly ||
                    !onPickFace ||
                    !(connectorInstance || selectedInstanceId)
                  }
                  className="rounded bg-gray-700 px-2 py-0.5 text-[9px] hover:bg-gray-600 disabled:opacity-40"
                >
                  Pick connector
                </button>
                <button
                  type="button"
                  onClick={addCustomConnector}
                  disabled={readOnly}
                  className="ml-auto rounded bg-gray-700 px-2 py-0.5 text-[9px] hover:bg-gray-600 disabled:opacity-40"
                >
                  Add connector
                </button>
              </div>
              {connectorStatus && (
                <p className="mt-1 break-all text-[9px] text-gray-400">
                  {connectorStatus}
                </p>
              )}
              {asm.instances.flatMap((instance) =>
                (instance.connectors ?? []).map((connector) => (
                  <div
                    key={`${instance.id}:${connector.id}`}
                    className="mt-1 flex items-center gap-1 text-[9px] text-gray-400"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {instance.name ?? instance.id} · {connector.name} (
                      {connector.base})
                    </span>
                    <button
                      type="button"
                      data-testid="assembly-remove-connector"
                      onClick={() =>
                        writeAsm(
                          removeConnector(asm, instance.id, connector.id),
                        )
                      }
                      className="text-red-300"
                    >
                      ×
                    </button>
                  </div>
                )),
              )}
            </div>

            <div className="space-y-1">
              {asm.mates.map((mate) => (
                <div key={mate.id} className="rounded bg-gray-800/60 px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Enable ${mate.id}`}
                      data-testid="assembly-enable-mate"
                      checked={mate.enabled !== false}
                      disabled={readOnly}
                      onChange={(event) =>
                        writeAsm(
                          setMateEnabled(asm, mate.id, event.target.checked),
                        )
                      }
                    />
                    <input
                      type="checkbox"
                      aria-label={`Suppress ${mate.id}`}
                      data-testid="assembly-suppress-mate"
                      checked={mate.suppressed === true}
                      disabled={readOnly}
                      onChange={(event) =>
                        writeAsm(
                          setMateSuppressed(asm, mate.id, event.target.checked),
                        )
                      }
                      title="Suppress mate"
                    />
                    <button
                      type="button"
                      onClick={() => focusInstance(mate.a.bodyId)}
                      className={`min-w-0 flex-1 truncate text-left ${
                        mate.suppressed ? "text-gray-500 line-through" : ""
                      }`}
                      title="Focus instance A"
                    >
                      {mate.label ?? MATE_LABELS[mate.kind]} · {mate.a.ref}/
                      {mate.b.ref}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${mate.id}`}
                      data-testid="assembly-remove-mate"
                      disabled={readOnly}
                      onClick={() => writeAsm(removeMate(asm, mate.id))}
                      className="text-red-300 hover:text-red-200 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    <select
                      aria-label={`Edit mate kind ${mate.id}`}
                      data-testid="assembly-edit-mate-kind"
                      value={mate.kind}
                      disabled={readOnly}
                      onChange={(event) =>
                        writeAsm(
                          updateMate(asm, mate.id, {
                            kind: event.target.value as MateKind,
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                    >
                      {MATE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {MATE_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Edit mate A ref ${mate.id}`}
                      data-testid="assembly-edit-mate-a"
                      defaultValue={mate.a.ref}
                      disabled={readOnly}
                      onBlur={(event) =>
                        event.target.value.trim() &&
                        writeAsm(
                          updateMate(asm, mate.id, {
                            a: { ...mate.a, ref: event.target.value.trim() },
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                      title="Connector A"
                    />
                    <input
                      aria-label={`Edit mate B ref ${mate.id}`}
                      data-testid="assembly-edit-mate-b"
                      defaultValue={mate.b.ref}
                      disabled={readOnly}
                      onBlur={(event) =>
                        event.target.value.trim() &&
                        writeAsm(
                          updateMate(asm, mate.id, {
                            b: { ...mate.b, ref: event.target.value.trim() },
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                      title="Connector B"
                    />
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    <input
                      aria-label={`Value ${mate.id}`}
                      data-testid="assembly-mate-value"
                      defaultValue={mate.value ?? ""}
                      disabled={readOnly}
                      onBlur={(event) =>
                        writeAsm(
                          updateMate(asm, mate.id, {
                            ...(event.target.value.trim()
                              ? { value: numberValue(event.target.value) }
                              : {}),
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                      placeholder="Value"
                    />
                    <input
                      aria-label={`Min ${mate.id}`}
                      data-testid="assembly-mate-min"
                      defaultValue={mate.min ?? ""}
                      disabled={readOnly}
                      onBlur={(event) =>
                        writeAsm(
                          updateMate(asm, mate.id, {
                            ...(event.target.value.trim()
                              ? { min: numberValue(event.target.value) }
                              : {}),
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                      placeholder="Min"
                    />
                    <input
                      aria-label={`Max ${mate.id}`}
                      data-testid="assembly-mate-max"
                      defaultValue={mate.max ?? ""}
                      disabled={readOnly}
                      onBlur={(event) =>
                        writeAsm(
                          updateMate(asm, mate.id, {
                            ...(event.target.value.trim()
                              ? { max: numberValue(event.target.value) }
                              : {}),
                          }),
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-900 px-1 py-0.5 text-[9px]"
                      placeholder="Max"
                    />
                  </div>
                  {mate.error && (
                    <p className="mt-0.5 break-all text-[9px] text-red-300">
                      {mate.error}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              data-testid="assembly-solve-place"
              onClick={solve}
              disabled={readOnly}
              className="w-full rounded bg-blue-700 py-1 font-medium hover:bg-blue-600 disabled:opacity-40"
            >
              Solve &amp; place
            </button>
            {(result || solveInfo) && (
              <p className="break-all text-[10px] text-gray-400">
                {result ||
                  `${solveInfo?.ok ? "SOLVED" : "NOT SOLVED"} · DOF ${solveInfo?.dof ?? 0} · residual ${solveInfo?.residual.toFixed(5) ?? "0"}${solveInfo?.issues.length ? ` · ${solveInfo.issues.join("; ")}` : ""}`}
              </p>
            )}
            {solveInfo?.mateIds?.length && (
              <p className="text-[10px] text-red-300">
                Offending mates: {solveInfo.mateIds.join(", ")}
              </p>
            )}
            {solveInfo?.instanceIds?.length && (
              <p className="text-[10px] text-red-300">
                Offending instances: {solveInfo.instanceIds.join(", ")}
              </p>
            )}
            {conflicts && (
              <div className="rounded bg-red-950/40 px-2 py-1 text-[9px] text-red-200">
                <div className="font-semibold">Conflict diagnosis</div>
                <div className="break-all">
                  {conflicts.issues.join("; ") || "No issues"}
                </div>
                {conflicts.mateIds.length > 0 && (
                  <div className="mt-0.5 break-all">
                    Removing any of these makes the solve pass:{" "}
                    {conflicts.mateIds.join(", ")}
                  </div>
                )}
              </div>
            )}

            <div className="rounded border border-gray-700 p-2">
              <div className="mb-1 text-[10px] font-semibold text-gray-400">
                Drag with mates
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["X", "Y", "Z"] as const).map((label, index) => (
                  <input
                    key={label}
                    aria-label={`Drag delta ${label}`}
                    value={dragDelta[index]}
                    onChange={(event) =>
                      setDragDelta((current) => {
                        const next: [string, string, string] = [...current];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                    disabled={readOnly}
                    className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    placeholder={`${label} mm`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => drag()}
                disabled={readOnly || !selectedInstanceId}
                className="mt-1 w-full rounded bg-gray-700 py-0.5 text-[9px] hover:bg-gray-600 disabled:opacity-40"
              >
                Drag selected · live residual
              </button>
              <input
                type="range"
                min={-50}
                max={50}
                step={0.5}
                value={numberValue(dragDelta[0], 0)}
                aria-label="Live drag X"
                disabled={readOnly || !selectedInstanceId}
                onChange={(event) => {
                  const next: [string, string, string] = [
                    event.target.value,
                    dragDelta[1],
                    dragDelta[2],
                  ];
                  setDragDelta(next);
                  drag(next);
                }}
                className="mt-1 w-full"
              />
              {dragResult && (
                <p className="mt-0.5 text-[9px] text-gray-400">{dragResult}</p>
              )}
            </div>

            <details className="text-[9px] text-gray-500">
              <summary className="cursor-pointer">Per-instance DOF</summary>
              <div className="mt-1 space-y-0.5">
                {leaves.map((leaf) => (
                  <div key={leaf.instanceId} className="flex justify-between">
                    <span className="truncate">{leaf.path.join(" / ")}</span>
                    <span>{dofReport.instanceDof[leaf.instanceId] ?? "—"}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">Interference &amp; clearance</div>
              <span
                className={
                  interference.length ? "text-red-300" : "text-emerald-300"
                }
                data-testid="assembly-interference-count"
              >
                {interference.length} penetrating
                {exactBusy ? " · checking BRep" : ""}
              </span>
            </div>
            <label className="flex items-center gap-2 text-[10px] text-gray-500">
              Clearance
              <input
                aria-label="Interference clearance"
                value={clearance}
                onChange={(event) => setClearance(event.target.value)}
                className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-gray-200"
              />
              mm
            </label>
            <div className="space-y-1">
              {collision.penetrating.slice(0, 6).map((pair) => (
                <div
                  key={`${pair.a}-${pair.b}`}
                  className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-red-200"
                >
                  <div>
                    {pair.a} ↔ {pair.b} · {pair.penetration.toFixed(2)} mm ·{" "}
                    {pair.method === "brep"
                      ? `OCCT BRep (${(pair.volume ?? 0).toFixed(4)} vol)`
                      : pair.method === "face"
                        ? "face check"
                        : "bounds"}
                  </div>
                  {onFocusInstance && (
                    <button
                      type="button"
                      onClick={() => onFocusInstance(pair.a)}
                      className="text-[9px] text-sky-300"
                    >
                      focus pair
                    </button>
                  )}
                </div>
              ))}
              {collision.penetrating.length === 0 && (
                <p className="text-[10px] text-emerald-300">No penetration.</p>
              )}
            </div>
            <div className="space-y-0.5">
              {clearancePairs.slice(0, 8).map((pair) => (
                <div
                  key={`${pair.a}-${pair.b}-${pair.status}`}
                  className={`rounded px-2 py-0.5 text-[9px] ${pair.status === "contact" ? "bg-amber-950/50 text-amber-200" : "bg-gray-800/60 text-gray-300"}`}
                >
                  {pair.status === "contact" ? "Contact" : "Clearance"}:{" "}
                  {pair.a} ↔ {pair.b} · {pair.clearance.toFixed(2)} mm
                </div>
              ))}
              {clearancePairs.length === 0 && (
                <p className="text-[9px] text-gray-500">
                  No contact or tight clearance.
                </p>
              )}
            </div>
            <p className="text-[9px] text-gray-500">
              Closest positive clearance:{" "}
              {collision.closestClearance !== null
                ? `${collision.closestClearance.toFixed(2)} mm`
                : "—"}
            </p>
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="font-semibold">Assembly features</div>
            <select
              aria-label="Feature instance"
              data-testid="assembly-feature-instance"
              value={effectiveFeatureInstance}
              onChange={(event) => setFeatureInstance(event.target.value)}
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] disabled:opacity-50"
            >
              {leaves.map((leaf) => (
                <option key={leaf.instanceId} value={leaf.instanceId}>
                  {leaf.path.join(" / ")}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Assembly feature kind"
                value={featureKind}
                onChange={(event) =>
                  setFeatureKind(event.target.value as AssemblyFeature["kind"])
                }
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                {(Object.keys(FEATURE_LABELS) as AssemblyFeature["kind"][]).map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {FEATURE_LABELS[kind]}
                    </option>
                  ),
                )}
              </select>
              <select
                aria-label="Assembly feature axis"
                value={featureAxis}
                onChange={(event) =>
                  setFeatureAxis(event.target.value as "x" | "y" | "z")
                }
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              >
                <option value="x">X axis</option>
                <option value="y">Y axis</option>
                <option value="z">Z axis</option>
              </select>
              <input
                aria-label="Assembly feature radius"
                value={featureRadius}
                onChange={(event) => setFeatureRadius(event.target.value)}
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Radius"
              />
              <input
                aria-label="Assembly feature depth"
                value={featureDepth}
                onChange={(event) => setFeatureDepth(event.target.value)}
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                placeholder="Depth"
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["X", "Y", "Z"] as const).map((label, index) => (
                <input
                  key={label}
                  aria-label={`Assembly feature offset ${label}`}
                  value={featureOffset[index]}
                  onChange={(event) =>
                    setFeatureOffset((current) => {
                      const next: [string, string, string] = [...current];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                  disabled={readOnly}
                  className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
                  placeholder={`${label} offset`}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                data-testid="assembly-pick-feature"
                onClick={() => void pickFace()}
                disabled={readOnly || !onPickFace}
                className="min-w-0 flex-1 rounded bg-gray-700 px-2 py-1 text-[10px] hover:bg-gray-600 disabled:opacity-40"
              >
                Pick face / edge
              </button>
              <button
                type="button"
                aria-label={
                  editingFeatureId
                    ? `Update ${featureKind} feature`
                    : `Apply ${featureKind} feature`
                }
                data-testid="assembly-apply-feature"
                onClick={() => void applyFeature()}
                disabled={
                  readOnly || !onApplyFeature || !effectiveFeatureInstance
                }
                className="min-w-0 flex-1 rounded bg-emerald-800 px-2 py-1 text-[10px] hover:bg-emerald-700 disabled:opacity-40"
              >
                {editingFeatureId ? "Update" : "Apply"} {featureKind}
              </button>
            </div>
            {featureStatus && (
              <p className="break-all text-[10px] text-gray-400">
                {featureStatus}
              </p>
            )}
            {(asm.features ?? []).map((feature) => (
              <div
                key={feature.id}
                className="rounded bg-gray-800/60 px-2 py-1 text-[10px] text-gray-300"
              >
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">
                    {feature.label ?? FEATURE_LABELS[feature.kind]} ·{" "}
                    {leafPath(asm, feature.instanceId)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${feature.id}`}
                    data-testid="assembly-edit-feature"
                    onClick={() => startEditFeature(feature)}
                    disabled={readOnly}
                    className="text-[9px] text-sky-300 disabled:opacity-30"
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${feature.id}`}
                    data-testid="assembly-delete-feature"
                    onClick={() => void deleteFeature(feature)}
                    disabled={readOnly || !onDeleteFeature}
                    className="text-[9px] text-red-300 disabled:opacity-30"
                  >
                    delete
                  </button>
                </div>
                <div className="text-[9px] text-gray-500">
                  {feature.kind === "fillet" || feature.kind === "chamfer"
                    ? `R${feature.radius.toFixed(1)} mm`
                    : `Ø${(feature.radius * 2).toFixed(1)} × ${feature.depth.toFixed(1)} mm`}
                  {feature.historyId ? ` · ${feature.historyId}` : ""}
                </div>
                {feature.error && (
                  <div className="text-[9px] text-red-300">{feature.error}</div>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="font-semibold">Pattern</div>
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Pattern instance"
                value={effectivePatternId}
                onChange={(event) => setPatternId(event.target.value)}
                disabled={readOnly}
                className="min-w-0 rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] disabled:opacity-50"
              >
                <option value="">Select instance</option>
                {asm.instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name ?? instance.id}
                  </option>
                ))}
              </select>
              <select
                aria-label="Pattern axis"
                value={patternAxis}
                onChange={(event) =>
                  setPatternAxis(event.target.value as "x" | "y" | "z")
                }
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px] disabled:opacity-50"
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
              <input
                aria-label="Pattern count"
                value={patternCount}
                onChange={(event) => setPatternCount(event.target.value)}
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
              <input
                aria-label="Pattern spacing"
                value={patternSpacing}
                onChange={(event) => setPatternSpacing(event.target.value)}
                disabled={readOnly}
                className="rounded border border-gray-700 bg-gray-800 px-1 py-1 text-[10px]"
              />
            </div>
            <button
              type="button"
              onClick={addPattern}
              disabled={readOnly || !effectivePatternId}
              className="w-full rounded bg-gray-700 py-1 hover:bg-gray-600 disabled:opacity-40"
            >
              Apply linear pattern
            </button>
          </section>

          <section className="space-y-2 border-b border-gray-800 p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Exploded &amp; display states</div>
              <button
                type="button"
                onClick={() => writeAsm(autoExplode(asm, 10))}
                disabled={readOnly}
                className="text-[9px] text-sky-300 disabled:opacity-30"
              >
                auto-explode
              </button>
            </div>
            <label className="block text-[10px] text-gray-500">
              Explode {explode.toFixed(1)} mm
              <input
                type="range"
                min={0}
                max={50}
                step={0.5}
                value={explode}
                aria-label="Explode assembly"
                disabled={readOnly}
                onChange={(event) =>
                  onExplodeChange(Number(event.target.value))
                }
                className="mt-1 w-full"
              />
            </label>
            <div className="flex gap-1">
              <input
                aria-label="Display state name"
                value={stateName}
                onChange={(event) => setStateName(event.target.value)}
                placeholder="Display state name"
                disabled={readOnly}
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
              />
              <button
                type="button"
                onClick={saveState}
                disabled={readOnly}
                className="rounded bg-gray-700 px-2 py-1 text-[10px] hover:bg-gray-600 disabled:opacity-40"
              >
                Save state
              </button>
            </div>
            <select
              aria-label="Display state"
              value={displayStateId}
              onChange={(event) => applyState(event.target.value)}
              disabled={readOnly}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] disabled:opacity-50"
            >
              <option value="">Apply display state…</option>
              {(asm.displayStates ?? []).map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
            {(asm.displayStates ?? []).length > 0 && (
              <div className="space-y-0.5">
                {(asm.displayStates ?? []).map((state) => (
                  <div
                    key={state.id}
                    className="flex items-center gap-1 text-[9px] text-gray-500"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {state.name} · {Object.keys(state.visibility).length}{" "}
                      visible
                    </span>
                    <button
                      type="button"
                      data-testid="assembly-apply-state"
                      onClick={() => applyState(state.id)}
                      disabled={readOnly}
                      className="text-sky-300 disabled:opacity-30"
                    >
                      apply
                    </button>
                    <button
                      type="button"
                      data-testid="assembly-delete-state"
                      onClick={() =>
                        writeAsm({
                          ...asm,
                          displayStates: (asm.displayStates ?? []).filter(
                            (item) => item.id !== state.id,
                          ),
                        })
                      }
                      disabled={readOnly}
                      className="text-red-300 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-1">
              <input
                value={positionName}
                onChange={(event) => setPositionName(event.target.value)}
                placeholder="Position name"
                aria-label="Position name"
                disabled={readOnly}
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1"
              />
              <button
                type="button"
                data-testid="assembly-save-position"
                onClick={savePosition}
                disabled={readOnly}
                className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600 disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <select
              aria-label="Named position"
              value={
                positions.find((position) => position.explode === explode)
                  ?.name ?? ""
              }
              disabled={readOnly}
              onChange={(event) => {
                const position = positions.find(
                  (item) => item.name === event.target.value,
                );
                if (position) applyPosition(position);
              }}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 disabled:opacity-50"
            >
              <option value="">Current</option>
              {positions.map((position) => (
                <option key={position.name} value={position.name}>
                  {position.name} ({position.explode.toFixed(1)} mm ·{" "}
                  {position.transforms
                    ? `${Object.keys(position.transforms).length} transforms`
                    : "explode only"}
                  )
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Performance</div>
              <button
                type="button"
                onClick={() => onRunBenchmark?.()}
                disabled={!onRunBenchmark}
                className="text-[9px] text-sky-300 disabled:opacity-30"
              >
                Run 21-instance budget
              </button>
            </div>
            <button
              type="button"
              aria-label="Load benchmark assembly"
              onClick={() => onLoadBenchmark?.()}
              disabled={!onLoadBenchmark || readOnly}
              className="w-full rounded bg-gray-800 py-1 text-[10px] text-sky-300 hover:bg-gray-700 disabled:opacity-30"
            >
              Load 21-instance benchmark
            </button>
            {perf ? (
              <div className="space-y-0.5 text-[10px]">
                <div className={perf.ok ? "text-emerald-300" : "text-red-300"}>
                  {perf.ok ? "BUDGET PASS" : "BUDGET FAIL"} · {perf.instances}{" "}
                  leaves · {perf.levels} levels
                </div>
                <div className="text-gray-400">
                  open {perf.openMs.toFixed(1)}/{perf.bounds.openMs} ms · orbit{" "}
                  {perf.orbitMs.toFixed(1)}/{perf.bounds.orbitMs} ms
                </div>
                <div className="text-[9px] text-gray-500">
                  scene placement + real render frame; 16.7 ms budget per frame
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-gray-600">
                Run the benchmark to measure open/orbit projections.
              </p>
            )}
          </section>
        </div>

        <div
          className={`min-w-0 flex-1 flex-col ${viewportMode ? "hidden" : "flex"}`}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-700 px-3 py-2">
            <span className="font-semibold">BOM</span>
            <select
              aria-label="BOM mode"
              value={bomModeLocal}
              onChange={(event) => {
                const mode = event.target.value as BomMode;
                setBomModeLocal(mode);
                onBomModeChange?.(mode);
              }}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1"
            >
              <option value="structured">Structured</option>
              <option value="indented">Indented</option>
              <option value="flat">Flat</option>
            </select>
            <button
              type="button"
              onClick={exportBom}
              className="rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"
            >
              Export CSV
            </button>
            <details className="relative">
              <summary className="cursor-pointer rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-300">
                Columns
              </summary>
              <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded border border-gray-700 bg-gray-900 p-2 shadow">
                {columns.map((column) => (
                  <label
                    key={column.id}
                    className="flex items-center gap-1 text-[10px] text-gray-300"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Show ${column.label} column`}
                      data-testid="assembly-bom-column"
                      checked={column.visible}
                      disabled={readOnly}
                      onChange={(event) =>
                        writeAsm(
                          setBomColumnVisible(
                            asm,
                            column.id as BomColumnId,
                            event.target.checked,
                          ),
                        )
                      }
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>
            <span className="ml-auto text-[10px] text-gray-500">
              {bom.length} rows ·{" "}
              {columns.filter((column) => column.visible).length} columns
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-700 text-[10px] uppercase tracking-wide text-gray-500">
                  {columns
                    .filter((column) => column.visible)
                    .map((column) => (
                      <th key={column.id} className="py-1 pr-2">
                        {column.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {bom.map((row) => (
                  <tr key={row.key} className="border-b border-gray-800">
                    {columns
                      .filter((column) => column.visible)
                      .map((column) => {
                        const style =
                          column.id === "name"
                            ? { paddingLeft: 8 + row.depth * 12 }
                            : undefined;
                        switch (column.id) {
                          case "item":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                {row.item ?? "—"}
                              </td>
                            );
                          case "number":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                <input
                                  aria-label={`BOM number ${row.key}`}
                                  data-testid="assembly-bom-number"
                                  defaultValue={row.number}
                                  disabled={readOnly}
                                  onBlur={(event) =>
                                    writeAsm(
                                      updateBomOverride(asm, row.key, {
                                        number: event.target.value,
                                      }),
                                    )
                                  }
                                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 hover:border-gray-700"
                                />
                              </td>
                            );
                          case "name":
                            return (
                              <td
                                key={column.id}
                                className="py-1 pr-2"
                                style={style}
                              >
                                {row.name}
                              </td>
                            );
                          case "description":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                <input
                                  aria-label={`BOM description ${row.key}`}
                                  data-testid="assembly-bom-description"
                                  defaultValue={row.description}
                                  disabled={readOnly}
                                  onBlur={(event) =>
                                    writeAsm(
                                      updateBomOverride(asm, row.key, {
                                        description: event.target.value,
                                      }),
                                    )
                                  }
                                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 hover:border-gray-700"
                                />
                              </td>
                            );
                          case "material":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                <select
                                  aria-label={`BOM material ${row.key}`}
                                  data-testid="assembly-bom-material"
                                  defaultValue={row.materialId ?? ""}
                                  disabled={readOnly}
                                  onChange={(event) =>
                                    writeAsm(
                                      updateBomOverride(asm, row.key, {
                                        materialId: event.target.value,
                                      }),
                                    )
                                  }
                                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5"
                                >
                                  <option value="">
                                    {materialLabel(null)}
                                  </option>
                                  {MATERIALS.map((material) => (
                                    <option
                                      key={material.id}
                                      value={material.id}
                                    >
                                      {material.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          case "qty":
                            return (
                              <td key={column.id} className="py-1 text-right">
                                {row.qty}
                              </td>
                            );
                          case "revision":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                <input
                                  aria-label={`BOM revision ${row.key}`}
                                  data-testid="assembly-bom-revision"
                                  defaultValue={row.revision ?? ""}
                                  disabled={readOnly}
                                  onBlur={(event) =>
                                    writeAsm(
                                      updateBomOverride(asm, row.key, {
                                        revision: event.target.value,
                                      }),
                                    )
                                  }
                                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 hover:border-gray-700"
                                />
                              </td>
                            );
                          case "vendor":
                            return (
                              <td key={column.id} className="py-1 pr-2">
                                <input
                                  aria-label={`BOM vendor ${row.key}`}
                                  data-testid="assembly-bom-vendor"
                                  defaultValue={row.vendor ?? ""}
                                  disabled={readOnly}
                                  onBlur={(event) =>
                                    writeAsm(
                                      updateBomOverride(asm, row.key, {
                                        vendor: event.target.value,
                                      }),
                                    )
                                  }
                                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 hover:border-gray-700"
                                />
                              </td>
                            );
                        }
                      })}
                  </tr>
                ))}
                {bom.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="py-3 text-gray-500">
                      Add instances to build a BOM.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssemblyWorkspace;
