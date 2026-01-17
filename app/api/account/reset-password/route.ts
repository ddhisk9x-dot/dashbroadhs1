import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  fetchAccountsFromSheet,
  clearOverridePassword,
  clearSheetNewPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";

/**
 * ADMIN reset mật khẩu học sinh về mặc định:
 * - Xoá password override trong DB (account_overrides)
 * - Xoá NEW_PASSWORD trên Google Sheet (nếu có cấu hình write)
 *
 * Body: { mhs: "2412..." }
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mhs = String(body?.mhs || "").trim();
    if (!mhs) {
      return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });
    }

    // 1) Đảm bảo học sinh tồn tại trên ACCOUNTS sheet (tránh reset nhầm mã)
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs);
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });
    }

    // 2) DB override: best-effort (không có row thì cũng ok)
    let dbCleared = false;
    let dbError: string | null = null;
    try {
      await clearOverridePassword(acc.username || mhs);
      dbCleared = true;
    } catch (e: any) {
      dbError = e?.message || "Clear DB override failed";
    }

    // 3) Sheet NEW_PASSWORD: best-effort (chỉ làm nếu có env)
    let sheetCleared = false;
    let sheetError: string | null = null;
    try {
      if (process.env.ACCOUNTS_WRITE_URL && process.env.ACCOUNTS_WRITE_SECRET) {
        await clearSheetNewPassword(acc.username || mhs, "teacher_reset");
        sheetCleared = true;
      } else {
        sheetError = "Missing env ACCOUNTS_WRITE_URL/ACCOUNTS_WRITE_SECRET (skip sheet clear)";
      }
    } catch (e: any) {
      sheetError = e?.message || "Clear sheet failed";
    }

    return NextResponse.json({
      ok: true,
      mhs: acc.mhs || mhs,
      username: acc.username || mhs,
      dbCleared,
      dbError,
      sheetCleared,
      sheetError,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Reset password failed" },
      { status: 500 }
    );
  }
}
