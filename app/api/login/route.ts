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

// fallback legacy: UI ghi mật khẩu = MHS hoặc 123456
function allowLegacyStudentPassword(mhs: string, password: string) {
  return password === mhs || password === "123456";
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
  const st = students.find((s) => String(s?.mhs || "").trim() === String(mhs).trim());
  return st || null;
}

async function checkStudentPassword(mhs: string, password: string): Promise<boolean> {
  const username = String(mhs).trim();
  const pw = String(password).trim();

  // 1) DB override (ưu tiên cao nhất)
  const override = await getOverridePassword(username).catch(() => null);
  if (override && pw === override) return true;

  // 2) Sheet accounts (NEW_PASSWORD > DEFAULT_PASSWORD)
  try {
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(username) || accounts.get(String(username).trim());
    if (acc) {
      const sheetEffective = (acc.newPassword || acc.defaultPassword || "").trim();
      if (sheetEffective && pw === sheetEffective) return true;

      // nếu sheet có username riêng, cho phép login bằng username nhưng dùng MHS làm session
      const u2 = (acc.username || "").trim();
      if (u2 && u2 !== username) {
        const acc2 = accounts.get(u2);
        const eff2 = (acc2?.newPassword || acc2?.defaultPassword || "").trim();
        if (eff2 && pw === eff2) return true;
      }
    }
  } catch {
    // ignore (vẫn fallback legacy)
  }

  // 3) Legacy fallback
  return allowLegacyStudentPassword(username, pw);
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

    // check password from: DB override > accounts sheet (new/default) > legacy
    const okPw = await checkStudentPassword(mhs, password);
    if (!okPw) {
      return NextResponse.json({ ok: false, error: "Sai mật khẩu" }, { status: 401 });
    }

    const student = await findStudentByMhs(mhs);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy học sinh" }, { status: 404 });
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
