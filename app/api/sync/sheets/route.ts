// app/api/sync/sheets/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

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

type SyncMode = "new_only" | "months" | "overwrite";

async function fetchFromAppsScript(sheetName: string): Promise<any[]> {
  const scriptUrl = process.env.APPS_SCRIPT_URL; // URL Web App mới
  if (!scriptUrl) throw new Error("Missing env: APPS_SCRIPT_URL");

  // Call Apps Script: ?action=get_data&sheet=SHEET_NAME
  const url = `${scriptUrl}?action=get_data&sheet=${sheetName}`;
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });

  if (!res.ok) throw new Error(`Apps Script fetch failed: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(`Apps Script error: ${json.error}`);

  return json.data || [];
}

function normalizeRows(rows: any[][]): Student[] {
  if (rows.length < 3) return [];

  const rawMonthRow = rows[0] || [];
  const headerRow = rows[1] || [];

  const norm = (v: any) => String(v ?? "").trim().toUpperCase();
  const headerNorm = headerRow.map(norm);

  // --- REPAIR: Forward fill month Row (Handle merged cells) ---
  const monthRow: string[] = [];
  let currentMonth = "";
  for (let i = 0; i < rawMonthRow.length; i++) {
    const v = String(rawMonthRow[i] || "").trim().replace(".", "-");
    // Flexible month regex: YYYY-MM or YYYY.MM
    if (/^\d{4}[-.]\d{2}$/.test(v)) {
      currentMonth = v.replace(".", "-");
    }
    monthRow[i] = currentMonth;
  }

  // Identify available months from processed monthRow
  const monthKeysAll = Array.from(new Set(monthRow.filter(m => m !== ""))).sort();

  const getCol = (mk: string, subjNorm: string) => {
    for (let i = 0; i < monthRow.length; i++) {
      // Fuzzy match subject: "TOÁN" matches "Môn Toán", "Toán 9"...
      if (monthRow[i] === mk && (headerNorm[i] === subjNorm || headerNorm[i].includes(subjNorm))) return i;
    }
    return -1;
  };

  const idxMhs = findIdx(["MHS", "MA HS", "MSHS", "MÃ HS"], headerNorm);
  const idxName = findIdx(["HỌ VÀ TÊN", "HO VA TEN", "NAME", "QUY DANH"], headerNorm);
  const idxClass = findIdx(["LỚP", "LOP", "CLASS"], headerNorm);

  if (idxMhs < 0) return [];

  const students: Student[] = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const mhs = String(row[idxMhs] || "").trim();
    if (!mhs) continue;

    const name = idxName >= 0 ? String(row[idxName] || "Unknown").trim() : "Unknown";
    const className = idxClass >= 0 ? String(row[idxClass] || "").trim() : "";

    const student: Student = {
      mhs, name, class: className,
      scores: [],
      activeActions: [],
      actionsByMonth: {}
    };

    monthKeysAll.forEach(mk => {
      const cMath = getCol(mk, "TOÁN");
      const cLit = getCol(mk, "NGỮ VĂN");
      const cEng = getCol(mk, "TIẾNG ANH");

      const parseVal = (idx: number) => {
        if (idx < 0) return null;
        const v = String(row[idx] || "").replace(",", ".");
        const n = parseFloat(v);
        // CRITICAL FIX: Scores can be > 10 in some scales. Set limit to 20.
        return (Number.isFinite(n) && n >= 0 && n <= 20) ? n : null;
      };

      const math = parseVal(cMath);
      const lit = parseVal(cLit);
      const eng = parseVal(cEng);

      if (math !== null || lit !== null || eng !== null) {
        student.scores.push({ month: mk, math, lit, eng });
      }
    });

    student.scores.sort((a, b) => a.month.localeCompare(b.month));
    students.push(student);
  }

  return students;
}

function findIdx(candidates: string[], headers: string[]) {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const sheetName = body.sheetName || "DIEM_2526"; // Mặc định năm hiện tại
    const mode = body.mode || "new_only";

    // 1. Fetch data from Apps Script
    const rawData = await fetchFromAppsScript(sheetName);
    const newStudents = normalizeRows(rawData);

    if (newStudents.length === 0) {
      return NextResponse.json({ ok: false, error: "No student data found in sheet " + sheetName });
    }

    // 2. Load old state from "main"
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: oldData } = await supabase
      .from("app_state")
      .select("students_json")
      .eq("id", "main")
      .maybeSingle();

    const oldStudents = (oldData?.students_json?.students as Student[]) || [];
    const oldMap = new Map<string, Student>();

    oldStudents.forEach(s => {
      const key = String(s.mhs || "").trim().toUpperCase();
      const existing = oldMap.get(key);
      if (!existing) {
        oldMap.set(key, s);
      } else {
        // Prefer record with data
        const currentHasData = !!(s.aiReport || Object.keys(s.actionsByMonth || {}).length > 0 || (s.scores && s.scores.length > 0));
        const existingHasData = !!(existing.aiReport || Object.keys(existing.actionsByMonth || {}).length > 0 || (existing.scores && existing.scores.length > 0));
        if (currentHasData && !existingHasData) oldMap.set(key, s);
      }
    });

    // 3. Merge Logic (Fixing the data loss issue)
    const mergedStudents = newStudents.map(ns => {
      const nsKey = String(ns.mhs || "").trim().toUpperCase();
      const old = oldMap.get(nsKey);

      if (!old) return ns;

      // --- REPAIR: MERGE SCORES MONTH BY MONTH ---
      const scoresMap = new Map<string, ScoreData>();
      // Seed with old scores
      if (Array.isArray(old.scores)) {
        old.scores.forEach(sc => scoresMap.set(sc.month, sc));
      }
      // Overwrite/Add with new scores from sheet
      if (Array.isArray(ns.scores)) {
        ns.scores.forEach(sc => scoresMap.set(sc.month, sc));
      }
      const mergedScores = Array.from(scoresMap.values()).sort((a, b) => a.month.localeCompare(b.month));

      return {
        ...ns,
        scores: mergedScores,
        aiReport: old.aiReport || ns.aiReport,
        actionsByMonth: old.actionsByMonth || ns.actionsByMonth || {},
        activeActions: old.activeActions || ns.activeActions || []
      };
    });

    // Keep students not in the latest sheet
    if (mode !== "overwrite") {
      const mergedMhsSet = new Set(mergedStudents.map(s => String(s.mhs).trim().toUpperCase()));
      for (const [key, old] of oldMap) {
        if (!mergedMhsSet.has(key)) mergedStudents.push(old);
      }
    }

    // 4. Save to Supabase - Always save to "main" for consistency
    const { error } = await supabase
      .from("app_state")
      .upsert({
        id: "main", // Always save to main for consistency with reads
        students_json: { students: mergedStudents, lastSync: new Date().toISOString() }
      });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, sheetName, savedTo: "main", students: mergedStudents.length });

  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
