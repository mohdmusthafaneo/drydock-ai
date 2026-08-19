import { httpFetch, HttpResponseError } from "@/lib/http/client";

export class JiraApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const JIRA_API = "https://api.atlassian.com/ex/jira";

/** Shared authenticated fetch against the Atlassian Jira Cloud gateway. */
export async function jiraFetch<T>(
  accessToken: string,
  cloudId: string,
  path: string,
  init?: RequestInit,
  organizationId?: string,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${JIRA_API}/${cloudId}${path}`;
  let res: Response;
  try {
    res = await httpFetch({
      url,
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      body: init?.body ?? undefined,
      scope: { provider: "jira", organizationId },
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : 502;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new JiraApiError(text || `Jira API error (${status})`, status);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraApiError(text || `Jira API error (${res.status})`, res.status);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
