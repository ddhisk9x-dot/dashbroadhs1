import React, { useState } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { LeaderboardItem } from "../types";

type Props = {
    leaderboardClass: LeaderboardItem[];
    leaderboardGrade: LeaderboardItem[];
    currentMhs: string; // to highlight self
};

export default function Leaderboard({ leaderboardClass, leaderboardGrade, currentMhs }: Props) {
    const [tab, setTab] = useState<"class" | "grade">("class");

    const data = tab === "class" ? leaderboardClass : leaderboardGrade;

    const getIcon = (rank: number) => {
        if (rank === 1) return <Trophy size={20} className="text-yellow-500" />;
        if (rank === 2) return <Medal size={20} className="text-gray-400" />;
        if (rank === 3) return <Award size={20} className="text-orange-500" />;
        return <span className="text-sm font-bold text-slate-500 w-5 text-center">{rank}</span>;
    };

    const getBg = (rank: number) => {
        if (rank === 1) return "bg-yellow-50 border-yellow-200";
        if (rank === 2) return "bg-slate-50 border-slate-200";
        if (rank === 3) return "bg-orange-50 border-orange-200";
        return "bg-white border-slate-100";
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Trophy className="text-indigo-600" size={20} />
                    <div className="text-sm font-bold text-slate-800">Bảng Xếp Hạng (Tháng này)</div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setTab("class")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === "class" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-600"
                            }`}
                    >
                        Lớp
                    </button>
                    <button
                        onClick={() => setTab("grade")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === "grade" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-600"
                            }`}
                    >
                        Toàn Khối
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {data.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 italic">Chưa có dữ liệu xếp hạng.</div>
                ) : (
                    data.map((item) => {
                        const isMe = item.id === currentMhs;
                        return (
                            <div
                                key={item.id}
                                className={`flex items-center justify-between p-3 rounded-xl border ${getBg(item.rank)} ${isMe ? "ring-2 ring-indigo-500 ring-offset-2" : ""
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 w-8 flex justify-center">{getIcon(item.rank)}</div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            {item.name}
                                            {isMe && <span className="text-[10px] bg-indigo-600 text-white px-1.5 rounded">Bạn</span>}
                                        </div>
                                        <div className="text-[10px] text-slate-500">{item.class}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-slate-800">{item.score}</div>
                                    <div className="text-[10px] text-slate-400 uppercase">Ticks</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-4 text-[11px] text-slate-400 text-center">
                * Xếp hạng dựa trên tổng số nhiệm vụ hoàn thành trong tháng.
            </div>
        </div>
    );
}
