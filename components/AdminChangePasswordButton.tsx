"use client";

import React, { useEffect, useState } from "react";
import { X, KeyRound, Loader2 } from "lucide-react";

export default function AdminChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // ESC để đóng + khóa scroll khi mở
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setMsg("");
    setOldPass("");
    setNewPass("");
    setLoading(false);
  };

  const submit = async () => {
    setMsg("");
    if (!newPass.trim()) {
      setMsg("Vui lòng nhập mật khẩu mới.");
      return;
    }

    setLoading(true);
    try {
      // đổi đúng route bạn đang dùng
      const res = await fetch("/api/account/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Đổi mật khẩu thất bại");
        return;
      }

      setMsg("✅ Đổi mật khẩu thành công");
      setTimeout(() => close(), 800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
        title="Đổi mật khẩu Admin"
      >
        <KeyRound size={16} />
        Đổi MK Admin
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(e) => {
            // bấm ra ngoài để đóng
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-slate-800">Đổi mật khẩu Admin</div>
                <div className="text-xs text-slate-500 mt-1">
                  Nếu quên mật khẩu: dùng luồng reset qua email.
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-1">Mật khẩu cũ</div>
                <input
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="(nếu bạn có dùng kiểm tra mật khẩu cũ)"
                />
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-700 mb-1">Mật khẩu mới</div>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Nhập mật khẩu mới"
                />
              </div>

              {msg && (
                <div className="text-sm px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                  {msg}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-white">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                Đổi mật khẩu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
