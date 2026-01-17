import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";

// (tuỳ bạn) admin cứng bằng ENV
function isAdmin(username: string, password: string) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "admin";
  return username === u && password === p;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
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

    // ✅ STUDENT login (nếu bạn dùng MHS làm username)
    // Ở đây bạn đang login HS kiểu gì thì thay đoạn này cho đúng hệ của bạn.
    // Ví dụ tạm: không cho login nếu không phải admin
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
