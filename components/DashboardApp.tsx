// components/DashboardApp.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Student, User, StudyAction, AIReport } from "../types";
import { api } from "../services/clientApi";
import StudentView from "./StudentView";
import TeacherView from "./TeacherView";

type Toast = { type: "success" | "error" | "info"; message: string };

export default function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentMe, setStudentMe] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<Toast | null>(null);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const t = toast ? setTimeout(() => setToast(null), 2500) : undefined;
    return () => {
      if (t) clearTimeout(t);
    };
  }, [toast]);

  async function loadAfterLogin(u: User) {
    setLoading(true);
    try {
      if (u.role === "ADMIN" || u.role === "TEACHER") {
        const list = await api.getAllStudents();
        setStudents(list || []);
      } else if (u.role === "STUDENT") {
        const st = await api.getStudentMe(u.username);
        setStudentMe(st);
      }
    } finally {
      setLoading(false);
    }
  }

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await api.login(loginUsername, loginPassword);
      if (!res.success || !res.user) {
        setToast({ type: "error", message: res.error || "Đăng nhập thất bại" });
        return;
      }
      setUser(res.user);
      setToast({ type: "success", message: "Đăng nhập thành công" });
      await loadAfterLogin(res.user);
    } finally {
      setLoginLoading(false);
    }
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      setUser(null);
      setStudents([]);
      setStudentMe(null);
      setLoginUsername("");
      setLoginPassword("");
      setToast({ type: "info", message: "Đã đăng xuất" });
    }
  };

  const handleUpdateAction = async (actionId: string, date: string, completed: boolean) => {
    if (!studentMe || !user) return;

    // optimistic
    setStudentMe((prev) => {
      if (!prev) return prev;
      const next: Student = { ...prev };

      const toggleInList = (arr: StudyAction[]) =>
        arr.map((a) => {
          if (a.id !== actionId) return a;
          const ticks = Array.isArray(a.ticks) ? [...a.ticks] : [];
          const has = ticks.includes(date);
          const wantOn = completed;

          if (wantOn && !has) ticks.push(date);
          if (!wantOn && has) return { ...a, ticks: ticks.filter((d) => d !== date) };
          return { ...a, ticks };
        });

      if (Array.isArray(next.activeActions)) next.activeActions = toggleInList(next.activeActions);

      if (next.actionsByMonth && typeof next.actionsByMonth === "object") {
        const abm: Record<string, StudyAction[]> = { ...next.actionsByMonth };
        for (const k of Object.keys(abm)) {
          if (Array.isArray(abm[k])) abm[k] = toggleInList(abm[k]);
        }
        next.actionsByMonth = abm;
      }

      return next;
    });

    try {
      const data = await api.tick(user.username, actionId, date, completed); // legacy signature OK
      if (data.student) setStudentMe(data.student);
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Tick lỗi" });
      try {
        const st = await api.getStudentMe(user.username);
        setStudentMe(st);
      } catch {
        // ignore
      }
    }
  };

  const view = useMemo(() => {
    if (!user) return "AUTH";
    if (user.role === "STUDENT") return "STUDENT";
    return "TEACHER";
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="text-2xl font-bold text-slate-900 mb-1">Quản lý Học tập</div>
          <div className="text-sm text-slate-500 mb-6">Đăng nhập để tiếp tục</div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Tài khoản</label>
              <input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="admin / MHS / GV..."
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Mật khẩu</label>
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full rounded-xl bg-slate-900 text-white py-2 font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {loginLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          {toast && (
            <div
              className={`mt-4 text-sm rounded-xl px-3 py-2 ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : toast.type === "error"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-slate-50 text-slate-700 border border-slate-200"
              }`}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`text-sm rounded-xl px-3 py-2 shadow border ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : toast.type === "error"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-slate-600">Đang tải...</div>
      ) : view === "STUDENT" ? (
        <StudentView user={user} student={studentMe} onLogout={onLogout} onUpdateAction={handleUpdateAction} />
      ) : (
        <TeacherView user={user} students={students} setStudents={setStudents} onLogout={onLogout} />
      )}
    </div>
  );
}
