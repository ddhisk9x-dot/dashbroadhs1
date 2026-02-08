// app/api/debug/sheet-data/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const baseUrl = process.env.APPS_SCRIPT_URL;
    if (!baseUrl) {
        return NextResponse.json({ ok: false, error: "Missing APPS_SCRIPT_URL" });
    }

    try {
        const url = `${baseUrl}?action=get_data&sheet=DIEM_2526`;
        const resp = await fetch(url, { cache: "no-store", redirect: "follow" });
        const json = await resp.json();

        if (!json.ok || !Array.isArray(json.data)) {
            return NextResponse.json({ ok: false, error: json.error || "No data" });
        }

        const rows = json.data;
        const monthRow = rows[0] || [];
        const headerRow = rows[1] || [];

        // Extract unique months from row 1
        const months = monthRow
            .map((v: any, i: number) => ({ index: i, value: String(v || "").trim() }))
            .filter((m: any) => m.value);

        return NextResponse.json({
            ok: true,
            totalRows: rows.length,
            monthRow: months,
            headerRow: headerRow.slice(0, 20),
            sampleDataRow: rows[2] ? rows[2].slice(0, 20) : null,
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" });
    }
}
