import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { useCadCore } from "../../../contexts/CoreContext";
import { useCadVisualizer } from "../../../contexts/VisualizerContext";
import {
  SketchPlane,
  SketchPlaneType,
  createSketchPlane,
  createSketchPlaneFromNormal,
} from "../../../types/sketch-types";
import { NodeId, nodeId as toNodeId } from "../../../scene-operations/types";
import { SKETCH_PLANE as PLANE_THEME, SKETCH } from "../../../theme";
import { SKETCH_PLANE_Z_LIFT_MM } from "../../../visual-constants";

interface UseSketchPlaneSelectionParams {
  cameraAnimFrameRef: React.MutableRefObject<number | null>;
  sketchHidGroundPlaneRef: React.MutableRefObject<boolean>;
  originalProjectionRef: React.MutableRefObject<
    "perspective" | "orthographic" | null
  >;
  projectionTypeRef: React.MutableRefObject<"perspective" | "orthographic">;
  dimSceneBodies: () => void;
  orientCameraToPlane: (plane: SketchPlane, onComplete?: () => void) => void;
  createSketchGrid: (plane: SketchPlane, gridSizeOverride?: number) => void;
  cleanupSketchGrid: () => void;
  raycastToObjects: (
    event: MouseEvent,
    objects: THREE.Object3D[],
    recursive?: boolean,
  ) => THREE.Intersection[];
}

export function useSketchPlaneSelection({
  cameraAnimFrameRef,
  sketchHidGroundPlaneRef,
  originalProjectionRef,
  projectionTypeRef,
  dimSceneBodies,
  orientCameraToPlane,
  createSketchGrid,
  cleanupSketchGrid,
  raycastToObjects,
}: UseSketchPlaneSelectionParams) {
  const { startSketch, elements, getObject } = useCadCore();
  const {
    scene,
    camera,
    showGroundPlane,
    toggleGroundPlane,
    setCameraRotationEnabled,
    setDrawingPlane,
    setProjectionType,
    controlsRef,
    requestRender,
  } = useCadVisualizer();

  const [isSelectingPlane, setIsSelectingPlane] = useState(false);
  const [hoveredPlane, setHoveredPlane] = useState<SketchPlaneType | null>(
    null,
  );

  const selectionPlanesRef = useRef<THREE.Group | null>(null);
  const originalCameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const originalCameraUpRef = useRef<THREE.Vector3 | null>(null);
  const originalControlsTargetRef = useRef<THREE.Vector3 | null>(null);
  const faceHighlightRef = useRef<THREE.Mesh | null>(null);
  const planeOffsetRef = useRef(0);
  const offsetPreviewRef = useRef<THREE.Group | null>(null);

  // Park the camera at isometric so all three picker planes are visible.
  const positionCameraForPlaneSelection = useCallback(() => {
    if (!camera) return;

    if (cameraAnimFrameRef.current !== null) {
      cancelAnimationFrame(cameraAnimFrameRef.current);
      cameraAnimFrameRef.current = null;
    }

    const controls = controlsRef.current;

    originalCameraPositionRef.current = camera.position.clone();
    originalCameraUpRef.current = camera.up.clone();
    if (controls) {
      originalControlsTargetRef.current = controls.target.clone();
    }

    const distance = 12;
    const duration = 400;

    const targetPosition = new THREE.Vector3(
      distance * 0.7,
      distance * 0.5,
      distance * 0.7,
    );
    const targetUp = new THREE.Vector3(0, 1, 0);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    const startPosition = camera.position.clone();
    const startUp = camera.up.clone();
    const startControlsTarget = controls
      ? controls.target.clone()
      : new THREE.Vector3();
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(startPosition, targetPosition, eased);
      camera.up.lerpVectors(startUp, targetUp, eased);
      if (controls) {
        controls.target.lerpVectors(startControlsTarget, targetLookAt, eased);
        controls.update();
      }
      camera.lookAt(targetLookAt);

      if (t < 1) {
        cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
      } else {
        cameraAnimFrameRef.current = null;
      }
    };

    cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
  }, [camera, controlsRef, cameraAnimFrameRef]);

  const createSelectionPlanes = useCallback(() => {
    if (!scene) return;

    if (selectionPlanesRef.current) {
      scene.remove(selectionPlanesRef.current);
      const trackedMaterials = selectionPlanesRef.current.userData.materials as
        | THREE.Material[]
        | undefined;
      const trackedGeometries = selectionPlanesRef.current.userData
        .geometries as THREE.BufferGeometry[] | undefined;
      trackedMaterials?.forEach((m) => m.dispose());
      trackedGeometries?.forEach((g) => g.dispose());
      selectionPlanesRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    }

    const planesGroup = new THREE.Group();
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    planesGroup.userData.isSelectionPlanes = true;
    const planeSize = 4;
    const halfSize = planeSize / 2;

    // XY plane (Blue) - positioned at positive Z
    const xyGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    geometries.push(xyGeometry);
    const xyMaterial = new THREE.MeshBasicMaterial({
      color: PLANE_THEME.xy,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(xyMaterial);
    const xyPlane = new THREE.Mesh(xyGeometry, xyMaterial);
    xyPlane.position.set(halfSize, halfSize, 0);
    xyPlane.userData.planeType = "XY";
    xyPlane.userData.baseColor = PLANE_THEME.xy;
    xyPlane.userData.baseOpacity = 0.5;
    planesGroup.add(xyPlane);

    // XZ plane (Green) - positioned at positive Y
    const xzGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    geometries.push(xzGeometry);
    const xzMaterial = new THREE.MeshBasicMaterial({
      color: PLANE_THEME.xz,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(xzMaterial);
    const xzPlane = new THREE.Mesh(xzGeometry, xzMaterial);
    xzPlane.rotation.x = -Math.PI / 2;
    xzPlane.position.set(halfSize, 0, halfSize);
    xzPlane.userData.planeType = "XZ";
    xzPlane.userData.baseColor = PLANE_THEME.xz;
    xzPlane.userData.baseOpacity = 0.5;
    planesGroup.add(xzPlane);

    // YZ plane (Red) - positioned at positive X
    const yzGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    geometries.push(yzGeometry);
    const yzMaterial = new THREE.MeshBasicMaterial({
      color: PLANE_THEME.yz,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(yzMaterial);
    const yzPlane = new THREE.Mesh(yzGeometry, yzMaterial);
    yzPlane.rotation.y = Math.PI / 2;
    yzPlane.position.set(0, halfSize, halfSize);
    yzPlane.userData.planeType = "YZ";
    yzPlane.userData.baseColor = PLANE_THEME.yz;
    yzPlane.userData.baseOpacity = 0.5;
    planesGroup.add(yzPlane);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: PLANE_THEME.edge,
      linewidth: 2,
    });
    materials.push(edgeMaterial);

    const xEdgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(planeSize, 0, 0),
    ]);
    geometries.push(xEdgeGeometry);
    const xEdgeMaterial = new THREE.LineBasicMaterial({
      color: PLANE_THEME.xAxis,
    });
    materials.push(xEdgeMaterial);
    const xEdge = new THREE.Line(xEdgeGeometry, xEdgeMaterial);
    planesGroup.add(xEdge);

    const yEdgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, planeSize, 0),
    ]);
    geometries.push(yEdgeGeometry);
    const yEdgeMaterial = new THREE.LineBasicMaterial({
      color: PLANE_THEME.yAxis,
    });
    materials.push(yEdgeMaterial);
    const yEdge = new THREE.Line(yEdgeGeometry, yEdgeMaterial);
    planesGroup.add(yEdge);

    const zEdgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, planeSize),
    ]);
    geometries.push(zEdgeGeometry);
    const zEdgeMaterial = new THREE.LineBasicMaterial({
      color: PLANE_THEME.zAxis,
    });
    materials.push(zEdgeMaterial);
    const zEdge = new THREE.Line(zEdgeGeometry, zEdgeMaterial);
    planesGroup.add(zEdge);

    const topEdge1Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, planeSize, 0),
      new THREE.Vector3(planeSize, planeSize, 0),
    ]);
    geometries.push(topEdge1Geometry);
    const topEdge1 = new THREE.Line(topEdge1Geometry, edgeMaterial);
    planesGroup.add(topEdge1);

    const topEdge2Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, planeSize, 0),
      new THREE.Vector3(0, planeSize, planeSize),
    ]);
    geometries.push(topEdge2Geometry);
    const topEdge2 = new THREE.Line(topEdge2Geometry, edgeMaterial);
    planesGroup.add(topEdge2);

    const rightEdge1Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(planeSize, 0, 0),
      new THREE.Vector3(planeSize, planeSize, 0),
    ]);
    geometries.push(rightEdge1Geometry);
    const rightEdge1 = new THREE.Line(rightEdge1Geometry, edgeMaterial);
    planesGroup.add(rightEdge1);

    const frontEdge1Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, planeSize),
      new THREE.Vector3(planeSize, 0, planeSize),
    ]);
    geometries.push(frontEdge1Geometry);
    const frontEdge1 = new THREE.Line(frontEdge1Geometry, edgeMaterial);
    planesGroup.add(frontEdge1);

    const frontEdge2Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, planeSize),
      new THREE.Vector3(0, planeSize, planeSize),
    ]);
    geometries.push(frontEdge2Geometry);
    const frontEdge2 = new THREE.Line(frontEdge2Geometry, edgeMaterial);
    planesGroup.add(frontEdge2);

    const originGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    geometries.push(originGeometry);
    const originMaterial = new THREE.MeshBasicMaterial({
      color: PLANE_THEME.origin,
    });
    materials.push(originMaterial);
    const originSphere = new THREE.Mesh(originGeometry, originMaterial);
    planesGroup.add(originSphere);

    planesGroup.userData.materials = materials;
    planesGroup.userData.geometries = geometries;

    scene.add(planesGroup);
    selectionPlanesRef.current = planesGroup;
    requestRender();
  }, [scene, requestRender]);

  const removeSelectionPlanes = useCallback(() => {
    if (!scene || !selectionPlanesRef.current) return;

    scene.remove(selectionPlanesRef.current);
    selectionPlanesRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    selectionPlanesRef.current = null;
    requestRender();
  }, [scene, requestRender]);

  const removeOffsetPreview = useCallback(() => {
    if (!scene || !offsetPreviewRef.current) return;
    scene.remove(offsetPreviewRef.current);
    offsetPreviewRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    offsetPreviewRef.current = null;

    if (selectionPlanesRef.current) {
      selectionPlanesRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.userData.planeType) {
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.5;
          child.userData.baseOpacity = 0.5;
        }
      });
    }
    requestRender();
  }, [scene, requestRender]);

  const updateOffsetPreview = useCallback(
    (offset: number) => {
      if (!scene || !selectionPlanesRef.current) return;

      removeOffsetPreview();

      if (offset === 0) {
        if (selectionPlanesRef.current) {
          selectionPlanesRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.planeType) {
              const mat = child.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.5;
              child.userData.baseOpacity = 0.5;
            }
          });
        }
        return;
      }

      const planeSize = 4;
      const halfSize = planeSize / 2;
      const previewGroup = new THREE.Group();
      previewGroup.userData.isOffsetPreview = true;

      const planeConfigs: {
        color: number;
        position: THREE.Vector3;
        rotation?: THREE.Euler;
        planeType: string;
      }[] = [
        {
          color: PLANE_THEME.xy,
          position: new THREE.Vector3(halfSize, halfSize, offset),
          planeType: "XY",
        },
        {
          color: PLANE_THEME.xz,
          position: new THREE.Vector3(halfSize, offset, halfSize),
          rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
          planeType: "XZ",
        },
        {
          color: PLANE_THEME.yz,
          position: new THREE.Vector3(offset, halfSize, halfSize),
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          planeType: "YZ",
        },
      ];

      for (const cfg of planeConfigs) {
        const geo = new THREE.PlaneGeometry(planeSize, planeSize);
        const mat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(cfg.position);
        if (cfg.rotation) mesh.rotation.copy(cfg.rotation);
        mesh.userData.planeType = cfg.planeType;
        mesh.userData.baseColor = cfg.color;
        mesh.userData.baseOpacity = 0.5;
        previewGroup.add(mesh);
      }

      if (selectionPlanesRef.current) {
        selectionPlanesRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.userData.planeType) {
            const mat = child.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.15;
            child.userData.baseOpacity = 0.15;
          }
        });
      }

      const dashMat = new THREE.LineDashedMaterial({
        color: PLANE_THEME.edge,
        dashSize: 0.15,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.4,
      });

      // XY plane corners, offset along Z
      const xyCorners = [
        [0, 0],
        [planeSize, 0],
        [planeSize, planeSize],
        [0, planeSize],
      ];
      for (const [cx, cy] of xyCorners) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx, cy, 0),
          new THREE.Vector3(cx, cy, offset),
        ]);
        const line = new THREE.Line(geo, dashMat);
        line.computeLineDistances();
        previewGroup.add(line);
      }

      // XZ plane corners, offset along Y
      const xzCorners = [
        [0, 0],
        [planeSize, 0],
        [planeSize, planeSize],
        [0, planeSize],
      ];
      for (const [cx, cz] of xzCorners) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx, 0, cz),
          new THREE.Vector3(cx, offset, cz),
        ]);
        const line = new THREE.Line(geo, dashMat);
        line.computeLineDistances();
        previewGroup.add(line);
      }

      // YZ plane corners, offset along X
      const yzCorners = [
        [0, 0],
        [planeSize, 0],
        [planeSize, planeSize],
        [0, planeSize],
      ];
      for (const [cy, cz] of yzCorners) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, cy, cz),
          new THREE.Vector3(offset, cy, cz),
        ]);
        const line = new THREE.Line(geo, dashMat);
        line.computeLineDistances();
        previewGroup.add(line);
      }

      scene.add(previewGroup);
      offsetPreviewRef.current = previewGroup;
      requestRender();
    },
    [scene, removeOffsetPreview, requestRender],
  );

  const collectBodyMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    for (const el of elements) {
      const obj = getObject(el.nodeId);
      if (!obj) continue;
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !child.userData.isEdgeOverlay &&
          !child.userData.isHelper &&
          !child.userData.isSketchPrimitive
        ) {
          meshes.push(child);
        }
      });
    }
    return meshes;
  }, [elements, getObject]);

  const getFaceWorldNormal = useCallback(
    (intersection: THREE.Intersection): THREE.Vector3 | null => {
      if (!intersection.face) return null;
      const normal = intersection.face.normal.clone();
      const mesh = intersection.object as THREE.Mesh;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        mesh.matrixWorld,
      );
      normal.applyMatrix3(normalMatrix).normalize();
      return normal;
    },
    [],
  );

  const cleanupFaceHighlight = useCallback(() => {
    if (faceHighlightRef.current && scene) {
      scene.remove(faceHighlightRef.current);
      faceHighlightRef.current.geometry.dispose();
      (faceHighlightRef.current.material as THREE.Material).dispose();
      faceHighlightRef.current = null;
      requestRender();
    }
  }, [scene, requestRender]);

  const handlePlaneSelectionMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isSelectingPlane) return;

      cleanupFaceHighlight();

      const targetGroup =
        offsetPreviewRef.current || selectionPlanesRef.current;
      if (targetGroup) {
        const planes = targetGroup.children.filter(
          (child) => child instanceof THREE.Mesh && child.userData.planeType,
        ) as THREE.Mesh[];

        const intersects = raycastToObjects(event, planes, false);

        planes.forEach((plane) => {
          const material = plane.material as THREE.MeshBasicMaterial;
          material.color.setHex(plane.userData.baseColor);
          material.opacity = plane.userData.baseOpacity || 0.5;
        });

        if (intersects.length > 0) {
          const hitPlane = intersects[0]!.object as THREE.Mesh;
          const material = hitPlane.material as THREE.MeshBasicMaterial;
          material.color.setHex(PLANE_THEME.hover);
          material.opacity = 0.8;
          setHoveredPlane(hitPlane.userData.planeType as SketchPlaneType);
          requestRender();
          return;
        }
      }

      const bodyMeshes = collectBodyMeshes();
      if (bodyMeshes.length > 0) {
        const bodyIntersects = raycastToObjects(event, bodyMeshes, false);
        if (bodyIntersects.length > 0) {
          const hit = bodyIntersects[0]!;
          const worldNormal = getFaceWorldNormal(hit);
          if (worldNormal && scene) {
            const highlightGeom = new THREE.CircleGeometry(2.0, 32);
            const highlightMat = new THREE.MeshBasicMaterial({
              color: SKETCH.selected,
              transparent: true,
              opacity: 0.4,
              side: THREE.DoubleSide,
              depthTest: false,
            });
            const highlight = new THREE.Mesh(highlightGeom, highlightMat);
            highlight.position
              .copy(hit.point)
              .addScaledVector(worldNormal, SKETCH_PLANE_Z_LIFT_MM);
            const quat = new THREE.Quaternion();
            quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
            highlight.quaternion.copy(quat);
            highlight.renderOrder = 1000;
            scene.add(highlight);
            faceHighlightRef.current = highlight;
            setHoveredPlane("face" as SketchPlaneType);
            requestRender();
            return;
          }
        }
      }

      setHoveredPlane(null);
      requestRender();
    },
    [
      isSelectingPlane,
      raycastToObjects,
      collectBodyMeshes,
      getFaceWorldNormal,
      cleanupFaceHighlight,
      scene,
      requestRender,
    ],
  );

  const setPlaneOffset = useCallback(
    (v: number) => {
      planeOffsetRef.current = v;
      updateOffsetPreview(v);
    },
    [updateOffsetPreview],
  );

  const enterPlaneSelectionMode = useCallback(() => {
    cleanupSketchGrid();
    setIsSelectingPlane(true);
    setHoveredPlane(null);
    createSelectionPlanes();
    positionCameraForPlaneSelection();
  }, [
    cleanupSketchGrid,
    createSelectionPlanes,
    positionCameraForPlaneSelection,
  ]);

  const cancelPlaneSelection = useCallback(() => {
    setIsSelectingPlane(false);
    setHoveredPlane(null);
    removeOffsetPreview();
    removeSelectionPlanes();
    cleanupFaceHighlight();

    if (
      camera &&
      originalCameraPositionRef.current &&
      originalCameraUpRef.current
    ) {
      camera.position.copy(originalCameraPositionRef.current);
      camera.up.copy(originalCameraUpRef.current);
      const controls = controlsRef.current;
      if (controls && originalControlsTargetRef.current) {
        controls.target.copy(originalControlsTargetRef.current);
        controls.update();
      }
      camera.lookAt(
        originalControlsTargetRef.current ?? new THREE.Vector3(0, 0, 0),
      );
      // Clear so subsequent calls (the leave-sketch-mode effect re-fires on every
      // CoreContext render) become no-ops instead of snapping the camera back.
      originalCameraPositionRef.current = null;
      originalCameraUpRef.current = null;
      originalControlsTargetRef.current = null;
    }
  }, [
    camera,
    controlsRef,
    removeOffsetPreview,
    removeSelectionPlanes,
    cleanupFaceHighlight,
  ]);

  const selectPlaneAndStartSketch = useCallback(
    (planeOrType: SketchPlane | SketchPlaneType, offset?: number) => {
      const plane: SketchPlane =
        typeof planeOrType === "string"
          ? createSketchPlane(planeOrType)
          : planeOrType;

      if (offset && typeof planeOrType === "string") {
        plane.origin.addScaledVector(plane.normal, offset);
        plane.type = "offset";
        plane.offset = offset;
      }

      setIsSelectingPlane(false);
      setHoveredPlane(null);
      removeOffsetPreview();
      removeSelectionPlanes();

      if (showGroundPlane) {
        toggleGroundPlane();
        sketchHidGroundPlaneRef.current = true;
      }

      setCameraRotationEnabled(false);

      originalProjectionRef.current = projectionTypeRef.current;

      dimSceneBodies();

      const planeConstant = -plane.normal.dot(plane.origin);
      setDrawingPlane(plane.normal, planeConstant);

      orientCameraToPlane(plane, () => {
        if (projectionTypeRef.current !== "orthographic") {
          setProjectionType("orthographic");
        }
      });

      const isFacePlane = plane.type === "face";
      createSketchGrid(plane, isFacePlane ? 10 : undefined);

      startSketch(plane);
    },
    [
      removeOffsetPreview,
      removeSelectionPlanes,
      orientCameraToPlane,
      createSketchGrid,
      startSketch,
      showGroundPlane,
      toggleGroundPlane,
      setCameraRotationEnabled,
      dimSceneBodies,
      setDrawingPlane,
      setProjectionType,
      sketchHidGroundPlaneRef,
      originalProjectionRef,
      projectionTypeRef,
    ],
  );

  const handlePlaneSelectionClick = useCallback(
    (event: MouseEvent) => {
      if (!isSelectingPlane) return;

      cleanupFaceHighlight();

      const targetGroup =
        offsetPreviewRef.current || selectionPlanesRef.current;
      if (targetGroup) {
        const planes = targetGroup.children.filter(
          (child) => child instanceof THREE.Mesh && child.userData.planeType,
        ) as THREE.Mesh[];

        const intersects = raycastToObjects(event, planes, false);

        if (intersects.length > 0) {
          const hitPlane = intersects[0]!.object as THREE.Mesh;
          const planeType = hitPlane.userData.planeType as SketchPlaneType;
          selectPlaneAndStartSketch(
            planeType,
            planeOffsetRef.current || undefined,
          );
          return;
        }
      }

      const bodyMeshes = collectBodyMeshes();
      if (bodyMeshes.length > 0) {
        const bodyIntersects = raycastToObjects(event, bodyMeshes, false);
        if (bodyIntersects.length > 0) {
          const hit = bodyIntersects[0]!;
          const worldNormal = getFaceWorldNormal(hit);
          if (worldNormal) {
            let elementNodeId: NodeId | undefined;
            let parent = hit.object.parent;
            while (parent) {
              if (parent.userData?.nodeId) {
                elementNodeId = toNodeId(parent.userData.nodeId);
                break;
              }
              parent = parent.parent;
            }

            // Tessellated faces have noisy normals, snap to the nearest cardinal axis if close.
            const axes = [
              new THREE.Vector3(1, 0, 0),
              new THREE.Vector3(-1, 0, 0),
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(0, -1, 0),
              new THREE.Vector3(0, 0, 1),
              new THREE.Vector3(0, 0, -1),
            ];
            for (const axis of axes) {
              if (worldNormal.angleTo(axis) < 0.1) {
                worldNormal.copy(axis);
                break;
              }
            }

            const facePlane = createSketchPlaneFromNormal(
              worldNormal,
              hit.point,
              elementNodeId,
            );
            selectPlaneAndStartSketch(
              facePlane,
              planeOffsetRef.current || undefined,
            );
          }
        }
      }
    },
    [
      isSelectingPlane,
      raycastToObjects,
      collectBodyMeshes,
      getFaceWorldNormal,
      cleanupFaceHighlight,
      selectPlaneAndStartSketch,
    ],
  );

  return {
    isSelectingPlane,
    hoveredPlane,
    handlePlaneSelectionMouseMove,
    handlePlaneSelectionClick,
    setPlaneOffset,
    enterPlaneSelectionMode,
    cancelPlaneSelection,
    selectPlaneAndStartSketch,
  };
}
