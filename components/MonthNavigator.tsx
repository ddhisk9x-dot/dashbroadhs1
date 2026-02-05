import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
    selectedTaskMonthSafe: string;
    selectedDate: string;
    monthKeys: string[];
    canPrevMonth: boolean;
    canNextMonth: boolean;
    onSelectMonth: (month: string) => void;
    onSelectDate: (date: string) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
};

export default function MonthNavigator({
    selectedTaskMonthSafe,
    selectedDate,
    monthKeys,
    canPrevMonth,
    canNextMonth,
    onSelectMonth,
    onSelectDate,
    onPrevMonth,
    onNextMonth,
}: Props) {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
                <div className="text-sm font-bold text-slate-800">Thói quen Hàng ngày</div>
                <div className="text-xs text-slate-500">
                    Nhiệm vụ theo tháng: <b>{selectedTaskMonthSafe}</b> (tháng sau có thể khác).
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={onPrevMonth}
                    disabled={!canPrevMonth}
                    className="p-2 rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                    title="Tháng trước"
                >
                    <ChevronLeft size={18} />
                </button>

                <select
                    value={selectedTaskMonthSafe}
                    onChange={(e) => onSelectMonth(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                >
                    {monthKeys.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>

                <button
                    onClick={onNextMonth}
                    disabled={!canNextMonth}
                    className="p-2 rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                    title="Tháng sau"
                >
                    <ChevronRight size={18} />
                </button>

                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => onSelectDate(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                />
            </div>
        </div>
    );
}
