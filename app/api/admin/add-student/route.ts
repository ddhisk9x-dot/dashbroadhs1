
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { mhs, name, className } = body;

    if (!mhs || !name || !className) {
        return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Reuse the existing write endpoint logic
    const url = process.env.ACCOUNTS_WRITE_URL;
    const secret = process.env.ACCOUNTS_WRITE_SECRET; // The script checks for 'secret' in body

    if (!url) return NextResponse.json({ ok: false, error: "Missing ACCOUNTS_WRITE_URL env" }, { status: 500 });

    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: secret || "123321", // Fallback if env not set for demo
                action: "add_student",
                mhs,
                name,
                className
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
