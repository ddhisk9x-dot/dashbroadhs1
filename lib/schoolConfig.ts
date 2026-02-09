export type YearConfig = {
    id: string; // "2025-2026"
    label: string; // "Năm học 2025 - 2026"
    sheets: SheetConfig[];
};

export type SheetConfig = {
    sheetName: string; // "DIEM_2526_K10" (Tên trên Google Sheet)
    dbId: string;      // "K10_2526" (ID trong bảng app_state)
    label: string;     // "Khối 10" (Hiển thị UI)
};

// CẤU HÌNH CHÍNH CỦA TRƯỜNG
// Bác có thể sửa file này để thêm/bớt khối tùy ý
export const SCHOOL_YEARS: YearConfig[] = [
    {
        id: "2025-2026",
        label: "Năm học 2025 - 2026",
        sheets: [
            { sheetName: "DIEM_2526", dbId: "main", label: "Toàn trường (THCS)" },
        ],
    },
    {
        id: "2026-2027",
        label: "Năm học 2026 - 2027",
        sheets: [
            { sheetName: "DIEM_2627", dbId: "main_2627", label: "Toàn trường" }
        ]
    }
];

export const DEFAULT_YEAR_ID = "2025-2026";
