import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { mhs, report, actions } = await req.json().catch(() => ({}));
  if (!mhs || !report || !Array.isArray(actions)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const state = await getAppState();
  const idx = (state.students || []).findIndex((s: any) => String(s.mhs).trim() === String(mhs).trim());
  if (idx < 0) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

  const updated = { ...(state.students[idx] || {}) };
  updated.aiReport = report;
  updated.activeActions = actions;

  const nextStudents = [...state.students];
  nextStudents[idx] = updated;

  await setAppState({ students: nextStudents });

  return NextResponse.json({ ok: true });
}
