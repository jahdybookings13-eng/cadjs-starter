import * as THREE from "three";

export interface VRRoomOptions {
  deskWidth?: number;
  deskDepth?: number;
  deskHeight?: number;
  padWidth?: number;
  padDepth?: number;
}

const DEFAULTS: Required<VRRoomOptions> = {
  deskWidth: 1.6,
  deskDepth: 0.8,
  deskHeight: 0.75,
  padWidth: 0.4,
  padDepth: 0.3,
};

export function buildVRRoom(opts: VRRoomOptions = {}): THREE.Group {
  const { deskWidth, deskDepth, deskHeight, padWidth, padDepth } = {
    ...DEFAULTS,
    ...opts,
  };

  const room = new THREE.Group();
  room.name = "vr-room";

  // === DARK ROOM ===
  const roomW = 5;
  const roomD = 5;
  const roomH = 3;

  const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.95,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  room.add(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(roomW, roomD);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x141418,
    roughness: 1.0,
  });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = roomH;
  room.add(ceil);

  // 4 Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x18181c,
    roughness: 0.95,
  });

  // Back wall (negative Z)
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
  backWall.position.set(0, roomH / 2, -roomD / 2);
  room.add(backWall);

  // Front wall (positive Z)
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, roomH / 2, roomD / 2);
  room.add(frontWall);

  // Left wall (negative X)
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-roomW / 2, roomH / 2, 0);
  room.add(leftWall);

  // Right wall (positive X)
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(roomW / 2, roomH / 2, 0);
  room.add(rightWall);

  // Overhead spot — only illuminates desk area
  const spot = new THREE.SpotLight(0xfff4e0, 2.5, 8, 0.35, 0.4);
  spot.position.set(0, 2.5, 0);
  spot.target.position.set(0, deskHeight, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  room.add(spot);
  room.add(spot.target);

  // Barely-there ambient
  const ambient = new THREE.AmbientLight(0x0a0a12, 0.06);
  room.add(ambient);

  // === DESK ===
  const deskGroup = new THREE.Group();
  deskGroup.name = "desk";
  deskGroup.position.y = 0;

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x3d2010,
    roughness: 0.85,
  });

  // Tabletop
  const topGeo = new THREE.BoxGeometry(deskWidth, 0.04, deskDepth);
  const top = new THREE.Mesh(topGeo, woodMat);
  top.position.y = deskHeight;
  top.castShadow = true;
  top.receiveShadow = true;
  deskGroup.add(top);

  // 4 legs
  const legGeo = new THREE.BoxGeometry(0.06, deskHeight, 0.06);
  const legPositions = [
    [-deskWidth / 2 + 0.04, deskHeight / 2, -deskDepth / 2 + 0.04],
    [deskWidth / 2 - 0.04, deskHeight / 2, -deskDepth / 2 + 0.04],
    [-deskWidth / 2 + 0.04, deskHeight / 2, deskDepth / 2 - 0.04],
    [deskWidth / 2 - 0.04, deskHeight / 2, deskDepth / 2 - 0.04],
  ];
  for (const pos of legPositions) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(pos[0]!, pos[1]!, pos[2]!);
    leg.castShadow = true;
    deskGroup.add(leg);
  }

  // Desk props (atmospheric only)
  // Pencil holder — 4 thin cylinders
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.6,
    metalness: 0.3,
  });
  const holderBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.06, 16),
    propMat,
  );
  holderBase.position.set(
    deskWidth / 2 - 0.12,
    deskHeight + 0.05,
    -deskDepth / 2 + 0.08,
  );
  deskGroup.add(holderBase);

  // Ruler
  const rulerMat = new THREE.MeshStandardMaterial({
    color: 0xcccc88,
    roughness: 0.3,
    metalness: 0.6,
  });
  const ruler = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.002, 0.025),
    rulerMat,
  );
  ruler.position.set(0.15, deskHeight + 0.022, -deskDepth / 2 + 0.04);
  ruler.rotation.y = 0.1;
  deskGroup.add(ruler);

  // Rolled blueprints
  const bpMat = new THREE.MeshStandardMaterial({
    color: 0x2244aa,
    roughness: 0.9,
  });
  const bp1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.25, 12),
    bpMat,
  );
  bp1.rotation.z = Math.PI / 2;
  bp1.position.set(
    -deskWidth / 2 + 0.15,
    deskHeight + 0.025,
    -deskDepth / 2 + 0.08,
  );
  deskGroup.add(bp1);

  room.add(deskGroup);

  // === MEASURING PAD (green cutting mat with 3 perspectives) ===
  const padGroup = new THREE.Group();
  padGroup.name = "measuring-pad";
  padGroup.position.set(0, deskHeight + 0.022, deskDepth / 2 - 0.15);

  const padCanvas = document.createElement("canvas");
  const padRes = 2048;
  padCanvas.width = padRes;
  padCanvas.height = padRes;
  const pctx = padCanvas.getContext("2d")!;

  // Green cutting mat base
  pctx.fillStyle = "#1a3520";
  pctx.fillRect(0, 0, padRes, padRes);

  const mmToPad = padRes / (padWidth * 1000);

  // Fine grid — 10mm
  pctx.strokeStyle = "rgba(60, 120, 70, 0.4)";
  pctx.lineWidth = 1;
  for (let mm = 0; mm <= padWidth * 1000; mm += 10) {
    const px = mm * mmToPad;
    pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, padRes); pctx.stroke();
  }
  for (let mm = 0; mm <= padDepth * 1000; mm += 10) {
    const py = mm * mmToPad;
    pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(padRes, py); pctx.stroke();
  }

  // Major grid — 50mm
  pctx.strokeStyle = "rgba(80, 160, 90, 0.6)";
  pctx.lineWidth = 1.5;
  for (let mm = 0; mm <= padWidth * 1000; mm += 50) {
    const px = mm * mmToPad;
    pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, padRes); pctx.stroke();
  }
  for (let mm = 0; mm <= padDepth * 1000; mm += 50) {
    const py = mm * mmToPad;
    pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(padRes, py); pctx.stroke();
  }

  // 3 perspective sections (dividers + labels)
  const thirdW = padRes / 3;
  pctx.strokeStyle = "rgba(200, 220, 200, 0.5)";
  pctx.lineWidth = 2;
  pctx.beginPath(); pctx.moveTo(thirdW, 0); pctx.lineTo(thirdW, padRes); pctx.stroke();
  pctx.beginPath(); pctx.moveTo(thirdW * 2, 0); pctx.lineTo(thirdW * 2, padRes); pctx.stroke();

  // Perspective axis lines per section
  const axisColors = ["rgba(255,80,80,0.7)", "rgba(80,255,80,0.7)", "rgba(80,80,255,0.7)"];
  const labels = ["TOP", "FRONT", "SIDE"];
  pctx.font = `bold ${Math.round(padRes * 0.03)}px monospace`;

  for (let i = 0; i < 3; i++) {
    const cx = thirdW * i + thirdW / 2;
    const cy = padRes / 2;

    // Center crosshair
    pctx.strokeStyle = axisColors[i]!;
    pctx.lineWidth = 2;
    pctx.beginPath(); pctx.moveTo(thirdW * i + 20, cy); pctx.lineTo(thirdW * (i + 1) - 20, cy); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(cx, 20); pctx.lineTo(cx, padRes - 20); pctx.stroke();

    // Label
    pctx.fillStyle = "rgba(200, 220, 200, 0.8)";
    pctx.textAlign = "center";
    pctx.fillText(labels[i]!, cx, padRes * 0.06);
  }

  // Measurement labels along edges
  pctx.fillStyle = "rgba(180, 210, 180, 0.7)";
  pctx.font = `${Math.round(padRes * 0.012)}px monospace`;
  pctx.textAlign = "center";
  for (let mm = 0; mm <= padWidth * 1000; mm += 50) {
    const px = mm * mmToPad;
    pctx.fillText(mm === 0 ? "0" : `${mm}`, px, padRes - 4);
  }
  pctx.textAlign = "left";
  for (let mm = 0; mm <= padDepth * 1000; mm += 50) {
    const py = mm * mmToPad;
    pctx.fillText(mm === 0 ? "0" : `${mm}`, 4, py + padRes * 0.01);
  }

  pctx.fillStyle = "rgba(180, 210, 180, 0.5)";
  pctx.font = `${Math.round(padRes * 0.016)}px monospace`;
  pctx.textAlign = "right";
  pctx.fillText("mm", padRes - 6, padRes - 6);

  const padTex = new THREE.CanvasTexture(padCanvas);
  padTex.needsUpdate = true;

  const padGeo = new THREE.PlaneGeometry(padWidth, padDepth);
  const padMat = new THREE.MeshStandardMaterial({
    map: padTex,
    roughness: 0.95,
  });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.rotation.x = -Math.PI / 2;
  padMesh.receiveShadow = true;
  padGroup.add(padMesh);

  room.add(padGroup);

  return room;
}

export function disposeVRRoom(room: THREE.Group) {
  room.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  });
}
