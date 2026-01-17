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

export type AccountRow = {
  mhs: string;
  name: string;
  username: string;
  defaultPassword: string;
  newPassword: string;
};

export async function fetchAccountsFromSheet(): Promise<Map<string, AccountRow>> {
  const url = process.env.ACCOUNTS_CSV_URL;
  if (!url) throw new Error("Missing env: ACCOUNTS_CSV_URL");

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Fetch accounts CSV failed: ${resp.status}`);

  const text = await resp.text();
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("text/html") || text.slice(0, 400).toLowerCase().includes("<html")) {
    throw new Error("ACCOUNTS_CSV_URL is not CSV (got HTML). Use export?format=csv&gid=...");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return new Map();

  const headerRaw = rows[0] ?? [];
  const header = headerRaw.map(normKey);

  const idxMhs = header.indexOf("MHS");
  const idxName = header.indexOf("HO TEN HS"); // "Họ tên HS"
  const idxUsername = header.indexOf("USERNAME");
  const idxDef = header.indexOf("DEFAULT_PASSWORD");
  const idxNew = header.indexOf("NEW_PASSWORD");

  if (idxMhs < 0) throw new Error("Missing column MHS (ACCOUNTS)");
  if (idxUsername < 0) throw new Error("Missing column USERNAME (ACCOUNTS)");
  if (idxDef < 0) throw new Error("Missing column DEFAULT_PASSWORD (ACCOUNTS)");
  if (idxNew < 0) throw new Error("Missing column NEW_PASSWORD (ACCOUNTS)");

  const map = new Map<string, AccountRow>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const mhs = h(row[idxMhs]);
    const username = h(row[idxUsername]);
    if (!mhs && !username) continue;

    const key = mhs || username; // bạn dùng MHS làm tài khoản => key là mhs
    map.set(key, {
      mhs,
      name: idxName >= 0 ? h(row[idxName]) : "",
      username: username || mhs,
      defaultPassword: h(row[idxDef]),
      newPassword: h(row[idxNew]),
    });
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
  return p ? String(p) : null;
}

export async function setOverridePassword(username: string, mhs: string, newPassword: string, note?: string) {
  const supabase = sb();
  const { error } = await supabase
    .from("account_overrides")
    .upsert(
      { username, mhs, new_password: newPassword, updated_at: new Date().toISOString(), note: note || "" },
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
      username,
      newPassword,
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
      username,
      note: note || "",
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.ok) throw new Error(data?.error || "Clear sheet failed");
}
