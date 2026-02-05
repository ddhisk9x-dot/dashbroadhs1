export enum Role {
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
  ADMIN = "ADMIN",
}

export interface User {
  username: string;
  name: string;
  role: Role;
}

export interface ScoreData {
  month: string; // e.g., "2025-08"
  math: number | null;
  lit: number | null;
  eng: number | null;
}

export interface TaskTick {
  date: string; // ISO date string YYYY-MM-DD
  completed: boolean;
}

export interface StudyAction {
  id: string;
  description: string;
  frequency: string; // e.g., "Hàng ngày", "3 lần/tuần"
  ticks: TaskTick[];
}

export interface StudySession {
  day: string; // e.g., "Thứ 2"
  subject: string;
  duration: string;
  content: string;
}

export interface AIReport {
  generatedAt: string;
  overview: string;
  riskLevel: "Thấp" | "Trung bình" | "Cao";
  strengths: string[];
  risks: string[];
  bySubject: {
    math: { status: string; action: string };
    lit: { status: string; action: string };
    eng: { status: string; action: string };
  };
  actions: { description: string; frequency: string }[];
  studyPlan: StudySession[];
  messageToStudent: string;
  teacherNotes: string;
  disclaimer?: string; // optional để không vỡ dữ liệu cũ
}

export interface Student {
  mhs: string; // Unique ID
  name: string;
  class: string;
  scores: ScoreData[];
  aiReport?: AIReport;

  // cũ (vẫn giữ để tương thích)
  activeActions: StudyAction[];

  // ✅ mới: nhiệm vụ theo tháng (key: "YYYY-MM")
  // ✅ mới: nhiệm vụ theo tháng (key: "YYYY-MM")
  actionsByMonth?: Record<string, StudyAction[]>;

  // ✅ Dashboard helper stats (optional, populated by API)
  dashboardStats?: StudentDashboardStats;
}

export interface LeaderboardItem {
  id: string; // mhs (masked or not needed mostly)
  name: string;
  class: string;
  score: number; // task count or grade
  rank: number;
}

export interface StudentDashboardStats {
  avgScore: number;
  bestScore: number;
  classAvg: number;
  gradeAvg: number;
  targetScore: number;
  leaderboardClass: LeaderboardItem[];
  leaderboardGrade: LeaderboardItem[];
}
