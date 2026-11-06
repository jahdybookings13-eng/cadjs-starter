import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CadCoreProvider, CadVisualizerProvider } from "@vitekk02/cadjs/react";
import {
  OccWorkerClient,
  SketchSolverService,
  configureCadjs,
} from "@vitekk02/cadjs";
import LoadingScreen from "./components/LoadingScreen";
import SimpleCadScene from "./scenes/simpleCadScene";
import { ToastProvider, useToast } from "./contexts/ToastContext";

// cadjs auto-resolves the OpenCascade and planegcs WASM URLs from
// node_modules. To override (CDN, custom path, exotic bundler), call
// configureCadjs({ occWasmUrl, planegcsWasmUrl }) explicitly.

// Headless VR harness hook: lets e2e/vr-fake-xr.js enable debugLog at runtime.
(
  window as unknown as { __cadjs?: { configureCadjs: typeof configureCadjs } }
).__cadjs = {
  configureCadjs,
};

// Bridge: forward library notifications into our toast UI. Must live inside
// <ToastProvider> (so it can call useToast) and outside the cadjs providers
// (so notify is registered before any hook fires).
const CadjsNotifyBridge: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { showToast } = useToast();
  useEffect(() => {
    configureCadjs({ notify: (msg, type) => showToast(msg, type ?? "error") });
  }, [showToast]);
  return <>{children}</>;
};

type LoadState = "loading" | "ready" | "error";

const AppLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      await Promise.all([
        OccWorkerClient.getInstance().waitForReady(),
        SketchSolverService.getInstance().getGCS(),
      ]);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleRetry = useCallback(() => {
    OccWorkerClient.getInstance().dispose();
    SketchSolverService.getInstance().resetInit();
    initialize();
  }, [initialize]);

  if (state !== "ready") {
    return (
      <LoadingScreen
        error={state === "error" ? error : null}
        onRetry={handleRetry}
      />
    );
  }

  return <>{children}</>;
};

const App = () => {
  return (
    <AppLoader>
      <ToastProvider>
        <CadjsNotifyBridge>
          <CadCoreProvider>
            <CadVisualizerProvider>
              <SimpleCadScene />
            </CadVisualizerProvider>
          </CadCoreProvider>
        </CadjsNotifyBridge>
      </ToastProvider>
    </AppLoader>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
