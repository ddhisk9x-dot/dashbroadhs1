// app/api/sync/force-all/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

function normHeader(v: any): string {
    return String(v ?? "")
        .replace(/\uFEFF/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function isMonthKey(x: string) {
    return /^\d{4}-\d{2}$/.test(String(x || "").trim());
}

function parseMonthValue(v: any): string {
    const s = String(v || "").trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    if (/^\d{4}\.\d{2}$/.test(s)) return s.replace(".", "-");
    const isoMatch = s.match(/^(\d{4})-(\d{2})-\d{2}T/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
    return "";
}

function parseScoreValue(v: any): number | null {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v).trim();
    const n = parseFloat(s.replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 15) return n;
    const isoMatch = s.match(/^\d{4}-(\d{2})-(\d{2})T/);
    if (isoMatch) {
        const month = parseInt(isoMatch[1], 10);
        const day = parseInt(isoMatch[2], 10);
        const recoveredScore = day + month / 10;
        if (recoveredScore >= 0 && recoveredScore <= 15) return recoveredScore;
    }
    return null;
}

type ScoreData = { month: string; math: number | null; lit: number | null; eng: number | null };
type Student = {
    mhs: string;
    name: string;
    class: string;
    scores: ScoreData[];
    aiReport?: any;
    actionsByMonth?: Record<string, any[]>;
    activeActions?: any[];
};

async function fetchFromAppsScript(sheetName: string): Promise<any[][]> {
    const baseUrl = process.env.APPS_SCRIPT_URL;
    if (!baseUrl) throw new Error("Missing env: APPS_SCRIPT_URL");
    const url = `${baseUrl}?action=get_data&sheet=${encodeURIComponent(sheetName)}`;
    const resp = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!resp.ok) throw new Error(`Apps Script fetch failed: ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Apps Script returned error");
    return json.data;
}

export async function POST(req: Request) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

    try {
        const rows = await fetchFromAppsScript("DIEM_2526");
        if (rows.length < 3) throw new Error("Sheet must have 2 header rows + data rows");

        const monthRow = rows[0] ?? [];
        const headerRow = rows[1] ?? [];
        const header2 = headerRow.map(normHeader);

        const idxMhs = header2.indexOf("MHS");
        const idxName = header2.findIndex(h => h.includes("HỌ") && h.includes("TÊN"));
        const idxClass = header2.findIndex(h => h === "LỚP" || h === "LOP");

        if (idxMhs < 0) throw new Error("Missing column: MHS");

        // Forward fill với parse ISO
        const filledMonthRow: string[] = [];
        let currentMonth = "";
        for (let i = 0; i < monthRow.length; i++) {
            const parsed = parseMonthValue(monthRow[i]);
            if (parsed && isMonthKey(parsed)) currentMonth = parsed;
            filledMonthRow[i] = currentMonth;
        }

        const monthKeysAll = Array.from(new Set(filledMonthRow.filter(isMonthKey))).sort();

        const getCol = (monthKey: string, subjectUpper: string) => {
            const subj = normHeader(subjectUpper);
            for (let i = 0; i < filledMonthRow.length; i++) {
                if (filledMonthRow[i] !== monthKey) continue;
                if (header2[i] === subj || header2[i].includes(subj)) return i;
            }
            return -1;
        };

        // Load old data to preserve aiReport and actions
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: oldState } = await supabase
            .from("app_state")
            .select("students_json")
            .eq("id", "main")
            .maybeSingle();

        const oldStudents: Student[] = (oldState?.students_json?.students as Student[]) ?? [];
        const oldMap = new Map<string, Student>();
        oldStudents.forEach(s => oldMap.set(String(s.mhs).trim(), s));

        // Build new students with ALL months
        const studentMap = new Map<string, Student>();

        for (let r = 2; r < rows.length; r++) {
            const row = rows[r] ?? [];
            const mhs = String(row[idxMhs] ?? "").trim();
            if (!mhs) continue;

            const name = idxName >= 0 ? String(row[idxName] ?? "").trim() || "Unknown" : "Unknown";
            const className = idxClass >= 0 ? String(row[idxClass] ?? "").trim() : "";

            let st = studentMap.get(mhs);
            if (!st) {
                const old = oldMap.get(mhs);
                st = {
                    mhs,
                    name,
                    class: className,
                    scores: [],
                    aiReport: old?.aiReport,
                    actionsByMonth: old?.actionsByMonth || {},
                    activeActions: old?.activeActions || []
                };
                studentMap.set(mhs, st);
            }

            for (const mk of monthKeysAll) {
                const cMath = getCol(mk, "TOÁN");
                const cLit = getCol(mk, "NGỮ VĂN");
                const cEng = getCol(mk, "TIẾNG ANH");

                if (cMath < 0 && cLit < 0 && cEng < 0) continue;

                const math = cMath >= 0 ? parseScoreValue(row[cMath]) : null;
                const lit = cLit >= 0 ? parseScoreValue(row[cLit]) : null;
                const eng = cEng >= 0 ? parseScoreValue(row[cEng]) : null;

                if (math === null && lit === null && eng === null) continue;

                const entry: ScoreData = { month: mk, math, lit, eng };
                const exist = st.scores.findIndex(s => s.month === mk);
                if (exist >= 0) st.scores[exist] = entry;
                else st.scores.push(entry);
            }
        }

        const newStudents = Array.from(studentMap.values());
        newStudents.forEach(s => s.scores.sort((a, b) => a.month.localeCompare(b.month)));

        const { error } = await supabase
            .from("app_state")
            .upsert({ id: "main", students_json: { students: newStudents } }, { onConflict: "id" });

        if (error) throw new Error(error.message);

        return NextResponse.json({
            ok: true,
            message: "Force synced ALL months, overwriting old data",
            monthsSynced: monthKeysAll,
            students: newStudents.length,
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    }
}
