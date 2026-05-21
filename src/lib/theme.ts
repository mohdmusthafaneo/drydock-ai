export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "aidos-theme";
export const THEME_COOKIE_NAME = "aidos-theme";

export function parseTheme(value: string | undefined | null): Theme | null {
  if (value === "light" || value === "dark") return value;
  return null;
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.cookie = `${THEME_COOKIE_NAME}=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}
