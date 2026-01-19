// app/api/admin/get-students/route.ts
import { NextResponse } from "next/server";
import { getAppState } from "@/lib/supabaseServer";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = await getAppState();
  const all = (state.students || []) as any[];

  // ADMIN: thấy tất cả
  if (session.role === "ADMIN") {
    return NextResponse.json({ students: all });
  }

  // TEACHER: chỉ thấy lớp phụ trách
  if (session.role === "TEACHER") {
    const cls = String(session.teacherClass || "").trim();
    const filtered = all.filter((s) => String(s?.class || "").trim() === cls);
    return NextResponse.json({
      students: filtered,
      meta: { role: "TEACHER", teacherClass: cls, teacherUsername: session.teacherUsername },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
