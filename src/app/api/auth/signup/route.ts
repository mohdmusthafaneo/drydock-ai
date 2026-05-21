import { NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { jsonWithSession } from "@/lib/auth-response";
import { getHomePath } from "@/lib/workspace-mode";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  organizationName: z.string().min(2),
  workspaceMode: z.enum(["MVP", "ENTERPRISE"]).default("MVP"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { user, organization } = await registerUser(body);

    return jsonWithSession(
      {
        userId: user.id,
        organizationId: organization.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      {
        ok: true,
        redirect:
          body.workspaceMode === "MVP"
            ? "/accelerator/new"
            : getHomePath("ENTERPRISE", false),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
