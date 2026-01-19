// app/api/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, session });
  res.headers.set("cache-control", "no-store");
  return res;
}
