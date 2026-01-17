import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";
// nếu bạn có hàm check admin riêng thì import
// import { isAdmin } from "@/lib/admin";

function isAdmin(username: string, password: string) {
  // TODO: thay bằng logic admin thật của bạn
  // ví dụ dùng env:
  const u = process.env.ADMIN_USER || "";
  const p = process.env.ADMIN_PASS || "";
  return username === u && password === p;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "").trim();

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Missing username/password" }, { status: 400 });
  }

  // ✅ ADMIN login
  if (isAdmin(username, password)) {
    const res = NextResponse.json({ ok: true, role: "ADMIN" });
    setSession(res, { role: "ADMIN", mhs: null });
    return res;
  }

  // ✅ STUDENT login (ví dụ: dùng mhs làm username)
  // TODO: thay bằng logic check student thật của bạn (DB/sheet)
  // hiện tạm chặn
  return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
}
