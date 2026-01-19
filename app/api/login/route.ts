// app/api/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";

function isAdmin(username: string, password: string) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "admin";
  return username === u && password === p;
}

// ✅ HS: cho phép đăng nhập bằng mật khẩu mới (override) hoặc mật khẩu mặc định
async function allowStudentPassword(mhs: string, password: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await supabase
    .from("account_overrides")
    .select("new_password")
    .eq("username", mhs)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const override = String((data as any)?.new_password || "").trim();

  // nếu đã đổi MK => chỉ cho login bằng override
  if (override) return password === override;

  // chưa đổi => cho login bằng MHS hoặc 123456 (tuỳ bạn)
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
  const st = students.find((s) => String(s?.mhs || "").trim() === mhs);
  return st || null;
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

      // ✅ FIX: add required fields
      setSession(res, { role: "ADMIN", mhs: null, username: "admin", name: "Admin" });
      return res;
    }

    // ✅ STUDENT (username = MHS)
    const mhs = username;

    const okPass = await allowStudentPassword(mhs, password);
    if (!okPass) {
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

    // ✅ FIX: add required fields
    setSession(res, {
      role: "STUDENT",
      mhs,
      username: mhs,
      name: student.name || mhs,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
