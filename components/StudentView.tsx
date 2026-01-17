"use client";

import React, { useMemo, useState } from "react";
import { Student } from "../types";
import { Check, CalendarCheck, LogOut } from "lucide-react";

type StudentViewProps = {
  student: Student;
  onUpdateAction: (actionId: string, date: string, completed: boolean) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
};

function getLastNDays(n: number) {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export default function StudentView({ student, onUpdateAction, onLogout }: StudentViewProps) {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(7);

  const dates = useMemo(() => getLastNDays(rangeDays), [rangeDays]);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans">
      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200/60 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{student.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            MHS: <span className="font-mono text-indigo-600">{student.mhs}</span> | Lớp: {student.class}
          </p>
        </div>

        <button
          onClick={() => onLogout()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition-all shadow-md"
          title="Đăng xuất"
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-bold">
              <CalendarCheck size={18} />
              Theo dõi Thói quen
            </div>

            {/* Range selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRangeDays(7)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  rangeDays === 7 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                7 ngày
              </button>
              <button
                onClick={() => setRangeDays(30)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  rangeDays === 30 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                30 ngày
              </button>
              <button
                onClick={() => setRangeDays(90)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  rangeDays === 90 ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                90 ngày
              </button>
            </div>
          </div>

          <div className="p-6">
            {(!student.activeActions || student.activeActions.length === 0) ? (
              <div className="text-center py-10 text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Bạn chưa có thói quen nào được giao.
              </div>
            ) : (
              <div className="space-y-6">
                {student.activeActions.map((action: any) => {
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
                          <span className="text-2xl font-bold text-indigo-600">{action.ticks?.length ?? 0}</span>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Tổng Tick</p>
                        </div>
                      </div>

                      {/* Heatmap theo ngày */}
                      <div className="overflow-x-auto">
                        <div className="min-w-[720px] flex items-center justify-between gap-2">
                          {dates.map((dateString) => {
                            const isDone = (action.ticks || []).some((t: any) => t.date === dateString && t.completed);
                            const dateObj = new Date(dateString);
                            const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

                            return (
                              <button
                                key={dateString}
                                onClick={() => onUpdateAction(action.id, dateString, !isDone)}
                                className="flex flex-col items-center gap-2 flex-1 min-w-[34px]"
                                title={isDone ? `Đã làm: ${dateString}` : `Chưa làm: ${dateString}`}
                              >
                                <div
                                  className={`w-full h-2 rounded-full transition-all duration-300 ${
                                    isDone ? "bg-emerald-500" : "bg-slate-100"
                                  }`}
                                />
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
                                    isDone
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-slate-50 text-slate-400 border border-slate-100"
                                  }`}
                                >
                                  {isDone ? <Check size={16} /> : <span className="text-[10px]">{dayLabel}</span>}
                                </div>
                              </button>
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
        </div>
      </main>
    </div>
  );
}
