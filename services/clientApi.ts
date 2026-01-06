import type { Student, AIReport, StudyAction, User } from "../types";

async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Compatible with existing App.tsx usage
  async login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const data = await jfetch<{ ok: boolean; role?: string; mhs?: string; error?: string; name?: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!data.ok) return { success: false, error: data.error || "Đăng nhập thất bại" };
    const role = (data.role || "").toUpperCase();
    const user: User = {
      username: data.mhs || username,
      name: data.name || (role === "ADMIN" ? "Admin" : "Học sinh"),
      role: role as any,
    };
    return { success: true, user };
  },

  async logout(): Promise<void> {
    await jfetch("/api/logout", { method: "POST", body: "{}" });
  },

  async getAllStudents(): Promise<Student[]> {
    const data = await jfetch<{ students: Student[] }>("/api/admin/get-students");
    return data.students || [];
  },

  async getStudentMe(_mhs: string): Promise<Student> {
    const data = await jfetch<{ student: Student }>("/api/student/me");
    return data.student;
  },

  async importExcel(students: Student[]): Promise<{ success: boolean; error?: string }> {
    await jfetch("/api/admin/save-students", { method: "POST", body: JSON.stringify({ students }) });
    return { success: true };
  },

  async saveReport(mhs: string, report: AIReport, actions: StudyAction[]): Promise<{ success: boolean; error?: string }> {
    await jfetch("/api/admin/save-report", { method: "POST", body: JSON.stringify({ mhs, report, actions }) });
    return { success: true };
  },

  async tick(_mhs: string, actionId: string, date: string, completed: boolean): Promise<{ success: boolean; student?: Student; error?: string }> {
    const data = await jfetch<{ student: Student }>("/api/student/tick", { method: "POST", body: JSON.stringify({ actionId, date, completed }) });
    return { success: true, student: data.student };
  },

  // Used by TeacherView directly
  async generateStudentReport(student: Student): Promise<any> {
    return jfetch("/api/ai/generate-report", { method: "POST", body: JSON.stringify({ student }) });
  },
};


// Backward-compatible named export
export const generateStudentReport = api.generateStudentReport;
