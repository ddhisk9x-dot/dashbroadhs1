import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label,
  Area,
} from "recharts";
import { ScoreData, StudentDashboardStats } from "../types";

type Props = {
  data: (ScoreData & {
    gradeMath?: number;
    gradeLit?: number;
    gradeEng?: number;
    targetMath?: number;
    targetLit?: number;
    targetEng?: number;
  })[];
  stats?: StudentDashboardStats;
  subject?: "math" | "lit" | "eng";
};

const SUBJECT_CONFIG = {
  math: { label: "Toán", color: "#3b82f6", gradient: ["#3b82f6", "#60a5fa"] }, // Blue
  lit: { label: "Văn", color: "#ec4899", gradient: ["#ec4899", "#f472b6"] },  // Pink
  eng: { label: "Anh", color: "#8b5cf6", gradient: ["#8b5cf6", "#a78bfa"] },  // Violet
};

export default function ScoreChart({ data, stats, subject }: Props) {
  // Sort data by month
  const chartData = useMemo(() => {
    return [...data].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [data]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[250px] text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <p className="font-medium">Chưa có dữ liệu điểm.</p>
      </div>
    );
  }

  // Determine subject config
  // Nếu không truyền subject -> mặc định vẽ 3 đường (hoặc logic cũ).
  // Nhưng trong thiết kế mới ta tách 3 biểu đồ riêng.
  const conf = subject ? SUBJECT_CONFIG[subject] : null;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-3 text-xs">
          <p className="font-bold text-slate-700 mb-2 uppercase tracking-wider">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-medium text-slate-600">
                {entry.name}: <span className="font-bold text-slate-800">{entry.value}</span>
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
          <defs>
            {/* Gradients for Areas/Bars if needed */}
            {subject && (
              <linearGradient id={`color${subject}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={conf?.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={conf?.color} stopOpacity={0} />
              </linearGradient>
            )}
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            dy={10}
          />

          <YAxis
            domain={[0, 10]}
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            dx={-10}
            padding={{ top: 10, bottom: 0 }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f5f9", radius: 8 }} />

          {/* Render Logic based on subject prop */}
          {subject ? (
            <>
              {/* 1. Target Line (Dotted) */}
              <Line
                type="monotone"
                dataKey={subject === "math" ? "targetMath" : subject === "lit" ? "targetLit" : "targetEng"}
                name="Mục tiêu"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
              {/* 2. Grade Avg Area (Background Context) */}
              <Area
                type="monotone"
                dataKey={subject === "math" ? "gradeMath" : subject === "lit" ? "gradeLit" : "gradeEng"}
                name="TB Khối"
                stroke="none"
                fill="#94a3b8"
                fillOpacity={0.1}
              />

              {/* 3. Student Score (Main Line) */}
              <Line
                type="monotone"
                dataKey={subject}
                name={`Điểm ${conf?.label}`}
                stroke={conf?.color}
                strokeWidth={3}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  const score = payload[subject] as number;
                  // Determine target key based on subject
                  const targetKey = subject === "math" ? "targetMath" : subject === "lit" ? "targetLit" : "targetEng";
                  const target = payload[targetKey] as number;

                  const isTargetMet = typeof score === "number" && typeof target === "number" && score >= target;

                  if (isTargetMet) {
                    return (
                      <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    );
                  }
                  return (
                    <circle cx={cx} cy={cy} r={4} stroke={conf?.color} strokeWidth={2} fill="#fff" />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 0, fill: conf?.color }}
                animationDuration={1500}
              />
            </>
          ) : (
            // Fallback for "General" chart (if any)
            <>
              <Line type="monotone" dataKey="math" name="Toán" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lit" name="Văn" stroke="#ec4899" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="eng" name="Anh" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </>
          )}

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}