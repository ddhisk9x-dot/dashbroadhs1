// app/api/debug/data/route.ts - Temporary debug endpoint to check raw data
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

        const supabase = createClient(supabaseUrl, serviceKey);

        const { searchParams } = new URL(req.url);
        const sheetId = searchParams.get("sheet") || "DIEM_2526";
        const limit = parseInt(searchParams.get("limit") || "5");

        // 1. Lấy dữ liệu từ Supabase
        const { data, error } = await supabase
            .from("app_state")
            .select("*")
            .eq("id", sheetId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) return NextResponse.json({ ok: false, error: `No data found for ${sheetId}` });

        const students = (data.students_json?.students as any[]) || [];

        // 2. Sample data để debug
        const sample = students.slice(0, limit).map(s => ({
            mhs: s.mhs,
            name: s.name,
            class: s.class,
            scoreCount: Array.isArray(s.scores) ? s.scores.length : 0,
            scores: s.scores,
            hasAI: !!s.aiReport,
            hasActions: Object.keys(s.actionsByMonth || {}).length > 0 || (s.activeActions?.length || 0) > 0
        }));

        // 3. Thống kê
        const classes = [...new Set(students.map(s => s.class || "UNKNOWN"))].sort();
        const studentsByClass: Record<string, number> = {};
        students.forEach(s => {
            const c = s.class || "UNKNOWN";
            studentsByClass[c] = (studentsByClass[c] || 0) + 1;
        });

        return NextResponse.json({
            ok: true,
            sheetId,
            totalStudents: students.length,
            classes,
            studentsByClass,
            sample,
            updated_at: data.updated_at
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Debug failed" }, { status: 500 });
    }
}
