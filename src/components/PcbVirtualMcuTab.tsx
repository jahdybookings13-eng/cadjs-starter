import { useEffect, useMemo, useRef, useState } from "react";
import { isEcadSnapshot, type EcadSnapshot } from "../ecad/persist";
import { makeHeadlessEcad, type HeadlessEcad } from "../ecad/headless";
import { allElements } from "../flux/domains/pcb/project";
import { applyPcbNetlist, type PcbNetlistReport } from "../pcb/mcuBridge";
import type { PcbStudioDocument } from "../pcb/model";
import type { PcbMcuLink } from "../pcb/types";
import { EcadPanel } from "./EcadPanel";

const SAVE_INTERVAL_MS = 750;

function snapshotKey(snapshot: EcadSnapshot): string {
  // savedAt changes every snapshot; it must not make an unchanged scene dirty.
  return JSON.stringify({ ...snapshot, savedAt: 0 });
}

function reportText(report: PcbNetlistReport): string {
  const parts = [
    `${report.wires} net wire(s) applied`,
    ...(report.existing > 0 ? [`${report.existing} already wired`] : []),
    ...(report.skipped.length > 0 ? [`${report.skipped.length} skipped`] : []),
    ...(report.unresolved.length > 0
      ? [`${report.unresolved.length} unresolved`]
      : []),
  ];
  return parts.join(" · ");
}

export interface PcbVirtualMcuTabProps {
  document: PcbStudioDocument;
  readOnly?: boolean;
  onChange: (document: PcbStudioDocument) => void;
}

/**
 * Real virtual MCU workbench inside PCB Studio.
 *
 * This is the same EcadSim used by the desk panel and VR: place an Arduino,
 * ESP32, RP2040 or STM32, deploy real firmware, run it, inspect pins and serial,
 * wire peripherals and build AVR C++. The snapshot — instances, wires and exact
 * firmware — persists in the PCB document.
 *
 * PCB elements can be linked to ECAD instances, and "Apply PCB nets" projects
 * the routed netlist into real ECAD wires, so firmware drives the hardware the
 * board actually carries.
 */
export function PcbVirtualMcuTab({
  document: pcb,
  readOnly = false,
  onChange,
}: PcbVirtualMcuTabProps) {
  const initialSnapshot = useRef(pcb.virtualMcu);
  const latest = useRef({ pcb, onChange });
  latest.current = { pcb, onChange };
  const savedKey = useRef("");
  const [ecad, setEcad] = useState<HeadlessEcad | null>(null);
  const [revision, setRevision] = useState(0);
  const [bridgeText, setBridgeText] = useState("");
  const [pickElement, setPickElement] = useState("");
  const [pickInstance, setPickInstance] = useState("");

  useEffect(() => {
    const controller = makeHeadlessEcad();
    if (isEcadSnapshot(initialSnapshot.current)) {
      controller.sim.restore(initialSnapshot.current);
    }
    savedKey.current = snapshotKey(controller.sim.snapshot());
    const persist = () => {
      if (readOnly) return;
      const snapshot = controller.sim.snapshot();
      const key = snapshotKey(snapshot);
      if (key === savedKey.current) return;
      savedKey.current = key;
      latest.current.onChange({
        ...latest.current.pcb,
        virtualMcu: snapshot,
        updatedAt: Date.now(),
      });
    };
    const timer = window.setInterval(() => {
      setRevision((value) => value + 1);
      persist();
    }, SAVE_INTERVAL_MS);
    setEcad(controller);
    return () => {
      window.clearInterval(timer);
      // Snapshot before dispose so leaving the tab cannot clear the document.
      persist();
      controller.dispose();
    };
  }, [readOnly]);

  const links = useMemo(() => pcb.virtualMcuLinks ?? [], [pcb.virtualMcuLinks]);
  const linksKey = JSON.stringify(links);
  const elements = useMemo(() => allElements(pcb.project), [pcb.project]);

  // revision advances while the sim mutates (insert/remove happens inside
  // EcadPanel), so the lists re-read the live scene on every render.
  void revision;
  const instances = ecad
    ? [...ecad.sim.instances.values()].map((instance) => ({
        id: instance.id,
        name: ecad.sim.partOf(instance.id)?.name ?? instance.partId,
      }))
    : [];

  // Netlist application is idempotent, so re-running when the link table
  // changes is safe and never duplicates wires.
  useEffect(() => {
    if (!ecad) return;
    const report = applyPcbNetlist(ecad.sim, latest.current.pcb);
    if (
      report.wires > 0 ||
      report.existing > 0 ||
      report.skipped.length > 0 ||
      report.unresolved.length > 0
    ) {
      setBridgeText(reportText(report));
    }
  }, [ecad, linksKey]);

  const elementValue = elements.some(
    (element) => element.designator === pickElement,
  )
    ? pickElement
    : (elements[0]?.designator ?? "");
  const instanceValue = instances.some(
    (instance) => instance.id === pickInstance,
  )
    ? pickInstance
    : (instances[0]?.id ?? "");
  const alreadyLinked =
    links.some((link) => link.designator === elementValue) ||
    links.some((link) => link.instance === instanceValue);

  const addLink = () => {
    if (readOnly || !elementValue || !instanceValue || alreadyLinked) return;
    const link: PcbMcuLink = {
      designator: elementValue,
      instance: instanceValue,
    };
    onChange({
      ...pcb,
      virtualMcuLinks: [...links, link],
      updatedAt: Date.now(),
    });
    setPickElement("");
    setPickInstance("");
  };

  const removeLink = (designator: string) => {
    if (readOnly) return;
    onChange({
      ...pcb,
      virtualMcuLinks: links.filter((link) => link.designator !== designator),
      updatedAt: Date.now(),
    });
  };

  const applyNow = () => {
    if (!ecad) return;
    setBridgeText(reportText(applyPcbNetlist(ecad.sim, latest.current.pcb)));
  };

  const savedParts = pcb.virtualMcu?.instances.length ?? 0;

  return (
    <div
      data-testid="pcb-mcu-workbench"
      className="flex min-h-0 flex-1 flex-col gap-2 p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-sm font-semibold">Virtual MCU workbench</div>
          <div className="text-[10px] text-gray-500">
            Same EcadSim, firmware registry and ActionBus as the desk and VR
            ECAD surfaces. Place a real virtual board, run firmware and watch
            pins/serial here.
          </div>
        </div>
        <div
          data-testid="pcb-mcu-saved"
          className="ml-auto rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-400"
        >
          {savedParts} virtual part(s) saved
        </div>
      </div>

      <div className="rounded border border-gray-700 bg-gray-900/60 px-2 py-1.5 text-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-300">
            PCB netlist bridge
          </span>
          <span className="text-gray-500">
            {elements.length} PCB element(s) · {pcb.project.nets.length} net(s)
          </span>
          <span
            data-testid="pcb-mcu-link-count"
            className="ml-auto text-gray-400"
          >
            {links.length} linked
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <select
            aria-label="PCB element to link"
            data-testid="pcb-mcu-link-element"
            value={elementValue}
            disabled={readOnly || elements.length === 0}
            onChange={(event) => setPickElement(event.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
          >
            {elements.map((element) => (
              <option key={element.designator} value={element.designator}>
                {element.designator}
                {element.value ? ` · ${element.value}` : ""}
              </option>
            ))}
          </select>
          <span className="text-gray-500">→</span>
          <select
            aria-label="ECAD instance to link"
            data-testid="pcb-mcu-link-instance"
            value={instanceValue}
            disabled={readOnly || instances.length === 0}
            onChange={(event) => setPickInstance(event.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px]"
          >
            {instances.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {instance.id} · {instance.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Link PCB element to ECAD instance"
            data-testid="pcb-mcu-link-add"
            disabled={
              readOnly || !elementValue || !instanceValue || alreadyLinked
            }
            onClick={addLink}
            className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Link
          </button>
          <button
            type="button"
            aria-label="Apply PCB netlist to ECAD"
            data-testid="pcb-mcu-bridge-apply"
            disabled={!ecad}
            onClick={applyNow}
            className="rounded bg-gray-800 px-2 py-0.5 hover:bg-gray-700 disabled:opacity-40"
          >
            Apply PCB nets
          </button>
          <span data-testid="pcb-mcu-bridge-status" className="text-gray-500">
            {bridgeText ||
              (links.length > 0
                ? "Nets apply automatically when links change."
                : "Link a PCB element to an ECAD instance to project nets.")}
          </span>
        </div>
        {links.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {links.map((link) => {
              const name =
                instances.find((instance) => instance.id === link.instance)
                  ?.name ?? link.instance;
              return (
                <span
                  key={link.designator}
                  className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-300"
                >
                  {link.designator} → {link.instance} ({name})
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Unlink ${link.designator}`}
                      data-testid={`pcb-mcu-unlink-${link.designator}`}
                      onClick={() => removeLink(link.designator)}
                      className="ml-1 text-gray-500 hover:text-white"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {readOnly && (
        <div className="rounded border border-amber-800 bg-amber-950/30 px-2 py-1 text-[10px] text-amber-200">
          Read-only document: the simulator runs locally, but changes are not
          persisted.
        </div>
      )}
      {ecad ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-700">
          <EcadPanel embedded ecad={ecad} />
        </div>
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-gray-700 bg-gray-900 text-xs text-gray-400">
          Starting virtual MCU runtime…
        </div>
      )}
    </div>
  );
}
