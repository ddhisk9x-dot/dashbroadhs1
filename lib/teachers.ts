// lib/teachers.ts
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

function looksLikeHtml(text: string): boolean {
  const s = text.slice(0, 500).toLowerCase();
  return s.includes("<!doctype html") || s.includes("<html") || s.includes("google sheets");
}

function normHeaderKey(v: any): string {
  return String(v ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normVal(v: any): string {
  return String(v ?? "").trim();
}

function idxOfAny(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

export type TeacherRow = {
  teacherName: string;
  teacherClass: string;
  username: string;
  defaultPassword: string;
  newPassword: string; // optional, nếu bạn có cột
  updatedAt?: string;
  note?: string;
};

export async function fetchTeachersFromSheet(): Promise<Map<string, TeacherRow>> {
  const url = process.env.TEACHERS_CSV_URL;
  if (!url) throw new Error("Missing env: TEACHERS_CSV_URL");

  const resp = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
  });
  if (!resp.ok) throw new Error(`Fetch teachers CSV failed: ${resp.status}`);

  const text = await resp.text();
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("text/html") || looksLikeHtml(text)) {
    throw new Error("TEACHERS_CSV_URL is not CSV (got HTML). Use export?format=csv&gid=...");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return new Map();

  const header = (rows[0] ?? []).map(normHeaderKey);

  const idxName = idxOfAny(header, ["TEN GVCN", "GVCN", "TEACHER_NAME", "NAME", "HỌ VÀ TÊN", "HO VA TEN"]);
  const idxClass = idxOfAny(header, ["LOP", "LỚP", "TEACHER_CLASS", "CLASS"]);
  const idxUsername = idxOfAny(header, ["TAI KHOAN", "TÀI KHOẢN", "USERNAME", "ACCOUNT"]);
  const idxDef = idxOfAny(header, ["DEFAULT_PASSWORD", "DEFAULT PASS", "DEFAULTPASSWORD", "MAT KHAU", "MẬT KHẨU"]);
  const idxNew = idxOfAny(header, ["NEW_PASSWORD", "NEW PASS", "NEWPASSWORD"]);
  const idxUpdatedAt = idxOfAny(header, ["UPDATED_AT", "UPDATEDAT", "CAP NHAT", "CẬP NHẬT"]);
  const idxNote = idxOfAny(header, ["NOTE", "GHI CHU", "GHICHU"]);

  if (idxClass < 0) throw new Error("Missing column LỚP (TEACHERS)");
  if (idxUsername < 0) throw new Error("Missing column TÀI KHOẢN/USERNAME (TEACHERS)");
  if (idxDef < 0) throw new Error("Missing column DEFAULT_PASSWORD (TEACHERS)");

  const map = new Map<string, TeacherRow>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const username = normVal(row[idxUsername]);
    if (!username) continue;

    const t: TeacherRow = {
      teacherName: idxName >= 0 ? normVal(row[idxName]) : "",
      teacherClass: normVal(row[idxClass]),
      username,
      defaultPassword: normVal(row[idxDef]),
      newPassword: idxNew >= 0 ? normVal(row[idxNew]) : "",
      updatedAt: idxUpdatedAt >= 0 ? normVal(row[idxUpdatedAt]) : "",
      note: idxNote >= 0 ? normVal(row[idxNote]) : "",
    };

    map.set(username, t);
  }

  return map;
}
