import { prisma } from "@/lib/prisma";

/** First active org admin (or any active user) for integration sync actor attribution. */
export async function resolveOrgActorUserId(
  organizationId: string,
): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE", role: "ORG_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;

  const anyUser = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return anyUser?.id ?? null;
}
