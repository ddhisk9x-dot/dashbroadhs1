import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const session = getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getAppState();
  const mhs = String(session.mhs).trim();
  const student = (state.students || []).find((s: any) => String(s.mhs).trim() === mhs);

  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ student });
}
