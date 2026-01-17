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
  try {
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

    const username = String(session.mhs).trim(); // MHS làm tài khoản

    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(username);
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });
    }

    const override = await getOverridePassword(username);

    const allowedCurrents = uniqNonEmpty([override, acc.newPassword, acc.defaultPassword, username]);

    if (!allowedCurrents.includes(currentPassword)) {
      return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
    }

    if (allowedCurrents.includes(newPassword)) {
      return NextResponse.json(
        { ok: false, error: "New password must be different" },
        { status: 400 }
      );
    }

    // 1) DB override: MUST succeed
    await setOverridePassword(username, acc.mhs || username, newPassword, "student_change");

    // 2) Sheet write: best-effort (nếu lỗi vẫn đổi MK được vì DB override đã cập nhật)
    let sheetWritten = false;
    let sheetError: string | null = null;

    try {
      // nếu bạn chưa set env ghi sheet, đừng làm fail cả đổi mật khẩu
      if (process.env.ACCOUNTS_WRITE_URL && process.env.ACCOUNTS_WRITE_SECRET) {
        await writeSheetNewPassword(username, newPassword, "student_change");
        sheetWritten = true;
      } else {
        sheetError = "Missing env ACCOUNTS_WRITE_URL/ACCOUNTS_WRITE_SECRET (skip sheet write)";
      }
    } catch (e: any) {
      sheetError = e?.message || "Write sheet failed";
    }

    return NextResponse.json({
      ok: true,
      sheetWritten,
      sheetError,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Change password failed" },
      { status: 500 }
    );
  }
}
