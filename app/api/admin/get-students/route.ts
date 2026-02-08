// app/api/admin/get-students/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Student = {
  mhs: string;
  name: string;
  class: string;
  scores?: any[];
  aiReport?: any;
  actionsByMonth?: Record<string, any[]>;
  activeActions?: any[];
};

async function loadStudents(): Promise<Student[]> {
  const state = await getAppState();
  return Array.isArray(state.students) ? state.students : [];
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // RESTORE OLD LOGIC: Always read from main, ignore query params
    const all = await loadStudents();

    // ✅ ADMIN: thấy tất cả
    if (session.role === "ADMIN") {
      return NextResponse.json({
        ok: true,
        students: all,
        meta: { role: "ADMIN", username: session.username },
      });
    }

    // ✅ TEACHER: chỉ thấy lớp phụ trách
    if (session.role === "TEACHER") {
      const cls = String(session.teacherClass || "").trim();

      const filtered = all.filter((s) => String(s?.class || "").trim() === cls);

      return NextResponse.json({
        ok: true,
        students: filtered,
        meta: { role: "TEACHER", teacherClass: cls, username: session.username },
      });
    }

    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
