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

function riskSuggest(latestAvg: number | null, dMath: number | null, dLit: number | null, dEng: number | null): "Thấp" | "Trung bình" | "Cao" {
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

  // remove common wrappers
  const cleaned = t
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

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

function fallbackReport(student: any) {
  const insights = buildInsights(student);
  const month = insights.latest?.month || "gần đây";

  const weak = insights.weakestSubject?.subject || "TOÁN";
  const band = (insights.weakestSubject?.score ?? null) !== null ? band15(insights.weakestSubject!.score) : "MID";

  const actions: ActionItem[] =
    band === "VERY_LOW" || band === "LOW"
      ? [
          { description: `Mỗi ngày 15 phút củng cố nền tảng ${weak}: làm 10 câu mức cơ bản + ghi lại 3 lỗi sai`, frequency: "Hàng ngày" },
          { description: `3 buổi/tuần: chọn 1 dạng bài ${weak} yếu nhất, làm 20 câu và tự chấm`, frequency: "3 lần/tuần" },
          { description: `Ghi “sổ lỗi sai”: mỗi lỗi ghi 1 dòng (dạng - sai ở đâu - cách đúng)`, frequency: "Hàng ngày" },
        ]
      : band === "MID"
      ? [
          { description: `3 buổi/tuần: luyện theo chuyên đề ${weak} (20–25 phút), ưu tiên dạng hay sai`, frequency: "3 lần/tuần" },
          { description: `Mỗi ngày 10 phút làm lại câu sai của tuần (tối đa 8 câu)`, frequency: "Hàng ngày" },
          { description: `1 lần/tuần làm 1 đề ngắn ${weak} (15–20 câu), tổng kết 5 lỗi sai`, frequency: "1 lần/tuần" },
        ]
      : [
          { description: `2 buổi/tuần làm đề tổng hợp (20–25 phút), mục tiêu tăng tốc độ và độ chính xác`, frequency: "2 lần/tuần" },
          { description: `Mỗi ngày 8–10 phút ôn lại 1 lỗi sai trọng tâm (ghi cách tránh lặp lại)`, frequency: "Hàng ngày" },
          { description: `1 lần/tuần tự đánh giá: chọn 1 kỹ năng cần nâng (tốc độ/độ chính xác/diễn đạt) và đặt mục tiêu tuần tới`, frequency: "1 lần/tuần" },
        ];

  return {
    generatedAt: new Date().toISOString(),
    overview: `Tổng quan: dữ liệu mới nhất tháng ${month} (thang ${SCALE_MAX}).`,
    riskLevel: insights.suggestedRisk,
    strengths: insights.strongestSubject ? [`Môn nổi bật: ${insights.strongestSubject.subject}.`] : ["Có dữ liệu theo dõi theo tháng."],
    risks: insights.weakestSubject ? [`Cần ưu tiên cải thiện ${insights.weakestSubject.subject}.`] : ["Cần duy trì thói quen học đều."],
    bySubject: {
      math: { status: "Theo dõi", action: "Ôn lỗi sai 10–15 phút/ngày." },
      lit: { status: "Theo dõi", action: "Đọc 10 phút/ngày và ghi ý chính." },
      eng: { status: "Theo dõi", action: "Luyện từ vựng 10 phút/ngày." },
    },
    actions,
    studyPlan: [
      { day: "Thứ 2", subject: "Toán", duration: "20 phút", content: "Chuyên đề + sửa lỗi sai" },
      { day: "Thứ 4", subject: "Văn", duration: "20 phút", content: "Đọc hiểu + dàn ý 1 đoạn" },
      { day: "Thứ 6", subject: "Anh", duration: "20 phút", content: "Từ vựng + bài tập ngắn" },
    ],
    messageToStudent: "Chọn 1 việc nhỏ làm đều mỗi ngày, kết quả sẽ khác sau 2 tuần.",
    teacherNotes: "GV có thể điều chỉnh theo tình hình lớp và thái độ học tập.",
  };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { student } = await req.json().catch(() => ({}));
  if (!student?.mhs) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const insights = buildInsights(student);
  const apiKey = process.env.GEMINI_API_KEY;

  let report: any = fallbackReport(student);

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = [
        "Bạn là giáo viên chủ nhiệm. Hãy phân tích học sinh dựa trên điểm số theo tháng (3 môn: Toán, Ngữ văn, Tiếng Anh).",
        `THANG ĐIỂM TỐI ĐA: ${SCALE_MAX}. Điểm có thể là số thập phân.`,
        "Mục tiêu: nhận xét + giao nhiệm vụ (thói quen học) được cá nhân hóa hợp lý dựa trên điểm từng môn và xu hướng theo tháng.",
        "Có thể có học sinh điểm gần nhau (chênh 1-2 điểm) thì nhiệm vụ có thể giống nhau một phần, nhưng vẫn phải hợp lý theo môn yếu và xu hướng.",
        "",
        "RÀNG BUỘC BẮT BUỘC:",
        `- actions[]: 3 đến 5 nhiệm vụ, mỗi nhiệm vụ phải đo được và cụ thể (thời lượng/số câu/đầu ra).`,
        "- Ưu tiên nhiệm vụ cho môn yếu nhất và/hoặc môn đang giảm.",
        "- frequency chỉ dùng một trong: 'Hàng ngày', '3 lần/tuần', '2 lần/tuần', '1 lần/tuần'.",
        "- Không phán đoán nguyên nhân chắc chắn. Chỉ nói theo dữ liệu điểm.",
        "- Trả về JSON THUẦN (KHÔNG markdown).",
        "",
        "ĐỊNH HƯỚNG CÁ NHÂN HÓA (tham khảo theo thang 15):",
        "- VERY_LOW/LOW (<7.5): ưu tiên nền tảng + thói quen ngắn hàng ngày + 3 lần/tuần luyện dạng cơ bản.",
        "- MID (7.5-10.5): luyện chuyên đề + đề ngắn 1 lần/tuần + sửa lỗi sai.",
        "- GOOD/EXCELLENT (>10.5): đề tổng hợp + nâng tốc độ/độ chính xác + mục tiêu nâng bậc.",
        "",
        "CHUẨN JSON OUTPUT (các field bắt buộc):",
        "overview (1-2 câu), riskLevel ('Thấp'|'Trung bình'|'Cao'), strengths[] (2-3), risks[] (2-3),",
        "bySubject { math:{status,action}, lit:{status,action}, eng:{status,action} },",
        "actions[]: {description, frequency} (3-5),",
        "studyPlan[]: {day, subject, duration, content} (kế hoạch 2 tuần, có thể ghi theo Thứ),",
        "messageToStudent, teacherNotes.",
        "",
        "Dữ liệu tóm tắt (để quyết định cá nhân hóa):",
        JSON.stringify(insights),
        "",
        "Dữ liệu học sinh (JSON gốc):",
        JSON.stringify(student),
      ].join("\n");

      const resp = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const parsed = extractJson((resp as any)?.text || "");
      if (parsed) {
        // sanitize
        const next: any = { generatedAt: new Date().toISOString(), ...parsed };
        next.riskLevel = clampRisk(next.riskLevel ?? insights.suggestedRisk);

        // normalize actions
        const rawActions = Array.isArray(next.actions) ? next.actions : [];
        const cleanActions: ActionItem[] = rawActions
          .map((a: any) => {
            if (typeof a === "string") return { description: a, frequency: "Hàng ngày" };
            return {
              description: String(a?.description ?? "").trim(),
              frequency: normalizeFrequency(a?.frequency),
            };
          })
          .filter((a: ActionItem) => a.description.length > 0)
          .slice(0, 5);

        // ensure 3-5 actions
        if (cleanActions.length < 3) {
          const fb = fallbackReport(student);
          const fbActs = Array.isArray(fb.actions) ? fb.actions : [];
          for (const a of fbActs) {
            if (cleanActions.length >= 3) break;
            cleanActions.push({ description: a.description, frequency: normalizeFrequency(a.frequency) });
          }
        }
        next.actions = cleanActions.slice(0, 5);

        report = next;
      }
    } catch {
      // keep fallback
      report = fallbackReport(student);
    }
  }

  // Persist report + actions into state (PRESERVE existing ticks when possible)
  const state = await getAppState();
  const students = Array.isArray(state.students) ? state.students : [];
  const idx = students.findIndex((s: any) => String(s.mhs).trim() === String(student.mhs).trim());

  if (idx >= 0) {
    const updated: any = { ...(students[idx] || {}) };
    updated.aiReport = report;

    const existingActions: any[] = Array.isArray(updated.activeActions) ? updated.activeActions : [];
    const existingMap = new Map<string, any>();
    for (const a of existingActions) {
      const key = `${normText(a?.description)}__${normalizeFrequency(a?.frequency)}`;
      if (!existingMap.has(key)) existingMap.set(key, a);
    }

    const actions: any[] = Array.isArray(report.actions) ? report.actions : [];
    updated.activeActions = actions.map((a: any, i: number) => {
      const desc = String(a?.description ?? a ?? "").trim();
      const freq = normalizeFrequency(a?.frequency);
      const key = `${normText(desc)}__${freq}`;
      const old = existingMap.get(key);

      // keep ticks/id if same habit (same description+frequency)
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

    const nextStudents = [...students];
    nextStudents[idx] = updated;
    await setAppState({ students: nextStudents });
  }

  return NextResponse.json(report);
}
