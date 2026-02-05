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

    const allActions: any[] = [];
    if (Array.isArray(st.activeActions)) allActions.push(...st.activeActions);
    const abm = st.actionsByMonth || {};
    Object.values(abm).forEach((list: any) => {
      if (Array.isArray(list)) allActions.push(...list);
    });

    allActions.forEach(a => {
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
  const myGradeRaw = myClass.replace(/[^0-9]/g, "");

  const classStudents = allStudents.filter((s: any) => (s.class || "").trim() === myClass);
  // Grade logic: same number (e.g. "8")
  const gradeStudents = allStudents.filter((s: any) => String(s.class || "").includes(myGradeRaw));

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

  const finalStudent = {
    ...student,
    dashboardStats: {
      avgScore: myAvg,
      bestScore: 10,
      classAvg,
      gradeAvg,
      targetScore: 8.5,
      leaderboardClass: leaderboardClassMap,
      leaderboardGrade: leaderboardGradeMap
    }
  };

  return NextResponse.json({ student: finalStudent });
}
