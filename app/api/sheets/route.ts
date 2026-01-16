import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ScoreData = { month: string; math: number | null; lit: number | null; eng: number | null };
type Student = {
  mhs: string;
  name: string;
  class: string;
  scores: ScoreData[];
  activeActions: any[];
  aiReport?: any;
};

function parseCSV(text: string): string[][] {
  // CSV parser đơn giản (đủ cho số/chuỗi), nếu có dấu phẩy trong tên thì nên chuyển sang Papaparse
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // double quotes escape
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === ",")) {
      row.push(cur.trim());
      cur = "";
      continue;
    }

    if (!inQuotes && (ch === "\n")) {
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    if (ch !== "\r") cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur.trim());
    rows.push(row);
  }

  return rows;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) {
    return NextResponse.json({ ok: false, error: "Missing env: SHEET_CSV_URL" }, { status: 500 });
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }

  // 1) Fetch CSV
  const resp = await fetch(sheetUrl, { cache: "no-store" });
  if (!resp.ok) {
    return NextResponse.json({ ok: false, error: `Fetch CSV failed: ${resp.status}` }, { status: 500 });
  }
  const csv = await resp.text();
  const rows = parseCSV(csv);

  // 2) Validate minimal rows (2 header rows)
  if (rows.length < 3) {
    return NextResponse.json({ ok: false, error: "CSV must have 2 header rows + data rows" }, { status: 400 });
  }

  const monthRow = rows[0];    // row 1: month_key
  const subjectRow = rows[1];  // row 2: subject names

  // 3) Map fixed columns by header row 2
  const header2 = subjectRow.map((x) => (x || "").toUpperCase());
  const idxMhs = header2.indexOf("MHS");
  const idxName = header2.indexOf("HỌ VÀ TÊN");
  const idxClass = header2.indexOf("LỚP");

  if (idxMhs < 0) return NextResponse.json({ ok: false, error: "Missing column: MHS" }, { status: 400 });
  if (idxName < 0) return NextResponse.json({ ok: false, error: "Missing column: HỌ VÀ TÊN" }, { status: 400 });
  if (idxClass < 0) return NextResponse.json({ ok: false, error: "Missing column: LỚP" }, { status: 400 });

  // 4) Find month blocks columns: for each month_key, locate TOÁN/NGỮ VĂN/TIẾNG ANH
  // monthRow has repeated month_key over each subject column.
  const monthKeys = Array.from(new Set(monthRow.filter(Boolean)));

  const getCol = (monthKey: string, subjectUpper: string) => {
    for (let i = 0; i < monthRow.length; i++) {
      if ((monthRow[i] || "").trim() === monthKey && (header2[i] || "").trim() === subjectUpper) return i;
    }
    return -1;
  };

  // 5) Build Student[] from CSV
  const studentMap = new Map<string, Student>();

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const mhs = (row[idxMhs] || "").trim();
    if (!mhs) continue;

    const name = (row[idxName] || "").trim() || "Unknown";
    const className = (row[idxClass] || "").trim() || "";

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

      // Nếu cả 3 đều null => bỏ qua tháng đó
      if (math === null && lit === null && eng === null) continue;

      const entry: ScoreData = { month: mk, math, lit, eng };

      const exist = st.scores.findIndex((s) => s.month === mk);
      if (exist >= 0) st.scores[exist] = entry;
      else st.scores.push(entry);
    }
  }

  const newStudents = Array.from(studentMap.values());

  // 6) Save to Supabase (overwrite app_state main)
  const supabase = createClient(supabaseUrl, serviceKey);
  const payload = { students: newStudents };

  const { error } = await supabase
    .from("app_state")
    .upsert({ id: "main", students_json: payload }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    students: newStudents.length,
    monthsDetected: monthKeys.length,
    months: monthKeys,
  });
}
