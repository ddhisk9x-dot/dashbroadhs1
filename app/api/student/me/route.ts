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

  // ✅ New: AI Target calculation
  const subjectTargets: Record<string, { math: number; lit: number; eng: number }> = {};
  (student.scores || []).forEach((sc: any) => {
    const g = gradeAvgSubjectsByMonth[sc.month] || { math: 0, lit: 0, eng: 0 };
    const calcT = (val: number | null, gradeVal: number) => {
      const base = Math.max(val || 0, gradeVal);
      const tt = base + 0.5;
      return tt > 10 ? 10 : parseFloat(tt.toFixed(1));
    };
    subjectTargets[sc.month] = {
      math: calcT(sc.math, g.math),
      lit: calcT(sc.lit, g.lit),
      eng: calcT(sc.eng, g.eng),
    };
  });

  // ✅ New: Next Exam Target
  const sortedScores = [...(student.scores || [])].sort((a: any, b: any) => String(b.month).localeCompare(String(a.month)));
  const latestMonth = sortedScores[0]?.month;
  const latestT = latestMonth ? subjectTargets[latestMonth] : { math: 8.5, lit: 8.5, eng: 8.5 };

  const nextExamTargets = {
    math: Math.min(10, latestT.math + 0.2),
    lit: Math.min(10, latestT.lit + 0.2),
    eng: Math.min(10, latestT.eng + 0.2),
    message: "Hãy cố gắng vượt qua mức trung bình khối 0.5 điểm để bứt phá nhé!"
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
