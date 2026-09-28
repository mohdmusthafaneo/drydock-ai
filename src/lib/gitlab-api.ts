import { getGitLabBaseUrl } from "@/lib/gitlab-oauth";

export type GitLabUser = {
  id: number;
  username: string;
  name: string | null;
};

export type GitLabProject = {
  id: number;
  path_with_namespace: string;
  default_branch: string | null;
  http_url_to_repo: string;
  visibility: string;
};

async function gitlabFetch<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
): Promise<{ data: T; nextPage: string | null }> {
  const res = await fetch(`${baseUrl}/api/v4${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `GitLab API ${res.status}`);
  }

  return {
    data: (await res.json()) as T,
    nextPage: res.headers.get("x-next-page"),
  };
}

export async function fetchGitLabUser(accessToken: string, baseUrl = getGitLabBaseUrl()) {
  const { data } = await gitlabFetch<GitLabUser>(baseUrl, accessToken, "/user");
  return data;
}

/** Projects the authorized user is a member of, newest activity first. */
export async function listMembershipProjects(
  accessToken: string,
  baseUrl = getGitLabBaseUrl(),
  limit = 100,
): Promise<GitLabProject[]> {
  const projects: GitLabProject[] = [];
  let page = "1";

  while (projects.length < limit) {
    const perPage = Math.min(50, limit - projects.length);
    const { data, nextPage } = await gitlabFetch<GitLabProject[]>(
      baseUrl,
      accessToken,
      `/projects?membership=true&simple=true&order_by=last_activity_at&per_page=${perPage}&page=${page}`,
    );
    projects.push(...data);
    if (!nextPage || data.length === 0) break;
    page = nextPage;
  }

  return projects;
}
