// app/api/account/change-password/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  fetchAccountsFromSheet,
  getOverridePassword,
  setOverridePassword,
  writeSheetNewPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "").trim();
  const newPassword = String(body.newPassword || "").trim();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ ok: false, error: "Missing currentPassword/newPassword" }, { status: 400 });
  }

  const username = String(session.mhs).trim(); // bạn dùng MHS làm tài khoản

  const accounts = await fetchAccountsFromSheet();
  const acc = accounts.get(username);
  if (!acc) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

  const override = await getOverridePassword(username);
  const effective = override || acc.newPassword || acc.defaultPassword;

  if (currentPassword !== effective) {
    return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
  }

  await setOverridePassword(username, acc.mhs || username, newPassword, "student_change");
  await writeSheetNewPassword(username, newPassword, "student_change");

  return NextResponse.json({ ok: true });
}
