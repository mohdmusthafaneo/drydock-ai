/**
 * Mine structural shapes from the test corpus for Standard ratification.
 * Text plane only — no framework AST.
 */

import { prisma } from "@/lib/prisma";

export type StandardView = {
  patterns: Array<{
    id: string;
    patternKey: string;
    shapeLabel: string;
    plainSentence: string;
    occurrenceCount: number;
    examples: string[];
    status: "CANDIDATE" | "RATIFIED" | "REJECTED";
  }>;
};

function shapeFor(name: string, filePath: string): { key: string; label: string } {
  const lower = `${name} ${filePath}`.toLowerCase();
  if (/\bwait(for|ing)?\b/.test(lower) || lower.includes("timeout")) {
    return { key: "wait-strategy", label: "Wait / timeout strategy" };
  }
  if (lower.includes("checkout") || lower.includes("cart") || lower.includes("promo")) {
    return { key: "commerce-journey", label: "Commerce journey (checkout/cart/promo)" };
  }
  if (lower.includes("webhook") || lower.includes("contract") || lower.includes("api")) {
    return { key: "contract-api", label: "Contract / API assertion" };
  }
  if (lower.includes("3ds") || lower.includes("payment") || lower.includes("visa")) {
    return { key: "payments", label: "Payments path" };
  }
  if (filePath.includes("smoke") || lower.includes("smoke")) {
    return { key: "smoke", label: "Smoke check" };
  }
  const dir = filePath.split("/").slice(0, -1).join("/") || "root";
  return { key: `dir:${dir}`, label: `Tests in ${dir}` };
}

export async function mineStandardPatterns(organizationId: string): Promise<number> {
  const cases = await prisma.testCase.findMany({
    where: { organizationId },
    select: { name: true, filePath: true },
    take: 2000,
  });

  const buckets = new Map<string, { label: string; names: string[] }>();
  for (const row of cases) {
    const shape = shapeFor(row.name, row.filePath);
    const bucket = buckets.get(shape.key) ?? { label: shape.label, names: [] };
    if (bucket.names.length < 8) bucket.names.push(row.name);
    buckets.set(shape.key, bucket);
  }

  let upserts = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.names.length < 2 && !key.startsWith("wait")) continue;
    const count = cases.filter((c) => shapeFor(c.name, c.filePath).key === key).length;
    await prisma.standardPattern.upsert({
      where: {
        organizationId_patternKey: { organizationId, patternKey: key },
      },
      create: {
        organizationId,
        patternKey: key,
        shapeLabel: bucket.label,
        plainSentence: `${count} tests follow the pattern “${bucket.label}”. Which form should we prefer?`,
        exampleNamesJson: bucket.names,
        occurrenceCount: count,
        status: "CANDIDATE",
      },
      update: {
        shapeLabel: bucket.label,
        exampleNamesJson: bucket.names,
        occurrenceCount: count,
        plainSentence: `${count} tests follow the pattern “${bucket.label}”. Which form should we prefer?`,
      },
    });
    upserts += 1;
  }
  return upserts;
}

export async function loadStandard(organizationId: string): Promise<StandardView> {
  await mineStandardPatterns(organizationId);
  const rows = await prisma.standardPattern.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { occurrenceCount: "desc" }],
  });
  return {
    patterns: rows.map((row) => ({
      id: row.id,
      patternKey: row.patternKey,
      shapeLabel: row.shapeLabel,
      plainSentence: row.plainSentence,
      occurrenceCount: row.occurrenceCount,
      examples: Array.isArray(row.exampleNamesJson)
        ? row.exampleNamesJson.filter((v): v is string => typeof v === "string")
        : [],
      status: row.status,
    })),
  };
}

export async function ratifyStandardPattern(args: {
  organizationId: string;
  patternId: string;
  status: "RATIFIED" | "REJECTED";
}) {
  const existing = await prisma.standardPattern.findFirst({
    where: { id: args.patternId, organizationId: args.organizationId },
  });
  if (!existing) throw new Error("Pattern not found");
  return prisma.standardPattern.update({
    where: { id: existing.id },
    data: {
      status: args.status,
      ratifiedAt: args.status === "RATIFIED" ? new Date() : null,
    },
  });
}
