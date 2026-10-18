import { fileURLToPath } from "node:url";
import fs from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../cadjs", import.meta.url)),
      ],
    },
    ...(fs.existsSync("./localhost+1.pem")
      ? {
          https: {
            cert: fs.readFileSync("./localhost+1.pem"),
            key: fs.readFileSync("./localhost+1-key.pem"),
          },
        }
      : {}),
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  },
  optimizeDeps: {
    exclude: ["@vitekk02/cadjs", "opencascade.js", "@salusoft89/planegcs"],
    esbuildOptions: {
      target: "es2020",
    },
  },
  build: {
    target: "es2020",
  },
  assetsInclude: ["**/*.wasm"],
});
