import React from "react";
import { TrendingUp, ShieldAlert, Award } from "lucide-react";

type Props = {
    overviewText: string;
    strengthsText: string;
    risksText: string;
};

export default function OverviewCards({ overviewText, strengthsText, risksText }: Props) {
    return (
        <div className="grid md:grid-cols-3 gap-6">
            <div className="group relative bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-lg transition-all overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp size={80} className="text-blue-600 transform rotate-12" />
                </div>
                <div className="relative z-10">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                        <TrendingUp size={20} />
                    </div>
                    <div className="text-sm font-bold text-slate-800 uppercase tracking-wide opacity-60 mb-2">Tổng quan</div>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed text-justify">{overviewText}</div>
                </div>
            </div>

            <div className="group relative bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-lg transition-all overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Award size={80} className="text-emerald-600 transform -rotate-12" />
                </div>
                <div className="relative z-10">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                        <Award size={20} />
                    </div>
                    <div className="text-sm font-bold text-slate-800 uppercase tracking-wide opacity-60 mb-2">Điểm mạnh</div>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed">{strengthsText}</div>
                </div>
            </div>

            <div className="group relative bg-white/70 backdrop-blur-xl border border-white/50 p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-lg transition-all overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ShieldAlert size={80} className="text-orange-600 transform rotate-6" />
                </div>
                <div className="relative z-10">
                    <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                        <ShieldAlert size={20} />
                    </div>
                    <div className="text-sm font-bold text-slate-800 uppercase tracking-wide opacity-60 mb-2">Cần lưu ý</div>
                    <div className="text-sm font-medium text-slate-700 leading-relaxed">{risksText}</div>
                </div>
            </div>
        </div>
    );
}
