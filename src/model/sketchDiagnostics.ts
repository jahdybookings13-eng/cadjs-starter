export interface NamedSketchConstraint {
  id: string;
  type: string;
  primitiveIds: readonly string[];
}

/**
 * Turn the solver's constraint ids into human-readable labels. Unknown ids are
 * kept verbatim: a diagnostic must still name the offending constraint even if
 * it belongs to a proposed constraint that was rolled back.
 */
export function describeConstraintIds(
  ids: readonly string[] | undefined,
  constraints: readonly NamedSketchConstraint[],
): string[] {
  if (!ids?.length) return [];
  const byId = new Map(
    constraints.map((constraint) => [constraint.id, constraint]),
  );
  return [...new Set(ids)].map((id) => {
    const constraint = byId.get(id);
    return constraint
      ? `${constraint.type} (${constraint.primitiveIds.join(", ")})`
      : id;
  });
}
