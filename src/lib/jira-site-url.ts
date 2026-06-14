import { JiraValidationError } from "@/types";

export function normalizeSiteUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/^http:\/\//i, "https://");
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) {
    return true;
  }
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function isAllowedJiraHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isIpLiteral(host)) {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local")) {
    return false;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.atlassian\.net$/i.test(host);
}

export function assertAllowedJiraSiteUrl(raw: string): string {
  const normalized = normalizeSiteUrl(raw);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new JiraValidationError("Enter a valid Jira Cloud site URL (e.g. https://yourorg.atlassian.net).");
  }

  if (url.protocol !== "https:") {
    throw new JiraValidationError("Jira site URL must use HTTPS.");
  }

  if (!isAllowedJiraHostname(url.hostname)) {
    throw new JiraValidationError("Only Atlassian Cloud sites are supported (e.g. https://yourorg.atlassian.net).");
  }

  return url.origin;
}

export function isAllowedJiraSiteUrl(raw: string): boolean {
  try {
    assertAllowedJiraSiteUrl(raw);
    return true;
  } catch {
    return false;
  }
}
