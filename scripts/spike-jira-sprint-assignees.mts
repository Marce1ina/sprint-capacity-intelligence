/**
 * Phase 1 mandatory spike: confirm story points field returns non-zero totals
 * against a real Jira Cloud scrum site (customfield_10016 or storyPoints alias).
 *
 * Required env:
 *   JIRA_SITE_URL  — e.g. https://yourorg.atlassian.net
 *   JIRA_PAT       — Atlassian API token
 *   JIRA_EMAIL     — Atlassian account email (same as Google sign-in)
 *
 * Optional (auto-discovered when omitted):
 *   JIRA_BOARD_ID  — scrum board id
 *   JIRA_SPRINT_ID — active/future sprint id on that board
 *   JIRA_SPIKE_RAW — set to "0" to skip raw response dump (default: log raw JSON)
 *
 * Run:
 *   npx tsx --env-file=.env scripts/spike-jira-sprint-assignees.mts
 */

import { assertAllowedJiraSiteUrl } from "../src/lib/jira-site-url.ts";
import {
  listActiveFutureSprints,
  listBoards,
  listSprintIssues,
  type SprintIssue,
} from "../src/lib/services/jira-client.ts";
import { JiraValidationError } from "../src/types.ts";

const REQUIRED_ENV = ["JIRA_SITE_URL", "JIRA_PAT", "JIRA_EMAIL"] as const;
const RAW_SAMPLE_SIZE = 5;

interface RawSprintIssuesPage {
  issues?: { key?: string; fields?: Record<string, unknown> }[];
  [key: string]: unknown;
}

function requireEnv(): { siteUrl: string; pat: string; email: string } {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  return {
    siteUrl: process.env.JIRA_SITE_URL ?? "",
    pat: process.env.JIRA_PAT ?? "",
    email: process.env.JIRA_EMAIL ?? "",
  };
}

function groupIssuesByAssignee(issues: SprintIssue[]): Map<string, SprintIssue[]> {
  const grouped = new Map<string, SprintIssue[]>();
  for (const issue of issues) {
    const key = issue.assigneeAccountId ?? "unassigned";
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(issue);
    } else {
      grouped.set(key, [issue]);
    }
  }
  return grouped;
}

function buildBasicAuthHeader(accountEmail: string, pat: string): string {
  return `Basic ${btoa(`${accountEmail}:${pat}`)}`;
}

async function fetchRawSprintIssuesPage(
  siteUrl: string,
  pat: string,
  email: string,
  sprintId: number,
): Promise<RawSprintIssuesPage> {
  const normalized = assertAllowedJiraSiteUrl(siteUrl);
  const url = new URL(`${normalized}/rest/agile/1.0/sprint/${sprintId}/issue`);
  url.searchParams.set("startAt", "0");
  url.searchParams.set("maxResults", String(RAW_SAMPLE_SIZE));
  url.searchParams.set("fields", "*all");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: buildBasicAuthHeader(email, pat),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new JiraValidationError(`Raw fetch failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as RawSprintIssuesPage;
}

function logNumericFieldCandidates(issues: { key?: string; fields?: Record<string, unknown> }[]): void {
  console.log("\n--- Numeric field candidates (look for story points) ---");
  for (const issue of issues) {
    const fields = issue.fields ?? {};
    const numericEntries = Object.entries(fields).filter(([, value]) => typeof value === "number");
    console.log(`\n${issue.key ?? "unknown"}:`);
    if (numericEntries.length === 0) {
      console.log("  (no top-level numeric fields)");
      continue;
    }
    for (const [fieldId, value] of numericEntries) {
      console.log(`  ${fieldId}: ${String(value)}`);
    }
  }
}

async function logRawSprintIssuesResponse(
  siteUrl: string,
  pat: string,
  email: string,
  sprintId: number,
): Promise<void> {
  const raw = await fetchRawSprintIssuesPage(siteUrl, pat, email, sprintId);
  const issues = raw.issues ?? [];

  console.log("\n--- Raw sprint issues response (first page, fields=*all) ---");
  console.log(JSON.stringify(raw, null, 2));

  console.log("\n--- Issue field keys ---");
  for (const issue of issues) {
    console.log(`${issue.key ?? "unknown"}: ${Object.keys(issue.fields ?? {}).join(", ")}`);
  }

  logNumericFieldCandidates(issues);
}

async function main(): Promise<void> {
  const { siteUrl, pat, email } = requireEnv();

  let boardId = process.env.JIRA_BOARD_ID ? Number(process.env.JIRA_BOARD_ID) : undefined;
  let sprintId = process.env.JIRA_SPRINT_ID ? Number(process.env.JIRA_SPRINT_ID) : undefined;

  if (!boardId) {
    const boards = await listBoards(siteUrl, pat, email);
    if (boards.length === 0) {
      console.error("No boards found. Set JIRA_BOARD_ID manually.");
      process.exit(1);
    }
    boardId = boards[0].id;
    console.log(`Using board: ${boards[0].name} (id=${boardId})`);
  }

  if (!sprintId) {
    const sprints = await listActiveFutureSprints(siteUrl, pat, email, boardId);
    if (sprints.length === 0) {
      console.error("No active/future sprints found. Set JIRA_SPRINT_ID manually.");
      process.exit(1);
    }
    sprintId = sprints[0].id;
    console.log(`Using sprint: ${sprints[0].name} (id=${sprintId}, state=${sprints[0].state})`);
  }

  console.log(`Fetching issues for sprint ${sprintId}...`);

  if (process.env.JIRA_SPIKE_RAW !== "0") {
    await logRawSprintIssuesResponse(siteUrl, pat, email, sprintId);
  }

  const issues = await listSprintIssues(siteUrl, pat, email, sprintId);
  const byAssignee = groupIssuesByAssignee(issues);

  const assigneeTotals = [...byAssignee.entries()]
    .map(([accountId, tasks]) => ({
      accountId: accountId === "unassigned" ? null : accountId,
      displayName: tasks[0]?.assigneeDisplayName ?? "Unassigned",
      totalStoryPoints: tasks.reduce((sum, t) => sum + t.storyPoints, 0),
      tasks,
    }))
    .sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);

  const totalPoints = assigneeTotals.reduce((sum, a) => sum + a.totalStoryPoints, 0);

  console.log("\nAssignee aggregation:");
  for (const a of assigneeTotals) {
    console.log(`  ${a.displayName}: ${a.totalStoryPoints} pts`);
    for (const task of a.tasks) {
      console.log(`    - ${task.key}: ${task.summary} (${task.storyPoints} pts)`);
    }
  }
  console.log(`\nTotal story points: ${totalPoints}`);

  if (totalPoints === 0) {
    console.error(
      "\nSPIKE FAILED: story points field returned zero totals. " +
        "Check raw output for the correct customfield_* id.",
    );
    process.exit(1);
  }

  console.log("\nSPIKE PASSED: story points field returns non-zero totals.");
}

main().catch((error: unknown) => {
  if (error instanceof Error && "userMessage" in error) {
    console.error(`Jira error: ${(error as { userMessage: string }).userMessage}`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Spike failed: ${message}`);
  }
  process.exit(1);
});
