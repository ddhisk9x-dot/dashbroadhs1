import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mhs = searchParams.get("mhs");

    if (!mhs) {
        return NextResponse.json({ error: "Missing mhs" }, { status: 400 });
    }

    const scriptUrl = process.env.APPS_SCRIPT_URL;
    if (!scriptUrl) {
        return NextResponse.json({ error: "Missing env APPS_SCRIPT_URL" }, { status: 500 });
    }

    try {
        const url = `${scriptUrl}?action=get_history&mhs=${encodeURIComponent(mhs)}`;
        const res = await fetch(url, { cache: "no-store", redirect: "follow" });

        if (!res.ok) {
            throw new Error(`Fetch failed: ${res.status}`);
        }

        const json = await res.json();
        return NextResponse.json(json);
    } catch (e: any) {
        console.error("History fetch error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
