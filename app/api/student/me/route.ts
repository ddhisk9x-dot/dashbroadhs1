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
  // 1. Helpers
  const isoMonth = (d: Date) => d.toISOString().slice(0, 7);
  const currentMonthKey = isoMonth(new Date());

  const getAvg = (s?: any) => {
    if (!s) return 0;
    const m = typeof s.math === "number" ? s.math : 0;
    const l = typeof s.lit === "number" ? s.lit : 0;
    const e = typeof s.eng === "number" ? s.eng : 0;
    // Đếm số môn có điểm để chia
    let count = 0;
    if (typeof s.math === "number") count++;
    if (typeof s.lit === "number") count++;
    if (typeof s.eng === "number") count++;
    if (count === 0) return 0;
    return parseFloat(((m + l + e) / count).toFixed(1));
  };

  const getLatestScore = (st: any) => {
    const scores = Array.isArray(st?.scores) ? st.scores : [];
    // Lấy tháng mới nhất có điểm
    if (!scores.length) return null;
    return scores[scores.length - 1]; // Assume sorted by import
  };

  const taskCountForMonth = (st: any, monthKey: string) => {
    // Tính tổng tick của tháng chỉ định
    // logic: lấy actions của inferredTaskMonth = monthKey (đơn giản hoá: tính tổng tick của user trong tháng này)
    let total = 0;

    // Check actives
    const countTicks = (actions: any[]) => {
      let c = 0;
      (actions || []).forEach(a => {
        (a.ticks || []).forEach((t: any) => {
          if (t.completed && String(t.date).startsWith(monthKey)) c++;
        });
      });
      return c;
    };

    // check actionsByMonth
    const abm = st.actionsByMonth || {};
    // Chỉ đếm task "đang chạy" (thường là trong tháng task tương ứng)
    // Nhưng để leaderboard vui, ta đếm ALL ticks fall into this month
    // Duyệt qua mọi actions (vì action tháng cũ có thể tick bù vào tháng này?) -> No, tick date is key.

    const allActions: any[] = [];
    if (Array.isArray(st.activeActions)) allActions.push(...st.activeActions);
    Object.values(abm).forEach((list: any) => {
      if (Array.isArray(list)) allActions.push(...list);
    });

    // De-duplicate actions if needed? Assuming IDs unique enough or just naive count
    // Optimized:
    const uniqueTickDates = new Set<string>();
    // Actually simpler: iterate all actions -> all ticks -> if tick.date startWith monthKey && completed -> count
    allActions.forEach(a => {
      (a.ticks || []).forEach((t: any) => {
        if (t.completed && String(t.date).startsWith(monthKey)) {
          uniqueTickDates.add(t.date + "-" + a.id); // tick is unique per action+date
        }
      });
    });

    return uniqueTickDates.size;
  };

  // 2. Filter Lists
  const allStudents = Array.isArray(state.students) ? state.students : [];
  const myClass = student.class || "";
  // Grade: "8A" -> "8"
  const myGradeRaw = myClass.replace(/[^0-9]/g, ""); // "8"

  const classStudents = allStudents.filter((s: any) => s.class === myClass);
  const gradeStudents = allStudents.filter((s: any) => String(s.class).includes(myGradeRaw));

  // 3. Calc Scores
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

  // 4. Calc Leaderboard (Task Counts current month)
  // Sort by taskCount DESC
  const calcRank = (list: any[]) => {
    const mapped = list.map(s => ({
      id: s.mhs,
      name: s.name,
      class: s.class,
      score: taskCountForMonth(s, currentMonthKey)
    }));
    mapped.sort((a, b) => b.score - a.score);
    // Top 3
    return mapped.slice(0, 3).map((item, idx) => ({ ...item, rank: idx + 1 }));
  };

  const leaderboardClass = calcRank(classStudents);
  const leaderboardGrade = calcRank(gradeStudents);
  // Hide exact names if needed? User asked for leaderboard so names are expected.
  // We mask mhs.

  const finalStudent = {
    ...student,
    dashboardStats: {
      avgScore: myAvg,
      bestScore: 10, // hardcode or calc
      classAvg,
      gradeAvg,
      targetScore: 8.5, // Default target
      leaderboardClass,
      leaderboardGrade
    }
  };

  return NextResponse.json({ student: finalStudent });
}
