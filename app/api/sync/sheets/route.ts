// app/api/sync/sheets/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// CSV parser đơn giản (đủ cho bảng điểm)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    if (ch !== "\r") cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

function normHeader(v: any): string {
  return String(v ?? "")
    .replace(/\uFEFF/g, "") // BOM
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumberOrNull(v: string | undefined): number | null {
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

function looksLikeHtml(text: string): boolean {
  const s = text.slice(0, 400).toLowerCase();
  return s.includes("<!doctype html") || s.includes("<html") || s.includes("google sheets");
}

type SyncMode = "new_only" | "months";
type SyncOpts = { mode?: SyncMode; selectedMonths?: string[] };

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
  if (m === 13) {
    m = 1;
    y += 1;
  }
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

async function doSyncFromSheet(opts?: SyncOpts) {
  const mode: SyncMode = opts?.mode ?? "new_only";
  const selectedMonths: string[] = Array.isArray(opts?.selectedMonths) ? opts!.selectedMonths! : [];

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) throw new Error("Missing env: SHEET_CSV_URL");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  // 1) Fetch CSV
  const resp = await fetch(sheetUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
  });

  if (!resp.ok) throw new Error(`Fetch CSV failed: ${resp.status}`);

  const contentType = resp.headers.get("content-type") || "";
  const text = await resp.text();

  if (looksLikeHtml(text) || contentType.includes("text/html")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `SHEET_CSV_URL is not a CSV export link (got HTML). ` +
      `Use: https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>. ` +
      `Preview: ${preview}`
    );
  }

  const rows = parseCSV(text);

  // 2) Validate
  if (rows.length < 3) throw new Error("CSV must have 2 header rows + data rows");

  const monthRow = rows[0] ?? [];
  const headerRow = rows[1] ?? [];
  const header2 = headerRow.map(normHeader);

  const idxMhs = header2.indexOf("MHS");
  const idxName = header2.indexOf("HỌ VÀ TÊN");
  const idxClass = header2.indexOf("LỚP");

  if (idxMhs < 0) {
    const hPreview = headerRow.slice(0, 30).map((x) => String(x ?? "")).join(" | ");
    throw new Error(`Missing column: MHS (header row 2). Header preview: ${hPreview}`);
  }
  if (idxName < 0) throw new Error("Missing column: HỌ VÀ TÊN");
  if (idxClass < 0) throw new Error("Missing column: LỚP");

  const monthKeysAll = Array.from(
    new Set(monthRow.map((x) => String(x ?? "").trim()).filter((x) => isMonthKey(x)))
  );

  if (monthKeysAll.length === 0) {
    throw new Error('No month_key detected on row 1. Expected values like "2025-08".');
  }

  const supabase = createClient(supabaseUrl, serviceKey);

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

  const getCol = (monthKey: string, subjectUpper: string) => {
    const subj = normHeader(subjectUpper);
    for (let i = 0; i < monthRow.length; i++) {
      const mk = String(monthRow[i] ?? "").trim();
      if (mk !== monthKey) continue;
      if (header2[i] === subj) return i;
    }
    return -1;
  };

  const studentMap = new Map<string, Student>();

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const mhs = String(row[idxMhs] ?? "").trim();
    if (!mhs) continue;

    const name = String(row[idxName] ?? "").trim() || "Unknown";
    const className = String(row[idxClass] ?? "").trim() || "";

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

  for (const [mhs, old] of oldMap.entries()) {
    if (!mergedStudents.some((s) => s.mhs === mhs)) mergedStudents.push(old);
  }

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
  try {
    body = await req.json();
  } catch { }

  const mode: SyncMode = body?.mode === "months" ? "months" : "new_only";
  const selectedMonths: string[] = Array.isArray(body?.selectedMonths) ? body.selectedMonths : [];

  try {
    const result = await doSyncFromSheet({ mode, selectedMonths });
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
