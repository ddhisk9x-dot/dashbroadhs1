"use client";

import React, { useMemo, useState } from "react";
import { Student } from "../../types";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

// Helper functions
function isoMonth(d: Date) { return d.toISOString().slice(0, 7); }
function isMonthKey(m: any) { return /^\d{4}-\d{2}$/.test(String(m || "").trim()); }

interface TeacherAnalyticsSectionProps {
    students: Student[];
    teacherClass: string;
}

export default function TeacherAnalyticsSection({ students, teacherClass }: TeacherAnalyticsSectionProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>(isoMonth(new Date()));

    // Available months
    const availableMonths = useMemo(() => {
        const s = new Set<string>();
        students.forEach(st => st.scores?.forEach(sc => s.add(sc.month)));
        return Array.from(s).sort().reverse();
    }, [students]);

    // =====================================================
    // Pure Academic Risk Report (Score-only, NO ticks)
    // =====================================================
    const pureAcademicRisk = useMemo(() => {
        type RiskLevel = "DANGER" | "WARNING" | "NOTICE";
        const risks: { student: Student, avgScore: number, level: RiskLevel, reasons: string[] }[] = [];
        const monthKey = selectedMonth;

        students.forEach(s => {
            const scoreObj = s.scores.find(sc => sc.month === monthKey);
            if (!scoreObj) return;

            const MATH = scoreObj.math ?? 0;
            const LIT = scoreObj.lit ?? 0;
            const ENG = scoreObj.eng ?? 0;
            const avg = (MATH + LIT + ENG) / 3;
            const reasons: string[] = [];
            let level: RiskLevel | null = null;

            // Rule 1: Danger - Avg < 4.0
            if (avg < 4.0 && avg > 0) {
                level = "DANGER";
                reasons.push(`TB < 4.0 (${avg.toFixed(1)})`);
            }
            // Rule 2: Warning - Avg 4.0-5.0 OR Score Drop > 1.5
            else if (avg >= 4.0 && avg < 5.0) {
                level = level || "WARNING";
                reasons.push(`TB thấp (${avg.toFixed(1)})`);
            }

            // Rule 3: Score Drop
            const idx = s.scores.findIndex(sc => sc.month === monthKey);
            if (idx > 0) {
                const prev = s.scores[idx - 1];
                const prevAvg = ((prev.math ?? 0) + (prev.lit ?? 0) + (prev.eng ?? 0)) / 3;
                if (prevAvg - avg > 1.5) {
                    level = level || "WARNING";
                    reasons.push(`Tụt điểm (-${(prevAvg - avg).toFixed(1)})`);
                }
            }

            // Rule 4: Notice - Any single subject < 5.0
            if ((MATH > 0 && MATH < 5.0) || (LIT > 0 && LIT < 5.0) || (ENG > 0 && ENG < 5.0)) {
                if (!level) level = "NOTICE";
                const weak: string[] = [];
                if (MATH > 0 && MATH < 5.0) weak.push(`Toán: ${MATH}`);
                if (LIT > 0 && LIT < 5.0) weak.push(`Văn: ${LIT}`);
                if (ENG > 0 && ENG < 5.0) weak.push(`Anh: ${ENG}`);
                if (weak.length) reasons.push(weak.join(", "));
            }

            if (level && reasons.length) {
                risks.push({ student: s, avgScore: avg, level, reasons });
            }
        });

        const order: Record<RiskLevel, number> = { DANGER: 0, WARNING: 1, NOTICE: 2 };
        return risks.sort((a, b) => order[a.level] - order[b.level] || a.avgScore - b.avgScore);
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

            {/* Section 1: Pure Academic Risk */}
            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border-2 border-red-200 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="text-red-600" size={24} />
                    <h3 className="text-lg font-bold text-red-800">🚨 Cảnh báo Học lực (Tháng {selectedMonth})</h3>
                </div>
                <div className="overflow-y-auto max-h-[300px]">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-red-50 text-red-900 sticky top-0">
                            <tr>
                                <th className="p-3 rounded-tl-lg">Học sinh</th>
                                <th className="p-3">Điểm TB</th>
                                <th className="p-3">Mức độ</th>
                                <th className="p-3 rounded-tr-lg">Lý do</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pureAcademicRisk.length === 0 ? (
                                <tr><td colSpan={4} className="p-4 text-center text-slate-500">✅ Không có học sinh nào trong mức cảnh báo.</td></tr>
                            ) : (
                                pureAcademicRisk.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-3 font-medium">{r.student.name}</td>
                                        <td className="p-3 font-bold">{r.avgScore.toFixed(1)}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${r.level === "DANGER" ? "bg-red-600 text-white" :
                                                    r.level === "WARNING" ? "bg-orange-500 text-white" :
                                                        "bg-yellow-400 text-slate-800"
                                                }`}>
                                                {r.level === "DANGER" ? "🔴 Nguy hiểm" : r.level === "WARNING" ? "🟠 Theo dõi" : "🟡 Chú ý"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-xs text-slate-600">{r.reasons.join(" · ")}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Section 2: Subject Averages + Top Improvers */}
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
