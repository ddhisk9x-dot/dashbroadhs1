// app/api/student/tick/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { upsertTick } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<{
    actionId: string;
    date: string;
    completed: boolean;
  }>;

  const actionId = String(body.actionId || "").trim();
  const date = String(body.date || "").trim();
  const completed = body.completed;

  if (!actionId || !date || typeof completed !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const mhs = String(session.mhs).trim();

  try {
    // ✅ NEW: Just 1 lightweight INSERT/UPDATE — no reading full JSON blob!
    await upsertTick(mhs, actionId, date, completed);
  } catch (e: any) {
    console.error("Tick upsert failed:", e);
    return NextResponse.json({ error: "Failed to save tick" }, { status: 500 });
  }

  // ✅ Tick saved — return lightweight response.
  // Frontend uses optimistic update, no need to read heavy JSON blob.
  return NextResponse.json({ ok: true, tickSaved: true });
}
