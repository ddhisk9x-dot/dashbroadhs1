import React, { useState, useMemo, useEffect } from "react";
import { X, BarChart3, CalendarCheck, Edit2, Save, Activity, Check } from "lucide-react";
import { Student, AIReport, StudyAction } from "../../types";
import ScoreChart from "../ScoreChart";

// --- Helper Functions ---
function isoDate(d: Date) {
    return d.toISOString().slice(0, 10);
}
function isoMonth(d: Date) {
    return d.toISOString().slice(0, 7);
}
function getLastNDays(n: number) {
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        out.push(isoDate(d));
    }
    return out;
}
function getDatesInMonth(monthYYYYMM: string) {
    const [y, m] = monthYYYYMM.split("-").map((x) => parseInt(x, 10));
    if (!y || !m) return [];
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0)); // last day
    const out: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
        out.push(isoDate(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
}
function isMonthKey(m: any) {
    return /^\d{4}-\d{2}$/.test(String(m || "").trim());
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
    if (m === 13) { m = 1; y += 1; }
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}
function inferredTaskMonth(st?: Student) {
    return nextMonthKey(latestScoreMonth(st));
}
function uniqMonthsFromStudent(st?: Student) {
    const set = new Set<string>();
    (st?.scores || []).forEach((s) => {
        const mm = String((s as any)?.month || "").trim();
        if (isMonthKey(mm)) { set.add(mm); set.add(nextMonthKey(mm)); }
    });
    const abm = (st as any)?.actionsByMonth;
    if (abm && typeof abm === "object") {
        Object.keys(abm).forEach((k) => {
            if (isMonthKey(k)) set.add(k);
        });
    }
    if (st) set.add(inferredTaskMonth(st));
    const arr = Array.from(set);
    arr.sort();
    return arr;
}
function safeActionsByMonth(student?: Student): Record<string, StudyAction[]> {
    if (!student) return {};
    const abm = (student as any)?.actionsByMonth;
    if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;
    const taskMonth = inferredTaskMonth(student);
    const aa = Array.isArray((student as any)?.activeActions) ? ((student as any).activeActions as StudyAction[]) : [];
    return { [taskMonth]: aa };
}
function buildTickMap(action: any) {
    const m = new Map<string, boolean>();
    (action?.ticks || []).forEach((t: any) => m.set(String(t?.date), !!t?.completed));
    return m;
}

interface TeacherStudentDetailModalProps {
    student: Student;
    students: Student[]; // for chart avg calculation
    onClose: () => void;
    onUpdateReport: (mhs: string, report: AIReport, actions: StudyAction[]) => void;
    persistReport: (mhs: string, report: AIReport, actions: StudyAction[], monthKey: string) => Promise<any>;
}

export default function TeacherStudentDetailModal({
    student,
    students,
    onClose,
    onUpdateReport,
    persistReport
}: TeacherStudentDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"report" | "tracking" | "score">("report");
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        overview: student.aiReport?.overview || "",
        messageToStudent: student.aiReport?.messageToStudent || "",
        teacherNotes: student.aiReport?.teacherNotes || ""
    });

    // Tracking state
    const [trackingMode, setTrackingMode] = useState<"7" | "30" | "90" | "month">("7");
    const [trackingMonth, setTrackingMonth] = useState<string>(isoMonth(new Date()));

    // Recalculate tracking month if student changes
    useEffect(() => {
        const months = uniqMonthsFromStudent(student);
        const def = inferredTaskMonth(student);
        const latest = months.length ? months[months.length - 1] : def;
        setTrackingMonth(def);
    }, [student.mhs]);

    // Update edit form when student report changes
    useEffect(() => {
        if (student.aiReport) {
            setEditForm({
                overview: student.aiReport.overview,
                messageToStudent: student.aiReport.messageToStudent,
                teacherNotes: student.aiReport.teacherNotes
            });
        }
    }, [student.aiReport]);

    const handleSaveEdit = async () => {
        if (!student.aiReport) return;
        const updatedReport: AIReport = {
            ...student.aiReport,
            overview: editForm.overview,
            messageToStudent: editForm.messageToStudent,
            teacherNotes: editForm.teacherNotes,
        };
        const actionsForView = safeActionsByMonth(student)[inferredTaskMonth(student)] || [];
        try {
            const monthKey = inferredTaskMonth(student);
            await persistReport(student.mhs, updatedReport, actionsForView, monthKey);
            onUpdateReport(student.mhs, updatedReport, actionsForView);
            setIsEditing(false);
        } catch (e: any) {
            alert("Lỗi lưu: " + e.message);
        }
    };

    // Tracking Logic
    const taskMonthForViewingStudent = inferredTaskMonth(student);
    const monthForActions = trackingMode === "month" ? trackingMonth : taskMonthForViewingStudent;

    const actionsForView = useMemo(() => {
        const abm = safeActionsByMonth(student);
        const acts = abm[monthForActions];
        if (Array.isArray(acts)) return acts;
        // fallback legacy activeActions if match
        return Array.isArray(student.activeActions) ? student.activeActions : [];
    }, [student, monthForActions]);

    const trackingDates = useMemo(() => {
        if (trackingMode === "month") return getDatesInMonth(trackingMonth);
        const n = trackingMode === "7" ? 7 : trackingMode === "30" ? 30 : 90;
        return getLastNDays(n);
    }, [trackingMode, trackingMonth]);

    const trackingTitle = useMemo(() => {
        if (trackingMode === "month") return `Tiến độ (Tháng ${trackingMonth}) • Nhiệm vụ T.${trackingMonth}`;
        return `Tiến độ (${trackingMode} ngày qua) • Nhiệm vụ T.${monthForActions}`;
    }, [trackingMode, trackingMonth, monthForActions]);


    // Score Logic
    const scoreData = useMemo(() => {
        // Calculate stats (simplified re-implementation of existing logic)
        // For now just pass raw scores, assuming ScoreChart handles limits
        return student.scores || [];
    }, [student.scores]);

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{student.name}</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            MHS: <span className="font-mono text-indigo-600">{student.mhs}</span> | Lớp: {student.class}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 px-6">
                    <TabBtn label="Báo cáo AI" icon={<BarChart3 size={16} />} active={activeTab === "report"} onClick={() => setActiveTab("report")} />
                    <TabBtn label="Theo dõi Thói quen" icon={<CalendarCheck size={16} />} active={activeTab === "tracking"} onClick={() => setActiveTab("tracking")} />
                    <TabBtn label="Biểu đồ Điểm" icon={<Activity size={16} />} active={activeTab === "score"} onClick={() => setActiveTab("score")} />
                </div>

                {/* Content */}
                <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-[#fcfcfc] flex-1">
                    {activeTab === "report" && (
                        student.aiReport ? (
                            <div className="space-y-4">
                                <div className="flex justify-end">
                                    {!isEditing ? (
                                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200">
                                            <Edit2 size={14} /> Sửa nội dung
                                        </button>
                                    ) : (
                                        <button onClick={handleSaveEdit} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600">
                                            <Save size={14} /> Lưu
                                        </button>
                                    )}
                                </div>

                                <div className={`p-5 rounded-2xl border ${student.aiReport.riskLevel === "Cao" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                                    <h3 className="font-bold text-sm uppercase tracking-wide mb-3">Đánh giá Tổng quan</h3>
                                    {isEditing ? (
                                        <textarea className="w-full p-3 border rounded-xl" rows={3} value={editForm.overview} onChange={e => setEditForm({ ...editForm, overview: e.target.value })} />
                                    ) : (
                                        <p className="text-sm text-slate-800">{student.aiReport.overview}</p>
                                    )}
                                </div>

                                <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                                    <h3 className="font-bold text-sm uppercase tracking-wide text-indigo-700 mb-3">Lời nhắn cho Học sinh</h3>
                                    {isEditing ? (
                                        <textarea className="w-full p-3 border rounded-xl" rows={3} value={editForm.messageToStudent} onChange={e => setEditForm({ ...editForm, messageToStudent: e.target.value })} />
                                    ) : (
                                        <p className="text-sm text-indigo-900 italic">"{student.aiReport.messageToStudent}"</p>
                                    )}
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-sm uppercase tracking-wide text-slate-600 mb-3 flex items-center gap-2">Ghi chú Riêng tư (GV)</h3>
                                    {isEditing ? (
                                        <textarea className="w-full p-3 border rounded-xl bg-slate-50" rows={3} value={editForm.teacherNotes} onChange={e => setEditForm({ ...editForm, teacherNotes: e.target.value })} />
                                    ) : (
                                        <p className="text-sm text-slate-600">{student.aiReport.teacherNotes}</p>
                                    )}
                                </div>

                                <div>
                                    <h3 className="font-bold text-sm uppercase tracking-wide text-slate-600 mb-3 ml-1">Kế hoạch Học tập</h3>
                                    <div className="text-sm text-slate-600 bg-white border border-slate-100 rounded-2xl shadow-sm divide-y divide-slate-50">
                                        {(student.aiReport.studyPlan || []).map((p: any, i: number) => (
                                            <div key={i} className="p-4 grid grid-cols-4 gap-4">
                                                <span className="font-bold text-slate-400 text-xs uppercase pt-1">{p.day}</span>
                                                <span className="text-indigo-600 font-semibold">{p.subject}</span>
                                                <span className="col-span-2 text-slate-700">{p.content}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">Chưa có báo cáo AI.</div>
                        )
                    )}

                    {activeTab === "score" && (
                        <div className="p-4">
                            <ScoreChart
                                data={scoreData}
                                stats={{ classAvg: 0, gradeAvg: 0, avgScore: 0, targetScore: 0, leaderboardClass: {}, leaderboardGrade: {}, gradeAvgSubjectsByMonth: {} }}
                            />
                        </div>
                    )}

                    {activeTab === "tracking" && (
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                                <h3 className="font-bold text-slate-800">{trackingTitle}</h3>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                        {(["7", "30", "90", "month"] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setTrackingMode(m)}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg ${trackingMode === m ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                                            >
                                                {m === "month" ? "Theo tháng" : `${m} ngày`}
                                            </button>
                                        ))}
                                    </div>
                                    {trackingMode === "month" && (
                                        <select
                                            value={trackingMonth}
                                            onChange={(e) => setTrackingMonth(e.target.value)}
                                            className="ml-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white shadow-sm outline-none"
                                        >
                                            {uniqMonthsFromStudent(student)
                                                .slice().sort().reverse()
                                                .map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {actionsForView.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    Tháng này chưa có nhiệm vụ nào.
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {actionsForView.map((action: StudyAction) => {
                                        const tickMap = buildTickMap(action);
                                        const countDone = trackingDates.reduce((acc, d) => acc + (tickMap.get(d) ? 1 : 0), 0);
                                        return (
                                            <div key={action.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h4 className="font-semibold text-slate-700">{action.description}</h4>
                                                        <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block">{action.frequency}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-2xl font-bold text-indigo-600">{countDone}</span>
                                                        <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Tick</p>
                                                    </div>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <div className="min-w-[700px] flex items-center justify-between gap-2">
                                                        {trackingDates.map((dateString) => {
                                                            const isDone = !!tickMap.get(dateString);
                                                            const dateObj = new Date(dateString);
                                                            const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
                                                            return (
                                                                <div key={dateString} className="flex flex-col items-center gap-2 flex-1">
                                                                    <div className={`w-full h-2 rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-slate-100"}`} />
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${isDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-50 text-slate-400 border border-slate-100"}`} title={dateString}>
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
                    )}
                </div>
            </div>
        </div>
    );
}

function TabBtn({ label, icon, active, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${active ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
            <div className="flex items-center gap-2">{icon} {label}</div>
        </button>
    )
}
