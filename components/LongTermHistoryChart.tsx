import React, { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api } from "../services/clientApi";
import { Loader2 } from "lucide-react";

interface LongTermHistoryChartProps {
    mhs: string;
}

export default function LongTermHistoryChart({ mhs }: LongTermHistoryChartProps) {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        api.getStudentHistory(mhs)
            .then(data => {
                if (mounted) setHistory(data);
            })
            .catch(err => {
                if (mounted) setError(err.message);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [mhs]);

    const chartData = useMemo(() => {
        if (!history.length) return [];

        // Flatten data: Each item in history is a Year Record (e.g. DIEM_2526 row)
        // We need to extract Month Columns.
        // Heuristic: finding keys that look like YYYY-MM
        let points: any[] = [];

        history.forEach(yearRecord => {
            const yearSheet = yearRecord._yearSheet || "";
            // Scan keys
            Object.keys(yearRecord).forEach(key => {
                // Check format YYYY-MM (e.g., 2025-09)
                if (/^\d{4}-\d{2}$/.test(key)) {
                    // This key holds the MATH score? Or is it an object?
                    // "getData" returns flat object.
                    // Actually, "getData" in Apps Script separates columns.
                    // BUT my "getStudentHistory" returned rows with columns mapped by header.
                    // If headers are "2025-09_MATH", "2025-09_LITERATURE"...
                    // OR if headers are "2025-09" and the value is just one score?
                    // We need to know the header format in the Google Sheet.
                    // Assumption from current code: AdminView import expects sheets named "2025-09".
                    // But Multi-Year strategy creates sheets "DIEM_2526".
                    // If "DIEM_2526" has columns like "T9_TOAN", "T9_VAN"... or "Method 1: One Sheet per Year".
                    // Let's assume the headers are "T9", "T10"... or "2025-09".
                    // Let's try to parse flexibly.

                    // Case A: Key is "2025-09" and value is... complex? No, likely just Math?
                    // No, usually 3 subjects per month.
                    // So headers might be: "2025-09_TOAN", "2025-09_VAN", "2025-09_ANH".
                }
            });

            // Re-evaluating based on "getData" output.
            // "getData" returns whatever is in the sheet.
            // If the user manually manages the sheet, headers could be anything.
            // However, existing "AdminView" import logic (XLSX) creates "scores" array.
            // If we use the "students" variable in AdminView, it has "scores" array.
            // "getStudentHistory" returns an array of objects, where each object is what "getData" returns for a student row.

            // Let's try to parse "scores" if it exists?
            // "getData" returns flat KV pairs.
            // We need to parse headers.
            // Let's assume headers containing "TOAN", "VAN", "ANH" and some month indicator.
            // Or maybe the Apps Script "getData" logic for V3 *already* parsed it?
            // No, V3 "getData" (lines 92-114) just maps header->value.

            // Fallback: If we can't parse months from headers, we verify keys.
            // If headers are like "9_TOAN", "9_VAN", "9_ANH" (common Vietnamese format).
            // Or "T9 TOAN"...

            // Let's iterate all keys and try to extract month and subject.
            const monthMap = new Map<string, { math?: number, lit?: number, eng?: number }>();

            Object.keys(yearRecord).forEach(key => {
                const upper = key.toUpperCase();
                const val = parseFloat(yearRecord[key]);
                if (isNaN(val)) return;

                // Detect Month (1-12)
                const monthMatch = upper.match(/T(\d{1,2})|THANG(\d{1,2})|MONTH(\d{1,2})|(\d{1,2})[-_]/);
                // Detect Year (2025, 25 for short)
                // If Year not in key, deduce from yearSheet (e.g. DIEM_2526)

                // Let's look for known patterns.
                // Pattern 1: "T9 TOAN", "T9 VAN", "T9 ANH"
                // Pattern 2: "9_TOAN", "9_VAN"...

                // Extract Subject
                let subject: "math" | "lit" | "eng" | null = null;
                if (upper.includes("TOAN") || upper.includes("MATH")) subject = "math";
                else if (upper.includes("VAN") || upper.includes("LIT") || upper.includes("NGU VAN")) subject = "lit";
                else if (upper.includes("ANH") || upper.includes("ENG") || upper.includes("TIENG ANH")) subject = "eng";

                if (!subject) return;

                // Extract Month
                let monthNum = -1;
                if (monthMatch) {
                    monthNum = parseInt(monthMatch[1] || monthMatch[2] || monthMatch[3] || monthMatch[4]);
                }

                if (monthNum > 0 && monthNum <= 12) {
                    // Deduce Year from yearSheet (DIEM_2526)
                    // If month >= 8, it's Start Year (2025). If <= 5, it's End Year (2026).
                    const yearMatch = yearSheet.match(/_(\d{2})(\d{2})/);
                    let fullYear = 0;
                    if (yearMatch) {
                        const startY = 2000 + parseInt(yearMatch[1]);
                        const endY = 2000 + parseInt(yearMatch[2]);
                        fullYear = (monthNum >= 6) ? startY : endY; // Pivot at June
                    } else {
                        fullYear = new Date().getFullYear(); // Fallback
                    }

                    const monthKey = `${fullYear}-${String(monthNum).padStart(2, '0')}`;
                    if (!monthMap.has(monthKey)) monthMap.set(monthKey, {});
                    monthMap.get(monthKey)![subject] = val;
                }
            });

            monthMap.forEach((scores, mKey) => {
                // Calculate average if possible
                const nums = [scores.math, scores.lit, scores.eng].filter(n => n !== undefined) as number[];
                const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

                points.push({
                    month: mKey,
                    name: mKey.replace("-", "/").slice(2), // 25/09
                    ...scores,
                    avg: avg ? parseFloat(avg.toFixed(2)) : null,
                    yearSheet
                });
            });
        });

        // Sort points by time
        return points.sort((a, b) => a.month.localeCompare(b.month));

    }, [history]);

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>;
    if (error) return <div className="p-4 text-red-500 bg-red-50 rounded mb-4">Lỗi tải lịch sử: {error}</div>;
    if (!chartData.length) return <div className="p-4 text-slate-500 text-center italic">Chưa có dữ liệu lịch sử.</div>;

    return (
        <div className="bg-white p-4 rounded-xl shadow border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                📈 Biểu đồ Tiến bộ (Đa năm học)
            </h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" fontSize={12} tickMargin={10} stroke="#94a3b8" />
                        <YAxis domain={[0, 10]} fontSize={12} stroke="#94a3b8" />
                        <Tooltip
                            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                            itemStyle={{ fontSize: "13px", fontWeight: 500 }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="avg" name="TB Chung" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="math" name="Toán" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="lit" name="Văn" stroke="#ec4899" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="eng" name="Anh" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 justify-end">
                {Array.from(new Set(chartData.map(d => d.yearSheet))).sort().map(y => (
                    <span key={y} className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-500 font-medium">{y.replace("DIEM_", "Năm ")}</span>
                ))}
            </div>
        </div>
    );
}
