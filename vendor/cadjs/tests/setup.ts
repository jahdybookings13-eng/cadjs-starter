import path from "node:path";
import { createRequire } from "node:module";
import { beforeAll } from "vitest";
import { getOcInstance } from "../src/services/opencascade-instance";
import { configureCadjs } from "../src/config";

const require = createRequire(import.meta.url);

const occJsPath = require.resolve("opencascade.js/dist/opencascade.full.js");
const occWasmUrl = path.join(path.dirname(occJsPath), "opencascade.full.wasm");

const planegcsEntryPath = require.resolve("@salusoft89/planegcs");
const planegcsWasmUrl = path.join(
  path.dirname(planegcsEntryPath),
  "planegcs_dist",
  "planegcs.wasm",
);

configureCadjs({ occWasmUrl, planegcsWasmUrl });

beforeAll(async () => {
  await getOcInstance();
}, 60_000);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
