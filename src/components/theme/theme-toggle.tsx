"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-elevated text-secondary transition-colors hover:bg-hover hover:text-primary",
        className,
      )}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

export function ThemeToggleLabeled({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border border-border bg-elevated px-4 py-3 text-sm transition-colors hover:bg-hover",
        className,
      )}
    >
      <span className="text-primary">Appearance</span>
      <span className="flex items-center gap-2 text-secondary">
        {theme === "dark" ? (
          <>
            <Moon className="h-4 w-4" />
            Dark
          </>
        ) : (
          <>
            <Sun className="h-4 w-4" />
            Light
          </>
        )}
      </span>
    </button>
  );
}
