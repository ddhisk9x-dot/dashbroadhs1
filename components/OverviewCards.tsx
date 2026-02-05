import React from "react";

type Props = {
    overviewText: string;
    strengthsText: string;
    risksText: string;
};

export default function OverviewCards({ overviewText, strengthsText, risksText }: Props) {
    return (
        <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                <div className="text-sm font-bold text-orange-700 mb-2">Tổng quan</div>
                <div className="text-sm text-slate-700 leading-relaxed">{overviewText}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold text-slate-800 mb-2">Điểm mạnh</div>
                <div className="text-sm text-slate-700 leading-relaxed">• {strengthsText}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold text-slate-800 mb-2">Cần lưu ý</div>
                <div className="text-sm text-slate-700 leading-relaxed">• {risksText}</div>
            </div>
        </div>
    );
}
