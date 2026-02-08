"use client";

import React, { useMemo, useState } from "react";
import { Student, StudyAction } from "../../types";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell,
    ScatterChart, Scatter, ReferenceLine
} from "recharts";

// Helper functions
function isoMonth(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
function isMonthKey(m: any) { return /^\d{4}-\d{2}$/.test(String(m || "").trim()); }

function latestScoreMonth(st?: Student) {
    const scores = Array.isArray(st?.scores) ? st!.scores : [];
    const last = scores.length ? (scores[scores.length - 1] as any) : null;
    const mk = String(last?.month || "").trim();
    return isMonthKey(mk) ? mk : isoMonth(new Date());
}

function nextMonthKey(monthKey: string): string {
    const mk = String(monthKey || "").trim();
    if (!isMonthKey(mk)) return isoMonth(new Date());
    const [yStr, mStr] = mk.split("-");
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function inferredTaskMonth(st?: Student) { return nextMonthKey(latestScoreMonth(st)); }

function safeActionsByMonth(student?: Student): Record<string, StudyAction[]> {
    if (!student) return {};
    const abm = (student as any)?.actionsByMonth;
    if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;
    const taskMonth = inferredTaskMonth(student);
    const aa = Array.isArray((student as any)?.activeActions) ? ((student as any).activeActions as StudyAction[]) : [];
    return { [taskMonth]: aa };
}

// Helper to count ticks safely (Prioritize activeActions for current data)
function countTicksForMonth(student: Student, month: string): number {
    // 1. Check activeActions first (Live Data)
    const aa = Array.isArray((student as any).activeActions) ? ((student as any).activeActions as StudyAction[]) : [];
    const activeTicks = aa.reduce((acc, a) =>
        acc + (Array.isArray(a.ticks) ? a.ticks.filter(t => t.completed && t.date && t.date.startsWith(month)).length : 0), 0);

    if (activeTicks > 0) return activeTicks;

    // 2. Fallback: Check archive (actionsByMonth)
    const abm = safeActionsByMonth(student);
    if (abm && abm[month] && Array.isArray(abm[month])) {
        return abm[month].reduce((acc, a) => acc + (Array.isArray(a.ticks) ? a.ticks.filter(t => t.completed).length : 0), 0);
    }

    return 0;
}

interface TeacherAnalyticsSectionProps {
    students: Student[];
    teacherClass: string;
}

export default function TeacherAnalyticsSection({ students, teacherClass }: TeacherAnalyticsSectionProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>(isoMonth(new Date()));

    // Available months (include current + previous month even if no data)
    const availableMonths = useMemo(() => {
        const s = new Set<string>();
        // Always include current and previous month
        const now = new Date();
        s.add(isoMonth(now));
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        s.add(isoMonth(prevMonth));
        // Add months from actual data
        students.forEach(st => st.scores?.forEach(sc => s.add(sc.month)));
        return Array.from(s).sort().reverse();
    }, [students]);

    // =====================================================
    // Combined Early Warning System (Academic + Engagement)
    // =====================================================
    const riskData = useMemo(() => {
        const risks: { student: Student, reason: string, type: "ACADEMIC" | "ENGAGEMENT" }[] = [];
        const monthKey = selectedMonth;

        students.forEach(s => {
            // Find score for selected month
            const currentScoreObj = s.scores.find(sc => sc.month === monthKey);

            // Check Academic Risk
            if (currentScoreObj) {
                const scores = [currentScoreObj.math, currentScoreObj.lit, currentScoreObj.eng].filter(s => typeof s === "number" && s !== null) as number[];
                const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

                // Rule 1: Low Avg
                if (avg < 5.0 && avg > 0) {
                    risks.push({ student: s, reason: `Điểm TB thấp (${avg.toFixed(1)})`, type: "ACADEMIC" });
                }

                // Rule 2: Score Drop (Access previous month)
                const idx = s.scores.findIndex(sc => sc.month === monthKey);
                if (idx > 0) {
                    const prevScoreObj = s.scores[idx - 1];
                    const pScores = [prevScoreObj.math, prevScoreObj.lit, prevScoreObj.eng].filter(s => typeof s === "number" && s !== null) as number[];
                    const prevAvg = pScores.length ? pScores.reduce((a, b) => a + b, 0) / pScores.length : 0;
                    if (prevAvg - avg > 1.5) {
                        risks.push({ student: s, reason: `Tụt điểm nhanh (-${(prevAvg - avg).toFixed(1)})`, type: "ACADEMIC" });
                    }
                }
            }

            // Check Engagement Risk
            const ticksCount = countTicksForMonth(s, monthKey);
            if (ticksCount < 5) {
                risks.push({ student: s, reason: "Rất ít hoạt động (Ticks < 5)", type: "ENGAGEMENT" });
            }
        });
        return risks;
    }, [students, selectedMonth]);

    // =====================================================
    // Habit Matrix Data (Scatter Plot)
    // =====================================================
    const scatterData = useMemo(() => {
        return students.map(s => {
            const ticksCount = countTicksForMonth(s, selectedMonth);

            const scoreObj = s.scores.find(sc => sc.month === selectedMonth);
            let avg = 0;
            if (scoreObj) {
                const scores = [scoreObj.math, scoreObj.lit, scoreObj.eng].filter(s => typeof s === "number" && s !== null) as number[];
                avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            }

            if (avg === 0 && ticksCount === 0) return null; // Skip empty data
            return { x: ticksCount, y: parseFloat(avg.toFixed(1)), name: s.name, class: s.class, mhs: s.mhs };
        }).filter(Boolean);
    }, [students, selectedMonth]);

    // =====================================================
    // Value-Added Analysis (Top Improvers)
    // =====================================================
    const valueAddedData = useMemo(() => {
        const improvers: { student: Student, delta: number, prevAvg: number, currAvg: number }[] = [];

        students.forEach(s => {
            const idx = s.scores.findIndex(sc => sc.month === selectedMonth);
            if (idx <= 0) return;

            const curr = s.scores[idx];
            const prev = s.scores[idx - 1];
            const currAvg = ((curr.math ?? 0) + (curr.lit ?? 0) + (curr.eng ?? 0)) / 3;
            const prevAvg = ((prev.math ?? 0) + (prev.lit ?? 0) + (prev.eng ?? 0)) / 3;
            const delta = currAvg - prevAvg;

            if (prevAvg > 0) {
                improvers.push({ student: s, delta, prevAvg, currAvg });
            }
        });

        return improvers.sort((a, b) => b.delta - a.delta).slice(0, 5);
    }, [students, selectedMonth]);

    // =====================================================
    // Subject Heatmap (simplified for single class)
    // =====================================================
    const subjectAvgData = useMemo(() => {
        const data = { math: [] as number[], lit: [] as number[], eng: [] as number[] };

        students.forEach(s => {
            const scoreObj = s.scores.find(sc => sc.month === selectedMonth);
            if (!scoreObj) return;
            if (typeof scoreObj.math === "number") data.math.push(scoreObj.math);
            if (typeof scoreObj.lit === "number") data.lit.push(scoreObj.lit);
            if (typeof scoreObj.eng === "number") data.eng.push(scoreObj.eng);
        });

        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const getColor = (val: number) => val >= 7.5 ? "bg-emerald-500 text-white" : val >= 5.0 ? "bg-yellow-400 text-slate-800" : "bg-red-500 text-white";

        return [
            { subject: "Toán", avg: parseFloat(avg(data.math).toFixed(1)), color: getColor(avg(data.math)) },
            { subject: "Văn", avg: parseFloat(avg(data.lit).toFixed(1)), color: getColor(avg(data.lit)) },
            { subject: "Anh", avg: parseFloat(avg(data.eng).toFixed(1)), color: getColor(avg(data.eng)) },
        ];
    }, [students, selectedMonth]);

    // Class Average Score Data for Bar Chart
    const classScoreData = useMemo(() => {
        return subjectAvgData.map(d => ({
            name: d.subject,
            avgScore: d.avg,
            fill: d.avg >= 7.5 ? "#10b981" : d.avg >= 5.0 ? "#eab308" : "#ef4444"
        }));
    }, [subjectAvgData]);

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header with Month Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-lg">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">📊 Báo cáo Lớp {teacherClass}</h2>
                    <p className="text-sm text-slate-500">Phân tích học lực và tiến bộ của học sinh</p>
                </div>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                >
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                    {availableMonths.length === 0 && <option value={isoMonth(new Date())}>{isoMonth(new Date())}</option>}
                </select>
            </div>

            {/* ==== Section 1: Combined Early Warning & Habit Matrix ==== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Early Warning System (Combined) */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border-2 border-orange-200 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="text-orange-600" size={24} />
                        <h3 className="text-lg font-bold text-orange-800">🚨 Cảnh báo sớm Tổng hợp (Tháng {selectedMonth})</h3>
                    </div>
                    <div className="overflow-y-auto max-h-[350px]">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-orange-50 text-orange-900 sticky top-0">
                                <tr>
                                    <th className="p-3 rounded-tl-lg">Học sinh</th>
                                    <th className="p-3">Lớp</th>
                                    <th className="p-3 rounded-tr-lg">Vấn đề</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {riskData.length === 0 ? (
                                    <tr><td colSpan={3} className="p-4 text-center text-slate-500">✅ Không có học sinh nào trong mức cảnh báo. Tốt!</td></tr>
                                ) : (
                                    riskData.map((r, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium">{r.student.name}</td>
                                            <td className="p-3 text-slate-500">{r.student.class}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${r.type === "ACADEMIC" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                                                    {r.reason}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Habit Impact Matrix */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200 shadow-lg">
                    <h3 className="text-lg font-bold text-slate-700 mb-4">Ma trận Tương quan: Thói quen vs Điểm số</h3>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" dataKey="x" name="Tasks Completed" unit=" ticks" label={{ value: 'Số Tick (Chăm chỉ)', position: 'insideBottom', offset: -10 }} />
                                <YAxis type="number" dataKey="y" name="Avg Score" unit=" đ" label={{ value: 'Điểm TB', angle: -90, position: 'insideLeft' }} domain={[0, 10]} />
                                <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div className="bg-white p-2 border border-slate-200 shadow-lg rounded text-xs">
                                                <strong>{d.name} ({d.class})</strong>
                                                <div>Tick: {d.x} | Điểm: {d.y}</div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={20} stroke="#94a3b8" strokeDasharray="3 3" />
                                <ReferenceLine y={6.5} stroke="#94a3b8" strokeDasharray="3 3" />
                                <Scatter name="Students" data={scatterData} fill="#8884d8">
                                    {scatterData.map((entry, index) => {
                                        const e = entry as any;
                                        let fill = "#94a3b8";
                                        if (e.x > 20 && e.y >= 7) fill = "#10b981";
                                        if (e.x < 10 && e.y < 5) fill = "#ef4444";
                                        if (e.x > 20 && e.y < 6) fill = "#f59e0b";
                                        if (e.x < 10 && e.y >= 7) fill = "#8b5cf6";
                                        return <Cell key={`cell-${index}`} fill={fill} />;
                                    })}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ==== Section 2: Subject Averages + Top Improvers ==== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subject Averages */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-slate-200 shadow-lg">
                    <h3 className="text-lg font-bold text-slate-700 mb-4">📚 Điểm TB theo Môn</h3>
                    <div className="flex justify-center gap-4 mb-4">
                        {subjectAvgData.map(d => (
                            <div key={d.subject} className={`${d.color} rounded-2xl p-4 text-center min-w-[80px]`}>
                                <div className="text-xs font-bold opacity-80 uppercase mb-1">{d.subject}</div>
                                <div className="text-3xl font-black">{d.avg > 0 ? d.avg : "-"}</div>
                            </div>
                        ))}
                    </div>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={classScoreData} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" domain={[0, 10]} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={40} />
                                <RechartsTooltip />
                                <Bar dataKey="avgScore" radius={[0, 8, 8, 0]} barSize={30}>
                                    {classScoreData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top 5 Improvers */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-emerald-200 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="text-emerald-600" />
                        <h3 className="text-lg font-bold text-emerald-800">📈 Top 5 Bứt phá</h3>
                    </div>
                    {valueAddedData.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">Không đủ dữ liệu để so sánh.</p>
                    ) : (
                        <div className="space-y-3">
                            {valueAddedData.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                                    <div className="flex-1">
                                        <div className="font-medium text-slate-800">{item.student.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`font-bold ${item.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                            {item.delta >= 0 ? "+" : ""}{item.delta.toFixed(1)}
                                        </div>
                                        <div className="text-xs text-slate-500">{item.prevAvg.toFixed(1)} → {item.currAvg.toFixed(1)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
