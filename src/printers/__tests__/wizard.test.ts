import { describe, it, expect } from "vitest";
import {
  initialWizardState,
  wizardDetect,
  wizardSelectProfile,
  wizardSlice,
  wizardUpload,
  wizardPollMonitor,
  getAdapter,
  estimateSlice,
  LOCAL_ADAPTER_KINDS,
  PRINTER_ACTIONS,
  type WizardState,
  type PrinterTarget,
  type PrintProfile,
} from "../index";
import { buildDefaultProfile } from "../profileStore";

const target: PrinterTarget = {
  id: "mock-printer",
  kind: "elegoo", // local stub — no network
  baseUrl: "http://127.0.0.1:9999",
};

const profile: PrintProfile = buildDefaultProfile("elegoo", "PLA");

function baselineState(): WizardState {
  return {
    ...initialWizardState(),
    target,
    step: "profile",
    detectInfo: "stub",
  };
}

describe("printer wizard state machine", () => {
  it("initialWizardState starts at detect", () => {
    const s = initialWizardState();
    expect(s.step).toBe("detect");
    expect(s.target).toBeNull();
    expect(s.profile).toBeNull();
    expect(s.monitor).toBeNull();
    expect(s.uploading).toBe(false);
    expect(s.errorMessage).toBeNull();
  });

  it("wizardDetect transitions to profile for a local-stub kind", async () => {
    const s = initialWizardState();
    const r = await wizardDetect(s, target);
    expect(r.step).toBe("profile");
    expect(r.target).not.toBeNull();
    expect(r.detectInfo).toContain("local stub");
  });

  it("wizardSelectProfile advances to slice", () => {
    const r = wizardSelectProfile(baselineState(), profile);
    expect(r.step).toBe("slice");
    expect(r.profile).toBe(profile);
  });

  it("wizardSlice advances to upload and computes estimate", () => {
    const s = { ...baselineState(), step: "slice" as const, profile };
    const bytes = new Uint8Array([1, 2, 3]);
    const r = wizardSlice(s, bytes, [10, 20, 30], "orca");
    expect(r.step).toBe("upload");
    expect(r.stlName).not.toBeNull();
    expect(r.stlBytes).toBe(bytes);
    expect(r.slices).not.toBeNull();
    expect(r.slices?.approximateSizeMM).toEqual([10, 20, 30]);
    expect(r.slices?.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });

  it("wizardSlice errors when no profile is set", () => {
    const r = wizardSlice(baselineState(), new Uint8Array(), [1, 1, 1], "orca");
    expect(r.step).toBe("error");
    expect(r.errorMessage).toBe("no profile selected");
  });

  it("wizardUpload errors when target or STL is missing", async () => {
    const r = await wizardUpload(initialWizardState());
    expect(r.step).toBe("error");
    expect(r.errorMessage).toBe("missing target or STL");
  });

  it("estimateSlice time scales with volume", () => {
    const p: PrintProfile = buildDefaultProfile("octoprint", "PLA");
    const small = estimateSlice([10, 10, 10], p);
    const large = estimateSlice([100, 100, 100], p);
    expect(large.estimatedMinutes).toBeGreaterThan(small.estimatedMinutes);
  });

  it("getAdapter returns the right kind for every PrinterKind", () => {
    expect(getAdapter("octoprint").kind).toBe("octoprint");
    expect(getAdapter("moonraker").kind).toBe("moonraker");
    for (const k of LOCAL_ADAPTER_KINDS) {
      expect(getAdapter(k).kind).toBe(k);
    }
  });

  it("wizardPollMonitor keeps monitor step while printing", async () => {
    const s: WizardState = {
      ...baselineState(),
      step: "monitor",
      monitor: {
        status: "printing",
        progress: 0.25,
        etaSeconds: 120,
        detail: "printing",
      },
    };
    const r = await wizardPollMonitor(s);
    expect(r.step).toBe("monitor");
    expect(r.monitor).not.toBeNull();
  });

  it("PRINTER_ACTIONS lists the full action set", () => {
    expect(PRINTER_ACTIONS).toContain("printer.detect");
    expect(PRINTER_ACTIONS).toContain("printer.selectProfile");
    expect(PRINTER_ACTIONS).toContain("printer.slice");
    expect(PRINTER_ACTIONS).toContain("printer.upload");
    expect(PRINTER_ACTIONS).toContain("printer.start");
    expect(PRINTER_ACTIONS).toContain("printer.pause");
    expect(PRINTER_ACTIONS).toContain("printer.resume");
    expect(PRINTER_ACTIONS).toContain("printer.cancel");
    expect(PRINTER_ACTIONS).toContain("printer.status");
  });
});
