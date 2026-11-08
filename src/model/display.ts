export type DisplayStyle =
  | "shaded"
  | "shaded-no-edges"
  | "shaded-hidden-edges"
  | "hidden-edges-removed"
  | "hidden-edges-visible"
  | "translucent";

export type SectionAxis = "off" | "x" | "y" | "z";

export const DISPLAY_STYLES: {
  id: DisplayStyle;
  label: string;
  detail: string;
}[] = [
  {
    id: "shaded",
    label: "Shaded",
    detail: "Shaded faces with visible edges",
  },
  {
    id: "shaded-no-edges",
    label: "Shaded without edges",
    detail: "Shaded faces, no edge lines",
  },
  {
    id: "shaded-hidden-edges",
    label: "Shaded with hidden edges",
    detail: "Shaded faces with occluded edges",
  },
  {
    id: "hidden-edges-removed",
    label: "Hidden edges removed",
    detail: "White faces with bold visible edges",
  },
  {
    id: "hidden-edges-visible",
    label: "Hidden edges visible",
    detail: "White faces with all edges",
  },
  {
    id: "translucent",
    label: "Translucent",
    detail: "See-through shaded faces",
  },
];

export const SECTION_AXES: {
  id: Exclude<SectionAxis, "off">;
  label: string;
}[] = [
  { id: "x", label: "X" },
  { id: "y", label: "Y" },
  { id: "z", label: "Z" },
];
