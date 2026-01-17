// app/api/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setSession } from "@/lib/session";
import { fetchAccountsFromSheet, getOverridePassword } from "@/lib/accounts";

export const runtime = "nodejs";

function isAdmin(username: string, password: string) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "admin";
  return username === u && password === p;
}

async function findStudentByMhs(mhs: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", "main")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const students = (data?.students_json?.students as any[]) || [];
  const st = students.find((s) => String(s?.mhs || "").trim() === mhs);
  return st || null;
}

function uniqNonEmpty(arr: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "").trim();

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Missing username/password" }, { status: 400 });
    }

    // ✅ ADMIN
    if (isAdmin(username, password)) {
      const res = NextResponse.json({
        ok: true,
        user: { username: "admin", name: "Admin", role: "ADMIN" },
      });
      setSession(res, { role: "ADMIN", mhs: null });
      return res;
    }

    // ✅ STUDENT (username = MHS)
    const mhs = username;

    // Must exist in app_state
    const student = await findStudentByMhs(mhs);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy học sinh" }, { status: 404 });
    }

    // Read accounts sheet row
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs);
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });
    }

    // Effective password rules:
    // 1) If DB override exists => ONLY that password is valid
    // 2) Else if sheet NEW_PASSWORD exists => ONLY that password is valid
    // 3) Else => ONLY DEFAULT_PASSWORD is valid (reset state)
    const override = await getOverridePassword(acc.username || mhs);
    const effective =
      (override && override.trim()) ||
      (acc.newPassword && acc.newPassword.trim()) ||
      (acc.defaultPassword && acc.defaultPassword.trim()) ||
      "";

    if (!effective) {
      return NextResponse.json({ ok: false, error: "No password configured" }, { status: 500 });
    }

    // Strict check: only effective is accepted
    const allowed = uniqNonEmpty([effective]);
    if (!allowed.includes(password)) {
      return NextResponse.json({ ok: false, error: "Sai mật khẩu" }, { status: 401 });
    }

    const res = NextResponse.json({
      ok: true,
      user: { username: mhs, name: student.name || mhs, role: "STUDENT" },
    });
    setSession(res, { role: "STUDENT", mhs });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
