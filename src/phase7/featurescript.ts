// Phase 7 — FeatureScript language subset.
//
// The parser covers the declarations a local Feature Studio needs: a version
// header, imports, consts, functions and `feature` blocks with typed parameter
// declarations and a result expression. Expressions are evaluated by the
// Phase 7 typed engine, so units, lists, functions and named references behave
// the same as they do in the Variable Studio.
//
// Kernel execution is deliberately out of scope here. A compiled feature is a
// parameter schema plus a pure evaluator; inserting it into a Part Studio is
// handled by featureStudio.ts and is metadata-only until the kernel boundary
// work lands.
import {
  angleValueRad,
  evaluateP7Expression,
  hashString,
  lengthValueM,
  numberValue,
  p7Diagnostic,
  p7TypeLabel,
  p7ValueLabel,
  stringValue,
  type P7Diagnostic,
  type P7Scope,
  type P7Value,
} from "./expression";
import type { VariableType } from "./variables";

export const FEATURESCRIPT_LANGUAGE_VERSION = 1 as const;
export const FEATURESCRIPT_SCHEMA = "scadgen.featurescript";

export interface FeatureScriptSpan {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface FeatureScriptParameterDeclaration {
  id: string;
  label: string;
  type: VariableType;
  defaultExpression: string;
  options: string[];
  description: string;
  span: FeatureScriptSpan;
}

export interface FeatureScriptFeatureDeclaration {
  name: string;
  label: string;
  description: string;
  parameters: FeatureScriptParameterDeclaration[];
  resultExpression: string;
  span: FeatureScriptSpan;
}

export interface FeatureScriptConstDeclaration {
  name: string;
  expression: string;
  exported: boolean;
  span: FeatureScriptSpan;
}

export interface FeatureScriptFunctionDeclaration {
  name: string;
  parameters: string[];
  bodyExpression: string;
  span: FeatureScriptSpan;
}

export interface FeatureScriptImport {
  path: string;
  version: string;
  span: FeatureScriptSpan;
}

export interface FeatureScriptProgram {
  languageVersion: number | null;
  imports: FeatureScriptImport[];
  consts: FeatureScriptConstDeclaration[];
  functions: FeatureScriptFunctionDeclaration[];
  features: FeatureScriptFeatureDeclaration[];
  diagnostics: P7Diagnostic[];
}

export interface FeatureScriptParameter {
  id: string;
  label: string;
  type: VariableType;
  defaultValue: P7Value;
  defaultExpression: string;
  options: string[];
  description: string;
}

export interface FeatureScriptFeature {
  /** Stable across reloads; changes only when the declaration name changes. */
  id: string;
  name: string;
  label: string;
  description: string;
  parameters: FeatureScriptParameter[];
  resultExpression: string;
  sourceHash: string;
  languageVersion: number;
  notices: string[];
}

export interface FeatureScriptCompileResult {
  ok: boolean;
  program: FeatureScriptProgram;
  features: FeatureScriptFeature[];
  constants: Record<string, P7Value>;
  diagnostics: P7Diagnostic[];
  notices: string[];
  sourceHash: string;
}

export interface FeatureScriptCustomFeatureEvaluation {
  ok: boolean;
  values: Record<string, P7Value>;
  result: P7Value | null;
  diagnostics: P7Diagnostic[];
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type FsTokenKind = "number" | "string" | "ident" | "op" | "eof";

interface FsToken {
  kind: FsTokenKind;
  text: string;
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

const FS_KEYWORDS = new Set([
  "FeatureScript",
  "import",
  "export",
  "const",
  "function",
  "feature",
  "parameter",
  "is",
  "result",
  "body",
  "label",
  "description",
  "return",
  "true",
  "false",
  "annotation",
]);

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

function fsSpan(source: string, start: number, end: number): FeatureScriptSpan {
  const from = positionAt(source, start);
  const to = positionAt(source, end);
  return {
    start,
    end,
    line: from.line,
    column: from.column,
    endLine: to.line,
    endColumn: to.column,
  };
}

function lexFeatureScript(source: string): {
  tokens: FsToken[];
  diagnostics: P7Diagnostic[];
} {
  const tokens: FsToken[] = [];
  const diagnostics: P7Diagnostic[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === undefined) break;
    if (/\s/.test(char)) {
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
        const pos = positionAt(source, start);
        diagnostics.push(
          p7Diagnostic(
            "featurescript.comment",
            "unterminated block comment",
            pos.line,
            pos.column,
          ),
        );
      }
      continue;
    }
    const start = i;
    const from = positionAt(source, start);
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
      const to = positionAt(source, i);
      tokens.push({
        kind: "number",
        text: source.slice(start, i),
        start,
        end: i,
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
      });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i += 1;
      const to = positionAt(source, i);
      tokens.push({
        kind: "ident",
        text: source.slice(start, i),
        start,
        end: i,
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
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
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
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
            "featurescript.string",
            "unterminated string literal",
            from.line,
            from.column,
          ),
        );
        continue;
      }
      const to = positionAt(source, i);
      tokens.push({
        kind: "string",
        text: value,
        start,
        end: i,
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
      });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "=>"].includes(two)) {
      i += 2;
      const to = positionAt(source, i);
      tokens.push({
        kind: "op",
        text: two,
        start,
        end: i,
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
      });
      continue;
    }
    if ("{}()[];,:.=+-*/%<>!?".includes(char)) {
      i += 1;
      const to = positionAt(source, i);
      tokens.push({
        kind: "op",
        text: char,
        start,
        end: i,
        line: from.line,
        column: from.column,
        endLine: to.line,
        endColumn: to.column,
      });
      continue;
    }
    diagnostics.push(
      p7Diagnostic(
        "featurescript.char",
        `unexpected character ${JSON.stringify(char)}`,
        from.line,
        from.column,
      ),
    );
    i += 1;
  }
  const end = positionAt(source, source.length);
  tokens.push({
    kind: "eof",
    text: "",
    start: source.length,
    end: source.length,
    line: end.line,
    column: end.column,
    endLine: end.line,
    endColumn: end.column,
  });
  return { tokens, diagnostics };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class FeatureScriptParser {
  private pos = 0;
  private diagnostics: P7Diagnostic[] = [];

  constructor(
    private readonly source: string,
    private readonly tokens: FsToken[],
  ) {}

  parse(): FeatureScriptProgram {
    const program: FeatureScriptProgram = {
      languageVersion: null,
      imports: [],
      consts: [],
      functions: [],
      features: [],
      diagnostics: [],
    };
    while (this.peek().kind !== "eof") {
      const token = this.peek();
      if (token.kind === "ident" && token.text === "FeatureScript") {
        this.take();
        const version = this.peek();
        if (version.kind !== "number") {
          this.error(
            version,
            "featurescript.header",
            "expected a language version",
          );
        } else {
          this.take();
          program.languageVersion = Number(version.text);
        }
        this.expectSemicolon("header");
        continue;
      }
      if (token.kind === "ident" && token.text === "import") {
        program.imports.push(this.parseImport(false));
        continue;
      }
      if (token.kind === "ident" && token.text === "export") {
        this.take();
        const next = this.peek();
        if (next.kind === "ident" && next.text === "import") {
          program.imports.push(this.parseImport(true));
          continue;
        }
        if (next.kind === "ident" && next.text === "const") {
          const declaration = this.parseConst(true);
          if (declaration) program.consts.push(declaration);
          continue;
        }
        if (next.kind === "ident" && next.text === "feature") {
          const declaration = this.parseFeature();
          if (declaration) program.features.push(declaration);
          continue;
        }
        if (next.kind === "ident" && next.text === "function") {
          const declaration = this.parseFunction();
          if (declaration) program.functions.push(declaration);
          continue;
        }
        this.error(
          next,
          "featurescript.export",
          "cannot export this declaration",
        );
        this.skipStatement();
        continue;
      }
      if (token.kind === "ident" && token.text === "annotation") {
        this.skipBalanced("annotation");
        continue;
      }
      if (token.kind === "ident" && token.text === "const") {
        const declaration = this.parseConst(false);
        if (declaration) program.consts.push(declaration);
        continue;
      }
      if (token.kind === "ident" && token.text === "feature") {
        const declaration = this.parseFeature();
        if (declaration) program.features.push(declaration);
        continue;
      }
      if (token.kind === "ident" && token.text === "function") {
        const declaration = this.parseFunction();
        if (declaration) program.functions.push(declaration);
        continue;
      }
      this.error(
        token,
        "featurescript.statement",
        `unexpected ${JSON.stringify(token.text || "end of input")}`,
      );
      this.skipStatement();
    }
    program.diagnostics = this.diagnostics;
    return program;
  }

  private peek(offset = 0): FsToken {
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

  private take(): FsToken {
    const token = this.peek();
    this.pos += 1;
    return token;
  }

  private error(token: FsToken, code: string, message: string): void {
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

  private expectSemicolon(context: string): void {
    const token = this.peek();
    if (token.kind === "op" && token.text === ";") {
      this.take();
      return;
    }
    this.error(
      token,
      "featurescript.semicolon",
      `expected ';' after ${context}`,
    );
    // Recover at the next semicolon without consuming a declaration keyword.
    while (this.peek().kind !== "eof") {
      const current = this.take();
      if (current.kind === "op" && current.text === ";") break;
    }
  }

  private skipStatement(): void {
    while (this.peek().kind !== "eof") {
      const token = this.take();
      if (token.kind === "op" && token.text === ";") break;
      if (token.kind === "op" && token.text === "}") {
        this.pos -= 1;
        break;
      }
    }
  }

  private skipBalanced(openKeyword: string): void {
    const keyword = this.take();
    if (!(keyword.kind === "ident" && keyword.text === openKeyword)) return;
    const open = this.peek();
    if (!(open.kind === "op" && open.text === "{")) {
      this.error(open, "featurescript.annotation", "expected '{'");
      this.skipStatement();
      return;
    }
    let depth = 0;
    while (this.peek().kind !== "eof") {
      const token = this.take();
      if (token.kind !== "op") continue;
      if (token.text === "{") depth += 1;
      if (token.text === "}") {
        depth -= 1;
        if (depth === 0) return;
      }
    }
    this.error(keyword, "featurescript.annotation", "unterminated annotation");
  }

  private parseImport(exported: boolean): FeatureScriptImport {
    const keyword = this.take();
    // `import(path : "...", version : "...")` — the values are metadata here;
    // the Feature Studio resolves imports against its local standard library.
    let path = "";
    let version = "";
    if (this.peek().kind === "op" && this.peek().text === "(") {
      this.take();
      let depth = 1;
      while (this.peek().kind !== "eof" && depth > 0) {
        const token = this.take();
        if (token.kind === "op" && token.text === "(") depth += 1;
        if (token.kind === "op" && token.text === ")") depth -= 1;
        if (token.kind === "ident" && token.text === "path") {
          const colon = this.peek();
          if (colon.kind === "op" && colon.text === ":") {
            this.take();
            const value = this.take();
            if (value.kind === "string") path = value.text;
          }
        }
        if (token.kind === "ident" && token.text === "version") {
          const colon = this.peek();
          if (colon.kind === "op" && colon.text === ":") {
            this.take();
            const value = this.take();
            if (value.kind === "string") version = value.text;
          }
        }
      }
    }
    this.expectSemicolon("import");
    return {
      path,
      version,
      span: fsSpan(this.source, keyword.start, keyword.end),
    };
  }

  private readExpressionUntilSemicolon(): {
    text: string;
    span: FeatureScriptSpan;
  } {
    const start = this.peek();
    const startPos = this.pos;
    let depth = 0;
    while (this.peek().kind !== "eof") {
      const token = this.peek();
      if (token.kind === "op") {
        if (token.text === "(" || token.text === "[" || token.text === "{")
          depth += 1;
        else if (token.text === ")" || token.text === "]" || token.text === "}")
          depth -= 1;
        else if (token.text === ";" && depth <= 0) break;
      }
      this.take();
    }
    const endIndex = this.peek().start;
    const endToken = this.tokens[this.pos - 1] ?? start;
    this.expectSemicolon("expression");
    const text = this.source.slice(start.start, endIndex).trim();
    void startPos;
    return {
      text,
      span: fsSpan(this.source, start.start, endToken.end),
    };
  }

  private parseConst(exported: boolean): FeatureScriptConstDeclaration | null {
    this.take(); // const
    const name = this.peek();
    if (name.kind !== "ident" || FS_KEYWORDS.has(name.text)) {
      this.error(name, "featurescript.const", "expected a constant name");
      this.skipStatement();
      return null;
    }
    this.take();
    if (!(this.peek().kind === "op" && this.peek().text === "=")) {
      this.error(this.peek(), "featurescript.const", "expected '='");
      this.skipStatement();
      return null;
    }
    this.take();
    const expression = this.readExpressionUntilSemicolon();
    return {
      name: name.text,
      expression: expression.text,
      exported,
      span: fsSpan(this.source, name.start, expression.span.end),
    };
  }

  private parseFunction(): FeatureScriptFunctionDeclaration | null {
    this.take(); // function
    const name = this.peek();
    if (name.kind !== "ident") {
      this.error(name, "featurescript.function", "expected a function name");
      this.skipStatement();
      return null;
    }
    this.take();
    const params: string[] = [];
    if (this.peek().kind === "op" && this.peek().text === "(") {
      this.take();
      while (this.peek().kind !== "eof") {
        const token = this.peek();
        if (token.kind === "op" && token.text === ")") {
          this.take();
          break;
        }
        if (token.kind === "ident") {
          if (!FS_KEYWORDS.has(token.text)) params.push(token.text);
          this.take();
        } else {
          this.take();
        }
      }
    } else {
      this.error(this.peek(), "featurescript.function", "expected '('");
    }
    if (!(this.peek().kind === "op" && this.peek().text === "{")) {
      this.error(this.peek(), "featurescript.function", "expected '{'");
      this.skipStatement();
      return null;
    }
    this.take();
    let bodyExpression = "";
    while (this.peek().kind !== "eof") {
      const token = this.peek();
      if (token.kind === "op" && token.text === "}") {
        this.take();
        break;
      }
      if (token.kind === "ident" && token.text === "return") {
        this.take();
        const expression = this.readExpressionUntilSemicolon();
        bodyExpression = expression.text;
        continue;
      }
      // Ignore local declarations in the pure subset; a function may only
      // return one expression. Keep scanning so one unknown statement does not
      // swallow the closing brace.
      if (token.kind === "op" && token.text === ";") {
        this.take();
        continue;
      }
      this.take();
    }
    if (!bodyExpression) {
      this.error(
        name,
        "featurescript.function",
        "function needs a return expression",
      );
      return null;
    }
    return {
      name: name.text,
      parameters: params,
      bodyExpression,
      span: fsSpan(this.source, name.start, this.peek(-1).end),
    };
  }

  private parseFeature(): FeatureScriptFeatureDeclaration | null {
    this.take(); // feature
    const name = this.peek();
    if (name.kind !== "ident") {
      this.error(name, "featurescript.feature", "expected a feature name");
      this.skipStatement();
      return null;
    }
    this.take();
    const open = this.peek();
    if (!(open.kind === "op" && open.text === "{")) {
      this.error(open, "featurescript.feature", "expected '{'");
      this.skipStatement();
      return null;
    }
    this.take();
    const parameters: FeatureScriptParameterDeclaration[] = [];
    let label = name.text;
    let description = "";
    let resultExpression = "";
    while (this.peek().kind !== "eof") {
      const token = this.peek();
      if (token.kind === "op" && token.text === "}") {
        this.take();
        break;
      }
      if (token.kind === "ident" && token.text === "parameter") {
        const parameter = this.parseParameter();
        if (parameter) parameters.push(parameter);
        continue;
      }
      if (token.kind === "ident" && token.text === "label") {
        this.take();
        if (this.peek().kind === "op" && this.peek().text === "=") this.take();
        const value = this.take();
        if (value.kind === "string") label = value.text;
        this.expectSemicolon("label");
        continue;
      }
      if (token.kind === "ident" && token.text === "description") {
        this.take();
        if (this.peek().kind === "op" && this.peek().text === "=") this.take();
        const value = this.take();
        if (value.kind === "string") description = value.text;
        this.expectSemicolon("description");
        continue;
      }
      if (
        token.kind === "ident" &&
        (token.text === "result" || token.text === "body")
      ) {
        this.take();
        if (this.peek().kind === "op" && this.peek().text === "=") this.take();
        resultExpression = this.readExpressionUntilSemicolon().text;
        continue;
      }
      if (token.kind === "op" && token.text === ";") {
        this.take();
        continue;
      }
      this.error(
        token,
        "featurescript.featureItem",
        `unexpected ${JSON.stringify(token.text)} in feature block`,
      );
      this.skipStatement();
    }
    if (!resultExpression)
      this.error(
        name,
        "featurescript.feature",
        "feature needs a result expression",
      );
    return {
      name: name.text,
      label,
      description,
      parameters,
      resultExpression,
      span: fsSpan(this.source, name.start, this.peek(-1).end),
    };
  }

  private parseParameter(): FeatureScriptParameterDeclaration | null {
    const keyword = this.take(); // parameter
    const id = this.peek();
    if (id.kind !== "ident") {
      this.error(id, "featurescript.parameter", "expected a parameter name");
      this.skipStatement();
      return null;
    }
    this.take();
    const metadata = {
      label: id.text,
      description: "",
      options: [] as string[],
    };
    this.readParameterMetadata(metadata);
    let type: VariableType = "number";
    if (this.peek().kind === "ident" && this.peek().text === "is") {
      this.take();
      const typeToken = this.peek();
      if (typeToken.kind === "ident") {
        type = featureScriptType(typeToken.text);
        this.take();
      } else {
        this.error(typeToken, "featurescript.parameter", "expected a type");
      }
    }
    // Metadata follows the type in the documented syntax:
    // `parameter width is length label "Width" = 80 mm;`
    this.readParameterMetadata(metadata);
    if (this.peek().kind === "op" && this.peek().text === "=") {
      this.take();
    }
    const expression = this.readExpressionUntilSemicolon();
    if (!expression.text)
      this.error(
        keyword,
        "featurescript.parameter",
        "default value is required",
      );
    return {
      id: id.text,
      label: metadata.label,
      type,
      defaultExpression: expression.text,
      options: metadata.options,
      description: metadata.description,
      span: fsSpan(this.source, id.start, expression.span.end),
    };
  }

  private readParameterMetadata(metadata: {
    label: string;
    description: string;
    options: string[];
  }): void {
    while (this.peek().kind === "ident") {
      const token = this.peek();
      if (token.text === "label" || token.text === "description") {
        this.take();
        if (this.peek().kind === "op" && this.peek().text === "=") this.take();
        const value = this.take();
        if (value.kind === "string") {
          if (token.text === "label") metadata.label = value.text;
          else metadata.description = value.text;
        } else {
          this.error(
            value,
            "featurescript.parameterMetadata",
            `expected a string for ${token.text}`,
          );
        }
        continue;
      }
      if (token.text === "options") {
        this.take();
        if (this.peek().kind === "op" && this.peek().text === "=") this.take();
        const open = this.peek();
        if (!(open.kind === "op" && open.text === "[")) {
          this.error(
            open,
            "featurescript.parameterMetadata",
            "expected '[' after options",
          );
          break;
        }
        this.take();
        const values: string[] = [];
        while (this.peek().kind !== "eof") {
          const next = this.peek();
          if (next.kind === "op" && next.text === "]") {
            this.take();
            break;
          }
          if (next.kind === "string") {
            values.push(next.text);
            this.take();
          } else {
            this.error(
              next,
              "featurescript.parameterMetadata",
              "options must be strings",
            );
            this.skipStatement();
            break;
          }
          if (this.peek().kind === "op" && this.peek().text === ",")
            this.take();
        }
        metadata.options = values;
        continue;
      }
      break;
    }
  }
}

function featureScriptType(name: string): VariableType {
  const lower = name.toLowerCase();
  if (lower === "length" || lower === "distance") return "length";
  if (lower === "angle") return "angle";
  if (lower === "boolean" || lower === "bool") return "boolean";
  if (lower === "string") return "string";
  return "number";
}

export function parseFeatureScript(source: string): FeatureScriptProgram {
  const lexed = lexFeatureScript(source);
  const parser = new FeatureScriptParser(source, lexed.tokens);
  const program = parser.parse();
  return {
    ...program,
    diagnostics: [...lexed.diagnostics, ...program.diagnostics],
  };
}

// ---------------------------------------------------------------------------
// Compiler / pure evaluator
// ---------------------------------------------------------------------------

const DEPRECATED_FEATURESCRIPT_APIS: Record<string, string> = {
  debug: "debug() is deprecated; use a result expression for inspection.",
  print: "print() is deprecated; use a result expression for inspection.",
  newVariable:
    "newVariable() is deprecated; declare variables in Variable Studio.",
};

const FEATURESCRIPT_STDLIB: Record<string, P7Value> = {
  size: {
    kind: "function",
    name: "size",
    arity: 1,
    call: (args): P7Value => {
      const value = args[0];
      if (!value) throw new Error("size: one argument is required");
      if (value.kind === "list") return numberValue(value.items.length);
      if (value.kind === "string") return numberValue([...value.value].length);
      throw new Error("size: expected a list or string");
    },
  },
  toString: {
    kind: "function",
    name: "toString",
    arity: 1,
    call: (args: readonly P7Value[]): P7Value => {
      const value = args[0];
      if (!value) throw new Error("toString: one argument is required");
      return stringValue(p7ValueLabel(value));
    },
  } as P7Value,
  vector: {
    kind: "function",
    name: "vector",
    arity: 3,
    call: (args): P7Value => {
      for (const [index, arg] of args.entries())
        if (!arg || arg.kind !== "length")
          throw new Error(`vector: argument ${index + 1} must be a length`);
      return { kind: "list", items: [...args] };
    },
  },
};

function offsetDiagnostics(
  diagnostics: readonly P7Diagnostic[],
  span: FeatureScriptSpan,
): P7Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const line =
      diagnostic.line === 1 ? span.line : span.line + diagnostic.line - 1;
    const column =
      diagnostic.line === 1
        ? span.column + diagnostic.column - 1
        : diagnostic.column;
    return {
      ...diagnostic,
      line,
      column,
      ...(diagnostic.endLine !== undefined
        ? {
            endLine:
              diagnostic.endLine === 1
                ? span.line
                : span.line + diagnostic.endLine - 1,
          }
        : {}),
      ...(diagnostic.endColumn !== undefined
        ? {
            endColumn:
              diagnostic.endLine === 1
                ? span.column + diagnostic.endColumn - 1
                : diagnostic.endColumn,
          }
        : {}),
    };
  });
}

function functionValue(
  name: string,
  parameters: readonly string[],
  bodyExpression: string,
  env: P7Scope,
  span: FeatureScriptSpan,
): P7Value {
  return {
    kind: "function",
    name,
    arity: parameters.length,
    call: (args) => {
      const scope: P7Scope = { ...env };
      parameters.forEach((parameter, index) => {
        scope[parameter] = args[index] ?? { kind: "number", value: 0 };
      });
      const result = evaluateP7Expression(bodyExpression, scope);
      if (!result.ok) {
        const diagnostics = offsetDiagnostics(result.diagnostics, span);
        throw new Error(
          diagnostics.map((diagnostic) => diagnostic.message).join("; "),
        );
      }
      return result.value;
    },
  };
}

export function compileFeatureScript(
  source: string,
  opts: { sourceHash?: string } = {},
): FeatureScriptCompileResult {
  const program = parseFeatureScript(source);
  const sourceHash = opts.sourceHash ?? hashString(source);
  const diagnostics: P7Diagnostic[] = [...program.diagnostics];
  const constants: Record<string, P7Value> = {};
  const env: P7Scope = { ...FEATURESCRIPT_STDLIB, ...constants };
  const notices: string[] = [];

  if (program.languageVersion === null)
    notices.push(
      "No FeatureScript version header; compiled with the local language subset.",
    );
  if (
    program.languageVersion !== null &&
    program.languageVersion !== FEATURESCRIPT_LANGUAGE_VERSION
  )
    notices.push(
      `FeatureScript ${program.languageVersion} differs from the local language version ${FEATURESCRIPT_LANGUAGE_VERSION}; unsupported constructs will be reported as errors.`,
    );
  for (const imported of program.imports)
    notices.push(
      `Import '${imported.path}' uses the local FeatureScript standard library; hosted or kernel modules are not available.`,
    );
  for (const [api, message] of Object.entries(DEPRECATED_FEATURESCRIPT_APIS))
    if (new RegExp(`\\b${api}\\s*\\(`).test(source))
      notices.push(`Deprecated API '${api}': ${message}`);
  if (/@deprecated|deprecated\s*:\s*true/.test(source))
    notices.push(
      "This source declares deprecated API metadata; deprecated declarations remain loadable but should be migrated.",
    );
  if (!program.features.length)
    notices.push("No export feature declarations were found in this source.");

  for (const constDeclaration of program.consts) {
    const result = evaluateP7Expression(constDeclaration.expression, env);
    if (!result.ok) {
      diagnostics.push(
        ...offsetDiagnostics(result.diagnostics, constDeclaration.span),
      );
      continue;
    }
    constants[constDeclaration.name] = result.value;
    env[constDeclaration.name] = result.value;
  }

  for (const functionDeclaration of program.functions) {
    const value = functionValue(
      functionDeclaration.name,
      functionDeclaration.parameters,
      functionDeclaration.bodyExpression,
      env,
      functionDeclaration.span,
    );
    constants[functionDeclaration.name] = value;
    env[functionDeclaration.name] = value;
  }

  const features: FeatureScriptFeature[] = [];
  for (const declaration of program.features) {
    const parameterValues: Record<string, P7Value> = {};
    const parameters: FeatureScriptParameter[] = [];
    for (const parameter of declaration.parameters) {
      const scope: P7Scope = { ...env, ...parameterValues };
      const result = evaluateP7Expression(parameter.defaultExpression, scope);
      if (!result.ok) {
        diagnostics.push(
          ...offsetDiagnostics(result.diagnostics, parameter.span),
        );
        continue;
      }
      if (result.value.kind !== parameter.type) {
        diagnostics.push(
          p7Diagnostic(
            "featurescript.parameterType",
            `parameter '${parameter.id}' expects ${p7TypeLabel(parameter.type)}, got ${p7TypeLabel(result.value.kind)}`,
            parameter.span.line,
            parameter.span.column,
          ),
        );
        continue;
      }
      parameterValues[parameter.id] = result.value;
      parameters.push({
        id: parameter.id,
        label: parameter.label,
        type: parameter.type,
        defaultValue: result.value,
        defaultExpression: parameter.defaultExpression,
        options: parameter.options,
        description: parameter.description,
      });
    }
    const bodyResult = evaluateP7Expression(declaration.resultExpression, {
      ...env,
      ...parameterValues,
    });
    if (!bodyResult.ok)
      diagnostics.push(
        ...offsetDiagnostics(bodyResult.diagnostics, declaration.span),
      );

    const duplicate = features.find(
      (feature) => feature.name === declaration.name,
    );
    if (duplicate) {
      diagnostics.push(
        p7Diagnostic(
          "featurescript.duplicateFeature",
          `duplicate feature '${declaration.name}'`,
          declaration.span.line,
          declaration.span.column,
        ),
      );
      continue;
    }
    features.push({
      id: `fs-${slug(declaration.name)}-${sourceHash.slice(0, 8)}`,
      name: declaration.name,
      label: declaration.label,
      description: declaration.description,
      parameters,
      resultExpression: declaration.resultExpression,
      sourceHash,
      languageVersion:
        program.languageVersion ?? FEATURESCRIPT_LANGUAGE_VERSION,
      notices,
    });
  }

  // A feature with no parameter declarations still needs a table row, but the
  // compiler should say so instead of silently producing an unusable feature.
  for (const feature of features)
    if (!feature.parameters.length)
      notices.push(`Feature '${feature.label}' has no parameters.`);

  const missingApis = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== "expression.unknownIdentifier") continue;
    const match = /unknown identifier '([^']+)'/.exec(diagnostic.message);
    if (match?.[1]) missingApis.add(match[1]);
  }
  for (const api of missingApis)
    notices.push(
      `Missing FeatureScript API '${api}': it is not available in the local standard library.`,
    );

  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    program,
    features,
    constants,
    diagnostics,
    notices,
    sourceHash,
  };
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "feature"
  );
}

export function evaluateCustomFeature(
  feature: FeatureScriptFeature,
  values: Record<string, P7Value> = {},
  extraScope: P7Scope = {},
): FeatureScriptCustomFeatureEvaluation {
  const resolved: Record<string, P7Value> = {};
  const diagnostics: P7Diagnostic[] = [];
  for (const parameter of feature.parameters) {
    const value = values[parameter.id] ?? parameter.defaultValue;
    if (value.kind !== parameter.type) {
      diagnostics.push(
        p7Diagnostic(
          "featurescript.valueType",
          `'${parameter.label}' expects ${p7TypeLabel(parameter.type)}, got ${p7TypeLabel(value.kind)}`,
        ),
      );
      continue;
    }
    if (
      parameter.options.length &&
      value.kind === "string" &&
      !parameter.options.includes(value.value)
    ) {
      diagnostics.push(
        p7Diagnostic(
          "featurescript.valueOption",
          `'${value.value}' is not an allowed option for '${parameter.label}'`,
        ),
      );
      continue;
    }
    resolved[parameter.id] = value;
  }
  if (diagnostics.length)
    return { ok: false, values: resolved, result: null, diagnostics };
  const result = evaluateP7Expression(feature.resultExpression, {
    ...FEATURESCRIPT_STDLIB,
    ...extraScope,
    ...resolved,
  });
  if (!result.ok)
    return {
      ok: false,
      values: resolved,
      result: null,
      diagnostics: result.diagnostics,
    };
  return { ok: true, values: resolved, result: result.value, diagnostics: [] };
}

/** Declared parameter schema for a feature declaration (for UI construction). */
export function featureScriptParameterSchema(
  declaration: FeatureScriptFeatureDeclaration,
): Array<{
  id: string;
  label: string;
  type: VariableType;
  defaultExpression: string;
  options: string[];
  description: string;
}> {
  return declaration.parameters.map((parameter) => ({
    id: parameter.id,
    label: parameter.label,
    type: parameter.type,
    defaultExpression: parameter.defaultExpression,
    options: [...parameter.options],
    description: parameter.description,
  }));
}

/**
 * Translate a FeatureScript value into a stable string parameter value. Used
 * when a custom feature is inserted into Part Studio history.
 */
export function featureScriptParameterValue(value: P7Value): {
  kind: "string" | "quantity" | "boolean";
  value: string | number | boolean;
  units?: string;
  expression?: string;
} {
  switch (value.kind) {
    case "length":
      return {
        kind: "quantity",
        value: value.value,
        units: "m",
        expression: `${value.value} m`,
      };
    case "angle":
      return {
        kind: "quantity",
        value: value.value,
        units: "rad",
        expression: `${value.value} rad`,
      };
    case "number":
      return {
        kind: "quantity",
        value: value.value,
        units: "",
        expression: String(value.value),
      };
    case "boolean":
      return { kind: "boolean", value: value.value };
    case "string":
      return { kind: "string", value: value.value };
    case "list":
      return { kind: "string", value: p7ValueLabel(value) };
    case "function":
      return { kind: "string", value: value.name };
  }
}

export function lengthParameterValueMM(valueMM: number): P7Value {
  return lengthValueM(valueMM / 1000);
}

export function angleParameterValueDeg(valueDeg: number): P7Value {
  return angleValueRad((valueDeg * Math.PI) / 180);
}
