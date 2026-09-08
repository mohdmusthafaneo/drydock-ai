"use client";

import Link from "next/link";
import type { UserRole } from "@/generated/prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/roles";
import { useAppData } from "@/lib/store";

function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role.replace(/_/g, " ");
}

export function SettingsFromStore() {
  const settings = useAppData((s) => s.data.settings);
  const org = useAppData((s) => s.data.org);
  const user = useAppData((s) => s.data.user);

  return (
    <div className="mx-auto max-w-3xl space-y-[13px]">
      <PageHeader
        title="Settings"
        description="Your workspace settings, team members, and shortcuts."
      />

      <Card>
        <CardHeader>
          <CardTitle>{settings.organizationName}</CardTitle>
          <CardDescription>Workspace identifier: {org.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted">Your role: </span>
            <span className="text-primary">{roleLabel(String(user.role))}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Operational shortcuts for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/briefing" className="text-ink underline-offset-4 hover:underline">
            Today
          </Link>
          <Link href="/ledger" className="text-ink underline-offset-4 hover:underline">
            Tests
          </Link>
          <Link href="/standard" className="text-ink underline-offset-4 hover:underline">
            Conventions
          </Link>
          <Link href="/certificate" className="text-ink underline-offset-4 hover:underline">
            Sign-off
          </Link>
          <Link href="/escapes" className="text-ink underline-offset-4 hover:underline">
            Misses
          </Link>
          <Link href="/releases" className="text-ink underline-offset-4 hover:underline">
            Releases
          </Link>
          <Link href="/integrations" className="text-ink underline-offset-4 hover:underline">
            Connect
          </Link>
          <Link href="/audit" className="text-ink underline-offset-4 hover:underline">
            Decision log
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team management</CardTitle>
          <CardDescription>Manage team members and their roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {settings.members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-border bg-pure-white px-4 py-2 text-sm"
            >
              <span className="text-primary">
                {m.name} · {m.email}
              </span>
              <span className="text-muted">{roleLabel(m.role as UserRole | string)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
