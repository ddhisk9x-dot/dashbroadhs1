// lib/session.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "dd_session";

export type SessionRole = "ADMIN" | "STUDENT" | "TEACHER";

export type TeacherInfo = {
  username: string; // tài khoản đăng nhập teacher
  name?: string;    // tên hiển thị (optional)
  class: string;    // lớp phụ trách (vd: "8A1")
};

export type SessionPayload = {
  role: SessionRole;
  mhs: string | null;        // dùng cho STUDENT (giữ tương thích)
  teacher?: TeacherInfo;     // dùng cho TEACHER
};

function sign(raw: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

function isObj(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sanitizeSession(obj: any): SessionPayload | null {
  if (!isObj(obj)) return null;

  const role = String(obj.role || "").trim() as SessionRole;
  if (role !== "ADMIN" && role !== "STUDENT" && role !== "TEACHER") return null;

  const mhsRaw = obj.mhs;
  const mhs =
    mhsRaw === null || mhsRaw === undefined ? null : String(mhsRaw).trim();

  const base: SessionPayload = { role, mhs: mhs || null };

  if (role === "TEACHER") {
    const t = obj.teacher;
    if (!isObj(t)) return null;
    const username = String(t.username || "").trim();
    const name = String(t.name || "").trim();
    const cls = String(t.class || "").trim();

    if (!username || !cls) return null;

    base.mhs = null; // teacher không dùng mhs
    base.teacher = {
      username,
      ...(name ? { name } : {}),
      class: cls,
    };
  }

  if (role === "STUDENT") {
    if (!base.mhs) return null; // student bắt buộc có mhs
  }

  // ADMIN: mhs có thể null (giữ như cũ)
  return base;
}

export function setSession(res: NextResponse, payload: SessionPayload) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("Missing env: APP_SECRET");

  const clean = sanitizeSession(payload);
  if (!clean) throw new Error("Invalid session payload");

  const raw = JSON.stringify(clean);
  const value = Buffer.from(raw).toString("base64") + "." + sign(raw, secret);

  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  const raw = Buffer.from(b64, "base64").toString("utf-8");
  const expected = sign(raw, secret);
  if (sig !== expected) return null;

  try {
    const parsed = JSON.parse(raw);
    return sanitizeSession(parsed);
  } catch {
    return null;
  }
}
