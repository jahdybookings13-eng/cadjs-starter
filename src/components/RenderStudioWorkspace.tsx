import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCadVisualizer } from "@vitekk02/cadjs/react";
import {
  RENDER_MATERIAL_LIBRARY,
  RENDER_MAX_DIMENSION,
  RENDER_SIZE_PRESETS,
  assignRenderMaterial,
  createRenderDemo,
  emptyRenderCamera,
  emptyRenderLight,
  renderId,
  renderMaterialFromPreset,
  renderStudioImage,
  validateRenderDocument,
  type RenderCamera,
  type RenderDocument,
  type RenderFormat,
  type RenderImageResult,
  type RenderLight,
  type RenderLightKind,
  type RenderMaterial,
  type RenderVec3,
} from "../render";

export interface RenderStudioWorkspaceProps {
  document: RenderDocument;
  bodies: ReadonlyArray<{ id: string; name: string }>;
  readOnly?: boolean;
  onChange: (document: RenderDocument) => void;
}

type Section = "materials" | "lights" | "cameras" | "environment" | "render";
type RenderJobStatus = "queued" | "rendering" | "done" | "cancelled" | "error";

interface RenderJob {
  id: string;
  width: number;
  height: number;
  format: RenderFormat;
  status: RenderJobStatus;
  createdAt: number;
  finishedAt?: number;
  result?: RenderImageResult;
  error?: string;
}

function inputClass(): string {
  return "w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500";
}

function formatBytes(value: number | null): string {
  if (value === null) return "n/a";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatMs(value: number): string {
  return value < 1000
    ? `${value.toFixed(0)} ms`
    : `${(value / 1000).toFixed(2)} s`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  step = 0.1,
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

function VecField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: RenderVec3;
  disabled?: boolean;
  onChange: (value: RenderVec3) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-gray-400">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <input
            key={axis}
            aria-label={`${label} ${axis}`}
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
    </div>
  );
}

export const RenderStudioWorkspace: React.FC<RenderStudioWorkspaceProps> = ({
  document,
  bodies,
  readOnly = false,
  onChange,
}) => {
  const [section, setSection] = useState<Section>("materials");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    document.materials[0]?.id ?? null,
  );
  const [selectedLightId, setSelectedLightId] = useState<string | null>(
    document.lights[0]?.id ?? null,
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(
    document.activeCameraId || (document.cameras[0]?.id ?? null),
  );
  const [message, setMessage] = useState("");
  const [renderError, setRenderError] = useState("");
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RenderImageResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const jobSeq = useRef(0);
  const documentRef = useRef(document);
  const bodiesRef = useRef(bodies);
  const { scene, camera, renderer } = useCadVisualizer();
  const sceneRef = useRef(scene);
  const rendererRef = useRef(renderer);
  documentRef.current = document;
  bodiesRef.current = bodies;
  sceneRef.current = scene;
  rendererRef.current = renderer;

  useEffect(() => {
    if (!document.materials.some((item) => item.id === selectedMaterialId)) {
      setSelectedMaterialId(document.materials[0]?.id ?? null);
    }
    if (!document.lights.some((item) => item.id === selectedLightId)) {
      setSelectedLightId(document.lights[0]?.id ?? null);
    }
    if (!document.cameras.some((item) => item.id === selectedCameraId)) {
      setSelectedCameraId(
        document.activeCameraId || (document.cameras[0]?.id ?? null),
      );
    }
  }, [
    document.materials,
    document.lights,
    document.cameras,
    document.activeCameraId,
    selectedMaterialId,
    selectedLightId,
    selectedCameraId,
  ]);

  const issues = useMemo(
    () =>
      validateRenderDocument(document, {
        bodyIds: bodies.map((body) => body.id),
      }),
    [document, bodies],
  );
  const activeRenderCamera = useMemo(
    () =>
      document.cameras.find((item) => item.id === document.activeCameraId) ??
      document.cameras[0] ??
      null,
    [document.cameras, document.activeCameraId],
  );
  const renderDisabledReason = readOnly
    ? "View only"
    : !scene
      ? "Scene is not ready"
      : !camera
        ? "Camera is not ready"
        : !renderer
          ? "Renderer is not ready"
          : !activeRenderCamera
            ? "Add a camera first"
            : activeJobId
              ? "Rendering…"
              : "";
  const activeJob = jobs.find((job) => job.id === activeJobId) ?? null;
  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const selectedMaterial =
    document.materials.find((item) => item.id === selectedMaterialId) ?? null;
  const selectedLight =
    document.lights.find((item) => item.id === selectedLightId) ?? null;
  const selectedCamera =
    document.cameras.find((item) => item.id === selectedCameraId) ?? null;
  const rendering = Boolean(activeJobId);
  const renderUrl = lastResult?.dataUrl ?? null;
  const renderResult = lastResult;

  const commit = (next: RenderDocument) => {
    if (!readOnly) onChange(next);
  };
  const updateMaterial = (id: string, patch: Partial<RenderMaterial>) =>
    commit({
      ...document,
      materials: document.materials.map((material) =>
        material.id === id ? { ...material, ...patch } : material,
      ),
    });
  const updateLight = (id: string, patch: Partial<RenderLight>) =>
    commit({
      ...document,
      lights: document.lights.map((light) =>
        light.id === id ? { ...light, ...patch } : light,
      ),
    });
  const updateCamera = (id: string, patch: Partial<RenderCamera>) =>
    commit({
      ...document,
      cameras: document.cameras.map((camera) =>
        camera.id === id ? { ...camera, ...patch } : camera,
      ),
    });
  const addMaterial = (index: number) => {
    const material = renderMaterialFromPreset(index);
    if (!material) return;
    commit({ ...document, materials: [...document.materials, material] });
    setSelectedMaterialId(material.id);
  };
  const addLight = (kind: RenderLightKind) => {
    const light = emptyRenderLight(
      kind === "sun"
        ? "Sun"
        : `${kind[0]!.toUpperCase()}${kind.slice(1)} light`,
      kind,
    );
    commit({ ...document, lights: [...document.lights, light] });
    setSelectedLightId(light.id);
  };
  const addCamera = (projection: "perspective" | "orthographic") => {
    const camera = emptyRenderCamera(
      projection === "orthographic" ? "Orthographic" : "Perspective",
    );
    const next = { ...camera, projection };
    commit({ ...document, cameras: [...document.cameras, next] });
    setSelectedCameraId(next.id);
  };
  const assign = (bodyId: string, materialId: string) => {
    try {
      commit(assignRenderMaterial(document, bodyId, materialId));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const updateOutput = (patch: Partial<RenderDocument["output"]>) =>
    commit({ ...document, output: { ...document.output, ...patch } });
  const choosePreset = (value: string) => {
    const preset = RENDER_SIZE_PRESETS.find((item) => item.id === value);
    if (!preset) {
      updateOutput({ preset: "custom" });
      return;
    }
    updateOutput({
      preset: preset.id,
      width: preset.width,
      height: preset.height,
    });
  };
  const enqueueRender = () => {
    if (readOnly || activeJobId) return;
    jobSeq.current += 1;
    const output = document.output;
    const job: RenderJob = {
      id: `render_${Date.now().toString(36)}_${jobSeq.current}`,
      width: output.width,
      height: output.height,
      format: output.format,
      status: "queued",
      createdAt: Date.now(),
    };
    setJobs((current) => [...current.slice(-7), job]);
    setRenderError("");
  };
  const cancelRender = () => {
    abortRef.current?.abort();
    setJobs((current) =>
      current.map((job) =>
        job.status === "queued"
          ? { ...job, status: "cancelled", finishedAt: Date.now() }
          : job,
      ),
    );
  };
  const downloadRender = () => {
    if (!lastResult) return;
    const anchor = window.document.createElement("a");
    anchor.href = lastResult.dataUrl;
    anchor.download = lastResult.fileName;
    anchor.click();
  };
  const loadDemo = () => {
    commit(
      createRenderDemo(
        bodies.map((body) => body.id),
        document.name,
      ),
    );
    setRenderError("");
    setMessage(
      "Loaded render demo: three materials, two lights and two cameras.",
    );
  };

  useEffect(() => {
    if (activeJobId || runningRef.current) return;
    const next = jobs.find((job) => job.status === "queued");
    if (!next) return;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveJobId(next.id);
    setRenderError("");
    setJobs((current) =>
      current.map((job) =>
        job.id === next.id ? { ...job, status: "rendering" } : job,
      ),
    );
    void (async () => {
      try {
        const result = await renderStudioImage({
          document: documentRef.current,
          sourceScene: sceneRef.current,
          renderer: rendererRef.current,
          bodyIds: bodiesRef.current.map((body) => body.id),
          signal: controller.signal,
        });
        setLastResult(result);
        setJobs((current) =>
          current.map((job) =>
            job.id === next.id
              ? {
                  ...job,
                  status: "done",
                  result,
                  finishedAt: Date.now(),
                }
              : job,
          ),
        );
      } catch (error) {
        const cancelled = controller.signal.aborted;
        const text = error instanceof Error ? error.message : String(error);
        setJobs((current) =>
          current.map((job) =>
            job.id === next.id
              ? {
                  ...job,
                  status: cancelled ? "cancelled" : "error",
                  error: text,
                  finishedAt: Date.now(),
                }
              : job,
          ),
        );
        if (!cancelled) setRenderError(text);
      } finally {
        abortRef.current = null;
        runningRef.current = false;
        setActiveJobId(null);
      }
    })();
  }, [activeJobId, jobs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div
      className="cad-studio-light absolute inset-0 z-20 flex flex-col bg-gray-950 text-gray-200"
      data-testid="render-studio-workspace"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="min-w-0">
          <input
            value={document.name}
            readOnly={readOnly}
            aria-label="Render Studio name"
            onChange={(event) =>
              commit({ ...document, name: event.target.value })
            }
            className="w-64 rounded border border-transparent bg-transparent text-sm font-medium text-gray-100 outline-none hover:border-gray-700 focus:border-blue-500"
          />
          <div className="text-[11px] text-gray-500">
            Render Studio · {document.materials.length} material(s) ·{" "}
            {document.lights.length} light(s) · {document.cameras.length}{" "}
            camera(s) · {document.output.width}×{document.output.height}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span
            className={`rounded px-2 py-1 ${
              issues.length
                ? "bg-red-950 text-red-300"
                : "bg-emerald-950 text-emerald-300"
            }`}
          >
            {issues.length ? `${issues.length} issue(s)` : "Ready"}
          </span>
        </div>
      </div>

      {message && (
        <div className="border-b border-gray-800 bg-gray-900 px-4 py-1 text-[11px] text-amber-300">
          {message}
          <button
            type="button"
            onClick={() => setMessage("")}
            className="ml-2 text-gray-500 hover:text-gray-200"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[420px] flex-none flex-col border-r border-gray-700 bg-gray-900/60">
          <div className="flex border-b border-gray-800">
            {(
              [
                "materials",
                "lights",
                "cameras",
                "environment",
                "render",
              ] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`Show ${value} section`}
                onClick={() => setSection(value)}
                className={`flex-1 px-2 py-2 text-[10px] capitalize ${
                  section === value
                    ? "border-b-2 border-blue-500 text-gray-100"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {section === "materials" && (
              <div className="space-y-3">
                <select
                  defaultValue="0"
                  aria-label="Add material from library"
                  disabled={readOnly}
                  onChange={(event) => {
                    addMaterial(Number(event.target.value));
                    event.currentTarget.value = "0";
                  }}
                  className={inputClass()}
                >
                  {RENDER_MATERIAL_LIBRARY.map((material, index) => (
                    <option key={material.name} value={index}>
                      Add {material.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  {document.materials.map((material) => (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => setSelectedMaterialId(material.id)}
                      className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs ${
                        material.id === selectedMaterialId
                          ? "border-blue-500 bg-blue-950/40 text-gray-100"
                          : "border-gray-800 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded border border-gray-600"
                        style={{ background: material.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {material.name}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {Math.round(material.opacity * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
                {selectedMaterial && (
                  <div className="space-y-2 border-t border-gray-800 pt-2">
                    <Field label="Material name">
                      <input
                        aria-label="Material name"
                        value={selectedMaterial.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateMaterial(selectedMaterial.id, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Base color">
                        <input
                          type="color"
                          aria-label="Material base color"
                          value={selectedMaterial.color}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateMaterial(selectedMaterial.id, {
                              color: event.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-gray-700 bg-gray-800"
                        />
                      </Field>
                      <Field label="Opacity">
                        <NumberInput
                          value={selectedMaterial.opacity}
                          disabled={readOnly}
                          onChange={(opacity) =>
                            updateMaterial(selectedMaterial.id, { opacity })
                          }
                        />
                      </Field>
                      <Field label="Metalness">
                        <NumberInput
                          value={selectedMaterial.metalness}
                          disabled={readOnly}
                          onChange={(metalness) =>
                            updateMaterial(selectedMaterial.id, { metalness })
                          }
                        />
                      </Field>
                      <Field label="Roughness">
                        <NumberInput
                          value={selectedMaterial.roughness}
                          disabled={readOnly}
                          onChange={(roughness) =>
                            updateMaterial(selectedMaterial.id, { roughness })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Texture name">
                      <input
                        value={selectedMaterial.texture?.name ?? ""}
                        disabled={readOnly}
                        placeholder="No texture"
                        onChange={(event) =>
                          updateMaterial(selectedMaterial.id, {
                            texture: event.target.value.trim()
                              ? {
                                  name: event.target.value,
                                  url: selectedMaterial.texture?.url ?? "",
                                }
                              : null,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Texture local/data URL">
                      <input
                        value={selectedMaterial.texture?.url ?? ""}
                        disabled={readOnly}
                        placeholder="data:image/png;base64,… or file path"
                        onChange={(event) =>
                          updateMaterial(selectedMaterial.id, {
                            texture: selectedMaterial.texture
                              ? {
                                  ...selectedMaterial.texture,
                                  url: event.target.value,
                                }
                              : event.target.value.trim()
                                ? { name: "Texture", url: event.target.value }
                                : null,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="border-t border-gray-800 pt-2">
                      <div className="mb-1 text-[11px] text-gray-400">
                        Body assignments
                      </div>
                      {bodies.length === 0 ? (
                        <p className="text-[10px] text-gray-500">
                          No scene bodies are available.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {bodies.map((body) => {
                            const assignment = document.assignments.find(
                              (item) => item.bodyId === body.id,
                            );
                            return (
                              <label
                                key={body.id}
                                className="flex items-center gap-2 text-[10px] text-gray-400"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {body.name}
                                </span>
                                <select
                                  value={assignment?.materialId ?? ""}
                                  disabled={readOnly}
                                  onChange={(event) => {
                                    if (!event.target.value) return;
                                    assign(body.id, event.target.value);
                                  }}
                                  className="w-32 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                                >
                                  <option value="">Unassigned</option>
                                  {document.materials.map((material) => (
                                    <option
                                      key={material.id}
                                      value={material.id}
                                    >
                                      {material.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {section === "lights" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1">
                  {(["directional", "point", "spot", "sun"] as const).map(
                    (kind) => (
                      <button
                        key={kind}
                        type="button"
                        disabled={readOnly}
                        onClick={() => addLight(kind)}
                        className="rounded border border-gray-700 px-1 py-1 text-[10px] capitalize hover:border-gray-500 disabled:opacity-40"
                      >
                        + {kind}
                      </button>
                    ),
                  )}
                </div>
                <div className="space-y-1">
                  {document.lights.map((light) => (
                    <button
                      key={light.id}
                      type="button"
                      onClick={() => setSelectedLightId(light.id)}
                      className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                        light.id === selectedLightId
                          ? "border-blue-500 bg-blue-950/40 text-gray-100"
                          : "border-gray-800 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <span className="block">{light.name}</span>
                      <span className="text-[10px] text-gray-500">
                        {light.kind} · {light.intensity.toFixed(1)}×
                      </span>
                    </button>
                  ))}
                </div>
                {selectedLight && (
                  <div className="space-y-2 border-t border-gray-800 pt-2">
                    <Field label="Light name">
                      <input
                        aria-label="Light name"
                        value={selectedLight.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateLight(selectedLight.id, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Kind">
                        <select
                          value={selectedLight.kind}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateLight(selectedLight.id, {
                              kind: event.target.value as RenderLightKind,
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="directional">Directional</option>
                          <option value="point">Point</option>
                          <option value="spot">Spot</option>
                          <option value="sun">Sun</option>
                        </select>
                      </Field>
                      <Field label="Color">
                        <input
                          type="color"
                          aria-label="Light color"
                          value={selectedLight.color}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateLight(selectedLight.id, {
                              color: event.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-gray-700 bg-gray-800"
                        />
                      </Field>
                      <Field label="Intensity">
                        <NumberInput
                          value={selectedLight.intensity}
                          disabled={readOnly}
                          onChange={(intensity) =>
                            updateLight(selectedLight.id, { intensity })
                          }
                        />
                      </Field>
                      <Field label="Shadows">
                        <input
                          type="checkbox"
                          aria-label="Light shadows"
                          checked={selectedLight.shadows}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateLight(selectedLight.id, {
                              shadows: event.target.checked,
                            })
                          }
                          className="mt-1 h-4 w-4"
                        />
                      </Field>
                    </div>
                    <VecField
                      label="Position"
                      value={selectedLight.position}
                      disabled={readOnly}
                      onChange={(position) =>
                        updateLight(selectedLight.id, { position })
                      }
                    />
                    <VecField
                      label="Target"
                      value={selectedLight.target}
                      disabled={readOnly}
                      onChange={(target) =>
                        updateLight(selectedLight.id, { target })
                      }
                    />
                    {selectedLight.kind === "spot" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Cone angle">
                          <NumberInput
                            value={selectedLight.angle}
                            disabled={readOnly}
                            onChange={(angle) =>
                              updateLight(selectedLight.id, { angle })
                            }
                          />
                        </Field>
                        <Field label="Penumbra">
                          <NumberInput
                            value={selectedLight.penumbra}
                            disabled={readOnly}
                            onChange={(penumbra) =>
                              updateLight(selectedLight.id, { penumbra })
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {section === "cameras" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1">
                  {(["perspective", "orthographic"] as const).map(
                    (projection) => (
                      <button
                        key={projection}
                        type="button"
                        disabled={readOnly}
                        onClick={() => addCamera(projection)}
                        className="rounded border border-gray-700 px-1 py-1 text-[10px] capitalize hover:border-gray-500 disabled:opacity-40"
                      >
                        + {projection}
                      </button>
                    ),
                  )}
                </div>
                <div className="space-y-1">
                  {document.cameras.map((camera) => (
                    <button
                      key={camera.id}
                      type="button"
                      onClick={() => setSelectedCameraId(camera.id)}
                      className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                        camera.id === selectedCameraId
                          ? "border-blue-500 bg-blue-950/40 text-gray-100"
                          : "border-gray-800 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {camera.name}
                        </span>
                        {camera.id === document.activeCameraId && (
                          <span className="text-[9px] text-emerald-400">
                            active
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {camera.projection} · {camera.fov}° ·{" "}
                        {camera.bookmarks.length} bookmark(s)
                      </span>
                    </button>
                  ))}
                </div>
                {selectedCamera && (
                  <div className="space-y-2 border-t border-gray-800 pt-2">
                    <Field label="Camera name">
                      <input
                        aria-label="Camera name"
                        value={selectedCamera.name}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateCamera(selectedCamera.id, {
                            name: event.target.value,
                          })
                        }
                        className={inputClass()}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Projection">
                        <select
                          value={selectedCamera.projection}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateCamera(selectedCamera.id, {
                              projection: event.target.value as
                                | "perspective"
                                | "orthographic",
                            })
                          }
                          className={inputClass()}
                        >
                          <option value="perspective">Perspective</option>
                          <option value="orthographic">Orthographic</option>
                        </select>
                      </Field>
                      <Field label="Active">
                        <input
                          type="checkbox"
                          aria-label="Active camera"
                          checked={
                            document.activeCameraId === selectedCamera.id
                          }
                          disabled={readOnly}
                          onChange={(event) => {
                            if (event.target.checked) {
                              commit({
                                ...document,
                                activeCameraId: selectedCamera.id,
                              });
                            }
                          }}
                          className="mt-1 h-4 w-4"
                        />
                      </Field>
                      <Field
                        label={
                          selectedCamera.projection === "perspective"
                            ? "FOV (deg)"
                            : "Focal length (mm)"
                        }
                      >
                        <NumberInput
                          value={
                            selectedCamera.projection === "perspective"
                              ? selectedCamera.fov
                              : selectedCamera.focalLength
                          }
                          disabled={readOnly}
                          onChange={(value) =>
                            updateCamera(
                              selectedCamera.id,
                              selectedCamera.projection === "perspective"
                                ? { fov: value }
                                : { focalLength: value },
                            )
                          }
                        />
                      </Field>
                      <Field label="Far clip">
                        <NumberInput
                          value={selectedCamera.far}
                          disabled={readOnly}
                          onChange={(far) =>
                            updateCamera(selectedCamera.id, { far })
                          }
                        />
                      </Field>
                    </div>
                    <VecField
                      label="Position"
                      value={selectedCamera.position}
                      disabled={readOnly}
                      onChange={(position) =>
                        updateCamera(selectedCamera.id, { position })
                      }
                    />
                    <VecField
                      label="Target"
                      value={selectedCamera.target}
                      disabled={readOnly}
                      onChange={(target) =>
                        updateCamera(selectedCamera.id, { target })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => {
                          const bookmark = {
                            id: renderId("bookmark"),
                            name: `View ${selectedCamera.bookmarks.length + 1}`,
                            position: { ...selectedCamera.position },
                            target: { ...selectedCamera.target },
                          };
                          updateCamera(selectedCamera.id, {
                            bookmarks: [...selectedCamera.bookmarks, bookmark],
                          });
                        }}
                        className="rounded border border-gray-700 px-2 py-1 text-[10px] hover:border-gray-500 disabled:opacity-40"
                      >
                        Add bookmark
                      </button>
                      {selectedCamera.bookmarks.map((bookmark) => (
                        <button
                          key={bookmark.id}
                          type="button"
                          aria-label={`Load bookmark ${bookmark.name}`}
                          disabled={readOnly}
                          onClick={() =>
                            updateCamera(selectedCamera.id, {
                              position: { ...bookmark.position },
                              target: { ...bookmark.target },
                            })
                          }
                          className="rounded border border-gray-800 px-2 py-1 text-[10px] text-gray-400 hover:border-gray-600"
                        >
                          {bookmark.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {section === "environment" && (
              <div className="space-y-2">
                <Field label="Environment">
                  <select
                    value={document.environment.kind}
                    disabled={readOnly}
                    onChange={(event) =>
                      commit({
                        ...document,
                        environment: {
                          ...document.environment,
                          kind: event.target
                            .value as RenderDocument["environment"]["kind"],
                        },
                      })
                    }
                    className={inputClass()}
                  >
                    <option value="studio">Studio</option>
                    <option value="sun">Sun</option>
                    <option value="sky">Sky</option>
                    <option value="none">None</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Exposure">
                    <NumberInput
                      value={document.environment.exposure}
                      disabled={readOnly}
                      onChange={(exposure) =>
                        commit({
                          ...document,
                          environment: { ...document.environment, exposure },
                        })
                      }
                    />
                  </Field>
                  <Field label="Background">
                    <input
                      type="color"
                      aria-label="Environment background color"
                      value={document.environment.background}
                      disabled={readOnly}
                      onChange={(event) =>
                        commit({
                          ...document,
                          environment: {
                            ...document.environment,
                            background: event.target.value,
                          },
                        })
                      }
                      className="h-7 w-full rounded border border-gray-700 bg-gray-800"
                    />
                  </Field>
                  <Field label="Sun azimuth">
                    <NumberInput
                      value={document.environment.sunAzimuth}
                      disabled={readOnly}
                      onChange={(sunAzimuth) =>
                        commit({
                          ...document,
                          environment: {
                            ...document.environment,
                            sunAzimuth,
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Sun elevation">
                    <NumberInput
                      value={document.environment.sunElevation}
                      disabled={readOnly}
                      onChange={(sunElevation) =>
                        commit({
                          ...document,
                          environment: {
                            ...document.environment,
                            sunElevation,
                          },
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Environment intensity">
                  <NumberInput
                    value={document.environment.intensity}
                    disabled={readOnly}
                    onChange={(intensity) =>
                      commit({
                        ...document,
                        environment: { ...document.environment, intensity },
                      })
                    }
                  />
                </Field>
              </div>
            )}

            {section === "render" && (
              <div className="space-y-2">
                <Field label="Size preset">
                  <select
                    aria-label="Render size preset"
                    value={document.output.preset}
                    disabled={readOnly}
                    onChange={(event) => {
                      const preset = RENDER_SIZE_PRESETS.find(
                        (item) => item.id === event.target.value,
                      );
                      updateOutput(
                        preset
                          ? {
                              preset: preset.id,
                              width: preset.width,
                              height: preset.height,
                            }
                          : { preset: "custom" },
                      );
                    }}
                    className={inputClass()}
                  >
                    {RENDER_SIZE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Width (px)">
                    <NumberInput
                      value={document.output.width}
                      disabled={readOnly}
                      step={1}
                      onChange={(width) =>
                        updateOutput({
                          preset: "custom",
                          width: Math.max(
                            16,
                            Math.min(RENDER_MAX_DIMENSION, Math.round(width)),
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Height (px)">
                    <NumberInput
                      value={document.output.height}
                      disabled={readOnly}
                      step={1}
                      onChange={(height) =>
                        updateOutput({
                          preset: "custom",
                          height: Math.max(
                            16,
                            Math.min(RENDER_MAX_DIMENSION, Math.round(height)),
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Format">
                  <select
                    aria-label="Render format"
                    value={document.output.format}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateOutput({
                        format: event.target.value as RenderFormat,
                      })
                    }
                    className={inputClass()}
                  >
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                  </select>
                </Field>
                {document.output.format !== "png" && (
                  <Field label="Quality">
                    <NumberInput
                      value={document.output.quality}
                      disabled={readOnly}
                      step={0.01}
                      onChange={(quality) =>
                        updateOutput({
                          quality: Math.max(0, Math.min(1, quality)),
                        })
                      }
                    />
                  </Field>
                )}
                <p className="text-[10px] text-gray-500">
                  {document.output.width} × {document.output.height} ·{" "}
                  {bodies.length} scene body(s)
                </p>
              </div>
            )}
          </div>

          <div className="max-h-32 overflow-auto border-t border-gray-800 bg-gray-950/80 p-2">
            {issues.length === 0 ? (
              <p className="text-[10px] text-emerald-400">
                Materials, lights and cameras validate.
              </p>
            ) : (
              issues.slice(0, 6).map((issue) => (
                <div
                  key={`${issue.path}-${issue.code}`}
                  className="text-[10px] text-red-300"
                >
                  {issue.path}: {issue.message}
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-auto bg-[var(--cad-bg)] p-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-medium text-gray-200">
                Local render and export
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-400">
                Offscreen-renders {bodies.length} scene body(s) at{" "}
                {document.output.width} × {document.output.height} using the
                document materials, lights and cameras.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="render-studio-demo"
                disabled={readOnly}
                onClick={loadDemo}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-40"
              >
                Load demo
              </button>
              <button
                type="button"
                data-testid="render-studio-render"
                disabled={Boolean(renderDisabledReason)}
                title={
                  renderDisabledReason ||
                  `Render ${document.output.width} × ${document.output.height} ${document.output.format.toUpperCase()}`
                }
                onClick={enqueueRender}
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:border-blue-500 disabled:opacity-40"
              >
                {activeJobId
                  ? "Rendering…"
                  : `Render ${document.output.format.toUpperCase()}`}
              </button>
              {activeJobId && (
                <button
                  type="button"
                  data-testid="render-studio-cancel"
                  onClick={cancelRender}
                  className="rounded border border-red-900 px-3 py-1.5 text-xs text-red-200 hover:border-red-600"
                >
                  Cancel
                </button>
              )}
              {lastResult && (
                <button
                  type="button"
                  data-testid="render-studio-download"
                  onClick={downloadRender}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
                >
                  Download {lastResult.extension.toUpperCase()}
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
            <span>
              {document.output.width} × {document.output.height}
            </span>
            <span>{document.output.format.toUpperCase()}</span>
            <span>
              {activeJob
                ? `${activeJob.status} (${activeJob.width} × ${activeJob.height})`
                : "Idle"}
            </span>
            <span>{queuedJobs} queued</span>
          </div>
          {renderError && (
            <div
              role="alert"
              data-testid="render-studio-error"
              className="mt-3 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300"
            >
              {renderError}
            </div>
          )}
          <div className="mt-4 flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded border border-gray-800 bg-[#f1f3f4]">
            {lastResult ? (
              <img
                data-testid="render-studio-preview"
                src={lastResult.dataUrl}
                alt="Rendered view"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="max-w-md p-6 text-center text-xs text-gray-500">
                No render yet. Set the output and press Render. The renderer
                stages the live scene offscreen, so the editor viewport is not
                resized or captured.
              </div>
            )}
          </div>
          {lastResult && (
            <div
              data-testid="render-studio-meta"
              className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500"
            >
              <span>{lastResult.fileName}</span>
              <span>
                {lastResult.width} × {lastResult.height}
              </span>
              <span>{lastResult.format.toUpperCase()}</span>
              <span>
                {lastResult.bodyCount} body(s) · {lastResult.lightCount}{" "}
                light(s)
              </span>
              <span>prepare {formatMs(lastResult.prepareMs)}</span>
              <span>render {formatMs(lastResult.renderMs)}</span>
              <span>encode {formatMs(lastResult.encodeMs)}</span>
              <span>total {formatMs(lastResult.totalMs)}</span>
              <span>{formatBytes(lastResult.imageBytes)}</span>
              <span>{formatBytes(lastResult.memoryBytes)} readback</span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded border border-gray-800 p-3">
              <div className="text-gray-500">Materials</div>
              <div className="text-2xl text-gray-200">
                {document.materials.length}
              </div>
            </div>
            <div className="rounded border border-gray-800 p-3">
              <div className="text-gray-500">Lights</div>
              <div className="text-2xl text-gray-200">
                {document.lights.length}
              </div>
            </div>
            <div className="rounded border border-gray-800 p-3">
              <div className="text-gray-500">Cameras</div>
              <div className="text-2xl text-gray-200">
                {document.cameras.length}
              </div>
            </div>
          </div>
          <div
            data-testid="render-studio-queue"
            className="mt-4 rounded border border-gray-800 p-3 text-xs"
          >
            <div className="mb-2 flex items-center justify-between text-gray-500">
              <span>Render queue</span>
              <span>{jobs.length} job(s)</span>
            </div>
            {jobs.length === 0 ? (
              <div className="text-gray-600">
                Queue a render to see its status and file here.
              </div>
            ) : (
              <div className="space-y-1">
                {jobs
                  .slice()
                  .reverse()
                  .map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center gap-2 rounded bg-gray-900/60 px-2 py-1"
                    >
                      <span className="capitalize text-gray-300">
                        {job.status}
                      </span>
                      <span className="text-gray-500">
                        {job.width} × {job.height} · {job.format.toUpperCase()}
                      </span>
                      {job.error && (
                        <span className="text-red-300">{job.error}</span>
                      )}
                      {job.result && (
                        <span className="text-gray-500">
                          {job.result.fileName} ·{" "}
                          {formatBytes(job.result.imageBytes)}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default RenderStudioWorkspace;
