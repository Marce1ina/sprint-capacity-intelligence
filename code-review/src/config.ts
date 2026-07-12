import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "./load-env.js";
import type { ReviewAgentConfig } from "./types.js";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MAX_ROUNDS = 5;

export function loadConfig(): ReviewAgentConfig {
  loadEnvFile();

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required. Copy .env.example to .env or export the variable.");
  }

  const cwd = path.resolve(process.env.REVIEW_CWD ?? path.join(packageRoot, "..", ".."));
  const maxRounds = parseMaxRounds(process.env.REVIEW_MAX_ROUNDS);

  return {
    apiKey,
    cwd,
    modelId: process.env.REVIEW_MODEL?.trim() ?? "composer-2.5",
    maxRounds,
  };
}

function parseMaxRounds(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_MAX_ROUNDS;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`REVIEW_MAX_ROUNDS must be a positive integer, got "${value}"`);
  }

  return parsed;
}
