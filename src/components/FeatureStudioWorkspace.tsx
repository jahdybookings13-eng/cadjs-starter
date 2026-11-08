import React, { useEffect, useMemo, useRef, useState } from "react";
import { downloadTextFile } from "../document/file";
import {
  compileFeatureStudioSource,
  featureStudioSourceFile,
  importFeatureStudioSource,
  restoreFeatureStudioVersion,
  updateFeatureStudioSource,
  type FeatureStudioDocument,
} from "../phase7/featureStudio";
import {
  p7DisplayNumber,
  p7DisplayUnit,
  p7ValueLabel,
  type P7Diagnostic,
  type P7Value,
} from "../phase7/expression";
import type { FeatureScriptFeature } from "../phase7/featurescript";

export interface FeatureStudioWorkspaceProps {
  studio: FeatureStudioDocument;
  readOnly?: boolean;
  onChange: (studio: FeatureStudioDocument) => void;
  onInsertFeature?: (
    feature: FeatureScriptFeature,
    values: Record<string, P7Value>,
  ) => { ok: boolean; message: string };
}

const KEYWORDS = [
  "FeatureScript",
  "export",
  "const",
  "function",
  "feature",
  "parameter",
  "is",
  "result",
  "label",
  "description",
  "return",
  "true",
  "false",
];

const KEYWORD_SET = new Set(KEYWORDS);

const KEYWORD_DOCS: Record<string, string> = {
  FeatureScript: "Language/version header, for example FeatureScript 1;",
  export: "Makes a const, function or feature visible to the registry.",
  feature: "Declares a custom feature with typed parameters and a result.",
  parameter: "Declares `parameter id is type = default;`.",
  is: "Separates a parameter name from its type.",
  result: "Evaluates the feature result expression when values change.",
  label: "Human-readable parameter or feature label.",
  description: "Documentation shown in the custom-feature card.",
  function: "Declares a pure helper evaluated with FeatureScript values.",
  const: "Declares a named constant available to later expressions.",
  min: "min(value, ...) returns the smallest numeric argument.",
  max: "max(value, ...) returns the largest numeric argument.",
  abs: "abs(value) returns the absolute value.",
  sqrt: "sqrt(number) returns the square root.",
  size: "size(list|string) returns the element or character count.",
  vector: "vector(x, y, z) builds a list of three lengths.",
  toString: "toString(value) returns a display string.",
};

const COMPLETION_ITEMS = [
  ...KEYWORDS,
  "min(",
  "max(",
  "abs(",
  "sqrt(",
  "size(",
  "vector(",
  "toString(",
  "parameter width is length = 10 mm;",
  "result = ",
];

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function highlightFeatureScript(source: string): string {
  const pattern =
    /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|\b(?:FeatureScript|export|const|function|feature|parameter|is|result|label|description|return|true|false)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  let out = "";
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    out += escapeHtml(source.slice(last, index));
    const token = match[0];
    const className = token.startsWith("//")
      ? "text-gray-500 italic"
      : token.startsWith('"')
        ? "text-amber-300"
        : KEYWORD_SET.has(token)
          ? "text-violet-300"
          : /^\d/.test(token)
            ? "text-orange-300"
            : "text-sky-300";
    out += `<span class="${className}">${escapeHtml(token)}</span>`;
    last = index + token.length;
  }
  out += escapeHtml(source.slice(last));
  return `${out}\n`;
}

function lineColumnToOffset(
  source: string,
  line: number,
  column: number,
): number {
  let currentLine = 1;
  let index = 0;
  while (currentLine < line && index < source.length) {
    if (source[index] === "\n") currentLine += 1;
    index += 1;
  }
  return Math.min(source.length, index + Math.max(0, column - 1));
}

function valueForParameter(
  feature: FeatureScriptFeature,
  parameterId: string,
  values: Record<string, P7Value>,
): P7Value {
  return (
    values[parameterId] ??
    feature.parameters.find((parameter) => parameter.id === parameterId)
      ?.defaultValue ?? { kind: "number", value: 0 }
  );
}

/**
 * Feature Studio workspace: source editor with line numbers, diagnostics,
 * local version history, custom-feature registry and insertion. Pure
 * FeatureScript evaluation is live; kernel geometry is explicitly not claimed.
 */
export const FeatureStudioWorkspace: React.FC<FeatureStudioWorkspaceProps> = ({
  studio,
  readOnly = false,
  onChange,
  onInsertFeature,
}) => {
  const [source, setSource] = useState(studio.source);
  const [find, setFind] = useState("");
  const [message, setMessage] = useState("");
  const [valuesByFeature, setValuesByFeature] = useState<
    Record<string, Record<string, P7Value>>
  >({});
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSource(studio.source);
    setMessage("");
  }, [studio]);

  const compile = useMemo(() => compileFeatureStudioSource(source), [source]);
  const features = compile.ok ? compile.customFeatures : studio.customFeatures;
  const lineCount = Math.max(1, source.split("\n").length);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [completion, setCompletion] = useState<{
    prefix: string;
    index: number;
  } | null>(null);
  const [hoverDoc, setHoverDoc] = useState<{
    word: string;
    doc: string;
  } | null>(null);
  const highlighted = useMemo(() => highlightFeatureScript(source), [source]);
  const completionItems = useMemo(() => {
    if (!completion) return [];
    const query = completion.prefix.toLowerCase();
    return COMPLETION_ITEMS.filter((item) =>
      query ? item.toLowerCase().startsWith(query) : true,
    ).slice(0, 8);
  }, [completion?.prefix]);

  const applyCompletion = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const caret = editor.selectionStart;
    const start = caret - (completion?.prefix.length ?? 0);
    const next =
      source.slice(0, start) + text + source.slice(editor.selectionEnd);
    setSource(next);
    setCompletion(null);
    requestAnimationFrame(() => {
      editor.focus();
      const position = start + text.length;
      editor.setSelectionRange(position, position);
    });
  };

  const handleEditorKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const editor = editorRef.current;
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      const before = source.slice(0, editor?.selectionStart ?? source.length);
      const prefix = /([A-Za-z_]\w*)?$/.exec(before)?.[0] ?? "";
      setCompletion({ prefix, index: 0 });
      return;
    }
    if (!completion) return;
    if (event.key === "Escape") {
      setCompletion(null);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setCompletion((current) =>
        current
          ? {
              ...current,
              index:
                (current.index + delta + completionItems.length) %
                Math.max(1, completionItems.length),
            }
          : current,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const item = completionItems[completion.index];
      if (!item) return;
      event.preventDefault();
      applyCompletion(item);
    }
  };

  const handleEditorMouseMove = (
    event: React.MouseEvent<HTMLTextAreaElement>,
  ) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rect = editor.getBoundingClientRect();
    const x = event.clientX - rect.left - 8 + editor.scrollLeft;
    const y = event.clientY - rect.top - 8 + editor.scrollTop;
    if (x < 0 || y < 0) {
      setHoverDoc(null);
      return;
    }
    const line = source.split("\n")[Math.floor(y / 18)] ?? "";
    const column = Math.floor(x / 7.2);
    const before = line.slice(0, column + 1).match(/[A-Za-z_]\w*$/)?.[0] ?? "";
    const after = line.slice(column + 1).match(/^[A-Za-z0-9_]*/)?.[0] ?? "";
    const word = `${before}${after}`;
    const doc = KEYWORD_DOCS[word] ?? "";
    setHoverDoc(doc ? { word, doc } : null);
  };

  const jumpTo = (diagnostic: P7Diagnostic) => {
    const editor = editorRef.current;
    if (!editor) return;
    const offset = lineColumnToOffset(
      source,
      diagnostic.line,
      diagnostic.column,
    );
    editor.focus();
    editor.setSelectionRange(offset, offset);
    const lineHeight = 18;
    editor.scrollTop = Math.max(0, (diagnostic.line - 3) * lineHeight);
  };

  const apply = () => {
    if (readOnly) return;
    const result = updateFeatureStudioSource(studio, source);
    onChange(result.studio);
    setMessage(
      result.compile.ok
        ? `Applied · ${result.compile.customFeatures.length} feature(s) registered`
        : "Source has errors; last good feature registry retained",
    );
  };

  const revert = () => {
    setSource(studio.source);
    setMessage("");
  };

  const restore = (versionId: string) => {
    if (readOnly) return;
    const result = restoreFeatureStudioVersion(studio, versionId);
    if (!result.ok) {
      setMessage(result.diagnostics.map((entry) => entry.message).join("; "));
      return;
    }
    onChange(result.studio);
    setSource(result.studio.source);
    setMessage("Version restored");
  };

  const importFile = async (file: File) => {
    if (readOnly) return;
    const text = await file.text();
    const result = importFeatureStudioSource(
      studio,
      text,
      `Imported ${file.name}`,
    );
    onChange(result.studio);
    setSource(result.studio.source);
    setMessage(
      result.compile.ok
        ? `Imported ${file.name}`
        : `Imported ${file.name} with ${result.compile.diagnostics.length} diagnostic(s)`,
    );
  };

  const exportFile = () => {
    downloadTextFile(
      `${studio.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "feature-studio"}.fs`,
      featureStudioSourceFile({ ...studio, source }),
      "text/plain",
    );
  };

  const updateValue = (
    feature: FeatureScriptFeature,
    parameterId: string,
    value: P7Value,
  ) => {
    setValuesByFeature((entries) => ({
      ...entries,
      [feature.id]: {
        ...(entries[feature.id] ?? {}),
        [parameterId]: value,
      },
    }));
  };

  return (
    <div
      className="cad-studio-light absolute inset-0 z-20 flex flex-col bg-gray-950 text-gray-200"
      data-testid="feature-studio-workspace"
    >
      <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{studio.name}</div>
          <div className="text-[11px] text-gray-500">
            FeatureScript · {features.length} custom feature(s) ·{" "}
            {compile.ok ? "compiled" : "errors"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder="Find in source"
            aria-label="Find in FeatureScript source"
            className="w-40 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={readOnly}
            className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500 disabled:opacity-40"
          >
            Import .fs
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".fs,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={exportFile}
            className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500"
          >
            Export .fs
          </button>
          <button
            type="button"
            onClick={revert}
            disabled={readOnly || source === studio.source}
            className="rounded border border-gray-700 px-2 py-1 text-xs hover:border-gray-500 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={readOnly}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Compile & apply
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#f8f9fa]">
            <div
              ref={lineNumbersRef}
              className="w-12 flex-none overflow-hidden border-r border-gray-300 bg-gray-100 py-2 text-right font-mono text-[12px] leading-[18px] text-gray-500"
              aria-hidden="true"
            >
              {Array.from({ length: lineCount }, (_, index) => (
                <div key={index} className="pr-2">
                  {index + 1}
                </div>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-2 font-mono text-[12px] leading-[18px] text-gray-900"
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
              <textarea
                ref={editorRef}
                value={source}
                spellCheck={false}
                readOnly={readOnly}
                wrap="off"
                onChange={(event) => {
                  setSource(event.target.value);
                  setCompletion(null);
                }}
                onScroll={(event) => {
                  if (lineNumbersRef.current)
                    lineNumbersRef.current.scrollTop =
                      event.currentTarget.scrollTop;
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop =
                      event.currentTarget.scrollTop;
                    highlightRef.current.scrollLeft =
                      event.currentTarget.scrollLeft;
                  }
                }}
                onKeyDown={handleEditorKeyDown}
                onMouseMove={handleEditorMouseMove}
                onMouseLeave={() => setHoverDoc(null)}
                onBlur={() => setCompletion(null)}
                aria-label="FeatureScript source"
                className="absolute inset-0 resize-none overflow-auto bg-transparent p-2 font-mono text-[12px] leading-[18px] text-transparent caret-gray-900 outline-none selection:bg-blue-200"
                style={{ tabSize: 2 }}
              />
              {completion && completionItems.length > 0 && (
                <div className="absolute left-14 top-8 z-20 w-64 overflow-hidden rounded border border-gray-700 bg-gray-900 shadow-xl">
                  <div className="border-b border-gray-800 px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Completions · Ctrl+Space
                  </div>
                  {completionItems.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Insert ${item}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyCompletion(item);
                      }}
                      className={`block w-full px-2 py-1 text-left font-mono text-[11px] ${
                        index === completion.index
                          ? "bg-blue-100 text-gray-900"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
              {hoverDoc && (
                <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-sm rounded border border-sky-800 bg-gray-900/95 px-2 py-1 text-[11px] text-sky-200 shadow-lg">
                  <span className="font-mono text-sky-300">
                    {hoverDoc.word}
                  </span>{" "}
                  — {hoverDoc.doc}
                </div>
              )}
            </div>
            {find.trim() && (
              <div className="pointer-events-none absolute right-3 top-2 rounded bg-gray-800/90 px-2 py-1 text-[10px] text-gray-300">
                {
                  source
                    .split("\n")
                    .filter((line) =>
                      line.toLowerCase().includes(find.trim().toLowerCase()),
                    ).length
                }{" "}
                matching line(s)
              </div>
            )}
          </div>

          <div className="h-48 flex-none overflow-auto border-t border-gray-800 bg-gray-900/60">
            <div className="sticky top-0 flex items-center gap-2 bg-gray-900 px-3 py-1 text-[11px] uppercase tracking-wide text-gray-500">
              <span>Diagnostics</span>
              <span className="text-gray-600">
                {compile.diagnostics.length} error(s)
              </span>
            </div>
            {compile.diagnostics.length === 0 && (
              <div className="px-3 py-3 text-xs text-emerald-400">
                No parse, type or evaluation errors.
              </div>
            )}
            {compile.diagnostics.map((diagnostic, index) => (
              <button
                key={`${diagnostic.code}-${index}`}
                type="button"
                onClick={() => jumpTo(diagnostic)}
                className="block w-full px-3 py-1 text-left text-xs hover:bg-gray-800"
              >
                <span className="mr-2 font-mono text-gray-500">
                  {diagnostic.line}:{diagnostic.column}
                </span>
                <span
                  className={
                    diagnostic.severity === "error"
                      ? "text-red-300"
                      : "text-amber-300"
                  }
                >
                  {diagnostic.message}
                </span>
                <span className="ml-2 text-[10px] text-gray-600">
                  {diagnostic.code}
                </span>
              </button>
            ))}
            {compile.notices.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-2">
                {compile.notices.map((notice, index) => (
                  <div key={index} className="text-[11px] text-sky-300">
                    {notice}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="w-96 flex-none overflow-auto border-l border-gray-700 bg-gray-900/60 p-3 text-xs">
          <h3 className="mb-2 font-medium text-gray-200">Custom features</h3>
          {features.length === 0 && (
            <p className="text-gray-500">
              Declare a feature with{" "}
              <code className="text-gray-300">
                export feature Name {"{ ... }"}
              </code>
              .
            </p>
          )}
          {features.map((feature) => {
            const values = valuesByFeature[feature.id] ?? {};
            return (
              <div
                key={feature.id}
                className="mb-3 rounded border border-gray-700 bg-gray-800/40 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-100">
                      {feature.label}
                    </div>
                    <div className="font-mono text-[10px] text-gray-500">
                      {feature.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !onInsertFeature ||
                      readOnly ||
                      !compile.ok ||
                      source !== studio.source
                    }
                    title={
                      !onInsertFeature
                        ? "Open a Part Studio to insert this feature"
                        : !compile.ok
                          ? "Fix source errors before inserting"
                          : source !== studio.source
                            ? "Compile & apply the source before inserting"
                            : "Insert into the active Part Studio"
                    }
                    onClick={() => {
                      if (!onInsertFeature) return;
                      const result = onInsertFeature(feature, values);
                      setMessage(result.message);
                    }}
                    className="rounded bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    Insert
                  </button>
                </div>
                {feature.description && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    {feature.description}
                  </p>
                )}
                <div className="mt-2 space-y-1">
                  {feature.parameters.map((parameter) => {
                    const value = valueForParameter(
                      feature,
                      parameter.id,
                      values,
                    );
                    return (
                      <label
                        key={parameter.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-gray-400">
                          {parameter.label}
                        </span>
                        <span className="flex items-center gap-1">
                          {parameter.type === "boolean" ? (
                            <input
                              type="checkbox"
                              aria-label={parameter.label}
                              checked={
                                value.kind === "boolean" ? value.value : false
                              }
                              onChange={(event) =>
                                updateValue(feature, parameter.id, {
                                  kind: "boolean",
                                  value: event.target.checked,
                                })
                              }
                              className="h-3 w-3"
                            />
                          ) : parameter.options.length > 0 ? (
                            <select
                              aria-label={parameter.label}
                              value={
                                value.kind === "string"
                                  ? value.value
                                  : value.kind === "boolean"
                                    ? String(value.value)
                                    : String(
                                        p7DisplayNumber(value, "mm", "deg") ??
                                          "",
                                      )
                              }
                              onChange={(event) => {
                                const raw = event.target.value;
                                const numeric = Number(raw);
                                updateValue(
                                  feature,
                                  parameter.id,
                                  parameter.type === "number"
                                    ? { kind: "number", value: numeric }
                                    : parameter.type === "length"
                                      ? {
                                          kind: "length",
                                          value: numeric / 1000,
                                        }
                                      : parameter.type === "angle"
                                        ? {
                                            kind: "angle",
                                            value: (numeric * Math.PI) / 180,
                                          }
                                        : { kind: "string", value: raw },
                                );
                              }}
                              className="w-24 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[11px]"
                            >
                              {parameter.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : parameter.type === "string" ? (
                            <input
                              aria-label={parameter.label}
                              value={value.kind === "string" ? value.value : ""}
                              onChange={(event) =>
                                updateValue(feature, parameter.id, {
                                  kind: "string",
                                  value: event.target.value,
                                })
                              }
                              className="w-28 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[11px]"
                            />
                          ) : (
                            <>
                              <input
                                type="number"
                                aria-label={parameter.label}
                                value={p7DisplayNumber(value, "mm", "deg") ?? 0}
                                onChange={(event) =>
                                  updateValue(feature, parameter.id, {
                                    kind:
                                      parameter.type === "number"
                                        ? "number"
                                        : parameter.type,
                                    value:
                                      parameter.type === "length"
                                        ? Number(event.target.value) / 1000
                                        : parameter.type === "angle"
                                          ? (Number(event.target.value) *
                                              Math.PI) /
                                            180
                                          : Number(event.target.value),
                                  } as P7Value)
                                }
                                className="w-20 rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-right text-[11px]"
                              />
                              <span className="w-6 text-[10px] text-gray-500">
                                {p7DisplayUnit(parameter.type, "mm", "deg")}
                              </span>
                            </>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  Default result:{" "}
                  {feature.parameters
                    .map((parameter) => p7ValueLabel(parameter.defaultValue))
                    .join(", ") || "—"}
                </div>
              </div>
            );
          })}

          <h3 className="mb-2 mt-5 font-medium text-gray-200">Local history</h3>
          <div className="space-y-1">
            {[...studio.versions].reverse().map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-800"
              >
                <div className="min-w-0">
                  <div className="truncate text-gray-300">{version.label}</div>
                  <div className="text-[10px] text-gray-500">
                    {new Date(version.createdAt).toLocaleString()} ·{" "}
                    <span className="font-mono">{version.sourceHash}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => restore(version.id)}
                  className="rounded border border-gray-700 px-2 py-0.5 text-[10px] hover:border-gray-500 disabled:opacity-40"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-gray-800 pt-3 text-[11px] text-gray-500">
            <div className="mb-1 font-medium text-gray-400">Language help</div>
            {KEYWORDS.map((keyword) => (
              <div
                key={keyword}
                className="mb-0.5"
                onMouseEnter={() =>
                  setHoverDoc({
                    word: keyword,
                    doc: KEYWORD_DOCS[keyword] ?? "",
                  })
                }
                onMouseLeave={() => setHoverDoc(null)}
              >
                <code className="text-gray-300">{keyword}</code>{" "}
                {keyword === "parameter"
                  ? "declares id, type and default"
                  : keyword === "feature"
                    ? "declares a custom feature block"
                    : keyword === "function"
                      ? "declares a pure helper"
                      : ""}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {message && (
        <div className="border-t border-gray-700 bg-gray-900 px-4 py-1 text-[11px] text-gray-300">
          {message}
        </div>
      )}
    </div>
  );
};

export default FeatureStudioWorkspace;
