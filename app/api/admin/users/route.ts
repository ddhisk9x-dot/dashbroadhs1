
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchTeachersFromSheet } from "@/lib/teachers";

export const runtime = "nodejs";

export async function GET() {
    try {
        const session = await getSession();
        // Allow admin only
        if (!session || session.role !== "ADMIN") {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
        }

        const teacherMap = await fetchTeachersFromSheet();
        const teachers = Array.from(teacherMap.values()).map(t => ({
            username: t.username,
            name: t.teacherName,
            role: "TEACHER",
            teacherClass: t.teacherClass || ""
        }));

        // Add Admin user manually since it's environment based
        const users = [
            { username: "admin", name: "Quản trị viên", role: "ADMIN", teacherClass: "" },
            ...teachers
        ];

        return NextResponse.json({ ok: true, users });

    } catch (e: any) {
        console.error("Fetch users error:", e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
