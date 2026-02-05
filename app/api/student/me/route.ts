import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAppState } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.mhs) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getAppState();
  const mhs = String(session.mhs).trim();
  const student = (state.students || []).find((s: any) => String(s.mhs).trim() === mhs);

  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ====== STATS CALCULATION (Server-Side) ======
  // Helpers
  const isoMonth = (d: Date) => d.toISOString().slice(0, 7);
  const now = new Date();

  // Calculate specific months relevant to user data
  // Instead of just NOW, let's scan the student's own data to find "active months" 
  // OR just defaults to Now + last 5 months.
  const months = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.add(isoMonth(d));
  }
  // Also add any months from student scores
  (student.scores || []).forEach((s: any) => months.add(s.month));

  const monthKeys = Array.from(months).sort().reverse(); // Descending

  const getAvg = (s?: any) => {
    if (!s) return 0;
    const m = typeof s.math === "number" ? s.math : 0;
    const l = typeof s.lit === "number" ? s.lit : 0;
    const e = typeof s.eng === "number" ? s.eng : 0;
    // Count valid subjects
    let count = 0;
    if (typeof s.math === "number") count++;
    if (typeof s.lit === "number") count++;
    if (typeof s.eng === "number") count++;
    if (count === 0) return 0;
    return parseFloat(((m + l + e) / count).toFixed(1));
  };

  const getLatestScore = (st: any) => {
    const scores = Array.isArray(st?.scores) ? st.scores : [];
    if (!scores.length) return null;
    return scores[scores.length - 1];
  };

  const taskCountForMonth = (st: any, monthKey: string) => {
    const uniqueTickDates = new Set<string>();

    let actions: any[] = [];
    const abm = st.actionsByMonth || {};

    // Priority: Specific month list -> Legacy activeActions
    if (abm[monthKey] && Array.isArray(abm[monthKey]) && abm[monthKey].length > 0) {
      actions = abm[monthKey];
    } else if (Array.isArray(st.activeActions)) {
      actions = st.activeActions;
    }

    actions.forEach(a => {
      (a.ticks || []).forEach((t: any) => {
        if (t.completed && String(t.date).startsWith(monthKey)) {
          uniqueTickDates.add(t.date + "-" + a.id);
        }
      });
    });

    return uniqueTickDates.size;
  };

  // Filter Lists
  const allStudents = Array.isArray(state.students) ? state.students : [];
  const myClass = (student.class || "").trim();
  const myGradeRaw = myClass.match(/^\d+/)?.[0] || "";

  const classStudents = allStudents.filter((s: any) => (s.class || "").trim() === myClass);
  // Grade logic: starts with same number (e.g. "8")
  const gradeStudents = allStudents.filter((s: any) => (myGradeRaw && String(s.class || "").startsWith(myGradeRaw)));

  // Calc Scores
  const myLatest = getLatestScore(student);
  const myAvg = getAvg(myLatest);

  // Class Avg
  let sumClass = 0;
  let countClass = 0;
  classStudents.forEach((s: any) => {
    const sc = getLatestScore(s);
    const avg = getAvg(sc);
    if (avg > 0) {
      sumClass += avg;
      countClass++;
    }
  });
  const classAvg = countClass ? parseFloat((sumClass / countClass).toFixed(1)) : 0;

  // Grade Avg
  let sumGrade = 0;
  let countGrade = 0;
  gradeStudents.forEach((s: any) => {
    const sc = getLatestScore(s);
    const avg = getAvg(sc);
    if (avg > 0) {
      sumGrade += avg;
      countGrade++;
    }
  });
  const gradeAvg = countGrade ? parseFloat((sumGrade / countGrade).toFixed(1)) : 0;

  // Calc Leaderboard History
  const calcRank = (list: any[], mKey: string) => {
    const mapped = list.map(s => ({
      id: s.mhs,
      name: s.name,
      class: s.class,
      score: taskCountForMonth(s, mKey)
    }));
    mapped.sort((a, b) => b.score - a.score);
    // Top 3
    return mapped.slice(0, 3).map((item, idx) => ({ ...item, rank: idx + 1 }));
  };

  const leaderboardClassMap: Record<string, any[]> = {};
  const leaderboardGradeMap: Record<string, any[]> = {};

  monthKeys.forEach(mKey => {
    leaderboardClassMap[mKey] = calcRank(classStudents, mKey);
    leaderboardGradeMap[mKey] = calcRank(gradeStudents, mKey);
  });

  // Calc Grade Avg By Subject Per Month
  const gradeSubjectMap: Record<string, {
    math: { total: number; count: number };
    lit: { total: number; count: number };
    eng: { total: number; count: number };
  }> = {};

  gradeStudents.forEach((s: any) => {
    (s.scores || []).forEach((sc: any) => {
      if (!sc.month) return;
      if (!gradeSubjectMap[sc.month]) {
        gradeSubjectMap[sc.month] = {
          math: { total: 0, count: 0 },
          lit: { total: 0, count: 0 },
          eng: { total: 0, count: 0 }
        };
      }
      const entry = gradeSubjectMap[sc.month];
      if (typeof sc.math === 'number') { entry.math.total += sc.math; entry.math.count++; }
      if (typeof sc.lit === 'number') { entry.lit.total += sc.lit; entry.lit.count++; }
      if (typeof sc.eng === 'number') { entry.eng.total += sc.eng; entry.eng.count++; }
    });
  });

  const gradeAvgSubjectsByMonth: Record<string, { math: number; lit: number; eng: number }> = {};
  Object.keys(gradeSubjectMap).forEach(m => {
    const e = gradeSubjectMap[m];
    gradeAvgSubjectsByMonth[m] = {
      math: e.math.count ? parseFloat((e.math.total / e.math.count).toFixed(1)) : 0,
      lit: e.lit.count ? parseFloat((e.lit.total / e.lit.count).toFixed(1)) : 0,
      eng: e.eng.count ? parseFloat((e.eng.total / e.eng.count).toFixed(1)) : 0,
    };
  });

  // ✅ Refined: Smart Dynamic AI Target calculation using AI Report data
  const subjectTargets: Record<string, { math: number; lit: number; eng: number }> = {};
  const sortedScoreList = [...(student.scores || [])].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));

  // Get AI insights if available
  const aiReport = student.aiReport || {};
  const aiBySubject = aiReport.bySubject || {};
  const riskLevel = aiReport.riskLevel || "Trung bình";

  sortedScoreList.forEach((sc: any, idx) => {
    const prev = sortedScoreList[idx - 1] || null;
    const prevPrev = sortedScoreList[idx - 2] || null;
    const g = gradeAvgSubjectsByMonth[sc.month] || { math: 6, lit: 6, eng: 6 };

    const smartT = (subjectKey: 'math' | 'lit' | 'eng', curr: number | null, p: number | null, pp: number | null, gAvg: number) => {
      if (curr === null || curr === 0) return gAvg; // No data, aim for grade avg

      // Cap scores at 10 for calculation purposes
      const cappedCurr = Math.min(15, curr);
      const cappedP = p !== null ? Math.min(15, p) : null;
      const cappedPP = pp !== null ? Math.min(15, pp) : null;

      // Calculate trend (2-month moving direction)
      let trend = 0;
      if (cappedP !== null) {
        trend = cappedCurr - cappedP;
        if (cappedPP !== null) {
          // Weight recent trend more
          trend = trend * 0.7 + (cappedP - cappedPP) * 0.3;
        }
      }

      // Get AI risk factor for this subject
      const aiSubjectInfo = aiBySubject[subjectKey] || {};
      const hasRisk = (aiSubjectInfo.status || "").includes("rủi ro") || (aiSubjectInfo.status || "").includes("yếu");

      // Base growth calculation
      let baseGrowth = 0.3; // Default growth target

      // Adjust based on trend
      if (trend > 0.5) {
        baseGrowth += 0.2; // Strong upward trend, push harder
      } else if (trend > 0) {
        baseGrowth += 0.1; // Slight improvement
      } else if (trend < -0.5) {
        baseGrowth = 0.1; // Struggling, modest target
      }

      // Adjust based on position relative to grade avg
      const distFromGradeAvg = cappedCurr - gAvg;
      if (distFromGradeAvg < -1) {
        // Significantly below average - push to catch up
        baseGrowth += 0.3;
      } else if (distFromGradeAvg < 0) {
        baseGrowth += 0.1;
      }

      // AI risk adjustment
      if (hasRisk) {
        baseGrowth = Math.max(0.2, baseGrowth - 0.1); // More conservative if at risk
      }

      // Overall risk level adjustment
      if (riskLevel === "Cao") {
        baseGrowth = Math.max(0.15, baseGrowth * 0.8);
      }

      // Calculate target
      let target = cappedCurr + baseGrowth;

      // Ensure target is at least slightly above grade avg if below
      if (target < gAvg && cappedCurr < gAvg) {
        target = Math.min(gAvg + 0.2, cappedCurr + 0.5);
      }

      // Cap at 15
      return parseFloat(Math.min(15, Math.max(1, target)).toFixed(1));
    };

    subjectTargets[sc.month] = {
      math: smartT('math', sc.math, prev?.math, prevPrev?.math, g.math),
      lit: smartT('lit', sc.lit, prev?.lit, prevPrev?.lit, g.lit),
      eng: smartT('eng', sc.eng, prev?.eng, prevPrev?.eng, g.eng),
    };
  });

  // ✅ New Exam Target (Prediction for next phase) - AI-driven
  const lastSc = sortedScoreList[sortedScoreList.length - 1];
  const prevSc = sortedScoreList[sortedScoreList.length - 2] || null;

  const calcNextTarget = (subjectKey: 'math' | 'lit' | 'eng') => {
    const lastScore = lastSc ? Math.min(15, lastSc[subjectKey] || 0) : 0;
    const prevScore = prevSc ? Math.min(15, prevSc[subjectKey] || 0) : lastScore;
    const trend = lastScore - prevScore;

    // Get AI suggestion
    const aiSubjectInfo = aiBySubject[subjectKey] || {};
    const hasRisk = (aiSubjectInfo.status || "").includes("rủi ro") || (aiSubjectInfo.status || "").includes("yếu");

    // Modest growth: 0.5-0.75 as requested
    let growth = 0.5;
    if (trend > 0) growth += 0.25; // Good trend, push a bit more
    if (lastScore < 10) growth += 0.25; // Lower scores have more room to grow
    if (hasRisk) growth = Math.max(0.3, growth - 0.2);

    return parseFloat(Math.min(15, lastScore + growth).toFixed(1));
  };

  // Generate personalized AI message
  const generateAIMessage = () => {
    if (!lastSc) return "Chưa có đủ dữ liệu để phân tích. Hãy cập nhật điểm số!";

    const avgScore = ((lastSc.math || 0) + (lastSc.lit || 0) + (lastSc.eng || 0)) / 3;

    if (riskLevel === "Cao") {
      return "Cần tập trung cải thiện các môn yếu. Mục tiêu này được tính toán phù hợp với khả năng!";
    } else if (avgScore >= 12) {
      return "Xuất sắc! Duy trì phong độ và thử thách bản thân với mục tiêu cao hơn!";
    } else if (avgScore >= 9) {
      return "Đang tiến bộ tốt! Mục tiêu này vừa tầm với nhưng vẫn đầy thử thách!";
    } else {
      return "Hãy từng bước cải thiện. Mục tiêu được đặt phù hợp để bạn đạt được!";
    }
  };

  const nextExamTargets = {
    math: calcNextTarget('math'),
    lit: calcNextTarget('lit'),
    eng: calcNextTarget('eng'),
    message: generateAIMessage()
  };

  const finalStudent = {
    ...student,
    dashboardStats: {
      avgScore: myAvg,
      bestScore: 10,
      classAvg,
      gradeAvg,
      targetScore: 8.5,
      leaderboardClass: leaderboardClassMap,
      leaderboardGrade: leaderboardGradeMap,
      gradeAvgSubjectsByMonth,
      subjectTargets,
      nextExamTargets
    }
  };

  return NextResponse.json({ student: finalStudent });
}
