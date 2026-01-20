import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOverridePassword, setOverridePassword } from "@/lib/accounts";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { ok: false, error: "Missing currentPassword/newPassword" },
        { status: 400 }
      );
    }

    const adminUsername = "admin";

    const override = await getOverridePassword(adminUsername);
    const envAdminPass = String(process.env.ADMIN_PASSWORD || "").trim();

    const allowedCurrents = uniqNonEmpty([override, envAdminPass]);

    if (!allowedCurrents.includes(currentPassword)) {
      return NextResponse.json({ ok: false, error: "Wrong current password" }, { status: 400 });
    }

    if (allowedCurrents.includes(newPassword)) {
      return NextResponse.json({ ok: false, error: "New password must be different" }, { status: 400 });
    }

    await setOverridePassword(adminUsername, adminUsername, newPassword, "admin_change");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Change admin password failed" }, { status: 500 });
  }
}
