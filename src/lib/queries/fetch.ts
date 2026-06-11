export class ApiFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiFetchError(data.error ?? `Request failed (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}
