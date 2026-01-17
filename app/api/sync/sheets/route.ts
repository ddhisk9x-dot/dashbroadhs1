import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "dd_session";

type SessionPayload = { role: "ADMIN" | "STUDENT"; mhs: string | null };

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

async function readSession(): Promise<SessionPayload | null> {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  const raw = Buffer.from(b64, "base64").toString("utf-8");
  const expected = sign(raw, secret);
  if (sig !== expected) return null;

  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

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
  activeActions: any[];
  aiReport?: any;
};

function looksLikeHtml(text: string): boolean {
  const s = text.slice(0, 300).toLowerCase();
  return s.includes("<!doctype html") || s.includes("<html") || s.includes("google sheets");
}

async function doSyncFromSheet() {
  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) throw new Error("Missing env: SHEET_CSV_URL");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  // 1) Fetch CSV
  const resp = await fetch(sheetUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      // giúp Google trả dữ liệu dạng text/csv ổn định hơn
      "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!resp.ok) {
    throw new Error(`Fetch CSV failed: ${resp.status}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  const text = await resp.text();

  // Nếu URL đang trỏ vào trang Google Sheets (HTML) thay vì CSV
  if (looksLikeHtml(text) || contentType.includes("text/html")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `SHEET_CSV_URL is not a CSV export link (got HTML). ` +
      `Please use: https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID> ` +
      `Preview: ${preview}`
    );
  }

  const rows = parseCSV(text);

  // 2) Validate
  if (rows.length < 3) throw new Error("CSV must have 2 header rows + data rows");

  const monthRow = rows[0] ?? [];   // Row 1: month_key
  const headerRow = rows[1] ?? [];  // Row 2: column names

  const header2 = headerRow.map(normHeader);

  const idxMhs = header2.indexOf("MHS");
  const idxName = header2.indexOf("HỌ VÀ TÊN");
  const idxClass = header2.indexOf("LỚP");

  if (idxMhs < 0) {
    const hPreview = headerRow.slice(0, 20).map((x) => String(x ?? "")).join(" | ");
    throw new Error(`Missing column: MHS (header row 2). Header preview: ${hPreview}`);
  }
  if (idxName < 0) throw new Error("Missing column: HỌ VÀ TÊN");
  if (idxClass < 0) throw new Error("Missing column: LỚP");

  // Lấy month keys đúng định dạng yyyy-mm
  const monthKeys = Array.from(
    new Set(
      monthRow
        .map((x) => String(x ?? "").trim())
        .filter((x) => /^\d{4}-\d{2}$/.test(x))
    )
  );

  if (monthKeys.length === 0) {
    throw new Error('No month_key detected on row 1. Expected values like "2025-08".');
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

  // 3) Build students
  const studentMap = new Map<string, Student>();

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const mhs = String(row[idxMhs] ?? "").trim();
    if (!mhs) continue;

    const name = String(row[idxName] ?? "").trim() || "Unknown";
    const className = String(row[idxClass] ?? "").trim() || "";

    let st = studentMap.get(mhs);
    if (!st) {
      st = { mhs, name, class: className, scores: [], activeActions: [] };
      studentMap.set(mhs, st);
    } else {
      st.name = name;
      st.class = className;
    }

    for (const mk of monthKeys) {
      const cMath = getCol(mk, "TOÁN");
      const cLit = getCol(mk, "NGỮ VĂN");
      const cEng = getCol(mk, "TIẾNG ANH");

      if (cMath < 0 && cLit < 0 && cEng < 0) continue;

      const math = cMath >= 0 ? toNumberOrNull(row[cMath]) : null;
      const lit = cLit >= 0 ? toNumberOrNull(row[cLit]) : null;
      const eng = cEng >= 0 ? toNumberOrNull(row[cEng]) : null;

      // thiếu điểm thì không tính
      if (math === null && lit === null && eng === null) continue;

      const entry: ScoreData = { month: mk, math, lit, eng };
      const exist = st.scores.findIndex((s) => s.month === mk);
      if (exist >= 0) st.scores[exist] = entry;
      else st.scores.push(entry);
    }
  }

  const newStudents = Array.from(studentMap.values());

const supabase = createClient(supabaseUrl, serviceKey);

// 1) Load dữ liệu cũ
const { data: oldState, error: oldErr } = await supabase
  .from("app_state")
  .select("students_json")
  .eq("id", "main")
  .maybeSingle();

if (oldErr) throw new Error(oldErr.message);

const oldStudents: Student[] =
  (oldState?.students_json?.students as Student[]) ?? [];

const oldMap = new Map<string, Student>();
oldStudents.forEach((s) => oldMap.set(String(s.mhs).trim(), s));

// 2) Merge theo MHS
const mergedStudents: Student[] = newStudents.map((ns) => {
  const old = oldMap.get(String(ns.mhs).trim());

  return {
    ...ns,
    // giữ dữ liệu AI + tick nếu có
    aiReport: old?.aiReport ?? ns.aiReport,
    activeActions: old?.activeActions ?? ns.activeActions ?? [],
  };
});

// 3) Nếu muốn giữ cả học sinh “cũ” mà sheet mới không còn (tuỳ bạn)
// - Nếu KHÔNG muốn mất dữ liệu tick của em vắng mặt tháng này, bật phần này:
for (const [mhs, old] of oldMap.entries()) {
  if (!mergedStudents.some((s) => s.mhs === mhs)) {
    mergedStudents.push(old);
  }
}

// 4) Save lại
const { error } = await supabase
  .from("app_state")
  .upsert({ id: "main", students_json: { students: mergedStudents } }, { onConflict: "id" });

if (error) throw new Error(error.message);

return {
  students: mergedStudents.length,
  monthsDetected: monthKeys.length,
  months: monthKeys,
};
