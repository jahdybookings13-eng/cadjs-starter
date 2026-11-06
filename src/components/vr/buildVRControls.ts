import * as THREE from "three";
import { FEATURE_MAP } from "../../model/featureMap";

// Legacy belt order is pinned by e2e/vr-bridge.spec.ts (beltSeg[7] == Measure).
const LEGACY_FIRST: { name: string; featureType: string }[] = [
  { name: "Sketch", featureType: "newSketch" },
  { name: "Extrude", featureType: "extrude" },
  { name: "Loft", featureType: "loft" },
  { name: "Sweep", featureType: "sweep" },
  { name: "Revolve", featureType: "revolve" },
  { name: "Fillet", featureType: "fillet" },
  { name: "Shell", featureType: "shell" },
  { name: "Measure", featureType: "measure" },
];
const legacyKeys = new Set(LEGACY_FIRST.map((a) => a.featureType));
const seen = new Set<string>();
const DEFAULT_ACTIONS: { name: string; featureType: string }[] = [
  ...LEGACY_FIRST,
  ...FEATURE_MAP.filter(
    (e) =>
      e.status === "implemented" &&
      !legacyKeys.has(e.featureType) &&
      (seen.has(e.featureType) ? false : (seen.add(e.featureType), true)),
  ).map((e) => ({ name: e.label, featureType: e.featureType })),
];

export interface VRAction {
  name: string;
  featureType: string;
}

export function buildVRControls(actions: VRAction[] = DEFAULT_ACTIONS) {
  const group = new THREE.Group();
  group.name = "vr-controls";

  // === ABOVE-HEAD ACTION MENU (deprecated - using carousel instead) ===
  const headMenu = new THREE.Group();
  headMenu.name = "head-menu";
  headMenu.visible = false;

  const menuCanvas = document.createElement("canvas");
  menuCanvas.width = 512;
  menuCanvas.height = 512;
  const mctx = menuCanvas.getContext("2d")!;

  mctx.fillStyle = "rgba(10, 12, 18, 0.92)";
  mctx.fillRect(0, 0, 512, 512);
  mctx.strokeStyle = "rgba(80, 120, 255, 0.6)";
  mctx.lineWidth = 2;
  mctx.strokeRect(2, 2, 508, 508);

  mctx.fillStyle = "rgba(180, 200, 255, 0.9)";
  mctx.font = "bold 28px monospace";
  mctx.textAlign = "center";
  mctx.fillText("ACTIONS", 256, 40);

  mctx.font = "24px monospace";
  actions.forEach((action, i) => {
    const y = 80 + i * 52;
    mctx.fillStyle = "rgba(60, 80, 120, 0.5)";
    mctx.fillRect(20, y - 20, 472, 44);
    mctx.fillStyle = "rgba(220, 230, 255, 0.95)";
    mctx.fillText(action.name, 256, y + 8);
  });

  const menuTex = new THREE.CanvasTexture(menuCanvas);
  menuTex.needsUpdate = true;
  const menuMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({
      map: menuTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  menuMesh.name = "head-menu-panel";
  headMenu.add(menuMesh);
  group.add(headMenu);

  // === DOWNWARD CAROUSEL MENU ===
  const carousel = new THREE.Group();
  carousel.name = "carousel";
  carousel.visible = false;

  const CAROUSEL_RADIUS = 0.2;
  const RING_THICKNESS = 0.05;
  const GAP_RATIO = 0.06;
  const SEGMENTS_PER_ARC = 16;

  function buildArcGeometry(
    innerR: number,
    outerR: number,
    startAngle: number,
    sweepAngle: number,
    segments: number,
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];

    for (let s = 0; s < segments; s++) {
      const a0 = startAngle + (s / segments) * sweepAngle;
      const a1 = startAngle + ((s + 1) / segments) * sweepAngle;
      const c0 = Math.cos(a0),
        s0 = Math.sin(a0);
      const c1 = Math.cos(a1),
        s1 = Math.sin(a1);

      positions.push(
        innerR * c0,
        innerR * s0,
        0,
        outerR * c0,
        outerR * s0,
        0,
        outerR * c1,
        outerR * s1,
        0,
      );
      positions.push(
        innerR * c0,
        innerR * s0,
        0,
        outerR * c1,
        outerR * s1,
        0,
        innerR * c1,
        innerR * s1,
        0,
      );

      const u0 = s / segments,
        u1 = (s + 1) / segments;
      uvs.push(u0, 0, u0, 1, u1, 1);
      uvs.push(u0, 0, u1, 1, u1, 0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  const totalAngle = Math.PI * 2;
  const gapAngle = (GAP_RATIO * totalAngle) / actions.length;
  const segAngle = totalAngle / actions.length - gapAngle;

  actions.forEach((action, i) => {
    const centerAngle = (i / actions.length) * totalAngle;
    const startAngle = centerAngle - segAngle / 2;

    const buttonGroup = new THREE.Group();
    buttonGroup.name = `carousel-button-${i}`;
    buttonGroup.userData.actionName = action.name;
    buttonGroup.userData.featureType = action.featureType;

    const arcGeo = buildArcGeometry(
      CAROUSEL_RADIUS - RING_THICKNESS / 2,
      CAROUSEL_RADIUS + RING_THICKNESS / 2,
      startAngle,
      segAngle,
      SEGMENTS_PER_ARC,
    );
    const buttonBg = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({
        color: 0x1a2030,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    buttonBg.position.set(0, 0, 0.001);
    buttonGroup.add(buttonBg);

    const textCanvas = document.createElement("canvas");
    textCanvas.width = 256;
    textCanvas.height = 64;
    const tctx = textCanvas.getContext("2d")!;
    tctx.fillStyle = "rgba(0,0,0,0)";
    tctx.fillRect(0, 0, 256, 64);
    tctx.fillStyle = "#88ccff";
    tctx.font = "bold 28px monospace";
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillText(action.name, 128, 32);

    const textTex = new THREE.CanvasTexture(textCanvas);
    textTex.needsUpdate = true;
    const textMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        CAROUSEL_RADIUS * segAngle * 0.85,
        RING_THICKNESS * 0.7,
      ),
      new THREE.MeshBasicMaterial({
        map: textTex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    textMesh.position.set(
      Math.cos(centerAngle) * CAROUSEL_RADIUS,
      Math.sin(centerAngle) * CAROUSEL_RADIUS,
      0.01,
    );
    textMesh.rotation.z = centerAngle + Math.PI / 2;
    buttonGroup.add(textMesh);

    buttonGroup.rotation.x = -Math.PI / 2;

    carousel.add(buttonGroup);
  });

  group.add(carousel);

  // === CONTROLLER RAYS ===
  const leftRay = new THREE.Group();
  leftRay.name = "left-ray";
  const rightRay = new THREE.Group();
  rightRay.name = "right-ray";

  // Create ray line geometry — -Z is forward when oriented by targetRaySpace
  const rayGeometry = new THREE.BufferGeometry();
  const rayPositions = new Float32Array([0, 0, 0, 0, 0, -1]);
  rayGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rayPositions, 3),
  );

  const rayMaterial = new THREE.LineBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.6,
  });

  const leftRayLine = new THREE.Line(rayGeometry.clone(), rayMaterial.clone());
  const rightRayLine = new THREE.Line(rayGeometry.clone(), rayMaterial.clone());

  leftRay.add(leftRayLine);
  rightRay.add(rightRayLine);

  // Controller spheres to show hand positions
  const controllerGeometry = new THREE.SphereGeometry(0.02, 16, 16);
  const controllerMaterial = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.8,
  });

  const leftController = new THREE.Mesh(
    controllerGeometry,
    controllerMaterial.clone(),
  );
  const rightController = new THREE.Mesh(
    controllerGeometry,
    controllerMaterial.clone(),
  );

  leftRay.add(leftController);
  rightRay.add(rightController);

  group.add(leftRay);
  group.add(rightRay);

  // === PENCIL (for grabbing) ===
  const pencil = new THREE.Group();
  pencil.name = "pencil";
  pencil.visible = false;

  const pencilBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.12, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffdd00,
      roughness: 0.5,
      metalness: 0.2,
    }),
  );
  pencil.add(pencilBody);

  const pencilTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.006, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }),
  );
  pencilTip.position.y = 0.07;
  pencil.add(pencilTip);

  const pencilEraser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0065, 0.0065, 0.015, 16),
    new THREE.MeshStandardMaterial({ color: 0xff6666, roughness: 0.9 }),
  );
  pencilEraser.position.y = -0.0675;
  pencil.add(pencilEraser);

  group.add(pencil);

  return {
    group,
    headMenu,
    carousel,
    pencil,
    leftRay,
    rightRay,
    isLookingUp: (headDir: THREE.Vector3) => headDir.y > 0.7,
    isLookingDown: (headDir: THREE.Vector3) => headDir.y < -0.5,
    isReachingBehindEar: (
      handPos: THREE.Vector3,
      headPos: THREE.Vector3,
      headQuat: THREE.Quaternion,
    ) => {
      const rightEar = new THREE.Vector3(0.1, 0.1, -0.05)
        .applyQuaternion(headQuat)
        .add(headPos);
      return handPos.distanceTo(rightEar) < 0.08;
    },
    updateHeadMenu: (headQuat: THREE.Quaternion, headPos: THREE.Vector3) => {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      headMenu.position.copy(headPos).add(forward.multiplyScalar(0.5));
      headMenu.position.y += 0.3;
      headMenu.quaternion.copy(headQuat);
    },
    updateCarousel: (
      headQuat: THREE.Quaternion,
      headPos: THREE.Vector3,
      playerOffset: THREE.Vector3,
      rotationOffset: number,
      selectedIndex: number,
    ) => {
      const WAIST_HEIGHT = 0.8;
      carousel.position.set(
        headPos.x - playerOffset.x,
        WAIST_HEIGHT - playerOffset.y,
        headPos.z - playerOffset.z,
      );
      carousel.quaternion.identity();
      carousel.rotation.y = rotationOffset;

      carousel.children.forEach((child, i) => {
        if (child.name?.startsWith("carousel-button-")) {
          const buttonGroup = child as THREE.Group;
          const buttonIndex = parseInt(buttonGroup.name.split("-")[2]!);
          const isSelected = buttonIndex === selectedIndex;

          if (isSelected) {
            buttonGroup.scale.setScalar(1.2);
            const bg = buttonGroup.children[0] as THREE.Mesh;
            if (Array.isArray(bg.material)) {
              const mat = bg.material[0] as THREE.MeshBasicMaterial;
              mat.color.setHex(0x4466ff);
              mat.opacity = 0.95;
            } else if (bg.material instanceof THREE.MeshBasicMaterial) {
              bg.material.color.setHex(0x4466ff);
              bg.material.opacity = 0.95;
            }
          } else {
            buttonGroup.scale.setScalar(1.0);
            const bg = buttonGroup.children[0] as THREE.Mesh;
            if (Array.isArray(bg.material)) {
              const mat = bg.material[0] as THREE.MeshBasicMaterial;
              mat.color.setHex(0x1a2030);
              mat.opacity = 0.8;
            } else if (bg.material instanceof THREE.MeshBasicMaterial) {
              bg.material.color.setHex(0x1a2030);
              bg.material.opacity = 0.8;
            }
          }
        }
      });
    },
  };
}
