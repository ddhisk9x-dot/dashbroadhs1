"use client";

import React, { useMemo, useState, useEffect } from "react";
import TeacherResetPasswordButton from "./TeacherResetPasswordButton";
import AdminChangePasswordButton from "./AdminChangePasswordButton";
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
  Trophy,
  Award,
  Medal,
} from "lucide-react";

declare const XLSX: any;

interface TeacherViewProps {
  students: Student[];
  onImportData: (newStudents: Student[]) => void;
  onUpdateStudentReport: (mhs: string, report: AIReport, actions: StudyAction[]) => void;
  onLogout: () => void;
}

type SyncResp = {
  ok: boolean;
  mode?: "new_only" | "months";
  monthsAll?: string[];
  monthsSynced?: string[];
  newMonthsDetected?: string[];
  students?: number;
  error?: string;
};

type TrackingMode = "7" | "30" | "90" | "month";

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
  // điểm tháng N -> nhiệm vụ tháng N+1
  return nextMonthKey(latestScoreMonth(st));
}

function uniqMonthsFromStudent(st?: Student) {
  const set = new Set<string>();

  // months from scores (N) and task months (N+1)
  (st?.scores || []).forEach((s) => {
    const mm = String((s as any)?.month || "").trim();
    if (isMonthKey(mm)) {
      set.add(mm);
      set.add(nextMonthKey(mm));
    }
  });

  // months from activeActions ticks (legacy)
  (st?.activeActions || []).forEach((a: any) => {
    (a?.ticks || []).forEach((t: any) => {
      const d = String(t?.date || "").slice(0, 7);
      if (isMonthKey(d)) set.add(d);
    });
  });

  // months from actionsByMonth keys + their ticks
  const abm = (st as any)?.actionsByMonth;
  if (abm && typeof abm === "object") {
    Object.keys(abm).forEach((k) => {
      const kk = String(k || "").trim();
      if (isMonthKey(kk)) set.add(kk);
      const list = (abm as any)[k];
      if (Array.isArray(list)) {
        list.forEach((a: any) => {
          (a?.ticks || []).forEach((t: any) => {
            const d = String(t?.date || "").slice(0, 7);
            if (isMonthKey(d)) set.add(d);
          });
        });
      }
    });
  }

  // always include current inferred task month
  if (st) set.add(inferredTaskMonth(st));

  const arr = Array.from(set);
  arr.sort();
  return arr;
}

function safeActionsByMonth(student?: Student): Record<string, StudyAction[]> {
  if (!student) return {};
  const abm = (student as any)?.actionsByMonth;
  if (abm && typeof abm === "object") return abm as Record<string, StudyAction[]>;

  // migrate tạm thời: activeActions (cũ) -> gán vào THÁNG NHIỆM VỤ (N+1)
  const taskMonth = inferredTaskMonth(student);
  const aa = Array.isArray((student as any)?.activeActions)
    ? ((student as any).activeActions as StudyAction[])
    : [];
  return { [taskMonth]: aa };
}

function buildTickMap(action: any) {
  const m = new Map<string, boolean>();
  (action?.ticks || []).forEach((t: any) => m.set(String(t?.date), !!t?.completed));
  return m;
}

async function persistReportAndActions(mhs: string, report: AIReport, actions: StudyAction[], monthKey: string) {
  // NOTE: nếu route của bạn khác "/api/admin/save-report" thì đổi lại đúng path
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
  const [filterClass, setFilterClass] = useState("ALL");
  const [sortTicks, setSortTicks] = useState<"none" | "desc" | "asc">("none");


  // Admin Leaderboard State
  const [showLeaderboard, setShowLeaderboard] = useState(false);





  // ✅ Who am I (ADMIN / TEACHER)
  const [me, setMe] = useState<any>(null);
  const isTeacher = me?.role === "TEACHER";
  const teacherClass = String(me?.teacherClass || "").trim();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe(d?.session || null))
      .catch(() => setMe(null));
  }, []);

  // ✅ Nếu là TEACHER: chỉ thấy học sinh lớp mình
  const visibleStudents = useMemo(() => {
    if (!isTeacher || !teacherClass) return students;
    return students.filter((s) => String(s.class || "").trim() === teacherClass);
  }, [students, isTeacher, teacherClass]);

  // ✅ Nếu là TEACHER: không cho tick chọn học sinh ngoài lớp (reset setSelectedMhs)
  useEffect(() => {
    if (!isTeacher) return;
    setSelectedMhs((prev) => {
      const next = new Set<string>();
      for (const mhs of prev) {
        const st = visibleStudents.find((s) => s.mhs === mhs);
        if (st) next.add(mhs);
      }
      return next;
    });
  }, [isTeacher, visibleStudents]);

  // Bulk Generation State
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    overview: string;
    messageToStudent: string;
    teacherNotes: string;
  }>({ overview: "", messageToStudent: "", teacherNotes: "" });

  const viewingStudent = visibleStudents.find((s) => s.mhs === viewingMhs);

  // ✅ Tracking selector (7/30/90 + theo tháng)
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("7");
  const [trackingMonth, setTrackingMonth] = useState<string>(isoMonth(new Date()));

  useEffect(() => {
    if (!viewingStudent) return;
    const months = uniqMonthsFromStudent(viewingStudent);
    // default: tháng nhiệm vụ hiện hành (N+1)
    const def = inferredTaskMonth(viewingStudent);
    const latest = months.length ? months[months.length - 1] : def;
    setTrackingMonth(months.includes(def) ? def : latest);
  }, [viewingStudent?.mhs]);

  // ✅ Sync UI state (NO prompt)
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncMonthsAll, setSyncMonthsAll] = useState<string[]>([]);
  const [syncSelectedMonths, setSyncSelectedMonths] = useState<Set<string>>(new Set());
  const [syncMonthSearch, setSyncMonthSearch] = useState("");
  const [syncHint, setSyncHint] = useState<string>("");

  const uniqueClasses = useMemo(() => {
    const classes = new Set(visibleStudents.map((s) => s.class || "").filter(Boolean));
    return Array.from(classes).sort();
  }, [visibleStudents]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.toLowerCase();

    // 1. Filter by Search & Class
    let list = visibleStudents.filter(
      (s) =>
        (filterClass === "ALL" || s.class === filterClass) &&
        (s.name.toLowerCase().includes(q) ||
          s.mhs.toLowerCase().includes(q) ||
          s.class.toLowerCase().includes(q))
    );

    // 2. Sort by Ticks if needed
    if (sortTicks !== "none") {
      list = list.slice().sort((a, b) => {
        const getTicks = (st: Student) => {
          const taskMonth = inferredTaskMonth(st);
          const abm = safeActionsByMonth(st);
          const acts = Array.isArray((st as any)?.actionsByMonth?.[taskMonth])
            ? ((st as any).actionsByMonth[taskMonth] as any[])
            : Array.isArray(abm?.[taskMonth])
              ? (abm[taskMonth] as any[])
              : Array.isArray(st.activeActions)
                ? (st.activeActions as any[])
                : [];
          return acts.reduce((acc, act: any) => {
            const ticks = Array.isArray(act?.ticks) ? act.ticks : [];
            const done = ticks.filter(
              (t: any) => t?.completed && String(t?.date || "").slice(0, 7) === taskMonth
            ).length;
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

  const actionsByMonth = useMemo(
    () => safeActionsByMonth(viewingStudent),
    [viewingStudent?.mhs, viewingStudent?.activeActions, viewingStudent?.scores, (viewingStudent as any)?.actionsByMonth]
  );

  const availableMonthsForStudent = useMemo(() => {
    const months = uniqMonthsFromStudent(viewingStudent);
    if (!months.length) return [isoMonth(new Date())];
    return months;
  }, [viewingStudent?.mhs, (viewingStudent as any)?.actionsByMonth, viewingStudent?.scores, viewingStudent?.activeActions]);

  const taskMonthForViewingStudent = useMemo(() => {
    if (!viewingStudent) return isoMonth(new Date());
    return inferredTaskMonth(viewingStudent);
  }, [viewingStudent?.mhs, viewingStudent?.scores]);

  const monthForActions = useMemo(() => {
    if (trackingMode === "month") return trackingMonth;
    // range mode: luôn theo "tháng nhiệm vụ hiện hành" (N+1)
    return taskMonthForViewingStudent;
  }, [trackingMode, trackingMonth, taskMonthForViewingStudent]);

  // ✅ Admin Leaderboard (Linked to selected Month)
  const adminLeaderboard = useMemo(() => {
    if (!showLeaderboard) return { class: [], grade: [] };
    // Use the selected tracking month if in "month" mode, otherwise default to current
    // Actually, user wants "Top Month Old". So we should use `trackingMonth` IF user selected it?
    // But `trackingMonth` is usually tied to a specific student when viewing? 
    // Wait, trackingMonth line 337 is state. But it is set in useEffect line 346 based on `viewingStudent`.
    // If NO viewingStudent, `trackingMonth` might just be current month?
    // Let's rely on `trackingMonth` state. If user wants to see old leaderboard, they might need a global month selector?
    // User requested " xem lại được top tháng cũ không?". 
    // Since we don't have a global month selector for the MAIN table (only per student?), 
    // maybe we should use `isoMonth(new Date())` by default, OR add a selector in the modal?
    // For now, let's use `trackingMonth` but we need to ensure it's settable globally.
    // Actually, line 337 `const [trackingMonth, ...]` is at component level.
    // BUT line 346 sets it when `viewingStudent` changes.
    // If `!viewingStudent`, `trackingMonth` stays at default (current).
    // So to see OLD month, user needs to pick a month.
    // I will add a simple Month Selector in the Leaderboard Modal? 
    // NO, let's just use `trackingMonth` for now, assuming I might expose it later.
    // Better: Use `monthForActions`? No that depends on mode.
    // Let's use `trackingMonth` (which defaults to current).

    const targetMonth = trackingMonth;

    const countTicks = (st: Student) => {
      const uniqueTickDates = new Set<string>();
      const allActions: any[] = [];
      if (Array.isArray(st.activeActions)) allActions.push(...st.activeActions);
      const abm = (st as any)?.actionsByMonth || {};
      if (st.actionsByMonth && typeof st.actionsByMonth === 'object') {
        // Iterate values
        Object.values(st.actionsByMonth).forEach((list: any) => {
          if (Array.isArray(list)) allActions.push(...list);
        });
      }

      // De-duplicate ticks
      allActions.forEach(a => {
        (a.ticks || []).forEach((t: any) => {
          if (t.completed && String(t.date).startsWith(targetMonth)) {
            uniqueTickDates.add(t.date + "-" + a.id);
          }
        });
      });
      return uniqueTickDates.size;
    };

    const allMapped = students.map(s => ({
      name: s.name,
      class: s.class,
      score: countTicks(s)
    })).sort((a, b) => b.score - a.score);

    const topGrade = allMapped.slice(0, 10);
    const topClass = filterClass !== "ALL"
      ? allMapped.filter(s => s.class === filterClass).slice(0, 10)
      : [];

    return { class: topClass, grade: topGrade };

  }, [students, showLeaderboard, filterClass, trackingMonth]);


  // ✅ dates to render
  const trackingDates = useMemo(() => {
    if (trackingMode === "month") return getDatesInMonth(trackingMonth);

    const n = trackingMode === "7" ? 7 : trackingMode === "30" ? 30 : 90;
    // range mode: hiển thị đúng N ngày gần nhất (không filter theo tháng để tránh mất ngày hôm nay nếu qua tháng mới)
    return getLastNDays(n);
  }, [trackingMode, trackingMonth, monthForActions]);

  const actionsForView = useMemo(() => {
    const acts = actionsByMonth?.[monthForActions];
    if (Array.isArray(acts)) return acts;

    // fallback: activeActions cũ
    return Array.isArray((viewingStudent as any)?.activeActions)
      ? ((viewingStudent as any).activeActions as StudyAction[])
      : [];
  }, [actionsByMonth, monthForActions, viewingStudent?.mhs]);

  const trackingTitle = useMemo(() => {
    if (trackingMode === "month") return `Tiến độ Thói quen (Tháng ${trackingMonth}) • Nhiệm vụ tháng ${trackingMonth}`;
    if (trackingMode === "30") return `Tiến độ Thói quen (30 ngày qua) • Nhiệm vụ tháng ${monthForActions}`;
    if (trackingMode === "90") return `Tiến độ Thói quen (90 ngày qua) • Nhiệm vụ tháng ${monthForActions}`;
    return `Tiến độ Thói quen (7 ngày qua) • Nhiệm vụ tháng ${monthForActions}`;
  }, [trackingMode, trackingMonth, monthForActions]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // ✅ TEACHER không được nhập excel
    if (isTeacher) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const studentMap = new Map<string, Student>();

      visibleStudents.forEach((s) => studentMap.set(s.mhs, { ...s }));

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
            student = { mhs, name, class: className, scores: [], activeActions: [] };
            studentMap.set(mhs, student);
          } else {
            student.name = name;
            student.class = className;
          }

          const existingScoreIndex = student.scores.findIndex((s) => s.month === sheetName);
          if (existingScoreIndex >= 0) student.scores[existingScoreIndex] = scoreEntry;
          else student.scores.push(scoreEntry);
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
      alert(e?.message || "Không thể tạo báo cáo. Vui lòng kiểm tra API Key.");
    } finally {
      setLoadingMhs(null);
    }
  };

  const handleBulkGenerate = async () => {
    // ✅ TEACHER không được AI hàng loạt
    if (isTeacher) return;

    const targets = filteredStudents.filter((s) => selectedMhs.has(s.mhs));
    if (targets.length === 0) {
      alert("Bạn chưa chọn học sinh nào.");
      return;
    }

    if (!confirm(`Bạn có chắc muốn tạo báo cáo AI cho ${targets.length} học sinh đang chọn không?`)) {
      return;
    }

    setBulkProgress({ current: 0, total: targets.length, currentName: "" });

    for (let i = 0; i < targets.length; i++) {
      const student = targets[i];
      setBulkProgress({ current: i + 1, total: targets.length, currentName: student.name });

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
      } catch (err) {
        console.error(`Failed to generate for ${student.mhs}`, err);
      }

      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 2000));
    }

    setBulkProgress(null);
    alert("Hoàn tất quá trình tạo báo cáo hàng loạt!");
  };

  // ✅ Sync: new_only -> nếu 0 tháng mới thì mở modal chọn tháng (NO prompt)
  const handleSyncSheet = async () => {
    // ✅ TEACHER không được sync sheet
    if (isTeacher) return;

    setIsSyncing(true);
    setSyncHint("");
    try {
      const res = await fetch("/api/sync/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "new_only" }),
      });
      const data: SyncResp = await res.json();

      if (!res.ok || !data?.ok) {
        alert(`Lỗi đồng bộ: ${data?.error || "Sync failed"}`);
        return;
      }

      const monthsSynced = data.monthsSynced ?? [];
      const monthsAll = data.monthsAll ?? [];

      if (monthsSynced.length > 0) {
        alert(`Đồng bộ xong: ${data.students ?? 0} HS. Tháng mới: ${monthsSynced.join(", ")}`);
        window.location.reload();
        return;
      }

      setSyncMonthsAll(monthsAll);
      setSyncSelectedMonths(new Set(monthsAll));
      setSyncMonthSearch("");
      setSyncHint("Không có tháng mới. Bạn có thể chọn tháng để đồng bộ lại.");
      setSyncModalOpen(true);
    } catch (e: any) {
      alert(`Lỗi đồng bộ: ${e?.message || "Network error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredMonthsForModal = useMemo(() => {
    const q = syncMonthSearch.trim().toLowerCase();
    if (!q) return syncMonthsAll;
    return syncMonthsAll.filter((m) => m.toLowerCase().includes(q));
  }, [syncMonthsAll, syncMonthSearch]);

  const toggleMonth = (m: string) => {
    setSyncSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const selectAllMonths = () => setSyncSelectedMonths(new Set(syncMonthsAll));
  const clearAllMonths = () => setSyncSelectedMonths(new Set());

  const submitSyncSelectedMonths = async () => {
    // ✅ TEACHER không được sync sheet
    if (isTeacher) return;

    const months = Array.from(syncSelectedMonths).sort();
    if (months.length === 0) {
      alert("Bạn chưa chọn tháng nào.");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "months", selectedMonths: months }),
      });
      const data: SyncResp = await res.json();

      if (!res.ok || !data?.ok) {
        alert(`Lỗi đồng bộ: ${data?.error || "Sync failed"}`);
        return;
      }

      setSyncModalOpen(false);
      alert(`Đồng bộ xong: ${data.students ?? 0} HS. Tháng: ${(data.monthsSynced ?? months).join(", ")}`);
      window.location.reload();
    } catch (e: any) {
      alert(`Lỗi đồng bộ: ${e?.message || "Network error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!viewingStudent || !viewingStudent.aiReport) return;

    const updatedReport: AIReport = {
      ...viewingStudent.aiReport,
      overview: editForm.overview,
      messageToStudent: editForm.messageToStudent,
      teacherNotes: editForm.teacherNotes,
    };

    const monthKey = inferredTaskMonth(viewingStudent);

    try {
      await persistReportAndActions(viewingStudent.mhs, updatedReport, actionsForView, monthKey);
      onUpdateStudentReport(viewingStudent.mhs, updatedReport, actionsForView);
      setIsEditing(false);
    } catch (e: any) {
      alert(e?.message || "Lưu thất bại");
    }
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
              />
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

      {/* ✅ Sync Month Modal (NO prompt) */}
      {syncModalOpen && !isTeacher && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-800">Chọn tháng để đồng bộ</div>
                <div className="text-sm text-slate-500 mt-1">
                  {syncHint || "Chọn 1 hoặc nhiều tháng để đồng bộ lại điểm từ Google Sheet."}
                </div>
              </div>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                title="Đóng"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    value={syncMonthSearch}
                    onChange={(e) => setSyncMonthSearch(e.target.value)}
                    placeholder="Tìm tháng (vd: 2025-10)..."
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllMonths}
                    className="px-3 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    type="button"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    onClick={clearAllMonths}
                    className="px-3 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    type="button"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {Array.from(syncSelectedMonths)
                  .sort()
                  .slice(0, 12)
                  .map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100"
                      title="Bỏ chọn"
                    >
                      {m}
                      <X size={14} />
                    </button>
                  ))}
                {syncSelectedMonths.size > 12 && (
                  <span className="text-xs text-slate-500 px-2 py-1.5">+{syncSelectedMonths.size - 12} tháng nữa</span>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="max-h-[320px] overflow-y-auto p-3 bg-slate-50">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredMonthsForModal.map((m) => {
                      const checked = syncSelectedMonths.has(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMonth(m)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${checked
                            ? "bg-white border-emerald-200 text-emerald-700 shadow-sm"
                            : "bg-white/70 border-slate-200 text-slate-700 hover:bg-white"
                            }`}
                        >
                          <span>{m}</span>
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center ${checked ? "bg-emerald-600 border-emerald-600" : "bg-white border-slate-300"
                              }`}
                          >
                            {checked && <Check size={14} className="text-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Đã chọn: <span className="font-bold text-slate-700">{syncSelectedMonths.size}</span> / {syncMonthsAll.length} tháng
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-2 bg-white">
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitSyncSelectedMonths}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                Đồng bộ tháng đã chọn
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200/60 px-8 py-5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-600/30">
            <Users size={22} />
          </div>
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Quản lý Học tập</h1>

            {/* ✅ Badge lớp phụ trách + Điểm TB */}
            {isTeacher && teacherClass && (
              <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                Lớp: {teacherClass}
                <span className="mx-2 text-emerald-300">|</span>
                TB Lớp: {(() => {
                  const validScores = visibleStudents.flatMap(s => {
                    const last = s.scores?.[s.scores.length - 1];
                    if (!last) return [];
                    return [last.math, last.lit, last.eng].filter(x => x !== null && x !== undefined) as number[];
                  });
                  if (validScores.length === 0) return "N/A";
                  const sum = validScores.reduce((a, b) => a + b, 0);
                  return (sum / validScores.length).toFixed(1);
                })()}
              </span>
            )}
          </div>
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

          <div className="relative">
            <select
              className="pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white outline-none text-sm appearance-none cursor-pointer"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="ALL">Tất cả lớp</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>

          <div className="relative">
            <select
              className="pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white outline-none text-sm appearance-none cursor-pointer"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="ALL">Tất cả lớp</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>

          {/* ✅ Ẩn nút nguy hiểm khi TEACHER */}
          {!isTeacher && (
            <>
              <button
                onClick={handleBulkGenerate}
                disabled={!!bulkProgress}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-indigo-500/30 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                <Sparkles size={18} />
                AI Hàng loạt
              </button>

              <button
                onClick={handleSyncSheet}
                disabled={isSyncing || !!bulkProgress}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                title="Đồng bộ dữ liệu từ Google Sheet (Admin)"
                type="button"
              >
                {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                Đồng bộ Sheet
              </button>

              <label className="flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl cursor-pointer transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                <Upload size={18} />
                Nhập Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </>
          )}
          <AdminChangePasswordButton />
          <button
            onClick={onLogout}
            className="text-sm font-semibold text-slate-500 hover:text-red-500 transition-colors px-2 ml-2"
            type="button"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Admin Leaderboard Modal */}
      {
        showLeaderboard && (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="text-yellow-500" /> Bảng Xếp Hạng Khối
          </h2>
          <button
            onClick={() => setShowLeaderboard(false)}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-8 overflow-y-auto bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Top Class */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Award className="text-indigo-500" /> Top Lớp (Tháng Hiện tại)</h3>
              <div className="space-y-3">
                {adminLeaderboard.class.length === 0 ? <p className="text-slate-400 italic text-sm">Chưa có dữ liệu.</p> :
                  adminLeaderboard.class.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{idx + 1}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-800">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.class}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-indigo-600">{item.score}</div>
                        <div className="text-[10px] text-slate-400">Ticks</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Top Grade */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Medal className="text-emerald-500" /> Top Khối (Tháng Hiện tại)</h3>
              <div className="space-y-3">
                {adminLeaderboard.grade.length === 0 ? <p className="text-slate-400 italic text-sm">Chưa có dữ liệu.</p> :
                  adminLeaderboard.grade.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'}`}>{idx + 1}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-800">{item.name}</div>
                          <div className="text-[10px] text-slate-500">{item.class}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-600">{item.score}</div>
                        <div className="text-[10px] text-slate-400">Ticks</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
          <p className="text-center text-slate-400 text-xs mt-6 italic">Tính năng xếp hạng toàn trường / nhiều khối sẽ được cập nhật sau.</p>
        </div>
      </div>
    </div>
      <main className="flex-1 p-8 max-w-[1400px] mx-auto w-full">
  <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
            <th className="px-6 py-5 w-10">
              <input
                type="checkbox"
                disabled={isTeacher} // ✅ teacher không dùng bulk select
                checked={
                  !isTeacher &&
                  filteredStudents.length > 0 &&
                  filteredStudents.every((s) => selectedMhs.has(s.mhs))
                }
                onChange={(e) => {
                  if (isTeacher) return;
                  if (e.target.checked) setSelectedMhs(new Set(filteredStudents.map((s) => s.mhs)));
                  else setSelectedMhs(new Set());
                }}
                title={isTeacher ? "Giáo viên không dùng chọn hàng loạt" : "Chọn/Bỏ chọn tất cả học sinh đang hiển thị"}
              />
            </th>
            <th className="px-6 py-5">MHS</th>
            <th className="px-6 py-5 w-[90px] text-center">MK</th>
            <th className="px-6 py-5">Họ và Tên</th>
            <th className="px-6 py-5">Lớp</th>
            <th className="px-6 py-5">Điểm TB (Gần nhất)</th>
            <th className="px-6 py-5">Rủi ro</th>
            <th
              className="px-6 py-5 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
              onClick={() => setSortTicks(prev => prev === "desc" ? "asc" : prev === "asc" ? "none" : "desc")}
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

        <tbody className="divide-y divide-slate-100">
          {filteredStudents.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-6 py-10 text-center text-slate-400 italic">
                {isTeacher ? "Chưa có học sinh trong lớp phụ trách." : "Không tìm thấy học sinh nào. Hãy nhập Excel hoặc Đồng bộ Sheet."}
              </td>
            </tr>
          ) : (
            filteredStudents.map((student) => {
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
                <tr key={student.mhs} className="hover:bg-indigo-50/30 transition-colors duration-200 group">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      disabled={isTeacher} // ✅ teacher không dùng bulk select
                      checked={!isTeacher && selectedMhs.has(student.mhs)}
                      onChange={(e) => {
                        if (isTeacher) return;
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

                  <td className="px-6 py-4 text-center">
                    <TeacherResetPasswordButton mhs={student.mhs} />
                  </td>

                  <td className="px-6 py-4 text-sm font-semibold text-slate-800">{student.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{student.class}</td>

                  <td className="px-6 py-4 text-sm text-slate-600">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs ${avg === "N/A"
                        ? "bg-slate-100 text-slate-500"
                        : Number(avg) >= 8
                          ? "bg-emerald-100 text-emerald-700"
                          : Number(avg) >= 5
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                    >
                      {avg}
                    </span>
                    {lastScore && (
                      <span className="text-[10px] text-slate-400 ml-2">({(lastScore as any).month})</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    {student.aiReport ? (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${student.aiReport.riskLevel === "Cao"
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
                    {acts.length > 0 ? (
                      <div
                        className="w-full bg-slate-100 rounded-full h-2 max-w-[100px]"
                        title={`${totalTicksInTaskMonth} tick hoàn thành • tháng nhiệm vụ ${taskMonth}`}
                      >
                        <div
                          className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(totalTicksInTaskMonth * 5, 100)}%` }}
                        />
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {loadingMhs === student.mhs ? (
                        <button
                          disabled
                          className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold flex items-center gap-2"
                          type="button"
                        >
                          <Loader2 size={14} className="animate-spin" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateAI(student)}
                          className="px-4 py-2 bg-white border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md"
                          type="button"
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
                        type="button"
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
      {
        viewingStudent && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{viewingStudent.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    MHS: <span className="font-mono text-indigo-600">{viewingStudent.mhs}</span> | Lớp: {viewingStudent.class}
                  </p>
                </div>
                <button
                  onClick={() => setViewingMhs(null)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  type="button"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-100 px-6">
                <button
                  onClick={() => setActiveTab("report")}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "report"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} /> Báo cáo AI
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("tracking")}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === "tracking"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <CalendarCheck size={16} /> Theo dõi Thói quen
                  </div>
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar bg-[#fcfcfc] flex-1">
                {/* TAB 1: AI REPORT */}
                {activeTab === "report" &&
                  (viewingStudent.aiReport ? (
                    <>
                      <div className="flex justify-end mb-2">
                        {!isEditing ? (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                            type="button"
                          >
                            <Edit2 size={14} /> Sửa nội dung
                          </button>
                        ) : (
                          <button
                            onClick={handleSaveEdit}
                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 shadow-md transition-all"
                            type="button"
                          >
                            <Save size={14} /> Lưu
                          </button>
                        )}
                      </div>

                      <div
                        className={`p-5 rounded-2xl border ${viewingStudent.aiReport.riskLevel === "Cao"
                          ? "border-red-200 bg-red-50/50"
                          : viewingStudent.aiReport.riskLevel === "Trung bình"
                            ? "border-orange-200 bg-orange-50/50"
                            : "border-emerald-200 bg-emerald-50/50"
                          }`}
                      >
                        <h3
                          className={`font-bold text-sm uppercase tracking-wide mb-3 ${viewingStudent.aiReport.riskLevel === "Cao"
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
                        <h3 className="font-bold text-sm uppercase tracking-wide text-indigo-700 mb-3">
                          Lời nhắn cho Học sinh
                        </h3>
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
                          {viewingStudent.aiReport.studyPlan.map((p: any, i: number) => (
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
                      <p>Chưa có báo cáo AI. Hãy nhấn nút "Tạo" ở màn hình chính.</p>
                    </div>
                  ))}

                {/* ✅ TAB 2: TRACKING */}
                {activeTab === "tracking" && (
                  <div>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                      <h3 className="font-bold text-slate-800">{trackingTitle}</h3>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setTrackingMode("7")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg ${trackingMode === "7" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            7 ngày
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackingMode("30")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg ${trackingMode === "30" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            30 ngày
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackingMode("90")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg ${trackingMode === "90" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            90 ngày
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackingMode("month")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg ${trackingMode === "month" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            Theo tháng
                          </button>
                        </div>

                        {trackingMode === "month" && (
                          <select
                            value={trackingMonth}
                            onChange={(e) => setTrackingMonth(e.target.value)}
                            className="ml-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white shadow-sm outline-none"
                          >
                            {availableMonthsForStudent
                              .slice()
                              .sort()
                              .reverse()
                              .map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {actionsForView.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Tháng này chưa có nhiệm vụ nào (hoặc học sinh chưa được giao thói quen).
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {actionsForView.map((action: any) => {
                          const tickMap = buildTickMap(action);
                          const countDone = trackingDates.reduce((acc, d) => acc + (tickMap.get(d) ? 1 : 0), 0);

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
                                  <span className="text-2xl font-bold text-indigo-600">{countDone}</span>
                                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Tick (trong kỳ)</p>
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
                                        <div
                                          className={`w-full h-2 rounded-full transition-all duration-500 ${isDone ? "bg-emerald-500" : "bg-slate-100"
                                            }`}
                                        />
                                        <div
                                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${isDone
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-slate-50 text-slate-400 border border-slate-100"
                                            }`}
                                          title={dateString}
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
                )}
              </div>
            </div>
          </div>
    </div>
  );
};

export default TeacherView;
