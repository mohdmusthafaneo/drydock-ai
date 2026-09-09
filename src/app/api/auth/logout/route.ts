import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  // 303 so the browser follows with GET /login (not another POST).
  return NextResponse.redirect(appUrl("/login"), 303);
}
