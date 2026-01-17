import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function isMonthKey(m: string) {
  return /^\d{4}-\d{2}$/.test(String(m || "").trim());
}

function nextMonthKey(monthKey: string): string {
  const m = String(monthKey || "").trim();
  if (!isMonthKey(m)) return new Date().toISOString().slice(0, 7);
  const [yStr, moStr] = m.split("-");
  let y = Number(yStr);
  let mo = Number(moStr);
  mo += 1;
  if (mo === 13) {
    mo = 1;
    y += 1;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

function latestScoreMonth(scores: any[]): string {
  if (!Array.isArray(scores) || scores.length === 0) return new Date().toISOString().slice(0, 7);
  const last = String(scores[scores.length - 1]?.month || "").trim();
  return isMonthKey(last) ? last : new Date().toISOString().slice(0, 7);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { mhs, report, actions, monthKey } = await req.json().catch(() => ({}));
  if (!mhs || !report || !Array.isArray(actions)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const state = await getAppState();
  const idx = (state.students || []).findIndex((s: any) => String(s.mhs).trim() === String(mhs).trim());
  if (idx < 0) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

  const updated: any = { ...(state.students[idx] || {}) };
  updated.aiReport = report;

  const taskMonth =
    isMonthKey(monthKey) ? String(monthKey).trim() : nextMonthKey(latestScoreMonth(updated.scores || []));

  // write into actionsByMonth
  const abm = updated.actionsByMonth && typeof updated.actionsByMonth === "object" ? updated.actionsByMonth : {};
  abm[taskMonth] = actions;
  updated.actionsByMonth = abm;

  // keep backward compat: activeActions mirrors "current task month"
  updated.activeActions = actions;

  const nextStudents = [...state.students];
  nextStudents[idx] = updated;

  await setAppState({ students: nextStudents });

  return NextResponse.json({ ok: true, taskMonth });
}
