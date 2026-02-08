
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { name, teacherClass, username, password, note } = body;

    if (!name || !username || !password) {
        return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const url = process.env.ACCOUNTS_WRITE_URL;
    const secret = process.env.ACCOUNTS_WRITE_SECRET;

    if (!url) return NextResponse.json({ ok: false, error: "Missing ACCOUNTS_WRITE_URL env" }, { status: 500 });

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: secret || "123321",
                action: "add_teacher",
                name,
                username,
                password,
                teacherClass,
                note
            })
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
            throw new Error(data?.error || "Script failed");
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
