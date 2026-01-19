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

function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normKey(v: any): string {
  return stripDiacritics(String(v ?? ""))
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function h(v: any) {
  return String(v ?? "").trim();
}

function looksLikeHtml(text: string): boolean {
  const s = text.slice(0, 500).toLowerCase();
  return s.includes("<!doctype html") || s.includes("<html") || s.includes("google sheets");
}

function idxOfAny(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

export type TeacherRow = {
  class: string;           // lớp phụ trách
  gvcnName: string;        // tên GVCN
  username: string;        // tài khoản đăng nhập
  defaultPassword: string; // mk mặc định
  newPassword: string;     // mk mới (nếu có)
  email?: string;
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
    throw new Error("TEACHERS_CSV_URL is not CSV (got HTML). Check share setting + export?format=csv&gid=...");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return new Map();

  // header = dòng 0
  const header = (rows[0] ?? []).map(normKey);

  const idxClass = idxOfAny(header, ["CLASS", "LOP", "LỚP"]);
  const idxName = idxOfAny(header, ["GVCN_NAME", "TEN GVCN", "GVCN", "GIAO VIEN"]);
  const idxUsername = idxOfAny(header, ["USERNAME", "TAI KHOAN", "ACCOUNT"]);
  const idxDef = idxOfAny(header, ["DEFAULT_PASSWORD", "DEFAULT PASS", "DEFAULTPASSWORD"]);
  const idxNew = idxOfAny(header, ["NEW_PASSWORD", "NEW PASS", "NEWPASSWORD"]);
  const idxEmail = idxOfAny(header, ["EMAIL", "MAIL"]);

  if (idxClass < 0) throw new Error("Missing column CLASS (TEACHERS)");
  if (idxUsername < 0) throw new Error("Missing column USERNAME (TEACHERS)");
  if (idxDef < 0) throw new Error("Missing column DEFAULT_PASSWORD (TEACHERS)");
  if (idxNew < 0) throw new Error("Missing column NEW_PASSWORD (TEACHERS)");

  const map = new Map<string, TeacherRow>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const username = h(row[idxUsername]);
    const cls = h(row[idxClass]);

    if (!username || !cls) continue;

    const t: TeacherRow = {
      class: cls,
      gvcnName: idxName >= 0 ? h(row[idxName]) : "",
      username,
      defaultPassword: h(row[idxDef]),
      newPassword: h(row[idxNew]),
      email: idxEmail >= 0 ? h(row[idxEmail]) : "",
    };

    map.set(username, t);
  }

  return map;
}
