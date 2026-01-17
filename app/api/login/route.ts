import { NextResponse } from "next/server";
import { setSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";
import { fetchAccountsFromSheet, getOverridePassword } from "@/lib/accounts";

export const runtime = "nodejs";

function isAdmin(username: string, password: string) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "admin";
  return username === u && password === p;
}

async function findStudentByMhs(mhs: string) {
  const state = await getAppState();
  const students = (state?.students || []) as any[];
  return students.find((s) => String(s?.mhs || "").trim() === String(mhs).trim()) || null;
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

    // 1) must exist in app_state
    const student = await findStudentByMhs(mhs);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy học sinh" }, { status: 404 });
    }

    // 2) read passwords
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs); // bạn dùng MHS làm key
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in ACCOUNTS sheet" }, { status: 404 });
    }

    const override = await getOverridePassword(mhs); // DB override
    const sheetNew = String(acc.newPassword || "").trim();
    const sheetDefault = String(acc.defaultPassword || "").trim();

    const effective = (override || sheetNew || sheetDefault || "").trim();
    if (!effective) {
      return NextResponse.json({ ok: false, error: "Account has no password set" }, { status: 500 });
    }

    // ✅ rule: if has override OR sheetNew => ONLY accept that effective
    // (tức là đổi xong không còn dùng MHS/123456/mặc định nữa)
    if (password !== effective) {
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
