// app/api/debug/ticks/route.ts - Debug endpoint to check student_ticks table
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mhs = searchParams.get("mhs") || String(session.mhs || "").trim();

    if (!mhs) {
      return NextResponse.json({ ok: false, error: "Missing mhs param" }, { status: 400 });
    }

    // 1. Read raw ticks from student_ticks table
    const { data: ticks, error: tickErr } = await supabase
      .from("student_ticks")
      .select("*")
      .eq("mhs", mhs.trim())
      .order("tick_date", { ascending: false })
      .limit(50);

    // 2. Read the student's actions from app_state blob
    const { data: appData } = await supabase
      .from("app_state")
      .select("id, students_json")
      .limit(5);

    let studentActions: any = null;
    if (appData) {
      for (const row of appData) {
        const students = (row.students_json as any)?.students || [];
        const found = students.find((s: any) => String(s.mhs || "").trim() === mhs.trim());
        if (found) {
          studentActions = {
            sheetId: row.id,
            activeActionIds: (found.activeActions || []).map((a: any) => a.id),
            actionsByMonth: Object.fromEntries(
              Object.entries(found.actionsByMonth || {}).map(([k, v]: [string, any]) => [
                k,
                (v || []).map((a: any) => ({ id: a.id, desc: a.description?.slice(0, 50) }))
              ])
            ),
          };
          break;
        }
      }
    }

    // 3. Check table structure
    const { data: sampleRow, error: structErr } = await supabase
      .from("student_ticks")
      .select("*")
      .limit(1);

    return NextResponse.json({
      ok: true,
      mhs,
      tickCount: ticks?.length || 0,
      ticks: ticks || [],
      tickError: tickErr?.message || null,
      studentActions,
      tableStructure: sampleRow?.[0] ? Object.keys(sampleRow[0]) : null,
      structError: structErr?.message || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Debug failed" }, { status: 500 });
  }
}
