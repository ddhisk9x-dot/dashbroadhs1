import { NextResponse } from "next/server";
import { getAppState } from "@/lib/supabaseServer";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 });
  }

  // Admin/admin
  if (String(username).trim() === "admin" && String(password).trim() === "admin") {
    const res = NextResponse.json({ ok: true, role: "TEACHER", name: "Giáo viên" });
    setSession(res, { role: "ADMIN", mhs: null });
    return res;
  }

  // Student: MHS/MHS
  if (String(username).trim() !== String(password).trim()) {
    return NextResponse.json({ ok: false, error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
  }

  const state = await getAppState();
  const mhs = String(username).trim();
  const student = (state.students || []).find((s: any) => String(s.mhs).trim() === mhs);
  if (!student) {
    return NextResponse.json({ ok: false, error: "Mã học sinh không tồn tại (chưa import dữ liệu?)" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: "STUDENT", mhs, name: student.name || "Học sinh" });
  setSession(res, { role: "STUDENT", mhs });
  return res;
}
