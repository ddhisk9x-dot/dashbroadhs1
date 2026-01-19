// app/api/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setSession } from "@/lib/session";
import { fetchAccountsFromSheet, getOverridePassword } from "@/lib/accounts";
import { fetchTeachersFromSheet } from "@/lib/teachers";

export const runtime = "nodejs";

function isAdmin(username: string, password: string) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "admin";
  return username === u && password === p;
}

function uniqNonEmpty(arr: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function findStudentByMhs(mhs: string) {
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
  return st || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "").trim();

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Missing username/password" }, { status: 400 });
    }

    // ✅ ADMIN
    if (isAdmin(username, password)) {
      const res = NextResponse.json({
        ok: true,
        user: { username: "admin", name: "Admin", role: "ADMIN" },
      });
      setSession(res, { role: "ADMIN", mhs: null });
      return res;
    }

    // ✅ TEACHER (GVCN) - check trước STUDENT để không bị hiểu nhầm
    // Rule: giống HS
    // 1) override DB (key = teacher.username) => ONLY override
    // 2) else sheet NEW_PASSWORD => ONLY new
    // 3) else sheet DEFAULT_PASSWORD => ONLY default
    try {
      const teachers = await fetchTeachersFromSheet();
      const t = teachers.get(username);

      if (t) {
        const override = await getOverridePassword(t.username);
        const effective =
          (override && override.trim()) ||
          (t.newPassword && t.newPassword.trim()) ||
          (t.defaultPassword && t.defaultPassword.trim()) ||
          "";

        if (!effective) {
          return NextResponse.json({ ok: false, error: "No teacher password configured" }, { status: 500 });
        }

        const allowed = uniqNonEmpty([effective]);
        if (!allowed.includes(password)) {
          return NextResponse.json({ ok: false, error: "Sai mật khẩu" }, { status: 401 });
        }

        const res = NextResponse.json({
          ok: true,
          user: { username: t.username, name: t.gvcnName || t.username, role: "TEACHER" },
        });

        setSession(res, {
          role: "TEACHER",
          mhs: null,
          teacherUsername: t.username,
          teacherClass: t.class,
          teacherName: t.gvcnName || "",
        });

        return res;
      }
    } catch {
      // nếu TEACHERS_CSV_URL chưa set thì bỏ qua TEACHER login, không làm hỏng STUDENT login
    }

    // ✅ STUDENT (username = MHS)
    const mhs = username;

    // Must exist in app_state
    const student = await findStudentByMhs(mhs);
    if (!student) {
      return NextResponse.json({ ok: false, error: "Không tìm thấy học sinh" }, { status: 404 });
    }

    // Read accounts sheet row
    const accounts = await fetchAccountsFromSheet();
    const acc = accounts.get(mhs);
    if (!acc) {
      return NextResponse.json({ ok: false, error: "Account not found in sheet" }, { status: 404 });
    }

    // Effective password rules (STRICT):
    // 1) override DB => ONLY override
    // 2) else sheet NEW_PASSWORD => ONLY new
    // 3) else sheet DEFAULT_PASSWORD => ONLY default
    const override = await getOverridePassword(acc.username || mhs);
    const effective =
      (override && override.trim()) ||
      (acc.newPassword && acc.newPassword.trim()) ||
      (acc.defaultPassword && acc.defaultPassword.trim()) ||
      "";

    if (!effective) {
      return NextResponse.json({ ok: false, error: "No password configured" }, { status: 500 });
    }

    const allowed = uniqNonEmpty([effective]);
    if (!allowed.includes(password)) {
      return NextResponse.json({ ok: false, error: "Sai mật khẩu" }, { status: 401 });
    }

    const res = NextResponse.json({
      ok: true,
      user: { username: mhs, name: student.name || mhs, role: "STUDENT" },
    });
    setSession(res, { role: "STUDENT", mhs });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
