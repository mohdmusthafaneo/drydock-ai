"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AidosLogo } from "@/components/brand/aidos-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@/lib/workspace-mode";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  initialWorkspaceMode = "MVP",
}: {
  mode: Mode;
  initialWorkspaceMode?: WorkspaceMode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceMode>(initialWorkspaceMode);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (mode === "signup") {
      (payload as Record<string, string>).workspaceMode = workspaceMode;
    }

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }

    router.push(data.redirect || "/accelerator");
    router.refresh();
  }

  return (
    <div
      data-theme="dark"
      className="auth-canvas relative flex min-h-screen bg-base text-primary"
    >
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 hidden w-full flex-col justify-center px-12 lg:flex lg:max-w-md xl:max-w-lg xl:px-16">
        <AidosLogo size={48} className="mb-8" />
        <h1 className="text-3xl font-semibold tracking-tight xl:text-4xl">
          AI delivery intelligence,
          <span className="block text-brand">human governed.</span>
        </h1>
        <p className="mt-4 max-w-sm text-secondary">
          Orchestrate releases, governance, and observability from one workspace — built for
          enterprise teams and MVP builders.
        </p>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center p-4 lg:p-8">
        <Card className="w-full max-w-md border-brand/20 bg-surface/90 shadow-[0_0_40px_rgba(6,182,212,0.08)] backdrop-blur-md">
          <CardHeader className="space-y-3">
            <div className="lg:hidden">
              <AidosLogo size={40} />
            </div>
            <div>
              <CardTitle className="text-xl">
                {mode === "login" ? "Welcome back" : "Create your workspace"}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {mode === "login"
                  ? "Sign in to your AIDOS workspace"
                  : "Choose how you want to use AIDOS — you can switch later"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode("MVP")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        workspaceMode === "MVP"
                          ? "border-mvp/50 bg-mvp-muted"
                          : "border-border hover:bg-hover",
                      )}
                    >
                      <Rocket className="mb-2 h-5 w-5 text-mvp" />
                      <p className="text-sm font-medium text-primary">MVP</p>
                      <p className="text-xs text-muted">Startups & products</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode("ENTERPRISE")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        workspaceMode === "ENTERPRISE"
                          ? "border-brand/50 bg-brand-muted"
                          : "border-border hover:bg-hover",
                      )}
                    >
                      <Building2 className="mb-2 h-5 w-5 text-brand" />
                      <p className="text-sm font-medium text-primary">Enterprise</p>
                      <p className="text-xs text-muted">Governed delivery</p>
                    </button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" name="name" required placeholder="Alex Morgan" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizationName">Organization</Label>
                    <Input
                      id="organizationName"
                      name="organizationName"
                      required
                      placeholder="Acme Engineering"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <p className="rounded-lg bg-error-muted px-3 py-2 text-sm text-error-soft">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" variant="default" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted">
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <Link href="/signup" className="font-medium text-brand hover:underline">
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-brand hover:underline">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
