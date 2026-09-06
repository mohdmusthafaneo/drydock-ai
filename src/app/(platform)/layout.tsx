import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/layout/platform-shell";
import { getSession } from "@/lib/session";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<div className="min-h-dvh bg-base" />}>
      <PlatformShell session={session}>{children}</PlatformShell>
    </Suspense>
  );
}
