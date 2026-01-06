export enum Role {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN'
}

export interface User {
  username: string;
  name: string;
  role: Role;
}

export interface ScoreData {
  month: string; // e.g., "2023-09" or "Tháng 9"
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
  frequency: string; // e.g., "Daily", "Weekly"
  ticks: TaskTick[];
}

export interface StudySession {
  day: string; // e.g., "Monday"
  subject: string;
  duration: string;
  content: string;
}

export interface AIReport {
  generatedAt: string;
  overview: string;
  // Fixed: riskLevel should match the Vietnamese output from the Gemini prompt/schema
  riskLevel: 'Thấp' | 'Trung bình' | 'Cao';
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
  disclaimer: string;
}

export interface Student {
  mhs: string; // Unique ID
  name: string;
  class: string;
  scores: ScoreData[];
  aiReport?: AIReport;
  activeActions: StudyAction[];
}