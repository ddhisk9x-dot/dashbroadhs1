// app/api/debug/leaderboard/route.ts - Debug: raw tick counts from DB
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);

  // 1. Count all ticks from DB directly (source of truth)
  const { data: allTicks, error } = await supabase
    .from("student_ticks")
    .select("mhs, tick_date, action_id, completed")
    .eq("completed", true)
    .gte("tick_date", month + "-01")
    .lte("tick_date", month + "-31");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  // Count unique action+date combos per student
  const byMhs: Record<string, Set<string>> = {};
  (allTicks || []).forEach(t => {
    if (!byMhs[t.mhs]) byMhs[t.mhs] = new Set();
    byMhs[t.mhs].add(t.tick_date + "|" + t.action_id);
  });

  const ranked = Object.entries(byMhs)
    .map(([mhs, keys]) => ({ mhs, tickCount: keys.size }))
    .sort((a, b) => b.tickCount - a.tickCount)
    .slice(0, 20);

  // 2. Also get student names from app_state
  const { data: appData } = await supabase
    .from("app_state")
    .select("students_json")
    .limit(10);

  const nameMap: Record<string, { name: string; class: string }> = {};
  (appData || []).forEach((row: any) => {
    const students = row.students_json?.students || [];
    students.forEach((s: any) => {
      nameMap[String(s.mhs).trim()] = { name: s.name, class: s.class };
    });
  });

  const result = ranked.map(r => ({
    ...r,
    name: nameMap[r.mhs]?.name || "?",
    class: nameMap[r.mhs]?.class || "?",
  }));

  return NextResponse.json({
    ok: true,
    month,
    totalTicksInMonth: allTicks?.length || 0,
    uniqueStudentsWithTicks: Object.keys(byMhs).length,
    top20: result,
  });
}
