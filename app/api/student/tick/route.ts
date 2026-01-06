import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actionId, date, completed } = await req.json().catch(() => ({}));
  if (!actionId || !date || typeof completed !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const state = await getAppState();
  const mhs = String(session.mhs).trim();
  const idx = (state.students || []).findIndex((s: any) => String(s.mhs).trim() === mhs);
  if (idx < 0) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const student = { ...(state.students[idx] || {}) };
  const actions = Array.isArray(student.activeActions) ? student.activeActions : [];
  const aidx = actions.findIndex((a: any) => String(a.id) === String(actionId));
  if (aidx < 0) return NextResponse.json({ error: "Action not found" }, { status: 404 });

  const action = { ...(actions[aidx] || {}) };
  const ticks = Array.isArray(action.ticks) ? [...action.ticks] : [];
  const tIdx = ticks.findIndex((t: any) => String(t.date) === String(date));
  if (tIdx >= 0) ticks[tIdx] = { ...ticks[tIdx], completed };
  else ticks.push({ date, completed });

  action.ticks = ticks;
  const nextActions = [...actions];
  nextActions[aidx] = action;
  student.activeActions = nextActions;

  const nextStudents = [...state.students];
  nextStudents[idx] = student;
  await setAppState({ students: nextStudents });

  return NextResponse.json({ student });
}
