/**
 * Promptfoo config (JS) — loads model ids from models.json so CI/docs share one list.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const evalDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ models: string[] }} ModelsFile
 */

/**
 * @param {unknown} value
 * @returns {ModelsFile}
 */
function parseModelsFile(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("models" in value) ||
    !Array.isArray(value.models) ||
    value.models.length === 0 ||
    !value.models.every((m) => typeof m === "string")
  ) {
    throw new Error("eval/models.json must declare a non-empty models array");
  }
  return { models: value.models };
}

const modelsJson = parseModelsFile(
  /** @type {unknown} */ (JSON.parse(readFileSync(path.join(evalDir, "models.json"), "utf8"))),
);

/** @type {import('promptfoo').TestSuiteConfig} */
const config = {
  description: "CR agent eval — model × fixture verdict matrix",
  prompts: ["Review golden fixture {{fixtureId}} (expected {{expectedVerdict}})"],
  providers: modelsJson.models.map((modelId) => ({
    id: "file://provider.ts",
    label: modelId,
    config: { modelId },
  })),
  tests: "file://generate-tests.ts",
  evaluateOptions: {
    // Same ~12 billed runs either way; >1 only shortens wall-clock.
    // Cap below matrix size to ease Cursor rate limits (3 models × 4 fixtures).
    maxConcurrency: 4,
    showProgressBar: true,
  },
  outputPath: "eval/results/latest.json",
};

export default config;
