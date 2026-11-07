// ecad/delivery.ts — firmware for MCUs the suit cannot emulate.
//
// The point of the virtual MCU work is "code ready, waiting on nothing but
// delivery". For the AVRs that means an in-app emulator; for the RP2040, the
// STM32F4 and the classic ESP32 it means a real in-app core. For the ESP32-S3 /
// ESP8266 / STM32F1 / Teensy / micro:bit / Due there is no in-app emulator, so
// the honest thing is to carry the real
// binary with the project — but "carry" is not enough: the image must be
// checked against the board it is attached to. This module reads the container
// (UF2 blocks, ELF headers, raw image) and reports what the bytes actually say:
// target architecture, entry point, loadable size, UF2 family. That turns
// "binary attached" into "ARM image that fits this chip" or a hard refusal when
// an ARM ELF is pushed at an Xtensa ESP32.

import { kilobytes, targetFor, type McuArch } from "./target";

export type BinaryFormat = "uf2" | "elf" | "bin" | "empty";

/** RP2040 UF2 family id (raspberrypi.com documentation). */
export const RP2040_UF2_FAMILY = 0xe48bff56;

/** Decode a `data:` URL (or bare base64) into bytes. */
export function bytesOf(payload: string): Uint8Array {
  const comma = payload.indexOf(",");
  const base64 =
    payload.startsWith("data:") && comma >= 0
      ? payload.slice(comma + 1)
      : payload;
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

/** Bytes → `data:` URL, so a binary survives JSON persistence untouched. */
export function dataUrlOf(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

const UF2_MAGIC = [0x55, 0x46, 0x32, 0x0a]; // "UF2\n"
const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46]; // "\x7fELF"

export function binaryFormat(payload: string): BinaryFormat {
  const bytes = bytesOf(payload);
  if (bytes.length === 0) return "empty";
  const starts = (magic: number[]) =>
    magic.every((byte, i) => bytes[i] === byte);
  if (starts(UF2_MAGIC)) return "uf2";
  if (starts(ELF_MAGIC)) return "elf";
  return "bin";
}

export function binaryBytes(payload: string): number {
  return bytesOf(payload).length;
}

// ---------------------------------------------------------------------------
// UF2
// ---------------------------------------------------------------------------

export interface Uf2Image {
  /** Dense image starting at `baseAddress`. */
  image: Uint8Array;
  baseAddress: number;
  family: number;
  blocks: number;
}

const UF2_BLOCK = 512;
const UF2_PAYLOAD_MAX = 476;
const UF2_MAGIC0 = 0x0a324655;
const UF2_MAGIC1 = 0x9e5d5157;

/**
 * Extract the flash image from a UF2 file. Returns null when the file has no
 * valid blocks. Only main-flash blocks (flag bit 0 clear) are used.
 */
export function uf2Image(payload: string): Uf2Image | null {
  const bytes = bytesOf(payload);
  if (binaryFormat(payload) !== "uf2" || bytes.length < UF2_BLOCK) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { address: number; data: Uint8Array }[] = [];
  let base = Number.POSITIVE_INFINITY;
  let end = 0;
  let family = 0;
  for (
    let offset = 0;
    offset + UF2_BLOCK <= bytes.length;
    offset += UF2_BLOCK
  ) {
    if (
      view.getUint32(offset, true) !== UF2_MAGIC0 ||
      view.getUint32(offset + 4, true) !== UF2_MAGIC1
    ) {
      continue;
    }
    const flags = view.getUint32(offset + 8, true);
    if (flags & 0x1) continue; // file container, not main flash
    const address = view.getUint32(offset + 12, true);
    const size = Math.min(view.getUint32(offset + 16, true), UF2_PAYLOAD_MAX);
    if (size === 0) continue;
    const data = bytes.slice(offset + 32, offset + 32 + size);
    chunks.push({ address, data });
    base = Math.min(base, address);
    end = Math.max(end, address + size);
    if (!family) family = view.getUint32(offset + 28, true);
  }
  if (!chunks.length || !Number.isFinite(base)) return null;
  const image = new Uint8Array(end - base);
  for (const chunk of chunks) image.set(chunk.data, chunk.address - base);
  return { image, baseAddress: base, family, blocks: chunks.length };
}

// ---------------------------------------------------------------------------
// ELF + verification
// ---------------------------------------------------------------------------

interface ElfFacts {
  arch: McuArch | null;
  machine: string | null;
  entry: number | null;
  imageBytes: number;
  issues: string[];
}

const ELF_MACHINES: Record<number, { arch: McuArch; name: string }> = {
  40: { arch: "arm", name: "ARM" },
  83: { arch: "avr", name: "AVR" },
  94: { arch: "xtensa", name: "Xtensa" },
};

function parseElf(bytes: Uint8Array): ElfFacts {
  const facts: ElfFacts = {
    arch: null,
    machine: null,
    entry: null,
    imageBytes: 0,
    issues: [],
  };
  // Only 32-bit little-endian MCU ELFs are parsed. Anything shorter/other is
  // reported as an opaque ELF rather than guessed at.
  if (bytes.length < 0x34 || bytes[4] !== 1 || bytes[5] !== 1) return facts;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const machineId = view.getUint16(0x12, true);
  const known = ELF_MACHINES[machineId];
  facts.arch = known?.arch ?? null;
  facts.machine = known?.name ?? `machine 0x${machineId.toString(16)}`;
  facts.entry = view.getUint32(0x18, true);

  const phoff = view.getUint32(0x1c, true);
  const phentsize = view.getUint16(0x2a, true);
  const phnum = view.getUint16(0x2c, true);
  if (
    phnum > 0 &&
    phentsize >= 32 &&
    phoff + phnum * phentsize <= bytes.length
  ) {
    for (let i = 0; i < phnum; i++) {
      const ph = phoff + i * phentsize;
      if (view.getUint32(ph, true) !== 1) continue; // PT_LOAD only
      const offset = view.getUint32(ph + 4, true);
      const filesz = view.getUint32(ph + 16, true);
      if (offset + filesz > bytes.length) {
        facts.issues.push(
          "ELF loadable segment extends past the end of the file",
        );
        continue;
      }
      facts.imageBytes += filesz;
    }
  }
  return facts;
}

export interface FirmwareFacts {
  format: BinaryFormat;
  bytes: number;
  arch: McuArch | null;
  machine: string | null;
  entry: number | null;
  /** Size the linker produced (loadable segments, UF2 payload or raw bytes). */
  imageBytes: number;
  uf2Family: number | null;
  blocks: number;
  /** Hard problems: wrong architecture, over flash, truncated container. */
  issues: string[];
  summary: string;
}

function hex(value: number): string {
  return `0x${value.toString(16)}`;
}

/**
 * Read a firmware image and check it against the board's MCU.
 *
 * `issues` are hard failures (upload is refused); a wrong-but-unparseable
 * image yields an empty list and a summary that says what could be verified.
 */
export function inspectFirmware(
  payload: string,
  mcu: string | undefined,
): FirmwareFacts {
  const bytes = bytesOf(payload);
  const format = binaryFormat(payload);
  const target = targetFor(mcu);
  const issues: string[] = [];
  let arch: McuArch | null = null;
  let machine: string | null = null;
  let entry: number | null = null;
  let imageBytes = bytes.length;
  let uf2Family: number | null = null;
  let blocks = 0;

  if (format === "empty") issues.push("empty firmware image");

  if (format === "elf") {
    const elf = parseElf(bytes);
    arch = elf.arch;
    machine = elf.machine;
    entry = elf.entry;
    if (elf.imageBytes > 0) imageBytes = elf.imageBytes;
    issues.push(...elf.issues);
  }

  if (format === "uf2") {
    const uf2 = uf2Image(payload);
    if (!uf2) {
      issues.push("UF2 has no valid 512-byte blocks");
    } else {
      imageBytes = uf2.image.length;
      uf2Family = uf2.family;
      blocks = uf2.blocks;
      if (
        target?.mcu.startsWith("RP2040") &&
        uf2.family !== 0 &&
        uf2.family !== RP2040_UF2_FAMILY
      ) {
        issues.push(
          `UF2 family ${hex(uf2.family)} is not RP2040 (${hex(RP2040_UF2_FAMILY)})`,
        );
      }
    }
  }

  if (format !== "empty" && !target) {
    issues.push(`no target profile for ${mcu ?? "unknown MCU"}`);
  }
  if (target && imageBytes > target.flashBytes) {
    issues.push(
      `image is ${kilobytes(imageBytes)} KB but ${target.mcu} has ${kilobytes(target.flashBytes)} KB of flash`,
    );
  }
  if (target && arch && arch !== target.arch) {
    issues.push(
      `image is ${machine ?? arch} but ${target.mcu} is ${target.core} (${target.arch})`,
    );
  }

  let summary: string;
  if (format === "elf") {
    summary = `${machine ?? "ELF"} ELF · ${kilobytes(imageBytes)} KB${
      entry !== null ? ` · entry ${hex(entry)}` : ""
    }`;
  } else if (format === "uf2") {
    summary = `UF2 · ${blocks} block(s)${
      uf2Family !== null ? ` · family ${hex(uf2Family)}` : ""
    } · ${kilobytes(imageBytes)} KB`;
  } else if (format === "empty") {
    summary = "empty image";
  } else {
    summary = `raw image · ${bytes.length} B`;
  }
  if (target && imageBytes <= target.flashBytes) {
    summary += ` · fits ${kilobytes(target.flashBytes)} KB flash`;
  }

  return {
    format,
    bytes: bytes.length,
    arch,
    machine,
    entry,
    imageBytes,
    uf2Family,
    blocks,
    issues,
    summary,
  };
}
