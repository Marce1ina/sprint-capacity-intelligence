import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

function walkSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".test.ts")) {
      continue;
    }

    if (entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".astro")) {
      files.push(fullPath);
    }
  }

  return files;
}

function repoRelative(filePath: string): string {
  return relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function importsCreateAdminClient(content: string): boolean {
  return /import\s*\{[^}]*\bcreateAdminClient\b[^}]*\}\s*from\s*["']@\/lib\/supabase-admin["']/.test(content);
}

function adminClientVariableNames(content: string): string[] {
  const names: string[] = [];
  const pattern = /\b(?:const|let)\s+(\w+)\s*=\s*createAdminClient\s*\(\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Deliberate, narrow loosening of the service-role boundary: the risk-computation
 * service must read a *different* user's Calendar token (owned by the connected
 * assignee, not the EM viewing the dashboard), which the EM's own RLS-scoped
 * client cannot reach. `computeSprintRisk` takes the admin client as a parameter,
 * constructed by its route caller (`risk.ts`), which is why that route is the
 * actual importer of `createAdminClient` rather than the service itself. This
 * allowlist keeps catching any *other* file that tries the same pattern.
 */
const ALLOWED_ADMIN_CLIENT_IMPORTERS = [
  "src/lib/invite-api-context.ts",
  "src/pages/api/account/delete.ts",
  "src/pages/api/jira/sprints/[sprintId]/risk.ts",
];

const ALLOWED_ADMIN_TOKEN_SERVICE_FILES = ["src/lib/services/risk-computation-service.ts"];

describe("service role boundary", () => {
  it("imports createAdminClient only from the allowlisted files", () => {
    const importers: string[] = [];

    for (const file of walkSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf-8");
      if (importsCreateAdminClient(content)) {
        importers.push(repoRelative(file));
      }
    }

    expect(importers.sort()).toEqual([...ALLOWED_ADMIN_CLIENT_IMPORTERS].sort());
  });

  it("only constructs IntegrationTokenService with an admin client in the allowlisted files", () => {
    const violations: string[] = [];

    for (const file of walkSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf-8");
      const adminVars = adminClientVariableNames(content);
      const relativePath = repoRelative(file);
      if (ALLOWED_ADMIN_TOKEN_SERVICE_FILES.includes(relativePath)) {
        continue;
      }

      if (/new IntegrationTokenService\s*\(\s*createAdminClient\s*\(/.test(content)) {
        violations.push(relativePath);
        continue;
      }

      for (const adminVar of adminVars) {
        const pattern = new RegExp(`new IntegrationTokenService\\s*\\(\\s*${adminVar}\\b`);
        if (pattern.test(content)) {
          violations.push(relativePath);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
