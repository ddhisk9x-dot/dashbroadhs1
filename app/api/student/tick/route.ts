import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function isMonthKey(m: string) {
  return /^\d{4}-\d{2}$/.test(String(m || "").trim());
}

function findActionInActionsByMonth(student: any, actionId: string): { monthKey: string; idx: number } | null {
  const abm = student?.actionsByMonth;
  if (!abm || typeof abm !== "object") return null;

  for (const mk of Object.keys(abm)) {
    if (!isMonthKey(mk)) continue;
    const list = abm[mk];
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((a: any) => String(a?.id) === String(actionId));
    if (idx >= 0) return { monthKey: mk, idx };
  }
  return null;
}

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

  const student: any = { ...(state.students[idx] || {}) };

  // 1) Prefer actionsByMonth (new)
  const hit = findActionInActionsByMonth(student, actionId);

  if (hit) {
    const mk = hit.monthKey;
    const list = Array.isArray(student.actionsByMonth?.[mk]) ? [...student.actionsByMonth[mk]] : [];
    const action = { ...(list[hit.idx] || {}) };

    const ticks = Array.isArray(action.ticks) ? [...action.ticks] : [];
    const tIdx = ticks.findIndex((t: any) => String(t.date) === String(date));
    if (tIdx >= 0) ticks[tIdx] = { ...ticks[tIdx], completed };
    else ticks.push({ date, completed });

    action.ticks = ticks;
    list[hit.idx] = action;

    student.actionsByMonth = { ...(student.actionsByMonth || {}) };
    student.actionsByMonth[mk] = list;

    // optional: keep backward compat mirror if action exists in activeActions
    const aa = Array.isArray(student.activeActions) ? [...student.activeActions] : [];
    const aidx = aa.findIndex((a: any) => String(a?.id) === String(actionId));
    if (aidx >= 0) {
      aa[aidx] = action;
      student.activeActions = aa;
    }

    const nextStudents = [...state.students];
    nextStudents[idx] = student;
    await setAppState({ students: nextStudents });

    return NextResponse.json({ student });
  }

  // 2) Fallback old activeActions
  const actions = Array.isArray(student.activeActions) ? [...student.activeActions] : [];
  const aidx = actions.findIndex((a: any) => String(a.id) === String(actionId));
  if (aidx < 0) return NextResponse.json({ error: "Action not found" }, { status: 404 });

  const action = { ...(actions[aidx] || {}) };
  const ticks = Array.isArray(action.ticks) ? [...action.ticks] : [];
  const tIdx = ticks.findIndex((t: any) => String(t.date) === String(date));
  if (tIdx >= 0) ticks[tIdx] = { ...ticks[tIdx], completed };
  else ticks.push({ date, completed });

  action.ticks = ticks;
  actions[aidx] = action;
  student.activeActions = actions;

  const nextStudents = [...state.students];
  nextStudents[idx] = student;
  await setAppState({ students: nextStudents });

  return NextResponse.json({ student });
}
