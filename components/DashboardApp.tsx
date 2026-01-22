// components/DashboardApp.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Student, AIReport, StudyAction, User } from "../types";
import { api } from "../services/clientApi";
import { AuthScreen } from "./AuthScreen";
import { AdminView } from "./AdminView";
import { TeacherView } from "./TeacherView";
import { StudentView } from "./StudentView";

export default function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshStudents = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getAllStudents();
      setStudents(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN" || user?.role === "TEACHER") refreshStudents();
  }, [user, refreshStudents]);

  const onLogin = useCallback(async (username: string, password: string) => {
    setError(null);
    const res = await api.login(username, password);
    if (!res.success || !res.user) {
      setError(res.error || "Đăng nhập thất bại");
      return;
    }
    setUser(res.user);
  }, []);

  const onLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    setUser(null);
    setStudents([]);
  }, []);

  const onImportExcel = useCallback(async (newStudents: Student[]) => {
    setLoading(true);
    try {
      await api.importExcel(newStudents);
      await refreshStudents();
    } catch (e: any) {
      setError(e?.message || "Lỗi import");
    } finally {
      setLoading(false);
    }
  }, [refreshStudents]);

  const onSaveReport = useCallback(
    async (mhs: string, report: AIReport, actions: StudyAction[], monthKey?: string) => {
      setLoading(true);
      try {
        await api.saveReport(mhs, report, actions, monthKey);
        await refreshStudents();
      } catch (e: any) {
        setError(e?.message || "Lỗi lưu báo cáo");
      } finally {
        setLoading(false);
      }
    },
    [refreshStudents]
  );

  const onSyncSheet = useCallback(async (opts?: { mode?: "new_only" | "months"; selectedMonths?: string[] }) => {
    setLoading(true);
    try {
      await api.syncSheet(opts);
      await refreshStudents();
    } catch (e: any) {
      setError(e?.message || "Lỗi đồng bộ sheet");
    } finally {
      setLoading(false);
    }
  }, [refreshStudents]);

  const onGenerateReport = useCallback(async (student: Student) => {
    setLoading(true);
    try {
      const report = await api.generateStudentReport(student);
      setError(null);
      return report;
    } catch (e: any) {
      setError(e?.message || "Lỗi AI");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const onTick = useCallback(
    async (actionId: string, date: string, completed: boolean) => {
      if (!user) return;
      try {
        // ✅ legacy call giữ nguyên: (mhs, actionId, date, completed)
        await api.tick(user.username, actionId, date, completed);
        // refresh student view data
      } catch (e: any) {
        setError(e?.message || "Lỗi tick");
      }
    },
    [user]
  );

  const meStudent = useMemo(() => {
    if (!user || user.role !== "STUDENT") return null;
    return students.find((s) => String(s.mhs) === String(user.username)) || null;
  }, [user, students]);

  if (!user) return <AuthScreen onLogin={onLogin} error={error} />;

  if (user.role === "ADMIN") {
    return (
      <AdminView
        user={user}
        students={students}
        loading={loading}
        error={error}
        onLogout={onLogout}
        onImportExcel={onImportExcel}
        onSaveReport={onSaveReport}
        onGenerateReport={onGenerateReport}
        onSyncSheet={onSyncSheet}
        onRefresh={refreshStudents}
      />
    );
  }

  if (user.role === "TEACHER") {
    return (
      <TeacherView
        user={user}
        students={students}
        loading={loading}
        error={error}
        onLogout={onLogout}
        onGenerateReport={onGenerateReport}
        onSaveReport={onSaveReport}
        onSyncSheet={onSyncSheet}
        onRefresh={refreshStudents}
      />
    );
  }

  // STUDENT
  return (
    <StudentView
      user={user}
      student={meStudent}
      loading={loading}
      error={error}
      onLogout={onLogout}
      onTick={onTick}
    />
  );
}
