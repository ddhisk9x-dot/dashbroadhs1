// app/api/sync/sheets/route.ts
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

async function doSyncFromSheet(opts?: SyncOpts) {
  const mode: SyncMode = opts?.mode ?? "new_only";
  const selectedMonths: string[] = Array.isArray(opts?.selectedMonths) ? opts!.selectedMonths! : [];
  const sheetName = opts?.sheetName || "DIEM_2526";

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  // 1) Fetch từ Apps Script
  const rows = await fetchFromAppsScript(sheetName);

  if (rows.length < 3) throw new Error("Sheet must have 2 header rows + data rows");

  const monthRow = rows[0] ?? [];
  const headerRow = rows[1] ?? [];
  const header2 = headerRow.map(normHeader);

  const idxMhs = header2.indexOf("MHS");
  const idxName = header2.findIndex(h => h.includes("HỌ") && h.includes("TÊN"));
  const idxClass = header2.findIndex(h => h === "LỚP" || h === "LOP");

  if (idxMhs < 0) {
    const hPreview = headerRow.slice(0, 15).map((x) => String(x ?? "")).join(" | ");
    throw new Error(`Missing column: MHS. Header preview: ${hPreview}`);
  }

  // Forward fill month row để xử lý ô gộp
  const filledMonthRow: string[] = [];
  let currentMonth = "";
  for (let i = 0; i < monthRow.length; i++) {
    const v = String(monthRow[i] || "").trim().replace(".", "-");
    if (isMonthKey(v)) {
      currentMonth = v;
    }
    filledMonthRow[i] = currentMonth;
  }

  const monthKeysAll = Array.from(new Set(filledMonthRow.filter((x) => isMonthKey(x)))).sort();

  if (monthKeysAll.length === 0) {
    throw new Error('No month_key detected on row 1. Expected values like "2025-08".');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 2) Load dữ liệu cũ
  const { data: oldState, error: oldErr } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", "main")
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

  const newMonthsDetected = monthKeysAll.filter((m) => !oldMonths.has(m));

  let monthKeysToSync: string[] = monthKeysAll;

  if (mode === "new_only") {
    monthKeysToSync = monthKeysAll.filter((m) => !oldMonths.has(m));

    let hasNewStudents = false;
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const mhs = String(row[idxMhs] ?? "").trim();
      if (!mhs) continue;
      if (!oldMap.has(mhs)) {
        hasNewStudents = true;
        break;
      }
    }

    if (monthKeysToSync.length === 0 && hasNewStudents) {
      monthKeysToSync = monthKeysAll;
    }
  } else if (mode === "months") {
    if (selectedMonths.length > 0) {
      const selSet = new Set(selectedMonths);
      monthKeysToSync = monthKeysAll.filter((m) => selSet.has(m));
    }
  }

  // Hàm tìm cột môn theo tháng - có forward fill
  const getCol = (monthKey: string, subjectUpper: string) => {
    const subj = normHeader(subjectUpper);
    for (let i = 0; i < filledMonthRow.length; i++) {
      if (filledMonthRow[i] !== monthKey) continue;
      if (header2[i] === subj || header2[i].includes(subj)) return i;
    }
    return -1;
  };

  // 3) Build students
  const studentMap = new Map<string, Student>();

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const mhs = String(row[idxMhs] ?? "").trim();
    if (!mhs) continue;

    const name = idxName >= 0 ? String(row[idxName] ?? "").trim() || "Unknown" : "Unknown";
    const className = idxClass >= 0 ? String(row[idxClass] ?? "").trim() : "";

    let st = studentMap.get(mhs);
    if (!st) {
      st = { mhs, name, class: className, scores: [], activeActions: [], actionsByMonth: {} };
      studentMap.set(mhs, st);
    } else {
      st.name = name;
      st.class = className;
    }

    for (const mk of monthKeysToSync) {
      const cMath = getCol(mk, "TOÁN");
      const cLit = getCol(mk, "NGỮ VĂN");
      const cEng = getCol(mk, "TIẾNG ANH");

      if (cMath < 0 && cLit < 0 && cEng < 0) continue;

      const math = cMath >= 0 ? toNumberOrNull(row[cMath]) : null;
      const lit = cLit >= 0 ? toNumberOrNull(row[cLit]) : null;
      const eng = cEng >= 0 ? toNumberOrNull(row[cEng]) : null;

      if (math === null && lit === null && eng === null) continue;

      const entry: ScoreData = { month: mk, math, lit, eng };
      const exist = (st.scores || []).findIndex((s) => s.month === mk);
      if (exist >= 0) st.scores[exist] = entry;
      else st.scores.push(entry);
    }
  }

  const newStudents = Array.from(studentMap.values()).map(normalizeActionsStorage);

  // 4) Merge
  const mergedStudents: Student[] = newStudents.map((ns) => {
    const old = oldMap.get(String(ns.mhs).trim());

    let scoresMerged: ScoreData[] = ns.scores ?? [];
    if (old?.scores?.length) {
      const replaceMonths = new Set(monthKeysToSync);
      const keepOldScores = old.scores.filter((sc) => !replaceMonths.has(sc.month));
      scoresMerged = [...keepOldScores, ...(ns.scores ?? [])].sort((a, b) => a.month.localeCompare(b.month));
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

    const taskMonth = getTaskMonthFromScores(merged.scores);
    if (Array.isArray(merged.actionsByMonth?.[taskMonth])) merged.activeActions = merged.actionsByMonth![taskMonth];
    else merged.activeActions = old?.activeActions ?? ns.activeActions ?? [];

    return normalizeActionsStorage(merged);
  });

  // 5) Giữ học sinh cũ không có trong sheet mới
  for (const [mhs, old] of oldMap.entries()) {
    if (!mergedStudents.some((s) => s.mhs === mhs)) mergedStudents.push(old);
  }

  // 6) Save
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: "main", students_json: { students: mergedStudents } }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  return {
    ok: true,
    mode,
    selectedMonths,
    monthsAll: monthKeysAll,
    monthsSynced: monthKeysToSync,
    newMonthsDetected,
    students: mergedStudents.length,
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
