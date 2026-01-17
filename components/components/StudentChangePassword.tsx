// components/StudentChangePassword.tsx (nhúng vào StudentView)
"use client";
import React, { useState } from "react";
import { Loader2 } from "lucide-react";

export default function StudentChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!cur || !next) return alert("Nhập đủ mật khẩu hiện tại + mật khẩu mới");
    if (next !== next2) return alert("Mật khẩu mới nhập lại không khớp");

    setLoading(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) return alert(data?.error || "Đổi mật khẩu thất bại");
      setCur(""); setNext(""); setNext2("");
      alert("Đổi mật khẩu thành công");
    } catch (e: any) {
      alert(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="text-sm font-bold text-slate-800 mb-3">Đổi mật khẩu</div>

      <div className="grid gap-3">
        <input
          type="password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          placeholder="Mật khẩu hiện tại"
          className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Mật khẩu mới"
          className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
          placeholder="Nhập lại mật khẩu mới"
          className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <button
          onClick={submit}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : null}
          Lưu mật khẩu mới
        </button>
      </div>
    </div>
  );
}
