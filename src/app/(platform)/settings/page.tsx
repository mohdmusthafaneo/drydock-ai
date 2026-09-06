import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Settings"
        description="Your workspace settings, team members, and shortcuts."
      />

      <Card>
        <CardHeader>
          <CardTitle>{org?.name}</CardTitle>
          <CardDescription>Workspace identifier: {org?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted">Your role: </span>
            <span className="text-primary">{ROLE_LABELS[session.role]}</span>
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
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elevated px-4 py-2 text-sm"
            >
              <span className="text-primary">
                {m.name} · {m.email}
              </span>
              <span className="text-muted">
                {ROLE_LABELS[m.role]}
                {m.lastLoginAt && (
                  <span suppressHydrationWarning>
                    {` · last login ${m.lastLoginAt.toLocaleDateString("en-US")}`}
                  </span>
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
