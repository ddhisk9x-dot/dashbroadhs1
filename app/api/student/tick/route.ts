// app/api/student/tick/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type TaskTick = { date: string; completed: boolean };
type StudyAction = { id: string; description?: string; frequency?: string; ticks?: TaskTick[] };

function isMonthKey(m: string) {
  return /^\d{4}-\d{2}$/.test(String(m || "").trim());
}

function monthKeyFromDate(date: string) {
  const mk = String(date || "").slice(0, 7);
  return isMonthKey(mk) ? mk : "";
}

function upsertTick(action: StudyAction, date: string, completed: boolean): StudyAction {
  const ticks = Array.isArray(action.ticks) ? [...action.ticks] : [];
  const idx = ticks.findIndex((t) => String(t.date) === String(date));
  if (idx >= 0) ticks[idx] = { ...ticks[idx], completed };
  else ticks.push({ date, completed });
  return { ...action, ticks };
}

function updateListByActionId(list: StudyAction[], actionId: string, date: string, completed: boolean) {
  const idx = list.findIndex((a) => String(a.id) === String(actionId));
  if (idx < 0) return { updated: false, list };
  const next = [...list];
  next[idx] = upsertTick(next[idx], date, completed);
  return { updated: true, list: next };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<{
    actionId: string;
    date: string;
    completed: boolean;
  }>;

  const actionId = String(body.actionId || "").trim();
  const date = String(body.date || "").trim();
  const completed = body.completed;

  if (!actionId || !date || typeof completed !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const state = await getAppState();
  const mhs = String(session.mhs).trim();
  const students = Array.isArray((state as any).students) ? (state as any).students : [];
  const sIdx = students.findIndex((s: any) => String(s?.mhs).trim() === mhs);
  if (sIdx < 0) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const student = { ...(students[sIdx] || {}) };

  const mk = monthKeyFromDate(date);
  const abm: Record<string, StudyAction[]> =
    student.actionsByMonth && typeof student.actionsByMonth === "object" ? student.actionsByMonth : {};

  let updated = false;

  // 1) Ưu tiên update đúng tháng của ngày tick (actionsByMonth[YYYY-MM])
  if (mk && Array.isArray(abm[mk])) {
    const r = updateListByActionId(abm[mk], actionId, date, completed);
    if (r.updated) {
      abm[mk] = r.list;
      updated = true;
    }
  }

  // 2) Nếu chưa thấy, tìm trong mọi tháng (vì UI có thể đang hiển thị tháng khác)
  if (!updated) {
    for (const key of Object.keys(abm)) {
      const list = abm[key];
      if (!Array.isArray(list)) continue;
      const r = updateListByActionId(list, actionId, date, completed);
      if (r.updated) {
        abm[key] = r.list;
        updated = true;
        break;
      }
    }
  }

  // 3) Backward-compat: nếu vẫn chưa thấy, update activeActions (cũ)
  const active: StudyAction[] = Array.isArray(student.activeActions) ? student.activeActions : [];
  if (!updated) {
    const r = updateListByActionId(active, actionId, date, completed);
    if (r.updated) {
      student.activeActions = r.list;
      updated = true;
    }
  }

  if (!updated) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  // persist
  if (Object.keys(abm).length > 0) {
    student.actionsByMonth = abm;

    // giữ behavior cũ: activeActions bám theo tháng đang tick (nếu có)
    if (mk && Array.isArray(abm[mk])) {
      student.activeActions = abm[mk];
    }
  }

  const nextStudents = [...students];
  nextStudents[sIdx] = student;
  await setAppState({ students: nextStudents });

  return NextResponse.json({ student });
}
