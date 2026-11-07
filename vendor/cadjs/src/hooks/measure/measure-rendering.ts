import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { MEASURE } from "../../theme";
import type { EdgeSegmentData } from "./types";
import { SKETCH_ZERO_LENGTH_TOL } from "../../sketch-tolerances";

export function createLine2(
  positions: number[],
  color: number,
  linewidth: number,
  dashed: boolean = false,
): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color,
    linewidth,
    dashed,
    ...(dashed ? { dashSize: 0.15, gapSize: 0.1 } : {}),
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    depthTest: false,
  });
  if (dashed) {
    material.defines.USE_DASH = "";
  }
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 999;
  line.userData.isMeasureOverlay = true;
  return line;
}

export function createValueSprite(
  text: string,
  position: THREE.Vector3,
  color: number = MEASURE.text,
  bgColor: string = MEASURE.textBgCss,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  ctx.font = "bold 28px sans-serif";
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const padX = 16;
  const padY = 8;
  const bgWidth = Math.min(textWidth + padX * 2, 256);
  const bgX = (256 - bgWidth) / 2;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(bgX, padY, bgWidth, 64 - padY * 2, 6);
  ctx.fill();

  const hexStr = "#" + new THREE.Color(color).getHexString();
  ctx.fillStyle = hexStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(1.2, 0.3, 1);
  sprite.renderOrder = 1001;
  sprite.userData.isMeasureOverlay = true;
  return sprite;
}

export function createPointMarker(
  position: THREE.Vector3,
  color: number = MEASURE.point,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.04, 12, 12);
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.renderOrder = 1000;
  mesh.userData.isMeasureOverlay = true;
  return mesh;
}

export function tagOverlays(overlays: THREE.Object3D[], measurementId: string) {
  for (const obj of overlays) {
    obj.userData.measurementId = measurementId;
    obj.traverse((child) => {
      child.userData.measurementId = measurementId;
    });
  }
}

export function buildDistanceAnnotation(
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  distance: number,
  pinned: boolean = false,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const color = pinned ? MEASURE.pinnedLine : MEASURE.line;
  const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;

  const line = createLine2(
    [pointA.x, pointA.y, pointA.z, pointB.x, pointB.y, pointB.z],
    color,
    1.5,
  );
  objects.push(line);

  const markerA = createPointMarker(pointA);
  const markerB = createPointMarker(pointB);
  objects.push(markerA, markerB);

  const mid = pointA.clone().add(pointB).multiplyScalar(0.5);
  const dir = pointB.clone().sub(pointA).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const perp = dir.clone().cross(up);
  if (perp.length() < SKETCH_ZERO_LENGTH_TOL) {
    perp.set(1, 0, 0);
  }
  perp.normalize().multiplyScalar(0.15);
  const labelPos = mid.clone().add(perp);

  const label = createValueSprite(distance.toFixed(3), labelPos, textColor);
  objects.push(label);

  return objects;
}

export function buildEdgeLengthAnnotation(
  edgeData: EdgeSegmentData,
  length: number,
  pinned: boolean = false,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const color = pinned ? MEASURE.pinnedLine : MEASURE.edgeHighlight;
  const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;

  const positions: number[] = [];
  for (let i = 0; i < edgeData.segments.length; i++) {
    positions.push(edgeData.segments[i]!);
  }
  if (positions.length >= 6) {
    const edgeLine = createLine2(positions, color, 2.0);
    objects.push(edgeLine);
  }

  const labelPos = new THREE.Vector3(
    edgeData.midpoint.x,
    edgeData.midpoint.y + 0.2,
    edgeData.midpoint.z,
  );
  const label = createValueSprite(
    `L: ${length.toFixed(3)}`,
    labelPos,
    textColor,
  );
  objects.push(label);

  return objects;
}

export function buildAngleAnnotation(
  vertex: THREE.Vector3,
  dirA: THREE.Vector3,
  dirB: THREE.Vector3,
  angleDeg: number,
  pinned: boolean = false,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const color = pinned ? MEASURE.pinnedLine : MEASURE.angleArc;
  const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;

  const lineLen = 0.5;
  const endA = vertex
    .clone()
    .add(dirA.clone().normalize().multiplyScalar(lineLen));
  const endB = vertex
    .clone()
    .add(dirB.clone().normalize().multiplyScalar(lineLen));

  const lineA = createLine2(
    [vertex.x, vertex.y, vertex.z, endA.x, endA.y, endA.z],
    color,
    1.5,
  );
  objects.push(lineA);

  const lineB = createLine2(
    [vertex.x, vertex.y, vertex.z, endB.x, endB.y, endB.z],
    color,
    1.5,
  );
  objects.push(lineB);

  const arcRadius = 0.3;
  const angleRad = angleDeg * (Math.PI / 180);
  const segments = Math.max(8, Math.ceil(angleDeg / 5));

  const nA = dirA.clone().normalize();
  const nB = dirB.clone().normalize();
  const axis = nA.clone().cross(nB).normalize();
  if (axis.length() < 0.001) {
    const labelPos = vertex.clone().add(nA.clone().multiplyScalar(0.35));
    const label = createValueSprite(
      `${angleDeg.toFixed(1)}°`,
      labelPos,
      textColor,
    );
    objects.push(label);
    return objects;
  }

  const arcPositions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * angleRad;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, t);
    const pt = nA
      .clone()
      .applyQuaternion(q)
      .multiplyScalar(arcRadius)
      .add(vertex);
    arcPositions.push(pt.x, pt.y, pt.z);
  }

  if (arcPositions.length >= 6) {
    const arcLine = createLine2(arcPositions, color, 1.5);
    objects.push(arcLine);
  }

  const midAngle = angleRad / 2;
  const qMid = new THREE.Quaternion().setFromAxisAngle(axis, midAngle);
  const labelDir = nA.clone().applyQuaternion(qMid).normalize();
  const labelPos = vertex.clone().add(labelDir.multiplyScalar(arcRadius + 0.2));
  const label = createValueSprite(
    `${angleDeg.toFixed(1)}°`,
    labelPos,
    textColor,
  );
  objects.push(label);

  const marker = createPointMarker(vertex);
  objects.push(marker);

  return objects;
}
