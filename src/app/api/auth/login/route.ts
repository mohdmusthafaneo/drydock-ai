import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { jsonWithSession } from "@/lib/auth-response";
import { prisma } from "@/lib/prisma";
import { getHomePath } from "@/lib/workspace-mode";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const user = await authenticateUser(body.email, body.password);

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const [dna, org] = await Promise.all([
      prisma.deliveryDNA.findUnique({
        where: { organizationId: user.organizationId },
      }),
      prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { workspaceMode: true },
      }),
    ]);

    const mode = (org?.workspaceMode ?? "MVP") as "MVP" | "ENTERPRISE";

    return jsonWithSession(
      {
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      { ok: true, redirect: getHomePath(mode, Boolean(dna)) },
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
