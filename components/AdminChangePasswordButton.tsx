"use client";

import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";

type MeResp = { ok: boolean; session?: any };

export default function AdminChangePasswordButton() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/me", { cache: "no-store" });
      const data: MeResp = await r.json().catch(() => ({ ok: false }));
      setIsAdmin(!!data?.ok && data?.session?.role === "ADMIN");
    })();
  }, []);

  if (!isAdmin) return null;

  const submit = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/account/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Change failed");
      alert("✅ Đổi mật khẩu admin thành công!");
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      alert(e?.message || "Lỗi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
        title="Đổi mật khẩu Admin"
        type="button"
      >
        <KeyRound size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-800">Đổi mật khẩu Admin</div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100" type="button">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-600">Mật khẩu hiện tại</div>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-600">Mật khẩu mới</div>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <button
                onClick={submit}
                disabled={loading || !currentPassword || !newPassword}
                className="w-full mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
                type="button"
              >
                {loading ? "Đang đổi..." : "Đổi mật khẩu"}
              </button>

              <div className="text-xs text-slate-500">
                Nếu quên mật khẩu admin: gọi API <code className="bg-slate-100 px-1 rounded">/api/account/admin/request-reset</code>.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
