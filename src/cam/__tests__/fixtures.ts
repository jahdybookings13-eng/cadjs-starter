import {
  CAM_SCHEMA,
  CAM_VERSION,
  emptyCamDocument,
  type CamDocument,
  type CamOperation,
  type CamTool,
} from "../model";

export const sampleTool: CamTool = {
  id: "tool_1",
  name: "6 mm flat endmill",
  kind: "endmill",
  diameter: 6,
  flutes: 3,
  material: "carbide",
  fluteLength: 18,
  feed: 900,
  speed: 18000,
  safeZ: 5,
};

export const sampleOperation: CamOperation = {
  id: "op_1",
  name: "Outside contour",
  kind: "contour",
  toolId: "tool_1",
  depth: 6,
  stepdown: 2,
  stepover: 3,
  leadIn: 2,
  leadOut: 1,
  profile: { x: 10, y: 10, width: 40, height: 30 },
  holes: [],
  tabs: { count: 4, width: 4, height: 1 },
  order: 1,
};

export function sampleDocument(): CamDocument {
  const document = emptyCamDocument("Bracket CAM");
  return {
    ...document,
    schema: CAM_SCHEMA,
    v: CAM_VERSION,
    tools: [sampleTool],
    operations: [sampleOperation],
  };
}
