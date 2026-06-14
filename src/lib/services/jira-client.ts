import { assertAllowedJiraSiteUrl } from "@/lib/jira-site-url";
import type { JiraBoard, JiraSprint, SprintAssignee } from "@/types";
import { JiraValidationError } from "@/types";

/**
 * Spike (Phase 2): Jira Cloud API tokens require Basic auth (`email:token` base64),
 * not Bearer, when calling `{siteUrl}/rest/api/3/*` directly.
 * See: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
 */
export { normalizeSiteUrl } from "@/lib/jira-site-url";

const PAGE_SIZE = 50;
const TIMEOUT_MS = 10_000;
/** Default Jira Software story-points field; `storyPoints` alias is tried first when present. */
const STORY_POINTS_CUSTOM_FIELD = "customfield_10016";
const SPRINT_ISSUE_FIELDS = `assignee,summary,storyPoints,${STORY_POINTS_CUSTOM_FIELD}`;

function buildBasicAuthHeader(accountEmail: string, pat: string): string {
  const credentials = btoa(`${accountEmail}:${pat}`);
  return `Basic ${credentials}`;
}

interface PaginatedValues<T> {
  values: T[];
  isLast?: boolean;
  startAt: number;
  maxResults: number;
  total?: number;
}

interface SprintIssueFields {
  assignee: { accountId: string; displayName: string } | null;
  storyPoints?: number | null;
  customfield_10016?: number | null;
  summary?: string;
}

function readStoryPoints(fields: SprintIssueFields): number {
  if (typeof fields.storyPoints === "number") {
    return fields.storyPoints;
  }
  if (typeof fields.customfield_10016 === "number") {
    return fields.customfield_10016;
  }
  return 0;
}

interface SprintIssueRow {
  key: string;
  fields: SprintIssueFields;
}

interface SprintIssuesPage {
  issues: SprintIssueRow[];
  isLast?: boolean;
  startAt: number;
  maxResults: number;
  total?: number;
}

/** Issue endpoints omit `isLast`; fall back to total/startAt or short page. */
function isPaginatedLastPage(
  page: { isLast?: boolean; startAt: number; maxResults: number; total?: number },
  itemCount: number,
): boolean {
  if (page.isLast === true) {
    return true;
  }
  if (typeof page.total === "number") {
    return page.startAt + itemCount >= page.total;
  }
  const pageSize = page.maxResults || PAGE_SIZE;
  return itemCount === 0 || itemCount < pageSize;
}

async function fetchJiraJson<T>(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  path: string,
  searchParams?: Record<string, string>,
): Promise<T> {
  if (!accountEmail.trim()) {
    throw new JiraValidationError("Your account email is required to access Jira.");
  }

  const normalized = assertAllowedJiraSiteUrl(siteUrl);
  const url = new URL(`${normalized}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: buildBasicAuthHeader(accountEmail, pat),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new JiraValidationError("Jira site took too long to respond. Please try again.");
    }
    throw new JiraValidationError("Could not reach your Jira site. Check the site URL and try again.");
  }

  if (response.status === 401) {
    throw new JiraValidationError(
      "Invalid Jira credentials. Check your API token and ensure your Atlassian account uses the same email as your Google sign-in.",
    );
  }

  if (response.status === 403) {
    throw new JiraValidationError("Your Jira token does not have permission to access this resource.");
  }

  if (response.status === 404) {
    throw new JiraValidationError("The requested Jira resource was not found.");
  }

  if (!response.ok) {
    throw new JiraValidationError("Could not load data from Jira. Please try again.");
  }

  return (await response.json()) as T;
}

async function paginateValues<T>(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  path: string,
  searchParams?: Record<string, string>,
): Promise<T[]> {
  const all: T[] = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const page = await fetchJiraJson<PaginatedValues<T>>(siteUrl, pat, accountEmail, path, {
      ...searchParams,
      startAt: String(startAt),
      maxResults: String(PAGE_SIZE),
    });
    all.push(...page.values);
    isLast = isPaginatedLastPage(page, page.values.length);
    startAt += page.maxResults || PAGE_SIZE;
  }

  return all;
}

async function paginateSprintIssues(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  sprintId: number,
): Promise<SprintIssueRow[]> {
  const all: SprintIssueRow[] = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const page = await fetchJiraJson<SprintIssuesPage>(
      siteUrl,
      pat,
      accountEmail,
      `/rest/agile/1.0/sprint/${sprintId}/issue`,
      {
        fields: SPRINT_ISSUE_FIELDS,
        startAt: String(startAt),
        maxResults: String(PAGE_SIZE),
      },
    );
    all.push(...page.issues);
    isLast = isPaginatedLastPage(page, page.issues.length);
    startAt += page.maxResults || PAGE_SIZE;
  }

  return all;
}

export interface SprintIssue {
  key: string;
  summary: string;
  assigneeAccountId: string | null;
  assigneeDisplayName: string;
  storyPoints: number;
}

export async function listSprintIssues(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  sprintId: number,
): Promise<SprintIssue[]> {
  const issues = await paginateSprintIssues(siteUrl, pat, accountEmail, sprintId);
  return issues.map(({ key, fields }) => {
    const assignee = fields.assignee;
    return {
      key,
      summary: fields.summary ?? key,
      assigneeAccountId: assignee?.accountId ?? null,
      assigneeDisplayName: assignee?.displayName ?? "Unassigned",
      storyPoints: readStoryPoints(fields),
    };
  });
}

export async function validateJiraCredentials(siteUrl: string, pat: string, accountEmail: string): Promise<void> {
  await fetchJiraJson<unknown>(siteUrl, pat, accountEmail, "/rest/api/3/myself");
}

export async function listBoards(siteUrl: string, pat: string, accountEmail: string): Promise<JiraBoard[]> {
  const raw = await paginateValues<{ id: number; name: string; type?: string }>(
    siteUrl,
    pat,
    accountEmail,
    "/rest/agile/1.0/board",
  );
  return raw.map(({ id, name, type }) => ({ id, name, type }));
}

export async function listActiveFutureSprints(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  boardId: number,
): Promise<JiraSprint[]> {
  const raw = await paginateValues<{ id: number; name: string; state: string; startDate?: string; endDate?: string }>(
    siteUrl,
    pat,
    accountEmail,
    `/rest/agile/1.0/board/${boardId}/sprint`,
    { state: "active,future" },
  );
  return raw.map(({ id, name, state, startDate, endDate }) => ({ id, name, state, startDate, endDate }));
}

export async function getSprintAssignees(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  sprintId: number,
): Promise<SprintAssignee[]> {
  const issues = await listSprintIssues(siteUrl, pat, accountEmail, sprintId);
  const byKey = new Map<string, SprintAssignee>();

  for (const issue of issues) {
    const key = issue.assigneeAccountId ?? "unassigned";

    const existing = byKey.get(key);
    if (existing) {
      existing.totalStoryPoints += issue.storyPoints;
    } else {
      byKey.set(key, {
        accountId: issue.assigneeAccountId,
        displayName: issue.assigneeDisplayName,
        totalStoryPoints: issue.storyPoints,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);
}
