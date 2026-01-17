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

function normHeader(v: any): string {
  return String(v ?? "")
    .replace(/\uFEFF/g, "") // BOM
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Detect CSV delimiter (comma/semicolon/tab) from first few non-empty lines
function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 10);

  if (lines.length === 0) return ",";

  const candidates = [",", ";", "\t"];
  const score: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };

  for (const line of lines) {
    for (const d of candidates) {
      score[d] += countDelimiterOutsideQuotes(line, d);
    }
  }

  // pick max
  let best = ",";
  for (const d of candidates) {
    if (score[d] > score[best]) best = d;
  }
  return best;
}

function countDelimiterOutsideQuotes(line: string, delim: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++; // escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) count++;
  }
  return count;
}

// CSV parser (supports delimiter + quotes)
function parseCSV(text: string, delim: string): string[][] {
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

    if (!inQuotes && ch === delim) {
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

function findColIndex(header2: string[], aliases: string[]): number {
  for (const a of aliases) {
    const idx = header2.indexOf(normHeader(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

function findHeaderRowIndex(rows: string[][]): number {
  // scan first 15 rows to find the one that contains "MHS" (or aliases)
  const aliases = ["MHS", "MÃ HS", "MA HS", "MAHS", "MÃ HỌC SINH", "MA HOC SINH"];
  const want = aliases.map(normHeader);

  const max = Math.min(rows.length, 15);
  for (let i = 0; i < max; i++) {
    const row = rows[i] ?? [];
    const normed = row.map(normHeader);
    if (normed.some((c) => want.includes(c))) return i;
  }
  return -1;
}

async function doSyncFromSheet() {
  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) throw new Error("Missing env: SHEET_CSV_URL");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  // 1) Fetch CSV
  const resp = await fetch(sheetUrl, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Fetch CSV failed: ${resp.status}`);
  const csv = await resp.text();

  // 2) Parse CSV robustly (detect delimiter)
  const delim = detectDelimiter(csv);
  const rows = parseCSV(csv, delim);

  if (rows.length < 2) throw new Error("CSV too short");

  // 3) Auto-detect header row that contains MHS
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    // show first 3 rows to help debug
    const preview = rows.slice(0, 3).map((r) => r.slice(0, 12));
    throw new Error(`Missing column: MHS (not found in first rows). Preview: ${JSON.stringify(preview)}`);
  }

  // month row is the row immediately above the header row (your design)
  const monthRowIndex = Math.max(0, headerRowIndex - 1);

  const monthRow = rows[monthRowIndex] ?? [];
  const headerRow = rows[headerRowIndex] ?? [];
  const header2 = headerRow.map(normHeader);

  const idxMhs = findColIndex(header2, ["MHS", "MÃ HS", "MA HS", "MAHS", "MÃ HỌC SINH", "MA HOC SINH"]);
  const idxName = findColIndex(header2, ["HỌ VÀ TÊN", "HỌ TÊN", "HO VA TEN", "HO TEN"]);
  const idxClass = findColIndex(header2, ["LỚP", "LOP"]);

  if (idxMhs < 0) {
    throw new Error(`Missing column: MHS (headerRowIndex=${headerRowIndex}). Headers: ${JSON.stringify(headerRow)}`);
  }
  if (idxName < 0) {
    throw new Error(`Missing column: HỌ VÀ TÊN (headerRowIndex=${headerRowIndex}). Headers: ${JSON.stringify(headerRow)}`);
  }
  if (idxClass < 0) {
    throw new Error(`Missing column: LỚP (headerRowIndex=${headerRowIndex}). Headers: ${JSON.stringify(headerRow)}`);
  }

  // month keys like 2025-08
  const monthKeys = Array.from(
    new Set(
      monthRow
        .map((x) => String(x ?? "").trim())
        .filter((x) => /^\d{4}-\d{2}$/.test(x))
    )
  );

  if (monthKeys.length === 0) {
    throw new Error(
      `No month_key detected on month row (row ${monthRowIndex + 1}). Expected "YYYY-MM" like 2025-08.`
    );
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

  // data starts after header row
  const dataStart = headerRowIndex + 1;

  // 4) Build students
  const studentMap = new Map<string, Student>();

  for (let r = dataStart; r < rows.length; r++) {
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

  // 5) Save to app_state(main)
  const supabase = createClient(supabaseUrl, serviceKey);

  // LƯU Ý: cột JSON trong app_state của bạn là "students" (bản cloud hiện tại)
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: "main", students: { students: newStudents } }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  return {
    delimiter: delim === "\t" ? "TAB" : delim,
    headerRowIndex,
    monthRowIndex,
    students: newStudents.length,
    monthsDetected: monthKeys.length,
    months: monthKeys,
  };
}

/**
 * POST: Admin bấm nút trong app (admin-only bằng session cookie)
 */
export async function POST() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await doSyncFromSheet();
    return NextResponse.json({ ok: true, mode: "admin", ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}

/**
 * GET: dùng cho Cron (server-only secret)
 * gọi: /api/sync/sheets?secret=...
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await doSyncFromSheet();
    return NextResponse.json({ ok: true, mode: "cron", ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}
