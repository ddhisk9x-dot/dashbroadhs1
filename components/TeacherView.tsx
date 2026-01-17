"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Student, ScoreData, StudyAction, AIReport } from "../types";
import { generateStudentReport } from "../services/clientApi";
import {
  Upload,
  Users,
  FileText,
  AlertTriangle,
  Loader2,
  Edit2,
  Save,
  X,
  Search,
  Activity,
  CalendarCheck,
  BarChart3,
  Check,
  Sparkles,
} from "lucide-react";

declare const XLSX: any;

interface TeacherViewProps {
  students: Student[];
  onImportData: (newStudents: Student[]) => void;
  onUpdateStudentReport: (mhs: string, report: AIReport, actions: StudyAction[]) => void;
  onLogout: () => void;
}

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
  // monthKey: YYYY-MM
  const [y, m] = monthKey.split("-").map((x) => parseInt(x, 10));
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const out: string[] = [];
  for (let day = 1; day <= last.getDate(); day++) {
    out.push(toISODate(new Date(y, m - 1, day)));
  }
  return out;
}

function monthLabel(monthKey: string) {
  // 2025-08 -> 08/2025
  const [y, m] = monthKey.split("-");
  return `${m}/${y}`;
}

function extractMonthFromISO(date: string) {
  // YYYY-MM-DD -> YYYY-MM
  return date.slice(0, 7);
}

function safeActionsByMonth(student?: Student) {
  if (!student) return {};
  if (student.actionsByMonth && typeof student.actionsByMonth === "object") return student.actionsByMonth;
  // migrate từ activeActions (cũ) vào tháng gần nhất
  const latest = (student.scores?.[student.scores.length - 1]?.month || new Date().toISOString().slice(0, 7)).trim();
  const aa = Array.isArray(student.activeActions) ? student.activeActions : [];
  if (aa.length) return { [latest]: aa };
  return {};
}

const TeacherView: React.FC<TeacherViewProps> = ({
  students,
  onImportData,
  onUpdateStudentReport,
  onLogout,
}) => {
  const [loadingMhs, setLoadingMhs] = useState<string | null>(null);
  const [viewingMhs, setViewingMhs] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"report" | "tracking">("report");
  const [selectedMhs, setSelectedMhs] = useState<Set<string>>(new Set());

  const [isSyncing, setIsSyncing] = useState(false);

  // Bulk Generation State
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ overview: string; messageToStudent: string; teacherNotes: string }>({
    overview: "",
    messageToStudent: "",
    teacherNotes: "",
  });

  // ✅ Tracking range mode
  const [trackMode, setTrackMode] = useState<"month" | "recent">("month");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);

  const viewingStudent = students.find((s) => s.mhs === viewingMhs);

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.mhs.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (viewingStudent && viewingStudent.aiReport) {
      setEditForm({
        overview: viewingStudent.aiReport.overview,
        messageToStudent: viewingStudent.aiReport.messageToStudent,
        teacherNotes: viewingStudent.aiReport.teacherNotes,
      });
      setIsEditing(false);
    }
  }, [viewingStudent]);

  const actionsByMonth = useMemo(() => safeActionsByMonth(viewingStudent), [viewingStudent]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (viewingStudent?.scores || []).forEach((s) => {
      if (/^\d{4}-\d{2}$/.test(String(s.month || "").trim())) set.add(String(s.month).trim());
    });
    Object.keys(actionsByMonth || {}).forEach((k) => {
      if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
    });
    const arr = Array.from(set);
    arr.sort(); // tăng dần
    return arr;
  }, [viewingStudent, actionsByMonth]);

  const defaultMonth = useMemo(() => {
    const lastScoreMonth = viewingStudent?.scores?.[viewingStudent.scores.length - 1]?.month;
    const mk = String(lastScoreMonth || "").trim();
    if (/^\d{4}-\d{2}$/.test(mk)) return mk;
    return availableMonths[availableMonths.length - 1] || new Date().toISOString().slice(0, 7);
  }, [viewingStudent, availableMonths]);

  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (defaultMonth) setSelectedMonth(defaultMonth);
  }, [defaultMonth]);

  const dateColumns = useMemo(() => {
    if (trackMode === "recent") return getLastNDays(rangeDays);
    return getDaysInMonth(selectedMonth);
  }, [trackMode, rangeDays, selectedMonth]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const studentMap = new Map<string, Student>();

      students.forEach((s) => studentMap.set(s.mhs, { ...s }));

      wb.SheetNames.forEach((sheetName: string) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const mhs = row[1] ? String(row[1]).trim() : null;
          if (!mhs) continue;

          const name = row[2] ? String(row[2]).trim() : "Unknown";
          const className = row[3] ? String(row[3]).trim() : "";

          const parseScore = (val: any) => {
            if (val === undefined || val === null || val === "") return null;
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          };

          const math = parseScore(row[5]);
          const lit = parseScore(row[6]);
          const eng = parseScore(row[7]);

          if (math === null && lit === null && eng === null) continue;

          const scoreEntry: ScoreData = { month: sheetName, math, lit, eng };

          let student = studentMap.get(mhs);
          if (!student) {
            student = { mhs, name, class: className, scores: [], activeActions: [], actionsByMonth: {} };
            studentMap.set(mhs, student);
          } else {
            student.name = name;
            student.class = className;
          }

          const existingScoreIndex = (student.scores || []).findIndex((s) => s.month === sheetName);
          if (existingScoreIndex >= 0) student.scores[existingScoreIndex] = scoreEntry;
          else student.scores = [...(student.scores || []), scoreEntry];
        }
      });

      const newStudentList = Array.from(studentMap.values());
      onImportData(newStudentList);
      alert(`Nhập thành công! Đã xử lý ${newStudentList.length} học sinh qua ${wb.SheetNames.length} sheet tháng.`);
    };
    reader.readAsBinaryString(file);
  };

  const handleGenerateAI = async (student: Student) => {
    setLoadingMhs(student.mhs);
    try {
      const report = await generateStudentReport(student);

      // ✅ tạo actions mới (mặc định vẫn dùng callback cũ)
      const newActions: StudyAction[] = (report.actions || []).map((a: any, idx: number) => ({
        id: `${student.mhs}-${Date.now()}-${idx}`,
        description: a.description,
        frequency: a.frequency,
        ticks: [],
      }));

      onUpdateStudentReport(student.mhs, report, newActions);
    } catch {
      alert("Không thể tạo báo cáo. Vui lòng kiểm tra API Key.");
    } finally {
      setLoadingMhs(null);
    }
  };

  const handleBulkGenerate = async () => {
    const targets = filteredStudents.filter((s) => selectedMhs.has(s.mhs));
    if (targets.length === 0) {
      alert("Bạn chưa chọn học sinh nào.");
      return;
    }

    if (!confirm(`Bạn có chắc muốn tạo báo cáo AI cho ${targets.length} học sinh đang chọn không?`)) return;

    setBulkProgress({ current: 0, total: targets.length, currentName: "" });

    for (let i = 0; i < targets.length; i++) {
      const student = targets[i];
      setBulkProgress({ current: i + 1, total: targets.length, currentName: student.name });

      try {
        const report = await generateStudentReport(student);
        const newActions: StudyAction[] = (report.actions || []).map((a: any, idx: number) => ({
          id: `${student.mhs}-${Date.now()}-${idx}`,
          description: a.description,
          frequency: a.frequency,
          ticks: [],
        }));
        onUpdateStudentReport(student.mhs, report, newActions);
      } catch (err) {
        console.error(`Failed to generate for ${student.mhs}`, err);
      }

      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 2000));
    }

    setBulkProgress(null);
    alert("Hoàn tất tạo báo cáo hàng loạt!");
  };

  const handleSyncSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/sheets", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        alert(`Lỗi đồng bộ: ${data?.error || "Sync failed"}`);
        return;
      }

      alert(`Đồng bộ xong: ${data.students} HS, ${data.monthsDetected} tháng`);
      window.location.reload();
    } catch (e: any) {
      alert(`Lỗi đồng bộ: ${e?.message || "Network error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveEdit = () => {
    if (!viewingStudent || !viewingStudent.aiReport) return;
    const updatedReport: AIReport = {
      ...viewingStudent.aiReport,
      overview: editForm.overview,
      messageToStudent: editForm.messageToStudent,
      teacherNotes: editForm.teacherNotes,
    };
    onUpdateStudentReport(viewingStudent.mhs, updatedReport, viewingStudent.activeActions || []);
    setIsEditing(false);
  };

  // ✅ helpers for tracking view
  const monthActions: StudyAction[] = useMemo(() => {
    if (!viewingStudent) return [];
    const abm = safeActionsByMonth(viewingStudent);
    if (trackMode === "recent") {
      // recent: show union actions in last N days (simple: use selectedMonth if exists, else latest)
      const mk = selectedMonth || defaultMonth;
      return (abm[mk] || viewingStudent.activeActions || []) as StudyAction[];
    }
    return (abm[selectedMonth] || []) as StudyAction[];
  }, [viewingStudent, selectedMonth, trackMode, defaultMonth]);

  const renderTracking = () => {
    if (!viewingStudent) return null;

    const actions = monthActions;

    if (!actions.length) {
      return (
        <div className="text-center py-10 text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
          Chưa có nhiệm vụ cho khoảng đang xem.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                title="Chọn tháng để xem nhiệm vụ + tick"
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

        {actions.map((action) => {
          const completedInRange = (action.ticks || []).filter(
            (t) => t.completed && dateColumns.includes(t.date)
          ).length;

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
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">TICK ({trackMode === "month" ? "tháng" : "gần đây"})</p>
                </div>
              </div>

              {/* ✅ cuộn ngang theo ngày */}
              <div className="overflow-x-auto">
                <div className="min-w-[720px] flex items-center gap-2">
                  {dateColumns.map((dateString) => {
                    const isDone = (action.ticks || []).some((t) => t.date === dateString && t.completed);
                    const dateObj = new Date(dateString);
                    const dayLabel = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

                    return (
                      <div key={dateString} className="flex flex-col items-center gap-2 w-10 shrink-0">
                        <div
                          className={`w-full h-2 rounded-full transition-all duration-300 ${
                            isDone ? "bg-emerald-500" : "bg-slate-100"
                          }`}
                          title={isDone ? `Hoàn thành: ${dateString}` : `Chưa làm: ${dateString}`}
                        ></div>
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
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
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans relative">
      {/* Bulk Progress Overlay */}
      {bulkProgress && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <Sparkles size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Đang phân tích dữ liệu...</h3>
            <p className="text-slate-500 mb-6">
              Đang xử lý: <span className="font-bold text-indigo-600">{bulkProgress.currentName}</span>
            </p>

            <div className="w-full bg-slate-100 rounded-full h-4 mb-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>Tiến độ</span>
              <span>
                {bulkProgress.current} / {bulkProgress.total}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-4 italic">Vui lòng không tắt trình duyệt...</p>
          </div>
        </div>
      )}

      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200/60 px-8 py-5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-600/30">
            <Users size={22} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý Học tập</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block mr-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm học sinh..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all w-64 text-sm"
            />
          </div>

          <button
            onClick={handleBulkGenerate}
            disabled={!!bulkProgress}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={18} />
            AI Hàng loạt
          </button>

          <button
            onClick={handleSyncSheet}
            disabled={isSyncing || !!bulkProgress}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            title="Đồng bộ dữ liệu từ Google Sheet (Admin)"
          >
            {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            Đồng bộ Sheet
          </button>

          <label className="flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl cursor-pointer transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
            <Upload size={18} />
            Nhập Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          </label>

          <button onClick={onLogout} className="text-sm font-semibold text-slate-500 hover:text-red-500 transition-colors px-2 ml-2">
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-[1400px] mx-auto w-full">
        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
                  <th className="px-6 py-5 w-10">
                    <input
                      type="checkbox"
                      checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedMhs.has(s.mhs))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedMhs(new Set(filteredStudents.map((s) => s.mhs)));
                        else setSelectedMhs(new Set());
                      }}
                      title="Chọn/Bỏ chọn tất cả học sinh đang hiển thị"
                    />
                  </th>
                  <th className="px-6 py-5">MHS</th>
                  <th className="px-6 py-5">Họ và Tên</th>
                  <th className="px-6 py-5">Lớp</th>
                  <th className="px-6 py-5">Điểm TB (Gần nhất)</th>
                  <th className="px-6 py-5">Rủi ro</th>
                  <th className="px-6 py-5">Tiến độ Tick</th>
                  <th className="px-6 py-5 text-right">Hành động</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">
                      Không tìm thấy học sinh nào. Hãy nhập file Excel hoặc Đồng bộ Sheet.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const lastScore = (student.scores || [])[student.scores.length - 1];
                    const scores = [lastScore?.math, lastScore?.lit, lastScore?.eng].filter(
                      (s) => s !== null && s !== undefined
                    ) as number[];

                    const avg =
                      scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "N/A";

                    // tổng tick nhanh: lấy tháng mới nhất nếu có actionsByMonth
                    const abm = safeActionsByMonth(student);
                    const latest = String(lastScore?.month || new Date().toISOString().slice(0, 7)).trim();
                    const actionsLatest = (abm[latest] || student.activeActions || []) as StudyAction[];
                    const totalTicks = actionsLatest.reduce((acc, act) => acc + (act.ticks || []).filter((t) => t.completed).length, 0);

                    return (
                      <tr key={student.mhs} className="hover:bg-indigo-50/30 transition-colors duration-200 group">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedMhs.has(student.mhs)}
                            onChange={(e) => {
                              setSelectedMhs((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(student.mhs);
                                else next.delete(student.mhs);
                                return next;
                              });
                            }}
                          />
                        </td>

                        <td className="px-6 py-4 text-sm font-mono text-slate-500 bg-transparent">{student.mhs}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{student.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{student.class}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">
                          <span
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                              avg === "N/A"
                                ? "bg-slate-100 text-slate-500"
                                : Number(avg) >= 12
                                ? "bg-emerald-100 text-emerald-700"
                                : Number(avg) >= 8
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {avg}
                          </span>
                          {lastScore && <span className="text-[10px] text-slate-400 ml-2">({lastScore.month})</span>}
                        </td>

                        <td className="px-6 py-4">
                          {student.aiReport ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                                student.aiReport.riskLevel === "Cao"
                                  ? "bg-red-50 text-red-600 border-red-100"
                                  : student.aiReport.riskLevel === "Trung bình"
                                  ? "bg-orange-50 text-orange-600 border-orange-100"
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

                        <td className="px-6 py-4 text-sm text-slate-600">
                          {actionsLatest.length > 0 ? (
                            <div className="w-full bg-slate-100 rounded-full h-2 max-w-[100px]" title={`${totalTicks} tick hoàn thành`}>
                              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(totalTicks * 5, 100)}%` }} />
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {loadingMhs === student.mhs ? (
                              <button disabled className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleGenerateAI(student)}
                                className="px-4 py-2 bg-white border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md"
                              >
                                {student.aiReport ? "Tạo lại" : "Tạo"}
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setViewingMhs(student.mhs);
                                setActiveTab("report");
                              }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                              title="Xem chi tiết"
                            >
                              <FileText size={20} />
                            </button>
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
      </main>

      {/* Modal Details & Edit */}
      {viewingStudent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col transform transition-transform duration-300 scale-100">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{viewingStudent.name}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  MHS: <span className="font-mono text-indigo-600">{viewingStudent.mhs}</span> | Lớp: {viewingStudent.class}
                </p>
              </div>
              <button onClick={() => setViewingMhs(null)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex border-b border-slate-100 px-6">
              <button
                onClick={() => setActiveTab("report")}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === "report" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} /> Báo cáo AI
                </div>
              </button>
              <button
                onClick={() => setActiveTab("tracking")}
                className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === "tracking" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck size={16} /> Theo dõi Thói quen
                </div>
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-[#fcfcfc] flex-1">
              {activeTab === "report" &&
                (viewingStudent.aiReport ? (
                  <>
                    <div className="flex justify-end mb-2">
                      {!isEditing ? (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                        >
                          <Edit2 size={14} /> Sửa nội dung
                        </button>
                      ) : (
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-md transition-all"
                        >
                          <Save size={14} /> Lưu
                        </button>
                      )}
                    </div>

                    <div
                      className={`p-5 rounded-2xl border ${
                        viewingStudent.aiReport.riskLevel === "Cao"
                          ? "border-red-200 bg-red-50/50"
                          : viewingStudent.aiReport.riskLevel === "Trung bình"
                          ? "border-orange-200 bg-orange-50/50"
                          : "border-emerald-200 bg-emerald-50/50"
                      }`}
                    >
                      <h3
                        className={`font-bold text-sm uppercase tracking-wide mb-3 ${
                          viewingStudent.aiReport.riskLevel === "Cao"
                            ? "text-red-700"
                            : viewingStudent.aiReport.riskLevel === "Trung bình"
                            ? "text-orange-700"
                            : "text-emerald-700"
                        }`}
                      >
                        Đánh giá Tổng quan
                      </h3>
                      {isEditing ? (
                        <textarea
                          className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700 bg-white"
                          rows={3}
                          value={editForm.overview}
                          onChange={(e) => setEditForm({ ...editForm, overview: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm text-slate-800 leading-relaxed">{viewingStudent.aiReport.overview}</p>
                      )}
                    </div>

                    <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                      <h3 className="font-bold text-sm uppercase tracking-wide text-indigo-700 mb-3">Lời nhắn cho Học sinh</h3>
                      {isEditing ? (
                        <textarea
                          className="w-full p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700 bg-white"
                          rows={3}
                          value={editForm.messageToStudent}
                          onChange={(e) => setEditForm({ ...editForm, messageToStudent: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm text-indigo-900 italic">"{viewingStudent.aiReport.messageToStudent}"</p>
                      )}
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-sm uppercase tracking-wide text-slate-600 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        Ghi chú Riêng tư (GV)
                      </h3>
                      {isEditing ? (
                        <textarea
                          className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700 bg-slate-50"
                          rows={3}
                          value={editForm.teacherNotes}
                          onChange={(e) => setEditForm({ ...editForm, teacherNotes: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm text-slate-600">{viewingStudent.aiReport.teacherNotes}</p>
                      )}
                    </div>

                    <div>
                      <h3 className="font-bold text-sm uppercase tracking-wide text-slate-600 mb-3 ml-1">Kế hoạch Học tập</h3>
                      <div className="text-sm text-slate-600 bg-white border border-slate-100 rounded-2xl shadow-sm divide-y divide-slate-50">
                        {viewingStudent.aiReport.studyPlan.map((p, i) => (
                          <div key={i} className="p-4 grid grid-cols-4 gap-4">
                            <span className="font-bold text-slate-400 text-xs uppercase pt-1">{p.day}</span>
                            <span className="text-indigo-600 font-semibold">{p.subject}</span>
                            <span className="col-span-2 text-slate-700">{p.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Activity size={48} className="mb-4 opacity-50" />
                    <p>Chưa có báo cáo AI. Hãy nhấn "Tạo" ở màn hình chính.</p>
                  </div>
                ))}

              {activeTab === "tracking" && (
                <div>
                  <h3 className="font-bold text-slate-800 mb-6">Theo dõi Thói quen</h3>
                  {renderTracking()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherView;
