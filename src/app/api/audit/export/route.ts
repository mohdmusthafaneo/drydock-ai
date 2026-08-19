import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { auditReadOnlyFilter } from "@/lib/audit-helpers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: session.organizationId, ...auditReadOnlyFilter() },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: true },
  });

  const header = "timestamp,action,entity_type,entity_id,user,metadata\n";
  const rows = logs
    .map((log) => {
      const cols = [
        log.createdAt.toISOString(),
        log.action,
        log.entityType,
        log.entityId ?? "",
        log.user?.email ?? "",
        JSON.stringify(log.metadataJson).replace(/"/g, '""'),
      ];
      return cols.map((c) => `"${c}"`).join(",");
    })
    .join("\n");

  const csv = header + rows;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="aidos-audit-${session.organizationId.slice(0, 8)}.csv"`,
    },
  });
}
