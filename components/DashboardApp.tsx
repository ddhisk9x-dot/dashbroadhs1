"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Student, StudyAction, TaskTick, User } from "../types";
import { api } from "../services/clientApi";
import StudentView from "./StudentView";
import TeacherView from "./TeacherView";

function LoginScreen({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (e: any) {
      setErr(e?.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <div className="text-xl font-bold text-slate-800">Đăng nhập</div>
        <div className="text-sm text-slate-500 mt-1">Admin / Giáo viên / Học sinh</div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Tài khoản</div>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-200"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin / gv... / MHS"
              autoComplete="username"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Mật khẩu</div>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
            />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 text-white py-2 font-semibold hover:bg-slate-800 disabled:opacity-60"
            type="submit"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}

function upsertTick(ticks: TaskTick[] | undefined, date: string, completed: boolean): TaskTick[] {
  const arr = Array.isArray(ticks) ? [...ticks] : [];
  const filtered = arr.filter((t) => String(t?.date || "") !== date);
  if (completed) filtered.push({ date, completed: true });
  return filtered;
}

function patchStudentTickEverywhere(st: Student, actionId: string, date: string, completed: boolean): Student {
  const patchActions = (actions: StudyAction[] | undefined): StudyAction[] => {
    const src = Array.isArray(actions) ? actions : [];
    return src.map((a) => {
      if (!a || a.id !== actionId) return a;
      return { ...a, ticks: upsertTick(a.ticks, date, completed) };
    });
  };

  const next: Student = { ...st };

  // update activeActions (backward compat)
  next.activeActions = patchActions(next.activeActions);

  // ✅ update actionsByMonth (tháng đang xem)
  if (next.actionsByMonth && typeof next.actionsByMonth === "object") {
    const abm: Record<string, StudyAction[]> = { ...(next.actionsByMonth as any) };
    for (const k of Object.keys(abm)) {
      abm[k] = patchActions(abm[k]);
    }
    next.actionsByMonth = abm;
  }

  return next;
}

export default function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Admin/Teacher data
  const [students, setStudents] = useState<Student[]>([]);

  // Student data
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);

  const view = useMemo(() => {
    if (!user) return "LOGIN";
    if (user.role === "STUDENT") return "STUDENT";
    return "TEACHER";
  }, [user]);

  async function loadMeAndData() {
    setLoading(true);
    try {
      const me = await fetch("/api/me", { credentials: "include" }).then((r) => r.json());
      if (me?.ok && me?.session) {
       const u: User = {
  username: String(me.session.username || "admin"),
  name: me.session.name || "User",
  role: me.session.role,
};

// (optional) nếu bạn vẫn muốn giữ teacherClass để dùng đâu đó
// thì gắn kiểu any để không vỡ type:
(u as any).teacherClass = me.session.teacherClass;
        setUser(u);

        if (u.role === "STUDENT") {
          const data = await api.getStudentMe(u.username);
          setCurrentStudent(data);
        } else {
          const list = await api.getAllStudents();
          setStudents(list);
        }
      } else {
        setUser(null);
        setStudents([]);
        setCurrentStudent(null);
      }
    } catch {
      setUser(null);
      setStudents([]);
      setCurrentStudent(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMeAndData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const res = await api.login(username, password);
    if (!res.success || !res.user) {
      throw new Error(res.error || "Đăng nhập thất bại");
    }
    setUser(res.user);

    if (res.user.role === "STUDENT") {
      const data = await api.getStudentMe(res.user.username);
      setCurrentStudent(data);
    } else {
      const list = await api.getAllStudents();
      setStudents(list);
    }
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStudents([]);
      setCurrentStudent(null);
    }
  };

  const onImportData = async (newStudents: Student[]) => {
    await api.importExcel(newStudents);
    const list = await api.getAllStudents();
    setStudents(list);
  };

  const onUpdateStudentReport = async (mhs: string, report: any, actions: StudyAction[], monthKey?: string) => {
    // Persist for admin flow (teacher route already persists separately)
    await api.saveReport(mhs, report, actions, monthKey);

    // Update local list (admin/teacher view)
    setStudents((prev) =>
      prev.map((s) => {
        if (String(s.mhs).trim() !== String(mhs).trim()) return s;
        return { ...s, aiReport: report, activeActions: actions };
      })
    );
  };

  // ✅ FIX: tick phải cập nhật cả actionsByMonth + activeActions (hoặc lấy student mới từ server)
  const handleUpdateAction = async (actionId: string, date: string, completed: boolean) => {
    if (!user || user.role !== "STUDENT") return;
    if (!currentStudent) return;

    // optimistic update (để UI đổi ngay)
    setCurrentStudent((prev) => (prev ? patchStudentTickEverywhere(prev, actionId, date, completed) : prev));

    try {
      const resp = await api.tick(user.username, actionId, date, completed);
      if (resp?.student) {
        setCurrentStudent(resp.student);
      } else {
        // fallback refetch
        const fresh = await api.getStudentMe(user.username);
        setCurrentStudent(fresh);
      }
    } catch {
      // rollback bằng refetch
      const fresh = await api.getStudentMe(user.username);
      setCurrentStudent(fresh);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-600">Đang tải...</div>;
  }

  if (view === "LOGIN") {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (view === "STUDENT") {
    return currentStudent ? (
      <StudentView student={currentStudent} onLogout={onLogout} onUpdateAction={handleUpdateAction} />
    ) : (
      <div className="p-6 text-slate-600">Đang tải dữ liệu học sinh...</div>
    );
  }

  return (
    <TeacherView
      students={students}
      onImportData={onImportData}
      onUpdateStudentReport={onUpdateStudentReport}
      onLogout={onLogout}
    />
  );
}
