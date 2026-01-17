// app/api/account/reset-password/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearOverridePassword, clearSheetNewPassword } from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const mhs = String(body.mhs || "").trim(); // bạn reset theo MHS
  if (!mhs) return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });

  await clearOverridePassword(mhs);
  await clearSheetNewPassword(mhs, "teacher_reset");

  return NextResponse.json({ ok: true });
}
