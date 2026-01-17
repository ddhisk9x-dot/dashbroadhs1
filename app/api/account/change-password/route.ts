import { NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session";
import {
  fetchAccountsFromSheet,
  getOverridePassword,
  setOverridePassword,
  writeSheetNewPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ ok: false, error: "Missing currentPassword/newPassword" }, { status: 400 });
  }

  // session.role STUDENT sẽ có mhs, nhưng cần username để map
  // Nếu bạn đang dùng username = mhs thì đơn giản:
  const username = session.mhs ? String(session.mhs) : "";
  if (!username) return NextResponse.json({ ok: false, error: "Missing username in session" }, { status: 400 });

  const accounts = await fetchAccountsFromSheet();
  const acc = accounts.get(username);
  if (!acc) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

  const override = await getOverridePassword(username);
  const effective = override || acc.newPassword || acc.defaultPassword;

  if (currentPassword !== effective) {
    return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
  }

  // 1) save DB override
  await setOverridePassword(username, acc.mhs || session.mhs || "", newPassword, "student_change");

  // 2) write back to sheet
  await writeSheetNewPassword(username, newPassword, "student_change");

  // (optional) refresh session cookie (không bắt buộc)
  // setSession(...) nếu bạn muốn cập nhật thêm data trong session

  return NextResponse.json({ ok: true });
}
