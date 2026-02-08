import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { mhs } = body;

    if (!mhs) {
        return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });
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
                action: "delete_student",
                mhs,
            }),
        });

        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.ok) {
            throw new Error(data?.error || "Script failed");
        }

        return NextResponse.json({ ok: true, message: data.message });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
