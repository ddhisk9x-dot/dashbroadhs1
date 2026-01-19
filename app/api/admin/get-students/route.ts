// app/api/admin/get-students/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const state = await getAppState();
  const all = state.students || [];

  if (session.role === "ADMIN") {
    return NextResponse.json({
      ok: true,
      students: all,
      meta: { role: "ADMIN", username: session.username },
    });
  }

  if (session.role === "TEACHER") {
    const cls = String(session.teacherClass || "").trim();
    const filtered = all.filter((
