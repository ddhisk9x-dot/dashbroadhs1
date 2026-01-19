// lib/session.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";

const COOKIE_NAME = "dd_session";

export type SessionRole = "ADMIN" | "STUDENT" | "TEACHER";

export type SessionPayload =
  | { role: "ADMIN"; mhs: null; teacherClass?: null; username?: string; name?: string }
  | { role: "STUDENT"; mhs: string; teacherClass?: null; username?: string; name?: string }
  | { role: "TEACHER"; mhs: null; teacherClass: string; username: string; name?: string };

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function encode(payload: SessionPayload, secret: string): string {
  const raw = JSON.stringify(payload);
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  const sig = sign(raw, secret);
  return `${b64}.${sig}`;
}

function decode(value: string, secret: string): SessionPayload | null {
  const [b64, sig] = String(value || "").split(".");
  if (!b64 || !sig) return null;

  const raw = Buffer.from(b64, "base64").toString("utf-8");
  const expected = sign(raw, secret);
  if (sig !== expected) return null;

  try {
    const obj = JSON.parse(raw);

    // allow backward-compatible cookies
    const role = String(obj?.role || "").toUpperCase() as SessionRole;
    const mhs = obj?.mhs === null ? null : String(obj?.mhs || "").trim();
    const teacherClass = String(obj?.teacherClass || "").trim();
    const username = String(obj?.username || "").trim();
    const name = String(obj?.name || "").trim();

    if (role === "ADMIN") return { role: "ADMIN", mhs: null, teacherClass: null, username, name };
    if (role === "STUDENT") return mhs ? { role: "STUDENT", mhs, teacherClass: null, username: mhs, name } : null;
    if (role === "TEACHER") {
      if (!teacherClass || !username) return null;
      return { role: "TEACHER", mhs: null, teacherClass, username, name };
    }

    return null;
  } catch {
    return null;
  }
}

export function setSession(res: NextResponse, payload: SessionPayload) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("Missing env: APP_SECRET");

  const value = encode(payload, secret);

  // 30 days
  res.cookies.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  return decode(value, secret);
}

export function clearSession(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
