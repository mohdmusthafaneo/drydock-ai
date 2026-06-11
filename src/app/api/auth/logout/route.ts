import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(appUrl("/login"));
}
