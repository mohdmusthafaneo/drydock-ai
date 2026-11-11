/**
 * Server-only client for the Cursor mock Admin API (mock-drydock-api/cursor-api).
 * API key never leaves the server.
 */

function cursorApiUrl(): string {
  return process.env.CURSOR_API_URL?.replace(/\/$/, "") ?? "http://localhost:3002";
}

function cursorApiKey(): string {
  return process.env.CURSOR_API_KEY ?? "mock-key";
}

export class CursorApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CursorApiError";
    this.status = status;
  }
}

export async function cursorFetchJson<T>(path: string): Promise<T> {
  const url = `${cursorApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cursorApiKey()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new CursorApiError(
      `Cursor API ${response.status} for ${path}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}
