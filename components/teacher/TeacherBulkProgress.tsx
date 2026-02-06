import React from "react";
import { Sparkles } from "lucide-react";

interface TeacherBulkProgressProps {
    progress: {
        current: number;
        total: number;
        currentName: string;
    } | null;
}

export default function TeacherBulkProgress({ progress }: TeacherBulkProgressProps) {
    if (!progress) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Sparkles size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Đang phân tích dữ liệu...</h3>
                <p className="text-slate-500 mb-6">
                    Đang xử lý: <span className="font-bold text-indigo-600">{progress.currentName}</span>
                </p>

                <div className="w-full bg-slate-100 rounded-full h-4 mb-2 overflow-hidden">
                    <div
                        className="bg-indigo-600 h-4 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Tiến độ</span>
                    <span>
                        {progress.current} / {progress.total}
                    </span>
                </div>
                <p className="text-xs text-slate-400 mt-4 italic">Vui lòng không tắt trình duyệt...</p>
            </div>
        </div>
    );
}
