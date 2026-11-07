/**
 * Sketch-domain tolerances. Distinct from the OCC numeric tolerances in
 * `tolerances.ts` because these operate on sketch-space (parameters in [0,1],
 * sketch-plane radians, sketch-plane distance units), not on world geometry.
 *
 * All exports are `@internal`, not part of the public library API.
 */

/**
 * Distance from a t-parameter endpoint (t=0 or t=1) below which an
 * intersection is treated as endpoint-coincident and therefore filtered
 * out to avoid degenerate zero-length splits. Dimensionless.
 *
 * **Distinct from `PARAM_BOUNDS_TOL = 1e-6`** in `tolerances.ts`. The two
 * solve opposite problems: `PARAM_BOUNDS_TOL` clips slight numerical
 * overshoot back into [0,1]; this constant excludes intersections that
 * fall *inside* [0,1] but too close to either endpoint to produce a
 * useful split. Looser by design, a 1µm-from-endpoint cut would create
 * a zero-length sub-segment that breaks downstream solver invariants.
 * @internal
 */
export const SKETCH_PARAM_ENDPOINT_TOL = 1e-4;

/**
 * Tolerance (dimensionless, in t-parameter space) for matching a split
 * sub-segment's parameter range against a requested boundary interval after
 * a trim/extend split.
 * @internal
 */
export const SKETCH_PARAM_MATCH_TOL = 1e-3;

/**
 * Angle tolerance (radians, ~0.57°) for deduplicating near-coincident
 * intersection angles around a circle / arc.
 *
 * Used in trim/extend to collapse two intersection hits that the user
 * sees as one point on a circle. Distinct from `ANGLE_TOL_RAD = 1e-6`
 * (in `tolerances.ts`), which is a floating-point noise floor for
 * arc-sweep containment. The 0.01-rad threshold is user-perceptible.
 * @internal
 */
export const SKETCH_ANGLE_DEDUP_RAD = 0.01;

/**
 * Angle wraparound buffer (radians, ~1.15°) used when checking whether an
 * intersection angle falls inside an arc's directed sweep.
 *
 * 2× `SKETCH_ANGLE_DEDUP_RAD`, intentionally, `is angle θ in arc sweep
 * [α,β]?` is more lenient than collapsing two points into one because
 * the wraparound case (across 0/2π) accumulates more error.
 * @internal
 */
export const SKETCH_ANGLE_WRAP_RAD = 0.02;

/**
 * Distance threshold (sketch units) for snapping a freshly-drawn endpoint
 * to a nearby existing sketch point. Sketch coordinates in CADjs are
 * stored in millimetres on the active sketch plane, so 0.01 ≈ 0.01 mm
 * at unit zoom.
 * @internal
 */
export const SKETCH_POINT_SNAP_TOL = 0.01;

/**
 * Length threshold (sketch units) below which a sketch primitive is
 * rejected as zero-length / degenerate. Used across multiple semantic
 * axes, line length, profile area, perpendicular-vector magnitude,
 * that all happen to share the same numerical threshold. If any axis
 * needs to diverge, split into specific constants then.
 * @internal
 */
export const SKETCH_ZERO_LENGTH_TOL = 0.01;

/**
 * Label-offset threshold (sketch units). Below this magnitude a dimension
 * label leader is omitted (label sits flush against geometry).
 * @internal
 */
export const SKETCH_LABEL_OFFSET_VISIBLE_TOL = 0.01;

/**
 * Distance tolerance (scene units / mm) for treating two 3D points as
 * coincident during sketch→BRep wire stitching. Looser than the global
 * `POINT_TOL = 1e-6` because trim-intersection arithmetic can drift.
 * @internal
 */
export const POINT_COINCIDENCE_TOL_MM = 1e-3;

/**
 * Arc-endpoint buffer for trim/extend (radians, ~1.72°). An intersection
 * whose angle is within this buffer of the arc's start- or end-angle is
 * excluded from interior-cut consideration. Looser than
 * `SKETCH_ANGLE_DEDUP_RAD` because endpoint-coincidence detection should
 * err on the side of *not* cutting near an existing vertex.
 * @internal
 */
export const SKETCH_ARC_ENDPOINT_BUFFER_RAD = 0.03;
