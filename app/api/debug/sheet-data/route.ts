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
        const displayRow1 = Array.isArray(json.displayRow1) ? json.displayRow1 : null;

        // Extract unique months from row 1 (raw values - might be wrong due to arithmetic)
        const monthsRaw = monthRow
            .map((v: any, i: number) => ({ index: i, rawValue: v, asString: String(v || "").trim() }))
            .filter((m: any) => m.asString);

        // Extract months from displayRow1 (text values - correct)
        const monthsDisplay = displayRow1
            ? displayRow1
                .map((v: string, i: number) => ({ index: i, value: String(v || "").trim() }))
                .filter((m: any) => m.value)
            : null;

        return NextResponse.json({
            ok: true,
            totalRows: rows.length,
            monthRowRaw: monthsRaw.slice(-10), // Last 10 for debugging
            monthRowDisplay: monthsDisplay ? monthsDisplay.slice(-10) : "NOT AVAILABLE - Update Apps Script",
            headerRow: rows[1] ? (rows[1] as any[]).slice(0, 20) : null,
            sampleDataRow: rows[2] ? (rows[2] as any[]).slice(0, 20) : null,
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" });
    }
}
