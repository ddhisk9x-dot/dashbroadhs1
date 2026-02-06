import React from "react";
import { Search, X, Check, Loader2, Upload } from "lucide-react";

interface TeacherSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    syncHint: string;
    syncMonthSearch: string;
    onSyncMonthSearchChange: (v: string) => void;
    syncMonthsAll: string[];
    syncSelectedMonths: Set<string>;
    onToggleMonth: (m: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    onSubmit: () => void;
    isSyncing: boolean;
    isTeacher: boolean;
}

export default function TeacherSyncModal({
    isOpen,
    onClose,
    syncHint,
    syncMonthSearch,
    onSyncMonthSearchChange,
    syncMonthsAll,
    syncSelectedMonths,
    onToggleMonth,
    onSelectAll,
    onClearAll,
    onSubmit,
    isSyncing,
    isTeacher,
}: TeacherSyncModalProps) {
    if (!isOpen || isTeacher) return null;

    const filteredMonthsForModal = (() => {
        const q = syncMonthSearch.trim().toLowerCase();
        if (!q) return syncMonthsAll;
        return syncMonthsAll.filter((m) => m.toLowerCase().includes(q));
    })();

    return (
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
                        onClick={onClose}
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
                                onChange={(e) => onSyncMonthSearchChange(e.target.value)}
                                placeholder="Tìm tháng (vd: 2025-10)..."
                                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onSelectAll}
                                className="px-3 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                                type="button"
                            >
                                Chọn tất cả
                            </button>
                            <button
                                onClick={onClearAll}
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
                                    onClick={() => onToggleMonth(m)}
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
                                            onClick={() => onToggleMonth(m)}
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
                        Đã chọn: <span className="font-bold text-slate-700">{syncSelectedMonths.size}</span> / {syncMonthsAll.length}{" "}
                        tháng
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-2 bg-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={isSyncing}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                        {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        Đồng bộ tháng đã chọn
                    </button>
                </div>
            </div>
        </div>
    );
}
