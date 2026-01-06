import { NextResponse } from "next/server";
import { getAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const state = await getAppState();
  return NextResponse.json({ students: state.students || [] });
}
