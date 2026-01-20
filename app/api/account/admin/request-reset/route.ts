import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function sign(raw: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function makeToken() {
  const secret = requiredEnv("APP_SECRET");
  const exp = Date.now() + 15 * 60 * 1000; // 15 phút
  const payload = JSON.stringify({ sub: "admin", exp });
  const b64 = b64url(Buffer.from(payload, "utf-8"));
  const sig = sign(payload, secret);
  return `${b64}.${sig}`;
}

async function sendResendEmail(to: string, subject: string, html: string) {
  const apiKey = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("MAIL_FROM");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || "Resend send failed");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (!adminEmail) throw new Error("Missing env: ADMIN_EMAIL");

    // Không leak thông tin: luôn trả ok
    if (email !== adminEmail) return NextResponse.json({ ok: true });

    const token = makeToken();
    const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
    const link = `${appUrl}/reset-admin?token=${encodeURIComponent(token)}`;

    await sendResendEmail(
      adminEmail,
      "Reset mật khẩu Admin",
      `
        <div style="font-family:Arial,sans-serif">
          <p>Bạn vừa yêu cầu reset mật khẩu Admin.</p>
          <p>Link có hiệu lực 15 phút:</p>
          <p><a href="${link}">${link}</a></p>
          <p>Nếu không phải bạn, hãy bỏ qua email này.</p>
        </div>
      `
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Request reset failed" }, { status: 500 });
  }
}
