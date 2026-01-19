// app/api/account/reset-password/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import {
  fetchAccountsFromSheet,
  clearOverridePassword,
  clearSheetNewPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";

async function getStudentClassFromState(mhs: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", "main")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const students = (data?.students_json?.students as any[]) || [];
  const st = students.find((s) => String(s?.mhs || "").trim() === mhs);
  if (!st) return null;
  return String(st?.class || "").trim() || null;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "TEACHER")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mhs = String(body?.mhs || "").trim();
    if (!mhs) {
      return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });
    }

    // Nếu là TEACHER => chỉ reset HS thuộc lớp mình
    if (session.role === "TEACHER") {
      const stClass = await getStudentClassFromState(mhs);
      if (!stClass) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

      const cls = String(session.teacherClass || "").trim();
      if (stClass !== cls) {
        return NextResponse.json({ ok: false, error: "Forbidden (not your class)" }, { status: 403 });
      }
    }

    // 1) Đảm bảo account tồn tại trên ACCOUNTS sheet
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs);
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });
    }

    // 2) DB override: best-effort
    let dbCleared = false;
    let dbError: string | null = null;
    try {
      await clearOverridePassword(acc.username || mhs);
      dbCleared = true;
    } catch (e: any) {
      dbError = e?.message || "Clear DB override failed";
    }

    // 3) Sheet NEW_PASSWORD: best-effort
    let sheetCleared = false;
    let sheetError: string | null = null;
    try {
      if (process.env.ACCOUNTS_WRITE_URL && process.env.ACCOUNTS_WRITE_SECRET) {
        await clearSheetNewPassword(acc.username || mhs, session.role === "TEACHER" ? "teacher_reset" : "admin_reset");
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
