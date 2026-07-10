/**
 * Lists organizations with legacy observability-stub Grafana/Prometheus integrations.
 * Does not auto-migrate — operators should prompt org admins to reconnect via Integrations.
 *
 * Usage: npx tsx scripts/list-observability-stub-integrations.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";

type StubRow = {
  organizationId: string;
  organizationName: string;
  provider: string;
  status: string;
  mode: string | undefined;
  connectedAt: Date | null;
};

async function main() {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: { in: ["GRAFANA", "PROMETHEUS"] },
      status: "CONNECTED",
    },
    include: {
      organization: { select: { name: true } },
    },
    orderBy: [{ organizationId: "asc" }, { provider: "asc" }],
  });

  const stubs: StubRow[] = [];

  for (const integration of integrations) {
    const mode = readJsonField<{ mode?: string }>(integration.metadataJson, {}).mode;

    if (mode !== "observability-stub") continue;

    stubs.push({
      organizationId: integration.organizationId,
      organizationName: integration.organization.name,
      provider: integration.provider,
      status: integration.status,
      mode,
      connectedAt: integration.connectedAt,
    });
  }

  if (stubs.length === 0) {
    console.log("No observability-stub integrations found.");
    return;
  }

  console.log(`Found ${stubs.length} legacy stub integration(s):\n`);
  for (const row of stubs) {
    console.log(
      [
        `- org: ${row.organizationName} (${row.organizationId})`,
        `  provider: ${row.provider}`,
        `  status: ${row.status}`,
        `  connectedAt: ${row.connectedAt?.toISOString() ?? "—"}`,
        `  action: prompt admin to reconnect on Integrations page`,
      ].join("\n"),
    );
    console.log();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
