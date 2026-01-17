// lib/accounts.ts
import { createClient } from "@supabase/supabase-js";

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

function normHeaderKey(v: any): string {
  return stripDiacritics(String(v ?? ""))
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normVal(v: any): string {
  return String(v ?? "").trim();
}

function looksLikeHtml(text: string): boolean {
  const s = text.slice(0, 500).toLowerCase();
  return s.includes("<!doctype html") || s.includes("<html") || s.includes("google sheets");
}

function findHeaderRow(rows: string[][]): { header: string[]; headerRowIndex: number } {
  // Nhiều khi sheet có 1-2 dòng tiêu đề trước header thật => scan 0..4
  const scanMax = Math.min(rows.length, 5);

  for (let i = 0; i < scanMax; i++) {
    const raw = rows[i] ?? [];
    const header = raw.map(normHeaderKey);

    const hasMhs = header.includes("MHS");
    const hasDefault = header.includes("DEFAULT_PASSWORD") || header.includes("DEFAULT PASS") || header.includes("DEFAULTPASSWORD");
    const hasNew = header.includes("NEW_PASSWORD") || header.includes("NEW PASS") || header.includes("NEWPASSWORD");

    if (hasMhs && hasDefault && hasNew) {
      return { header, headerRowIndex: i };
    }
  }

  // fallback: coi rows[0] là header
  return { header: (rows[0] ?? []).map(normHeaderKey), headerRowIndex: 0 };
}

function idxOfAny(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

export type AccountRow = {
  mhs: string;
  name: string;
  username: string;
  defaultPassword: string;
  newPassword: string;
  updatedAt?: string;
  note?: string;
};

export async function fetchAccountsFromSheet(): Promise<Map<string, AccountRow>> {
  const url = process.env.ACCOUNTS_CSV_URL;
  if (!url) throw new Error("Missing env: ACCOUNTS_CSV_URL");

  const resp = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
  });

  if (!resp.ok) throw new Error(`Fetch accounts CSV failed: ${resp.status}`);

  const text = await resp.text();
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("text/html") || looksLikeHtml(text)) {
    throw new Error("ACCOUNTS_CSV_URL is not CSV (got HTML). Use export?format=csv&gid=...");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return new Map();

  const { header, headerRowIndex } = findHeaderRow(rows);

  const idxMhs = idxOfAny(header, ["MHS"]);
  const idxName = idxOfAny(header, [
    "HO TEN HS",
    "HO VA TEN HS",
    "HO VA TEN",
    "HO TEN",
    "HOVATENHS",
  ]);
  // USERNAME là optional (bạn dùng MHS làm tài khoản)
  const idxUsername = idxOfAny(header, ["USERNAME", "USER NAME", "TAI KHOAN", "ACCOUNT"]);
  const idxDef = idxOfAny(header, ["DEFAULT_PASSWORD", "DEFAULT PASS", "DEFAULTPASSWORD"]);
  const idxNew = idxOfAny(header, ["NEW_PASSWORD", "NEW PASS", "NEWPASSWORD"]);
  const idxUpdatedAt = idxOfAny(header, ["UPDATED_AT", "UPDATEDAT", "CAP NHAT", "CAPNHAT"]);
  const idxNote = idxOfAny(header, ["NOTE", "GHI CHU", "GHICHU"]);

  if (idxMhs < 0) throw new Error("Missing column MHS (ACCOUNTS)");
  if (idxDef < 0) throw new Error("Missing column DEFAULT_PASSWORD (ACCOUNTS)");
  if (idxNew < 0) throw new Error("Missing column NEW_PASSWORD (ACCOUNTS)");

  const map = new Map<string, AccountRow>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];

    const mhs = normVal(row[idxMhs]);
    const usernameRaw = idxUsername >= 0 ? normVal(row[idxUsername]) : "";
    const username = usernameRaw || mhs; // dùng MHS làm tài khoản

    if (!mhs && !username) continue;

    const acc: AccountRow = {
      mhs: mhs || username,
      name: idxName >= 0 ? normVal(row[idxName]) : "",
      username,
      defaultPassword: normVal(row[idxDef]),
      newPassword: normVal(row[idxNew]),
      updatedAt: idxUpdatedAt >= 0 ? normVal(row[idxUpdatedAt]) : "",
      note: idxNote >= 0 ? normVal(row[idxNote]) : "",
    };

    // Set theo MHS (chính) + theo USERNAME (nếu khác) để lookup linh hoạt
    const keyMhs = (acc.mhs || "").trim();
    const keyUser = (acc.username || "").trim();

    if (keyMhs) map.set(keyMhs, acc);
    if (keyUser && keyUser !== keyMhs) map.set(keyUser, acc);
  }

  return map;
}

function sb() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(supabaseUrl, serviceKey);
}

export async function getOverridePassword(username: string): Promise<string | null> {
  const supabase = sb();
  const { data, error } = await supabase
    .from("account_overrides")
    .select("new_password")
    .eq("username", username)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const p = (data as any)?.new_password;
  return p === undefined || p === null || String(p).trim() === "" ? null : String(p).trim();
}

export async function setOverridePassword(
  username: string,
  mhs: string,
  newPassword: string,
  note?: string
) {
  const supabase = sb();
  const { error } = await supabase
    .from("account_overrides")
    .upsert(
      {
        username: String(username).trim(),
        mhs: String(mhs).trim(),
        new_password: String(newPassword).trim(),
        updated_at: new Date().toISOString(),
        note: note || "",
      },
      { onConflict: "username" }
    );

  if (error) throw new Error(error.message);
}

export async function clearOverridePassword(username: string) {
  const supabase = sb();
  const { error } = await supabase.from("account_overrides").delete().eq("username", username);
  if (error) throw new Error(error.message);
}

export async function writeSheetNewPassword(username: string, newPassword: string, note?: string) {
  const url = process.env.ACCOUNTS_WRITE_URL;
  const secret = process.env.ACCOUNTS_WRITE_SECRET;
  if (!url || !secret) throw new Error("Missing env: ACCOUNTS_WRITE_URL / ACCOUNTS_WRITE_SECRET");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      action: "set_new_password",
      username: String(username).trim(),
      newPassword: String(newPassword).trim(),
      note: note || "",
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) throw new Error(data?.error || "Write sheet failed");
}

export async function clearSheetNewPassword(username: string, note?: string) {
  const url = process.env.ACCOUNTS_WRITE_URL;
  const secret = process.env.ACCOUNTS_WRITE_SECRET;
  if (!url || !secret) throw new Error("Missing env: ACCOUNTS_WRITE_URL / ACCOUNTS_WRITE_SECRET");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      action: "clear_new_password",
      username: String(username).trim(),
      note: note || "",
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) throw new Error(data?.error || "Clear sheet failed");
}
