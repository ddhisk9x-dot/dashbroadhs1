// app/api/admin/get-students/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

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

  const students = (data?.students_json?.students as Student[]) || [];
  return Array.isArray(students) ? students : [];
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

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
