// app/api/ai/generate-report/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/appstate";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type ScoreData = { month: string; math: number | null; lit: number | null; eng: number | null };

type Student = {
  mhs: string;
  name: string;
  class: string;
  scores: ScoreData[];
  aiReport?: any;

  actionsByMonth?: Record<string, any[]>;
  activeActions?: any[];
};

function isMonthKey(x: string) {
  return /^\d{4}-\d{2}$/.test(x);
}

function getLatestMonthFromScores(scores: ScoreData[] | undefined): string {
  const arr = Array.isArray(scores) ? scores : [];
  const last = arr[arr.length - 1];
  const mk = String(last?.month || "").trim();
  return isMonthKey(mk) ? mk : new Date().toISOString().slice(0, 7);
}

function normalizeFrequency(x: any): "daily" | "weekly" | "monthly" {
  const s = String(x ?? "")
    .trim()
    .toLowerCase();
  if (s === "daily" || s === "weekly" || s === "monthly") return s;
  return "weekly";
}

function normText(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mhs = String(body?.mhs ?? "").trim();
  const focusMonthRaw = String(body?.month ?? "").trim();
  const focusMonth = isMonthKey(focusMonthRaw) ? focusMonthRaw : undefined;

  if (!mhs) return NextResponse.json({ ok: false, error: "Missing mhs" }, { status: 400 });

  const state = await getAppState();
  const students: Student[] = (state?.students ?? []) as any[];
  const idx = students.findIndex((s) => String(s?.mhs || "").trim() === mhs);
  if (idx < 0) return NextResponse.json({ ok: false, error: "Student not found" }, { status: 404 });

  const st = students[idx];
  const scores = Array.isArray(st?.scores) ? st.scores : [];
  const lastMonth = getLatestMonthFromScores(scores);

  const monthToAnalyze = focusMonth ?? lastMonth;

  const monthScore = scores.find((x) => String(x?.month || "").trim() === monthToAnalyze);
  const math = monthScore?.math ?? null;
  const lit = monthScore?.lit ?? null;
  const eng = monthScore?.eng ?? null;

  const fallbackReport = {
    ok: true,
    month: monthToAnalyze,
    summary: `Nhận xét cơ bản cho ${st?.name || mhs}.`,
    riskLevel: "TRUNG BÌNH",
    strengths: ["Đang duy trì việc học đều đặn."],
    weaknesses: ["Cần củng cố kiến thức nền và thói quen tự học."],
    actions: [
      {
        description:
          "Toán: làm lại và chữa 5 bài sai gần nhất trong vở/bài tập; ghi lại lỗi sai và cách sửa.",
        frequency: "daily",
      },
      {
        description:
          "Ngữ văn: ôn lại bài đã học (tóm tắt 10 dòng + ghi 5 ý chính/khái niệm quan trọng).",
        frequency: "weekly",
      },
      {
        description:
          "Tiếng Anh: ôn từ vựng theo sách/tài liệu trường 15 phút và viết 5 câu dùng từ mới.",
        frequency: "daily",
      },
    ],
  };

  // If no Gemini key -> fallback
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json(fallbackReport);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Bạn là trợ lý giáo dục. Hãy tạo báo cáo ngắn gọn cho học sinh dựa trên điểm theo tháng.

Thông tin:
- Học sinh: ${st?.name || ""} (MHS: ${mhs}), lớp: ${st?.class || ""}
- Tháng phân tích: ${monthToAnalyze}
- Điểm: Toán=${math ?? "null"}, Ngữ văn=${lit ?? "null"}, Tiếng Anh=${eng ?? "null"}

Yêu cầu output JSON thuần (không markdown), dạng:
{
  "month": "YYYY-MM",
  "summary": "string",
  "riskLevel": "THẤP" | "TRUNG BÌNH" | "CAO",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "actions": [
    {"description":"...", "frequency":"daily|weekly|monthly"},
    ...
  ]
}

QUAN TRỌNG (actions):
- Tuyệt đối KHÔNG yêu cầu “làm đề/chuyên đề” hay tài liệu bên ngoài.
- Chỉ đưa nhiệm vụ có thể làm ngay từ nguồn sẵn có: vở ghi, bài tập trên lớp, bài kiểm tra/bài cũ, SGK, vở bài tập, tài liệu/phiếu bài tập của nhà trường.
- Mỗi action phải cụ thể, dễ tick, thời lượng nhỏ (10–30 phút), ưu tiên “làm lại + chữa lỗi sai”.
Ví dụ hợp lệ:
- "Làm lại 5 bài sai gần nhất trong vở Toán và ghi lý do sai"
- "Tự giải lại bài kiểm tra cũ (20 phút) rồi đối chiếu đáp án/ghi lỗi sai"
- "Đọc lại bài hôm nay, viết 5 ý chính + 3 câu hỏi tự kiểm tra"
- "Làm 10 câu bài tập trong tài liệu nhà trường theo môn"

Hãy chọn 3–6 actions phù hợp với mức rủi ro.
    `.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let report: any = null;
    try {
      report = JSON.parse(text);
    } catch {
      // If Gemini returns extra text, attempt to extract JSON
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end >= 0 && end > start) {
        try {
          report = JSON.parse(text.slice(start, end + 1));
        } catch {
          report = null;
        }
      }
    }

    if (!report || typeof report !== "object") return NextResponse.json(fallbackReport);

    // Normalize required fields
    report.month = String(report.month || monthToAnalyze);
    report.summary = String(report.summary || fallbackReport.summary);
    report.riskLevel = ["THẤP", "TRUNG BÌNH", "CAO"].includes(String(report.riskLevel))
      ? report.riskLevel
      : fallbackReport.riskLevel;

    report.strengths = Array.isArray(report.strengths) ? report.strengths.map(String) : fallbackReport.strengths;
    report.weaknesses = Array.isArray(report.weaknesses) ? report.weaknesses.map(String) : fallbackReport.weaknesses;

    if (!Array.isArray(report.actions) || report.actions.length === 0) {
      report.actions = fallbackReport.actions;
    } else {
      report.actions = report.actions
        .slice(0, 6)
        .map((a: any) => ({
          description: String(a?.description ?? a ?? "").trim(),
          frequency: normalizeFrequency(a?.frequency),
        }))
        .filter((a: any) => a.description);
      if (report.actions.length === 0) report.actions = fallbackReport.actions;
    }

    // Save into student.aiReport + actionsByMonth (keep ticks)
    const updated: Student = { ...(st as any), aiReport: report };

    const taskMonth = monthToAnalyze;

    // Ensure actionsByMonth exists
    const abm = updated.actionsByMonth && typeof updated.actionsByMonth === "object" ? updated.actionsByMonth : {};
    const existingMonthActions: any[] = Array.isArray(abm[taskMonth]) ? abm[taskMonth] : [];

    // preserve ticks in SAME month by (description+frequency)
    const existingMap = new Map<string, any>();
    for (const a of existingMonthActions) {
      const key = `${normText(a?.description)}__${normalizeFrequency(a?.frequency)}`;
      if (!existingMap.has(key)) existingMap.set(key, a);
    }

    const actions: any[] = Array.isArray(report.actions) ? report.actions : [];
    const newMonthActions = actions.map((a: any, i: number) => {
      const desc = String(a?.description ?? a ?? "").trim();
      const freq = normalizeFrequency(a?.frequency);
      const key = `${normText(desc)}__${freq}`;
      const old = existingMap.get(key);

      if (old) {
        return {
          id: old.id,
          description: desc,
          frequency: freq,
          ticks: Array.isArray(old.ticks) ? old.ticks : [],
        };
      }

      return {
        id: `${updated.mhs}-${Date.now()}-${i}`,
        description: desc,
        frequency: freq,
        ticks: [],
      };
    });

    abm[taskMonth] = newMonthActions;
    updated.actionsByMonth = abm;

    // backward compat: activeActions mirror current task month
    updated.activeActions = newMonthActions;

    const nextStudents = [...students];
    nextStudents[idx] = updated;
    await setAppState({ students: nextStudents });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json(fallbackReport);
  }
}
