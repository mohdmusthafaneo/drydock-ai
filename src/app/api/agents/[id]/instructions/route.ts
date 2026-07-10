import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { readJsonField } from "@/lib/json-field";
import {
  readInstructionsBundleForAgent,
  writeInstructionsFiles,
} from "@/lib/agent-control-plane/instructions/service";

type RouteParams = { params: Promise<{ id: string }> };

const putSchema = z.object({
  files: z
    .record(z.string(), z.string())
    .refine((files) => Object.keys(files).length > 0, {
      message: "At least one file is required",
    }),
});

function instructionErrorResponse(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.startsWith("Invalid instruction file name") ||
      error.message.includes("escapes managed bundle root")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  throw error;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, agentType: true, adapterConfigJson: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const adapterConfig = readJsonField<Record<string, unknown>>(
    agent.adapterConfigJson,
    {},
  );

  try {
    const bundle = await readInstructionsBundleForAgent(session.organizationId, agent);
    return NextResponse.json({
      ...bundle,
      adapterConfig,
    });
  } catch (error) {
    return instructionErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const agent = await prisma.agentRegistry.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const updatedFiles = await writeInstructionsFiles(
      session.organizationId,
      agent.id,
      parsed.data.files,
    );

    return NextResponse.json({
      ok: true,
      agentId: agent.id,
      updatedFiles,
    });
  } catch (error) {
    return instructionErrorResponse(error);
  }
}
