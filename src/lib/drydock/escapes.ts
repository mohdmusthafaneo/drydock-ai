/**
 * Escapes: production defects the suite should have caught.
 * Persisted on the existing Incident table (repurposed, not renamed).
 */

import { prisma } from "@/lib/prisma";

export type EscapeView = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  releaseName: string | null;
  createdAt: string;
};

export async function loadEscapes(organizationId: string): Promise<EscapeView[]> {
  const rows = await prisma.incident.findMany({
    where: { organizationId },
    include: { release: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.description,
    status: row.status,
    releaseName: row.release?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
