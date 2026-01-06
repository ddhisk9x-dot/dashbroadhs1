import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "dd_session";

type SessionPayload = { role: "ADMIN" | "STUDENT"; mhs: string | null };

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

export function setSession(res: NextResponse, payload: SessionPayload) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("Missing env: APP_SECRET");
  const raw = JSON.stringify(payload);
  const value = Buffer.from(raw).toString("base64") + "." + sign(raw, secret);
  res.cookies.set(COOKIE_NAME, value, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function getSession(): SessionPayload | null {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;
  const value = cookies().get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;
  const raw = Buffer.from(b64, "base64").toString("utf-8");
  const expected = sign(raw, secret);
  if (sig !== expected) return null;
  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}
