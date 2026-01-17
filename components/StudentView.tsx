"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Student, StudyAction } from "../types";
import { CalendarCheck, Check } from "lucide-react";

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getLastNDays(n: number) {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toISODate(d));
  }
  return dates;
}

function getDaysInMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map((x) => parseInt(x, 10));
  const last = new Date(y, m, 0);
  const out: string[] = [];
  for (let day = 1; day <= last.getDate(); day++) {
    out.push(toISODate(new Date(y, m - 1, day)));
  }
  return out;
}

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-");
  return `${m}/${y}`;
}

function safeActionsByMonth(student?: Student) {
  if (!student) return {};
  if (student.actionsByMonth && typeof student.actionsByMonth === "object") return student.actionsByMonth;
  const latest = (student.scores?.[student.scores.length - 1]?.month || new Date().toISOString().slice(0, 7)).trim();
  const aa = Array.isArray(student.activeActions) ? student.activeActions : [];
  if (aa.length) return { [latest]: aa };
  return {};
}

export default function StudentView({ student }: { student: Student }) {
  const actionsByMonth = useMemo(() => safeActionsByMonth(student), [student]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (student?.scores || []).forEach((s) => {
      const mk = String(s.month || "").trim();
      if (/^\d{4}-\d{2}$/.test(mk)) set.add(mk);
    });
    Object.keys(actionsByMonth || {}).forEach((k) => {
      if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
    });
    const arr = Array.from(set);
    arr.sort();
    return arr;
  }, [student, actionsByMonth]);

  const defaultMonth = useMemo(() => {
    const mk = String(student?.scores?.[student.scores.length - 1]?.month || "").trim();
    if (/^\d{4}-\d{2}$/.test(mk)) return mk;
    return availableMonths[availableMonths.length - 1] || new Date().toISOString().slice(0, 7);
  }, [student, availableMonths]);

  const [trackMode, setTrackMode] = useState<"month" | "recent">("month");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  useEffect(() => {
    setSelectedMonth(defaultMonth);
  }, [defaultMonth]);

  const dateColumns = useMemo(() => {
    if (trackMode === "recent") return getLastNDays(rangeDays);
    return getDaysInMonth(selectedMonth);
  }, [trackMode, rangeDays, selectedMonth]);

  const actions: StudyAction[] = useMemo(() => {
    if (trackMode === "month") return (actionsByMonth[selectedMonth] || []) as StudyAction[];
    const mk = selectedMonth || defaultMonth;
    return (actionsByMonth[mk] || student.activeActions || []) as StudyAction[];
  }, [actionsByMonth, selectedMonth, trackMode, student, defaultMonth]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarCheck size={18} />
        <h2 className="font-bold text-slate-800">Theo dõi Thói quen</h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTrackMode("month")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              trackMode === "month" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            Theo tháng
          </button>
          <button
            onClick={() => setTrackMode("recent")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              trackMode === "recent" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            Gần đây
          </button>
        </div>

        <div className="flex items-center gap-2">
          {trackMode === "month" ? (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm"
            >
              {availableMonths.map((mk) => (
                <option key={mk} value={mk}>
                  {monthLabel(mk)}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              {[7, 30, 90].map((n) => (
                <button
                  key={n}
                  onClick={() => setRangeDays(n as 7 | 30 | 90)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    rangeDays === n ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {n} ngày
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="text-center py-10 text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
          Chưa có nhiệm vụ cho khoảng đang xem.
        </div>
      ) : (
        <div className="space-y-6">
          {actions.map((action) => {
            const completedInRange = (action.ticks || []).filter((t) => t.completed && dateColumns.includes(t.date)).length;

            return (
              <div key={action.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-slate-700">{action.description}</h4>
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">
                      {action.frequency}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-indigo-600">{completedInRange}</span>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">TICK</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[720px] flex items-center gap-2">
                    {dateColumns.map((dateString) => {
                      const isDone = (action.ticks || []).some((t) => t.date === dateString && t.completed);
                      const dateObj = new Date(dateString);
                      const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

                      return (
                        <div key={dateString} className="flex flex-col items-center gap-2 w-10 shrink-0">
                          <div className={`w-full h-2 rounded-full ${isDone ? "bg-emerald-500" : "bg-slate-100"}`}></div>
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium ${
                              isDone
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-50 text-slate-400 border border-slate-100"
                            }`}
                          >
                            {isDone ? <Check size={16} /> : <span className="text-[10px]">{dayLabel}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
