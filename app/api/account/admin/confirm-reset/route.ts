import { NextResponse } from "next/server";
import crypto from "crypto";
import { setOverridePassword } from "@/lib/accounts";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function unb64url(s: string) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

function sign(raw: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function verifyToken(token: string) {
  const secret = requiredEnv("APP_SECRET");
  const [b64, sig] = String(token || "").split(".");
  if (!b64 || !sig) throw new Error("Invalid token");
  const raw = unb64url(b64);
  const expected = sign(raw, secret);
  if (sig !== expected) throw new Error("Invalid token");

  const payload = JSON.parse(raw) as any;
  if (!payload || payload.sub !== "admin") throw new Error("Invalid token");
  if (!payload.exp || Date.now() > Number(payload.exp)) throw new Error("Token expired");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "").trim();
    if (!token || !newPassword) {
      return NextResponse.json({ ok: false, error: "Missing token/newPassword" }, { status: 400 });
    }

    verifyToken(token);

    const adminUsername = "admin";
    await setOverridePassword(adminUsername, adminUsername, newPassword, "admin_reset_email");

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Confirm reset failed" }, { status: 500 });
  }
}
