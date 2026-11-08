// Phase 7 — typed expression engine.
//
// This is intentionally separate from src/model/expression.ts. That engine is
// used by the feature executor and understands only arithmetic plus a small
// unit table. Phase 7 needs typed values, booleans, strings, lists, functions,
// cycle-safe references and source-positioned diagnostics for both the
// Variable Studio and FeatureScript evaluators.
export const PHASE7_SCHEMA_VERSION = 1 as const;

export type P7Type =
  | "number"
  | "length"
  | "angle"
  | "boolean"
  | "string"
  | "list"
  | "function"
  | "any";

export type P7Value =
  | { kind: "number"; value: number }
  | { kind: "length"; value: number } // metres, matching the CAD kernel
  | { kind: "angle"; value: number } // radians
  | { kind: "boolean"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "list"; items: P7Value[] }
  | {
      kind: "function";
      name: string;
      arity: number | null;
      call: (args: readonly P7Value[]) => P7Value;
    };

export type P7DiagnosticSeverity = "error" | "warning" | "info";

export interface P7Diagnostic {
  severity: P7DiagnosticSeverity;
  code: string;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface P7Span {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

type NumericValue = Extract<P7Value, { kind: "number" | "length" | "angle" }>;

function sameNumericPair(
  a: P7Value,
  b: P7Value,
): [NumericValue, NumericValue] | null {
  if (
    a.kind === b.kind &&
    (a.kind === "number" || a.kind === "length" || a.kind === "angle")
  )
    return [a as NumericValue, b as NumericValue];
  return null;
}

export type P7ScopeEntry =
  | P7Value
  | number
  | { value: number; dim: Record<string, number> };

export type P7Scope = Record<string, P7ScopeEntry>;

export type P7EvalResult =
  | { ok: true; value: P7Value }
  | { ok: false; diagnostics: P7Diagnostic[] };

const LENGTH_TO_MM = 1000;
const MM_TO_M = 0.001;
const INCH_TO_M = 0.0254;
const DEG_TO_RAD = Math.PI / 180;

export function p7Diagnostic(
  code: string,
  message: string,
  line = 1,
  column = 1,
  severity: P7DiagnosticSeverity = "error",
): P7Diagnostic {
  return { severity, code, message, line, column };
}

export function p7TypeOf(value: P7Value): P7Type {
  return value.kind;
}

export function p7TypeLabel(type: P7Type): string {
  switch (type) {
    case "length":
      return "length";
    case "angle":
      return "angle";
    default:
      return type;
  }
}

export function p7ValueLabel(value: P7Value): string {
  switch (value.kind) {
    case "number":
      return String(round(value.value, 9));
    case "length":
      return `${round(value.value * LENGTH_TO_MM, 6)} mm`;
    case "angle":
      return `${round(value.value / DEG_TO_RAD, 6)} deg`;
    case "boolean":
      return value.value ? "true" : "false";
    case "string":
      return JSON.stringify(value.value);
    case "list":
      return `[${value.items.map(p7ValueLabel).join(", ")}]`;
    case "function":
      return `function ${value.name}`;
  }
}

export function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Deterministic 32-bit FNV-1a hash used for source/version identity. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function numberValue(value: number): P7Value {
  return { kind: "number", value };
}
export function lengthValueMM(valueMM: number): P7Value {
  return { kind: "length", value: valueMM * MM_TO_M };
}
export function lengthValueM(valueM: number): P7Value {
  return { kind: "length", value: valueM };
}
export function angleValueDeg(valueDeg: number): P7Value {
  return { kind: "angle", value: valueDeg * DEG_TO_RAD };
}
export function angleValueRad(valueRad: number): P7Value {
  return { kind: "angle", value: valueRad };
}
export function booleanValue(value: boolean): P7Value {
  return { kind: "boolean", value };
}
export function stringValue(value: string): P7Value {
  return { kind: "string", value };
}

/** Convert a stored value to its display number in the requested unit. */
export function p7DisplayNumber(
  value: P7Value,
  lengthUnit: "mm" | "in" = "mm",
  angleUnit: "deg" | "rad" = "deg",
): number | null {
  if (value.kind === "number") return value.value;
  if (value.kind === "length")
    return lengthUnit === "in"
      ? value.value / INCH_TO_M
      : value.value / MM_TO_M;
  if (value.kind === "angle")
    return angleUnit === "deg" ? value.value / DEG_TO_RAD : value.value;
  return null;
}

export function p7DisplayUnit(
  type: P7Type,
  lengthUnit: "mm" | "in" = "mm",
  angleUnit: "deg" | "rad" = "deg",
): string {
  if (type === "length") return lengthUnit;
  if (type === "angle") return angleUnit;
  return "";
}

export function p7TypeMatches(type: P7Type, value: P7Value): boolean {
  if (type === "any") return true;
  return value.kind === type;
}

const UNIT_TABLE: Record<string, { kind: "length" | "angle"; factor: number }> =
  {
    mm: { kind: "length", factor: MM_TO_M },
    cm: { kind: "length", factor: 0.01 },
    m: { kind: "length", factor: 1 },
    in: { kind: "length", factor: INCH_TO_M },
    ft: { kind: "length", factor: 0.3048 },
    deg: { kind: "angle", factor: DEG_TO_RAD },
    rad: { kind: "angle", factor: 1 },
  };

export function isUnitIdentifier(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNIT_TABLE, name);
}

function normalizeScopeEntry(entry: P7ScopeEntry): P7Value {
  if (typeof entry === "number") return numberValue(entry);
  if ("kind" in entry) return entry;
  const dim = entry.dim;
  const keys = Object.keys(dim).filter((key) => (dim[key] ?? 0) !== 0);
  if (keys.length === 1 && keys[0] === "m") return lengthValueM(entry.value);
  if (keys.length === 1 && keys[0] === "rad") return angleValueRad(entry.value);
  return numberValue(entry.value);
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokenKind = "number" | "ident" | "string" | "op" | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface LexFailure {
  ok: false;
  diagnostics: P7Diagnostic[];
}

interface LexSuccess {
  ok: true;
  tokens: Token[];
}

type LexResult = LexSuccess | LexFailure;

const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHAR_OPS = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
  "<",
  ">",
  "!",
  "?",
  ":",
]);

function advancePosition(
  source: string,
  start: number,
  end: number,
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < start; i++) {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  for (let i = start; i < end; i++) {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function positionAt(
  source: string,
  index: number,
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: P7Diagnostic[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === undefined) break;
    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      i += 1;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const start = i;
      i += 2;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        const position = positionAt(source, start);
        diagnostics.push(
          p7Diagnostic(
            "expression.comment",
            "unterminated block comment",
            position.line,
            position.column,
          ),
        );
      }
      continue;
    }
    const start = i;
    const position = positionAt(source, start);
    if (
      /[0-9]/.test(char) ||
      (char === "." && /[0-9]/.test(source[i + 1] ?? ""))
    ) {
      let sawDot = false;
      while (i < source.length) {
        const next = source[i]!;
        if (next === ".") {
          if (sawDot) break;
          sawDot = true;
          i += 1;
          continue;
        }
        if (!/[0-9]/.test(next)) break;
        i += 1;
      }
      const text = source.slice(start, i);
      const endPosition = positionAt(source, i);
      tokens.push({
        kind: "number",
        text,
        start,
        end: i,
        line: position.line,
        column: position.column,
        endLine: endPosition.line,
        endColumn: endPosition.column,
      });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i += 1;
      const endPosition = positionAt(source, i);
      tokens.push({
        kind: "ident",
        text: source.slice(start, i),
        start,
        end: i,
        line: position.line,
        column: position.column,
        endLine: endPosition.line,
        endColumn: endPosition.column,
      });
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      i += 1;
      let value = "";
      let closed = false;
      while (i < source.length) {
        const next = source[i]!;
        if (next === "\\") {
          const escaped = source[i + 1] ?? "";
          value +=
            escaped === "n"
              ? "\n"
              : escaped === "t"
                ? "\t"
                : escaped === "r"
                  ? "\r"
                  : escaped;
          i += 2;
          continue;
        }
        if (next === quote) {
          i += 1;
          closed = true;
          break;
        }
        value += next;
        i += 1;
      }
      if (!closed) {
        diagnostics.push(
          p7Diagnostic(
            "expression.string",
            "unterminated string literal",
            position.line,
            position.column,
          ),
        );
        continue;
      }
      const endPosition = positionAt(source, i);
      tokens.push({
        kind: "string",
        text: value,
        start,
        end: i,
        line: position.line,
        column: position.column,
        endLine: endPosition.line,
        endColumn: endPosition.column,
      });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      i += 2;
      const endPosition = positionAt(source, i);
      tokens.push({
        kind: "op",
        text: two,
        start,
        end: i,
        line: position.line,
        column: position.column,
        endLine: endPosition.line,
        endColumn: endPosition.column,
      });
      continue;
    }
    if (ONE_CHAR_OPS.has(char)) {
      i += 1;
      const endPosition = positionAt(source, i);
      tokens.push({
        kind: "op",
        text: char,
        start,
        end: i,
        line: position.line,
        column: position.column,
        endLine: endPosition.line,
        endColumn: endPosition.column,
      });
      continue;
    }
    diagnostics.push(
      p7Diagnostic(
        "expression.char",
        `unexpected character ${JSON.stringify(char)}`,
        position.line,
        position.column,
      ),
    );
    i += 1;
  }
  const endPosition = positionAt(source, source.length);
  tokens.push({
    kind: "eof",
    text: "",
    start: source.length,
    end: source.length,
    line: endPosition.line,
    column: endPosition.column,
    endLine: endPosition.line,
    endColumn: endPosition.column,
  });
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, tokens };
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type P7Expr =
  | { kind: "literal"; value: P7Value; span: P7Span }
  | { kind: "identifier"; name: string; span: P7Span }
  | { kind: "list"; items: P7Expr[]; span: P7Span }
  | {
      kind: "unary";
      op: "-" | "!";
      operand: P7Expr;
      span: P7Span;
    }
  | {
      kind: "binary";
      op: string;
      left: P7Expr;
      right: P7Expr;
      span: P7Span;
    }
  | {
      kind: "conditional";
      condition: P7Expr;
      whenTrue: P7Expr;
      whenFalse: P7Expr;
      span: P7Span;
    }
  | { kind: "call"; callee: P7Expr; args: P7Expr[]; span: P7Span }
  | {
      kind: "member";
      object: P7Expr;
      property: string;
      span: P7Span;
    }
  | {
      kind: "index";
      object: P7Expr;
      index: P7Expr;
      span: P7Span;
    };

export type P7ParseResult =
  | { ok: true; ast: P7Expr }
  | { ok: false; diagnostics: P7Diagnostic[] };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class ExpressionParser {
  private pos = 0;
  private diagnostics: P7Diagnostic[] = [];

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
  ) {}

  parse(): P7ParseResult {
    const expr = this.parseExpression(0);
    if (!expr) return { ok: false, diagnostics: this.diagnostics };
    if (this.peek().kind !== "eof") {
      this.error(
        this.peek(),
        "expression.trailing",
        `unexpected ${JSON.stringify(this.peek().text || "end of input")}`,
      );
      return { ok: false, diagnostics: this.diagnostics };
    }
    if (this.diagnostics.length)
      return { ok: false, diagnostics: this.diagnostics };
    return { ok: true, ast: expr };
  }

  private peek(offset = 0): Token {
    return (
      this.tokens[this.pos + offset] ?? {
        kind: "eof",
        text: "",
        start: this.source.length,
        end: this.source.length,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      }
    );
  }

  private take(): Token {
    const token = this.peek();
    this.pos += 1;
    return token;
  }

  private error(token: Token, code: string, message: string): void {
    this.diagnostics.push({
      severity: "error",
      code,
      message,
      line: token.line,
      column: token.column,
      endLine: token.endLine,
      endColumn: token.endColumn,
    });
  }

  private spanFrom(start: Token, end: Token): P7Span {
    return {
      start: start.start,
      end: end.end,
      line: start.line,
      column: start.column,
      endLine: end.endLine,
      endColumn: end.endColumn,
    };
  }

  private isOp(text: string): boolean {
    const token = this.peek();
    return token.kind === "op" && token.text === text;
  }

  private parseExpression(minPrecedence: number): P7Expr | null {
    let left = this.parseUnary();
    if (!left) return null;
    for (;;) {
      const token = this.peek();
      if (token.kind !== "op") break;
      const precedence = BINARY_PRECEDENCE[token.text];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.take();
      const right = this.parseExpression(precedence + 1);
      if (!right) return null;
      left = {
        kind: "binary",
        op: token.text,
        left,
        right,
        span: {
          ...left.span,
          endLine: right.span.endLine,
          endColumn: right.span.endColumn,
          end: right.span.end,
        },
      };
    }
    if (minPrecedence === 0 && this.isOp("?")) {
      const question = this.take();
      const whenTrue = this.parseExpression(0);
      if (!whenTrue) return null;
      if (!this.isOp(":")) {
        this.error(this.peek(), "expression.ternary", "expected ':'");
        return null;
      }
      this.take();
      const whenFalse = this.parseExpression(0);
      if (!whenFalse) return null;
      left = {
        kind: "conditional",
        condition: left,
        whenTrue,
        whenFalse,
        span: this.spanFrom(question, this.peek(-1)),
      };
    }
    return left;
  }

  private parseUnary(): P7Expr | null {
    const token = this.peek();
    if (token.kind === "op" && (token.text === "-" || token.text === "!")) {
      this.take();
      const operand = this.parseUnary();
      if (!operand) return null;
      return {
        kind: "unary",
        op: token.text,
        operand,
        span: {
          ...tokenSpan(token),
          end: operand.span.end,
          endLine: operand.span.endLine,
          endColumn: operand.span.endColumn,
        },
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): P7Expr | null {
    let expr = this.parsePrimary();
    if (!expr) return null;
    for (;;) {
      if (this.isOp("(")) {
        const open = this.take();
        const args: P7Expr[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            const arg = this.parseExpression(0);
            if (!arg) return null;
            args.push(arg);
            if (this.isOp(",")) {
              this.take();
              continue;
            }
            break;
          }
        }
        if (!this.isOp(")")) {
          this.error(this.peek(), "expression.call", "expected ')'");
          return null;
        }
        const close = this.take();
        expr = {
          kind: "call",
          callee: expr,
          args,
          span: {
            ...expr.span,
            end: close.end,
            endLine: close.endLine,
            endColumn: close.endColumn,
          },
        };
        void open;
        continue;
      }
      if (this.isOp("[")) {
        this.take();
        const index = this.parseExpression(0);
        if (!index) return null;
        if (!this.isOp("]")) {
          this.error(this.peek(), "expression.index", "expected ']'");
          return null;
        }
        const close = this.take();
        expr = {
          kind: "index",
          object: expr,
          index,
          span: {
            ...expr.span,
            end: close.end,
            endLine: close.endLine,
            endColumn: close.endColumn,
          },
        };
        continue;
      }
      if (this.isOp(".")) {
        this.take();
        const property = this.peek();
        if (property.kind !== "ident") {
          this.error(property, "expression.member", "expected a property name");
          return null;
        }
        this.take();
        expr = {
          kind: "member",
          object: expr,
          property: property.text,
          span: {
            ...expr.span,
            end: property.end,
            endLine: property.endLine,
            endColumn: property.endColumn,
          },
        };
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): P7Expr | null {
    const token = this.peek();
    if (token.kind === "number") {
      this.take();
      let value: P7Value = numberValue(Number(token.text));
      let end = token;
      const unit = this.peek();
      if (unit.kind === "ident" && isUnitIdentifier(unit.text)) {
        this.take();
        const spec = UNIT_TABLE[unit.text]!;
        value =
          spec.kind === "length"
            ? { kind: "length", value: Number(token.text) * spec.factor }
            : { kind: "angle", value: Number(token.text) * spec.factor };
        end = unit;
      }
      return { kind: "literal", value, span: this.spanFrom(token, end) };
    }
    if (token.kind === "string") {
      this.take();
      return {
        kind: "literal",
        value: stringValue(token.text),
        span: tokenSpan(token),
      };
    }
    if (token.kind === "ident") {
      this.take();
      if (token.text === "true" || token.text === "false") {
        return {
          kind: "literal",
          value: booleanValue(token.text === "true"),
          span: tokenSpan(token),
        };
      }
      return { kind: "identifier", name: token.text, span: tokenSpan(token) };
    }
    if (this.isOp("(")) {
      this.take();
      const expr = this.parseExpression(0);
      if (!expr) return null;
      if (!this.isOp(")")) {
        this.error(this.peek(), "expression.paren", "expected ')'");
        return null;
      }
      const close = this.take();
      return {
        ...expr,
        span: {
          ...expr.span,
          end: close.end,
          endLine: close.endLine,
          endColumn: close.endColumn,
        },
      };
    }
    if (this.isOp("[")) {
      const open = this.take();
      const items: P7Expr[] = [];
      if (!this.isOp("]")) {
        for (;;) {
          const item = this.parseExpression(0);
          if (!item) return null;
          items.push(item);
          if (this.isOp(",")) {
            this.take();
            if (this.isOp("]")) break;
            continue;
          }
          break;
        }
      }
      if (!this.isOp("]")) {
        this.error(this.peek(), "expression.list", "expected ']'");
        return null;
      }
      const close = this.take();
      return {
        kind: "list",
        items,
        span: this.spanFrom(open, close),
      };
    }
    this.error(
      token,
      "expression.expected",
      token.kind === "eof"
        ? "unexpected end of expression"
        : `unexpected ${JSON.stringify(token.text)}`,
    );
    return null;
  }
}

const BINARY_PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function tokenSpan(token: Token): P7Span {
  return {
    start: token.start,
    end: token.end,
    line: token.line,
    column: token.column,
    endLine: token.endLine,
    endColumn: token.endColumn,
  };
}

export function parseP7Expression(source: string): P7ParseResult {
  const lexed = lex(source);
  if (!lexed.ok) return { ok: false, diagnostics: lexed.diagnostics };
  return new ExpressionParser(source, lexed.tokens).parse();
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface P7EvalOptions {
  scope?: P7Scope;
}

export type P7AstEvalResult =
  | { ok: true; value: P7Value }
  | { ok: false; diagnostics: P7Diagnostic[] };

function spanDiagnostic(
  span: P7Span,
  code: string,
  message: string,
): P7Diagnostic {
  return {
    severity: "error",
    code,
    message,
    line: span.line,
    column: span.column,
    endLine: span.endLine,
    endColumn: span.endColumn,
  };
}

class Evaluator {
  private diagnostics: P7Diagnostic[] = [];
  private locals = new Map<string, P7Value>();
  private readonly globalScope: P7Scope;

  constructor(scope: P7Scope) {
    this.globalScope = scope;
  }

  evaluate(ast: P7Expr): P7AstEvalResult {
    const value = this.evalExpr(ast);
    if (this.diagnostics.length || value === null)
      return { ok: false, diagnostics: this.diagnostics };
    return { ok: true, value };
  }

  private fail(span: P7Span, code: string, message: string): null {
    this.diagnostics.push(spanDiagnostic(span, code, message));
    return null;
  }

  private lookup(name: string, span: P7Span): P7Value | null {
    const local = this.locals.get(name);
    if (local) return local;
    if (Object.prototype.hasOwnProperty.call(this.globalScope, name)) {
      return normalizeScopeEntry(this.globalScope[name]!);
    }
    if (name === "pi") return numberValue(Math.PI);
    if (name === "true") return booleanValue(true);
    if (name === "false") return booleanValue(false);
    if (isUnitIdentifier(name)) {
      const spec = UNIT_TABLE[name]!;
      return spec.kind === "length"
        ? { kind: "length", value: spec.factor }
        : { kind: "angle", value: spec.factor };
    }
    if (BUILTIN_FUNCTIONS[name]) return BUILTIN_FUNCTIONS[name]!;
    return this.fail(
      span,
      "expression.unknownIdentifier",
      `unknown identifier '${name}'`,
    );
  }

  private evalExpr(expr: P7Expr): P7Value | null {
    switch (expr.kind) {
      case "literal":
        return expr.value;
      case "identifier":
        return this.lookup(expr.name, expr.span);
      case "list": {
        const items: P7Value[] = [];
        for (const item of expr.items) {
          const value = this.evalExpr(item);
          if (!value) return null;
          items.push(value);
        }
        return { kind: "list", items };
      }
      case "unary": {
        const operand = this.evalExpr(expr.operand);
        if (!operand) return null;
        if (expr.op === "!") {
          if (operand.kind !== "boolean")
            return this.fail(
              expr.span,
              "expression.type",
              `'!' expects boolean, got ${p7TypeLabel(operand.kind)}`,
            );
          return booleanValue(!operand.value);
        }
        if (
          operand.kind === "number" ||
          operand.kind === "length" ||
          operand.kind === "angle"
        )
          return { ...operand, value: -operand.value };
        return this.fail(
          expr.span,
          "expression.type",
          `unary '-' expects a number, got ${p7TypeLabel(operand.kind)}`,
        );
      }
      case "binary":
        return this.evalBinary(expr);
      case "conditional": {
        const condition = this.evalExpr(expr.condition);
        if (!condition) return null;
        if (condition.kind !== "boolean")
          return this.fail(
            expr.span,
            "expression.type",
            `condition expects boolean, got ${p7TypeLabel(condition.kind)}`,
          );
        return this.evalExpr(condition.value ? expr.whenTrue : expr.whenFalse);
      }
      case "call": {
        const callee = this.evalExpr(expr.callee);
        if (!callee) return null;
        if (callee.kind !== "function")
          return this.fail(
            expr.span,
            "expression.call",
            `${p7TypeLabel(callee.kind)} is not callable`,
          );
        const args: P7Value[] = [];
        for (const arg of expr.args) {
          const value = this.evalExpr(arg);
          if (!value) return null;
          args.push(value);
        }
        if (callee.arity !== null && args.length !== callee.arity)
          return this.fail(
            expr.span,
            "expression.arity",
            `${callee.name} expects ${callee.arity} argument(s), got ${args.length}`,
          );
        try {
          return callee.call(args);
        } catch (error) {
          return this.fail(
            expr.span,
            "expression.runtime",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      case "member": {
        const object = this.evalExpr(expr.object);
        if (!object) return null;
        if (object.kind === "list" && expr.property === "length")
          return numberValue(object.items.length);
        if (object.kind === "string" && expr.property === "length")
          return numberValue(object.value.length);
        return this.fail(
          expr.span,
          "expression.member",
          `no property '${expr.property}' on ${p7TypeLabel(object.kind)}`,
        );
      }
      case "index": {
        const object = this.evalExpr(expr.object);
        if (!object) return null;
        const index = this.evalExpr(expr.index);
        if (!index) return null;
        if (index.kind !== "number")
          return this.fail(
            expr.span,
            "expression.index",
            "index must be a number",
          );
        const at = Math.trunc(index.value);
        if (object.kind === "list") {
          if (at < 0 || at >= object.items.length)
            return this.fail(
              expr.span,
              "expression.index",
              `index ${at} is out of range`,
            );
          return object.items[at]!;
        }
        if (object.kind === "string") {
          const chars = [...object.value];
          if (at < 0 || at >= chars.length)
            return this.fail(
              expr.span,
              "expression.index",
              `index ${at} is out of range`,
            );
          return stringValue(chars[at]!);
        }
        return this.fail(
          expr.span,
          "expression.index",
          `cannot index ${p7TypeLabel(object.kind)}`,
        );
      }
    }
  }

  private evalBinary(
    expr: Extract<P7Expr, { kind: "binary" }>,
  ): P7Value | null {
    if (expr.op === "&&" || expr.op === "||") {
      const left = this.evalExpr(expr.left);
      if (!left) return null;
      if (left.kind !== "boolean")
        return this.fail(
          expr.span,
          "expression.type",
          `'${expr.op}' expects booleans, got ${p7TypeLabel(left.kind)}`,
        );
      if (expr.op === "&&" && !left.value) return booleanValue(false);
      if (expr.op === "||" && left.value) return booleanValue(true);
      const right = this.evalExpr(expr.right);
      if (!right) return null;
      if (right.kind !== "boolean")
        return this.fail(
          expr.span,
          "expression.type",
          `'${expr.op}' expects booleans, got ${p7TypeLabel(right.kind)}`,
        );
      return right;
    }
    const left = this.evalExpr(expr.left);
    if (!left) return null;
    const right = this.evalExpr(expr.right);
    if (!right) return null;
    switch (expr.op) {
      case "+":
        if (left.kind === "string" && right.kind === "string")
          return stringValue(left.value + right.value);
        {
          const pair = sameNumericPair(left, right);
          if (pair) return { ...pair[0], value: pair[0].value + pair[1].value };
        }
        return this.binaryTypeError(expr, left, right, "add");
      case "-": {
        const pair = sameNumericPair(left, right);
        if (pair) return { ...pair[0], value: pair[0].value - pair[1].value };
        return this.binaryTypeError(expr, left, right, "subtract");
      }
      case "*": {
        if (left.kind === "number" && right.kind === "number")
          return numberValue(left.value * right.value);
        if (left.kind === "number" && right.kind === "length")
          return { ...right, value: left.value * right.value };
        if (left.kind === "number" && right.kind === "angle")
          return { ...right, value: left.value * right.value };
        if (right.kind === "number" && left.kind === "length")
          return { ...left, value: left.value * right.value };
        if (right.kind === "number" && left.kind === "angle")
          return { ...left, value: left.value * right.value };
        return this.binaryTypeError(expr, left, right, "multiply");
      }
      case "/": {
        if (left.kind === "number" && right.kind === "number") {
          if (Math.abs(right.value) < 1e-15)
            return this.fail(
              expr.span,
              "expression.divide",
              "division by zero",
            );
          return numberValue(left.value / right.value);
        }
        if (left.kind === "length" && right.kind === "number") {
          if (Math.abs(right.value) < 1e-15)
            return this.fail(
              expr.span,
              "expression.divide",
              "division by zero",
            );
          return { ...left, value: left.value / right.value };
        }
        if (left.kind === "angle" && right.kind === "number") {
          if (Math.abs(right.value) < 1e-15)
            return this.fail(
              expr.span,
              "expression.divide",
              "division by zero",
            );
          return { ...left, value: left.value / right.value };
        }
        if (
          (left.kind === "length" && right.kind === "length") ||
          (left.kind === "angle" && right.kind === "angle")
        ) {
          if (Math.abs(right.value) < 1e-15)
            return this.fail(
              expr.span,
              "expression.divide",
              "division by zero",
            );
          return numberValue(left.value / right.value);
        }
        return this.binaryTypeError(expr, left, right, "divide");
      }
      case "%": {
        if (left.kind === "number" && right.kind === "number") {
          if (Math.abs(right.value) < 1e-15)
            return this.fail(
              expr.span,
              "expression.divide",
              "division by zero",
            );
          return numberValue(left.value % right.value);
        }
        return this.binaryTypeError(expr, left, right, "modulo");
      }
      case "==":
      case "!=": {
        let equal = false;
        if (left.kind === "string" && right.kind === "string")
          equal = left.value === right.value;
        else if (left.kind === "boolean" && right.kind === "boolean")
          equal = left.value === right.value;
        else if (left.kind === "number" && right.kind === "number")
          equal = left.value === right.value;
        else if (left.kind === "length" && right.kind === "length")
          equal = left.value === right.value;
        else if (left.kind === "angle" && right.kind === "angle")
          equal = left.value === right.value;
        return booleanValue(expr.op === "==" ? equal : !equal);
      }
      case "<":
      case "<=":
      case ">":
      case ">=": {
        const pair = sameNumericPair(left, right);
        if (!pair) return this.binaryTypeError(expr, left, right, "compare");
        const a = pair[0].value;
        const b = pair[1].value;
        return booleanValue(
          expr.op === "<"
            ? a < b
            : expr.op === "<="
              ? a <= b
              : expr.op === ">"
                ? a > b
                : a >= b,
        );
      }
      default:
        return this.fail(
          expr.span,
          "expression.operator",
          `unsupported operator '${expr.op}'`,
        );
    }
  }

  private binaryTypeError(
    expr: Extract<P7Expr, { kind: "binary" }>,
    left: P7Value,
    right: P7Value,
    verb: string,
  ): null {
    return this.fail(
      expr.span,
      "expression.type",
      `cannot ${verb} ${p7TypeLabel(left.kind)} and ${p7TypeLabel(right.kind)}`,
    );
  }
}

function builtin(
  name: string,
  arity: number | null,
  call: (args: readonly P7Value[]) => P7Value,
): P7Value {
  return { kind: "function", name, arity, call };
}

function numericArg(
  name: string,
  args: readonly P7Value[],
  index: number,
): number {
  const arg = args[index];
  if (
    !arg ||
    (arg.kind !== "number" && arg.kind !== "length" && arg.kind !== "angle")
  )
    throw new Error(`${name}: argument ${index + 1} must be numeric`);
  return arg.value;
}

function sameNumericType(
  name: string,
  args: readonly P7Value[],
): "number" | "length" | "angle" {
  const first = args[0];
  if (
    !first ||
    (first.kind !== "number" &&
      first.kind !== "length" &&
      first.kind !== "angle")
  )
    throw new Error(`${name}: expected numeric arguments`);
  for (const arg of args.slice(1))
    if (arg.kind !== first.kind)
      throw new Error(`${name}: arguments must have the same type`);
  return first.kind;
}

function numericArguments(
  name: string,
  args: readonly P7Value[],
): NumericValue[] {
  if (!args.length)
    throw new Error(`${name}: at least one argument is required`);
  sameNumericType(name, args);
  return args as NumericValue[];
}

const BUILTIN_FUNCTIONS: Record<string, P7Value> = {
  min: builtin("min", null, (args) => {
    const values = numericArguments("min", args);
    const kind = values[0]!.kind;
    const value = Math.min(...values.map((arg) => arg.value));
    return { kind, value } as P7Value;
  }),
  max: builtin("max", null, (args) => {
    const values = numericArguments("max", args);
    const kind = values[0]!.kind;
    const value = Math.max(...values.map((arg) => arg.value));
    return { kind, value } as P7Value;
  }),
  abs: builtin("abs", 1, (args) => {
    const arg = args[0];
    if (
      !arg ||
      (arg.kind !== "number" && arg.kind !== "length" && arg.kind !== "angle")
    )
      throw new Error("abs: expected one numeric argument");
    return { ...arg, value: Math.abs(arg.value) };
  }),
  sqrt: builtin("sqrt", 1, (args) =>
    numberValue(Math.sqrt(numericArg("sqrt", args, 0))),
  ),
  sin: builtin("sin", 1, (args) => {
    const arg = args[0];
    const radians =
      arg?.kind === "angle" ? arg.value : numericArg("sin", args, 0);
    return numberValue(Math.sin(radians));
  }),
  cos: builtin("cos", 1, (args) => {
    const arg = args[0];
    const radians =
      arg?.kind === "angle" ? arg.value : numericArg("cos", args, 0);
    return numberValue(Math.cos(radians));
  }),
  tan: builtin("tan", 1, (args) => {
    const arg = args[0];
    const radians =
      arg?.kind === "angle" ? arg.value : numericArg("tan", args, 0);
    return numberValue(Math.tan(radians));
  }),
  asin: builtin("asin", 1, (args) =>
    angleValueRad(Math.asin(numericArg("asin", args, 0))),
  ),
  acos: builtin("acos", 1, (args) =>
    angleValueRad(Math.acos(numericArg("acos", args, 0))),
  ),
  atan: builtin("atan", 1, (args) =>
    angleValueRad(Math.atan(numericArg("atan", args, 0))),
  ),
  round: builtin("round", 1, (args) =>
    numberValue(Math.round(numericArg("round", args, 0))),
  ),
  floor: builtin("floor", 1, (args) =>
    numberValue(Math.floor(numericArg("floor", args, 0))),
  ),
  ceil: builtin("ceil", 1, (args) =>
    numberValue(Math.ceil(numericArg("ceil", args, 0))),
  ),
  pow: builtin("pow", 2, (args) =>
    numberValue(numericArg("pow", args, 0) ** numericArg("pow", args, 1)),
  ),
  clamp: builtin("clamp", 3, (args) => {
    const values = numericArguments("clamp", args);
    const [value, min, max] = values;
    if (!value || !min || !max)
      throw new Error("clamp: three arguments required");
    return {
      kind: value.kind,
      value: Math.min(Math.max(value.value, min.value), max.value),
    } as P7Value;
  }),
};

export function evaluateP7Expression(
  source: string,
  scope: P7Scope = {},
): P7EvalResult {
  const parsed = parseP7Expression(source);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };
  return evaluateP7Ast(parsed.ast, scope);
}

export function evaluateP7Ast(
  ast: P7Expr,
  scope: P7Scope = {},
): P7AstEvalResult {
  return new Evaluator(scope).evaluate(ast);
}

/**
 * Identifiers used by an expression, excluding units and built-in function
 * names. Used by the variable dependency graph.
 */
export function identifiersInP7Expression(source: string): string[] {
  const lexed = lex(source);
  if (!lexed.ok) return [];
  const out: string[] = [];
  for (const token of lexed.tokens) {
    if (token.kind !== "ident") continue;
    if (isUnitIdentifier(token.text)) continue;
    if (token.text === "true" || token.text === "false" || token.text === "pi")
      continue;
    if (token.text in BUILTIN_FUNCTIONS) continue;
    if (!out.includes(token.text)) out.push(token.text);
  }
  return out;
}

export function collectP7Identifiers(ast: P7Expr): string[] {
  const out = new Set<string>();
  const visit = (expr: P7Expr): void => {
    switch (expr.kind) {
      case "identifier":
        out.add(expr.name);
        return;
      case "literal":
        return;
      case "list":
        expr.items.forEach(visit);
        return;
      case "unary":
        visit(expr.operand);
        return;
      case "binary":
        visit(expr.left);
        visit(expr.right);
        return;
      case "conditional":
        visit(expr.condition);
        visit(expr.whenTrue);
        visit(expr.whenFalse);
        return;
      case "call":
        visit(expr.callee);
        expr.args.forEach(visit);
        return;
      case "member":
        visit(expr.object);
        return;
      case "index":
        visit(expr.object);
        visit(expr.index);
        return;
    }
  };
  visit(ast);
  for (const name of [...out]) {
    if (
      name === "true" ||
      name === "false" ||
      name === "pi" ||
      isUnitIdentifier(name) ||
      name in BUILTIN_FUNCTIONS
    )
      out.delete(name);
  }
  return [...out];
}
