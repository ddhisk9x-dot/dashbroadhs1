"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Student, ScoreData, StudyAction, AIReport } from "../types";
import { generateStudentReport } from "../services/clientApi";
import TeacherHeader from "./teacher/TeacherHeader";
import TeacherBulkProgress from "./teacher/TeacherBulkProgress";
import TeacherSyncModal from "./teacher/TeacherSyncModal";
import TeacherStudentTable from "./teacher/TeacherStudentTable";
import TeacherStudentDetailModal from "./teacher/TeacherStudentDetailModal";
import TeacherAnalyticsSection from "./teacher/TeacherAnalyticsSection";
import { Users, BarChart } from "lucide-react";

// ... existing imports ...

// Helper functions (duplicated for now)
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoMonth(d: Date) {
  return isoDate(d).slice(0, 7);
}
function isMonthKey(m: any) {
  return /^\d{4}-\d{2}$/.test(String(m || "").trim());
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
function latestScoreMonth(st?: Student) {
  const scores = Array.isArray(st?.scores) ? st!.scores : [];
  const last = scores.length ? (scores[scores.length - 1] as any) : null;
  const mk = String(last?.month || "").trim();
  return isMonthKey(mk) ? mk : isoMonth(new Date());
}
function inferredTaskMonth(st?: Student) {
  return nextMonthKey(latestScoreMonth(st));
}
function safeActionsByMonth(student?: Student): Record<string, StudyAction[]> {
  if (!student) return {};
  const abm = (student as any)?.actionsByMonth;
  if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;

  const taskMonth = inferredTaskMonth(student);
  const aa = Array.isArray((student as any)?.activeActions)
    ? ((student as any).activeActions as StudyAction[])
    : [];
  return { [taskMonth]: aa };
}

async function persistReportAndActions(mhs: string, report: AIReport, actions: StudyAction[], monthKey: string) {
  const res = await fetch("/api/admin/save-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mhs, report, actions, monthKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Save report failed");
  }
  return data;
}

declare const XLSX: any;

interface TeacherViewProps {
  students: Student[];
  onImportData: (newStudents: Student[]) => void;
  onUpdateStudentReport: (mhs: string, report: AIReport, actions: StudyAction[]) => void;
  onLogout: () => void;
}

type SyncResp = {
  ok: boolean;
  monthsAll?: string[];
  monthsSynced?: string[];
  students?: number;
  error?: string;
};

const TeacherView: React.FC<TeacherViewProps> = ({
  students,
  onImportData,
  onUpdateStudentReport,
  onLogout,
}) => {
  const [loadingMhs, setLoadingMhs] = useState<string | null>(null);
  const [viewingMhs, setViewingMhs] = useState<string | null>(null);
  const viewingStudent = students.find(s => s.mhs === viewingMhs);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMhs, setSelectedMhs] = useState<Set<string>>(new Set());
  const [filterClass, setFilterClass] = useState("ALL");
  const [sortTicks, setSortTicks] = useState<"none" | "desc" | "asc">("none");
  const [activeTab, setActiveTab] = useState<"STUDENTS" | "ANALYTICS">("STUDENTS");

  // Who am I
  const [me, setMe] = useState<any>(null);
  const isTeacher = me?.role === "TEACHER";
  const teacherClass = String(me?.teacherClass || "").trim();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d?.session || null))
      .catch(() => setMe(null));
  }, []);

  // Filter students
  const visibleStudents = useMemo(() => {
    if (!isTeacher || !teacherClass) return students;
    return students.filter((s) => String(s.class || "").trim() === teacherClass);
  }, [students, isTeacher, teacherClass]);

  // Reset selection if filtering
  useEffect(() => {
    if (!isTeacher) return;
    setSelectedMhs((prev) => {
      const next = new Set<string>();
      for (const mhs of prev) {
        if (visibleStudents.find(s => s.mhs === mhs)) next.add(mhs);
      }
      return next;
    });
  }, [isTeacher, visibleStudents]);

  const uniqueClasses = useMemo(() => {
    const classes = new Set(visibleStudents.map((s) => (s.class || "").trim().toUpperCase()).filter(Boolean));
    return Array.from(classes).sort();
  }, [visibleStudents]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fClass = filterClass.trim().toUpperCase();

    let list = visibleStudents.filter((s) => {
      const sClass = (s.class || "").trim().toUpperCase();
      const sName = (s.name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const sMhs = (s.mhs || "").trim().toLowerCase();

      // 1. Dropdown Filter (Strict)
      if (fClass !== "ALL" && sClass !== fClass) return false;

      // 2. Search Box Filter (Fuzzy)
      if (q) {
        return sName.includes(q) || sMhs.includes(q) || sClass.toLowerCase().includes(q);
      }
      return true;
    });

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
    } catch (e: any) {
      alert(e?.message || "Lỗi tạo báo cáo");
    } finally {
      setLoadingMhs(null);
    }
  };

  const handleBulkGenerate = async () => {
    if (isTeacher) return;
    const targets = filteredStudents.filter((s) => selectedMhs.has(s.mhs));
    if (!targets.length) { alert("Chưa chọn học sinh"); return; }
    if (!confirm(`Tạo báo cáo cho ${targets.length} học sinh?`)) return;

    setBulkProgress({ current: 0, total: targets.length, currentName: "" });
    for (let i = 0; i < targets.length; i++) {
      const st = targets[i];
      setBulkProgress({ current: i + 1, total: targets.length, currentName: st.name });
      try {
        await handleGenerateAI(st);
      } catch { }
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setBulkProgress(null);
    alert("Hoàn tất!");
  };

  // Sync Sheets
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncMonthsAll, setSyncMonthsAll] = useState<string[]>([]);
  const [syncSelectedMonths, setSyncSelectedMonths] = useState<Set<string>>(new Set());
  const [syncMonthSearch, setSyncMonthSearch] = useState("");
  const [syncHint, setSyncHint] = useState("");

  const handleSyncSheet = async () => {
    if (isTeacher) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/sheets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "new_only" }),
      });
      const data: SyncResp = await res.json();
      if (data.monthsSynced && data.monthsSynced.length > 0) {
        alert(`Đồng bộ xong ${data.students} HS`);
        window.location.reload();
      } else {
        setSyncMonthsAll(data.monthsAll || []);
        setSyncSelectedMonths(new Set(data.monthsAll));
        setSyncHint("Không có tháng mới. Chọn tháng để đồng bộ lại.");
        setSyncModalOpen(true);
      }
    } catch (e) { alert("Lỗi kết nối"); }
    finally { setIsSyncing(false); }
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
      } else {
        alert(data.error);
      }
    } catch { alert("Lỗi kết nối"); }
    finally { setIsSyncing(false); setSyncModalOpen(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTeacher) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const studentMap = new Map<string, Student>();
      visibleStudents.forEach(s => studentMap.set(s.mhs, { ...s }));

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

          // merge score
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
    <div className="min-h-screen font-sans bg-fixed bg-gradient-to-br from-indigo-50 via-white to-sky-50 relative">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-200/40 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <TeacherBulkProgress progress={bulkProgress} />

        <TeacherSyncModal
          isOpen={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          syncHint={syncHint}
          syncMonthSearch={syncMonthSearch}
          onSyncMonthSearchChange={setSyncMonthSearch}
          syncMonthsAll={syncMonthsAll}
          syncSelectedMonths={syncSelectedMonths}
          onToggleMonth={(m) => setSyncSelectedMonths(prev => {
            const next = new Set(prev);
            if (next.has(m)) next.delete(m); else next.add(m);
            return next;
          })}
          onSelectAll={() => setSyncSelectedMonths(new Set(syncMonthsAll))}
          onClearAll={() => setSyncSelectedMonths(new Set())}
          onSubmit={handleSubmitSync}
          isSyncing={isSyncing}
          isTeacher={isTeacher}
        />

        <TeacherHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterClass={filterClass}
          onFilterClassChange={setFilterClass}
          uniqueClasses={uniqueClasses}
          sortTicks={sortTicks}
          onSortTicksChange={setSortTicks}
          isTeacher={isTeacher}
          teacherClass={teacherClass}
          visibleStudents={visibleStudents}
          onLogout={onLogout}
          onBulkGenerate={handleBulkGenerate}
          onSyncSheet={handleSyncSheet}
          onFileUpload={handleFileUpload}
          isSyncing={isSyncing}
          isBulkProcessing={!!bulkProgress}
        />

        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
          {/* Tab Toggle */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("STUDENTS")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${activeTab === "STUDENTS" ? "bg-indigo-600 text-white shadow-lg" : "bg-white/80 text-slate-600 hover:bg-slate-100"}`}
            >
              <Users size={18} />
              <span>Danh sách HS</span>
            </button>
            <button
              onClick={() => setActiveTab("ANALYTICS")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${activeTab === "ANALYTICS" ? "bg-indigo-600 text-white shadow-lg" : "bg-white/80 text-slate-600 hover:bg-slate-100"}`}
            >
              <BarChart size={18} />
              <span>Báo cáo lớp</span>
            </button>
          </div>

          {activeTab === "STUDENTS" ? (
            <TeacherStudentTable
              students={filteredStudents}
              selectedMhs={selectedMhs}
              isTeacher={isTeacher}
              onSelectAll={(checked) => setSelectedMhs(checked ? new Set(filteredStudents.map(s => s.mhs)) : new Set())}
              onSelectStudent={(mhs, checked) => setSelectedMhs(prev => {
                const next = new Set(prev);
                if (checked) next.add(mhs); else next.delete(mhs);
                return next;
              })}
              sortTicks={sortTicks}
              onSortTicks={() => setSortTicks(prev => prev === "desc" ? "asc" : prev === "asc" ? "none" : "desc")}
              onGenerateAI={handleGenerateAI}
              onViewStudent={setViewingMhs}
              loadingMhs={loadingMhs}
            />
          ) : (
            <TeacherAnalyticsSection
              students={visibleStudents}
              teacherClass={teacherClass || "Tất cả"}
            />
          )}
        </main>

        {viewingStudent && (
          <TeacherStudentDetailModal
            student={viewingStudent}
            students={students}
            onClose={() => setViewingMhs(null)}
            onUpdateReport={onUpdateStudentReport}
            persistReport={persistReportAndActions}
          />
        )}
      </div>
    </div>
  );
};

export default TeacherView;
