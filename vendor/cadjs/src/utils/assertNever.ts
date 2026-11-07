/**
 * Compile-time exhaustiveness check. Place in the `default:` clause of a
 * discriminated-union switch, if a new union member is added without a
 * corresponding case, TypeScript will refuse to compile because `value`
 * will no longer be `never`. Throws at runtime as defence-in-depth.
 */
export function assertNever(
  value: never,
  context = "unhandled discriminant",
): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}
