// app/api/admin/tick-settings/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTickSettings, setTickSettings } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET: Lấy cấu hình khóa tick hiện tại
export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TEACHER")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const settings = await getTickSettings();
  return NextResponse.json({ ok: true, ...settings });
}

// POST: Cập nhật ngày khóa tick
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TEACHER")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const lockBeforeDate = body.lockBeforeDate || null;

  // Validate format if provided
  if (lockBeforeDate && !/^\d{4}-\d{2}-\d{2}$/.test(lockBeforeDate)) {
    return NextResponse.json({ ok: false, error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
  }

  try {
    await setTickSettings({ lockBeforeDate });
    return NextResponse.json({ ok: true, lockBeforeDate });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
