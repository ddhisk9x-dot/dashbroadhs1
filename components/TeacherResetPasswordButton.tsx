// components/TeacherResetPasswordButton.tsx (đặt ở TeacherView — mỗi học sinh 1 nút)
"use client";
import React, { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

export default function TeacherResetPasswordButton({ mhs }: { mhs: string }) {
  const [loading, setLoading] = useState(false);

  const reset = async () => {
    if (!confirm(`Reset mật khẩu HS ${mhs} về DEFAULT_PASSWORD?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mhs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) return alert(data?.error || "Reset thất bại");
      alert("Reset OK (NEW_PASSWORD đã xóa, quay về DEFAULT_PASSWORD)");
    } catch (e: any) {
      alert(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={reset}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold disabled:opacity-50"
      title="Reset về mật khẩu mặc định"
    >
      {loading ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
      Reset MK
    </button>
  );
}
