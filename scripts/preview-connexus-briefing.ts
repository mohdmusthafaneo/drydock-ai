import { prisma } from "../src/lib/prisma";
import { loadExecutiveBriefing } from "../src/lib/executive-briefing/load-briefing-context";

const mode = process.argv[2] ?? "load";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("no connexus");

  if (mode === "enrich") {
    await prisma.executiveBriefingSnapshot.deleteMany({
      where: { organizationId: org.id },
    });
    const { enrichExecutiveBriefingForOrg } = await import(
      "../src/lib/executive-briefing/enrich-briefing"
    );
    const result = await enrichExecutiveBriefingForOrg(org.id);
    console.log(JSON.stringify(result, null, 2));
  }

  const { briefing } = await loadExecutiveBriefing(org.id, {
    applyLlmSnapshot: true,
  });
  console.log(
    JSON.stringify(
      {
        orgId: org.id,
        source: briefing.source,
        wordCount: briefing.wordCount,
        band: briefing.health.bandLabel,
        llmGeneratedAt: briefing.llmGeneratedAt ?? null,
        headline: briefing.headline.map((s) => s.text).join(""),
        narrative: briefing.narrative,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
