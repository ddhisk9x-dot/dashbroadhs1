// app/api/ai/generate-report/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState, setAppState } from "@/lib/supabaseServer";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

type MonthScore = {
  month: string;
  math: number | null;
  lit: number | null;
  eng: number | null;
};

type ActionItem = { description: string; frequency: string };

const SCALE_MAX = 15;

function isMonthKey(m: string) {
  return /^\d{4}-\d{2}$/.test(String(m || "").trim());
}

function nextMonthKey(monthKey: string): string {
  const m = String(monthKey || "").trim();
  if (!isMonthKey(m)) return new Date().toISOString().slice(0, 7);
  const [yStr, moStr] = m.split("-");
  let y = Number(yStr);
  let mo = Number(moStr);
  mo += 1;
  if (mo === 13) {
    mo = 1;
    y += 1;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

function prevMonthKey(monthKey: string): string {
  const m = String(monthKey || "").trim();
  if (!isMonthKey(m)) return new Date().toISOString().slice(0, 7);
  const [yStr, moStr] = m.split("-");
  let y = Number(yStr);
  let mo = Number(moStr);
  mo -= 1;
  if (mo === 0) {
    mo = 12;
    y -= 1;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

function safeNum(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickLatest(scores: any[]): MonthScore | null {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const last = scores[scores.length - 1] || {};
  return {
    month: String(last.month || "gần đây"),
    math: safeNum(last.math),
    lit: safeNum(last.lit),
    eng: safeNum(last.eng),
  };
}

function pickPrev(scores: any[]): MonthScore | null {
  if (!Array.isArray(scores) || scores.length < 2) return null;
  const prev = scores[scores.length - 2] || {};
  return {
    month: String(prev.month || "trước đó"),
    math: safeNum(prev.math),
    lit: safeNum(prev.lit),
    eng: safeNum(prev.eng),
  };
}

function avg3(entry: MonthScore | null): number | null {
  if (!entry) return null;
  const arr = [entry.math, entry.lit, entry.eng].filter((x) => x !== null) as number[];
  if (arr.length === 0) return null;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
}

function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

function band15(x: number | null): string {
  if (x === null) return "NO_DATA";
  if (x < 5) return "VERY_LOW";
  if (x < 7.5) return "LOW";
  if (x < 10.5) return "MID";
  if (x < 12.5) return "GOOD";
  return "EXCELLENT";
}

function riskSuggest(
  latestAvg: number | null,
  dMath: number | null,
  dLit: number | null,
  dEng: number | null
): "Thấp" | "Trung bình" | "Cao" {
  const drops = [dMath, dLit, dEng].filter((x) => x !== null) as number[];
  const bigDrop = drops.some((x) => x <= -1.5);
  const midDrop = drops.some((x) => x <= -0.8);

  if (latestAvg !== null && latestAvg < 7.5) return "Cao";
  if (bigDrop) return "Cao";
  if (latestAvg !== null && latestAvg < 10.5) return "Trung bình";
  if (midDrop) return "Trung bình";
  return "Thấp";
}

function normText(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[“”"']/g, "")
    .replace(/[.,;:!?()\[\]{}<>]/g, "");
}

function normalizeFrequency(s: any): string {
  const t = String(s ?? "").toLowerCase();
  if (t.includes("hàng ngày") || t.includes("hang ngay") || t.includes("daily")) return "Hàng ngày";
  if (t.includes("3") && t.includes("tuần")) return "3 lần/tuần";
  if (t.includes("2") && t.includes("tuần")) return "2 lần/tuần";
  if (t.includes("1") && t.includes("tuần")) return "1 lần/tuần";
  return "Hàng ngày";
}

function clampRisk(v: any): "Thấp" | "Trung bình" | "Cao" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("cao")) return "Cao";
  if (s.includes("thấp") || s.includes("thap")) return "Thấp";
  return "Trung bình";
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const t = String(text).trim();
  const cleaned = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  const slice = cleaned.slice(s, e + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function sanitizeActionText(s: string) {
  // chặn “đề/chuyên đề” + hướng về “tài liệu nội bộ”
  return String(s || "")
    .replace(/chuyên\s*đề/gi, "chủ điểm")
    .replace(/\bđề\b/gi, "bài")
    .replace(/làm\s*đề/gi, "làm bài")
    .trim();
}

function buildInsights(student: any) {
  const scores = Array.isArray(student?.scores) ? student.scores : [];
  const latest = pickLatest(scores);
  const prev = pickPrev(scores);

  const latestAvg = avg3(latest);
  const prevAvg = avg3(prev);

  const dMath = delta(latest?.math ?? null, prev?.math ?? null);
  const dLit = delta(latest?.lit ?? null, prev?.lit ?? null);
  const dEng = delta(latest?.eng ?? null, prev?.eng ?? null);
  const dAvg = delta(latestAvg, prevAvg);

  const subjects = [
    { key: "math", name: "TOÁN", v: latest?.math ?? null, d: dMath },
    { key: "lit", name: "NGỮ VĂN", v: latest?.lit ?? null, d: dLit },
    { key: "eng", name: "TIẾNG ANH", v: latest?.eng ?? null, d: dEng },
  ].filter((x) => x.v !== null);

  const weakest = subjects.length ? subjects.slice().sort((a, b) => (a.v! - b.v!))[0] : null;
  const strongest = subjects.length ? subjects.slice().sort((a, b) => (b.v! - a.v!))[0] : null;

  const risk = riskSuggest(latestAvg, dMath, dLit, dEng);

  return {
    scaleMax: SCALE_MAX,
    latest,
    prev,
    latestAvg,
    prevAvg,
    deltas: { math: dMath, lit: dLit, eng: dEng, avg: dAvg },
    bands: {
      math: band15(latest?.math ?? null),
      lit: band15(latest?.lit ?? null),
      eng: band15(latest?.eng ?? null),
      avg: band15(latestAvg),
    },
    weakestSubject: weakest ? { subject: weakest.name, score: weakest.v, delta: weakest.d } : null,
    strongestSubject: strongest ? { subject: strongest.name, score: strongest.v, delta: strongest.d } : null,
    suggestedRisk: risk,
  };
}

function fallbackReport(student: any, taskMonth: string) {
  const insights = buildInsights(student);
  const scoreMonth = insights.latest?.month || "gần đây";

  const weak = insights.weakestSubject?.subject || "TOÁN";
  const band = (insights.weakestSubject?.score ?? null) !== null ? band15(insights.weakestSubject!.score) : "MID";

  const actions: ActionItem[] =
    band === "VERY_LOW" || band === "LOW"
      ? [
          {
            description: `(${taskMonth}) Mỗi ngày 15 phút củng cố nền tảng ${weak}: làm lại 10 bài cơ bản trong TÀI LIỆU NỘI BỘ + ghi 3 lỗi sai vào sổ`,
            frequency: "Hàng ngày",
          },
          {
            description: `(${taskMonth}) 3 buổi/tuần: chọn 1 chủ điểm ${weak} đang yếu trong TÀI LIỆU NỘI BỘ, làm 15–20 bài và tự chấm`,
            frequency: "3 lần/tuần",
          },
          {
            description: `(${taskMonth}) Mỗi ngày: làm lại tối đa 8 câu/bài đã sai trước đó (từ vở/bài cũ) và viết 1 dòng “vì sao sai – cách đúng”`,
            frequency: "Hàng ngày",
          },
        ]
      : band === "MID"
      ? [
          {
            description: `(${taskMonth}) 3 buổi/tuần: luyện 1–2 chủ điểm ${weak} trong TÀI LIỆU NỘI BỘ (20–25 phút), ưu tiên phần hay sai`,
            frequency: "3 lần/tuần",
          },
          {
            description: `(${taskMonth}) Mỗi ngày 10 phút: làm lại câu/bài sai của tuần (tối đa 8 câu/bài) + sửa cẩn thận`,
            frequency: "Hàng ngày",
          },
          {
            description: `(${taskMonth}) 1 lần/tuần: tự kiểm tra 15–20 phút bằng bài tổng hợp trong TÀI LIỆU NỘI BỘ, tổng kết 5 lỗi sai`,
            frequency: "1 lần/tuần",
          },
        ]
      : [
          {
            description: `(${taskMonth}) 2 buổi/tuần: làm bài tổng hợp trong TÀI LIỆU NỘI BỘ (20–25 phút), mục tiêu tăng tốc độ & chính xác`,
            frequency: "2 lần/tuần",
          },
          {
            description: `(${taskMonth}) Mỗi ngày 8–10 phút: ôn 1 lỗi sai trọng tâm (ghi cách tránh lặp lại)`,
            frequency: "Hàng ngày",
          },
          {
            description: `(${taskMonth}) 1 lần/tuần: tự đánh giá 1 kỹ năng cần nâng (tốc độ/độ chính xác/diễn đạt) và đặt mục tiêu tuần tới`,
            frequency: "1 lần/tuần",
          },
        ];

  return {
    generatedAt: new Date().toISOString(),
    overview: `Tổng quan: dữ liệu điểm mới nhất tháng ${scoreMonth} (thang ${SCALE_MAX}). Nhiệm vụ áp dụng cho tháng ${taskMonth}.`,
    riskLevel: insights.suggestedRisk,
    strengths: insights.strongestSubject ? [`Môn nổi bật: ${insights.strongestSubject.subject}.`] : ["Có dữ liệu theo dõi theo tháng."],
    risks: insights.weakestSubject ? [`Cần ưu tiên cải thiện ${insights.weakestSubject.subject}.`] : ["Cần duy trì thói quen học đều."],
    bySubject: {
      math: { status: "Theo dõi", action: "Ôn lỗi sai 10–15 phút/ngày bằng tài liệu nội bộ." },
      lit: { status: "Theo dõi", action: "Đọc 10 phút/ngày và ghi ý chính." },
      eng: { status: "Theo dõi", action: "Ôn từ vựng + làm bài ngắn trong tài liệu nội bộ." },
    },
    actions: actions.map((a: ActionItem) => ({ ...a, description: sanitizeActionText(a.description) }))
    studyPlan: [
      { day: "Thứ 2", subject: "Toán", duration: "20 phút", content: "Làm lại bài trong tài liệu nội bộ + sửa lỗi sai" },
      { day: "Thứ 4", subject: "Văn", duration: "20 phút", content: "Đọc hiểu + dàn ý 1 đoạn" },
      { day: "Thứ 6", subject: "Anh", duration: "20 phút", content: "Từ vựng + bài tập ngắn (tài liệu nội bộ)" },
    ],
    messageToStudent: "Chọn 1 việc nhỏ làm đều mỗi ngày, kết quả sẽ khác sau 2 tuần.",
    teacherNotes: "GV có thể điều chỉnh theo tình hình lớp và thái độ học tập.",
  };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "TEACHER")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { student } = await req.json().catch(() => ({}));
  if (!student?.mhs) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  // Tính taskMonth = (tháng điểm mới nhất) + 1
  const scores = Array.isArray(student?.scores) ? student.scores : [];
  const latestScore = pickLatest(scores);
  const latestScoreMonth = isMonthKey(latestScore?.month || "")
    ? String(latestScore!.month).trim()
    : new Date().toISOString().slice(0, 7);
  const taskMonth = nextMonthKey(latestScoreMonth);
  const prevTaskMonth = prevMonthKey(taskMonth);

  // Lấy nhiệm vụ tháng trước (nếu có) để AI đổi nhiệm vụ theo tháng
  const stateBefore = await getAppState();
  const allBefore = Array.isArray(stateBefore.students) ? stateBefore.students : [];
  const stBefore = allBefore.find((s: any) => String(s?.mhs || "").trim() === String(student.mhs).trim());
  const prevMonthActions: Array<{ description?: string; frequency?: string }> =
    stBefore?.actionsByMonth?.[prevTaskMonth] && Array.isArray(stBefore.actionsByMonth[prevTaskMonth])
      ? stBefore.actionsByMonth[prevTaskMonth].map((a: any) => ({
          description: a?.description,
          frequency: a?.frequency,
        }))
      : [];

  const insights = buildInsights(student);
  const apiKey = process.env.GEMINI_API_KEY;

  let report: any = fallbackReport(student, taskMonth);

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = [
        "Bạn là giáo viên chủ nhiệm. Hãy phân tích học sinh dựa trên điểm số theo tháng (3 môn: Toán, Ngữ văn, Tiếng Anh).",
        `THANG ĐIỂM TỐI ĐA: ${SCALE_MAX}. Điểm có thể là số thập phân.`,
        "",
        `THÁNG ĐIỂM MỚI NHẤT: ${latestScoreMonth}.`,
        `THÁNG NHIỆM VỤ CẦN GIAO: ${taskMonth} (luôn là tháng sau của tháng điểm mới nhất).`,
        "",
        "Mục tiêu: nhận xét + giao nhiệm vụ (thói quen học) cá nhân hóa theo môn yếu và xu hướng tăng/giảm theo tháng.",
        "",
        "RÀNG BUỘC BẮT BUỘC:",
        "- actions[]: 3 đến 5 nhiệm vụ; phải đo được (thời lượng/số bài/đầu ra rõ).",
        "- Ưu tiên môn yếu nhất và/hoặc môn đang giảm.",
        "- frequency chỉ dùng đúng 1 trong: 'Hàng ngày', '3 lần/tuần', '2 lần/tuần', '1 lần/tuần'.",
        "- Không phán đoán nguyên nhân chắc chắn. Chỉ nói theo dữ liệu điểm.",
        "",
        "QUY ƯỚC NHIỆM VỤ (RẤT QUAN TRỌNG):",
        "- TUYỆT ĐỐI KHÔNG dùng các từ/ý: 'đề', 'chuyên đề', 'đề thi', 'luyện đề'.",
        "- Thay bằng: 'bài trong TÀI LIỆU NỘI BỘ môn ...', 'làm lại bài cũ/vở/bài đã sai', 'chủ điểm trong tài liệu nội bộ'.",
        "- Nhiệm vụ phải phù hợp việc HS có sẵn tài liệu nội bộ theo từng môn.",
        "",
        "ĐỔI NHIỆM VỤ THEO THÁNG:",
        `- Đây là nhiệm vụ THÁNG TRƯỚC (${prevTaskMonth}) (nếu có). Khi tạo cho tháng ${taskMonth}, hãy thay đổi ít nhất 60% nội dung mô tả so với tháng trước,`,
        "  trừ khi điểm số gần như không đổi (khi đó chỉ thay đổi cách làm/đầu ra, vẫn tránh y hệt).",
        "",
        "CHUẨN JSON OUTPUT (các field bắt buộc):",
        "overview (1-2 câu), riskLevel ('Thấp'|'Trung bình'|'Cao'), strengths[] (2-3), risks[] (2-3),",
        "bySubject { math:{status,action}, lit:{status,action}, eng:{status,action} },",
        "actions[]: {description, frequency} (3-5),",
        "studyPlan[]: {day, subject, duration, content} (kế hoạch 2 tuần),",
        "messageToStudent, teacherNotes.",
        "",
        "Dữ liệu tóm tắt (để quyết định cá nhân hóa):",
        JSON.stringify(insights),
        "",
        `Nhiệm vụ tháng trước (${prevTaskMonth}) để tham chiếu (có thể rỗng):`,
        JSON.stringify(prevMonthActions),
        "",
        "Dữ liệu học sinh (JSON gốc):",
        JSON.stringify(student),
        "",
        "Trả về JSON THUẦN (KHÔNG markdown).",
      ].join("\n");

      const resp = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const parsed = extractJson((resp as any)?.text || "");
      if (parsed) {
        const next: any = { generatedAt: new Date().toISOString(), ...parsed };
        next.riskLevel = clampRisk(next.riskLevel ?? insights.suggestedRisk);

        const rawActions = Array.isArray(next.actions) ? next.actions : [];
        const cleanActions: ActionItem[] = rawActions
          .map((a: any): ActionItem => {
            if (typeof a === "string") return { description: a, frequency: "Hàng ngày" };
            return {
              description: String(a?.description ?? "").trim(),
              frequency: normalizeFrequency(a?.frequency),
            };
          })
          .map((a: ActionItem): ActionItem => ({ ...a, description: sanitizeActionText(a.description) })) // ✅ FIX noImplicitAny
          .filter((a: ActionItem) => a.description.length > 0)
          .slice(0, 5);

        if (cleanActions.length < 3) {
          const fb = fallbackReport(student, taskMonth);
          const fbActs = Array.isArray(fb.actions) ? fb.actions : [];
          for (const a of fbActs) {
            if (cleanActions.length >= 3) break;
            cleanActions.push({
              description: sanitizeActionText(a.description),
              frequency: normalizeFrequency(a.frequency),
            });
          }
        }
        next.actions = cleanActions.slice(0, 5);

        if (!String(next.overview || "").includes(taskMonth)) {
          next.overview = `${String(next.overview || "").trim()} (Nhiệm vụ áp dụng cho tháng ${taskMonth}).`.trim();
        }

        report = next;
      }
    } catch {
      report = fallbackReport(student, taskMonth);
    }
  }

  // ✅ PERSIST: lưu actions vào actionsByMonth[taskMonth], giữ ticks cùng tháng bằng (description+frequency)
  const state = await getAppState();
  const students = Array.isArray(state.students) ? state.students : [];
  const idx = students.findIndex((s: any) => String(s.mhs).trim() === String(student.mhs).trim());

  if (idx >= 0) {
    const updated: any = { ...(students[idx] || {}) };
    updated.aiReport = report;

    const abm = updated.actionsByMonth && typeof updated.actionsByMonth === "object" ? updated.actionsByMonth : {};
    const existingMonthActions: any[] = Array.isArray(abm[taskMonth]) ? abm[taskMonth] : [];

    const existingMap = new Map<string, any>();
    for (const a of existingMonthActions) {
      const key = `${normText(a?.description)}__${normalizeFrequency(a?.frequency)}`;
      if (!existingMap.has(key)) existingMap.set(key, a);
    }

    const actions: any[] = Array.isArray(report.actions) ? report.actions : [];
    const newMonthActions = actions.map((a: any, i: number) => {
      const desc = sanitizeActionText(String(a?.description ?? a ?? "").trim());
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

    // backward compat: activeActions = tháng nhiệm vụ hiện hành
    updated.activeActions = newMonthActions;

    const nextStudents = [...students];
    nextStudents[idx] = updated;
    await setAppState({ students: nextStudents });
  }

  return NextResponse.json(report);
}
