import React, { useState, useRef, useEffect } from "react";
import { useCadCore } from "@vitekk02/cadjs/react";
import { useToast } from "../contexts/ToastContext";
type ImportKind = "stl" | "step" | "project";

const FileMenu: React.FC = () => {
  const {
    elements,
    sketches,
    importFile,
    exportFile,
    exportStepFile,
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
          className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 ${
            loading
              ? "bg-gray-600 text-gray-400 cursor-wait"
              : isLocked
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
          onClick={() => !loading && !isLocked && setMenuOpen(!menuOpen)}
          disabled={loading || isLocked}
        >
          {loading ? "Working..." : "File"}
          <svg
            className="w-3 h-3"
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
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg py-1 z-50 min-w-[220px]">
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-700 text-gray-200"
              onClick={() => handleImportClick("project")}
            >
              Open Project (.cadjs.json)...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-gray-200 ${
                hasProjectContent
                  ? "hover:bg-gray-700"
                  : "text-gray-500 cursor-not-allowed"
              }`}
              disabled={!hasProjectContent}
              onClick={handleSaveProject}
            >
              Save Project (.cadjs.json)
            </button>
            <div className="border-t border-gray-600 my-1" />
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-700 text-gray-200"
              onClick={() => handleImportClick("step")}
              title="STEP geometry only — colors and assembly tree are not preserved"
            >
              Import STEP...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-gray-200 ${
                hasElements
                  ? "hover:bg-gray-700"
                  : "text-gray-500 cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExportStep}
              title="STEP geometry only — colors and assembly tree are not preserved"
            >
              Export STEP (.step)
            </button>
            <div className="border-t border-gray-600 my-1" />
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-700 text-gray-200"
              onClick={() => handleImportClick("stl")}
            >
              Import STL...
            </button>
            <button
              className={`w-full px-4 py-2 text-sm text-left text-gray-200 ${
                hasElements
                  ? "hover:bg-gray-700"
                  : "text-gray-500 cursor-not-allowed"
              }`}
              disabled={!hasElements}
              onClick={handleExport}
            >
              Export STL (.stl)
            </button>
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
