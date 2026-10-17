# Meta Quest 2 Controller Mapping (WebXR "xr-standard")

Source: W3C WebXR Gamepads Module — https://www.w3.org/TR/webxr-gamepads-module-1/

## Buttons (same on both left and right controller)

| Index | Button | Notes |
|-------|--------|-------|
| buttons[0] | Primary trigger (index finger) | Required, always present |
| buttons[1] | Primary squeeze/grip (middle finger) | Optional; Quest 2 HAS it |
| buttons[2] | Primary thumbstick click (**L3** on left, R3 on right) | Quest 2 HAS it (no touchpad) |
| buttons[3] | X (left) / A (right) button | Quest 2: first action button |
| buttons[4] | Y (left) / B (right) button | May be platform-reserved (Oculus button) on some UAs |

## Axes

| Index | Axis |
|-------|------|
| axes[0] | Touchpad X (placeholder = 0 on Quest 2, no touchpad) |
| axes[1] | Touchpad Y (placeholder = 0 on Quest 2) |
| axes[2] | **Thumbstick X** (left/right deflection) |
| axes[3] | **Thumbstick Y** (forward = -1, back = +1) |

## Quest 2 Key Facts

- **L3** = left controller `gamepad.buttons[2].pressed` (thumbstick click)
- **R3** = right controller `gamepad.buttons[2].pressed`
- Grip = `buttons[1]`, NOT buttons[4]
- Thumbstick axes = `axes[2]` (X) and `axes[3]` (Y)
- The gamepad object is "live" — do NOT cache the GamepadButton references
  across frames; cache the boolean `pressed` state instead
- Menu/Oculus button may not be exposed at all (UA-reserved)

## Coordinate Notes (three.js + WebXR)

- Controller gripSpace pose: `pose.transform.position` / `.orientation`
- Controller local -Z (0,0,-1) is "forward along the controller" for gripSpace
- targetRaySpace -Z is where the pointer ray goes (use for aiming)
- Use `xrFrame.getPose(source.gripSpace, refSpace)` each frame
