// lib/session.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const COOKIE_NAME = "dd_session";

export type AdminSession = {
  role: "ADMIN";
  mhs: null;
  username: string;
  name?: string;
};

export type StudentSession = {
  role: "STUDENT";
  mhs: string;
  username: string;
  name?: string;
};

export type TeacherSession = {
  role: "TEACHER";
  mhs: null;
  username: string; // login username
  teacherUsername: string; // alias for clarity (used by your routes)
  teacherClass: string;
  name?: string;
};

export type SessionPayload = AdminSession | StudentSession | TeacherSession;

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function encode(payload: SessionPayload, secret: string) {
  const raw = JSON.stringify(payload);
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  const sig = sign(raw, secret);
  return `${b64}.${sig}`;
}

function decode(value: string, secret: string): SessionPayload | null {
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  const raw = Buffer.from(b64, "base64").toString("utf-8");
  const expected = sign(raw, secret);
  if (sig !== expected) return null;

  try {
    const parsed = JSON.parse(raw) as any;

    // normalize for backward/forward compatibility
    if (parsed?.role === "TEACHER") {
      const username = String(parsed.username || "").trim();
      const teacherUsername = String(parsed.teacherUsername || "").trim() || username;
      const teacherClass = String(parsed.teacherClass || "").trim();

      return {
        role: "TEACHER",
        mhs: null,
        username,
        teacherUsername,
        teacherClass,
        name: parsed.name ? String(parsed.name) : undefined,
      };
    }

    if (parsed?.role === "STUDENT") {
      const mhs = String(parsed.mhs || "").trim();
      const username = String(parsed.username || parsed.mhs || "").trim();
      return {
        role: "STUDENT",
        mhs,
        username,
        name: parsed.name ? String(parsed.name) : undefined,
      };
    }

    if (parsed?.role === "ADMIN") {
      const username = String(parsed.username || "admin").trim();
      return {
        role: "ADMIN",
        mhs: null,
        username,
        name: parsed.name ? String(parsed.name) : undefined,
      };
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

  res.cookies.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
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
