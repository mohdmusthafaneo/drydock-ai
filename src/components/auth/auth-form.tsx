"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AidosLogo } from "@/components/brand/aidos-logo";
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
    <div className="auth-canvas relative flex min-h-screen bg-base text-primary">
      <div className="relative z-10 hidden w-full flex-col justify-center px-12 lg:flex lg:max-w-md xl:max-w-lg xl:px-16">
        <AidosLogo size={48} className="mb-8" />
        <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink xl:text-[64px] xl:tracking-[-1.6px]">
          AI delivery intelligence,
          <span className="block text-rust">human governed.</span>
        </h1>
        <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-ash">
          Orchestrate releases, governance, and observability from one workspace — built for
          enterprise teams and MVP builders.
        </p>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center p-4 lg:p-8">
        <Card className="w-full max-w-md border-none bg-pure-white shadow-[var(--shadow)]">
          <CardHeader className="space-y-3">
            <div className="lg:hidden">
              <AidosLogo size={40} />
            </div>
            <div>
              <CardTitle className="text-[22px] font-medium text-ink">
                {mode === "login" ? "Welcome back" : "Create your workspace"}
              </CardTitle>
              <CardDescription className="mt-1.5 text-ash">
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
                        "rounded-[16px] border p-3 text-left transition-all",
                        workspaceMode === "MVP"
                          ? "border-rust/30 bg-apricot-wash"
                          : "border-dove/60 hover:bg-fog",
                      )}
                    >
                      <Rocket className="mb-2 h-5 w-5 text-rust" strokeWidth={1.5} />
                      <p className="text-[15px] font-medium text-ink">MVP</p>
                      <p className="text-[13px] text-graphite">Startups & products</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode("ENTERPRISE")}
                      className={cn(
                        "rounded-[16px] border p-3 text-left transition-all",
                        workspaceMode === "ENTERPRISE"
                          ? "border-chart-blue/30 bg-sky-wash"
                          : "border-dove/60 hover:bg-fog",
                      )}
                    >
                      <Building2 className="mb-2 h-5 w-5 text-chart-blue" strokeWidth={1.5} />
                      <p className="text-[15px] font-medium text-ink">Enterprise</p>
                      <p className="text-[13px] text-graphite">Governed delivery</p>
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
                <p className="rounded-[16px] bg-apricot-wash/60 px-3 py-2 text-[14px] text-rust">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full rounded-full" variant="ink" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <p className="mt-4 text-center text-[14px] text-graphite">
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <Link href="/signup" className="font-medium text-ink hover:text-rust">
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-ink hover:text-rust">
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
