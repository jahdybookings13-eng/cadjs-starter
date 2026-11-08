import React, { useState, useRef, useEffect } from "react";
import { useCadCore } from "@vitekk02/cadjs/react";
import { useToast } from "../contexts/ToastContext";
import { translationDisabledReason } from "../translation/capabilities";
type ImportKind = "stl" | "step" | "iges" | "3mf" | "project";

interface FileMenuProps {
  compact?: boolean;
}

const FileMenu: React.FC<FileMenuProps> = ({ compact = false }) => {
  const {
    elements,
    sketches,
    importFile,
    exportFile,
    exportStepFile,
    exportIgesFile,
    export3mfFile,
    importProject,
    exportProject,
    mode,
    activeSketch,
    isOperationPending,
  } = useCadCore();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importKind, setImportKind] = useState<ImportKind>("stl");
  const isLocked = (mode === "sketch" && !!activeSketch) || isOperationPending;
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasElements = elements.length > 0;
  const hasProjectContent = hasElements || sketches.length > 0;

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleImportClick = (kind: ImportKind) => {
    setImportKind(kind);
    if (fileInputRef.current) {
      const acceptByKind: Record<ImportKind, string> = {
        stl: ".stl",
        step: ".step,.stp",
        iges: ".iges,.igs",
        "3mf": ".3mf",
        project: ".cadjs.json,.json",
      };
      fileInputRef.current.accept = acceptByKind[kind];
      fileInputRef.current.click();
    }
    setMenuOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      if (importKind === "project") {
        await importProject(file);
      } else {
        // STL and STEP both go through importFile; the dispatcher in
        // CoreContext picks the format from the extension.
        await importFile(file);
      }
    } catch (err) {
      console.error("Import failed:", err);
      showToast(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExport = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await exportFile();
    } catch (err) {
      console.error("Export failed:", err);
      showToast(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExportStep = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await exportStepFile();
    } catch (err) {
      console.error("STEP export failed:", err);
      showToast(
        `STEP export failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExportIges = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await exportIgesFile();
    } catch (err) {
      console.error("IGES export failed:", err);
      showToast(
        `IGES export failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExport3mf = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await export3mfFile();
    } catch (err) {
      console.error("3MF export failed:", err);
      showToast(
        `3MF export failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProject = async () => {
    setMenuOpen(false);
    setLoading(true);
    try {
      await exportProject();
    } catch (err) {
      console.error("Save project failed:", err);
      showToast(
        `Save project failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="relative flex-none" ref={menuRef}>
        <button
          aria-label="File menu"
          className={compact ? "cad-icon-button" : "cad-tool"}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => !loading && !isLocked && setMenuOpen(!menuOpen)}
          disabled={loading || isLocked}
          title={compact ? "Document menu" : undefined}
        >
          {compact ? (
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeWidth={1.8}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          ) : (
            <>
              <svg
                aria-hidden="true"
                className="cad-tool-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.7}
                  d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6"
                />
              </svg>
              <span className="cad-tool-label">
                {loading ? "Working…" : "File"}
              </span>
              <svg
                aria-hidden="true"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </>
          )}
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-[var(--cad-border-strong)] bg-[var(--cad-chrome-raised)] py-1 shadow-xl">
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--cad-chrome-hover)] text-[var(--cad-text)]"
              onClick={() => handleImportClick("project")}
            >
              Open Project (.cadjs.json)...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-[var(--cad-text)] ${
                hasProjectContent
                  ? "hover:bg-[var(--cad-chrome-hover)]"
                  : "text-[var(--cad-text-faint)] cursor-not-allowed"
              }`}
              disabled={!hasProjectContent}
              onClick={handleSaveProject}
            >
              Save Project (.cadjs.json)
            </button>
            <div className="my-1 border-t border-[var(--cad-border)]" />
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--cad-chrome-hover)] text-[var(--cad-text)]"
              onClick={() => handleImportClick("step")}
              title="STEP geometry only — colors and assembly tree are not preserved"
            >
              Import STEP...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-[var(--cad-text)] ${
                hasElements
                  ? "hover:bg-[var(--cad-chrome-hover)]"
                  : "text-[var(--cad-text-faint)] cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExportStep}
              title="STEP geometry only — colors and assembly tree are not preserved"
            >
              Export STEP (.step)
            </button>
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--cad-chrome-hover)] text-[var(--cad-text)]"
              onClick={() => handleImportClick("iges")}
              title="IGES geometry only — colors and assembly tree are not preserved"
            >
              Import IGES...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-[var(--cad-text)] ${
                hasElements
                  ? "hover:bg-[var(--cad-chrome-hover)]"
                  : "text-[var(--cad-text-faint)] cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExportIges}
              title="IGES geometry only — colors and assembly tree are not preserved"
            >
              Export IGES (.iges)
            </button>
            <div className="my-1 border-t border-[var(--cad-border)]" />
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--cad-chrome-hover)] text-[var(--cad-text)]"
              onClick={() => handleImportClick("3mf")}
              title="3MF mesh exchange — preserves object names and colours"
            >
              Import 3MF...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-[var(--cad-text)] ${
                hasElements
                  ? "hover:bg-[var(--cad-chrome-hover)]"
                  : "text-[var(--cad-text-faint)] cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExport3mf}
              title="3MF mesh exchange — preserves object names and colours"
            >
              Export 3MF (.3mf)
            </button>
            <div className="my-1 border-t border-[var(--cad-border)]" />
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--cad-chrome-hover)] text-[var(--cad-text)]"
              onClick={() => handleImportClick("stl")}
            >
              Import STL...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-[var(--cad-text)] ${
                hasElements
                  ? "hover:bg-[var(--cad-chrome-hover)]"
                  : "text-[var(--cad-text-faint)] cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExport}
            >
              Export STL (.stl)
            </button>
            <div className="my-1 border-t border-[var(--cad-border)]" />
            {(
              [
                ["parasolid", "Parasolid (.x_t/.x_b)"],
                ["acis", "ACIS (.sat/.sab)"],
                ["jt", "JT (.jt)"],
              ] as const
            ).map(([format, label]) => (
              <button
                key={format}
                className="w-full px-4 py-2 text-sm text-left text-[var(--cad-text-faint)] cursor-not-allowed"
                disabled
                title={translationDisabledReason(format, "import") ?? undefined}
              >
                Import {label} — unavailable
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input — accept attribute is set per-action by handleImportClick */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
};

export default FileMenu;
