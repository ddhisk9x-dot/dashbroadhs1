import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

function latestMonth(student: any): string {
  const scores = Array.isArray(student.scores) ? student.scores : [];
  const last = scores[scores.length - 1];
  return last?.month || "gần đây";
}

function fallbackReport(student: any) {
  const month = latestMonth(student);
  return {
    generatedAt: new Date().toISOString(),
    overview: `Tổng quan: dữ liệu mới nhất tháng ${month}.`,
    riskLevel: "Trung bình",
    strengths: ["Có dữ liệu theo dõi theo tháng."],
    risks: ["Cần duy trì thói quen học đều."],
    bySubject: {
      math: { status: "Theo dõi", action: "Ôn lại lỗi sai 15 phút/ngày." },
      lit: { status: "Theo dõi", action: "Đọc 10 phút/ngày và ghi chú ý chính." },
      eng: { status: "Theo dõi", action: "Luyện từ vựng 10 phút/ngày." },
    },
    actions: [
      { description: "15 phút mỗi tối làm lại câu sai gần nhất", frequency: "Hàng ngày" },
      { description: "3 buổi/tuần ôn tập theo chuyên đề yếu", frequency: "3 lần/tuần" },
      { description: "Ghi chú lỗi sai vào 1 trang vở riêng", frequency: "Hàng ngày" },
    ],
    studyPlan: [
      { day: "Thứ 2", subject: "Toán", duration: "20 phút", content: "Làm lại bài sai" },
      { day: "Thứ 4", subject: "Văn", duration: "20 phút", content: "Đọc hiểu + dàn ý" },
      { day: "Thứ 6", subject: "Anh", duration: "20 phút", content: "Từ vựng + bài tập" },
    ],
    messageToStudent: "Mỗi ngày tiến bộ 1 chút là đủ.",
    teacherNotes: "GV có thể điều chỉnh biện pháp theo thực tế lớp học.",
  };
}

function extractJson(text: string): any | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { student } = await req.json().catch(() => ({}));
  if (!student?.mhs) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  let report: any = fallbackReport(student);

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = [
        "Bạn là giáo viên chủ nhiệm. Hãy phân tích học sinh dựa trên điểm số theo tháng (3 môn: Toán, Ngữ văn, Tiếng Anh).",
        "Chỉ suy luận trong phạm vi dữ liệu, không khẳng định nguyên nhân chắc chắn.",
        "Trả về JSON (KHÔNG markdown) với các trường:",
        "overview (1-2 câu), riskLevel (Thấp/Trung bình/Cao), strengths[] (2-3), risks[] (2-3),",
        "bySubject { math:{status,action}, lit:{status,action}, eng:{status,action} },",
        "actions[]: mỗi phần tử là {description, frequency} (3-5 thói quen nhỏ đo được),",
        "studyPlan[]: {day, subject, duration, content} (kế hoạch 2 tuần, có thể ghi theo Thứ),",
        "messageToStudent, teacherNotes.",
        "Dữ liệu học sinh (JSON):",
        JSON.stringify(student),
      ].join("\n");

      const resp = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const parsed = extractJson(resp.text || "");
      if (parsed) {
        report = { generatedAt: new Date().toISOString(), ...parsed };
      }
    } catch {
      // keep fallback
    }
  }

  // Persist report + actions into state
  const state = await getAppState();
  const idx = (state.students || []).findIndex((s: any) => String(s.mhs).trim() === String(student.mhs).trim());
  if (idx >= 0) {
    const updated = { ...(state.students[idx] || {}) };
    updated.aiReport = report;
    const actions = Array.isArray(report.actions) ? report.actions : [];
    updated.activeActions = actions.map((a: any, i: number) => ({
      id: `${updated.mhs}-${Date.now()}-${i}`,
      description: a.description || String(a),
      frequency: a.frequency || "Hàng ngày",
      ticks: [],
    }));
    const nextStudents = [...state.students];
    nextStudents[idx] = updated;
    await setAppState({ students: nextStudents });
  }

  return NextResponse.json(report);
}
