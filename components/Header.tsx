import React from "react";
import { LogOut, Trophy, Sparkles } from "lucide-react";
import { Student } from "../types";

interface HeaderProps {
    student: Student;
    streak: number;
    onLogout: () => void;
}

export default function Header({ student, streak, onLogout }: HeaderProps) {
    return (
        <header className="sticky top-0 z-50 px-4 sm:px-8 py-4">
            <div className="mx-auto max-w-[1400px]">
                <div className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-lg shadow-slate-200/20 rounded-2xl px-6 py-3 flex items-center justify-between transition-all hover:bg-white/90">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                            <span className="font-bold text-lg">{student.name.charAt(0)}</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-none">{student.name}</h1>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-1">
                                <span className="bg-slate-100 px-2 py-0.5 rounded-md">Lớp {student.class}</span>
                                <span className="text-slate-300">•</span>
                                <span className="font-mono text-indigo-500">{student.mhs}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {streak > 0 && (
                            <div className="hidden sm:flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-600 px-3 py-1.5 rounded-xl animate-in fade-in zoom-in">
                                <div className="p-1 bg-orange-100 rounded-lg">
                                    <Sparkles size={14} className="animate-pulse" />
                                </div>
                                <div className="text-sm font-bold">{streak} ngày liên tiếp 🔥</div>
                            </div>
                        )}

                        <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>

                        <button
                            onClick={onLogout}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl transition-all"
                        >
                            <LogOut size={18} />
                            <span className="hidden sm:inline">Đăng xuất</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
