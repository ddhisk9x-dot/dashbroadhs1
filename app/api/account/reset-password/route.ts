import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  clearOverridePassword,
  clearSheetNewPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  if (!username) return NextResponse.json({ ok: false, error: "Missing username" }, { status: 400 });

  // 1) clear DB override
  await clearOverridePassword(username);

  // 2) clear sheet NEW_PASSWORD => login sẽ quay về DEFAULT_PASSWORD
  await clearSheetNewPassword(username, "teacher_reset");

  return NextResponse.json({ ok: true });
}
