import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Loads `code-review/criteria.md` from the package root (parent of `src/` or `dist/`).
 * Throws if the file is missing or empty — never silently falls back to generic-only review.
 */
export function loadProjectCriteria(): string {
  const criteriaPath = path.join(packageRoot, "criteria.md");

  let text: string;
  try {
    text = fs.readFileSync(criteriaPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load project criteria at ${criteriaPath}: ${detail}`);
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Project criteria file is empty: ${criteriaPath}`);
  }

  return trimmed;
}
