import React from "react";
import { AlertTriangle, Loader2, FileText, Sparkles, TrendingUp, MoreHorizontal } from "lucide-react";
import TeacherResetPasswordButton from "../TeacherResetPasswordButton";
import { Student } from "../../types";

// Helper functions (duplicated for now, or import from utils if available)
function isMonthKey(m: any) {
    return /^\d{4}-\d{2}$/.test(String(m || "").trim());
}
function isoMonth(d: Date) {
    return d.toISOString().slice(0, 7);
}
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
    if (m === 13) {
        m = 1;
        y += 1;
    }
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}
function inferredTaskMonth(st?: Student) {
    return nextMonthKey(latestScoreMonth(st));
}
function safeActionsByMonth(student?: Student): Record<string, any[]> {
    if (!student) return {};
    const abm = (student as any)?.actionsByMonth;
    if (abm && typeof abm === "object") return abm as Record<string, any[]>;

    const taskMonth = inferredTaskMonth(student);
    const aa = Array.isArray((student as any)?.activeActions)
        ? ((student as any).activeActions as any[])
        : [];
    return { [taskMonth]: aa };
}

interface TeacherStudentTableProps {
    students: Student[];
    selectedMhs: Set<string>;
    isTeacher: boolean;
    onSelectAll: (checked: boolean) => void;
    onSelectStudent: (mhs: string, checked: boolean) => void;
    sortTicks: "asc" | "desc" | "none";
    onSortTicks: () => void; // Toggle sort
    onGenerateAI: (student: Student) => void;
    onViewStudent: (mhs: string) => void;
    loadingMhs: string | null;
    onStudentAction?: (mhs: string) => void; // Mới: Mở modal quản lý HS
}

export default function TeacherStudentTable({
    students,
    selectedMhs,
    isTeacher,
    onSelectAll,
    onSelectStudent,
    sortTicks,
    onSortTicks,
    onGenerateAI,
    onViewStudent,
    loadingMhs,
    onStudentAction,
}: TeacherStudentTableProps) {
    return (
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200/60 text-xs uppercase text-slate-500 font-bold tracking-wider">
                            <th className="px-6 py-5 w-10">
                                <input
                                    type="checkbox"
                                    disabled={isTeacher} // teacher không dùng bulk select
                                    checked={
                                        !isTeacher &&
                                        students.length > 0 &&
                                        students.every((s) => selectedMhs.has(s.mhs))
                                    }
                                    onChange={(e) => onSelectAll(e.target.checked)}
                                    title={isTeacher ? "Giáo viên không dùng chọn hàng loạt" : "Chọn/Bỏ chọn tất cả học sinh đang hiển thị"}
                                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                            </th>
                            <th className="px-6 py-5">
                                <div className="flex items-center gap-2">
                                    MHS
                                </div>
                            </th>
                            <th className="px-6 py-5 w-[90px] text-center">MK</th>
                            <th className="px-6 py-5">Họ và Tên</th>
                            <th className="px-6 py-5">Lớp</th>
                            <th className="px-6 py-5">
                                <div className="flex items-center gap-1">
                                    <TrendingUp size={14} />
                                    Điểm TB
                                </div>
                            </th>
                            <th className="px-6 py-5">Rủi ro</th>
                            <th
                                className="px-6 py-5 cursor-pointer hover:bg-white/50 transition-colors group select-none"
                                onClick={onSortTicks}
                            >
                                <div className="flex items-center gap-2">
                                    Tiến độ Tick
                                    {sortTicks === "desc" && <span className="text-indigo-600">↓</span>}
                                    {sortTicks === "asc" && <span className="text-indigo-600">↑</span>}
                                    {sortTicks === "none" && <span className="text-slate-300 group-hover:text-slate-400">↕</span>}
                                </div>
                            </th>
                            <th className="px-6 py-5 text-right">Hành động</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100/60">
                        {students.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-6 py-20 text-center text-slate-400 italic">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                            <AlertTriangle size={24} className="text-slate-300" />
                                        </div>
                                        <div>
                                            {isTeacher ? "Chưa có học sinh trong lớp phụ trách." : "Không tìm thấy học sinh nào. Hãy nhập Excel hoặc Đồng bộ Sheet."}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            students.map((student) => {
                                const lastScore = student.scores?.[student.scores.length - 1];
                                const scores = [lastScore?.math, lastScore?.lit, lastScore?.eng].filter(
                                    (s) => s !== null && s !== undefined
                                ) as number[];
                                const avg =
                                    scores.length > 0
                                        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
                                        : "N/A";

                                const taskMonth = inferredTaskMonth(student);
                                const abm = safeActionsByMonth(student);
                                const acts = Array.isArray((student as any)?.actionsByMonth?.[taskMonth])
                                    ? ((student as any).actionsByMonth[taskMonth] as any[])
                                    : Array.isArray(abm?.[taskMonth])
                                        ? (abm[taskMonth] as any[])
                                        : Array.isArray(student.activeActions)
                                            ? (student.activeActions as any[])
                                            : [];

                                const totalTicksInTaskMonth = acts.reduce((acc, act: any) => {
                                    const ticks = Array.isArray(act?.ticks) ? act.ticks : [];
                                    const done = ticks.filter(
                                        (t: any) => t?.completed && String(t?.date || "").slice(0, 7) === taskMonth
                                    ).length;
                                    return acc + done;
                                }, 0);

                                return (
                                    <tr key={student.mhs} className="hover:bg-indigo-50/40 transition-colors duration-200 group">
                                        <td className="px-6 py-5">
                                            <input
                                                type="checkbox"
                                                disabled={isTeacher} // teacher không dùng bulk select
                                                checked={!isTeacher && selectedMhs.has(student.mhs)}
                                                onChange={(e) => onSelectStudent(student.mhs, e.target.checked)}
                                                className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </td>

                                        <td className="px-6 py-5 text-sm font-mono text-slate-500 font-medium">{student.mhs}</td>

                                        <td className="px-6 py-5 text-center">
                                            <TeacherResetPasswordButton mhs={student.mhs} />
                                        </td>

                                        <td className="px-6 py-5 text-sm font-bold text-slate-700">
                                            {student.name}
                                            {lastScore && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{lastScore.month}</div>}
                                        </td>

                                        <td className="px-6 py-5 text-sm text-slate-600">
                                            <span className="bg-slate-100 px-2 py-1 rounded-md text-xs font-semibold">{student.class}</span>
                                        </td>

                                        <td className="px-6 py-5 text-sm text-slate-600">
                                            {avg !== "N/A" ? (
                                                <div
                                                    className="flex items-center gap-2 cursor-help"
                                                    title={`Toán: ${lastScore?.math ?? "-"} | Văn: ${lastScore?.lit ?? "-"} | Anh: ${lastScore?.eng ?? "-"}`}
                                                >
                                                    <span
                                                        className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs shadow-sm bg-gradient-to-br ${Number(avg) >= 8
                                                            ? "from-emerald-400 to-emerald-600 text-white"
                                                            : Number(avg) >= 5
                                                                ? "from-amber-400 to-amber-600 text-white"
                                                                : "from-rose-400 to-rose-600 text-white"
                                                            }`}
                                                    >
                                                        {avg}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs italic">N/A</span>
                                            )}
                                        </td>

                                        <td className="px-6 py-5">
                                            {student.aiReport ? (
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border shadow-sm ${student.aiReport.riskLevel === "Cao"
                                                        ? "bg-rose-50 text-rose-600 border-rose-100"
                                                        : student.aiReport.riskLevel === "Trung bình"
                                                            ? "bg-amber-50 text-amber-600 border-amber-100"
                                                            : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                        }`}
                                                >
                                                    {student.aiReport.riskLevel === "Cao" && <AlertTriangle size={12} />}
                                                    {student.aiReport.riskLevel}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-xs italic">--</span>
                                            )}
                                        </td>

                                        <td className="px-6 py-5 text-sm text-slate-600">
                                            {acts.length > 0 ? (
                                                <div
                                                    className="w-full bg-slate-100 rounded-full h-2.5 max-w-[100px] shadow-inner overflow-hidden"
                                                    title={`${totalTicksInTaskMonth} tick hoàn thành`}
                                                >
                                                    <div
                                                        className="bg-indigo-500 h-full rounded-full transition-all duration-700 ease-out shimmer"
                                                        style={{ width: `${Math.min(totalTicksInTaskMonth * 5, 100)}%` }}
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs">-</span>
                                            )}
                                        </td>

                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-all">
                                                {loadingMhs === student.mhs ? (
                                                    <button
                                                        disabled
                                                        className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold flex items-center gap-2"
                                                        type="button"
                                                    >
                                                        <Loader2 size={14} className="animate-spin" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => onGenerateAI(student)}
                                                        className="px-3 py-2 bg-white/50 border border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-slate-600 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-1"
                                                        type="button"
                                                        title="Tạo báo cáo AI"
                                                    >
                                                        <Sparkles size={14} />
                                                        {student.aiReport ? "Tạo lại" : "Tạo AI"}
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => onViewStudent(student.mhs)}
                                                    className="p-2 bg-white/50 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl transition-all shadow-sm hover:shadow-lg hover:-translate-y-0.5"
                                                    title="Xem chi tiết"
                                                    type="button"
                                                >
                                                    <FileText size={18} />
                                                </button>

                                                {onStudentAction && !isTeacher && (
                                                    <button
                                                        onClick={() => onStudentAction(student.mhs)}
                                                        className="p-2 bg-white/50 border border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 rounded-xl transition-all shadow-sm hover:shadow-lg hover:-translate-y-0.5"
                                                        title="Quản lý HS"
                                                        type="button"
                                                    >
                                                        <MoreHorizontal size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
