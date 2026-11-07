/**
 * Visual / UI rendering constants. **Not tolerances**, these are
 * designer-tunable display choices (z-fighting offsets, drag sensitivities,
 * camera safety floors). Kept separate from `tolerances.ts` and
 * `sketch-tolerances.ts` so retuning visuals never touches CAD precision.
 *
 * All exports are `@internal`, not part of the public library API.
 */

/**
 * Z-offset (in mm) applied when projecting 2D sketch geometry onto the
 * sketch plane, so it renders above the XY plane and avoids z-fighting
 * with the ground plane / scene background.
 * @internal
 */
export const SKETCH_PLANE_Z_LIFT_MM = 0.01;

/**
 * Z-offset (in mm) applied to sketch trim/extend *preview* lines so they
 * render above committed sketch geometry (which uses
 * `SKETCH_PLANE_Z_LIFT_MM = 0.01`).
 * @internal
 */
export const SKETCH_PREVIEW_Z_LIFT_MM = 0.02;

/**
 * Z-offset (in mm) applied to the ground-plane mesh so it sits just
 * below all scene geometry without z-fighting.
 * @internal
 */
export const GROUND_PLANE_Z_OFFSET = -0.01;

/**
 * Drag-to-scale conversion ratio for resize-mode handles. A 1-pixel drag
 * delta multiplies the scale factor by this much.
 * @internal
 */
export const RESIZE_DRAG_SENSITIVITY = 0.05;

/**
 * Minimum camera-to-pivot distance (in mm) used as a divide-by-zero
 * safety floor in camera animations.
 * @internal
 */
export const CAMERA_MIN_DISTANCE = 1e-3;
