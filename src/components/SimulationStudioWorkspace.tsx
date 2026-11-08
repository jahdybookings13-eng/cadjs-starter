import React, { useEffect, useMemo, useState } from "react";
import {
  SIM_FACES,
  SIM_MATERIAL_LIBRARY,
  SIM_MAX_SOLVE_MS,
  assignSimMaterial,
  autoBondTouchingFaces,
  buildSimulationReport,
  contactTargetBody,
  defaultThermalBoundaries,
  demoBracketBody,
  emptySimulationDocument,
  generateVolumeMesh,
  materialForBody,
  materialFromPreset,
  simId,
  simulateBuckling,
  simulateContacts,
  simulateModal,
  simulateStatic,
  simulateThermal,
  simulationDocumentWithBody,
  updateSimMaterial,
  validateSimulationDocument,
  type SimBodySource,
  type SimBucklingResult,
  type SimContactPair,
  type SimContactResult,
  type SimContactKind,
  type SimDocument,
  type SimFace,
  type SimFixtureKind,
  type SimLoadKind,
  type SimMaterial,
  type SimMesh,
  type SimModalResult,
  type SimStaticResult,
  type SimThermalBoundaryKind,
  type SimThermalResult,
  type SimVec3,
} from "../sim";
import { SimulationResultView } from "./SimulationResultView";

export interface SimulationBody {
  id: string;
  name: string;
  triangles: SimBodySource["triangles"];
}

export interface SimulationStudioWorkspaceProps {
  document: SimDocument;
  bodies: ReadonlyArray<SimulationBody>;
  readOnly?: boolean;
  onChange: (document: SimDocument) => void;
}

type Section =
  | "mesh"
  | "materials"
  | "loads"
  | "thermal"
  | "contacts"
  | "results";

function inputClass(): string {
  return "w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>{label}</span>
        {hint && <span className="text-gray-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <input
      type="number"
      aria-label="Numeric value"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={inputClass()}
    />
  );
}

function VecInput({
  value,
  onChange,
  disabled,
}: {
  value: SimVec3;
  onChange: (value: SimVec3) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(["x", "y", "z"] as const).map((axis) => (
        <input
          key={axis}
          aria-label={`Vector ${axis}`}
          type="number"
          value={value[axis]}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, [axis]: Number(event.target.value) })
          }
          className={inputClass()}
        />
      ))}
    </div>
  );
}

function FaceSelect({
  value,
  onChange,
  disabled,
}: {
  value: SimFace;
  onChange: (value: SimFace) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Model face"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as SimFace)}
      className={inputClass()}
    >
      {SIM_FACES.map((face) => (
        <option key={face} value={face}>
          {face}
        </option>
      ))}
    </select>
  );
}

function generatedMesh(document: SimDocument): SimMesh | null {
  return document.mesh;
}

export const SimulationStudioWorkspace: React.FC<
  SimulationStudioWorkspaceProps
> = ({ document, bodies, readOnly = false, onChange }) => {
  const [section, setSection] = useState<Section>("mesh");
  const [selectedBodyId, setSelectedBodyId] = useState(
    document.body?.id ?? bodies[0]?.id ?? "",
  );
  const [selectedMaterialId, setSelectedMaterialId] = useState(
    document.materialId,
  );
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [meshing, setMeshing] = useState(false);
  const [staticResult, setStaticResult] = useState<SimStaticResult | null>(
    document.result,
  );
  const [modalResult, setModalResult] = useState<SimModalResult | null>(
    document.modal,
  );
  const [thermalResult, setThermalResult] = useState<SimThermalResult | null>(
    document.thermal,
  );
  const [bucklingResult, setBucklingResult] =
    useState<SimBucklingResult | null>(document.buckling);
  const [contactResult, setContactResult] = useState<SimContactResult | null>(
    document.contact,
  );

  useEffect(() => {
    if (!bodies.some((body) => body.id === selectedBodyId)) {
      setSelectedBodyId(document.body?.id ?? bodies[0]?.id ?? "");
    }
    if (!document.materials.some((item) => item.id === selectedMaterialId)) {
      setSelectedMaterialId(document.materialId);
    }
    setStaticResult(document.result);
    setModalResult(document.modal);
    setThermalResult(document.thermal);
    setBucklingResult(document.buckling);
    setContactResult(document.contact);
  }, [
    bodies,
    document.body?.id,
    document.materials,
    document.materialId,
    document.result,
    document.modal,
    document.thermal,
    document.buckling,
    document.contact,
    selectedBodyId,
    selectedMaterialId,
  ]);

  const issues = useMemo(
    () => validateSimulationDocument(document),
    [document],
  );
  const mesh = generatedMesh(document);
  const material =
    document.materials.find((item) => item.id === selectedMaterialId) ??
    document.materials[0] ??
    null;
  const materialForMesh = mesh ? materialForBody(document, mesh.bodyId) : null;
  const activeBody =
    (selectedBodyId
      ? bodies.find((body) => body.id === selectedBodyId)
      : null) ??
    document.body ??
    null;

  const commit = (next: SimDocument) => {
    if (!readOnly) onChange(next);
  };

  const selectBody = (id: string) => {
    setSelectedBodyId(id);
    const body = bodies.find((entry) => entry.id === id);
    if (!body) return;
    commit(
      simulationDocumentWithBody(document, {
        id: body.id,
        name: body.name,
        triangles: body.triangles as SimBodySource["triangles"],
      }),
    );
  };

  const loadDemo = () => {
    const demo = demoBracketBody();
    const base = emptySimulationDocument(document.name);
    commit({
      ...document,
      units: "mm",
      body: demo,
      mesh: null,
      materials: document.materials,
      materialId: document.materialId,
      assignments: [{ bodyId: demo.id, materialId: document.materialId }],
      fixtures: [
        {
          id: "demo_fixture",
          name: "Fixed root",
          kind: "fixed",
          bodyId: demo.id,
          face: "x-min",
        },
      ],
      loads: [
        {
          id: "demo_load",
          name: "Top force",
          kind: "force",
          bodyId: demo.id,
          face: "z-max",
          vector: { x: 0, y: 0, z: -5_000 },
          magnitude: 0,
          temperatureDelta: 0,
          remotePoint: { x: 0, y: 0, z: 0 },
        },
      ],
      settings: base.settings,
      thermalBoundaries: defaultThermalBoundaries(demo.id),
      targetMesh: null,
      contactTarget: null,
      contacts: [],
      result: null,
      modal: null,
      thermal: null,
      buckling: null,
      contact: null,
    });
    setStaticResult(null);
    setModalResult(null);
    setThermalResult(null);
    setBucklingResult(null);
    setContactResult(null);
    setSelectedBodyId(demo.id);
    setMessage("Demo bracket blank loaded.");
    setErrorCode("");
  };

  const runMesher = async () => {
    if (!activeBody) {
      setMessage("Select a body or load the demo bracket.");
      setErrorCode("SIM_MESH_BODY");
      return;
    }
    setMeshing(true);
    try {
      const nextMesh = await generateVolumeMesh(activeBody, {
        ...document.settings,
        units: document.units,
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const nextTargetMesh = document.contactTarget
        ? await generateVolumeMesh(document.contactTarget, {
            ...document.settings,
            units: document.units,
            deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
          })
        : null;
      commit({
        ...document,
        body: activeBody,
        mesh: nextMesh,
        targetMesh: nextTargetMesh,
        result: null,
        modal: null,
        thermal: null,
        buckling: null,
        contact: null,
      });
      setStaticResult(null);
      setModalResult(null);
      setThermalResult(null);
      setBucklingResult(null);
      setContactResult(null);
      setMessage(
        `Mesh generated: ${nextMesh.nodes.length} nodes, ${nextMesh.elements.length} tetrahedra${nextTargetMesh ? `; target ${nextTargetMesh.nodes.length} nodes, ${nextTargetMesh.elements.length} tetrahedra` : ""}.`,
      );
      setErrorCode("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Mesh generation failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_MESH",
      );
    } finally {
      setMeshing(false);
    }
  };

  const runStatic = () => {
    if (!materialForMesh) {
      setMessage("Assign a material to the meshed body.");
      setErrorCode("SIM_MATERIAL");
      return;
    }
    try {
      const result = simulateStatic(document, materialForMesh, {
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const next = {
        ...document,
        result,
        modal: null,
        thermal: null,
        buckling: null,
        contact: result.contact ?? null,
      };
      commit(next);
      setStaticResult(result);
      setModalResult(null);
      setThermalResult(null);
      setBucklingResult(null);
      setContactResult(result.contact ?? null);
      const contactNote =
        result.activeContacts !== undefined
          ? ` ${result.activeContacts} contact node${result.activeContacts === 1 ? "" : "s"} active.`
          : "";
      setMessage(
        `Static solve complete in ${result.solveMs.toFixed(1)} ms.${contactNote}`,
      );
      setErrorCode("");
      setSection("results");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Static solve failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_STATIC",
      );
    }
  };

  const runModal = () => {
    if (!materialForMesh) {
      setMessage("Assign a material to the meshed body.");
      setErrorCode("SIM_MATERIAL");
      return;
    }
    try {
      const result = simulateModal(document, materialForMesh, {
        modes: document.modalModes,
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const next = {
        ...document,
        modal: result,
        result: null,
        thermal: null,
        buckling: null,
      };
      commit(next);
      setModalResult(result);
      setStaticResult(null);
      setThermalResult(null);
      setBucklingResult(null);
      setMessage(`Modal solve complete in ${result.solveMs.toFixed(1)} ms.`);
      setErrorCode("");
      setSection("results");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Modal solve failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_MODAL",
      );
    }
  };

  const runThermal = () => {
    if (!materialForMesh) {
      setMessage("Assign a material to the meshed body.");
      setErrorCode("SIM_MATERIAL");
      return;
    }
    try {
      const result = simulateThermal(document, materialForMesh, {
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const next = {
        ...document,
        thermal: result,
        result: null,
        modal: null,
        buckling: null,
      };
      commit(next);
      setThermalResult(result);
      setStaticResult(null);
      setModalResult(null);
      setBucklingResult(null);
      setMessage(
        `Thermal solve complete in ${result.solveMs.toFixed(1)} ms: ${result.minTemperatureC.toFixed(1)} to ${result.maxTemperatureC.toFixed(1)} °C.`,
      );
      setErrorCode("");
      setSection("results");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Thermal solve failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_THERMAL",
      );
    }
  };

  const runBuckling = () => {
    if (!materialForMesh) {
      setMessage("Assign a material to the meshed body.");
      setErrorCode("SIM_MATERIAL");
      return;
    }
    try {
      const result = simulateBuckling(document, materialForMesh, {
        modes: 3,
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const next = {
        ...document,
        buckling: result,
        result: null,
        modal: null,
        thermal: null,
      };
      commit(next);
      setBucklingResult(result);
      setStaticResult(null);
      setModalResult(null);
      setThermalResult(null);
      setMessage(
        `Buckling solve complete in ${result.solveMs.toFixed(1)} ms; first multiplier × ${result.modes[0]!.multiplier.toFixed(2)}.`,
      );
      setErrorCode("");
      setSection("results");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Buckling solve failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_BUCKLING",
      );
    }
  };

  const runContacts = () => {
    try {
      const result = simulateContacts(document, {
        deadlineMs: performance.now() + SIM_MAX_SOLVE_MS,
      });
      const next = { ...document, contact: result };
      commit(next);
      setContactResult(result);
      setMessage(
        `Contact check complete in ${result.solveMs.toFixed(1)} ms: ${result.bonded} bonded, ${result.sliding} sliding, ${result.separating} separating, ${result.open} open.`,
      );
      setErrorCode("");
      setSection("results");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Contact check failed.",
      );
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_CONTACT",
      );
    }
  };

  const updateFixture = (
    index: number,
    patch: Partial<SimDocument["fixtures"][number]>,
  ) => {
    const fixtures = document.fixtures.map((fixture, at) =>
      at === index ? { ...fixture, ...patch } : fixture,
    );
    commit({ ...document, fixtures, result: null, modal: null });
    setStaticResult(null);
    setModalResult(null);
  };

  const updateLoad = (
    index: number,
    patch: Partial<SimDocument["loads"][number]>,
  ) => {
    const loads = document.loads.map((load, at) =>
      at === index ? { ...load, ...patch } : load,
    );
    commit({ ...document, loads, result: null, modal: null });
    setStaticResult(null);
    setModalResult(null);
  };

  const addFixture = () => {
    commit({
      ...document,
      fixtures: [
        ...document.fixtures,
        {
          id: `fixture_${Date.now().toString(36)}`,
          name: "Fixed face",
          kind: "fixed",
          bodyId: mesh?.bodyId ?? document.body?.id ?? "",
          face: "x-min",
        },
      ],
      result: null,
      modal: null,
    });
  };

  const addLoad = () => {
    commit({
      ...document,
      loads: [
        ...document.loads,
        {
          id: `load_${Date.now().toString(36)}`,
          name: "Force",
          kind: "force",
          bodyId: mesh?.bodyId ?? document.body?.id ?? "",
          face: "z-max",
          vector: { x: 0, y: 0, z: -1_000 },
          magnitude: 0,
          temperatureDelta: 0,
          remotePoint: { x: 0, y: 0, z: 0 },
        },
      ],
      result: null,
      modal: null,
    });
  };

  const updateThermalBoundary = (
    index: number,
    patch: Partial<SimDocument["thermalBoundaries"][number]>,
  ) => {
    const thermalBoundaries = document.thermalBoundaries.map((boundary, at) =>
      at === index ? { ...boundary, ...patch } : boundary,
    );
    commit({ ...document, thermalBoundaries, thermal: null });
    setThermalResult(null);
  };

  const addThermalBoundary = (kind: SimThermalBoundaryKind) => {
    const bodyId = mesh?.bodyId ?? document.body?.id ?? "";
    const boundary = {
      id: simId("thermal"),
      name:
        kind === "temperature"
          ? "Fixed temperature"
          : kind === "heat-flux"
            ? "Heat flux"
            : "Convection",
      kind,
      bodyId,
      face: (kind === "temperature" ? "x-min" : "x-max") as SimFace,
      value: kind === "heat-flux" ? 1_000 : 20,
      coefficient: kind === "convection" ? 10 : 0,
    };
    commit({
      ...document,
      thermalBoundaries: [...document.thermalBoundaries, boundary],
      thermal: null,
    });
    setThermalResult(null);
  };

  const updateContact = (index: number, patch: Partial<SimContactPair>) => {
    const contacts = document.contacts.map((pair, at) =>
      at === index ? { ...pair, ...patch } : pair,
    );
    commit({ ...document, contacts, contact: null });
    setContactResult(null);
  };

  const addContactPair = () => {
    const primary = document.body;
    const target = document.contactTarget;
    if (!primary || !target) {
      setMessage("Choose a target body before adding a contact pair.");
      setErrorCode("SIM_CONTACT_UNPAIRED");
      return;
    }
    const pair: SimContactPair = {
      id: simId("contact"),
      name: "Contact pair",
      kind: "bonded",
      bodyId: primary.id,
      targetBodyId: target.id,
      face: "x-max",
      targetFace: "x-min",
      penalty: 10_000,
      gapTolerance: 0.1,
      friction: 0.2,
    };
    commit({
      ...document,
      contacts: [...document.contacts, pair],
      contact: null,
    });
    setContactResult(null);
  };

  const autoBond = () => {
    try {
      const contacts = autoBondTouchingFaces(document);
      commit({ ...document, contacts, contact: null });
      setContactResult(null);
      setMessage(
        `Bonded ${contacts.length} touching face pair${contacts.length === 1 ? "" : "s"}.`,
      );
      setErrorCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Auto-bond failed.");
      setErrorCode(
        error instanceof Error && "code" in error
          ? String(error.code)
          : "SIM_CONTACT_PROXIMITY",
      );
    }
  };

  const setContactTarget = (id: string) => {
    const body = bodies.find((entry) => entry.id === id) ?? null;
    commit(
      contactTargetBody(
        document,
        body
          ? { id: body.id, name: body.name, triangles: body.triangles }
          : null,
      ),
    );
    setContactResult(null);
  };

  const downloadReport = () => {
    const html = buildSimulationReport(document);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.name.trim() || "simulation"}-report.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const addMaterial = (index: number) => {
    const nextMaterial = materialFromPreset(index);
    if (!nextMaterial) return;
    const next = {
      ...document,
      materials: [...document.materials, nextMaterial],
      materialId: nextMaterial.id,
      assignments: mesh
        ? [
            ...document.assignments.filter(
              (entry) => entry.bodyId !== mesh.bodyId,
            ),
            { bodyId: mesh.bodyId, materialId: nextMaterial.id },
          ]
        : document.assignments,
    };
    commit(next);
    setSelectedMaterialId(nextMaterial.id);
  };

  const updateMaterial = (patch: Partial<SimMaterial>) => {
    if (!material) return;
    commit(updateSimMaterial(document, { ...material, ...patch }));
  };

  const assignMaterial = (id: string) => {
    setSelectedMaterialId(id);
    if (!mesh) {
      commit({ ...document, materialId: id });
      return;
    }
    commit(assignSimMaterial(document, mesh.bodyId, id));
  };

  const meshIssues = issues.filter((issue) =>
    ["SIM_MESH", "SIM_ELEMENT", "SIM_CELL", "SIM_SELECTION"].some((prefix) =>
      issue.code.startsWith(prefix),
    ),
  );

  return (
    <div
      className="cad-studio-light absolute inset-0 z-20 flex min-h-0 w-full bg-gray-950 text-gray-100"
      data-testid="simulation-studio-workspace"
    >
      <aside className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/60 p-3">
        <div className="mb-4">
          <div className="text-sm font-semibold">Simulation Studio</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Boundary-conforming TET4 · {document.units}
          </div>
        </div>
        <div className="space-y-1">
          {(
            [
              ["mesh", "Mesh"],
              ["materials", "Materials"],
              ["loads", "Fixtures & loads"],
              ["thermal", "Thermal"],
              ["contacts", "Contacts"],
              ["results", "Results"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-label={`Show ${label} section`}
              onClick={() => setSection(id)}
              className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                section === id
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded border border-gray-800 bg-gray-950/70 p-2 text-[11px]">
          <div className="text-gray-400">Case</div>
          <div className="mt-1 text-gray-200">{document.name}</div>
          <div className="mt-2 text-gray-500">
            {mesh ? `${mesh.elements.length} elements` : "No volume mesh"}
          </div>
          {errorCode && (
            <div className="mt-2 rounded bg-red-950/60 px-1.5 py-1 text-red-300">
              {errorCode}
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={loadDemo}
            disabled={readOnly}
            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-blue-500 disabled:opacity-40"
          >
            Demo bracket
          </button>
          <button
            aria-label={meshing ? "Generating mesh" : "Generate mesh"}
            onClick={() => void runMesher()}
            disabled={readOnly || meshing}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {meshing ? "Meshing…" : "Generate mesh"}
          </button>
          <button
            onClick={runStatic}
            disabled={readOnly || !mesh}
            className="rounded border border-emerald-700 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-500 disabled:opacity-40"
          >
            Static solve
          </button>
          <button
            onClick={runModal}
            disabled={readOnly || !mesh}
            className="rounded border border-violet-700 bg-violet-950/40 px-3 py-1 text-xs text-violet-200 hover:border-violet-500 disabled:opacity-40"
          >
            Modal solve
          </button>
          <button
            onClick={runThermal}
            disabled={readOnly || !mesh}
            className="rounded border border-cyan-700 bg-cyan-950/40 px-3 py-1 text-xs text-cyan-200 hover:border-cyan-500 disabled:opacity-40"
          >
            Thermal solve
          </button>
          <button
            onClick={runBuckling}
            disabled={readOnly || !mesh}
            className="rounded border border-orange-700 bg-orange-950/40 px-3 py-1 text-xs text-orange-200 hover:border-orange-500 disabled:opacity-40"
          >
            Buckling solve
          </button>
        </div>
        {message && (
          <div className="mb-4 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-300">
            {message}
          </div>
        )}

        {section === "mesh" && (
          <div className="grid max-w-4xl gap-4 md:grid-cols-2">
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Source body
              </h3>
              <Field label="Body">
                <select
                  aria-label="Source body"
                  value={selectedBodyId}
                  onChange={(event) => selectBody(event.target.value)}
                  className={inputClass()}
                >
                  {bodies.length === 0 && <option value="">Demo only</option>}
                  {bodies.map((body) => (
                    <option key={body.id} value={body.id}>
                      {body.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="mt-2 text-[11px] text-gray-500">
                Uses the body's closed triangle shell; Gmsh generates a
                boundary-conforming TET4 mesh. Open or non-manifold shells are
                rejected by name.
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Field label="Cell size">
                  <NumberInput
                    value={document.settings.cellSize}
                    step={0.5}
                    disabled={readOnly}
                    onChange={(cellSize) =>
                      commit({
                        ...document,
                        settings: { ...document.settings, cellSize },
                        mesh: null,
                        result: null,
                        modal: null,
                      })
                    }
                  />
                </Field>
                <Field label="Max elements">
                  <NumberInput
                    value={document.settings.maxElements}
                    step={500}
                    disabled={readOnly}
                    onChange={(maxElements) =>
                      commit({
                        ...document,
                        settings: { ...document.settings, maxElements },
                        mesh: null,
                        result: null,
                        modal: null,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Minimum quality">
                  <NumberInput
                    value={document.settings.minQuality}
                    step={0.05}
                    disabled={readOnly}
                    onChange={(minQuality) =>
                      commit({
                        ...document,
                        settings: { ...document.settings, minQuality },
                        mesh: null,
                        result: null,
                        modal: null,
                      })
                    }
                  />
                </Field>
                <Field label="Modal modes (1–15)">
                  <NumberInput
                    value={document.modalModes}
                    disabled={readOnly}
                    onChange={(modalModes) =>
                      commit({ ...document, modalModes, modal: null })
                    }
                  />
                </Field>
              </div>
            </section>

            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Mesh diagnostics
              </h3>
              {mesh ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-gray-500">Body</dt>
                  <dd>{mesh.bodyName}</dd>
                  <dt className="text-gray-500">Nodes</dt>
                  <dd>{mesh.nodes.length}</dd>
                  <dt className="text-gray-500">Tetrahedra</dt>
                  <dd>{mesh.elements.length}</dd>
                  <dt className="text-gray-500">Volume</dt>
                  <dd>
                    {mesh.volume.toFixed(1)} {document.units}³
                  </dd>
                  <dt className="text-gray-500">Min quality</dt>
                  <dd>{mesh.minQuality.toFixed(2)}</dd>
                  <dt className="text-gray-500">Open edges</dt>
                  <dd>{mesh.openEdges}</dd>
                  <dt className="text-gray-500">Non-manifold</dt>
                  <dd>{mesh.nonManifoldEdges}</dd>
                  <dt className="text-gray-500">Cell</dt>
                  <dd>
                    {mesh.cellSize.toFixed(2)} {document.units}
                  </dd>
                </dl>
              ) : (
                <div className="text-[11px] text-gray-500">
                  Generate a mesh to inspect node/element counts and shell
                  diagnostics.
                </div>
              )}
              {meshIssues.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11px] text-amber-300">
                  {meshIssues.map((issue) => (
                    <li key={`${issue.code}:${issue.path}`}>
                      {issue.code}: {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {section === "materials" && material && (
          <div className="max-w-3xl space-y-4">
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-3 flex items-end gap-2">
                <Field label="Material">
                  <select
                    aria-label="Material"
                    value={selectedMaterialId}
                    onChange={(event) => assignMaterial(event.target.value)}
                    className={inputClass()}
                  >
                    {document.materials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {document.contactTarget && (
                  <Field label="Target material">
                    <select
                      aria-label="Target material"
                      value={
                        materialForBody(document, document.contactTarget.id)
                          ?.id ?? document.materialId
                      }
                      onChange={(event) =>
                        commit(
                          assignSimMaterial(
                            document,
                            document.contactTarget!.id,
                            event.target.value,
                          ),
                        )
                      }
                      className={inputClass()}
                    >
                      {document.materials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <select
                  aria-label="Add material from library"
                  className={inputClass()}
                  defaultValue=""
                  onChange={(event) => {
                    const index = Number(event.target.value);
                    if (Number.isInteger(index)) addMaterial(index);
                    event.target.value = "";
                  }}
                >
                  <option value="">Add from library…</option>
                  {SIM_MATERIAL_LIBRARY.map((item, index) => (
                    <option key={item.name} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Name">
                  <input
                    aria-label="Material name"
                    value={material.name}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateMaterial({ name: event.target.value })
                    }
                    className={inputClass()}
                  />
                </Field>
                <Field label="Density (kg/m³)">
                  <NumberInput
                    value={material.density}
                    disabled={readOnly}
                    onChange={(density) => updateMaterial({ density })}
                  />
                </Field>
                <Field label="Young's modulus (MPa)">
                  <NumberInput
                    value={material.young}
                    step={1000}
                    disabled={readOnly}
                    onChange={(young) => updateMaterial({ young })}
                  />
                </Field>
                <Field label="Poisson's ratio">
                  <NumberInput
                    value={material.poisson}
                    step={0.01}
                    disabled={readOnly}
                    onChange={(poisson) => updateMaterial({ poisson })}
                  />
                </Field>
                <Field label="Yield strength (MPa)">
                  <NumberInput
                    value={material.yield}
                    disabled={readOnly}
                    onChange={(yieldStrength) =>
                      updateMaterial({ yield: yieldStrength })
                    }
                  />
                </Field>
                <Field label="CTE (1/K)">
                  <NumberInput
                    value={material.cte}
                    step={1e-6}
                    disabled={readOnly}
                    onChange={(cte) => updateMaterial({ cte })}
                  />
                </Field>
              </div>
              <div className="mt-3 text-[11px] text-gray-500">
                Material values stay in SI here; the mesh and selections use
                document units. Yield is reported as a reference, not a failure
                criterion.
              </div>
            </section>
          </div>
        )}

        {section === "loads" && (
          <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Fixtures
                </h3>
                <button
                  onClick={addFixture}
                  disabled={readOnly}
                  className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 disabled:opacity-40"
                >
                  Add fixture
                </button>
              </div>
              <div className="space-y-2">
                {document.fixtures.map((fixture, index) => (
                  <div
                    key={fixture.id}
                    className="rounded border border-gray-800 bg-gray-950/60 p-2"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        aria-label="Fixture name"
                        value={fixture.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateFixture(index, { name: event.target.value })
                        }
                        className={inputClass()}
                      />
                      <select
                        aria-label="Fixture body"
                        value={fixture.bodyId}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateFixture(index, { bodyId: event.target.value })
                        }
                        className={inputClass()}
                      >
                        {bodies.map((body) => (
                          <option key={body.id} value={body.id}>
                            {body.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={fixture.kind}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateFixture(index, {
                            kind: event.target.value as SimFixtureKind,
                          })
                        }
                        className={inputClass()}
                      >
                        <option value="fixed">Fixed</option>
                        <option value="pinned">Pinned</option>
                        <option value="roller">Roller</option>
                      </select>
                      <div className="col-span-2">
                        <FaceSelect
                          value={fixture.face}
                          disabled={readOnly}
                          onChange={(face) => updateFixture(index, { face })}
                        />
                      </div>
                    </div>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() =>
                          commit({
                            ...document,
                            fixtures: document.fixtures.filter(
                              (_, at) => at !== index,
                            ),
                            result: null,
                            modal: null,
                          })
                        }
                        disabled={readOnly}
                        className="text-[10px] text-gray-500 hover:text-red-400 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {document.fixtures.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    Add a fixture; an unconstrained static case fails by name.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Loads
                </h3>
                <button
                  onClick={addLoad}
                  disabled={readOnly}
                  className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 disabled:opacity-40"
                >
                  Add load
                </button>
              </div>
              <label className="mb-2 flex items-center gap-2 rounded border border-gray-800 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-300">
                <input
                  type="checkbox"
                  aria-label="Enable inertial relief"
                  checked={document.inertialRelief}
                  disabled={readOnly}
                  onChange={(event) => {
                    commit({
                      ...document,
                      inertialRelief: event.target.checked,
                      result: null,
                    });
                    setStaticResult(null);
                  }}
                />
                Inertial relief (balance the load without a fixed part)
              </label>
              <div className="space-y-2">
                {document.loads.map((load, index) => (
                  <div
                    key={load.id}
                    className="rounded border border-gray-800 bg-gray-950/60 p-2"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        aria-label="Load name"
                        value={load.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateLoad(index, { name: event.target.value })
                        }
                        className={inputClass()}
                      />
                      <select
                        aria-label="Load body"
                        value={load.bodyId}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateLoad(index, { bodyId: event.target.value })
                        }
                        className={inputClass()}
                      >
                        {bodies.map((body) => (
                          <option key={body.id} value={body.id}>
                            {body.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={load.kind}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateLoad(index, {
                            kind: event.target.value as SimLoadKind,
                          })
                        }
                        className={inputClass()}
                      >
                        <option value="force">Force</option>
                        <option value="moment">Moment</option>
                        <option value="bearing">Bearing</option>
                        <option value="pressure">Pressure</option>
                        <option value="gravity">Gravity</option>
                        <option value="acceleration">Acceleration</option>
                        <option value="angular-velocity">
                          Angular velocity
                        </option>
                        <option value="thermal">Thermal</option>
                        <option value="remote">Remote force</option>
                      </select>
                      {(load.kind === "force" || load.kind === "moment") && (
                        <select
                          aria-label="Load region"
                          value={load.region ?? "face"}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateLoad(index, {
                              region: event.target.value as "face" | "body",
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="face">Face region</option>
                          <option value="body">Whole body</option>
                        </select>
                      )}
                      <div className="col-span-2">
                        <FaceSelect
                          value={load.face}
                          disabled={readOnly}
                          onChange={(face) => updateLoad(index, { face })}
                        />
                      </div>
                      {(load.kind === "force" ||
                        load.kind === "moment" ||
                        load.kind === "bearing" ||
                        load.kind === "acceleration" ||
                        load.kind === "angular-velocity" ||
                        load.kind === "remote") && (
                        <div className="col-span-2">
                          <div className="mb-1 text-[10px] text-gray-500">
                            {load.kind === "moment"
                              ? "Moment vector (N·m)"
                              : load.kind === "bearing"
                                ? "Bearing force (N)"
                                : load.kind === "acceleration"
                                  ? "Acceleration (m/s²)"
                                  : load.kind === "angular-velocity"
                                    ? "Angular velocity (rad/s)"
                                    : "Force vector (N)"}
                          </div>
                          <VecInput
                            value={load.vector}
                            disabled={readOnly}
                            onChange={(vector) => updateLoad(index, { vector })}
                          />
                        </div>
                      )}
                      {load.kind === "pressure" && (
                        <div className="col-span-2">
                          <Field label="Pressure (Pa)">
                            <NumberInput
                              value={load.magnitude}
                              disabled={readOnly}
                              onChange={(magnitude) =>
                                updateLoad(index, { magnitude })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {load.kind === "gravity" && (
                        <div className="col-span-2">
                          <Field label="Acceleration (m/s²)">
                            <NumberInput
                              value={load.magnitude}
                              disabled={readOnly}
                              onChange={(magnitude) =>
                                updateLoad(index, { magnitude })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {load.kind === "thermal" && (
                        <div className="col-span-2">
                          <Field label="Temperature rise (K)">
                            <NumberInput
                              value={load.temperatureDelta}
                              disabled={readOnly}
                              onChange={(temperatureDelta) =>
                                updateLoad(index, { temperatureDelta })
                              }
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() =>
                          commit({
                            ...document,
                            loads: document.loads.filter(
                              (_, at) => at !== index,
                            ),
                            result: null,
                            modal: null,
                          })
                        }
                        disabled={readOnly}
                        className="text-[10px] text-gray-500 hover:text-red-400 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {document.loads.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    Add a force, pressure, gravity, thermal or remote load.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {section === "thermal" && (
          <div className="max-w-5xl space-y-4">
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Thermal boundaries
                </h3>
                <div className="ml-auto flex flex-wrap gap-1">
                  {(
                    [
                      ["temperature", "Fixed temperature"],
                      ["heat-flux", "Heat flux"],
                      ["convection", "Convection"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      onClick={() => addThermalBoundary(kind)}
                      disabled={readOnly}
                      className="rounded border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 disabled:opacity-40"
                    >
                      Add {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {document.thermalBoundaries.map((boundary, index) => (
                  <div
                    key={boundary.id}
                    className="rounded border border-gray-800 bg-gray-950/60 p-2"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        aria-label="Thermal boundary name"
                        value={boundary.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateThermalBoundary(index, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                      <select
                        aria-label="Thermal boundary kind"
                        value={boundary.kind}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateThermalBoundary(index, {
                            kind: event.target.value as SimThermalBoundaryKind,
                          })
                        }
                        className={inputClass()}
                      >
                        <option value="temperature">Fixed temperature</option>
                        <option value="heat-flux">Heat flux</option>
                        <option value="convection">Convection</option>
                      </select>
                      <div className="col-span-2">
                        <FaceSelect
                          value={boundary.face}
                          disabled={readOnly}
                          onChange={(face) =>
                            updateThermalBoundary(index, { face })
                          }
                        />
                      </div>
                      <Field
                        label={
                          boundary.kind === "temperature"
                            ? "Temperature (°C)"
                            : boundary.kind === "heat-flux"
                              ? "Heat flux (W/m²)"
                              : "Ambient (°C)"
                        }
                      >
                        <NumberInput
                          value={boundary.value}
                          disabled={readOnly}
                          onChange={(value) =>
                            updateThermalBoundary(index, { value })
                          }
                        />
                      </Field>
                      {boundary.kind === "convection" && (
                        <Field label="Coefficient (W/m²K)">
                          <NumberInput
                            value={boundary.coefficient}
                            disabled={readOnly}
                            onChange={(coefficient) =>
                              updateThermalBoundary(index, { coefficient })
                            }
                          />
                        </Field>
                      )}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() => {
                          commit({
                            ...document,
                            thermalBoundaries:
                              document.thermalBoundaries.filter(
                                (_, at) => at !== index,
                              ),
                            thermal: null,
                          });
                          setThermalResult(null);
                        }}
                        disabled={readOnly}
                        className="text-[10px] text-gray-500 hover:text-red-400 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {document.thermalBoundaries.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    Add a fixed temperature, heat flux or convection boundary.
                  </div>
                )}
              </div>
            </section>
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3 text-[11px] text-gray-500">
              Steady-state TET4 conduction uses the material conductivity in
              W/(m K). Heat flux is positive into the body; convection uses
              ambient temperature and h in W/(m²K). At least one fixed
              temperature or convection boundary is required for an absolute
              temperature.
            </section>
          </div>
        )}

        {section === "contacts" && (
          <div className="max-w-5xl space-y-4">
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <Field label="Target body">
                  <select
                    aria-label="Contact target body"
                    value={document.contactTarget?.id ?? ""}
                    disabled={readOnly}
                    onChange={(event) => setContactTarget(event.target.value)}
                    className={inputClass()}
                  >
                    <option value="">No target</option>
                    {bodies
                      .filter((body) => body.id !== document.body?.id)
                      .map((body) => (
                        <option key={body.id} value={body.id}>
                          {body.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <button
                  onClick={addContactPair}
                  disabled={readOnly || !document.contactTarget}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 disabled:opacity-40"
                >
                  Add contact pair
                </button>
                <button
                  type="button"
                  aria-label="Bond touching faces"
                  onClick={autoBond}
                  disabled={readOnly || !document.contactTarget}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 disabled:opacity-40"
                >
                  Bond touching faces
                </button>
                <button
                  onClick={runContacts}
                  disabled={
                    readOnly ||
                    !document.contactTarget ||
                    !document.contacts.length
                  }
                  className="rounded border border-emerald-700 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-200 disabled:opacity-40"
                >
                  Check contacts
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Generate mesh meshes both bodies. Check contacts reports the
                uncoupled shell gap; Static solve performs the coupled two-body
                penalty solve with both meshes, target constraints and target
                material included in the combined system.
              </div>
            </section>
            <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Contact pairs
              </h3>
              <div className="space-y-2">
                {document.contacts.map((pair, index) => (
                  <div
                    key={pair.id}
                    className="rounded border border-gray-800 bg-gray-950/60 p-2"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        aria-label="Contact name"
                        value={pair.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateContact(index, { name: event.target.value })
                        }
                        className={inputClass()}
                      />
                      <select
                        aria-label="Contact kind"
                        value={pair.kind}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateContact(index, {
                            kind: event.target.value as SimContactKind,
                          })
                        }
                        className={inputClass()}
                      >
                        <option value="bonded">Bonded</option>
                        <option value="sliding">Sliding</option>
                        <option value="separating">Separating</option>
                      </select>
                      <div className="col-span-2">
                        <FaceSelect
                          value={pair.face}
                          disabled={readOnly}
                          onChange={(face) => updateContact(index, { face })}
                        />
                      </div>
                      <div className="col-span-2">
                        <FaceSelect
                          value={pair.targetFace}
                          disabled={readOnly}
                          onChange={(targetFace) =>
                            updateContact(index, { targetFace })
                          }
                        />
                      </div>
                      <Field label="Penalty (N/mm)">
                        <NumberInput
                          value={pair.penalty}
                          step={1000}
                          disabled={readOnly}
                          onChange={(penalty) =>
                            updateContact(index, { penalty })
                          }
                        />
                      </Field>
                      <Field label={`Gap tolerance (${document.units})`}>
                        <NumberInput
                          value={pair.gapTolerance}
                          step={0.01}
                          disabled={readOnly}
                          onChange={(gapTolerance) =>
                            updateContact(index, { gapTolerance })
                          }
                        />
                      </Field>
                      {pair.kind === "separating" && (
                        <Field label="Friction coefficient">
                          <NumberInput
                            value={pair.friction}
                            step={0.05}
                            disabled={readOnly}
                            onChange={(friction) =>
                              updateContact(index, { friction })
                            }
                          />
                        </Field>
                      )}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() => {
                          commit({
                            ...document,
                            contacts: document.contacts.filter(
                              (_, at) => at !== index,
                            ),
                            contact: null,
                          });
                          setContactResult(null);
                        }}
                        disabled={readOnly}
                        className="text-[10px] text-gray-500 hover:text-red-400 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {document.contacts.length === 0 && (
                  <div className="text-[11px] text-gray-500">
                    Select a target body and add a pair. Self-contacting and
                    unpaired selections fail by name.
                  </div>
                )}
              </div>
            </section>
            {contactResult && (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Contact status
                </h3>
                <div className="mb-2 flex flex-wrap gap-3 text-xs">
                  <span>{contactResult.bonded} bonded</span>
                  <span>{contactResult.sliding} sliding</span>
                  <span>{contactResult.separating} separating</span>
                  <span>{contactResult.sticking} sticking</span>
                  <span>{contactResult.open} open</span>
                  <span>
                    min gap {contactResult.minGap.toFixed(3)} {document.units}
                  </span>
                </div>
                {contactResult.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex flex-wrap gap-3 border-t border-gray-800 py-1 text-[11px] text-gray-300"
                  >
                    <span>{finding.name}</span>
                    <span className="text-gray-500">
                      gap {finding.gap.toFixed(3)} {document.units}
                    </span>
                    <span>{finding.status}</span>
                    <span className="text-gray-500">
                      penalty {finding.penaltyForceN.toFixed(2)} N
                    </span>
                    {finding.frictionForceN !== undefined && (
                      <span className="text-gray-500">
                        friction {finding.frictionForceN.toFixed(2)} N
                      </span>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {section === "results" && (
          <div className="max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Case results</h2>
              <span className="text-[11px] text-gray-500">
                {mesh
                  ? `${mesh.nodes.length} nodes · ${mesh.elements.length} elements · ${document.units}`
                  : "No mesh"}
              </span>
              <button
                onClick={downloadReport}
                disabled={readOnly}
                className="ml-auto rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-200 disabled:opacity-40"
              >
                Export report
              </button>
            </div>
            {mesh &&
              (staticResult ||
                thermalResult ||
                modalResult ||
                bucklingResult) && (
                <SimulationResultView
                  mesh={mesh}
                  targetMesh={document.targetMesh}
                  units={document.units}
                  staticResult={staticResult}
                  targetResult={staticResult?.target ?? null}
                  thermalResult={thermalResult}
                  modalResult={modalResult}
                  bucklingResult={bucklingResult}
                />
              )}
            {staticResult ? (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Linear static
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Max displacement
                    </div>
                    <div>
                      {(staticResult.maxDisplacementM * 1000).toFixed(4)} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Max von Mises
                    </div>
                    <div>
                      {(staticResult.maxVonMisesPa / 1e6).toFixed(3)} MPa
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Principal range
                    </div>
                    <div>
                      {(staticResult.minPrincipalPa / 1e6).toFixed(2)} /{" "}
                      {(staticResult.maxPrincipalPa / 1e6).toFixed(2)} MPa
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Max equivalent strain
                    </div>
                    <div>
                      {(staticResult.maxEquivalentStrain ?? 0).toExponential(3)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Minimum safety factor
                    </div>
                    <div>{(staticResult.minSafetyFactor ?? 0).toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Max reaction
                    </div>
                    <div>{(staticResult.maxReactionN ?? 0).toFixed(2)} N</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Solve</div>
                    <div>
                      {staticResult.solveMs.toFixed(1)} ms ·{" "}
                      {staticResult.iterations} CG
                    </div>
                  </div>
                </div>
                {staticResult.inertialRelief && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    Inertial relief:{" "}
                    {Math.hypot(
                      staticResult.inertialRelief.accelerationMps2.x,
                      staticResult.inertialRelief.accelerationMps2.y,
                      staticResult.inertialRelief.accelerationMps2.z,
                    ).toFixed(4)}{" "}
                    m/s² · {staticResult.inertialRelief.supportNodes.length}{" "}
                    support nodes
                  </div>
                )}
                <div className="mt-2 text-[11px] text-gray-500">
                  {staticResult.vonMisesPa.length} element stress values;{" "}
                  {staticResult.reactionsN.length} reaction nodes. Stress is
                  linear-elastic; contact is included when contact pairs are
                  active.
                </div>
              </section>
            ) : !modalResult &&
              !thermalResult &&
              !bucklingResult &&
              !contactResult ? (
              <div className="rounded border border-gray-800 bg-gray-900/50 p-3 text-[11px] text-gray-500">
                Run a static, modal, thermal, buckling or contact case.
              </div>
            ) : null}
            {modalResult && (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Modes
                </h3>
                <div className="space-y-1 text-xs">
                  {modalResult.modes.map((mode, index) => (
                    <div
                      key={index}
                      className="flex justify-between rounded bg-gray-950/60 px-2 py-1"
                    >
                      <span>
                        {mode.rigid
                          ? `Rigid ${index + 1}`
                          : `Mode ${index + 1}`}
                      </span>
                      <span>
                        {mode.rigid
                          ? "rigid-body motion"
                          : `${mode.frequencyHz.toFixed(2)} Hz`}
                      </span>
                      <span className="text-gray-500">
                        {mode.rigid
                          ? "0 J"
                          : `${(mode.energyJ ?? 0).toExponential(3)} J at 1 mm peak`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {modalResult.solveMs.toFixed(1)} ms · {modalResult.iterations}{" "}
                  CG iterations
                </div>
              </section>
            )}
            {thermalResult && (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Steady-state thermal
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-gray-500">Minimum</div>
                    <div>{thermalResult.minTemperatureC.toFixed(2)} °C</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Maximum</div>
                    <div>{thermalResult.maxTemperatureC.toFixed(2)} °C</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">
                      Applied flux
                    </div>
                    <div>{thermalResult.appliedHeatFluxW.toFixed(2)} W</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500">Solve</div>
                    <div>
                      {thermalResult.solveMs.toFixed(1)} ms ·{" "}
                      {thermalResult.iterations} CG
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {thermalResult.temperaturesC.length} nodal temperatures.
                </div>
              </section>
            )}
            {bucklingResult && (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Linear buckling
                </h3>
                <div className="space-y-1 text-xs">
                  {bucklingResult.modes.map((mode, index) => (
                    <div
                      key={index}
                      className="flex justify-between rounded bg-gray-950/60 px-2 py-1"
                    >
                      <span>Mode {index + 1}</span>
                      <span>× {mode.multiplier.toFixed(4)} reference load</span>
                      <span className="text-gray-500">
                        {mode.shape.length} DOF shape
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {bucklingResult.solveMs.toFixed(1)} ms ·{" "}
                  {bucklingResult.iterations} CG iterations. Multipliers are
                  relative to the current preloaded static case.
                </div>
              </section>
            )}
            {contactResult && (
              <section className="rounded border border-gray-800 bg-gray-900/50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Contacts
                </h3>
                <div className="mb-2 flex flex-wrap gap-3 text-xs">
                  <span>{contactResult.bonded} bonded</span>
                  <span>{contactResult.sliding} sliding</span>
                  <span>{contactResult.separating} separating</span>
                  <span>{contactResult.sticking} sticking</span>
                  <span>{contactResult.open} open</span>
                  <span>{contactResult.solveMs.toFixed(1)} ms</span>
                </div>
                {contactResult.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex flex-wrap gap-3 border-t border-gray-800 py-1 text-[11px] text-gray-300"
                  >
                    <span>{finding.name}</span>
                    <span>{finding.status}</span>
                    <span className="text-gray-500">
                      gap {finding.gap.toFixed(3)} {document.units} · penalty{" "}
                      {finding.penaltyForceN.toFixed(2)} N
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <div className="mt-4 max-w-4xl rounded border border-amber-900/60 bg-amber-950/20 p-3">
            <div className="text-[11px] font-medium text-amber-300">
              Validation
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/80">
              {issues.slice(0, 8).map((issue) => (
                <li key={`${issue.code}:${issue.path}`}>
                  {issue.code} · {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
};
