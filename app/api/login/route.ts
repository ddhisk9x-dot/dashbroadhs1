// app/api/login/route.ts
import { NextResponse } from "next/server";
import { fetchAccountsFromSheet, getOverridePassword } from "@/lib/accounts";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";

// ENV optional:
// ADMIN_USERNAME=admin
// ADMIN_PASSWORD=123456
function isAdmin(username: string, password: string) {
  const au = process.env.ADMIN_USERNAME || "";
  const ap = process.env.ADMIN_PASSWORD || "";
  return au && ap && username === au && password === ap;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Missing username/password" }, { status: 400 });
  }

  // ADMIN login (nếu dùng)
  if (isAdmin(username, password)) {
    await setSession({ role: "ADMIN", mhs: null });
    return NextResponse.json({ ok: true, role: "ADMIN" });
  }

  // STUDENT login: bạn dùng MHS làm tài khoản
  const accounts = await fetchAccountsFromSheet();

  // ưu tiên key = MHS
  const acc = accounts.get(username);
  if (!acc) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

  const override = await getOverridePassword(username); // username == mhs
  const effective = override || acc.newPassword || acc.defaultPassword;

  if (password !== effective) {
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  await setSession({ role: "STUDENT", mhs: acc.mhs || username });
  return NextResponse.json({ ok: true, role: "STUDENT", mhs: acc.mhs || username, name: acc.name || "" });
}
