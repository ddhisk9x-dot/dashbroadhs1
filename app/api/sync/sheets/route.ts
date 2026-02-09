// app/api/sync/sheets/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import { SCHOOL_YEARS } from "@/lib/schoolConfig";

export const runtime = "nodejs";

function normHeader(v: any): string {
  return String(v ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumberOrNull(v: any): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

function isMonthKey(x: string) {
  return /^\d{4}-\d{2}$/.test(String(x || "").trim());
}

function isoMonthNow() {
  return new Date().toISOString().slice(0, 7);
}

function nextMonthKey(monthKey: string): string {
  const mk = String(monthKey || "").trim();
  if (!isMonthKey(mk)) return isoMonthNow();
  const [yStr, mStr] = mk.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m += 1;
  if (m === 13) { m = 1; y += 1; }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function getLatestScoreMonth(scores: ScoreData[] | undefined): string {
  const arr = Array.isArray(scores) ? scores : [];
  const last = arr[arr.length - 1];
  const mk = String(last?.month || "").trim();
  return isMonthKey(mk) ? mk : isoMonthNow();
}

function getTaskMonthFromScores(scores: ScoreData[] | undefined): string {
  return nextMonthKey(getLatestScoreMonth(scores));
}

function normalizeActionsStorage(st: Student): Student {
  const s: Student = { ...st };
  s.actionsByMonth = s.actionsByMonth && typeof s.actionsByMonth === "object" ? s.actionsByMonth : {};
  const aa = Array.isArray(s.activeActions) ? s.activeActions : [];
  const taskMonth = getTaskMonthFromScores(s.scores);

  if (aa.length) {
    if (!Array.isArray(s.actionsByMonth![taskMonth]) || s.actionsByMonth![taskMonth]!.length === 0) {
      s.actionsByMonth![taskMonth] = aa;
    }
  }

  if (Array.isArray(s.actionsByMonth![taskMonth]) && s.actionsByMonth![taskMonth]!.length > 0) {
    s.activeActions = s.actionsByMonth![taskMonth];
  } else {
    const keys = Object.keys(s.actionsByMonth || {}).filter((k) => isMonthKey(k)).sort();
    const latestTask = keys[keys.length - 1];
    if (latestTask && Array.isArray(s.actionsByMonth![latestTask])) s.activeActions = s.actionsByMonth![latestTask];
    else s.activeActions = aa;
  }
  return s;
}

type SyncMode = "new_only" | "months";
type SyncOpts = { mode?: SyncMode; selectedMonths?: string[]; sheetName?: string };

async function fetchFromAppsScript(sheetName: string): Promise<any[][]> {
  const baseUrl = process.env.APPS_SCRIPT_URL;
  if (!baseUrl) throw new Error("Missing env: APPS_SCRIPT_URL");

  const url = `${baseUrl}?action=get_data&sheet=${encodeURIComponent(sheetName)}`;
  const resp = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!resp.ok) throw new Error(`Apps Script fetch failed: ${resp.status}`);

  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || "Apps Script returned error");
  if (!Array.isArray(json.data)) throw new Error("Apps Script did not return data array");

  return json.data;
}

// Parse various month formats including ISO dates
function parseMonthValue(v: any): string {
  const s = String(v || "").trim();

  // Already in YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  // Format: YYYY.MM
  if (/^\d{4}\.\d{2}$/.test(s)) return s.replace(".", "-");

  // ISO date format: 2025-11-01T07:00:00.000Z
  const isoMatch = s.match(/^(\d{4})-(\d{2})-\d{2}T/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  return "";
}

// Parse score that might have been converted to a date by Google Sheets
function parseScoreValue(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;

  const s = String(v).trim();

  // Normal number
  const n = parseFloat(s.replace(",", "."));
  if (Number.isFinite(n) && n >= 0 && n <= 15) return n;

  // Check if it's an ISO date that should be a score (e.g., "11.3" became "2026-03-11")
  // Pattern: YYYY-MM-DDT... where DD might be the decimal and MM the integer part
  const isoMatch = s.match(/^\d{4}-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    // Try to recover: MM.DD format (e.g., 03-11 = 3.11? No, more likely 11.3)
    // Actually when you type "11.3" in Google Sheets formatted as Date, 
    // it interprets as "11/3/current_year" = March 11
    // So month=3, day=11 means the original was likely "11.3" (reversed)
    const month = parseInt(isoMatch[1], 10);
    const day = parseInt(isoMatch[2], 10);
    // The score was likely: day.month or day + month/10
    const recoveredScore = day + month / 10;
    if (recoveredScore >= 0 && recoveredScore <= 15) return recoveredScore;
  }

  return null;
}

// ... existing helpers ...

async function doSyncFromSheet(opts?: SyncOpts) {
  const mode: SyncMode = opts?.mode ?? "new_only";
  const selectedMonths: string[] = Array.isArray(opts?.selectedMonths) ? opts!.selectedMonths! : [];
  const sheetName = opts?.sheetName || "DIEM_2526";

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  // Lookup Config DB ID
  let dbId = "main";
  for (const y of SCHOOL_YEARS) {
    const s = y.sheets.find((sh) => sh.sheetName === sheetName);
    if (s) {
      dbId = s.dbId;
      break;
    }
  }

  // 1) Fetch từ Apps Script
  const rawData = await fetchFromAppsScript(sheetName);

  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error(`Apps Script returned NO DATA for sheet "${sheetName}". Please check if the sheet exists and has data.`);
  }

  // Determine Data Format
  let isObjectFormat = false;
  if (typeof rawData[0] === 'object' && !Array.isArray(rawData[0])) {
    isObjectFormat = true;
  } else if (rawData.length < 3) {
    throw new Error(`Sheet too short (rows=${rawData.length}) for 2D Array format. Need at least headers.`);
  }

  let monthKeysAll: string[] = [];
  let newStudents: Student[] = [];

  // ==========================================
  // PARSING STRATEGY
  // ==========================================
  if (isObjectFormat) {
    // --- OBJECT FORMAT (User's Current Script) ---
    const studentsData = rawData;

    const allMonths = new Set<string>();
    // Scan first few rows to find month keys "YYYY-MM SUBJECT"
    // Use regex /^(\d{4}-\d{2})/ to capture date at start of key
    studentsData.slice(0, 15).forEach((st: any) => {
      Object.keys(st).forEach(k => {
        const match = k.trim().match(/^(\d{4}-\d{2})/);
        if (match) allMonths.add(match[1]);
      });
    });
    monthKeysAll = Array.from(allMonths).sort();

    // Debug check
    if (monthKeysAll.length === 0) {
      const sample = studentsData[0] ? Object.keys(studentsData[0]).slice(0, 10).join(", ") : "Empty";
      throw new Error(`No months found in Object format. Sample keys: [${sample}]`);
    }

    // Parse Students
    newStudents = studentsData.map((st: any) => {
      const mhs = String(st.MHS || st["MÃ HS"] || "").trim();
      const name = String(st["HỌ VÀ TÊN"] || st.NAME || "").trim();
      const cls = String(st["LỚP"] || st.CLASS || "").trim();

      if (!mhs) return null;

      const scores: ScoreData[] = [];
      monthKeysAll.forEach(m => {
        // Try variations: "2025-08 TOAN" or "2025-08 TOÁN"
        // RegExp to find key starting with m and containing subject
        // Simple strict check first for performance
        const mathVal = parseScoreValue(st[`${m} TOÁN`] ?? st[`${m} TOAN`]);
        const litVal = parseScoreValue(st[`${m} NGỮ VĂN`] ?? st[`${m} VAN`] ?? st[`${m} NGU VAN`]);
        const engVal = parseScoreValue(st[`${m} TIẾNG ANH`] ?? st[`${m} ANH`] ?? st[`${m} TIENG ANH`]);

        if (mathVal !== null || litVal !== null || engVal !== null) {
          scores.push({ month: m, math: mathVal, lit: litVal, eng: engVal });
        }
      });

      return {
        mhs,
        name: name || "Unknown",
        class: cls,
        scores,
        activeActions: [],
        actionsByMonth: {}
      } as Student;
    }).filter((x): x is Student => x !== null);

  } else {
    // --- 2D ARRAY FORMAT (Standard / Old Script) ---
    const rows = rawData;
    const monthRow = rows[0] ?? [];
    const headerRow = rows[1] ?? [];
    const header2 = headerRow.map(normHeader);

    const idxMhs = header2.indexOf("MHS");
    const idxName = header2.findIndex(h => h.includes("HỌ") && h.includes("TÊN"));
    const idxClass = header2.findIndex(h => h === "LỚP" || h === "LOP");

    if (idxMhs < 0) {
      const hPreview = headerRow.slice(0, 10).join("|");
      throw new Error(`Missing column MHS in 2D array. Header: ${hPreview}`);
    }

    const filledMonthRow: string[] = [];
    let currentMonth = "";
    for (let i = 0; i < monthRow.length; i++) {
      const val = monthRow[i];
      const parsed = parseMonthValue(val);
      // Only take strict YYYY-MM
      if (parsed && /^\d{4}-\d{2}$/.test(parsed)) currentMonth = parsed;
      filledMonthRow[i] = currentMonth;
    }
    monthKeysAll = Array.from(new Set(filledMonthRow.filter((x) => isMonthKey(x)))).sort();

    if (monthKeysAll.length === 0) {
      const mPreview = monthRow.slice(0, 10).join("|");
      throw new Error(`No months found in 2D Array. Row 1: [${mPreview}]`);
    }

    const getCol = (monthKey: string, subjectUpper: string) => {
      const subj = normHeader(subjectUpper);
      for (let i = 0; i < filledMonthRow.length; i++) {
        if (filledMonthRow[i] !== monthKey) continue;
        if (header2[i] === subj || header2[i].includes(subj)) return i;
      }
      return -1;
    };

    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const mhs = String(row[idxMhs] ?? "").trim();
      if (!mhs) continue;

      const name = idxName >= 0 ? String(row[idxName] ?? "").trim() : "Unknown";
      const cls = idxClass >= 0 ? String(row[idxClass] ?? "").trim() : "";

      const scores: ScoreData[] = [];
      for (const mk of monthKeysAll) {
        const cMath = getCol(mk, "TOÁN");
        const cLit = getCol(mk, "NGỮ VĂN");
        const cEng = getCol(mk, "TIẾNG ANH");

        if (cMath < 0 && cLit < 0 && cEng < 0) continue;

        const math = cMath >= 0 ? parseScoreValue(row[cMath]) : null;
        const lit = cLit >= 0 ? parseScoreValue(row[cLit]) : null;
        const eng = cEng >= 0 ? parseScoreValue(row[cEng]) : null;

        if (math !== null || lit !== null || eng !== null) {
          scores.push({ month: mk, math, lit, eng });
        }
      }
      newStudents.push({ mhs, name, class: cls, scores, activeActions: [], actionsByMonth: {} });
    }
  }

  // Common Logic: Identify what to sync
  const supabase = createClient(supabaseUrl, serviceKey);

  // 2) Load Old State
  const { data: oldState, error: oldErr } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", dbId)
    .maybeSingle();

  if (oldErr) throw new Error(oldErr.message);

  const oldStudentsRaw: Student[] = (oldState?.students_json?.students as Student[]) ?? [];
  const oldStudents: Student[] = oldStudentsRaw.map(normalizeActionsStorage);
  const oldMap = new Map<string, Student>();
  oldStudents.forEach((s) => oldMap.set(String(s.mhs).trim(), s));

  const oldMonths = new Set<string>();
  for (const s of oldStudents) {
    for (const sc of s.scores ?? []) oldMonths.add(sc.month);
  }

  let monthKeysToSync: string[] = monthKeysAll;
  const newMonthsDetected = monthKeysAll.filter((m) => !oldMonths.has(m));

  if (mode === "new_only") {
    monthKeysToSync = newMonthsDetected;
    // Also check for entirely new students even if no new month
    const incomingMhsSet = new Set(newStudents.map(s => s.mhs));
    const hasNewStudents = Array.from(incomingMhsSet).some(mhs => !oldMap.has(mhs));

    if (monthKeysToSync.length === 0 && hasNewStudents) {
      monthKeysToSync = monthKeysAll; // Force full sync if new students found
    }
  } else if (mode === "months") {
    if (selectedMonths.length > 0) {
      const selSet = new Set(selectedMonths);
      monthKeysToSync = monthKeysAll.filter(m => selSet.has(m));
    }
  }

  if (monthKeysToSync.length === 0) {
    return {
      ok: true,
      students: oldStudents.length,
      monthsAll: monthKeysAll,
      monthsSynced: [],
      newMonthsDetected,
      dbId
    };
  }

  // 3) MERGE LOGIC
  // We have newStudents (parsed from source) and oldStudents (from DB)
  // We need to merge scores based on monthKeysToSync

  const mergedStudents: Student[] = newStudents.map((ns) => {
    const old = oldMap.get(String(ns.mhs).trim());

    let scoresMerged: ScoreData[] = ns.scores ?? [];

    // If old student exists, we need to preserve scores of months NOT in sync list
    if (old?.scores?.length) {
      const replaceMonths = new Set(monthKeysToSync);
      const keepOldScores = old.scores.filter((sc) => !replaceMonths.has(sc.month));
      // ns.scores contains ALL months parsed from sheet usually.
      // But we should filter ns.scores to only include sync months?
      // Actually, if we re-parsed the sheet, ns.scores reflects the TOTAL state of the sheet for that student.
      // If we are in "overwrite" mode for specific months, we should take new scores for those months.

      // Let's take: 
      // 1. Old scores that are NOT in sync list (preserved history not in sheet?)
      // 2. New scores (from sheet) that ARE in sync list.

      const newScoresForSync = (ns.scores || []).filter(sc => replaceMonths.has(sc.month));

      scoresMerged = [...keepOldScores, ...newScoresForSync].sort((a, b) => a.month.localeCompare(b.month));
    } else {
      // New student entirely, take all parsed scores that are in sync list?
      // Or take all parsed scores?
      // If mode is new_only, monthKeysToSync might be limited.
      // But for a new student, we probably want all their history from the sheet.
      // Let's stick to strict sync list to be safe.
      const replaceMonths = new Set(monthKeysToSync);
      scoresMerged = (ns.scores || []).filter(sc => replaceMonths.has(sc.month)).sort((a, b) => a.month.localeCompare(b.month));
    }

    const oldABM = old?.actionsByMonth && typeof old.actionsByMonth === "object" ? old.actionsByMonth : {};
    const nsABM = ns.actionsByMonth && typeof ns.actionsByMonth === "object" ? ns.actionsByMonth : {};
    const mergedABM: Record<string, any[]> = { ...oldABM, ...nsABM };

    const merged: Student = {
      ...ns,
      scores: scoresMerged,
      aiReport: old?.aiReport ?? ns.aiReport,
      actionsByMonth: mergedABM,
    };

    // Helper to determine active task month - simplified
    const taskMonth = scoresMerged.length > 0 ? scoresMerged[scoresMerged.length - 1].month : "";

    if (taskMonth && Array.isArray(merged.actionsByMonth?.[taskMonth])) {
      merged.activeActions = merged.actionsByMonth![taskMonth];
    } else {
      merged.activeActions = old?.activeActions ?? ns.activeActions ?? [];
    }

    return normalizeActionsStorage(merged);
  });

  // 5) Keep old students not in new sheet
  for (const [mhs, old] of oldMap.entries()) {
    if (!mergedStudents.some((s) => s.mhs === mhs)) mergedStudents.push(old);
  }

  // 6) Save to app_state
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: dbId, students_json: { students: mergedStudents } }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  return {
    ok: true,
    mode,
    selectedMonths,
    monthsAll: monthKeysAll,
    monthsSynced: monthKeysToSync,
    newMonthsDetected,
    students: mergedStudents.length,
    sheetName,
    dbId
  };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { }

  const mode: SyncMode = body?.mode === "months" ? "months" : "new_only";
  const selectedMonths: string[] = Array.isArray(body?.selectedMonths) ? body.selectedMonths : [];
  const sheetName = body?.sheetName || "DIEM_2526";

  try {
    const result = await doSyncFromSheet({ mode, selectedMonths, sheetName });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await doSyncFromSheet({ mode: "new_only", selectedMonths: [] });
    const { ok: _ok, ...rest } = result as any;
    return NextResponse.json({ ok: true, mode: "cron", ...rest });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}
