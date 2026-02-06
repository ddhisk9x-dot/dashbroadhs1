import React, { useState, useMemo, useEffect } from "react";
import { User, Student, ScoreData, StudyAction, AIReport } from "../types";
import { LogOut, Users, School, LayoutDashboard, Menu, X, RefreshCw, AlertCircle, Edit, Trash2, GraduationCap, ClipboardList, BarChart as BarChartIcon } from "lucide-react";
import { api, generateStudentReport } from "../services/clientApi";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area
} from "recharts";

// Teacher Components Re-use
import TeacherHeader from "./teacher/TeacherHeader";
import TeacherBulkProgress from "./teacher/TeacherBulkProgress";
import TeacherSyncModal from "./teacher/TeacherSyncModal";
import TeacherStudentTable from "./teacher/TeacherStudentTable";
import TeacherStudentDetailModal from "./teacher/TeacherStudentDetailModal";

declare const XLSX: any;

interface AdminViewProps {
    user: User;
    students: Student[];
    onLogout: () => void;
    onImportData: (newStudents: Student[]) => void;
    onUpdateStudentReport: (mhs: string, report: AIReport, actions: StudyAction[]) => void;
}

// --- Helper Functions (Replicated from TeacherView for parity) ---
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function isoMonth(d: Date) { return d.toISOString().slice(0, 7); }
function isMonthKey(m: any) { return /^\d{4}-\d{2}$/.test(String(m || "").trim()); }
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
function latestScoreMonth(st?: Student) {
    const scores = Array.isArray(st?.scores) ? st!.scores : [];
    const last = scores.length ? (scores[scores.length - 1] as any) : null;
    const mk = String(last?.month || "").trim();
    return isMonthKey(mk) ? mk : isoMonth(new Date());
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
async function persistReportAndActions(mhs: string, report: AIReport, actions: StudyAction[], monthKey: string) {
    const res = await fetch("/api/admin/save-report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mhs, report, actions, monthKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Save report failed");
    return data;
}

export default function AdminView({ user, students, onLogout, onImportData, onUpdateStudentReport }: AdminViewProps) {
    const [activeTab, setActiveTab] = useState<"DASHBOARD" | "USERS" | "CLASSES" | "TEACHER_MODE" | "ANALYTICS">("DASHBOARD");
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white p-4 flex items-center justify-between border-b border-slate-200 sticky top-0 z-20">
                <div className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Admin Portal</div>
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600"><Menu size={24} /></button>
            </div>

            {/* Sidebar Overlay (Mobile) */}
            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

            {/* Sidebar */}
            <aside className={`fixed md:sticky top-0 h-screen w-64 bg-slate-900 text-white flex flex-col z-40 transition-transform duration-300 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Admin Portal</h1>
                        <div className="text-sm text-slate-400 mt-1">DeepDashboard</div>
                    </div>
                    <button className="md:hidden text-slate-400" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <SidebarItem icon={<LayoutDashboard size={20} />} label="Tổng quan" active={activeTab === "DASHBOARD"} onClick={() => { setActiveTab("DASHBOARD"); setIsSidebarOpen(false); }} />
                    <SidebarItem icon={<Users size={20} />} label="Quản lý Người dùng" active={activeTab === "USERS"} onClick={() => { setActiveTab("USERS"); setIsSidebarOpen(false); }} />
                    <SidebarItem icon={<School size={20} />} label="Quản lý Lớp học" active={activeTab === "CLASSES"} onClick={() => { setActiveTab("CLASSES"); setIsSidebarOpen(false); }} />
                    <SidebarItem icon={<BarChartIcon size={20} />} label="Báo cáo & Thống kê" active={activeTab === "ANALYTICS"} onClick={() => { setActiveTab("ANALYTICS"); setIsSidebarOpen(false); }} />
                    <div className="pt-4 mt-4 border-t border-slate-700">
                        <SidebarItem icon={<GraduationCap size={20} />} label="Chế độ Giáo viên" active={activeTab === "TEACHER_MODE"} onClick={() => { setActiveTab("TEACHER_MODE"); setIsSidebarOpen(false); }} />
                    </div>
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">{user.name.charAt(0)}</div>
                        <div className="flex-1 overflow-hidden">
                            <div className="text-sm font-medium truncate">{user.name}</div>
                            <div className="text-xs text-slate-400">Administrator</div>
                        </div>
                    </div>
                    <button onClick={onLogout} className="w-full flex items-center gap-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-colors">
                        <LogOut size={18} /><span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-x-hidden min-h-screen bg-slate-50 relative">
                {activeTab === "TEACHER_MODE" ? (
                    <AdminTeacherMode
                        students={students}
                        onImportData={onImportData}
                        onUpdateStudentReport={onUpdateStudentReport}
                        user={user}
                    />
                ) : activeTab === "ANALYTICS" ? (
                    <AdminAnalyticsTab students={students} />
                ) : (
                    <div className="p-4 md:p-8">
                        {activeTab === "DASHBOARD" && <AdminDashboardTab students={students} />}
                        {activeTab === "USERS" && <AdminUsersTab />}
                        {activeTab === "CLASSES" && <AdminClassesTab />}
                    </div>
                )}
            </main>
        </div>
    );
}

// --- Admin Teacher Mode Tab (Re-implementation of Teacher View Logic) ---
function AdminTeacherMode({ students, onImportData, onUpdateStudentReport, user }: {
    students: Student[],
    onImportData: (s: Student[]) => void,
    onUpdateStudentReport: (m: string, r: AIReport, a: StudyAction[]) => void,
    user: User
}) {
    const [loadingMhs, setLoadingMhs] = useState<string | null>(null);
    const [viewingMhs, setViewingMhs] = useState<string | null>(null);
    const viewingStudent = students.find(s => s.mhs === viewingMhs);

    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMhs, setSelectedMhs] = useState<Set<string>>(new Set());
    const [filterClass, setFilterClass] = useState("ALL");
    const [sortTicks, setSortTicks] = useState<"none" | "desc" | "asc">("none");

    const teacherClass = ""; // Admin sees all classes by default or can filter
    const isTeacher = false; // Admin is NOT teacher, so they have FULL privileges (sync etc)

    const visibleStudents = useMemo(() => students, [students]); // All students visible to admin

    const uniqueClasses = useMemo(() => {
        const classes = new Set(visibleStudents.map((s) => s.class || "").filter(Boolean));
        return Array.from(classes).sort();
    }, [visibleStudents]);

    const filteredStudents = useMemo(() => {
        const q = searchTerm.toLowerCase();
        let list = visibleStudents.filter(
            (s) =>
                (filterClass === "ALL" || s.class === filterClass) &&
                (s.name.toLowerCase().includes(q) || s.mhs.toLowerCase().includes(q) || s.class.toLowerCase().includes(q))
        );

        if (sortTicks !== "none") {
            list = list.slice().sort((a, b) => {
                const getTicks = (st: Student) => {
                    const taskMonth = inferredTaskMonth(st);
                    const abm = safeActionsByMonth(st);
                    const acts = abm[taskMonth] || [];
                    return acts.reduce((acc, act: any) => {
                        const ticks = Array.isArray(act?.ticks) ? act.ticks : [];
                        const done = ticks.filter((t: any) => t?.completed && String(t?.date || "").slice(0, 7) === taskMonth).length;
                        return acc + done;
                    }, 0);
                };
                const ticksA = getTicks(a);
                const ticksB = getTicks(b);
                return sortTicks === "desc" ? ticksB - ticksA : ticksA - ticksB;
            });
        }
        return list;
    }, [visibleStudents, searchTerm, filterClass, sortTicks]);

    // Bulk Generation
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
    const handleGenerateAI = async (student: Student) => {
        setLoadingMhs(student.mhs);
        try {
            const report = await generateStudentReport(student);
            const monthKey = inferredTaskMonth(student);
            const newActions: StudyAction[] = (report.actions || []).map((a: any, idx: number) => ({
                id: `${student.mhs}-${Date.now()}-${idx}`,
                description: a.description,
                frequency: a.frequency,
                ticks: [],
            }));
            await persistReportAndActions(student.mhs, report, newActions, monthKey);
            onUpdateStudentReport(student.mhs, report, newActions);
        } catch (e: any) { alert(e?.message || "Lỗi tạo báo cáo"); } finally { setLoadingMhs(null); }
    };

    const handleBulkGenerate = async () => {
        const targets = filteredStudents.filter((s) => selectedMhs.has(s.mhs));
        if (!targets.length) { alert("Chưa chọn học sinh"); return; }
        if (!confirm(`Tạo báo cáo cho ${targets.length} học sinh?`)) return;

        setBulkProgress({ current: 0, total: targets.length, currentName: "" });
        for (let i = 0; i < targets.length; i++) {
            const st = targets[i];
            setBulkProgress({ current: i + 1, total: targets.length, currentName: st.name });
            try { await handleGenerateAI(st); } catch { }
            if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
        }
        setBulkProgress(null);
        alert("Hoàn tất!");
    };

    // Sync
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [syncMonthsAll, setSyncMonthsAll] = useState<string[]>([]);
    const [syncSelectedMonths, setSyncSelectedMonths] = useState<Set<string>>(new Set());
    const [syncMonthSearch, setSyncMonthSearch] = useState("");
    const [syncHint, setSyncHint] = useState("");

    const handleSyncSheet = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch("/api/sync/sheets", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "new_only" }),
            });
            const data = await res.json();
            if (data.monthsSynced && data.monthsSynced.length > 0) {
                alert(`Đồng bộ xong ${data.students} HS`);
                window.location.reload();
            } else {
                setSyncMonthsAll(data.monthsAll || []);
                setSyncSelectedMonths(new Set(data.monthsAll));
                setSyncHint("Không có tháng mới. Chọn tháng để đồng bộ lại.");
                setSyncModalOpen(true);
            }
        } catch (e) { alert("Lỗi kết nối"); } finally { setIsSyncing(false); }
    };

    const handleSubmitSync = async () => {
        if (!syncSelectedMonths.size) return;
        setIsSyncing(true);
        try {
            const res = await fetch("/api/sync/sheets", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "months", selectedMonths: Array.from(syncSelectedMonths) }),
            });
            const data = await res.json();
            if (data.ok) {
                alert(`Đồng bộ xong ${data.students} HS`);
                window.location.reload();
            } else { alert(data.error); }
        } catch { alert("Lỗi kết nối"); } finally { setIsSyncing(false); setSyncModalOpen(false); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: "binary" });
            const studentMap = new Map<string, Student>();
            students.forEach(s => studentMap.set(s.mhs, { ...s }));

            wb.SheetNames.forEach((sheetName: string) => {
                const ws = wb.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const mhs = row[1] ? String(row[1]).trim() : null;
                    if (!mhs) continue;
                    const name = row[2] ? String(row[2]).trim() : "Unknown";
                    const cls = row[3] ? String(row[3]).trim() : "";
                    const parseScore = (v: any) => {
                        if (v === undefined || v === null || v === "") return null;
                        const n = parseFloat(v);
                        return isNaN(n) ? null : n;
                    }
                    const math = parseScore(row[5]);
                    const lit = parseScore(row[6]);
                    const eng = parseScore(row[7]);
                    if (math === null && lit === null && eng === null) continue;
                    const scoreEntry: ScoreData = { month: sheetName, math, lit, eng };
                    let student = studentMap.get(mhs);
                    if (!student) {
                        student = { mhs, name, class: cls, scores: [], activeActions: [] };
                        studentMap.set(mhs, student);
                    } else {
                        student.name = name;
                        student.class = cls;
                    }
                    const exIdx = student.scores.findIndex(s => s.month === sheetName);
                    if (exIdx >= 0) student.scores[exIdx] = scoreEntry;
                    else student.scores.push(scoreEntry);
                }
            });
            const newList = Array.from(studentMap.values());
            onImportData(newList);
            alert(`Nhập xong ${newList.length} HS`);
        };
        reader.readAsBinaryString(file);
    }

    return (
        <div className="relative">
            <TeacherBulkProgress progress={bulkProgress} />
            <TeacherSyncModal
                isOpen={syncModalOpen} onClose={() => setSyncModalOpen(false)}
                syncHint={syncHint} syncMonthSearch={syncMonthSearch} onSyncMonthSearchChange={setSyncMonthSearch}
                syncMonthsAll={syncMonthsAll} syncSelectedMonths={syncSelectedMonths}
                onToggleMonth={(m) => setSyncSelectedMonths(prev => { const next = new Set(prev); if (next.has(m)) next.delete(m); else next.add(m); return next; })}
                onSelectAll={() => setSyncSelectedMonths(new Set(syncMonthsAll))} onClearAll={() => setSyncSelectedMonths(new Set())}
                onSubmit={handleSubmitSync} isSyncing={isSyncing} isTeacher={isTeacher}
            />
            {/* Using TeacherHeader directly ensures UI parity */}
            <TeacherHeader
                searchTerm={searchTerm} onSearchChange={setSearchTerm}
                filterClass={filterClass} onFilterClassChange={setFilterClass} uniqueClasses={uniqueClasses}
                sortTicks={sortTicks} onSortTicksChange={setSortTicks}
                isTeacher={isTeacher} teacherClass={teacherClass}
                visibleStudents={visibleStudents}
                onLogout={() => { }} // Logout handled by Admin Sidebar
                onBulkGenerate={handleBulkGenerate} onSyncSheet={handleSyncSheet} onFileUpload={handleFileUpload}
                isSyncing={isSyncing} isBulkProcessing={!!bulkProgress}
            />
            <div className="p-4 sm:p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                    <AlertCircle size={20} className="text-yellow-600" />
                    <span className="text-yellow-800 font-medium text-sm">Bạn đang xem ở chế độ "Giáo viên". Những thay đổi ở đây sẽ ảnh hưởng trực tiếp đến dữ liệu học sinh.</span>
                </div>
                <TeacherStudentTable
                    students={filteredStudents} selectedMhs={selectedMhs} isTeacher={isTeacher}
                    onSelectAll={(checked) => setSelectedMhs(checked ? new Set(filteredStudents.map(s => s.mhs)) : new Set())}
                    onSelectStudent={(mhs, checked) => setSelectedMhs(prev => { const next = new Set(prev); if (checked) next.add(mhs); else next.delete(mhs); return next; })}
                    sortTicks={sortTicks} onSortTicks={() => setSortTicks(prev => prev === "desc" ? "asc" : prev === "asc" ? "none" : "desc")}
                    onGenerateAI={handleGenerateAI} onViewStudent={setViewingMhs} loadingMhs={loadingMhs}
                />
            </div>
            {viewingStudent && (
                <TeacherStudentDetailModal
                    student={viewingStudent} students={students} onClose={() => setViewingMhs(null)}
                    onUpdateReport={onUpdateStudentReport} persistReport={persistReportAndActions}
                />
            )}
        </div>
    )
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
            {icon} <span className="font-medium">{label}</span>
        </button>
    );
}

// ... (Rest of existing Admin Components: AdminDashboardTab, AdminUsersTab, UserModal, AdminClassesTab, ClassModal, StatCard)
function AdminDashboardTab({ students }: { students: Student[] }) {
    const totalStudents = students.length;
    const totalClasses = new Set(students.map(s => s.class)).size;
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");

    const handleSync = async () => {
        if (syncing) return;
        setSyncing(true); setSyncMsg("");
        try {
            const res = await api.syncSheet({ mode: "new_only" }) as any;
            if (res.ok) setSyncMsg(`✅ Đồng bộ thành công! +${res.newMonthsDetected?.length || 0} tháng mới.`);
            else setSyncMsg("❌ Lỗi: " + (res.error || "Không xác định"));
        } catch (e: any) { setSyncMsg("❌ Lỗi kết nối: " + e.message); } finally { setSyncing(false); }
    };
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800">Tổng quan hệ thống</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard label="Tổng Học sinh" value={totalStudents} color="blue" />
                <StatCard label="Lớp học hoạt động" value={totalClasses} color="purple" />
                <StatCard label="Giáo viên" value="--" color="emerald" />
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-start gap-4">
                    <div className="bg-blue-50 p-3 rounded-full text-blue-600"><RefreshCw size={24} className={syncing ? "animate-spin" : ""} /></div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-800">Đồng bộ dữ liệu nhanh</h3>
                        <p className="text-slate-500 mb-4 text-sm">Cập nhật nhanh từ Google Sheets. Để sử dụng đầy đủ chức năng AI/Excel, vui lòng chuyển sang tab <strong>Chế độ Giáo viên</strong>.</p>
                        <div className="flex items-center gap-4">
                            <button onClick={handleSync} disabled={syncing} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                                {syncing ? "Đang xử lý..." : "Đồng bộ ngay"}
                            </button>
                            {syncMsg && <span className={`text-sm font-medium ${syncMsg.startsWith("❌") ? "text-red-600" : "text-emerald-600"}`}>{syncMsg}</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface AdminUser extends User { id?: string; lastLogin?: string; }
function AdminUsersTab() {
    const [users, setUsers] = useState<AdminUser[]>([
        { username: "admin", name: "Quản trị viên", role: "ADMIN" as any },
        { username: "gv01", name: "Nguyễn Văn A", role: "TEACHER" as any },
        { username: "gv02", name: "Trần Thị B", role: "TEACHER" as any },
        { username: "gv03", name: "Trần Thị C", role: "TEACHER" as any },
    ]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const handleDelete = (username: string) => { if (confirm(`Xóa ${username}?`)) setUsers(users.filter((u) => u.username !== username)); };
    const handleEdit = (user: AdminUser) => { setEditingUser(user); setIsModalOpen(true); };
    const handleSave = (user: AdminUser) => {
        if (editingUser) setUsers(users.map(u => u.username === user.username ? user : u));
        else setUsers([...users, user]);
        setIsModalOpen(false); setEditingUser(null);
    };
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-slate-800">Quản lý Người dùng (Thủ công)</h2>
                <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"><Users size={18} /><span>Thêm User</span></button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
                <div>
                    <h4 className="font-bold text-blue-800 text-sm">Lưu ý về Đồng bộ</h4>
                    <p className="text-blue-700 text-sm mt-1">Dữ liệu thêm ở đây là tạm thời. Hãy cập nhật Google Sheets để dữ liệu không bị mất khi Deploy lại.</p>
                </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="px-6 py-4 font-semibold text-slate-600">Tên</th><th className="px-6 py-4 font-semibold text-slate-600">Username</th><th className="px-6 py-4 font-semibold text-slate-600">Role</th><th className="px-6 py-4 font-semibold text-slate-600 text-right">Action</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map((u) => (
                                <tr key={u.username} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">{u.name}</td><td className="px-6 py-4 text-slate-500">{u.username}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${u.role === "ADMIN" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>{u.role}</span></td>
                                    <td className="px-6 py-4 text-right space-x-2"><button onClick={() => handleEdit(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button><button onClick={() => handleDelete(u.username)} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && <UserModal user={editingUser} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
}

function UserModal({ user, onClose, onSave }: { user: AdminUser | null; onClose: () => void; onSave: (u: AdminUser) => void; }) {
    const [name, setName] = useState(user?.name || "");
    const [username, setUsername] = useState(user?.username || "");
    const [role, setRole] = useState(user?.role || "TEACHER");
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-slate-800">{user ? "Sửa User" : "Thêm User"}</h3>
                <div className="space-y-4">
                    <div><label className="block text-sm font-medium mb-1">Tên</label><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
                    <div><label className="block text-sm font-medium mb-1">Username</label><input value={username} onChange={e => setUsername(e.target.value)} disabled={!!user} className="w-full border rounded-lg px-3 py-2 disabled:bg-slate-100" /></div>
                    <div><label className="block text-sm font-medium mb-1">Role</label><select value={role} onChange={e => setRole(e.target.value as any)} className="w-full border rounded-lg px-3 py-2"><option value="TEACHER">Giáo viên</option><option value="ADMIN">Admin</option></select></div>
                </div>
                <div className="flex justify-end gap-3 mt-6"><button onClick={onClose} className="text-slate-500">Hủy</button><button onClick={() => onSave({ username, name, role: role as any })} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Lưu</button></div>
            </div>
        </div>
    );
}

interface ClassItem { id: string; name: string; teacherId?: string; studentCount: number; }
function AdminClassesTab() {
    const [classes, setClasses] = useState<ClassItem[]>([{ id: "10A1", name: "10A1", teacherId: "gv01", studentCount: 35 }, { id: "11A2", name: "11A2", teacherId: "gv02", studentCount: 32 }]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const handleAddClass = (cls: ClassItem) => { setClasses([...classes, cls]); setIsModalOpen(false); };
    const handleDelete = (id: string) => { if (confirm(`Xóa lớp ${id}?`)) setClasses(classes.filter((c) => c.id !== id)); };
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-slate-800">Quản lý Lớp học (Demo)</h2><button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl flex items-center gap-2"><School size={18} /><span>Thêm lớp</span></button></div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left"><thead className="bg-slate-50 border-b"><tr><th className="px-6 py-4">Lớp</th><th className="px-6 py-4">GVCN</th><th className="px-6 py-4">Sĩ số</th><th className="px-6 py-4 text-right">Action</th></tr></thead>
                    <tbody className="divide-y">{classes.map(c => (<tr key={c.id} className="hover:bg-slate-50"><td className="px-6 py-4">{c.name}</td><td className="px-6 py-4">{c.teacherId}</td><td className="px-6 py-4"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{c.studentCount} HS</span></td><td className="px-6 py-4 text-right"><button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800 text-sm">Xóa</button></td></tr>))}</tbody></table>
            </div>
            {isModalOpen && <ClassModal onClose={() => setIsModalOpen(false)} onSave={handleAddClass} />}
        </div>
    )
}
function ClassModal({ onClose, onSave }: { onClose: () => void; onSave: (c: ClassItem) => void }) {
    const [name, setName] = useState(""); const [teacherId, setTeacherId] = useState("");
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl"><h3 className="text-xl font-bold mb-4">Thêm lớp</h3><div className="space-y-4"><div><label className="block text-sm font-medium">Tên</label><input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium">GVCN</label><input value={teacherId} onChange={e => setTeacherId(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div></div><div className="flex justify-end gap-3 mt-6"><button onClick={onClose} className="text-slate-500">Hủy</button><button onClick={() => onSave({ id: name, name, teacherId, studentCount: 0 })} className="bg-purple-600 text-white px-4 py-2 rounded-lg">Tạo</button></div></div></div>
    )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: "blue" | "purple" | "emerald" }) {
    const colorStyles = { blue: "bg-blue-50 text-blue-700 border-blue-100", purple: "bg-purple-50 text-purple-700 border-purple-100", emerald: "bg-emerald-50 text-emerald-700 border-emerald-100" }
    return <div className={`p-6 rounded-2xl border ${colorStyles[color]}`}><div className="text-sm font-medium opacity-80">{label}</div><div className="text-4xl font-bold mt-2">{value}</div></div>
}

// --- Admin Analytics Tab ---
function AdminAnalyticsTab({ students }: { students: Student[] }) {
    // 1. Score Trends Data
    const scoreTrendData = useMemo(() => {
        const monthMap = new Map<string, { math: number[], lit: number[], eng: number[] }>();
        const allMonths = new Set<string>();

        students.forEach(s => {
            s.scores.forEach(score => {
                const m = score.month;
                if (!isMonthKey(m)) return;
                allMonths.add(m);
                if (!monthMap.has(m)) monthMap.set(m, { math: [], lit: [], eng: [] });
                const entry = monthMap.get(m)!;
                if (typeof score.math === "number") entry.math.push(score.math);
                if (typeof score.lit === "number") entry.lit.push(score.lit);
                if (typeof score.eng === "number") entry.eng.push(score.eng);
            });
        });

        return Array.from(allMonths).sort().map(month => {
            const data = monthMap.get(month)!;
            const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
            const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
            const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;

            // Average across all 3 subjects
            const allScores = [...data.math, ...data.lit, ...data.eng];
            return {
                month,
                avgScore: parseFloat(avg(allScores).toFixed(2)),
                maxScore: max(allScores),
                minScore: min(allScores),
            };
        });
    }, [students]);

    // 2. Class Ticks Data
    const [selectedMonth, setSelectedMonth] = useState<string>(isoMonth(new Date()));

    // Get available months for dropdown
    const availableMonths = useMemo(() => {
        const s = new Set<string>();
        students.forEach(st => st.scores?.forEach(sc => s.add(sc.month))); // Use score months as proxy
        return Array.from(s).sort().reverse();
    }, [students]);

    const classTickData = useMemo(() => {
        const classMap = new Map<string, { totalTicks: number, studentCount: number }>();

        students.forEach(s => {
            const cls = s.class || "Unknown";
            if (!classMap.has(cls)) classMap.set(cls, { totalTicks: 0, studentCount: 0 });

            const entry = classMap.get(cls)!;
            entry.studentCount++;

            // Calculate ticks for selected month (Fallback to activeActions if selected matches current inferred)
            const taskMonth = inferredTaskMonth(s);
            const abm = safeActionsByMonth(s); // Uses activeActions if month matches or is missing
            const actions = abm[selectedMonth] || (selectedMonth === taskMonth ? s.activeActions : []);

            let ticksCount = 0;
            if (Array.isArray(actions)) {
                actions.forEach(a => {
                    const ticks = Array.isArray(a.ticks) ? a.ticks : [];
                    ticksCount += ticks.filter(t => t.completed).length;
                    // Note: Ideally filter tick date by month too, but for now assuming action month alignment
                });
            }
            entry.totalTicks += ticksCount;
        });

        return Array.from(classMap.entries()).map(([cls, data]) => ({
            name: cls,
            totalTicks: data.totalTicks,
            avgTicks: parseFloat((data.totalTicks / data.studentCount).toFixed(1)),
        })).sort((a, b) => b.avgTicks - a.avgTicks);
    }, [students, selectedMonth]);

    return (
        <div className="p-4 md:p-8 space-y-8 animate-in fade-in">
            <h2 className="text-2xl font-bold text-slate-800">Báo cáo & Thống kê</h2>

            {/* Chart 1: Academic Performance Trends */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-700 mb-4">Biến động Điểm số (TB Khối)</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={scoreTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} domain={[0, 10]} />
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Area type="monotone" dataKey="avgScore" name="Điểm TB" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAvg)" strokeWidth={3} />
                            <Line type="monotone" dataKey="maxScore" name="Cao nhất" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                            <Line type="monotone" dataKey="minScore" name="Thấp nhất" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Chart 2: Class Engagement (Ticks) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-700">Mức độ Chăm chỉ theo Lớp (Ticks)</h3>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                        {availableMonths.length === 0 && <option value={isoMonth(new Date())}>{isoMonth(new Date())}</option>}
                    </select>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={classTickData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                            <RechartsTooltip
                                cursor={{ fill: '#f1f5f9' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="avgTicks" name="TB Ticks/HS" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={40} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 text-center text-sm text-slate-500 italic">
                    * Dữ liệu dựa trên tổng số nhiệm vụ (ticks) hoàn thành của lớp chia cho sĩ số.
                </div>
            </div>
        </div>
    );
}
