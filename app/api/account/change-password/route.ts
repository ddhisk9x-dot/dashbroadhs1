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

function norm(v: any): string {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = norm(body.currentPassword);
  const newPassword = norm(body.newPassword);

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "Missing currentPassword/newPassword" },
      { status: 400 }
    );
  }

  // Bạn dùng MHS làm tài khoản
  const username = norm(session.mhs);

  const accounts = await fetchAccountsFromSheet();
  const acc = accounts.get(username);

  if (!acc) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }

  // Password hiện tại hợp lệ theo thứ tự ưu tiên:
  // 1) DB override (nếu có)
  // 2) NEW_PASSWORD (trên sheet)
  // 3) DEFAULT_PASSWORD (trên sheet)
  // 4) fallback = MHS (username)
  const override = norm(await getOverridePassword(username));

  const effective =
    override ||
    norm((acc as any).newPassword) ||
    norm((acc as any).defaultPassword) ||
    norm((acc as any).mhs) ||
    username;

  if (norm(currentPassword) !== norm(effective)) {
    return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
  }

  // Lưu cả DB override + ghi lại NEW_PASSWORD trên sheet
  await setOverridePassword(username, norm((acc as any).mhs) || username, newPassword, "student_change");
  await writeSheetNewPassword(username, newPassword, "student_change");

  return NextResponse.json({ ok: true });
}
