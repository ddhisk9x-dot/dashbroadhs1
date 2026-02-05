import React from "react";
import { LogOut } from "lucide-react";
import type { Student } from "../types";

type Props = {
    student: Student;
    onLogout: () => Promise<void>;
    streak: number;
};

export default function Header({ student, onLogout, streak }: Props) {
    return (
        <div className="bg-white border-b border-slate-200/60 px-5 py-4 sticky top-0 z-20">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="text-slate-800 font-bold text-lg">
                            Xin chào, <span className="uppercase">{student.name}</span> 👋
                        </div>
                        {streak > 0 && (
                            <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                                <span className="text-sm">🔥</span>
                                <span className="text-xs font-bold text-orange-600">{streak} ngày</span>
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                        MHS: <span className="font-mono text-indigo-600">{student.mhs}</span> | Lớp:{" "}
                        <span className="font-semibold text-slate-700">{student.class}</span>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600 transition"
                >
                    <LogOut size={16} />
                    Đăng xuất
                </button>
            </div>
        </div>
    );
}
