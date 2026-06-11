import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

type RouteParams = { params: Promise<{ id: string }> };

/** Humans cannot close threads — only Super Agent via agent API. */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await params;

  return NextResponse.json(
    { error: "Only Super Agent may close threads" },
    { status: 403 },
  );
}
