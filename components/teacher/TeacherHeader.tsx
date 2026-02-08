import React from "react";
import { Search, Users, ArrowUpDown, Sparkles, Upload, Loader2, LogOut } from "lucide-react";
import AdminChangePasswordButton from "../AdminChangePasswordButton";
import { Student } from "../../types";

interface TeacherHeaderProps {
    searchTerm: string;
    onSearchChange: (val: string) => void;
    filterClass: string;
    onFilterClassChange: (val: string) => void;
    uniqueClasses: string[];
    sortTicks: "none" | "desc" | "asc";
    onSortTicksChange: (val: "none" | "desc" | "asc") => void;
    isTeacher: boolean;
    teacherClass: string;
    visibleStudents: Student[];
    onLogout: () => void;
    onBulkGenerate: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAddStudent?: () => void;
    isSyncing: boolean;
    isBulkProcessing: boolean;
}

export default function TeacherHeader({
    searchTerm,
    onSearchChange,
    filterClass,
    onFilterClassChange,
    uniqueClasses,
    sortTicks,
    onSortTicksChange,
    isTeacher,
    teacherClass,
    visibleStudents,
    onLogout,
    onBulkGenerate,
    onSyncSheet,
    onFileUpload,
    onAddStudent,
    isSyncing,
    isBulkProcessing,
}: TeacherHeaderProps) {
    return (
        <header className="sticky top-0 z-30 px-6 py-4">
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-lg shadow-slate-200/30 rounded-[2rem] px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">

                {/* Left: Title & Class Info */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Quản lý Học tập</h1>
                        {isTeacher && teacherClass && (
                            <div className="flex items-center gap-2 mt-1">
                                <div className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                                    Lớp {teacherClass}
                                </div>
                                <div className="text-xs text-slate-400 font-medium">
                                    Sĩ số: <span className="text-slate-600">{visibleStudents.length}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Tìm học sinh..."
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-slate-200/80 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all w-48 lg:w-64 text-sm"
                        />
                    </div>

                    {/* Class Filter (Admin only) */}
                    {!isTeacher && (
                        <div className="relative">
                            <select
                                className="pl-3 pr-8 py-2 border border-slate-200/80 rounded-xl bg-slate-50/50 focus:bg-white outline-none text-sm appearance-none cursor-pointer"
                                value={filterClass}
                                onChange={(e) => onFilterClassChange(e.target.value)}
                            >
                                <option value="ALL">Tất cả lớp</option>
                                {uniqueClasses.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Sort Toggle */}
                    <div className="relative">
                        <select
                            className="pl-3 pr-8 py-2 border border-slate-200/80 rounded-xl bg-slate-50/50 focus:bg-white outline-none text-sm appearance-none cursor-pointer"
                            value={sortTicks}
                            onChange={(e) => onSortTicksChange(e.target.value as any)}
                        >
                            <option value="none">Sắp xếp: Mặc định</option>
                            <option value="desc">Tick nhiều nhất</option>
                            <option value="asc">Tick ít nhất</option>
                        </select>
                        <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                            <ArrowUpDown size={14} />
                        </div>
                    </div>

                    <div className="w-px h-8 bg-slate-200 mx-1 hidden lg:block"></div>

                    {/* Action Buttons */}
                    {!isTeacher && (
                        <>
                            <button
                                onClick={onBulkGenerate}
                                disabled={isBulkProcessing}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg shadow-indigo-500/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={16} />
                                <span className="hidden xl:inline">AI Hàng loạt</span>
                            </button>

                            <button
                                onClick={onSyncSheet}
                                disabled={isSyncing || isBulkProcessing}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-500/20 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Đồng bộ Sheet"
                            >
                                {isSyncing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                <span className="hidden xl:inline">Đồng bộ</span>
                            </button>

                            <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl cursor-pointer shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all">
                                <Upload size={16} />
                                <span className="hidden xl:inline">Excel</span>
                                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileUpload} />
                            </label>

                            {onAddStudent && (
                                <button
                                    onClick={onAddStudent}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg shadow-pink-500/20 transform hover:-translate-y-0.5 transition-all"
                                >
                                    <Users size={16} />
                                    <span className="hidden xl:inline">Thêm HS</span>
                                </button>
                            )}
                        </>
                    )}

                    <AdminChangePasswordButton />

                    <button
                        onClick={onLogout}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Đăng xuất"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </header >
    );
}
