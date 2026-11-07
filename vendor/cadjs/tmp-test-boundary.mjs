import { SketchToBrepService, OccWorkerClient, Brep } from './dist/index.mjs';

const boxJson = {
  btType: 'BrepJSON', schema: 1,
  vertices: [
    {x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:2,z:0},{x:0,y:2,z:0},
    {x:0,y:0,z:1},{x:2,y:0,z:1},{x:2,y:2,z:1},{x:0,y:2,z:1},
  ],
  edges: [
    {start:{x:0,y:0,z:0},end:{x:2,y:0,z:0},curve:null},
    {start:{x:2,y:0,z:0},end:{x:2,y:2,z:0},curve:null},
    {start:{x:2,y:2,z:0},end:{x:0,y:2,z:0},curve:null},
    {start:{x:0,y:2,z:0},end:{x:0,y:0,z:0},curve:null},
    {start:{x:0,y:0,z:1},end:{x:2,y:0,z:1},curve:null},
    {start:{x:2,y:0,z:1},end:{x:2,y:2,z:1},curve:null},
    {start:{x:2,y:2,z:1},end:{x:0,y:2,z:1},curve:null},
    {start:{x:0,y:2,z:1},end:{x:0,y:0,z:1},curve:null},
    {start:{x:0,y:0,z:0},end:{x:0,y:0,z:1},curve:null},
    {start:{x:2,y:0,z:0},end:{x:2,y:0,z:1},curve:null},
    {start:{x:2,y:2,z:0},end:{x:2,y:2,z:1},curve:null},
    {start:{x:0,y:2,z:0},end:{x:0,y:2,z:1},curve:null},
  ],
  faces: [
    {vertices:[{x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:2,z:0},{x:0,y:2,z:0}],normal:[0,0,-1]},
    {vertices:[{x:0,y:0,z:1},{x:2,y:0,z:1},{x:2,y:2,z:1},{x:0,y:2,z:1}],normal:[0,0,1]},
    {vertices:[{x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:0,z:1},{x:0,y:0,z:1}],normal:[0,-1,0]},
    {vertices:[{x:2,y:0,z:0},{x:2,y:2,z:0},{x:2,y:2,z:1},{x:2,y:0,z:1}],normal:[1,0,0]},
    {vertices:[{x:2,y:2,z:0},{x:0,y:2,z:0},{x:0,y:2,z:1},{x:2,y:2,z:1}],normal:[0,1,0]},
    {vertices:[{x:0,y:2,z:0},{x:0,y:0,z:0},{x:0,y:0,z:1},{x:0,y:2,z:1}],normal:[-1,0,0]},
  ],
};
const brep = Brep.fromJSON(boxJson);
function tagEdge(brep, i) { return `F0_E${i}`; }
const faceIdxs = [0, 1, 2, 3];

const client = OccWorkerClient.getInstance();
client.init();
const result = await client.exec({
  type: 'surfaceOp',
  payload: {
    kind: 'boundary',
    brepJson: boxJson,
    position: { x: 0, y: 0, z: 0 },
    edgeIndices: [1, 2, 3, 4],
  },
});
console.log('error?', result.err ?? null);
if (result.err) console.log(result.err);
const r = result.result ?? result;
console.log('faces', r.brepJson?.faces?.length, 'edges', r.brepJson?.edges?.length);
client.close();
process.exit(0);
