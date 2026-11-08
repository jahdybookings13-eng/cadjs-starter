import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { FluxSession } from "../flux/session";
import { allElements } from "../flux/domains/pcb/project";
import {
  PCB_LIBRARY,
  SCADSTUDIO_PCB_NAME,
  addPcbCustomPart,
  addPcbLibraryPart,
  addPcbTrace,
  movePcbPart,
  pcb3dBoxes,
  pcbBom,
  pcbBomCsv,
  pcbFootprint,
  pcbLibrary,
  pcbLibraryPart,
  pcbProjectSummary,
  removePcbPart,
  removePcbTrace,
  runPcbDrc,
  setPcbPinNet,
  updatePcbBoard,
  updatePcbRules,
  type PcbStudioDocument,
  type PcbViolation,
} from "../pcb/model";
import {
  addPcbVia,
  allPads,
  elementSilk,
  netConnectivity,
  padPolygon,
  pcbRatsnest,
  pourRect,
} from "../pcb/layout";
import {
  addSchematicSheet,
  removeSchematicSheet,
  renameSchematicSheet,
} from "../pcb/schematic";
import { checkPcbAssembly, enclosureLid } from "../pcb/assembly";
import { buildFabrication, type PcbFabrication } from "../pcb/fabrication";
import type { SchematicSheet } from "../pcb/types";
import { PcbVirtualMcuTab } from "./PcbVirtualMcuTab";

export interface ScadStudioPcbWorkspaceProps {
  document: PcbStudioDocument;
  session: FluxSession;
  readOnly?: boolean;
  onChange: (document: PcbStudioDocument) => void;
}

type PcbTab =
  | "schematic"
  | "board"
  | "library"
  | "drc"
  | "fab"
  | "3d"
  | "mcu"
  | "assistant";

type ActionResult = { ok: boolean; data?: unknown; error?: string };

function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBytes(name: string, bytes: Uint8Array, mime: string): void {
  const copy = new Uint8Array(bytes);
  const url = URL.createObjectURL(
    new Blob([copy.buffer as ArrayBuffer], { type: mime }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resultText(result: {
  ok: boolean;
  data?: unknown;
  error?: string;
}): string {
  if (!result.ok) return result.error ?? "ScadStudio action failed";
  if (result.data === undefined) return "ok";
  try {
    const text = JSON.stringify(result.data);
    return text.length > 900 ? `${text.slice(0, 897)}…` : text;
  } catch {
    return String(result.data);
  }
}

const Pcb3dPreview: React.FC<{
  doc: PcbStudioDocument;
  showLid: boolean;
  cavityMM: number;
  wallMM: number;
  collisionIds: readonly string[];
}> = ({ doc, showLid, cavityMM, wallMM, collisionIds }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const collisionKey = collisionIds.join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    const width = Math.max(320, host.clientWidth);
    const height = Math.max(300, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080f14");
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 800);
    camera.position.set(0, -22, 155);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(40, -60, 90);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 1.1);
    rim.position.set(-55, 45, 25);
    scene.add(rim);

    const root = new THREE.Group();
    root.rotation.x = -1.12;
    root.rotation.z = -0.42;
    scene.add(root);
    const centerX = doc.board.widthMM / 2;
    const centerY = doc.board.heightMM / 2;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const collided = new Set(
      collisionKey ? collisionKey.split(",").filter(Boolean) : [],
    );

    for (const box of pcb3dBoxes(doc)) {
      const geometry = new THREE.BoxGeometry(box.width, box.depth, box.height);
      const material = new THREE.MeshStandardMaterial({
        color: collided.has(box.id) ? "#ef4444" : box.color,
        roughness: box.id === "board" ? 0.7 : 0.45,
        metalness: box.id === "board" ? 0.05 : 0.3,
      });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.x - centerX, box.y - centerY, box.z);
      if (box.rotationDeg) mesh.rotation.z = (box.rotationDeg * Math.PI) / 180;
      root.add(mesh);
    }

    if (showLid) {
      const lid = enclosureLid(doc, cavityMM, wallMM);
      const lidWidth = lid.max[0] - lid.min[0];
      const lidDepth = lid.max[1] - lid.min[1];
      const lidHeight = lid.max[2] - lid.min[2];
      const geometry = new THREE.BoxGeometry(lidWidth, lidDepth, lidHeight);
      const material = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (lid.min[0] + lid.max[0]) / 2 - centerX,
        (lid.min[1] + lid.max[1]) / 2 - centerY,
        (lid.min[2] + lid.max[2]) / 2,
      );
      root.add(mesh);
    }

    const grid = new THREE.GridHelper(
      Math.max(doc.board.widthMM, doc.board.heightMM) * 1.4,
      18,
      0x1f2937,
      0x111827,
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.1;
    root.add(grid);

    const render = () => renderer.render(scene, camera);
    render();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      root.rotation.z += (event.clientX - lastX) * 0.008;
      root.rotation.x = Math.max(
        -1.55,
        Math.min(-0.35, root.rotation.x + (event.clientY - lastY) * 0.004),
      );
      lastX = event.clientX;
      lastY = event.clientY;
      render();
    };
    const onUp = (event: PointerEvent) => {
      dragging = false;
      renderer.domElement.style.cursor = "grab";
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    const onResize = () => {
      const nextWidth = Math.max(320, host.clientWidth);
      const nextHeight = Math.max(300, host.clientHeight);
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      render();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [doc, showLid, cavityMM, wallMM, collisionKey]);

  return (
    <div
      ref={hostRef}
      data-testid="pcb-3d-preview"
      className="relative h-full min-h-[420px] w-full"
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-amber-300">
          WebGL is unavailable: {error}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[10px] text-gray-400">
        Drag to rotate · board + component solids · real millimetres
      </div>
    </div>
  );
};

const SchematicSheetView: React.FC<{
  doc: PcbStudioDocument;
  sheet: SchematicSheet;
  selected: string | null;
  onSelect: (designator: string) => void;
}> = ({ doc, sheet, selected, onSelect }) => (
  <svg
    viewBox="0 0 300 250"
    className="h-[430px] w-full rounded border border-gray-800 bg-[#071018]"
    role="img"
    aria-label={`Schematic sheet ${sheet.name}`}
  >
    <defs>
      <pattern
        id="pcb-schematic-grid"
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 5 0 L 0 0 0 5"
          fill="none"
          stroke="#102a3b"
          strokeWidth="0.2"
        />
      </pattern>
    </defs>
    <rect width="300" height="250" fill="url(#pcb-schematic-grid)" />
    {sheet.wires.map((wire) => (
      <polyline
        key={wire.id}
        points={wire.points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />
    ))}
    {sheet.junctions.map((junction) => (
      <circle
        key={junction.id}
        cx={junction.x}
        cy={junction.y}
        r="0.85"
        fill="#f8fafc"
      />
    ))}
    {sheet.ports.map((port) => (
      <g key={port.id}>
        <rect
          x={port.x - 9}
          y={port.y - 3.4}
          width="18"
          height="6.8"
          rx="1"
          fill="#0f2f20"
          stroke="#4ade80"
          strokeWidth="0.3"
        />
        <text
          x={port.x}
          y={port.y + 0.9}
          textAnchor="middle"
          fill="#bbf7d0"
          fontSize="2.6"
          fontFamily="monospace"
        >
          {port.name}
        </text>
      </g>
    ))}
    {sheet.symbols.map((symbol) => {
      const part = pcbLibraryPart(symbol.partId, doc);
      const isSelected = selected === symbol.designator;
      return (
        <g
          key={symbol.id}
          className="cursor-pointer"
          onClick={() => onSelect(symbol.designator)}
        >
          <rect
            x={symbol.x - 9}
            y={symbol.y - 11}
            width="18"
            height="22"
            rx="1"
            fill={isSelected ? "#0c4a6e" : "#111827"}
            stroke={isSelected ? "#38bdf8" : "#64748b"}
            strokeWidth={isSelected ? 0.6 : 0.3}
          />
          <text
            x={symbol.x}
            y={symbol.y - 6}
            textAnchor="middle"
            fill="#f8fafc"
            fontSize="2.8"
            fontFamily="monospace"
          >
            {symbol.designator}
          </text>
          <text
            x={symbol.x}
            y={symbol.y - 2.6}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="2"
          >
            {part?.name ?? symbol.partId}
          </text>
          {symbol.pins.map((pin) => {
            const left = pin.x < symbol.x;
            const modelPin = part?.pins.find((entry) => entry.pin === pin.pin);
            const net =
              allElements(doc.project)
                .find((element) => element.designator === symbol.designator)
                ?.pins.find((entry) => entry.pin === pin.pin)?.net ?? "";
            return (
              <g key={pin.pin}>
                <line
                  x1={pin.x}
                  y1={pin.y}
                  x2={pin.x + (left ? 4 : -4)}
                  y2={pin.y}
                  stroke="#94a3b8"
                  strokeWidth="0.3"
                />
                <circle cx={pin.x} cy={pin.y} r="0.55" fill="#f8fafc" />
                <text
                  x={pin.x + (left ? -1.2 : 1.2)}
                  y={pin.y + 0.7}
                  textAnchor={left ? "end" : "start"}
                  fill={net ? "#4ade80" : "#64748b"}
                  fontSize="1.9"
                  fontFamily="monospace"
                >
                  {pin.pin}
                </text>
                {net && (
                  <text
                    x={pin.x + (left ? -4.4 : 4.4)}
                    y={pin.y + 0.7}
                    textAnchor={left ? "end" : "start"}
                    fill="#38bdf8"
                    fontSize="1.8"
                    fontFamily="monospace"
                  >
                    {net}
                  </text>
                )}
                <title>
                  {`${symbol.designator}.${pin.pin} ${modelPin?.name ?? ""} ${net || "unconnected"}`}
                </title>
              </g>
            );
          })}
        </g>
      );
    })}
    {sheet.labels.map((label) => (
      <text
        key={label.id}
        x={label.x}
        y={label.y - 0.8}
        textAnchor="middle"
        fill="#7dd3fc"
        fontSize="1.8"
        fontFamily="monospace"
      >
        {label.net}
      </text>
    ))}
    {sheet.powerPorts.map((port) => (
      <g key={port.id}>
        <circle
          cx={port.x}
          cy={port.y}
          r="2.4"
          fill={port.kind === "gnd" ? "#14532d" : "#7f1d1d"}
          stroke={port.kind === "gnd" ? "#4ade80" : "#f87171"}
          strokeWidth="0.35"
        />
        <text
          x={port.x}
          y={port.y + 5.6}
          textAnchor="middle"
          fill={port.kind === "gnd" ? "#bbf7d0" : "#fecaca"}
          fontSize="2.2"
          fontFamily="monospace"
        >
          {port.net}
        </text>
      </g>
    ))}
  </svg>
);

const BoardCanvas: React.FC<{
  doc: PcbStudioDocument;
  selected: string | null;
  onSelect: (designator: string | null) => void;
  showTop: boolean;
  showBottom: boolean;
  showZones: boolean;
  showRatsnest: boolean;
  showSilk: boolean;
}> = ({
  doc,
  selected,
  onSelect,
  showTop,
  showBottom,
  showZones,
  showRatsnest,
  showSilk,
}) => {
  const pads = useMemo(() => allPads(doc), [doc]);
  const rats = useMemo(() => pcbRatsnest(doc), [doc]);
  const elements = allElements(doc.project);
  const board = doc.board;
  const layerVisible = (layer: string): boolean =>
    layer === "bottom" || layer === "inner1" || layer === "inner2"
      ? showBottom
      : showTop;

  return (
    <svg
      data-testid="scadstudio-pcb-layout"
      viewBox={`-3 -3 ${board.widthMM + 6} ${board.heightMM + 6}`}
      className="h-[470px] w-full rounded border border-gray-800 bg-[#081018]"
      onClick={() => onSelect(null)}
      role="img"
      aria-label="PCB board copper, pads, vias and ratsnest"
    >
      <defs>
        <pattern
          id="scadstudio-pcb-grid"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 5 0 L 0 0 0 5"
            fill="none"
            stroke="#123044"
            strokeWidth="0.18"
          />
        </pattern>
      </defs>
      <rect
        x="0"
        y="0"
        width={board.widthMM}
        height={board.heightMM}
        rx="2"
        fill={board.solderMask}
        opacity="0.78"
      />
      <rect
        x="0"
        y="0"
        width={board.widthMM}
        height={board.heightMM}
        rx="2"
        fill="url(#scadstudio-pcb-grid)"
      />
      {showZones &&
        doc.zones
          .filter((zone) => layerVisible(zone.layer))
          .map((zone) => (
            <polygon
              key={zone.id}
              points={zone.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill={zone.net === "GND" ? "#166534" : "#991b1b"}
              opacity="0.3"
              stroke={zone.net === "GND" ? "#22c55e" : "#ef4444"}
              strokeWidth="0.15"
              strokeDasharray="1 1"
            />
          ))}
      {doc.cutouts.map((cutout) => (
        <polygon
          key={cutout.id}
          points={cutout.points
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="#020617"
          stroke="#f8fafc"
          strokeWidth="0.2"
        />
      ))}
      {pads
        .filter((pad) =>
          pad.layer === "both"
            ? showTop || showBottom
            : pad.layer === "bottom"
              ? showBottom
              : showTop,
        )
        .map((pad) => (
          <polygon
            key={`${pad.designator}.${pad.pin}`}
            points={padPolygon(pad)
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill={pad.layer === "bottom" ? "#60a5fa" : "#fbbf24"}
            opacity="0.9"
          />
        ))}
      {doc.traces
        .filter((trace) => layerVisible(trace.layer))
        .map((trace) => (
          <polyline
            key={trace.id}
            points={trace.points
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke={trace.layer === "bottom" ? "#60a5fa" : "#fbbf24"}
            strokeWidth={trace.widthMM}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.92"
          />
        ))}
      {showRatsnest &&
        rats.map((edge, index) => (
          <line
            key={`${edge.net}-${edge.a.designator}-${edge.a.pin}-${index}`}
            x1={edge.a.x}
            y1={edge.a.y}
            x2={edge.b.x}
            y2={edge.b.y}
            stroke="#64748b"
            strokeWidth="0.12"
            strokeDasharray="0.7 0.7"
          />
        ))}
      {showSilk &&
        elements.map((element) =>
          elementSilk(doc, element).map((polygon, index) => (
            <polygon
              key={`${element.designator}-silk-${index}`}
              points={polygon.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.16"
              opacity="0.75"
            />
          )),
        )}
      {doc.vias.map((via) => (
        <g key={via.id}>
          <circle
            cx={via.x}
            cy={via.y}
            r={via.padMM / 2}
            fill="#a3e635"
            stroke="#365314"
            strokeWidth="0.1"
          />
          <circle cx={via.x} cy={via.y} r={via.drillMM / 2} fill="#081018" />
        </g>
      ))}
      {elements.map((element) => {
        const part = pcbFootprint(element, doc);
        const width = part?.widthMM ?? 6;
        const height = part?.heightMM ?? 4;
        return (
          <g
            key={element.designator}
            transform={`translate(${element.position.x} ${element.position.y}) rotate(${element.rotation})`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(element.designator);
            }}
            className="cursor-pointer"
          >
            <rect
              x={-width / 2}
              y={-height / 2}
              width={width}
              height={height}
              rx="0.5"
              fill={part?.color ?? "#31363d"}
              fillOpacity="0.45"
              stroke={selected === element.designator ? "#f8fafc" : "#0b1117"}
              strokeWidth={selected === element.designator ? 0.45 : 0.2}
            />
            <text
              x="0"
              y="0.8"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="2.2"
              fontFamily="monospace"
            >
              {element.designator}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const ScadStudioPcbWorkspace: React.FC<ScadStudioPcbWorkspaceProps> = ({
  document: pcb,
  session,
  readOnly = false,
  onChange,
}) => {
  const [tab, setTab] = useState<PcbTab>("board");
  // The MCU workbench owns live runtimes. Once opened it stays mounted (merely
  // hidden on other tabs) so switching tabs never stops running firmware.
  const [mcuMounted, setMcuMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [libraryId, setLibraryId] = useState(PCB_LIBRARY[0]!.id);
  const [violations, setViolations] = useState<PcbViolation[] | null>(null);
  const [fab, setFab] = useState<PcbFabrication | null>(null);
  const [assembly, setAssembly] = useState<ReturnType<
    typeof checkPcbAssembly
  > | null>(null);
  const [agentText, setAgentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(
    pcb.schematic.sheets[0]?.id ?? null,
  );
  const [showTop, setShowTop] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showRatsnest, setShowRatsnest] = useState(true);
  const [showSilk, setShowSilk] = useState(true);
  const [showLid, setShowLid] = useState(true);
  const [cavityMM, setCavityMM] = useState("8");
  const [wallMM, setWallMM] = useState("1.5");
  const [traceNet, setTraceNet] = useState("");
  const [traceX1, setTraceX1] = useState("10");
  const [traceY1, setTraceY1] = useState("10");
  const [traceX2, setTraceX2] = useState("30");
  const [traceY2, setTraceY2] = useState("20");
  const [traceWidth, setTraceWidth] = useState("0.25");
  const [traceLayer, setTraceLayer] = useState<"top" | "bottom">("top");
  const [viaNet, setViaNet] = useState("");
  const [viaX, setViaX] = useState("23");
  const [viaY, setViaY] = useState("15");
  const [customName, setCustomName] = useState("Custom sensor");
  const [customPrefix, setCustomPrefix] = useState("U");
  const [customPins, setCustomPins] = useState("4");
  const [customWidth, setCustomWidth] = useState("6.4");
  const [customHeight, setCustomHeight] = useState("4.4");
  const [customHeight3D, setCustomHeight3D] = useState("1.2");
  const [customModel3D, setCustomModel3D] = useState("builtin://custom-box");

  const elements = allElements(pcb.project);
  const selectedElement =
    elements.find((element) => element.designator === selected) ?? null;
  const selectedPart = selectedElement
    ? pcbFootprint(selectedElement, pcb)
    : null;
  const board = pcb.board;
  const summary = pcbProjectSummary(pcb);
  const netNames = pcb.project.nets.map((net) => net.name);
  const bom = useMemo(() => pcbBom(pcb), [pcb]);
  const library = useMemo(() => pcbLibrary(pcb), [pcb]);
  const connectivity = useMemo(() => netConnectivity(pcb), [pcb]);
  const sheets = pcb.schematic.sheets;
  const activeSheet =
    sheets.find((sheet) => sheet.id === sheetId) ?? sheets[0] ?? null;
  const collisions = assembly?.collisions ?? [];

  useEffect(() => {
    session.setPcbDocument(pcb);
  }, [pcb, session]);

  useEffect(() => {
    if (!sheets.some((sheet) => sheet.id === sheetId)) {
      setSheetId(sheets[0]?.id ?? null);
    }
  }, [sheetId, sheets]);

  useEffect(() => {
    if (tab === "mcu") setMcuMounted(true);
  }, [tab]);

  const commit = (next: PcbStudioDocument) => {
    if (readOnly) return;
    session.setPcbDocument(next);
    onChange(next);
  };

  const runPcbAction = async (action: string): Promise<ActionResult | null> => {
    setBusy(true);
    try {
      const result = await session.orchestrator.runTurn(action, []);
      setAgentText(resultText(result));
      const next = session.getPcbDocument();
      if (next && next !== pcb) onChange(next);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAgentText(message);
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  };

  const currentDoc = () => session.getPcbDocument() ?? pcb;

  const loadDemo = async () => {
    const result = await runPcbAction("createPcbDemo");
    if (!result?.ok) return;
    const next = session.getPcbDocument();
    if (next) {
      setViolations(runPcbDrc(next));
      setSheetId(next.schematic.sheets[0]?.id ?? null);
    }
    setTab("schematic");
  };

  const buildBoard = async () => {
    const result = await runPcbAction("buildPcb");
    if (!result?.ok) return;
    const next = session.getPcbDocument();
    if (next) setViolations(runPcbDrc(next));
    setTab("board");
  };

  const autoPlace = async () => {
    await runPcbAction("autoPlaceBoard");
    setTab("board");
  };

  const autoroute = async () => {
    const result = await runPcbAction("autorouteBoard");
    if (result) {
      const next = session.getPcbDocument();
      if (next) setViolations(runPcbDrc(next));
    }
    setTab("board");
  };

  const runDrc = async () => {
    const result = await runPcbAction("runPcbDrc");
    const data =
      result?.data && typeof result.data === "object"
        ? (result.data as { violations?: unknown })
        : null;
    if (Array.isArray(data?.violations)) {
      setViolations(data.violations as PcbViolation[]);
    } else {
      setViolations(runPcbDrc(currentDoc()));
    }
    setTab("drc");
  };

  const exportPackage = async () => {
    await runPcbAction("exportPcbFabrication");
    const built = buildFabrication(currentDoc());
    setFab(built);
    setTab("fab");
  };

  const checkAssembly = () => {
    const report = checkPcbAssembly(currentDoc(), [
      enclosureLid(
        currentDoc(),
        Math.max(1, numberValue(cavityMM, 8)),
        Math.max(0.2, numberValue(wallMM, 1.5)),
      ),
    ]);
    setAssembly(report);
    setAgentText(
      `${report.componentCount} component(s) · ${report.pass ? "no collisions" : `${report.collisions.length} collision(s)`}`,
    );
  };

  const addPart = () => {
    const part = pcbLibraryPart(libraryId, pcb);
    if (!part) return;
    commit(addPcbLibraryPart(pcb, libraryId));
    setTab("board");
  };

  const addCustomPart = () => {
    const pins = Math.max(
      2,
      Math.min(64, Math.round(numberValue(customPins, 4))),
    );
    commit(
      addPcbCustomPart(pcb, {
        name: customName,
        prefix: customPrefix,
        pins: Array.from({ length: pins }, (_, index) => ({
          pin: String(index + 1),
          name: `Pin ${index + 1}`,
          kind: "signal" as const,
        })),
        widthMM: Math.max(1, numberValue(customWidth, 6.4)),
        heightMM: Math.max(1, numberValue(customHeight, 4.4)),
        height3DMM: Math.max(0.1, numberValue(customHeight3D, 1.2)),
        model3D: customModel3D,
      }),
    );
  };

  const addTrace = () => {
    const net = traceNet || netNames[0] || "";
    if (!net) return;
    commit(
      addPcbTrace(
        pcb,
        net,
        [
          { x: numberValue(traceX1, 0), y: numberValue(traceY1, 0) },
          { x: numberValue(traceX2, 0), y: numberValue(traceY2, 0) },
        ],
        traceLayer,
        Math.max(0.05, numberValue(traceWidth, 0.25)),
      ),
    );
  };

  const addVia = () => {
    const net = viaNet || netNames[0] || "";
    if (!net) return;
    commit(
      addPcbVia(
        pcb,
        net,
        numberValue(viaX, board.widthMM / 2),
        numberValue(viaY, board.heightMM / 2),
      ),
    );
  };

  const addSheet = () => {
    const next = addSchematicSheet(pcb, `Sheet ${sheets.length + 1}`);
    commit(next);
    setSheetId(
      next.schematic.sheets[next.schematic.sheets.length - 1]?.id ?? null,
    );
  };

  const removeSheet = () => {
    if (!activeSheet || sheets.length <= 1) return;
    const next = removeSchematicSheet(pcb, activeSheet.id);
    commit(next);
    setSheetId(next.schematic.sheets[0]?.id ?? null);
  };

  const selectViolation = (violation: PcbViolation) => {
    if (violation.fix?.kind === "element") {
      setSelected(violation.fix.id);
      setTab("board");
    } else if (violation.fix?.kind === "net") {
      setTraceNet(violation.fix.id);
      setTab("board");
    }
  };

  const tracePointInputs = [
    ["X1", traceX1, setTraceX1],
    ["Y1", traceY1, setTraceY1],
    ["X2", traceX2, setTraceX2],
    ["Y2", traceY2, setTraceY2],
  ] as const;

  return (
    <div
      data-testid="scadstudio-pcb-workspace"
      className="cad-studio-light absolute inset-0 z-20 flex flex-col bg-gray-950 text-xs text-gray-200"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-700 bg-gray-950/95 px-3 py-2">
        <div className="min-w-[190px]">
          <div className="text-sm font-semibold tracking-tight">
            {SCADSTUDIO_PCB_NAME}
          </div>
          <div data-testid="pcb-summary" className="text-[10px] text-gray-500">
            {summary.parts} parts · {summary.nets} nets · {summary.sheets}{" "}
            sheets · {summary.traces} traces · {summary.vias} vias ·{" "}
            {board.layers} layers
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-testid="pcb-demo"
            onClick={() => void loadDemo()}
            disabled={readOnly || busy}
            className="rounded bg-emerald-700 px-2 py-1 text-[10px] hover:bg-emerald-600 disabled:opacity-40"
          >
            Load demo
          </button>
          <button
            type="button"
            data-testid="pcb-build"
            onClick={() => void buildBoard()}
            disabled={readOnly || busy}
            className="rounded bg-blue-600 px-2 py-1 text-[10px] hover:bg-blue-500 disabled:opacity-40"
          >
            Build board
          </button>
          <button
            type="button"
            data-testid="pcb-place"
            onClick={() => void autoPlace()}
            disabled={readOnly || busy}
            className="rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
          >
            Auto-place
          </button>
          <button
            type="button"
            data-testid="pcb-route"
            onClick={() => void autoroute()}
            disabled={readOnly || busy}
            className="rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
          >
            Autoroute
          </button>
          <button
            type="button"
            data-testid="pcb-drc-run"
            onClick={() => void runDrc()}
            disabled={readOnly || busy}
            className="rounded bg-sky-700 px-2 py-1 text-[10px] hover:bg-sky-600 disabled:opacity-40"
          >
            Run DRC
          </button>
          <button
            type="button"
            data-testid="pcb-export"
            onClick={() => void exportPackage()}
            disabled={readOnly || busy}
            className="rounded bg-amber-700 px-2 py-1 text-[10px] hover:bg-amber-600 disabled:opacity-40"
          >
            Export fab
          </button>
          {readOnly && (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200">
              View only
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 flex-none flex-col overflow-y-auto border-r border-gray-700 bg-gray-950/95">
          <section className="space-y-2 border-b border-gray-700 p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              Board
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["W", "widthMM", board.widthMM, 10],
                  ["H", "heightMM", board.heightMM, 10],
                  ["T", "thicknessMM", board.thicknessMM, 0.4],
                ] as const
              ).map(([label, key, value, min]) => (
                <label key={key} className="block">
                  <span className="text-[9px] text-gray-500">{label} mm</span>
                  <input
                    type="number"
                    aria-label={`Board ${label} in millimeters`}
                    min={min}
                    value={value}
                    disabled={readOnly}
                    onChange={(event) =>
                      commit(
                        updatePcbBoard(pcb, {
                          [key]: numberValue(event.target.value, value),
                        }),
                      )
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-[9px] text-gray-500">Layers</span>
                <select
                  aria-label="Board copper layers"
                  value={board.layers}
                  disabled={readOnly}
                  onChange={(event) =>
                    commit(
                      updatePcbBoard(pcb, {
                        layers: event.target.value === "4" ? 4 : 2,
                      }),
                    )
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Download PCB BOM CSV"
                onClick={() =>
                  download("scadstudio-pcb-bom.csv", pcbBomCsv(pcb), "text/csv")
                }
                className="flex-1 rounded bg-gray-800 px-1 py-1 text-[10px] hover:bg-gray-700"
              >
                BOM CSV
              </button>
              <button
                type="button"
                aria-label="Pour GND on top copper"
                onClick={() => commit(pourRect(pcb, "GND", "top", 1.2))}
                disabled={readOnly || !netNames.includes("GND")}
                className="flex-1 rounded bg-gray-800 px-1 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
              >
                GND pour
              </button>
            </div>
          </section>

          <section className="border-b border-gray-700 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
              Project tree
            </div>
            {elements.map((element) => {
              const part = pcbFootprint(element, pcb);
              return (
                <button
                  key={element.designator}
                  type="button"
                  aria-label={`Select ${element.designator}`}
                  onClick={() => setSelected(element.designator)}
                  className={`mb-1 flex w-full items-center gap-1 rounded px-2 py-1 text-left ${
                    selected === element.designator
                      ? "bg-sky-900/70 text-sky-100"
                      : "bg-gray-900 hover:bg-gray-800"
                  }`}
                >
                  <span className="font-mono text-[10px]">
                    {element.designator}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[9px] text-gray-500">
                    {element.value ?? element.type ?? part?.name ?? "part"}
                  </span>
                </button>
              );
            })}
            {elements.length === 0 && (
              <div className="rounded border border-dashed border-gray-700 p-2 text-[10px] text-gray-500">
                Load the demo, place a library part, or ask the assistant to
                build the board.
              </div>
            )}
          </section>

          <section className="p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
              Copper / connectivity
            </div>
            <div className="space-y-0.5 text-[10px] text-gray-400">
              <div>
                {connectivity.nets.filter((net) => net.connected).length}/
                {connectivity.nets.length} nets connected
              </div>
              <div>
                {pcb.zones.length} pours · {pcb.vias.length} vias ·{" "}
                {pcb.traces.length} traces
              </div>
              {connectivity.broken.length > 0 && (
                <div className="text-red-300">
                  Broken:{" "}
                  {connectivity.broken.map((entry) => entry.net).join(", ")}
                </div>
              )}
            </div>
          </section>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex flex-wrap gap-1 border-b border-gray-700 p-2">
            {(
              [
                ["schematic", "Schematic"],
                ["board", "Board"],
                ["library", "Library"],
                ["drc", "DRC"],
                ["fab", "Fabrication"],
                ["3d", "3D"],
                ["mcu", "Virtual MCU"],
                ["assistant", "Assistant"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`pcb-tab-${id}`}
                aria-label={label}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`rounded px-2 py-1 text-[10px] ${
                  tab === id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
            <div
              data-testid="pcb-status"
              className="ml-auto max-w-[46%] truncate self-center text-[10px] text-gray-500"
              title={agentText}
            >
              {busy ? "Running ScadStudio action…" : agentText || "Ready"}
            </div>
          </nav>

          {tab === "schematic" && (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <div>
                  <div className="text-sm font-semibold">Schematic capture</div>
                  <div className="text-[10px] text-gray-500">
                    Multi-sheet symbols, wires, net labels, power ports and
                    cross-sheet ports. The netlist is rebuilt from this
                    geometry.
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Add schematic sheet"
                  onClick={addSheet}
                  disabled={readOnly}
                  className="ml-auto rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Add sheet
                </button>
                <button
                  type="button"
                  aria-label="Remove schematic sheet"
                  onClick={removeSheet}
                  disabled={readOnly || sheets.length <= 1}
                  className="rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
                >
                  Remove sheet
                </button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.id}
                    type="button"
                    aria-label={sheet.name}
                    aria-pressed={sheet.id === activeSheet?.id}
                    onClick={() => setSheetId(sheet.id)}
                    className={`rounded border px-2 py-1 text-[10px] ${
                      sheet.id === activeSheet?.id
                        ? "border-sky-500 bg-sky-900/60 text-sky-100"
                        : "border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800"
                    }`}
                  >
                    {sheet.name}
                  </button>
                ))}
                {activeSheet && (
                  <input
                    aria-label="Schematic sheet name"
                    value={activeSheet.name}
                    disabled={readOnly}
                    onChange={(event) =>
                      commit(
                        renameSchematicSheet(
                          pcb,
                          activeSheet.id,
                          event.target.value,
                        ),
                      )
                    }
                    className="ml-auto w-52 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                  />
                )}
              </div>
              {activeSheet ? (
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <SchematicSheetView
                    doc={pcb}
                    sheet={activeSheet}
                    selected={selected}
                    onSelect={setSelected}
                  />
                  <div className="space-y-2 rounded border border-gray-700 bg-gray-900 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">
                      Sheet contents
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {activeSheet.symbols.length} symbols ·{" "}
                      {activeSheet.wires.length} wires ·{" "}
                      {activeSheet.junctions.length} junctions ·{" "}
                      {activeSheet.powerPorts.length} power ports ·{" "}
                      {activeSheet.labels.length} net labels ·{" "}
                      {activeSheet.ports.length} ports
                    </div>
                    <div className="space-y-1">
                      {activeSheet.symbols.map((symbol) => (
                        <button
                          key={symbol.id}
                          type="button"
                          aria-label={`Select ${symbol.designator} on ${activeSheet.name}`}
                          onClick={() => setSelected(symbol.designator)}
                          className="flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1 text-left text-[10px] hover:bg-gray-700"
                        >
                          <span className="font-mono text-sky-200">
                            {symbol.designator}
                          </span>
                          <span className="text-gray-500">
                            {pcbLibraryPart(symbol.partId, pcb)?.package ??
                              symbol.partId}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">
                      Nets on sheet
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        ...new Set([
                          ...activeSheet.wires.map((wire) => wire.net),
                          ...activeSheet.labels.map((label) => label.net),
                          ...activeSheet.powerPorts.map((port) => port.net),
                        ]),
                      ]
                        .filter(Boolean)
                        .map((net) => (
                          <span
                            key={net}
                            className="rounded bg-sky-950/60 px-1.5 py-0.5 font-mono text-[9px] text-sky-200"
                          >
                            {net}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-dashed border-gray-700 p-4 text-gray-500">
                  Add a schematic sheet to start.
                </div>
              )}
            </div>
          )}

          {tab === "board" && (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div>
                  <div className="text-sm font-semibold">Board layout</div>
                  <div className="text-[10px] text-gray-500">
                    Pads, copper pours, traces, vias, silkscreen and ratsnest.
                    Click a footprint to edit.
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap gap-2 text-[10px] text-gray-400">
                  {(
                    [
                      ["Top", showTop, setShowTop],
                      ["Bottom", showBottom, setShowBottom],
                      ["Pours", showZones, setShowZones],
                      ["Ratsnest", showRatsnest, setShowRatsnest],
                      ["Silk", showSilk, setShowSilk],
                    ] as const
                  ).map(([label, checked, setter]) => (
                    <label key={label} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        aria-label={`Show ${label}`}
                        checked={checked}
                        onChange={(event) => setter(event.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <BoardCanvas
                doc={pcb}
                selected={selected}
                onSelect={setSelected}
                showTop={showTop}
                showBottom={showBottom}
                showZones={showZones}
                showRatsnest={showRatsnest}
                showSilk={showSilk}
              />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded border border-gray-700 bg-gray-900 p-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Add via
                  </div>
                  <div className="flex flex-wrap items-end gap-1">
                    <label className="block">
                      <span className="block text-[9px] text-gray-500">
                        Net
                      </span>
                      <select
                        aria-label="Via net"
                        value={viaNet || netNames[0] || ""}
                        onChange={(event) => setViaNet(event.target.value)}
                        className="w-24 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                      >
                        {netNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        {netNames.length === 0 && (
                          <option value="">No nets</option>
                        )}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[9px] text-gray-500">X</span>
                      <input
                        type="number"
                        aria-label="Via X"
                        value={viaX}
                        onChange={(event) => setViaX(event.target.value)}
                        className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[9px] text-gray-500">Y</span>
                      <input
                        type="number"
                        aria-label="Via Y"
                        value={viaY}
                        onChange={(event) => setViaY(event.target.value)}
                        className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Add via"
                      onClick={addVia}
                      disabled={readOnly || netNames.length === 0}
                      className="rounded bg-sky-700 px-2 py-1 text-[10px] hover:bg-sky-600 disabled:opacity-40"
                    >
                      Add via
                    </button>
                  </div>
                </div>
                <div className="rounded border border-gray-700 bg-gray-900 p-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Manual trace
                  </div>
                  <div className="flex flex-wrap items-end gap-1">
                    <label className="block">
                      <span className="block text-[9px] text-gray-500">
                        Net
                      </span>
                      <select
                        aria-label="ScadStudio PCB trace net"
                        value={traceNet || netNames[0] || ""}
                        onChange={(event) => setTraceNet(event.target.value)}
                        className="w-24 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                      >
                        {netNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        {netNames.length === 0 && (
                          <option value="">No nets</option>
                        )}
                      </select>
                    </label>
                    {tracePointInputs.map(([label, value, setter]) => (
                      <label key={label} className="block">
                        <span className="block text-[9px] text-gray-500">
                          {label}
                        </span>
                        <input
                          type="number"
                          aria-label={`Trace ${label}`}
                          value={value}
                          onChange={(event) => setter(event.target.value)}
                          className="w-14 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                        />
                      </label>
                    ))}
                    <label className="block">
                      <span className="block text-[9px] text-gray-500">W</span>
                      <input
                        type="number"
                        aria-label="ScadStudio PCB trace width"
                        step={0.05}
                        value={traceWidth}
                        onChange={(event) => setTraceWidth(event.target.value)}
                        className="w-14 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                      />
                    </label>
                    <select
                      aria-label="ScadStudio PCB trace layer"
                      value={traceLayer}
                      onChange={(event) =>
                        setTraceLayer(
                          event.target.value === "bottom" ? "bottom" : "top",
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    >
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                    <button
                      type="button"
                      aria-label="Add manual trace"
                      onClick={addTrace}
                      disabled={readOnly || netNames.length === 0}
                      className="rounded bg-sky-700 px-2 py-1 text-[10px] hover:bg-sky-600 disabled:opacity-40"
                    >
                      Add trace
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "library" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div>
                  <div className="text-sm font-semibold">Library</div>
                  <div className="text-[10px] text-gray-500">
                    Footprints with pin↔pad mapping, courtyard, silkscreen and
                    3D height. Custom parts persist in this document.
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <select
                    value={libraryId}
                    onChange={(event) => setLibraryId(event.target.value)}
                    aria-label="ScadStudio PCB library part"
                    className="w-56 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px]"
                  >
                    {library.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name} · {part.package}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={addPart}
                    data-testid="scadstudio-pcb-add-part"
                    className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    Place
                  </button>
                </div>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {library.map((part) => (
                  <div
                    key={part.id}
                    className="rounded border border-gray-700 bg-gray-900 p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{part.name}</div>
                        <div className="text-[10px] text-gray-500">
                          {part.mpn} · {part.package}
                        </div>
                      </div>
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[9px] text-gray-400">
                        {part.prefix}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] text-gray-400">
                      {part.widthMM}×{part.heightMM} mm · {part.pins.length}{" "}
                      pins · {part.pads.length} pads · {part.height3DMM} mm high
                      · {part.model3D ?? "box model"}
                      {part.custom ? " · custom" : ""}
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setLibraryId(part.id);
                        commit(addPcbLibraryPart(pcb, part.id));
                        setTab("board");
                      }}
                      className="mt-2 w-full rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
                    >
                      Add to board
                    </button>
                  </div>
                ))}
              </div>
              <div className="rounded border border-gray-700 bg-gray-900 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">
                  Create custom part
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <label className="block sm:col-span-2">
                    <span className="block text-[9px] text-gray-500">Name</span>
                    <input
                      aria-label="Custom part name"
                      value={customName}
                      disabled={readOnly}
                      onChange={(event) => setCustomName(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[9px] text-gray-500">
                      Prefix
                    </span>
                    <input
                      aria-label="Custom part prefix"
                      value={customPrefix}
                      disabled={readOnly}
                      onChange={(event) => setCustomPrefix(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[9px] text-gray-500">Pins</span>
                    <input
                      type="number"
                      aria-label="Custom part pin count"
                      value={customPins}
                      disabled={readOnly}
                      onChange={(event) => setCustomPins(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[9px] text-gray-500">
                      Width
                    </span>
                    <input
                      type="number"
                      aria-label="Custom part width"
                      value={customWidth}
                      disabled={readOnly}
                      onChange={(event) => setCustomWidth(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[9px] text-gray-500">
                      Height
                    </span>
                    <input
                      type="number"
                      aria-label="Custom part height"
                      value={customHeight}
                      disabled={readOnly}
                      onChange={(event) => setCustomHeight(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>{" "}
                  <label className="block">
                    <span className="block text-[9px] text-gray-500">
                      3D mm
                    </span>
                    <input
                      type="number"
                      aria-label="Custom part 3D height"
                      value={customHeight3D}
                      disabled={readOnly}
                      onChange={(event) =>
                        setCustomHeight3D(event.target.value)
                      }
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="block text-[9px] text-gray-500">
                      3D model link
                    </span>
                    <input
                      aria-label="Custom part 3D model link"
                      value={customModel3D}
                      disabled={readOnly}
                      onChange={(event) => setCustomModel3D(event.target.value)}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  aria-label="Create custom part"
                  onClick={addCustomPart}
                  disabled={readOnly}
                  className="mt-2 rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Create custom part
                </button>
              </div>
            </div>
          )}

          {tab === "drc" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Design rule check</div>
                  <div className="text-[10px] text-gray-500">
                    Every finding has a stable code, measured value and a fix
                    target.
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Run PCB DRC"
                  onClick={() => void runDrc()}
                  disabled={readOnly || busy}
                  className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Run DRC
                </button>
              </div>
              <div
                data-testid="pcb-drc-summary"
                className={`mb-2 rounded border p-2 text-[11px] ${
                  violations && violations.some((v) => v.severity === "error")
                    ? "border-red-900 bg-red-950/30 text-red-200"
                    : "border-green-800 bg-green-950/30 text-green-200"
                }`}
              >
                {violations === null
                  ? "DRC has not run for this board."
                  : `${violations.filter((v) => v.severity === "error").length} error(s) · ${violations.filter((v) => v.severity === "warning").length} warning(s)`}
              </div>
              {violations === null ? (
                <div className="rounded border border-dashed border-gray-700 p-4 text-gray-500">
                  Run DRC to inspect clearance, width, via, courtyard, silk,
                  outline and unconnected-net findings.
                </div>
              ) : violations.length === 0 ? (
                <div className="rounded border border-green-800 bg-green-950/30 p-4 text-green-300">
                  No DRC violations. Copper is connected and the board is clean.
                </div>
              ) : (
                <div className="space-y-1">
                  {violations.map((violation, index) => (
                    <button
                      key={`${violation.code}-${violation.where}-${index}`}
                      type="button"
                      aria-label={`Inspect ${violation.code} ${violation.where}`}
                      onClick={() => selectViolation(violation)}
                      className={`block w-full rounded border px-2 py-1.5 text-left ${
                        violation.severity === "error"
                          ? "border-red-900 bg-red-950/30 hover:bg-red-950/50"
                          : "border-amber-900 bg-amber-950/20 hover:bg-amber-950/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1 text-[9px] uppercase ${
                            violation.severity === "error"
                              ? "bg-red-800 text-red-100"
                              : "bg-amber-800 text-amber-100"
                          }`}
                        >
                          {violation.severity}
                        </span>
                        <span className="font-mono text-[10px] text-gray-300">
                          {violation.code}
                        </span>
                        <span className="truncate text-[10px] text-gray-500">
                          {violation.where}
                        </span>
                        {violation.actualMM !== undefined && (
                          <span className="ml-auto font-mono text-[9px] text-gray-400">
                            {violation.actualMM.toFixed(3)} /{" "}
                            {violation.limitMM?.toFixed(3)} mm
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-400">
                        {violation.msg}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 rounded border border-gray-700 bg-gray-900 p-2">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">
                  Design rules
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["minTraceMM", "Min trace"],
                      ["minClearanceMM", "Min clearance"],
                      ["minViaDrillMM", "Min via drill"],
                      ["minViaPadMM", "Min via pad"],
                      ["minAnnularMM", "Min annular"],
                      ["silkClearanceMM", "Silk clearance"],
                      ["courtyardMM", "Courtyard"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="block text-[9px] text-gray-500">
                        {label} mm
                      </span>
                      <input
                        type="number"
                        step={0.05}
                        aria-label={`${label} in millimeters`}
                        value={pcb.rules[key]}
                        disabled={readOnly}
                        onChange={(event) => {
                          const value = numberValue(
                            event.target.value,
                            pcb.rules[key],
                          );
                          commit(updatePcbRules(pcb, { [key]: value }));
                        }}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px]"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Net connectivity
                </div>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {connectivity.nets.map((net) => (
                    <div
                      key={net.net}
                      className={`rounded border px-2 py-1 text-[10px] ${
                        net.connected
                          ? "border-green-900 bg-green-950/20 text-green-200"
                          : "border-red-900 bg-red-950/30 text-red-200"
                      }`}
                    >
                      {net.net} · {net.pads} pads ·{" "}
                      {net.connected ? "connected" : "broken"}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "fab" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Fabrication</div>
                  <div className="text-[10px] text-gray-500">
                    RS-274X Gerbers, Excellon drill, pick-and-place, grouped BOM
                    and a layer-mapping README, zipped locally.
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Build fabrication package"
                  onClick={() => void exportPackage()}
                  disabled={readOnly || busy}
                  className="rounded bg-amber-700 px-2 py-1 text-[10px] hover:bg-amber-600 disabled:opacity-40"
                >
                  Build package
                </button>
              </div>
              {!fab ? (
                <div className="rounded border border-dashed border-gray-700 p-4 text-gray-500">
                  Build the package to inspect layer mapping, file sizes and
                  fabrication issues.
                </div>
              ) : (
                <>
                  <div
                    data-testid="pcb-fab-summary"
                    className={`mb-2 rounded border p-2 text-[11px] ${
                      fab.ok
                        ? "border-green-800 bg-green-950/30 text-green-200"
                        : "border-red-900 bg-red-950/30 text-red-200"
                    }`}
                  >
                    {fab.ok ? "Package ready" : "Package has errors"} ·{" "}
                    {fab.files.length} files · {fab.stats.layers} copper layers
                    · {fab.stats.pads} pads · {fab.stats.holes} holes ·{" "}
                    {fab.stats.components} components · {fab.stats.bytes} bytes
                  </div>
                  {fab.issues.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {fab.issues.map((issue, index) => (
                        <div
                          key={`${issue.code}-${index}`}
                          className="rounded border border-amber-900 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200"
                        >
                          <span className="font-mono">{issue.code}</span> ·{" "}
                          {issue.msg}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mb-2 flex gap-2">
                    <button
                      type="button"
                      data-testid="pcb-fab-download"
                      aria-label="Download fabrication ZIP"
                      onClick={() =>
                        downloadBytes(
                          "scadstudio-pcb-fab.zip",
                          fab.zip,
                          "application/zip",
                        )
                      }
                      className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500"
                    >
                      Download ZIP
                    </button>
                    <button
                      type="button"
                      aria-label="Download fabrication README"
                      onClick={() => {
                        const readme = fab.files.find(
                          (file) => file.name === "README.txt",
                        );
                        if (readme)
                          download(readme.name, readme.content, "text/plain");
                      }}
                      className="rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700"
                    >
                      README
                    </button>
                  </div>
                  <table className="w-full border-collapse text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-500">
                        <th className="py-1">File</th>
                        <th>Kind</th>
                        <th>Layer</th>
                        <th className="text-right">Bytes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {fab.files.map((file) => (
                        <tr
                          key={file.name}
                          data-testid="pcb-fab-file"
                          className="border-b border-gray-800"
                        >
                          <td className="py-1 font-mono text-sky-200">
                            {file.name}
                          </td>
                          <td className="text-gray-400">{file.kind}</td>
                          <td className="text-gray-500">{file.layer ?? "—"}</td>
                          <td className="text-right text-gray-400">
                            {file.bytes}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              aria-label={`Download ${file.name}`}
                              onClick={() =>
                                download(file.name, file.content, "text/plain")
                              }
                              className="rounded px-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                            >
                              ↓
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {tab === "3d" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex flex-wrap items-end gap-2">
                <div>
                  <div className="text-sm font-semibold">3D board assembly</div>
                  <div className="text-[10px] text-gray-500">
                    Extruded board, component solids, enclosure lid and measured
                    collisions at real millimetre scale.
                  </div>
                </div>
                <label className="ml-auto flex items-center gap-1 text-[10px] text-gray-400">
                  <input
                    type="checkbox"
                    aria-label="Show enclosure lid"
                    checked={showLid}
                    onChange={(event) => setShowLid(event.target.checked)}
                  />
                  Enclosure lid
                </label>
                <label className="block">
                  <span className="block text-[9px] text-gray-500">
                    Cavity mm
                  </span>
                  <input
                    type="number"
                    aria-label="Enclosure cavity height"
                    value={cavityMM}
                    onChange={(event) => setCavityMM(event.target.value)}
                    className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[9px] text-gray-500">
                    Wall mm
                  </span>
                  <input
                    type="number"
                    aria-label="Enclosure wall thickness"
                    value={wallMM}
                    onChange={(event) => setWallMM(event.target.value)}
                    className="w-16 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Check 3D assembly collisions"
                  onClick={checkAssembly}
                  className="rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-500"
                >
                  Check collisions
                </button>
              </div>
              <div className="mb-2 h-[470px] overflow-hidden rounded border border-gray-700">
                <Pcb3dPreview
                  doc={pcb}
                  showLid={showLid}
                  cavityMM={Math.max(1, numberValue(cavityMM, 8))}
                  wallMM={Math.max(0.2, numberValue(wallMM, 1.5))}
                  collisionIds={collisions.map(
                    (collision) => collision.componentId,
                  )}
                />
              </div>
              <div
                data-testid="pcb-assembly-summary"
                className={`rounded border p-2 text-[11px] ${
                  assembly
                    ? assembly.pass
                      ? "border-green-800 bg-green-950/30 text-green-200"
                      : "border-red-900 bg-red-950/30 text-red-200"
                    : "border-gray-700 bg-gray-900 text-gray-400"
                }`}
              >
                {assembly
                  ? assembly.pass
                    ? `${assembly.componentCount} component(s) · no enclosure collisions · max height ${assembly.maxComponentHeightMM.toFixed(2)} mm`
                    : `${assembly.collisions.length} collision(s) · ${assembly.collisions
                        .map((collision) => collision.msg)
                        .join("; ")}`
                  : "Check collisions to compare component heights with the enclosure lid."}
              </div>
            </div>
          )}

          {mcuMounted && (
            <div
              data-testid="pcb-mcu-host"
              className={
                tab === "mcu" ? "flex min-h-0 flex-1 flex-col" : "hidden"
              }
            >
              <PcbVirtualMcuTab
                document={pcb}
                readOnly={readOnly}
                onChange={commit}
              />
            </div>
          )}

          {tab === "assistant" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold">
                  {SCADSTUDIO_PCB_NAME} assistant
                </div>
                <div className="text-[10px] text-gray-500">
                  The same registry and session as the desk, VR and ActionBus.
                  AI actions run the real engine, not a mock.
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                {(
                  [
                    ["createPcbDemo", "Load demo"],
                    ["buildPcb", "Build board"],
                    ["autoPlaceBoard", "Auto-place"],
                    ["autorouteBoard", "Autoroute"],
                    ["runPcbDrc", "Run PCB DRC"],
                    ["exportPcbFabrication", "Export fab"],
                    ["checkPcbAssembly", "Check 3D"],
                    ["runErcDrc", "Run ERC/DRC"],
                    ["generateBom", "Generate BOM"],
                    ["explainProject", "Explain project"],
                    ["connectComponents", "Connect components"],
                    ["wirePowerNets", "Wire power nets"],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    aria-label={label}
                    disabled={busy || (readOnly && action !== "explainProject")}
                    onClick={() => void runPcbAction(action)}
                    className="rounded bg-gray-800 px-2 py-1 text-[10px] hover:bg-gray-700 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                data-testid="scadstudio-pcb-agent-result"
                className="min-h-24 whitespace-pre-wrap rounded border border-gray-700 bg-gray-900 p-2 font-mono text-[10px] text-gray-400"
              >
                {busy
                  ? "Running ScadStudio action…"
                  : agentText || "Choose an action above."}
              </div>
              <div className="mt-3 rounded border border-gray-700 bg-gray-900 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Netlist
                </div>
                <div className="max-h-48 overflow-auto font-mono text-[9px] text-gray-400">
                  {pcb.project.nets.length === 0
                    ? "No nets yet."
                    : pcb.project.nets.map((net) => (
                        <div key={net.name}>
                          <span className="text-sky-200">{net.name}</span>{" "}
                          <span className="text-gray-500">
                            {net.pins
                              .map((pin) => `${pin.designator}.${pin.pin}`)
                              .join(" ")}
                          </span>
                        </div>
                      ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                  Session trace
                </div>
                <div className="space-y-1">
                  {session.orchestrator.trace.rows.slice(-12).map((row) => (
                    <div
                      key={row.id}
                      className="rounded border border-gray-800 bg-gray-900/60 px-2 py-1 text-[10px]"
                    >
                      <span className="mr-2 text-sky-300">{row.agent}</span>
                      <span className="text-gray-400">{row.op}</span>
                      <span className="ml-2 text-gray-500">{row.detail}</span>
                    </div>
                  ))}
                  {session.orchestrator.trace.rows.length === 0 && (
                    <div className="text-[10px] text-gray-500">
                      No session trace yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {selectedElement && (
          <aside className="w-64 flex-none overflow-y-auto border-l border-gray-700 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {selectedElement.designator}
              </div>
              <button
                type="button"
                aria-label="Close selected component"
                onClick={() => setSelected(null)}
                className="text-gray-500 hover:text-gray-200"
              >
                ×
              </button>
            </div>
            <div className="text-[10px] text-gray-500">
              {selectedPart?.name ?? selectedElement.value ?? "Component"} ·{" "}
              {selectedPart?.package ?? selectedElement.package ?? "custom"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1">
              {(
                [
                  ["X", "x", selectedElement.position.x],
                  ["Y", "y", selectedElement.position.y],
                  ["Rotation", "rotation", selectedElement.rotation],
                ] as const
              ).map(([label, key, value]) => (
                <label key={key} className="block">
                  <span className="text-[9px] text-gray-500">{label}</span>
                  <input
                    type="number"
                    aria-label={`Selected component ${label}`}
                    value={value}
                    disabled={readOnly}
                    onChange={(event) =>
                      commit(
                        movePcbPart(
                          pcb,
                          selectedElement.designator,
                          key === "x"
                            ? numberValue(
                                event.target.value,
                                selectedElement.position.x,
                              )
                            : selectedElement.position.x,
                          key === "y"
                            ? numberValue(
                                event.target.value,
                                selectedElement.position.y,
                              )
                            : selectedElement.position.y,
                          key === "rotation"
                            ? numberValue(
                                event.target.value,
                                selectedElement.rotation,
                              )
                            : selectedElement.rotation,
                        ),
                      )
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  commit(removePcbPart(pcb, selectedElement.designator));
                  setSelected(null);
                }}
                className="mt-4 rounded bg-red-900/60 px-1 py-1 text-[10px] text-red-200 hover:bg-red-800 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                Pin nets
              </div>
              <div className="space-y-1">
                {selectedElement.pins.map((pin) => (
                  <label key={pin.pin} className="flex items-center gap-1">
                    <span className="w-7 font-mono text-[9px] text-gray-500">
                      {pin.pin}
                    </span>
                    <span className="w-10 truncate text-[9px] text-gray-400">
                      {pin.name ?? ""}
                    </span>
                    <input
                      value={pin.net ?? ""}
                      disabled={readOnly}
                      list="scadstudio-pcb-nets"
                      aria-label={`Net for ${selectedElement.designator} pin ${pin.pin}`}
                      onChange={(event) =>
                        commit(
                          setPcbPinNet(
                            pcb,
                            selectedElement.designator,
                            pin.pin,
                            event.target.value,
                          ),
                        )
                      }
                      placeholder="net"
                      className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
                    />
                  </label>
                ))}
              </div>
              <datalist id="scadstudio-pcb-nets">
                {netNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="mt-3 border-t border-gray-700 pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                Board BOM
              </div>
              <div className="space-y-1 text-[9px] text-gray-400">
                {bom.map((row) => (
                  <div key={`${row.type}-${row.value}-${row.mpn}`}>
                    <span className="font-mono text-sky-200">
                      {row.designator.join(", ")}
                    </span>{" "}
                    · {row.qty}× {row.value ?? row.type}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default ScadStudioPcbWorkspace;
