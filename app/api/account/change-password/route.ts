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

function uniqNonEmpty(arr: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || "").trim();
  const newPassword = String(body.newPassword || "").trim();

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "Missing currentPassword/newPassword" },
      { status: 400 }
    );
  }

  const username = String(session.mhs).trim(); // dùng MHS làm tài khoản

  const accounts = await fetchAccountsFromSheet();

  // lookup linh hoạt: ưu tiên mhs, nếu không có thì thử username
  const acc = accounts.get(username) || accounts.get(String(body.username || "").trim());
  if (!acc) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

  const override = await getOverridePassword(username);

  // ✅ CHỐT: chấp nhận "mật khẩu hiện tại" là 1 trong các giá trị sau:
  // - override (DB)
  // - NEW_PASSWORD (sheet)
  // - DEFAULT_PASSWORD (sheet)
  // - username (MHS)  => vì bạn cho phép MK = MHS
  const allowedCurrents = uniqNonEmpty([override, acc.newPassword, acc.defaultPassword, username]);

  if (!allowedCurrents.includes(currentPassword)) {
    return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
  }

  // (tùy chọn) chặn đổi MK trùng MK cũ
  if (allowedCurrents.includes(newPassword)) {
    return NextResponse.json(
      { ok: false, error: "New password must be different" },
      { status: 400 }
    );
  }

  // Ghi DB override trước (ưu tiên chạy được ngay)
  await setOverridePassword(username, acc.mhs || username, newPassword, "student_change");

  // Sau đó ghi sheet NEW_PASSWORD
  await writeSheetNewPassword(username, newPassword, "student_change");

  return NextResponse.json({ ok: true });
}
