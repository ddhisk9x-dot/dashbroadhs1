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

function normalizeRows(rows: any[]): Student[] {
  return rows.map(r => {
    // Map từ field tiếng Việt (Apps Script trả về theo header sheet) sang field Student

    const mhs = String(r["MHS"] || "").trim();
    if (!mhs) return null;

    const name = String(r["HỌ VÀ TÊN"] || "Unknown").trim();
    const className = String(r["LỚP"] || "").trim();

    const student: Student = {
      mhs, name, class: className,
      scores: [],
      activeActions: [],
      actionsByMonth: {}
    };

    // Parse scores
    // Duyệt qua các key của row để tìm pattern "YYYY-MM SUBJECT"
    Object.keys(r).forEach(key => {
      // Regex: 2025-09 TOÁN
      const match = key.match(/^(\d{4}-\d{2})\s+(TOÁN|NGỮ VĂN|TIẾNG ANH)$/i);
      if (match) {
        const month = match[1];
        const subj = match[2].toUpperCase();
        // Xử lý chuỗi số có dấu phẩy (Excel VN)
        const valStr = String(r[key]).replace(",", ".");
        const val = parseFloat(valStr);

        // SAFETY NET: Chỉ chấp nhận điểm hợp lệ (0-20)
        // Loại bỏ các giá trị rác như ngày tháng, tổng điểm, số serial...
        if (Number.isFinite(val) && val >= 0 && val <= 20) {
          let sc = student.scores.find(s => s.month === month);
          if (!sc) {
            sc = { month, math: null, lit: null, eng: null };
            student.scores.push(sc);
          }

          if (subj === "TOÁN") sc.math = val;
          else if (subj === "NGỮ VĂN") sc.lit = val;
          else if (subj === "TIẾNG ANH") sc.eng = val;
        }
      }
    });

    // Sort scores
    student.scores.sort((a, b) => a.month.localeCompare(b.month));

    return student;
  }).filter(Boolean) as Student[];
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

    // 2. Load old state (from same sheet ID)
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: oldData } = await supabase
      .from("app_state")
      .select("students_json")
      .eq("id", sheetName)
      .maybeSingle();

    const oldStudents = (oldData?.students_json?.students as Student[]) || [];
    // Normalize old keys for robust matching
    // SMART RESCUE: If duplicates exist (String vs Number MHS), prefer the one WITH data.
    const oldMap = new Map<string, Student>();

    oldStudents.forEach(s => {
      const key = String(s.mhs || "").trim().toUpperCase();
      const existing = oldMap.get(key);

      // If no entry yet, set it
      if (!existing) {
        oldMap.set(key, s);
        return;
      }

      // If duplicate found, compare "richness"
      const existingHasData = !!(existing.aiReport || Object.keys(existing.actionsByMonth || {}).length > 0);
      const currentHasData = !!(s.aiReport || Object.keys(s.actionsByMonth || {}).length > 0);

      // If current has data and existing doesn't, overwrite. 
      // If both have data, we usually keep the latest one (default), or maybe just keep existing?
      // Let's bias towards the one that LOOKS like the original String type if data is equal?
      // Priority: Has Data > Is String type > Index

      if (currentHasData && !existingHasData) {
        oldMap.set(key, s);
      }
      // If both have data, keep existing (earlier one might be better? or later? Hard to say. 
      // Assuming "Bad Sync" added new empty records LATER, we assume the EARLIER ones (or the ones already set) are better if they have data.
      // Actually, if existing has data, we DON'T overwrite with an empty one.
    });

    // 3. Merge Logic (Preserve AI Reports & Actions)
    const mergedStudents = newStudents.map(ns => {
      // Normalize new key
      const nsKey = String(ns.mhs || "").trim().toUpperCase();
      const old = oldMap.get(nsKey);

      if (!old) return ns;

      return {
        ...ns,
        // Ensure we explicitly keep MHS format if needed, OR keep new one.
        // Identify & Merge Metadata
        aiReport: old.aiReport || ns.aiReport, // Prefer old AI, but if ns has it (unlikely), keep it
        actionsByMonth: old.actionsByMonth || ns.actionsByMonth || {},
        activeActions: old.activeActions || ns.activeActions || []
      };
    });

    // Option: Giữ lại học sinh cũ đã bị xóa khỏi sheet?
    if (mode !== "overwrite") {
      // Create a set of MHS present in mergedStudents for fast lookup
      const mergedMhsSet = new Set(mergedStudents.map(s => String(s.mhs).trim().toUpperCase()));

      for (const [key, old] of oldMap) {
        if (!mergedMhsSet.has(key)) {
          // Only push if it has valuable data? Or just keep it?
          mergedStudents.push(old);
        }
      }
    }

    // 4. Save to Supabase
    const { error } = await supabase
      .from("app_state")
      .upsert({
        id: sheetName, // Save với ID là tên sheet
        students_json: { students: mergedStudents, lastSync: new Date().toISOString() }
      });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, sheetName, students: mergedStudents.length });

  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
