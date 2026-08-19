import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import type { UserRole } from "@/generated/prisma/client";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "admin", "manage_team");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "VIEWER") as UserRole;
  const name = String(body.name ?? email.split("@")[0]);

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await prisma.orgInvitation.upsert({
    where: {
      organizationId_email: {
        organizationId: session.organizationId,
        email,
      },
    },
    create: {
      organizationId: session.organizationId,
      email,
      role,
      invitedById: session.userId,
      token,
      expiresAt,
    },
    update: { role, token, expiresAt, acceptedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: session.organizationId,
      userId: session.userId,
      action: "team.invited",
      entityType: "OrgInvitation",
      entityId: invitation.id,
      metadataJson: JSON.stringify({ email, role }),
    },
  });

  return NextResponse.json({
    ok: true,
    invitation: {
      id: invitation.id,
      email,
      role,
      expiresAt,
      /** Dev-only: share signup link with token until email delivery is wired */
      signupHint: `/signup?invite=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
    },
  });
}
