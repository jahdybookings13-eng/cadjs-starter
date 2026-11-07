/**
 * Centralized geometric/numerical tolerances. Use these instead of inline
 * literals so a tolerance audit (e.g. when input units change from mm to m)
 * is a one-file edit.
 *
 * Naming convention:
 *   *_TOL   , additive tolerance (units depend on the constant; documented per export)
 *   *_MM    , explicit length tolerance in millimetres
 *   *_RAD   , angle tolerance in radians
 */

/**
 * Additive tolerance for vertex equality in 3D space. Units: scene units (~mm).
 *
 * Used as the sewing tolerance for `BRepBuilderAPI_Sewing` and as a
 * degenerate-radius guard in circle detection. Distinct from
 * `POINT_COINCIDENCE_TOL_MM = 1e-3` in `sketch-tolerances.ts`, which
 * tolerates the larger drift of trim-intersection arithmetic.
 */
export const POINT_TOL = 1e-6;

/**
 * Strict tolerance for parallelism / zero-length / determinant checks
 * (squared lengths).
 *
 * Squared-length scale: 1e-10 corresponds to a linear scale of ~1e-5,
 * well below `POINT_TOL` and `BOOLEAN_FUZZ`. Aliased by
 * `useSketchInference.ts` for line-slope discriminants.
 */
export const LINEAR_TOL = 1e-10;

/**
 * Angle equality tolerance in radians, used for arc-sweep range
 * containment in `sketch-intersection-utils.ts`. Tight (~5.7×10⁻⁵°) so
 * it acts as a floating-point noise floor for `is angle θ ∈ [α,β]?`
 * tests. **Not for deduplicating user-perceptible intersection points**
 *, that is `SKETCH_ANGLE_DEDUP_RAD = 0.01` in `sketch-tolerances.ts`.
 */
export const ANGLE_TOL_RAD = 1e-6;

/**
 * Maximum extent (in mm) along a candidate axis for a face to be classified
 * as flat in that axis. Assumes input geometry is in millimetre scale.
 */
export const AXIS_FLATNESS_MM = 0.01;

/**
 * Maximum relative deviation (radius_i - avg) / avg for sample vertices to
 * be considered to lie on a single circle. 1% accounts for the polygonal
 * approximation used by tessellated circle BReps.
 */
export const RADIUS_DEV_TOL = 0.01;

/** Fuzzy tolerance passed to `BRepAlgoAPI_BooleanOperation.SetFuzzyValue`. */
export const BOOLEAN_FUZZ = 1e-5;

/** Default tolerance passed to `ShapeFix_Shape::SetPrecision/SetMaxTolerance`. */
export const SHAPEFIX_TOL = 1e-6;

/** Default linear deflection passed to `BRepMesh_IncrementalMesh`. */
export const TESSELLATE_LINEAR = 0.01;

/** Default angular deflection (radians) passed to `BRepMesh_IncrementalMesh`. */
export const TESSELLATE_ANGULAR = 0.1;

/**
 * Linear deflection for edge polyline sampling in the display path
 * (`getEdgeLineSegmentsPerEdgeHelper`). Tighter than `TESSELLATE_LINEAR`
 * because the dark boundary strokes sit on top of the smoothly-shaded
 * face mesh, so coarser sampling would show every kink against the
 * smooth background.
 */
export const TESSELLATE_LINEAR_EDGE = 0.003;

/** Tolerance for `ShapeAnalysis_FreeBounds_2` when extracting closed wires from a shape. */
export const FREEBOUNDS_TOL = 1e-5;

/**
 * Tolerance for `BOPAlgo_Tools.EdgesToWires` / `WiresToFaces`.
 *
 * Sub-`Precision::Confusion()` (~1e-7) by intent, looser values can
 * stitch unrelated edges that share endpoints within ~1µm. If empirical
 * wire-stitching failures appear, tune in a dedicated batch with smoke
 * tests; do not loosen blindly.
 */
export const EDGES_TO_WIRES_TOL = 1e-8;

/**
 * Threshold below which a sketch-plane offset is treated as identity.
 *
 * Tight by design: a too-loose threshold treats real offsets as identity
 * and skips the world-frame transform, producing geometry at the wrong
 * location. 1e-9 mm is below physical CAD precision but above noise for
 * coordinates < ~1m.
 */
export const PLANE_IDENTITY_TOL = 1e-9;

/**
 * Below this discriminant the line-circle intersection is considered a
 * tangent (single-root) hit rather than two distinct intersections.
 */
export const TANGENT_DISCRIMINANT_TOL = 1e-6;

/**
 * Tolerance for **clipping** intersection-line parameters back into
 * [0,1] when floating-point arithmetic produces values like t = -1e-9 or
 * t = 1 + 1e-8. Numerical noise floor, keep tight.
 *
 * **Distinct from `SKETCH_PARAM_ENDPOINT_TOL = 1e-4`** in
 * `sketch-tolerances.ts`, which performs the *opposite* operation
 * (filters out intersections that lie inside [0,1] but too close to
 * either endpoint to make a meaningful trim split).
 */
export const PARAM_BOUNDS_TOL = 1e-6;

/**
 * Tolerance (in degrees) for detecting a full 360° revolve. Below this delta
 * from 360, the revolve is treated as a complete revolution (closed solid).
 *
 * Tight (0.01° ≈ 0.000175 rad) so a hand-typed `360` deg or
 * numerically-derived `359.9999` deg both produce the closed-solid OCC
 * path; fractional-degree partials still take the open-shell path.
 * @internal
 */
export const REVOLVE_FULL_TURN_DEG_TOL = 0.01;

/**
 * Minimum extrusion depth (in mm) clamp. Prevents zero-depth extrudes when
 * the user's drag projection rounds to ~0.
 * @internal
 */
export const EXTRUSION_MIN_DEPTH_MM = 0.01;
