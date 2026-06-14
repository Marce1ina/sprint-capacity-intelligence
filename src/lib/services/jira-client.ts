import { JiraValidationError } from "@/types";

/**
 * Spike (Phase 2): Jira Cloud API tokens require Basic auth (`email:token` base64),
 * not Bearer, when calling `{siteUrl}/rest/api/3/*` directly.
 * See: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
 */
export function normalizeSiteUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/^http:\/\//i, "https://");
}

function buildBasicAuthHeader(accountEmail: string, pat: string): string {
  const credentials = btoa(`${accountEmail}:${pat}`);
  return `Basic ${credentials}`;
}

export async function validateJiraCredentials(siteUrl: string, pat: string, accountEmail: string): Promise<void> {
  if (!accountEmail.trim()) {
    throw new JiraValidationError("Your account email is required to validate Jira credentials.");
  }

  const normalized = normalizeSiteUrl(siteUrl);

  let response: Response;
  try {
    response = await fetch(`${normalized}/rest/api/3/myself`, {
      headers: {
        Authorization: buildBasicAuthHeader(accountEmail, pat),
        Accept: "application/json",
      },
    });
  } catch {
    throw new JiraValidationError("Could not reach your Jira site. Check the site URL and try again.");
  }

  if (response.status === 401) {
    throw new JiraValidationError(
      "Invalid Jira credentials. Check your API token and ensure your Atlassian account uses the same email as your Google sign-in.",
    );
  }

  if (response.status === 403) {
    throw new JiraValidationError("Your Jira token does not have permission to access this site.");
  }

  if (response.status === 404) {
    throw new JiraValidationError("Jira site not found. Check your site URL and try again.");
  }

  if (!response.ok) {
    throw new JiraValidationError("Could not validate Jira credentials. Please try again.");
  }
}
