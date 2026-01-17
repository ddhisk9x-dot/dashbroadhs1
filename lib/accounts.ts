import { createClient } from "@supabase/supabase-js";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") { row.push(cur); cur = ""; continue; }
    if (!inQuotes && ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
    if (ch !== "\r") cur += ch;
  }

  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
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
  if (text.slice(0, 300).toLowerCase().includes("<html")) {
    throw new Error("ACCOUNTS_CSV_URL is not CSV (got HTML). Use export?format=csv&gid=...");
  }

  const rows = parseCSV(text);
  if (rows.length < 2) return new Map();

  const header = rows[0].map(h);
  const idxMhs = header.indexOf("MHS");
  const idxName = header.indexOf("Họ tên HS") >= 0 ? header.indexOf("Họ tên HS") : header.indexOf("HỌ TÊN HS");
  const idxUsername = header.indexOf("USERNAME");
  const idxDef = header.indexOf("DEFAULT_PASSWORD");
  const idxNew = header.indexOf("NEW_PASSWORD");

  if (idxMhs < 0) throw new Error("Missing column MHS (ACCOUNTS)");
  if (idxUsername < 0) throw new Error("Missing column USERNAME (ACCOUNTS)");
  if (idxDef < 0) throw new Error("Missing column DEFAULT_PASSWORD (ACCOUNTS)");
  if (idxNew < 0) throw new Error("Missing column NEW_PASSWORD (ACCOUNTS)");

  const map = new Map<string, AccountRow>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const username = h(row[idxUsername]);
    if (!username) continue;

    map.set(username, {
      mhs: h(row[idxMhs]),
      name: idxName >= 0 ? h(row[idxName]) : "",
      username,
      defaultPassword: h(row[idxDef]),
      newPassword: h(row[idxNew]),
    });
  }
  return map;
}

export async function getOverridePassword(username: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data, error } = await sb
    .from("account_overrides")
    .select("new_password")
    .eq("username", username)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const p = (data as any)?.new_password;
  return p ? String(p) : null;
}

export async function setOverridePassword(username: string, mhs: string, newPassword: string, note?: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { error } = await sb
    .from("account_overrides")
    .upsert(
      { username, mhs, new_password: newPassword, updated_at: new Date().toISOString(), note: note || "" },
      { onConflict: "username" }
    );

  if (error) throw new Error(error.message);
}

export async function clearOverridePassword(username: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { error } = await sb.from("account_overrides").delete().eq("username", username);
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
