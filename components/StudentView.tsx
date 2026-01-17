"use client";

import React, { useMemo, useState } from "react";
import type { Student, ScoreData, StudyAction } from "../types";
import { LogOut, CalendarCheck, Check, ChevronLeft, ChevronRight } from "lucide-react";
import ScoreChart from "./ScoreChart";

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

function latestMonthKey(scores?: ScoreData[]) {
  const arr = Array.isArray(scores) ? scores : [];
  const last = arr[arr.length - 1]?.month?.trim();
  if (last && /^\d{4}-\d{2}$/.test(last)) return last;
  return new Date().toISOString().slice(0, 7);
}

function safeActionsByMonth(student: Student) {
  const abm = (student as any).actionsByMonth;
  if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;
  return {};
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

function shortDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function StudentView({ student, onUpdateAction, onLogout }: Props) {
  // ====== STATE ======
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));

  // tick long-term
  const [trackingMode, setTrackingMode] = useState<"range" | "month">("range");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const m = latestMonthKey(student.scores);
    return m;
  });

  // ====== DERIVED ======
  const monthKeys = useMemo(() => {
    const fromScores = (student.scores || [])
      .map((s) => String(s.month || "").trim())
      .filter((m) => /^\d{4}-\d{2}$/.test(m));

    const fromActions = Object.keys(safeActionsByMonth(student)).filter((m) => /^\d{4}-\d{2}$/.test(m));

    const set = new Set<string>([...fromScores, ...fromActions]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [student]);

  const selectedMonthSafe = useMemo(() => {
    if (monthKeys.includes(selectedMonth)) return selectedMonth;
    const fallback = monthKeys[monthKeys.length - 1] || latestMonthKey(student.scores);
    return fallback;
  }, [selectedMonth, monthKeys, student.scores]);

  const monthIndex = monthKeys.indexOf(selectedMonthSafe);
  const canPrevMonth = monthIndex > 0;
  const canNextMonth = monthIndex >= 0 && monthIndex < monthKeys.length - 1;

  const trackingDates = useMemo(() => {
    if (trackingMode === "range") return getLastNDays(rangeDays);
    return getMonthDates(selectedMonthSafe);
  }, [trackingMode, rangeDays, selectedMonthSafe]);

  const dailyMonthKey = useMemo(() => {
    const mk = selectedDate.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(mk)) return mk;
    return latestMonthKey(student.scores);
  }, [selectedDate, student.scores]);

  const dailyActions = useMemo(() => getActionsForMonth(student, dailyMonthKey), [student, dailyMonthKey]);
  const trackingActions = useMemo(
    () => getActionsForMonth(student, selectedMonthSafe),
    [student, selectedMonthSafe]
  );

  const ai = student.aiReport;

  // ====== UI HELPERS ======
  const overviewText = ai?.overview || `Tổng quan: dữ liệu mới nhất tháng ${latestMonthKey(student.scores)}.`;
  const strengthsText = (ai?.strengths && ai.strengths[0]) || "Có dữ liệu theo dõi theo tháng.";
  const risksText = (ai?.risks && ai.risks[0]) || "Cần duy trì thói quen học đều.";

  // group plan by day (keep order)
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

  // ====== ACTIONS ======
  const toggleDaily = async (action: StudyAction) => {
    const tickMap = buildTickMap(action);
    const cur = !!tickMap.get(selectedDate);
    await onUpdateAction(action.id, selectedDate, !cur);
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] font-sans">
      {/* Header */}
      <div className="bg-white border-b border-slate-200/60 px-5 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-800 font-bold text-lg">
              Xin chào, <span className="uppercase">{student.name}</span> 👋
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              MHS: <span className="font-mono text-indigo-600">{student.mhs}</span> | Lớp:{" "}
              <span className="font-semibold text-slate-700">{student.class}</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600 transition"
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        {/* Cards: Tổng quan / Điểm mạnh / Cần lưu ý */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <div className="text-sm font-bold text-orange-700 mb-2">Tổng quan</div>
            <div className="text-sm text-slate-700 leading-relaxed">{overviewText}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-bold text-slate-800 mb-2">Điểm mạnh</div>
            <div className="text-sm text-slate-700 leading-relaxed">• {strengthsText}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-bold text-slate-800 mb-2">Cần lưu ý</div>
            <div className="text-sm text-slate-700 leading-relaxed">• {risksText}</div>
          </div>
        </div>

        {/* Biểu đồ học tập */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="text-sm font-bold text-slate-800 mb-4">Biểu đồ Học tập</div>
          <ScoreChart data={student.scores || []} />
        </div>

        {/* Thói quen hằng ngày (giữ như bản cũ) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-bold text-slate-800">Thói quen Hàng ngày</div>
              <div className="text-xs text-slate-500">Đánh dấu tích để hoàn thành mục tiêu hôm nay.</div>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
            />
          </div>

          {dailyActions.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center">
              Chưa có nhiệm vụ cho tháng {dailyMonthKey}.
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
                    className={`w-full text-left rounded-2xl border p-4 transition ${
                      done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center ${
                            done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent"
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

        {/* ✅ Theo dõi tick dài hạn (thêm mới, không phá UI cũ) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck size={18} className="text-indigo-600" />
              <div className="text-sm font-bold text-slate-800">Theo dõi Thói quen (dài hạn)</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTrackingMode("range")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
                  trackingMode === "range"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                7/30/90 ngày
              </button>
              <button
                onClick={() => setTrackingMode("month")}
                className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
                  trackingMode === "month"
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
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border ${
                        rangeDays === n
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

          {/* Month selector */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => canPrevMonth && setSelectedMonth(monthKeys[monthIndex - 1])}
              disabled={!canPrevMonth}
              className="p-2 rounded-xl border border-slate-200 bg-white disabled:opacity-40"
              title="Tháng trước"
            >
              <ChevronLeft size={18} />
            </button>

            <select
              value={selectedMonthSafe}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            >
              {monthKeys.length === 0 ? (
                <option value={selectedMonthSafe}>{selectedMonthSafe}</option>
              ) : (
                monthKeys.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              )}
            </select>

            <button
              onClick={() => canNextMonth && setSelectedMonth(monthKeys[monthIndex + 1])}
              disabled={!canNextMonth}
              className="p-2 rounded-xl border border-slate-200 bg-white disabled:opacity-40"
              title="Tháng sau"
            >
              <ChevronRight size={18} />
            </button>

            <div className="text-xs text-slate-500 ml-2">
              {trackingMode === "month" ? `Xem theo tháng ${selectedMonthSafe}` : `Xem ${rangeDays} ngày gần nhất`}
            </div>
          </div>

          {trackingActions.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center">
              Chưa có nhiệm vụ để theo dõi trong tháng {selectedMonthSafe}.
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
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-semibold transition ${
                                done
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

        {/* Kế hoạch 2 tuần tới */}
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

        {/* Lời nhắn */}
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-5 shadow-sm">
          <div className="text-sm font-bold mb-2">✨ Lời nhắn từ AI Mentor</div>
          <div className="text-sm italic">
            “{ai?.messageToStudent || "Mỗi ngày tiến bộ 1 chút là đủ."}”
          </div>
          <div className="text-[10px] text-white/60 mt-4 uppercase tracking-wider">DISCLAIMER:</div>
          <div className="text-[11px] text-white/70">
            {ai?.disclaimer ||
              "Nhận xét AI chỉ mang tính tham khảo, giáo viên sẽ điều chỉnh theo thực tế."}
          </div>
        </div>
      </div>
    </div>
  );
}
