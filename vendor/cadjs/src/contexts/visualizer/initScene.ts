import * as THREE from "three";
import { SCENE, LIGHTING } from "../../theme";

export interface InitSceneResult {
  scene: THREE.Scene;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  bgTexture: THREE.CanvasTexture;
}

/**
 * Build a fresh Three.js scene with cameras, renderer, and the standard 4-light setup.
 * Pure: no refs, no state, no side effects on the DOM yet, caller mounts the renderer.
 *
 * `width`/`height` should be the canvas container's logical (CSS) dimensions; the
 * caller is responsible for re-sizing on container changes (see `useSceneAndRenderer`).
 */
export function initSceneObjects(
  width: number,
  height: number,
): InitSceneResult {
  const scene = new THREE.Scene();

  // Gradient background (top-to-bottom light gray, like Fusion 360)
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(
    0,
    `#${SCENE.backgroundTop.toString(16).padStart(6, "0")}`,
  );
  gradient.addColorStop(
    1,
    `#${SCENE.backgroundBottom.toString(16).padStart(6, "0")}`,
  );
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const bgTexture = new THREE.CanvasTexture(canvas);
  bgTexture.needsUpdate = true;
  scene.background = bgTexture;

  const aspect = width / height;

  const perspCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  perspCamera.position.set(0, 0, 10);

  // Compute initial ortho frustum from perspective FOV at distance 10
  const distance = 10;
  const fovRad = (75 * Math.PI) / 180;
  const halfHeight = distance * Math.tan(fovRad / 2);
  const orthoCamera = new THREE.OrthographicCamera(
    -halfHeight * aspect,
    halfHeight * aspect,
    halfHeight,
    -halfHeight,
    0.1,
    1000,
  );
  orthoCamera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);

  const ambientLight = new THREE.AmbientLight(
    LIGHTING.ambient.color,
    LIGHTING.ambient.intensity,
  );
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    LIGHTING.hemisphereTop,
    LIGHTING.hemisphereBottom,
    LIGHTING.hemisphereIntensity,
  );
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(
    LIGHTING.keyLight.color,
    LIGHTING.keyLight.intensity,
  );
  keyLight.position.set(...LIGHTING.keyLight.position);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(
    LIGHTING.fillLight.color,
    LIGHTING.fillLight.intensity,
  );
  fillLight.position.set(...LIGHTING.fillLight.position);
  scene.add(fillLight);

  return { scene, perspCamera, orthoCamera, renderer, bgTexture };
}
