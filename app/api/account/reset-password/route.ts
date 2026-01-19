// app/api/account/reset-password/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";
import { fetchAccountsFromSheet, clearOverridePassword, clearSheetNewPassword } from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "TEACHER")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mhs = String(body?.mhs || "").trim();
    if (!mhs) return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });

    // Nếu là TEACHER -> check học sinh thuộc lớp phụ trách
    if (session.role === "TEACHER") {
      const state = await getAppState();
      const st = (state.students || []).find((s: any) => String(s?.mhs || "").trim() === mhs);
      if (!st) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

      const cls = String(st?.class || "").trim();
      if (cls !== String(session.teacherClass || "").trim()) {
        return NextResponse.json({ ok: false, error: "Forbidden (not your class)" }, { status: 403 });
      }
    }

    // đảm bảo tồn tại trên ACCOUNTS sheet
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs);
    if (!acc) return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });

    // 1) DB override: best-effort
    let dbCleared = false;
    let dbError: string | null = null;
    try {
      await clearOverridePassword(acc.username || mhs);
      dbCleared = true;
    } catch (e: any) {
      dbError = e?.message || "Clear DB override failed";
    }

    // 2) Sheet NEW_PASSWORD: best-effort
    let sheetCleared = false;
    let sheetError: string | null = null;
    try {
      if (process.env.ACCOUNTS_WRITE_URL && process.env.ACCOUNTS_WRITE_SECRET) {
        await clearSheetNewPassword(acc.username || mhs, session.role === "ADMIN" ? "admin_reset" : "teacher_reset");
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
    return NextResponse.json({ ok: false, error: e?.message || "Reset password failed" }, { status: 500 });
  }
}
