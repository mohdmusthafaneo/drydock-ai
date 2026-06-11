export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_APP_URL is required in production");
    }
    return "http://localhost:3000";
  }
  const url = new URL(raw);
  if (
    ["localhost", "0.0.0.0", "127.0.0.1"].includes(url.hostname) &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must be a public hostname in production");
  }
  return url.origin;
}

export function appUrl(path: string): URL {
  return new URL(path, getAppUrl());
}

/** Absolute URL string — use with next/navigation redirect() behind reverse proxies. */
export function appPath(path: string): string {
  return appUrl(path).toString();
}

export function isAppUrlConfigured(): boolean {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return Boolean(raw);
}
