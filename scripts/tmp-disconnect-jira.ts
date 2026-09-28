import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.integration.findMany({
    where: { provider: "JIRA", status: "CONNECTED" },
    select: {
      id: true,
      organizationId: true,
      displayName: true,
      organization: { select: { slug: true } },
    },
  });

  if (rows.length === 0) {
    console.log(JSON.stringify({ disconnected: [] }));
    return;
  }

  const disconnected: string[] = [];
  for (const row of rows) {
    const actor = await prisma.user.findFirst({
      where: { organizationId: row.organizationId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.integration.update({
        where: { id: row.id },
        data: {
          status: "DISCONNECTED",
          displayName: "JIRA",
          connectedAt: null,
          lastError: null,
          metadataJson: { disconnectedAt: new Date().toISOString() },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: row.organizationId,
          userId: actor?.id,
          action: "integration.jira.disconnected",
          entityType: "Integration",
          metadataJson: JSON.stringify({ reason: "manual disconnect" }),
          actorType: actor?.id ? "human" : "system",
        },
      });
    });
    disconnected.push(row.organization.slug);
  }

  console.log(JSON.stringify({ disconnected }));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
