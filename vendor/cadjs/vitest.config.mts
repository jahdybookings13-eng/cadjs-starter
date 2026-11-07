import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const occWorkerClientMock = fileURLToPath(
  new URL("./tests/__mocks__/OccWorkerClient.ts", import.meta.url),
);

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 2,
      },
    },
    server: {
      deps: {
        inline: ["opencascade.js", "@salusoft89/planegcs"],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /(.*\/|^\.\/)?OccWorkerClient$/,
        replacement: occWorkerClientMock,
      },
    ],
  },
});
