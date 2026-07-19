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

describe("service role boundary", () => {
  it("imports createAdminClient only from account/delete route (plus definition)", () => {
    const importers: string[] = [];

    for (const file of walkSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf-8");
      if (importsCreateAdminClient(content)) {
        importers.push(repoRelative(file));
      }
    }

    expect(importers.sort()).toEqual(["src/lib/invite-api-context.ts", "src/pages/api/account/delete.ts"].sort());
  });

  it("never constructs IntegrationTokenService with createAdminClient or its alias", () => {
    const violations: string[] = [];

    for (const file of walkSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf-8");
      const adminVars = adminClientVariableNames(content);

      if (/new IntegrationTokenService\s*\(\s*createAdminClient\s*\(/.test(content)) {
        violations.push(repoRelative(file));
        continue;
      }

      for (const adminVar of adminVars) {
        const pattern = new RegExp(`new IntegrationTokenService\\s*\\(\\s*${adminVar}\\b`);
        if (pattern.test(content)) {
          violations.push(repoRelative(file));
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
