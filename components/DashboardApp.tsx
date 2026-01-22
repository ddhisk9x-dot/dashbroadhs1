// components/DashboardApp.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Student, User, TaskTick } from "../types";
import { api } from "../services/clientApi";
import AdminDashboard from "./AdminDashboard";
import StudentView from "./StudentView";
import TeacherView from "./TeacherView";

type Toast = { type: "success" | "error"; message: string } | null;

function normalizeTicks(raw: any): TaskTick[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: TaskTick[] = [];
  for (const t of arr) {
    if (typeof t === "string") {
      // legacy: string date => coi như completed=true
      out.push({ date: t, completed: true });
      continue;
    }
    const d = String(t?.date ?? "").trim();
    if (!d) continue;
    out.push({ date: d, completed: !!t?.completed });
  }
  // unique by date (last wins)
  const m = new Map<string, TaskTick>();
  for (const x of out) m.set(x.date, x);
  return Array.from(m.values());
}

function upsertTick(ticks: TaskTick[], date: string, completed: boolean): TaskTick[] {
  const next = normalizeTicks(ticks);
  const idx = next.findIndex((t) => t.date === date);
  if (idx >= 0) next[idx] = { date, completed };
  else next.push({ date, completed });
  return next;
}

export default function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    // auto-load session by calling /api/student/me when not logged? (app logic cũ)
    // Ở dự án bạn đang dùng login form nên đoạn này chủ yếu giữ cấu trúc cũ.
    setLoading(false);
  }, []);

  async function handleLogin(username: string, password: string) {
    setLoading(true);
    setToast(null);
    try {
      const r = await api.login(username, password);
      if (!r.success || !r.user) {
        setToast({ type: "error", message: r.error || "Đăng nhập thất bại" });
        return;
      }
      setUser(r.user);

      if (r.user.role === "ADMIN" || r.user.role === "TEACHER") {
        const all = await api.getAllStudents();
        setStudents(all);
      } else {
        const me = await api.getStudentMe(r.user.username);
        setCurrentStudent(me);
      }

      setToast({ type: "success", message: "Đăng nhập thành công" });
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Lỗi đăng nhập" });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {}
    setUser(null);
    setStudents([]);
    setCurrentStudent(null);
  }

  // ✅ FIX: optimistic tick đúng kiểu TaskTick[]
  async function handleUpdateAction(actionId: string, date: string, completed: boolean) {
    if (!currentStudent) return;

    // optimistic update (đúng cấu trúc ticks)
    const updatedStudent: Student = {
      ...currentStudent,
      activeActions: (currentStudent.activeActions || []).map((a) => {
        if (a.id !== actionId) return a;
        return {
          ...a,
          ticks: upsertTick(a.ticks, date, completed),
        };
      }),
      actionsByMonth: currentStudent.actionsByMonth
        ? Object.fromEntries(
            Object.entries(currentStudent.actionsByMonth).map(([k, arr]) => [
              k,
              (arr || []).map((a) => {
                if (a.id !== actionId) return a;
                return { ...a, ticks: upsertTick(a.ticks, date, completed) };
              }),
            ])
          )
        : currentStudent.actionsByMonth,
    };

    setCurrentStudent(updatedStudent);

    try {
      // legacy signature (mhs, actionId, date, completed) vẫn giữ
      const r = await api.tick(currentStudent.mhs, actionId, date, completed);
      if (r.success && r.student) {
        setCurrentStudent(r.student);
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Tick failed" });
      // rollback
      setCurrentStudent(currentStudent);
    }
  }

  // ---- UI ----
  const role = user?.role || null;

  if (loading) {
    return <div className="p-6 text-slate-600">Loading...</div>;
  }

  // Login UI cũ của bạn nằm ở nơi khác (tùy dự án). Ở đây giữ cấu trúc render theo role.
  if (!user) {
    // Nếu dự án bạn có LoginForm component thì render tại đây
    return (
      <div className="p-6">
        <div className="text-slate-700">Bạn đang ở trạng thái chưa đăng nhập.</div>
        <div className="text-slate-500 text-sm">Hãy dùng form đăng nhập của dự án để login.</div>
        {toast ? (
          <div className={`mt-3 text-sm ${toast.type === "error" ? "text-red-600" : "text-emerald-600"}`}>
            {toast.message}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {toast ? (
        <div className="p-3">
          <div className={`text-sm ${toast.type === "error" ? "text-red-600" : "text-emerald-600"}`}>{toast.message}</div>
        </div>
      ) : null}

      {role === "ADMIN" ? (
        <AdminDashboard user={user} students={students} onLogout={handleLogout} setStudents={setStudents} />
      ) : role === "TEACHER" ? (
        <TeacherView user={user} students={students} onLogout={handleLogout} setStudents={setStudents} />
      ) : (
        <StudentView
          user={user}
          student={currentStudent}
          onLogout={handleLogout}
          onUpdateAction={handleUpdateAction}
          reloadMe={async () => {
            const me = await api.getStudentMe(user.username);
            setCurrentStudent(me);
          }}
        />
      )}
    </div>
  );
}
