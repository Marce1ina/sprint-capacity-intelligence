import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ExpectedVerdict = "pass" | "fail";

export interface FixtureMeta {
  prTitle?: string;
  prBody?: string;
  expectedVerdict: ExpectedVerdict;
}

export interface LoadedFixture extends FixtureMeta {
  id: string;
  diff: string;
}

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function listFixtureIds(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadFixture(id: string): LoadedFixture {
  const dir = join(FIXTURES_DIR, id);
  const diffPath = join(dir, "diff.patch");
  const metaPath = join(dir, "meta.json");

  let diff: string;
  try {
    diff = readFileSync(diffPath, "utf8");
  } catch {
    throw new Error(`Fixture "${id}" is missing diff.patch at ${diffPath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(metaPath, "utf8")) as unknown;
  } catch {
    throw new Error(`Fixture "${id}" is missing or invalid meta.json at ${metaPath}`);
  }

  if (!raw || typeof raw !== "object") {
    throw new Error(`Fixture "${id}" meta.json must be an object`);
  }

  const record = raw as Record<string, unknown>;
  const expectedVerdict = record.expectedVerdict;
  if (expectedVerdict !== "pass" && expectedVerdict !== "fail") {
    throw new Error(`Fixture "${id}" meta.json must set expectedVerdict to "pass" or "fail"`);
  }

  return {
    id,
    diff,
    prTitle: typeof record.prTitle === "string" ? record.prTitle : undefined,
    prBody: typeof record.prBody === "string" ? record.prBody : undefined,
    expectedVerdict,
  };
}

export function loadAllFixtures(): LoadedFixture[] {
  return listFixtureIds().map(loadFixture);
}
