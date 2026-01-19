// lib/teachers.ts
import { cache } from "react";

export type TeacherAccount = {
  classes: string[];         // lớp phụ trách
  name: string;
  username: string;
  defaultPassword: string;   // DEFAULT_PASSWORD
  newPassword?: string;      // NEW_PASSWORD (từ sheet)
  email?: string;
};

function splitClasses(s: string) {
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

// Bạn đang dùng cơ chế đọc sheet kiểu nào thì giữ nguyên.
// Ở đây mình giả sử bạn đã có 1 hàm fetchSheetRows(url...) trong lib/accounts.
// Nếu bạn chưa có, mình sẽ sửa đúng theo code thật khi bạn gửi lib/accounts.ts.
import { fetchSheetTeachersRows } from "@/lib/sheetReader";

// Map username -> TeacherAccount
export const fetchTeachersFromSheet = cache(async (): Promise<Map<string, TeacherAccount>> => {
  const rows = await fetchSheetTeachersRows(); // phải trả về array of objects theo header
  const map = new Map<string, TeacherAccount>();

  for (const r of rows) {
    const username = String(r.USERNAME || "").trim();
    if (!username) continue;

    const cls = splitClasses(String(r.CLASS || ""));
    map.set(username, {
      classes: cls,
      name: String(r.NAME || "").trim(),
      username,
      defaultPassword: String(r.DEFAULT_PASSWORD || "").trim(),
      newPassword: String(r.NEW_PASSWORD || "").trim() || undefined,
      email: String(r.EMAIL || "").trim() || undefined,
    });
  }
  return map;
});
