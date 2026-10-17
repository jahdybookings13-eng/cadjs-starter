import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { useCadVisualizer, useCadCore } from "@vitekk02/cadjs/react";
import { SceneMode, createSketchPlane } from "@vitekk02/cadjs";
import { buildVRRoom, disposeVRRoom } from "./buildVRRoom";
import { buildVRControls } from "./buildVRControls";
import { createVRGrabSystem, type VRGrabSystem } from "./vrGrabSystem";
import { createVRSketchSystem, type VRSketchSystem, DESK_HEIGHT } from "./vrSketchSystem";

const MOVE_SPEED = 2.0;

// Body radius used for wall/desk standoff
const PLAYER_RADIUS = 0.3;

// Must match buildVRRoom: roomW/roomD = 5, so walls sit at +/-2.5
const ROOM_HALF = 2.5;
const WALL_LIMIT = ROOM_HALF - PLAYER_RADIUS;

// Must match buildVRRoom DEFAULTS: deskWidth 1.6, deskDepth 0.8, centred on origin
// Smaller buffer to allow getting closer to the table
const DESK_BUFFER = 0.1;
const DESK_BLOCK_X = 1.6 / 2 + DESK_BUFFER;
const DESK_BLOCK_Z = 0.8 / 2 + DESK_BUFFER;

// Map carousel action names to SceneMode values
function getSceneModeFromAction(actionName: string): SceneMode | null {
  const actionMap: Record<string, SceneMode> = {
    "Sketch": "sketch",
    "Extrude": "extrude", 
    "Loft": "loft",
    "Sweep": "sweep",
    "Revolve": "revolve",
    "Fillet": "fillet",
    "Shell": "combine", // Shell maps to combine mode
    "Measure": "measure"
  };
  
  return actionMap[actionName] || null;
}

export function useVRSession() {
  const { renderer, scene, setContinuousRender } = useCadVisualizer();
  const { setMode, selectElement, deselectElement, addPrimitive, addConstraintAndSolve, solveSketch, pushSketchUndo, activeSketch, startSketch, finishSketch, cancelSketch, selectPlaneAndStartSketch, mode: currentMode } = useCadCore();

  // Refs for cadCore functions so the animation loop always gets fresh references
  const setModeRef = useRef(setMode);
  const selectElementRef = useRef(selectElement);
  const deselectElementRef = useRef(deselectElement);
  const addPrimitiveRef = useRef(addPrimitive);
  const addConstraintAndSolveRef = useRef(addConstraintAndSolve);
  const solveSketchRef = useRef(solveSketch);
  const pushSketchUndoRef = useRef(pushSketchUndo);
  const activeSketchRef2 = useRef(activeSketch);
  const startSketchRef = useRef(startSketch);
  const finishSketchRef = useRef(finishSketch);
  const cancelSketchRef = useRef(cancelSketch);
  const currentModeRef = useRef(currentMode);

  useEffect(() => {
    setModeRef.current = setMode;
    selectElementRef.current = selectElement;
    deselectElementRef.current = deselectElement;
    addPrimitiveRef.current = addPrimitive;
    addConstraintAndSolveRef.current = addConstraintAndSolve;
    solveSketchRef.current = solveSketch;
    pushSketchUndoRef.current = pushSketchUndo;
    activeSketchRef2.current = activeSketch;
    startSketchRef.current = startSketch;
    finishSketchRef.current = finishSketch;
    cancelSketchRef.current = cancelSketch;
    currentModeRef.current = currentMode;
  });
  const [inVR, setInVR] = useState(false);
  const [vrSupported, setVrSupported] = useState(false);
  const roomRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<ReturnType<typeof buildVRControls> | null>(null);
  const baseBackgroundRef = useRef<THREE.Color | THREE.Texture | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hiddenInVR = useRef<THREE.Object3D[]>([]);
  const playerOffset = useRef(new THREE.Vector3());
  const lastTime = useRef(0);
  const carouselRotation = useRef(0);
  const carouselIndex = useRef(0);
  const lastButtonPressTime = useRef(0);
  const lastHoveredButtonIndex = useRef(-1);
  const BUTTON_PRESS_COOLDOWN = 500;
  const lastBackButtonPress = useRef(0);
  const grabSystemRef = useRef<VRGrabSystem | null>(null);
  const gripWasPressed = useRef(false);
  const GRIP_BUTTON_INDEX = 1;
  const beltGripActive = useRef(false);
  const beltGripPrevAngle = useRef(0);
  const sketchSystemRef = useRef<VRSketchSystem | null>(null);
  const sketchGripWasPressed = useRef(false);
  const sketchTriggerWasPressed = useRef(false);
  const leftGripWasPressed = useRef(false);
  const rightGripWasPressed = useRef(false);

  useEffect(() => {
    if (!("xr" in navigator) || !navigator.xr) {
      setVrSupported(false);
      return;
    }
    navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
      setVrSupported(supported);
    });
  }, []);

const enterVR = useCallback(async () => {
    if (!renderer || !scene || !navigator.xr) return;

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "bounded-floor"],
      });
      sessionRef.current = session;

      baseBackgroundRef.current = scene.background;
      scene.background = null;

      renderer.xr.enabled = true;
      await renderer.xr.setSession(session);
      setContinuousRender(true);

// Room
      const room = buildVRRoom();
      roomRef.current = room;
      scene.add(room);

      // VR Controls
      const vrControls = buildVRControls();
      controlsRef.current = vrControls;
      scene.add(vrControls.group);

      // Grab system
      const grabSystem = createVRGrabSystem();
      grabSystemRef.current = grabSystem;

      // Sketch system
      const activeSketchRef = { get current() { return activeSketch; } };
      const sketchSystem = createVRSketchSystem(
        (prim) => addPrimitiveRef.current(prim as any),
        (constraint) => addConstraintAndSolveRef.current(constraint as any),
        () => solveSketchRef.current(),
        () => pushSketchUndoRef.current(),
        activeSketchRef,
      );
      sketchSystemRef.current = sketchSystem;

      // Hide origin helpers
      hiddenInVR.current = [];
      scene.traverse((child) => {
        if (child.userData?.isOriginHelper && child.visible) {
          child.visible = false;
          hiddenInVR.current.push(child);
        }
      });

      playerOffset.current.set(0, 0, 0);
      lastTime.current = performance.now();

      const headDir = new THREE.Vector3();
      const cam = renderer.xr.getCamera();

      const onSessionEnd = () => {
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;

        if (roomRef.current) {
          scene.remove(roomRef.current);
          disposeVRRoom(roomRef.current);
          roomRef.current = null;
        }
        if (controlsRef.current) {
          scene.remove(controlsRef.current.group);
          controlsRef.current = null;
        }

        scene.background = baseBackgroundRef.current;
        baseBackgroundRef.current = null;

        for (const obj of hiddenInVR.current) obj.visible = true;
        hiddenInVR.current = [];

        playerOffset.current.set(0, 0, 0);
        carouselRotation.current = 0;
        carouselIndex.current = 0;
        lastBackButtonPress.current = 0;
        grabSystemRef.current = null;
        gripWasPressed.current = false;
        if (sketchSystemRef.current) {
          if (sketchSystemRef.current.state.previewLine) {
            scene.remove(sketchSystemRef.current.state.previewLine);
          }
          sketchSystemRef.current.dispose();
          sketchSystemRef.current = null;
        }
        sketchGripWasPressed.current = false;
        sketchTriggerWasPressed.current = false;
        leftGripWasPressed.current = false;
        rightGripWasPressed.current = false;

        sessionRef.current = null;
        setContinuousRender(false);
        setInVR(false);
      };

      session.addEventListener("end", onSessionEnd);

      renderer.setAnimationLoop((_timestamp, xrFrame) => {
        if (!xrFrame) {
          renderer.render(scene, cam);
          return;
        }

        renderer.xr.updateCamera(cam);

        const refSpace = renderer.xr.getReferenceSpace();

        // === VR SKETCH MODE ===
        if (sketchSystemRef.current && sketchSystemRef.current.state.phase !== "idle" && refSpace) {
          const sketch = sketchSystemRef.current;

          if (sketch.state.phase === "selecting-plane") {
            let rightHandPos: THREE.Vector3 | null = null;
            let rightHandQuat: THREE.Quaternion | null = null;

            for (const source of session.inputSources) {
              if (!source.targetRaySpace || source.handedness !== "right") continue;
              const pose = xrFrame.getPose(source.targetRaySpace, refSpace);
              if (!pose) continue;
              rightHandPos = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
              rightHandQuat = new THREE.Quaternion(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
              break;
            }

            if (rightHandPos && rightHandQuat) {
              const triggerPressed = (() => {
                for (const source of session.inputSources) {
                  if (source.handedness === "right" && source.gamepad) return source.gamepad.buttons[0]?.pressed ?? false;
                }
                return false;
              })();

              if (triggerPressed && !sketchTriggerWasPressed.current) {
                const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(rightHandQuat);

                const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_HEIGHT);
                const deskHit = new THREE.Vector3();
                const ray = new THREE.Ray(rightHandPos, handDir);
                const hitsDesk = ray.intersectPlane(deskPlane, deskHit) !== null && deskHit.distanceTo(rightHandPos) < 1.5;

                if (hitsDesk) {
                  const plane = createSketchPlane("xz");
                  startSketchRef.current(plane);
                  sketch.startSketchOnDesk();
                } else {
                  const plane = createSketchPlane("xy");
                  startSketchRef.current(plane);
                  sketch.startSketchOnPlane("xy");
                }
              }
              sketchTriggerWasPressed.current = triggerPressed;
            }
          }

          if (sketch.state.phase === "drawing") {
            let leftGrip = false;
            let rightGrip = false;
            let rightHandPos: THREE.Vector3 | null = null;
            let rightPointQuat: THREE.Quaternion | null = null;

            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad) continue;
              const gripVal = source.gamepad.buttons[GRIP_BUTTON_INDEX]?.pressed ?? false;
              if (source.handedness === "left") leftGrip = gripVal;
              if (source.handedness === "right") {
                rightGrip = gripVal;
                const gripPose = xrFrame.getPose(source.gripSpace, refSpace);
                if (gripPose) {
                  rightHandPos = new THREE.Vector3(
                    gripPose.transform.position.x,
                    gripPose.transform.position.y,
                    gripPose.transform.position.z,
                  );
                }
                if (source.targetRaySpace) {
                  const rayPose = xrFrame.getPose(source.targetRaySpace, refSpace);
                  if (rayPose) {
                    rightPointQuat = new THREE.Quaternion(
                      rayPose.transform.orientation.x,
                      rayPose.transform.orientation.y,
                      rayPose.transform.orientation.z,
                      rayPose.transform.orientation.w,
                    );
                  }
                }
              }
            }

            // Both grips = axis snapping
            if (leftGrip && rightGrip) {
              if (!sketch.state.axisSnapAxis) {
                if (rightHandPos) {
                  const dy = Math.abs(rightHandPos.y - (sketch.state.lastPointWorld?.y ?? rightHandPos.y));
                  const dx = Math.abs(rightHandPos.x - (sketch.state.lastPointWorld?.x ?? rightHandPos.x));
                  const dz = Math.abs(rightHandPos.z - (sketch.state.lastPointWorld?.z ?? rightHandPos.z));
                  if (dy > dx && dy > dz) sketch.setAxisSnap("y");
                  else if (dx > dz) sketch.setAxisSnap("x");
                  else sketch.setAxisSnap("z");
                }
              }
            } else {
              sketch.setAxisSnap(null);
            }

            // Right hand for drawing
            if (rightHandPos && rightPointQuat) {
              const triggerPressed = (() => {
                for (const source of session.inputSources) {
                  if (source.handedness === "right" && source.gamepad) {
                    return source.gamepad.buttons[0]?.pressed ?? false;
                  }
                }
                return false;
              })();

              const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(rightPointQuat);

              const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_HEIGHT);
              const deskHit = new THREE.Vector3();
              const ray = new THREE.Ray(rightHandPos, handDir);
              const hitsDesk = ray.intersectPlane(deskPlane, deskHit);
              const isDeskSketching = hitsDesk !== null && deskHit.distanceTo(rightHandPos) < 1.5;

              // DESK: trigger to place points
              if (isDeskSketching) {
                if (triggerPressed && !sketchTriggerWasPressed.current) {
                  const pointResult = sketch.placePoint(deskHit);
                  if (sketch.state.isChaining && sketch.state.lastPointId) {
                    sketch.connectLine(sketch.state.lastPointId, pointResult.pointId);
                  }
                  sketch.state.isChaining = true;
                  sketch.state.lastPointId = pointResult.pointId;
                  sketch.state.lastPointWorld = deskHit.clone();
                }
              }

              // 3D FREEHAND: grip to place points
              if (!isDeskSketching) {
                if (rightGrip && !sketchGripWasPressed.current) {
                  const placePos = sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                    ? sketch.projectWithAxisSnap(rightHandPos, sketch.state.lastPointWorld)
                    : sketch.projectToSketchPlane(rightHandPos);
                  const pointResult = sketch.placePoint(placePos);
                  if (sketch.state.isChaining && sketch.state.lastPointId) {
                    sketch.connectLine(sketch.state.lastPointId, pointResult.pointId);
                  }
                  sketch.state.isChaining = true;
                  sketch.state.lastPointId = pointResult.pointId;
                  sketch.state.lastPointWorld = placePos.clone();
                }
              }

              // Update preview line
              if (sketch.state.isChaining) {
                const previewTarget = sketch.state.axisSnapAxis && sketch.state.lastPointWorld
                  ? sketch.projectWithAxisSnap(rightHandPos, sketch.state.lastPointWorld)
                  : isDeskSketching ? deskHit : sketch.projectToSketchPlane(rightHandPos);
                sketch.updatePreview(previewTarget);
                if (sketch.state.previewLine && !sketch.state.previewLine.parent) {
                  scene.add(sketch.state.previewLine);
                }
              }

              sketchGripWasPressed.current = rightGrip;
              sketchTriggerWasPressed.current = triggerPressed;
            }

            // FINISH: both triggers pressed while both grips held
            let leftTrigger = false;
            let rightTrigger = false;
            for (const source of session.inputSources) {
              if (!source.gamepad) continue;
              const trig = source.gamepad.buttons[0]?.pressed ?? false;
              if (source.handedness === "left") leftTrigger = trig;
              if (source.handedness === "right") rightTrigger = trig;
            }
            if (leftGrip && rightGrip && leftTrigger && rightTrigger) {
              sketch.finishChain();
              sketch.clearPreview();
              if (sketch.state.previewLine?.parent) {
                scene.remove(sketch.state.previewLine);
              }
              finishSketchRef.current();
              setModeRef.current("move");
            }

            // CANCEL: left grip double-click
            if (leftGrip && !leftGripWasPressed.current) {
              const now2 = Date.now();
              if (now2 - lastBackButtonPress.current < 300) {
                sketch.cancelSketch();
                if (sketch.state.previewLine?.parent) {
                  scene.remove(sketch.state.previewLine);
                }
                cancelSketchRef.current();
                setModeRef.current("move");
              }
              lastBackButtonPress.current = now2;
            }
            leftGripWasPressed.current = leftGrip;
            rightGripWasPressed.current = rightGrip;
          }
        } else if (sketchSystemRef.current && sketchSystemRef.current.state.phase !== "idle") {
          if (sketchSystemRef.current.state.previewLine?.parent) {
            scene.remove(sketchSystemRef.current.state.previewLine);
          }
          sketchSystemRef.current.cancelSketch();
        }

        // === LOCOMOTION ===
        const now = performance.now();
        const dt = Math.min((now - lastTime.current) / 1000, 0.05);
        lastTime.current = now;

        // Basic locomotion without collision (for debugging)
        let stickX = 0;
        let stickY = 0;

        for (const source of session.inputSources) {
          const axes = source.gamepad?.axes;
          if (!axes) continue;

          // Prefer thumbstick (2/3), fall back to touchpad (0/1) for other mappings
          const x = axes[2] ?? axes[0] ?? 0;
          const y = axes[3] ?? axes[1] ?? 0;

          // Take whichever controller is actually deflected, preferring left
          if (Math.abs(x) + Math.abs(y) > Math.abs(stickX) + Math.abs(stickY)) {
            stickX = x;
            stickY = y;
          }
          if (source.handedness === "left" && (Math.abs(x) > 0 || Math.abs(y) > 0)) {
            stickX = x;
            stickY = y;
            break;
          }
        }

        // Deadzone to stop drift from resting stick noise
        const DEADZONE = 0.15;
        const mag = Math.hypot(stickX, stickY);
        if (mag > DEADZONE) {
          // Rescale so motion ramps from 0 at the deadzone edge
          const scaled = (mag - DEADZONE) / (1 - DEADZONE) / mag;
          stickX *= scaled;
          stickY *= scaled;

          // Head-relative movement: flatten camera basis onto the XZ plane
          const yaw = Math.atan2(
            2 * (cam.quaternion.w * cam.quaternion.y + cam.quaternion.x * cam.quaternion.z),
            1 - 2 * (cam.quaternion.y * cam.quaternion.y + cam.quaternion.x * cam.quaternion.x),
          );
          const sin = Math.sin(yaw);
          const cos = Math.cos(yaw);

          // forward = (-sin, -cos), right = (cos, -sin); stick +Y is pull-back
          const dx = (stickX * cos + stickY * sin) * MOVE_SPEED * dt;
          const dz = (-stickX * sin + stickY * cos) * MOVE_SPEED * dt;

          // --- COLLISION ---
          // Room translates opposite the player, so the player's position in
          // room space is -playerOffset. Resolve there, then map back.
          const curX = -playerOffset.current.x;
          const curZ = -playerOffset.current.z;

          // Walls: clamp to room half-extent minus body radius
          let nextX = Math.max(-WALL_LIMIT, Math.min(WALL_LIMIT, curX + dx));
          let nextZ = Math.max(-WALL_LIMIT, Math.min(WALL_LIMIT, curZ + dz));

          // Desk: solid from floor to 0.75m, and a standing body always spans
          // that range, so block the footprint. Skip if already inside it —
          // the desk is centred on the origin where local-floor spawns you,
          // so without this escape hatch you would be trapped at start.
          const insideDesk = (x: number, z: number) =>
            Math.abs(x) < DESK_BLOCK_X && Math.abs(z) < DESK_BLOCK_Z;

          if (!insideDesk(curX, curZ)) {
            // Axis-separated resolution so you slide along the edge instead
            // of stopping dead when you graze it.
            if (insideDesk(nextX, curZ)) nextX = curX;
            if (insideDesk(nextX, nextZ)) nextZ = curZ;
          }

          playerOffset.current.x = -nextX;
          playerOffset.current.z = -nextZ;

          if (roomRef.current) {
            roomRef.current.position.copy(playerOffset.current);
          }
          if (controlsRef.current) {
            controlsRef.current.group.position.copy(playerOffset.current);
          }
        }

        // === GAZE TRACKING ===
        if (controlsRef.current) {
          const ctrl = controlsRef.current;
          headDir.set(0, 0, -1).applyQuaternion(cam.quaternion);

          const lookingUp = ctrl.isLookingUp(headDir);
          const lookingDown = ctrl.isLookingDown(headDir);

          ctrl.headMenu.visible = lookingUp;
          if (lookingUp) {
            ctrl.updateHeadMenu(cam.quaternion, cam.position);
          }

          ctrl.carousel.visible = lookingDown;
          console.log(`BELT VISIBLE: ${lookingDown}, lookingDown`);
          if (lookingDown) {
            ctrl.updateCarousel(cam.quaternion, cam.position, playerOffset.current, carouselRotation.current, carouselIndex.current);

            const refSpace2 = renderer.xr.getReferenceSpace();

            // Grip-based belt scrolling: grip the belt, turn your hand to scroll it
            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad || !refSpace2) continue;
              const gripPressed = source.gamepad.buttons[GRIP_BUTTON_INDEX]?.pressed ?? false;
              const pose = xrFrame.getPose(source.gripSpace, refSpace2);
              if (!pose) continue;

              const handPos = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );

              const WAIST_HEIGHT = 0.8;
              const distToWaist = Math.abs(handPos.y - WAIST_HEIGHT);
              const horizontalDist = Math.sqrt(
                (handPos.x - cam.position.x) ** 2 + (handPos.z - cam.position.z) ** 2
              );

              if (distToWaist < 0.25 && horizontalDist < 0.35) {
                const handAngle = Math.atan2(handPos.z - cam.position.z, handPos.x - cam.position.x);

                if (gripPressed && !beltGripActive.current) {
                  beltGripActive.current = true;
                  beltGripPrevAngle.current = handAngle;
                }

                if (gripPressed && beltGripActive.current) {
                  let delta = handAngle - beltGripPrevAngle.current;
                  if (delta > Math.PI) delta -= Math.PI * 2;
                  if (delta < -Math.PI) delta += Math.PI * 2;
                  carouselRotation.current -= delta;
                  beltGripPrevAngle.current = handAngle;

                  const totalItems = ctrl.carousel.children.length;
                  const anglePerItem = (Math.PI * 2) / totalItems;
                  const currentAngle = (carouselRotation.current % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                  carouselIndex.current = Math.round(currentAngle / anglePerItem) % totalItems;
                }

                if (!gripPressed && beltGripActive.current) {
                  beltGripActive.current = false;
                }

                break;
              }
            }

            // LEFT-HAND ORB HOVER: angle-based, like a clock position
            // Orb floats above/near the ring → nearest segment by angle wins
            // L3 (left thumbstick click) selects the hovered segment
            let hoveredButtonIndex = -1;
            let leftHandWorld: THREE.Vector3 | null = null;
            let l3Pressed = false;

            for (const source of session.inputSources) {
              if (source.handedness !== "left" || !source.gripSpace) continue;
              const pose = xrFrame.getPose(source.gripSpace, refSpace2);
              if (!pose) continue;
              leftHandWorld = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );
              if (source.gamepad) {
                // Quest 2 (oculus-touch profile): buttons[2] = thumbstick click = L3
                // buttons[3] = X button — fallback in case runtime shifts indices
                l3Pressed = (source.gamepad.buttons[2]?.pressed ?? false) ||
                            (source.gamepad.buttons[3]?.pressed ?? false);
              }
              break;
            }

            if (leftHandWorld) {
              console.log(`BELT DEBUG: leftHandWorld=${leftHandWorld.x.toFixed(2)},${leftHandWorld.y.toFixed(2)},${leftHandWorld.z.toFixed(2)} l3Pressed=${l3Pressed}`);
              console.log(`BELT DEBUG: hoveredButtonIndex=${hoveredButtonIndex}`);
              // Belt world center = controls group pos + carousel local pos
              const beltCenter = playerOffset.current.clone().add(ctrl.carousel.position);
              const theta = carouselRotation.current; // carousel.rotation.y
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const totalItems = ctrl.carousel.children.length;

              // Hand offset from belt center
              const hx = leftHandWorld.x - beltCenter.x;
              const hy = leftHandWorld.y - beltCenter.y;
              const hz = leftHandWorld.z - beltCenter.z;

              // Hover zone: orb above or near the ring — forgiving vertically
              const verticalDist = Math.abs(hy);
              const horizDist = Math.sqrt(hx * hx + hz * hz);

              if (verticalDist < 0.5 && horizDist < 0.6) {
                // Undo the carousel's Y rotation to get hand angle in belt-local space
                const lx = hx * cosT - hz * sinT;
                const lz = hx * sinT + hz * cosT;
                // Segment i center sits at local angle a where pos = (cos a * R, 0, -sin a * R)
                const localAngle = Math.atan2(-lz, lx);
                const anglePerItem = (Math.PI * 2) / totalItems;
                let idx = Math.round(localAngle / anglePerItem) % totalItems;
                if (idx < 0) idx += totalItems;
                hoveredButtonIndex = idx;
                carouselIndex.current = idx;
                lastHoveredButtonIndex.current = idx;
              }

              // L3 selects the hovered segment
              if (hoveredButtonIndex >= 0 && l3Pressed) {
                const currentTime = Date.now();
                if (currentTime - lastButtonPressTime.current >= BUTTON_PRESS_COOLDOWN) {
                  const selectedButton = ctrl.carousel.children[hoveredButtonIndex];
                  if (selectedButton) {
                    const actionName = selectedButton.userData.actionName as string | undefined;
                    const newMode = actionName ? getSceneModeFromAction(actionName) : null;
                    if (newMode) {
                      if (newMode === "sketch") {
                        // VR SKETCH MODE - don't touch global system
                        if (sketchSystemRef.current) {
                          sketchSystemRef.current.setPhase("selecting-plane");
                        }
                      } else {
                        setModeRef.current(newMode);
                      }
                      lastButtonPressTime.current = currentTime;
                    }
                  }
                }
              }
            }
          }

          let pencilVisible = false;
          const refSpace = renderer.xr.getReferenceSpace();
          for (const source of session.inputSources) {
            if (source.handedness !== "right") continue;
            if (!source.gripSpace || !refSpace) continue;
            const grip = xrFrame.getPose(source.gripSpace, refSpace);
            if (!grip) continue;
            const handPos = new THREE.Vector3(
              grip.transform.position.x,
              grip.transform.position.y,
              grip.transform.position.z,
            );
            if (ctrl.isReachingBehindEar(handPos, cam.position, cam.quaternion)) {
              pencilVisible = true;
              const rightEar = new THREE.Vector3(0.1, 0.1, -0.05)
                .applyQuaternion(cam.quaternion)
                .add(cam.position);
              ctrl.pencil.position.copy(rightEar);
              ctrl.pencil.quaternion.copy(cam.quaternion);
            }
          }
          ctrl.pencil.visible = pencilVisible;
        }

        // === CONTROLLER VISUALIZATION ===
        if (controlsRef.current) {
          const ctrl = controlsRef.current;
          const refSpace = renderer.xr.getReferenceSpace();

          if (refSpace) {
            for (const source of session.inputSources) {
              if (!source.targetRaySpace) continue;
              // targetRaySpace: -Z is GUARANTEED to be the pointing direction (WebXR spec)
              const pose = xrFrame.getPose(source.targetRaySpace, refSpace);
              if (!pose) continue;

              const handPos = new THREE.Vector3(
                pose.transform.position.x,
                pose.transform.position.y,
                pose.transform.position.z,
              );
              const handQuat = new THREE.Quaternion(
                pose.transform.orientation.x,
                pose.transform.orientation.y,
                pose.transform.orientation.z,
                pose.transform.orientation.w,
              );

              // Convert world position to controls group local space
              const localHandPos = handPos.clone().sub(playerOffset.current);

              const ray = source.handedness === "left" ? ctrl.leftRay : ctrl.rightRay;
              ray.position.copy(localHandPos);
              ray.quaternion.copy(handQuat);
            }
          }
        }

        // === GRAB SYSTEM (mode-independent) ===
        if (grabSystemRef.current) {
          const grab = grabSystemRef.current;
          const refSpace = renderer.xr.getReferenceSpace();
          if (refSpace) {
            // Find the primary grab controller (prefer right hand)
            let grabSource: XRInputSource | null = null;
            let grabPose: XRPose | null = null;
            for (const source of session.inputSources) {
              if (!source.gripSpace || !source.gamepad) continue;
              const pose = xrFrame.getPose(source.gripSpace, refSpace);
              if (!pose) continue;
              if (source.handedness === "right" || (!grabSource && source.handedness === "left")) {
                grabSource = source;
                grabPose = pose;
              }
            }

            if (grabSource && grabPose && scene) {
              const gripPressed = grabSource.gamepad.buttons[GRIP_BUTTON_INDEX]?.pressed ?? false;

              const handPos = new THREE.Vector3(
                grabPose.transform.position.x,
                grabPose.transform.position.y,
                grabPose.transform.position.z,
              );
              const handQuat = new THREE.Quaternion(
                grabPose.transform.orientation.x,
                grabPose.transform.orientation.y,
                grabPose.transform.orientation.z,
                grabPose.transform.orientation.w,
              );

              // Grab on press
              if (gripPressed && !gripWasPressed.current && !grab.state.heldObjectId) {
                const handDir = new THREE.Vector3(0, 0, -1).applyQuaternion(handQuat);
                const grabbedId = grab.tryGrab(handPos, handDir, scene);
                if (grabbedId) {
                  selectElementRef.current(grabbedId);
                }
              }

              // Release on release
              if (!gripPressed && gripWasPressed.current && grab.state.heldObjectId) {
                const heldId = grab.state.heldObjectId;
                grab.release();
                if (heldId) {
                  deselectElementRef.current(heldId);
                }
              }

              // Update position while held
              if (grab.state.heldObjectId) {
                grab.updateHeldPosition(handPos, handQuat);
              }

              gripWasPressed.current = gripPressed;
            }
          }
        }

        renderer.render(scene, cam);
      });

      setInVR(true);
    } catch (err) {
      console.error("VR session failed:", err);
    }
  }, [renderer, scene]);

  const exitVR = useCallback(() => {
    const session = sessionRef.current;
    if (session) session.end();
  }, []);

  return { inVR, vrSupported, enterVR, exitVR };
}
