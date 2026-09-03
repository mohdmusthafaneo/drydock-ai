import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { ingestJUnitReport } from "@/lib/drydock/ingest";

const bodySchema = z.object({
  repository: z.string().min(1),
  workflowName: z.string().min(1).default("e2e"),
  workflowRunId: z.string().min(1),
  commitSha: z.string().min(7),
  branch: z.string().min(1).default("main"),
  conclusion: z
    .enum(["SUCCESS", "FAILURE", "CANCELLED", "SKIPPED", "NEUTRAL", "UNKNOWN"])
    .optional(),
  junitXml: z.string().min(20),
  defaultFilePath: z.string().optional(),
  htmlUrl: z.string().url().optional(),
  finishedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const result = await ingestJUnitReport({
    organizationId: session.organizationId,
    repository: data.repository,
    workflowName: data.workflowName,
    workflowRunId: data.workflowRunId,
    commitSha: data.commitSha,
    branch: data.branch,
    conclusion: data.conclusion,
    junitXml: data.junitXml,
    defaultFilePath: data.defaultFilePath,
    htmlUrl: data.htmlUrl,
    finishedAt: data.finishedAt ? new Date(data.finishedAt) : new Date(),
  });

  return NextResponse.json({ ok: true, ...result });
}
