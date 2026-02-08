// app/api/admin/recover-data/route.ts
// EMERGENCY RECOVERY ENDPOINT - Tìm và phục hồi dữ liệu AI/Tick bị mất
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Student = {
    mhs: string;
    name: string;
    class: string;
    scores?: any[];
    aiReport?: any;
    actionsByMonth?: Record<string, any[]>;
    activeActions?: any[];
};

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // 1. Lấy TẤT CẢ các bản ghi trong app_state
        const { data: allRecords, error } = await supabase
            .from("app_state")
            .select("id, students_json, updated_at");

        if (error) throw new Error(error.message);

        if (!allRecords || allRecords.length === 0) {
            return NextResponse.json({ ok: false, error: "No records found in database" });
        }

        // 2. Phân tích từng bản ghi, tìm dữ liệu có giá trị
        const analysis: any[] = [];
        const allStudentsWithData: Student[] = [];

        for (const record of allRecords) {
            const students = (record.students_json?.students as Student[]) || [];

            let studentsWithAI = 0;
            let studentsWithTicks = 0;
            let totalTicks = 0;

            for (const student of students) {
                const hasAI = !!student.aiReport;
                const hasTicks = Object.keys(student.actionsByMonth || {}).length > 0;

                if (hasAI) studentsWithAI++;
                if (hasTicks) {
                    studentsWithTicks++;
                    // Count total ticks
                    Object.values(student.actionsByMonth || {}).forEach((actions: any[]) => {
                        actions.forEach((action: any) => {
                            const ticks = Array.isArray(action?.ticks) ? action.ticks : [];
                            totalTicks += ticks.filter((t: any) => t?.completed).length;
                        });
                    });
                }

                // Thu thập học sinh có dữ liệu
                if (hasAI || hasTicks) {
                    allStudentsWithData.push({
                        ...student,
                        // Đánh dấu nguồn gốc
                        _source: record.id,
                        _updatedAt: record.updated_at
                    } as any);
                }
            }

            analysis.push({
                id: record.id,
                updatedAt: record.updated_at,
                totalStudents: students.length,
                studentsWithAI,
                studentsWithTicks,
                totalTicks,
                hasValuableData: studentsWithAI > 0 || studentsWithTicks > 0
            });
        }

        // 3. Tạo bản đồ MHS -> Dữ liệu tốt nhất
        // Ưu tiên: Bản ghi có nhiều dữ liệu nhất
        const recoveryMap = new Map<string, Student>();

        for (const student of allStudentsWithData) {
            const key = String(student.mhs || "").trim().toUpperCase();
            const existing = recoveryMap.get(key);

            if (!existing) {
                recoveryMap.set(key, student);
                continue;
            }

            // So sánh độ "giàu" dữ liệu
            const existingRichness = (existing.aiReport ? 1 : 0) + Object.keys(existing.actionsByMonth || {}).length;
            const currentRichness = (student.aiReport ? 1 : 0) + Object.keys(student.actionsByMonth || {}).length;

            if (currentRichness > existingRichness) {
                recoveryMap.set(key, student);
            }
        }

        return NextResponse.json({
            ok: true,
            summary: {
                totalRecords: allRecords.length,
                recordsWithData: analysis.filter(a => a.hasValuableData).length,
                totalStudentsWithRecoverableData: recoveryMap.size
            },
            analysis,
            recoverableStudents: Array.from(recoveryMap.values()).map(s => ({
                mhs: s.mhs,
                name: s.name,
                class: s.class,
                hasAI: !!s.aiReport,
                actionMonths: Object.keys(s.actionsByMonth || {}),
                source: (s as any)._source
            }))
        });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}

// POST: Thực hiện khôi phục dữ liệu
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const targetSheet = body.targetSheet || "DIEM_2526";
        const sourceSheet = body.sourceSheet; // Optional: Chỉ định nguồn dữ liệu cụ thể (VD: "main")

        const supabaseUrl = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // 1. Lấy dữ liệu hiện tại của targetSheet
        const { data: targetData } = await supabase
            .from("app_state")
            .select("students_json")
            .eq("id", targetSheet)
            .maybeSingle();

        const currentStudents = (targetData?.students_json?.students as Student[]) || [];

        // 2. Lấy dữ liệu từ nguồn (nếu có chỉ định) hoặc tất cả
        let sourceRecords: any[] = [];
        if (sourceSheet) {
            const { data } = await supabase.from("app_state").select("students_json").eq("id", sourceSheet).maybeSingle();
            if (data) sourceRecords = [data];
        } else {
            const { data } = await supabase.from("app_state").select("id, students_json");
            sourceRecords = data || [];
        }

        // 3. Xây dựng bản đồ phục hồi từ tất cả các nguồn
        const recoveryMap = new Map<string, { aiReport?: any; actionsByMonth?: any; activeActions?: any[] }>();

        for (const record of sourceRecords) {
            const students = (record.students_json?.students as Student[]) || [];
            for (const student of students) {
                const key = String(student.mhs || "").trim().toUpperCase();

                const existing = recoveryMap.get(key) || {};

                // Merge: Giữ lại dữ liệu tốt nhất
                if (student.aiReport && !existing.aiReport) {
                    existing.aiReport = student.aiReport;
                }
                if (student.actionsByMonth && Object.keys(student.actionsByMonth).length > 0) {
                    existing.actionsByMonth = {
                        ...(existing.actionsByMonth || {}),
                        ...student.actionsByMonth
                    };
                }
                if (student.activeActions && student.activeActions.length > 0) {
                    existing.activeActions = student.activeActions;
                }

                if (Object.keys(existing).length > 0) {
                    recoveryMap.set(key, existing);
                }
            }
        }

        // 4. Áp dụng vào danh sách hiện tại
        let recoveredCount = 0;
        const updatedStudents = currentStudents.map(student => {
            const key = String(student.mhs || "").trim().toUpperCase();
            const recovery = recoveryMap.get(key);

            if (!recovery) return student;

            recoveredCount++;
            return {
                ...student,
                aiReport: recovery.aiReport || student.aiReport,
                actionsByMonth: recovery.actionsByMonth || student.actionsByMonth || {},
                activeActions: recovery.activeActions || student.activeActions || []
            };
        });

        // 5. Lưu lại
        const { error: saveError } = await supabase
            .from("app_state")
            .upsert({
                id: targetSheet,
                students_json: { students: updatedStudents, lastSync: new Date().toISOString(), recovered: true }
            });

        if (saveError) throw new Error(saveError.message);

        return NextResponse.json({
            ok: true,
            message: `Đã phục hồi dữ liệu cho ${recoveredCount} học sinh vào ${targetSheet}`,
            recoveredCount,
            totalStudents: updatedStudents.length
        });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
