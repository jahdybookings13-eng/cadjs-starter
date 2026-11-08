// Standard-content catalog for assembly insertion. Geometry is authored in the
// source Part Studio by the scene (fastener presets or primitive solids), so the
// inserted part remains a real, editable body rather than an assembly-only
// placeholder.

export type StandardPartKind = "bolt" | "washer" | "bearing";

export interface StandardPartSpec {
  id: string;
  kind: StandardPartKind;
  name: string;
  standard: "ISO" | "ANSI";
  size: string;
  /** Overall length for bolts; thickness for washers; width for bearings. */
  lengthMM: number;
  /** Outer radius in millimetres. */
  radiusMM: number;
  /** Inner radius for washers/bearings; zero for solid bolts. */
  innerRadiusMM: number;
  materialId: "steel" | "aluminum" | "brass";
}

export const STANDARD_CONTENT: readonly StandardPartSpec[] = [
  {
    id: "iso-4762-m6x20",
    kind: "bolt",
    name: "Socket head cap screw M6 × 20",
    standard: "ISO",
    size: "M6",
    lengthMM: 20,
    radiusMM: 3,
    innerRadiusMM: 0,
    materialId: "steel",
  },
  {
    id: "iso-4762-m8x30",
    kind: "bolt",
    name: "Socket head cap screw M8 × 30",
    standard: "ISO",
    size: "M8",
    lengthMM: 30,
    radiusMM: 4,
    innerRadiusMM: 0,
    materialId: "steel",
  },
  {
    id: "iso-7089-m6",
    kind: "washer",
    name: "Plain washer M6",
    standard: "ISO",
    size: "M6",
    lengthMM: 1.6,
    radiusMM: 6,
    innerRadiusMM: 3.2,
    materialId: "steel",
  },
  {
    id: "iso-7089-m8",
    kind: "washer",
    name: "Plain washer M8",
    standard: "ISO",
    size: "M8",
    lengthMM: 1.6,
    radiusMM: 8,
    innerRadiusMM: 4.2,
    materialId: "steel",
  },
  {
    id: "iso-15-6004",
    kind: "bearing",
    name: "Deep groove bearing 6004",
    standard: "ISO",
    size: "6004",
    lengthMM: 12,
    radiusMM: 21,
    innerRadiusMM: 10,
    materialId: "steel",
  },
  {
    id: "ansi-1252-1_4x1",
    kind: "bolt",
    name: "Hex bolt 1/4-20 × 1 in",
    standard: "ANSI",
    size: "1/4-20",
    lengthMM: 25.4,
    radiusMM: 3.175,
    innerRadiusMM: 0,
    materialId: "steel",
  },
] as const;

export function standardPartById(id: string): StandardPartSpec | undefined {
  return STANDARD_CONTENT.find((part) => part.id === id);
}

export function standardPartsForKind(
  kind: StandardPartKind,
): StandardPartSpec[] {
  return STANDARD_CONTENT.filter((part) => part.kind === kind);
}

export function standardPartLabel(part: StandardPartSpec): string {
  return `${part.name} · ${part.standard} ${part.size}`;
}
