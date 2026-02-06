"use client";
import StudentChangePassword from "./StudentChangePassword";
import React, { useMemo, useState, useEffect } from "react";
import type { Student, ScoreData, StudyAction } from "../types";
import { LogOut, CalendarCheck, Check, ChevronLeft, ChevronRight, Trophy, Award, Target, Sparkles, TrendingUp, BookOpen, AlertCircle, Star } from "lucide-react";
import ScoreChart from "./ScoreChart";
import Header from "./Header";
import OverviewCards from "./OverviewCards";
import MonthNavigator from "./MonthNavigator";
import Leaderboard from "./Leaderboard";

type Props = {
  student: Student;
  onUpdateAction: (actionId: string, date: string, completed: boolean) => Promise<void>;
  onLogout: () => Promise<void>;
};

// --- Helper Functions ---
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoMonth(d: Date) {
  return isoDate(d).slice(0, 7);
}
function nextMonthKey(monthKey: string): string {
  const m = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return isoMonth(new Date());
  const [yStr, moStr] = m.split("-");
  let y = Number(yStr);
  let mo = Number(moStr);
  if (!y || !mo) return isoMonth(new Date());
  mo += 1;
  if (mo === 13) { mo = 1; y += 1; }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}
function getLastNDays(n: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(isoDate(d));
  }
  return out;
}
function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}
function getMonthDates(monthKey: string) {
  const [yStr, mStr] = monthKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return [];
  const total = daysInMonth(y, m);
  const out: string[] = [];
  for (let d = 1; d <= total; d++) {
    const dd = String(d).padStart(2, "0");
    out.push(`${yStr}-${mStr}-${dd}`);
  }
  return out;
}
function latestScoreMonthKey(scores?: ScoreData[]) {
  const arr = Array.isArray(scores) ? scores : [];
  const last = arr[arr.length - 1]?.month?.trim();
  if (last && /^\d{4}-\d{2}$/.test(last)) return last;
  return isoMonth(new Date());
}
function safeActionsByMonth(student: Student) {
  const abm = (student as any).actionsByMonth;
  if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;
  return {};
}
function calculateStreak(student: Student): number {
  const completedDates = new Set<string>();
  const abm = safeActionsByMonth(student);
  Object.values(abm).forEach((actions) => {
    actions.forEach((a) => {
      a.ticks?.forEach((t) => { if (t.completed) completedDates.add(String(t.date)); });
    });
  });
  if (Array.isArray(student.activeActions)) {
    student.activeActions.forEach((a) => {
      a.ticks?.forEach((t) => { if (t.completed) completedDates.add(String(t.date)); });
    });
  }
  if (completedDates.size === 0) return 0;
  const today = new Date();
  const todayStr = isoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = isoDate(yesterday);
  let currentDate: Date;
  if (completedDates.has(todayStr)) currentDate = today;
  else if (completedDates.has(yesterdayStr)) currentDate = yesterday;
  else return 0;
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const dStr = isoDate(currentDate);
    if (completedDates.has(dStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else break;
  }
  return streak;
}
function getActionsForMonth(student: Student, monthKey: string): StudyAction[] {
  const abm = safeActionsByMonth(student);
  const list = abm?.[monthKey];
  if (Array.isArray(list) && list.length) return list;
  return Array.isArray(student.activeActions) ? student.activeActions : [];
}
function buildTickMap(action: StudyAction) {
  const map = new Map<string, boolean>();
  (action.ticks || []).forEach((t) => map.set(String(t.date), !!t.completed));
  return map;
}

export default function StudentView({ student, onUpdateAction, onLogout }: Props) {
  const inferredTaskMonth = useMemo(() => nextMonthKey(latestScoreMonthKey(student.scores)), [student.scores]);

  // State
  const [selectedTaskMonth, setSelectedTaskMonth] = useState<string>(() => isoMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => isoDate(new Date()));
  const [trackingMode, setTrackingMode] = useState<"range" | "month">("range");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);

  // Month Keys
  const monthKeys = useMemo(() => {
    const fromScores = (student.scores || []).map((s) => String(s.month || "").trim()).filter((m) => /^\d{4}-\d{2}$/.test(m));
    const fromActions = Object.keys(safeActionsByMonth(student)).filter((m) => /^\d{4}-\d{2}$/.test(m));
    const set = new Set<string>([...fromScores, ...fromActions, inferredTaskMonth, isoMonth(new Date())]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [student, inferredTaskMonth]);

  const selectedTaskMonthSafe = useMemo(() => {
    if (monthKeys.includes(selectedTaskMonth)) return selectedTaskMonth;
    const cur = isoMonth(new Date());
    if (monthKeys.includes(cur)) return cur;
    return inferredTaskMonth;
  }, [selectedTaskMonth, monthKeys, inferredTaskMonth]);

  useEffect(() => {
    const today = isoDate(new Date());
    if (selectedDate.slice(0, 7) !== selectedTaskMonthSafe) {
      if (today.startsWith(selectedTaskMonthSafe)) setSelectedDate(today);
      else setSelectedDate(`${selectedTaskMonthSafe}-01`);
    }
  }, [selectedTaskMonthSafe]);

  useEffect(() => {
    const now = new Date();
    setSelectedTaskMonth(isoMonth(now));
    setSelectedDate(isoDate(now));
  }, []);

  const dailyActions = useMemo(() => getActionsForMonth(student, selectedTaskMonthSafe), [student, selectedTaskMonthSafe]);

  const ai = student.aiReport;
  const planByDay = useMemo(() => {
    const plan = Array.isArray(ai?.studyPlan) ? ai!.studyPlan : [];
    const map = new Map<string, any[]>();
    for (const p of plan) {
      const k = String(p.day || "").trim() || "Khác";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries());
  }, [ai]);
  const streak = useMemo(() => calculateStreak(student), [student]);

  const chartData = useMemo(() => {
    const scores = student.scores || [];
    const gradeMap = student.dashboardStats?.gradeAvgSubjectsByMonth || {};
    const targetMap = student.dashboardStats?.subjectTargets || {};
    return scores.map(s => {
      const g = gradeMap[s.month] || {};
      const t = targetMap[s.month] || {};
      return { ...s, gradeMath: g.math || 0, gradeLit: g.lit || 0, gradeEng: g.eng || 0, targetMath: t.math || 0, targetLit: t.lit || 0, targetEng: t.eng || 0 };
    });
  }, [student.scores, student.dashboardStats]);

  const toggleDaily = async (action: StudyAction) => {
    const tickMap = buildTickMap(action);
    const cur = !!tickMap.get(selectedDate);
    await onUpdateAction(action.id, selectedDate, !cur);
  };
  const monthIndex = monthKeys.indexOf(selectedTaskMonthSafe);

  // --- RENDER (NEW PREMIUM UI) ---
  return (
    <div className="min-h-screen font-sans bg-fixed bg-gradient-to-br from-indigo-50 via-white to-sky-50 text-slate-800">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-200/40 rounded-full blur-[120px] animate-pulse-slow delay-1000" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header student={student} onLogout={onLogout} streak={streak} />

        <main className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* Overview Cards (Refined) */}
          <OverviewCards
            overviewText={ai?.overview || `Dữ liệu mới nhất tháng ${latestScoreMonthKey(student.scores)}.`}
            strengthsText={(ai?.strengths && ai.strengths[0]) || "Có dữ liệu đầy đủ."}
            risksText={(ai?.risks && ai.risks[0]) || "Cần duy trì đều đặn."}
          />

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Left Column: Charts & Analysis (8 cols) - order-2 on mobile to appear after sidebar */}
            <div className="xl:col-span-8 space-y-8 order-2 xl:order-1">

              {/* Charts Section */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Math */}
                <div className="group bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 transition-all hover:shadow-[0_8px_30px_rgb(99,102,241,0.1)] hover:scale-[1.01]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800">Toán học</div>
                      <div className="text-xs text-slate-500 font-medium tracking-wide">MATH PROGRESS</div>
                    </div>
                  </div>
                  <ScoreChart data={chartData} stats={student.dashboardStats} subject="math" />
                </div>
                {/* Lit */}
                <div className="group bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 transition-all hover:shadow-[0_8px_30px_rgb(236,72,153,0.1)] hover:scale-[1.01]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 shadow-lg shadow-pink-500/30 flex items-center justify-center text-white">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800">Ngữ Văn</div>
                      <div className="text-xs text-slate-500 font-medium tracking-wide">LITERATURE</div>
                    </div>
                  </div>
                  <ScoreChart data={chartData} stats={student.dashboardStats} subject="lit" />
                </div>
                {/* Eng (Full width on mobile/tablet, half on large if even) - actually let's make Eng full width or just stick to grid */}
                <div className="md:col-span-2 group bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 transition-all hover:shadow-[0_8px_30px_rgb(139,92,246,0.1)] hover:scale-[1.01]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/30 flex items-center justify-center text-white">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-800">Tiếng Anh</div>
                      <div className="text-xs text-slate-500 font-medium tracking-wide">ENGLISH</div>
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ScoreChart data={chartData} stats={student.dashboardStats} subject="eng" />
                  </div>
                </div>
              </div>

              {/* Daily Habits & Month Nav */}
              <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl shadow-slate-200/40 rounded-[2rem] p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/30 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none" />

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 relative z-10">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">Nhiệm vụ Hàng ngày</h3>
                    <p className="text-slate-500 text-sm">Hoàn thành các mục tiêu nhỏ để đạt kết quả lớn.</p>
                  </div>
                  <MonthNavigator
                    selectedTaskMonthSafe={selectedTaskMonthSafe}
                    selectedDate={selectedDate}
                    monthKeys={monthKeys}
                    canPrevMonth={monthIndex > 0}
                    canNextMonth={monthIndex < monthKeys.length - 1}
                    onSelectMonth={setSelectedTaskMonth}
                    onSelectDate={setSelectedDate}
                    onPrevMonth={() => monthIndex > 0 && setSelectedTaskMonth(monthKeys[monthIndex - 1])}
                    onNextMonth={() => monthIndex < monthKeys.length - 1 && setSelectedTaskMonth(monthKeys[monthIndex + 1])}
                  />
                </div>

                {dailyActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                    <CalendarCheck size={48} className="text-slate-300 mb-4" />
                    <div className="text-slate-500 font-medium">Chưa có nhiệm vụ cho tháng này</div>
                    <div className="text-sm text-slate-400 mt-1">Hãy tận hưởng thời gian nghỉ ngơi!</div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {dailyActions.map((a) => {
                      const tickMap = buildTickMap(a);
                      const done = !!tickMap.get(selectedDate);
                      return (
                        <button
                          key={a.id}
                          onClick={() => toggleDaily(a)}
                          className={`group relative flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${done
                            ? "bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-emerald-200 shadow-sm"
                            : "bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5"
                            }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${done
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 rotate-0"
                              : "bg-slate-100 text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-400 rotate-12 group-hover:rotate-0"
                              }`}>
                              <Check size={24} strokeWidth={3} className={done ? "scale-100 opacity-100 transition-all" : "scale-50 opacity-0"} />
                            </div>
                            <div className="text-left">
                              <div className={`font-bold transition-colors ${done ? "text-slate-800" : "text-slate-600 group-hover:text-indigo-900"}`}>{a.description}</div>
                              <div className={`text-xs font-medium mt-1 ${done ? "text-emerald-600" : "text-slate-400"}`}>{a.frequency}</div>
                            </div>
                          </div>
                          <div className="text-[10px] font-bold text-slate-300 bg-white/50 px-2 py-1 rounded-lg backdrop-blur-sm">
                            {selectedDate.split("-").slice(1).reverse().join("/")}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Sidebar (4 cols) - order-1 on mobile to appear FIRST (before Daily Habits) */}
            <div className="xl:col-span-4 space-y-8 order-1 xl:order-2">
              {/* AI Mentor Card (High Emphasis) */}
              <div className="relative group overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white p-8 shadow-2xl shadow-indigo-500/30">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-[50px] -mr-10 -mt-10 animate-pulse-slow" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles size={20} className="text-yellow-300" />
                    <h3 className="text-lg font-bold tracking-wide">AI Mentor Nhắn Nhủ</h3>
                  </div>
                  <div className="text-lg font-medium leading-relaxed italic opacity-90">
                    "{ai?.messageToStudent || "Mỗi ngày tiến bộ 1 chút là đủ."}"
                  </div>
                  <div className="mt-8 pt-4 border-t border-white/20 flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Insight by Gemini</span>
                  </div>
                </div>
              </div>

              {/* Leaderboard & Targets */}
              <div className="space-y-6">
                <Leaderboard
                  leaderboardClass={student.dashboardStats?.leaderboardClass || {}}
                  leaderboardGrade={student.dashboardStats?.leaderboardGrade || {}}
                  currentMhs={student.mhs}
                  month={selectedTaskMonthSafe}
                />

                {/* Next Target */}
                {student.dashboardStats?.nextExamTargets && (
                  <div className="bg-white/80 backdrop-blur-xl border border-white/60 p-6 rounded-3xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-amber-400 to-orange-500" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
                        <Target size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">Mục tiêu Tiếp theo</div>
                        <div className="text-xs text-slate-500">Next Exam Targets</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { l: 'Toán', v: student.dashboardStats.nextExamTargets.math, c: 'text-blue-600 bg-blue-50' },
                        { l: 'Văn', v: student.dashboardStats.nextExamTargets.lit, c: 'text-pink-600 bg-pink-50' },
                        { l: 'Anh', v: student.dashboardStats.nextExamTargets.eng, c: 'text-violet-600 bg-violet-50' }
                      ].map(item => (
                        <div key={item.l} className={`${item.c} p-3 rounded-2xl text-center flex flex-col items-center justify-center min-h-[80px]`}>
                          <span className="text-[10px] font-bold uppercase opacity-60 mb-1">{item.l}</span>
                          <span className="text-2xl font-black tracking-tight">{item.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Study Plan UI */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/60 p-6 rounded-3xl shadow-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                      <CalendarCheck size={20} />
                    </div>
                    <div className="font-bold text-slate-800">Kế hoạch 2 Tuần</div>
                  </div>

                  {!ai?.studyPlan?.length ? (
                    <div className="text-sm text-slate-400 italic text-center py-4">Chưa có kế hoạch.</div>
                  ) : (
                    <div className="space-y-4">
                      {planByDay.slice(0, 3).map(([day, items]) => (
                        <div key={day} className="relative pl-4 border-l-2 border-slate-100">
                          <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                          <div className="text-xs font-bold text-indigo-600 uppercase mb-2">{day}</div>
                          <div className="space-y-2">
                            {items.map((p, idx) => (
                              <div key={idx} className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <span className="font-bold text-slate-800 mr-2">[{p.subject}]</span>
                                {p.content}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {planByDay.length > 3 && (
                        <div className="text-center">
                          <button className="text-xs font-bold text-indigo-600 hover:underline">Xem thêm...</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Password Change */}
                <StudentChangePassword />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
