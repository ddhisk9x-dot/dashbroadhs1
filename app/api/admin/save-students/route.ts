import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const students = body.students;
  if (!Array.isArray(students)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  // Replace state (simple & predictable for MVP)
  await setAppState({ students });

  return NextResponse.json({ ok: true, count: students.length });
}
