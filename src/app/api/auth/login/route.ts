import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { jsonWithSession, redirectWithSession } from "@/lib/auth-response";
import { prisma } from "@/lib/prisma";
import { getLandingPathForOrganization } from "@/lib/landing-path-org";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function parseCredentials(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return schema.parse(await request.json());
  }
  const form = await request.formData();
  return schema.parse({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
}

export async function POST(request: Request) {
  try {
    const body = await parseCredentials(request);
    const user = await authenticateUser(body.email, body.password);

    if (!user) {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return NextResponse.redirect(
          new URL("/login?error=invalid", request.url),
          303,
        );
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const redirect = await getLandingPathForOrganization(user.organizationId);
    const session = {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return redirectWithSession(session, redirect);
    }

    return jsonWithSession(session, { ok: true, redirect });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
