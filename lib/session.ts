// lib/session.ts
import { cookies } from "next/headers";
import crypto from "crypto";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "dd_session";

export type AdminSession = {
  role: "ADMIN";
  username: string;
  name?: string;
  mhs: null;
};

export type TeacherSession = {
  role: "TEACHER";
  username: string;
  name?: string;
  teacherClass: string;
  mhs: null;
};

export type StudentSession = {
  role: "STUDENT";
  username: string; // = mhs
  name?: string;
  mhs: string;
};

export type SessionPayload = AdminSession | TeacherSession | StudentSession;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

export function setSession(res: NextResponse, payload: SessionPayload) {
  const secret = requiredEnv("APP_SECRET");
  const raw = JSON.stringify(payload);
  const b64 = Buffer.from(raw, "utf-8").toString("base64");
  const sig = sign(raw, secret);
  const value = `${b64}.${sig}`;

  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const store = cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  let raw = "";
  try {
    raw = Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return null;
  }

  const expected = sign(raw, secret);
  if (sig !== expected) return null;

  try {
    const obj = JSON.parse(raw) as SessionPayload;
    if (!obj || typeof obj !== "object") return null;
    if (obj.role === "ADMIN") return obj;
    if (obj.role === "TEACHER") return obj;
    if (obj.role === "STUDENT") return obj;
    return null;
  } catch {
    return null;
  }
}
