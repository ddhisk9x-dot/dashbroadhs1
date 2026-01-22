// app/api/student/tick/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";
import type { TaskTick } from "@/types";

export const runtime = "nodejs";

function normalizeTicks(raw: any): TaskTick[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: TaskTick[] = [];

  for (const t of arr) {
    if (typeof t === "string") {
      out.push({ date: t, completed: true });
      continue;
    }
    const d = String(t?.date ?? "").trim();
    if (!d) continue;
    out.push({ date: d, completed: !!t?.completed });
  }

  // unique by date (last wins)
  const m = new Map<string, TaskTick>();
  for (const x of out) m.set(x.date, x);
  return Array.from(m.values());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { actionId, date, completed } = await req.json().catch(() => ({}));
  const actionIdStr = String(actionId || "").trim();
  const dateStr = String(date || "").trim();
  const completedBool = !!completed;

  if (!actionIdStr || !dateStr) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const state = await getAppState();
  const students = Array.isArray(state.students) ? state.students : [];
  const idx = students.findIndex((s: any) => String(s?.mhs || "").trim() === String(session.mhs).trim());

  if (idx < 0) {
    return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });
  }

  const st = { ...(students[idx] || {}) };

  // Update both activeActions and actionsByMonth if exist
  const updateList = (list: any[]) =>
    (Array.isArray(list) ? list : []).map((a: any) => {
      if (String(a?.id || "") !== actionIdStr) return a;

      const ticks = normalizeTicks(a?.ticks);
      const tIdx = ticks.findIndex((t) => t.date === dateStr);
      if (tIdx >= 0) ticks[tIdx] = { date: dateStr, completed: completedBool };
      else ticks.push({ date: dateStr, completed: completedBool });

      return { ...a, ticks };
    });

  st.activeActions = updateList(st.activeActions);

  if (st.actionsByMonth && typeof st.actionsByMonth === "object") {
    const nextAbm: any = {};
    for (const k of Object.keys(st.actionsByMonth)) {
      nextAbm[k] = updateList(st.actionsByMonth[k]);
    }
    st.actionsByMonth = nextAbm;
  }

  const nextStudents = [...students];
  nextStudents[idx] = st;
  await setAppState({ students: nextStudents });

  return NextResponse.json({ student: st });
}
