import type { Student, AIReport, StudyAction, User } from "../types";

async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });

  // Trả thông tin lỗi rõ ràng để debug nhanh
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

type LoginOk = { ok: true; user: User };
type LoginFail = { ok: false; error?: string };
type LoginResp = LoginOk | LoginFail;

export const api = {
  // Compatible with existing DashboardApp.tsx usage
  async login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const data = await jfetch<LoginResp>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      if (!data.ok) return { success: false, error: data.error || "Đăng nhập thất bại" };

      // server trả thẳng user chuẩn { username, name, role }
      return { success: true, user: data.user };
    } catch (e: any) {
      return { success: false, error: e?.message || "Lỗi kết nối server" };
    }
  },

  async logout(): Promise<void> {
    // logout không cần body
    await jfetch<{ ok: boolean }>("/api/logout", { method: "POST" });
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
    await jfetch<{ ok: boolean }>("/api/admin/save-students", {
      method: "POST",
      body: JSON.stringify({ students }),
    });
    return { success: true };
  },

  async saveReport(mhs: string, report: AIReport, actions: StudyAction[]): Promise<{ success: boolean; error?: string }> {
    await jfetch<{ ok: boolean }>("/api/admin/save-report", {
      method: "POST",
      body: JSON.stringify({ mhs, report, actions }),
    });
    return { success: true };
  },

  async tick(
    _mhs: string,
    actionId: string,
    date: string,
    completed: boolean
  ): Promise<{ success: boolean; student?: Student; error?: string }> {
    const data = await jfetch<{ student: Student }>("/api/student/tick", {
      method: "POST",
      body: JSON.stringify({ actionId, date, completed }),
    });
    return { success: true, student: data.student };
  },

  // Used by TeacherView directly
  async generateStudentReport(student: Student): Promise<any> {
    return jfetch("/api/ai/generate-report", {
      method: "POST",
      body: JSON.stringify({ student }),
    });
  },

  // (tuỳ bạn dùng) Đồng bộ Sheet: POST admin cookie
  async syncSheet(opts?: { mode?: "new_only" | "months"; selectedMonths?: string[] }) {
    return jfetch("/api/sync/sheets", {
      method: "POST",
      body: JSON.stringify(opts || { mode: "new_only" }),
    });
  },
};

// Backward-compatible named export
export const generateStudentReport = api.generateStudentReport;
