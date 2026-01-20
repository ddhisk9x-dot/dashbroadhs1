"use client";

import { useMemo, useState } from "react";

export default function ResetAdminPage() {
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const submit = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/account/admin/confirm-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Reset failed");
      setMsg("✅ Đổi mật khẩu thành công. Bạn có thể đăng nhập lại.");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 p-6">
        <h1 className="text-lg font-bold text-slate-800">Reset mật khẩu Admin</h1>

        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-600">Mật khẩu mới</label>
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200"
            placeholder="Nhập mật khẩu mới..."
            type="password"
          />
        </div>

        <button
          onClick={submit}
          disabled={!token || !newPassword || loading}
          className="mt-4 w-full px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
          type="button"
        >
          {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
        </button>

        {msg && <div className="mt-4 text-sm">{msg}</div>}

        {!token && (
          <div className="mt-4 text-xs text-rose-600">
            Link không hợp lệ hoặc thiếu token.
          </div>
        )}
      </div>
    </div>
  );
}
