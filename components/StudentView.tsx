"use client";
import StudentChangePassword from "./StudentChangePassword";
import React, { useMemo, useState, useEffect } from "react";
import type { Student, ScoreData, StudyAction } from "../types";
import { LogOut, CalendarCheck, Check, ChevronLeft, ChevronRight } from "lucide-react";
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
  // input: YYYY-MM
  const m = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return isoMonth(new Date());
  const [yStr, moStr] = m.split("-");
  let y = Number(yStr);
  let mo = Number(moStr); // 1..12
  if (!y || !mo) return isoMonth(new Date());
  mo += 1;
  if (mo === 13) {
    mo = 1;
    y += 1;
  }
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
  const m = Number(mStr); // 1..12
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
  // scores đã sort theo month trong sync => lấy phần tử cuối
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

  // From actionsByMonth
  const abm = safeActionsByMonth(student);
  Object.values(abm).forEach((actions) => {
    actions.forEach((a) => {
      a.ticks?.forEach((t) => {
        if (t.completed) completedDates.add(String(t.date));
      });
    });
  });

  // From activeActions (legacy fallback)
  if (Array.isArray(student.activeActions)) {
    student.activeActions.forEach((a) => {
      a.ticks?.forEach((t) => {
        if (t.completed) completedDates.add(String(t.date));
      });
    });
  }

  if (completedDates.size === 0) return 0;

  // Check backwards from today
  const today = new Date(); // Local time as per browser/server calc, relying on isoDate
  // strict streak: must have done something today OR yesterday to keep it alive.
  // if today is done => start today.
  // if today NOT done => check yesterday. if yesterday done => start yesterday.
  // else 0.

  const todayStr = isoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  let currentDate: Date;

  if (completedDates.has(todayStr)) {
    currentDate = today;
  } else if (completedDates.has(yesterdayStr)) {
    currentDate = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  // Safety break to avoid infinite loop (though unlikely with dates)
  for (let i = 0; i < 3650; i++) {
    const dStr = isoDate(currentDate);
    if (completedDates.has(dStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function getActionsForMonth(student: Student, monthKey: string): StudyAction[] {
  const abm = safeActionsByMonth(student);
  const list = abm?.[monthKey];
  if (Array.isArray(list) && list.length) return list;
  // backward compat
  return Array.isArray(student.activeActions) ? student.activeActions : [];
}

function buildTickMap(action: StudyAction) {
  const map = new Map<string, boolean>();
  (action.ticks || []).forEach((t) => map.set(String(t.date), !!t.completed));
  return map;
}

function shortDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function StudentView({ student, onUpdateAction, onLogout }: Props) {
  // ====== TASK MONTH (LOGIC CHUẨN) ======
  // Điểm tháng N cập nhật cuối tháng N => nhiệm vụ tick cho tháng N+1
  const inferredTaskMonth = useMemo(() => nextMonthKey(latestScoreMonthKey(student.scores)), [student.scores]);

  // ====== STATE ======
  // Default to current month so user sees today immediately
  const [selectedTaskMonth, setSelectedTaskMonth] = useState<string>(() => isoMonth(new Date()));

  const [selectedDate, setSelectedDate] = useState<string>(() => isoDate(new Date()));

  // tick long-term
  const [trackingMode, setTrackingMode] = useState<"range" | "month">("range");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);

  // ====== DERIVED MONTH LIST ======
  const monthKeys = useMemo(() => {
    const fromScores = (student.scores || [])
      .map((s) => String(s.month || "").trim())
      .filter((m) => /^\d{4}-\d{2}$/.test(m));

    const fromActions = Object.keys(safeActionsByMonth(student)).filter((m) => /^\d{4}-\d{2}$/.test(m));

    const set = new Set<string>([...fromScores, ...fromActions, inferredTaskMonth, isoMonth(new Date())]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [student, inferredTaskMonth]);

  const selectedTaskMonthSafe = useMemo(() => {
    if (monthKeys.includes(selectedTaskMonth)) return selectedTaskMonth;
    // Fallback logic: Priority 1: Current Month, Priority 2: Inferred
    const cur = isoMonth(new Date());
    if (monthKeys.includes(cur)) return cur;
    return inferredTaskMonth;
  }, [selectedTaskMonth, monthKeys, inferredTaskMonth]);

  // Ensure selectedDate stays inside selectedTaskMonthSafe
  useEffect(() => {
    const today = isoDate(new Date());

    if (selectedDate.slice(0, 7) !== selectedTaskMonthSafe) {
      if (today.startsWith(selectedTaskMonthSafe)) {
        setSelectedDate(today);
      } else {
        setSelectedDate(`${selectedTaskMonthSafe}-01`);
      }
    }
  }, [selectedTaskMonthSafe]);

  // Force-check on mount: ALWAYS select today/current month
  useEffect(() => {
    const now = new Date();
    const curM = isoMonth(now);
    const today = isoDate(now);

    // Force update state to current time
    setSelectedTaskMonth(curM);
    setSelectedDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== DAILY ACTIONS (THEO THÁNG NHIỆM VỤ) ======
  const dailyActions = useMemo(() => getActionsForMonth(student, selectedTaskMonthSafe), [student, selectedTaskMonthSafe]);

  // ====== TRACKING ACTIONS ======
  // - range: xem tiến độ của "tháng nhiệm vụ đang chọn" theo 7/30/90 ngày (nhưng chỉ lấy ngày trong tháng đó để không bị sai)
  // - month: xem cả tháng
  const trackingDates = useMemo(() => {
    if (trackingMode === "month") return getMonthDates(selectedTaskMonthSafe);
    // range: chỉ giữ ngày thuộc đúng month nhiệm vụ để tránh tick/đếm nhảy sang tháng khác
    return getLastNDays(rangeDays).filter((d) => d.slice(0, 7) === selectedTaskMonthSafe);
  }, [trackingMode, rangeDays, selectedTaskMonthSafe]);

  const trackingActions = useMemo(() => getActionsForMonth(student, selectedTaskMonthSafe), [student, selectedTaskMonthSafe]);

  // ====== UI CONTENT ======
  const ai = student.aiReport;
  const overviewText = ai?.overview || `Tổng quan: dữ liệu mới nhất tháng ${latestScoreMonthKey(student.scores)}.`;
  const strengthsText = (ai?.strengths && ai.strengths[0]) || "Có dữ liệu theo dõi theo tháng.";
  const risksText = (ai?.risks && ai.risks[0]) || "Cần duy trì thói quen học đều.";

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

  // ====== STREAK ======
  const streak = useMemo(() => calculateStreak(student), [student]);

  // ====== ACTIONS ======
  const toggleDaily = async (action: StudyAction) => {
    const tickMap = buildTickMap(action);
    const cur = !!tickMap.get(selectedDate);
    await onUpdateAction(action.id, selectedDate, !cur);
  };

  // month navigation helpers
  const monthIndex = monthKeys.indexOf(selectedTaskMonthSafe);
  const canPrevMonth = monthIndex > 0;
  const canNextMonth = monthIndex >= 0 && monthIndex < monthKeys.length - 1;

  return (
    <div className="min-h-screen bg-[#f7f9fc] font-sans">
      <Header student={student} onLogout={onLogout} streak={streak} />

      <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        <OverviewCards
          overviewText={overviewText}
          strengthsText={strengthsText}
          risksText={risksText}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="text-sm font-bold text-slate-800 mb-4">Biểu đồ Học tập</div>
            <ScoreChart data={student.scores || []} stats={student.dashboardStats} />
          </div>

          {/* Leaderboard */}
          <div className="md:col-span-1">
            <Leaderboard
              leaderboardClass={student.dashboardStats?.leaderboardClass || []}
              leaderboardGrade={student.dashboardStats?.leaderboardGrade || []}
              currentMhs={student.mhs}
            />
          </div>
        </div>

        {/* Daily habits */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <MonthNavigator
            selectedTaskMonthSafe={selectedTaskMonthSafe}
            selectedDate={selectedDate}
            monthKeys={monthKeys}
            canPrevMonth={canPrevMonth}
            canNextMonth={canNextMonth}
            onSelectMonth={setSelectedTaskMonth}
            onSelectDate={setSelectedDate}
            onPrevMonth={() => canPrevMonth && setSelectedTaskMonth(monthKeys[monthIndex - 1])}
            onNextMonth={() => canNextMonth && setSelectedTaskMonth(monthKeys[monthIndex + 1])}
          />


          {dailyActions.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center">
              Chưa có nhiệm vụ cho tháng {selectedTaskMonthSafe}.
            </div>
          ) : (
            <div className="space-y-3">
              {dailyActions.map((a) => {
                const tickMap = buildTickMap(a);
                const done = !!tickMap.get(selectedDate);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleDaily(a)}
                    className={`w-full text-left rounded-2xl border p-4 transition ${done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent"
                            }`}
                        >
                          <Check size={14} />
                        </div>
                        <div>
                          <div className={`text-sm font-semibold ${done ? "text-slate-700" : "text-slate-800"}`}>
                            {a.description}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{a.frequency}</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">{selectedDate}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Long-term tracking */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck size={18} className="text-indigo-600" />
              <div className="text-sm font-bold text-slate-800">Theo dõi Thói quen (dài hạn)</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTrackingMode("range")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border ${trackingMode === "range"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                7/30/90 ngày
              </button>
              <button
                onClick={() => setTrackingMode("month")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border ${trackingMode === "month"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                Theo tháng
              </button>

              {trackingMode === "range" && (
                <>
                  {[7, 30, 90].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRangeDays(n as 7 | 30 | 90)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border ${rangeDays === n
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                    >
                      {n} ngày
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {trackingActions.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center">
              Chưa có nhiệm vụ để theo dõi trong tháng {selectedTaskMonthSafe}.
            </div>
          ) : (
            <div className="space-y-4">
              {trackingActions.map((action) => {
                const tickMap = buildTickMap(action);
                const countDone = trackingDates.reduce((acc, d) => acc + (tickMap.get(d) ? 1 : 0), 0);

                return (
                  <div key={action.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="text-sm font-bold text-slate-800">{action.description}</div>
                        <div className="text-xs text-slate-500 mt-1">Tần suất: {action.frequency}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-indigo-600">{countDone}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tổng tick</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="flex items-center gap-2 min-w-max">
                        {trackingDates.map((dateStr) => {
                          const done = !!tickMap.get(dateStr);
                          return (
                            <button
                              key={dateStr}
                              onClick={async () => {
                                await onUpdateAction(action.id, dateStr, !done);
                              }}
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-semibold transition ${done
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                                }`}
                              title={dateStr}
                            >
                              {done ? <Check size={18} /> : <span className="text-[10px]">{shortDayLabel(dateStr)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-3">
                      Nếu nhiệm vụ “3 lần/tuần” thì trong 1 tuần tick đủ 3 ngày là đạt.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Study plan */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-bold text-slate-800 mb-4">Kế hoạch 2 Tuần tới</div>

          {!ai?.studyPlan?.length ? (
            <div className="text-sm text-slate-400 italic py-6 text-center">Chưa có kế hoạch.</div>
          ) : (
            <div className="space-y-4">
              {planByDay.map(([day, items]) => (
                <div key={day} className="grid md:grid-cols-5 gap-3">
                  <div className="text-xs font-bold text-slate-400 uppercase md:pt-3">{day}</div>
                  <div className="md:col-span-4 space-y-3">
                    {items.map((p, idx) => (
                      <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                            {p.subject}
                          </span>
                          <span className="text-xs text-slate-500">{p.duration}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">{p.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change password */}
        <StudentChangePassword />

        {/* Message */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-5 shadow-sm">
          <div className="text-sm font-bold mb-2">✨ Lời nhắn từ AI Mentor</div>
          <div className="text-sm italic">“{ai?.messageToStudent || "Mỗi ngày tiến bộ 1 chút là đủ."}”</div>
          <div className="text-[10px] text-white/60 mt-4 uppercase tracking-wider">DISCLAIMER:</div>
          <div className="text-[11px] text-white/70">
            {ai?.disclaimer || "Nhận xét AI chỉ mang tính tham khảo, giáo viên sẽ điều chỉnh theo thực tế."}
          </div>
        </div>
      </div>
    </div>
  );
}
