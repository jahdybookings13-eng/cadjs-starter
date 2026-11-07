// ecad/avrSource.ts — prepare an Arduino sketch for the in-browser AVR
// toolchain, and recognise C++ when it arrives in the editor.
//
// The wasm builder compiles ONE .cpp with cc1plus and links it against
// prebuilt Arduino core objects. It does not run the Arduino preprocessor, so
// this module does the two things a maker relies on:
//   - `#include <Arduino.h>` (digitalWrite / Servo / Serial declarations)
//   - the sketch's pin constants (LED_PIN = 13, …) so the same sketch text
//     works in the C++ tier and the virtual tier
//   - prototype declarations for functions defined after their first use,
//     which Arduino's build step normally generates.
//
// Pure string work — no DOM, no wasm, no toolchain. Testable in node.

const CONTROL = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "do",
  "else",
  "return",
  "sizeof",
  "class",
  "struct",
  "namespace",
  "enum",
  "typedef",
]);

/** Does this source look like Arduino C++ rather than ScadGen JS firmware? */
export function looksLikeCxx(source: string): boolean {
  if (/#\s*include\s*[<"]/.test(source)) return true;
  if (/#\s*define\b/.test(source)) return true;
  if (/\bvoid\s+(?:setup|loop)\s*\(\s*(?:void)?\s*\)\s*\{/.test(source))
    return true;
  // `<type> name(...) {` — the C++ signature form the JS tier never uses.
  return /(?:^|\n)\s*(?:void|int|float|double|long|char|bool|byte|unsigned|uint8_t|int16_t|String)\s+\w+\s*\([^)]*\)\s*\{/.test(
    source,
  );
}

/**
 * Top-level function definitions that need a forward declaration.
 * Deliberately conservative: only column-0 `<type> name(args) {` forms, no
 * control keywords, no out-of-class `Class::method`.
 */
export function functionPrototypes(source: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const def =
    /^([A-Za-z_][\w:<>,*&\s]*?)\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*\{/gm;
  for (const match of source.matchAll(def)) {
    const ret = (match[1] ?? "").trim();
    const name = match[2] ?? "";
    const args = (match[3] ?? "").trim();
    if (!ret || ret.endsWith("::")) continue;
    if (CONTROL.has(ret) || CONTROL.has(name)) continue;
    if (name === "setup" || name === "loop") continue; // declared by core/main
    if (seen.has(name)) continue;
    seen.add(name);
    // Default arguments may only appear once — drop them from the prototype.
    const params = args
      .split(",")
      .map((a) => a.split("=")[0]?.trim() ?? "")
      .filter(Boolean)
      .join(", ");
    out.push(`${ret} ${name}(${params});`);
  }
  return out;
}

/**
 * Turn a sketch into the single .cpp the wasm toolchain compiles.
 * `constants` comes from `pinConstantsFor(boardId)` so LED_PIN & co. mean the
 * same thing here as in the virtual tier.
 */
export function inoToCpp(
  source: string,
  constants: Record<string, string> = {},
): string {
  const body = source.replace(/\r\n/g, "\n");
  const preamble: string[] = [];
  if (!/#\s*include\s*[<"]Arduino\.h[>"]/.test(body)) {
    preamble.push("#include <Arduino.h>");
  }
  for (const [name, value] of Object.entries(constants)) {
    if (!new RegExp(`\\b${name}\\b`).test(body)) continue;
    // Never shadow something the sketch defines for itself.
    if (new RegExp(`#\\s*define\\s+${name}\\b`).test(body)) continue;
    if (new RegExp(`\\b${name}\\s*=`).test(body)) continue;
    preamble.push(`#define ${name} ${value}`);
  }
  const prototypes = functionPrototypes(body);
  if (prototypes.length) preamble.push(...prototypes);
  if (preamble.length === 0) return body;

  const lines = body.split("\n");
  let insertAt = 0;
  lines.forEach((line, i) => {
    if (/^\s*#\s*include\b/.test(line)) insertAt = i + 1;
  });
  lines.splice(insertAt, 0, ...preamble);
  return lines.join("\n");
}

/** One human line out of a compiler stderr dump (first real error). */
export function compilerErrorSummary(stderr: string[]): string {
  const cleaned = stderr
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
    .filter(Boolean);
  const error = cleaned.find((line) => /error:|fatal error:/.test(line));
  return error ?? cleaned[cleaned.length - 1] ?? "compile failed";
}
