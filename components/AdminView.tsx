import React, { useState } from "react";
import { User, Student } from "../types";
import { LogOut, Users, School, LayoutDashboard } from "lucide-react";

interface AdminViewProps {
    user: User; // The admin user
    students: Student[]; // All students (for system stats)
    onLogout: () => void;
    // Add other props as needed for specific admin actions
}

export default function AdminView({ user, students, onLogout }: AdminViewProps) {
    const [activeTab, setActiveTab] = useState<"DASHBOARD" | "USERS" | "CLASSES">("DASHBOARD");

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
                <div className="p-6 border-b border-slate-800">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Admin Portal
                    </h1>
                    <div className="text-sm text-slate-400 mt-1">DeepDashboard</div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <SidebarItem
                        icon={<LayoutDashboard size={20} />}
                        label="Tổng quan"
                        active={activeTab === "DASHBOARD"}
                        onClick={() => setActiveTab("DASHBOARD")}
                    />
                    <SidebarItem
                        icon={<Users size={20} />}
                        label="Quản lý Người dùng"
                        active={activeTab === "USERS"}
                        onClick={() => setActiveTab("USERS")}
                    />
                    <SidebarItem
                        icon={<School size={20} />}
                        label="Quản lý Lớp học"
                        active={activeTab === "CLASSES"}
                        onClick={() => setActiveTab("CLASSES")}
                    />
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                            {user.name.charAt(0)}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <div className="text-sm font-medium truncate">{user.name}</div>
                            <div className="text-xs text-slate-400">Administrator</div>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 p-2 rounded-lg transition-colors"
                    >
                        <LogOut size={18} />
                        <span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {activeTab === "DASHBOARD" && <AdminDashboardTab students={students} />}
                {activeTab === "USERS" && <AdminUsersTab />}
                {activeTab === "CLASSES" && <AdminClassesTab />}
            </main>
        </div>
    );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
        >
            {icon}
            <span className="font-medium">{label}</span>
        </button>
    );
}

function AdminDashboardTab({ students }: { students: Student[] }) {
    const totalStudents = students.length;
    // Mock class count for now
    const totalClasses = new Set(students.map(s => s.class)).size;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Tổng quan hệ thống</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard label="Tổng Học sinh" value={totalStudents} color="blue" />
                <StatCard label="Lớp học hoạt động" value={totalClasses} color="purple" />
                <StatCard label="Giáo viên" value="--" color="emerald" />
            </div>
        </div>
    );
}

interface AdminUser extends User {
    id?: string;
    lastLogin?: string;
}

function AdminUsersTab() {
    const [users, setUsers] = useState<AdminUser[]>([
        { username: "admin", name: "Quản trị viên", role: "ADMIN" as any },
        { username: "gv01", name: "Nguyễn Văn A", role: "TEACHER" as any },
        { username: "gv02", name: "Trần Thị B", role: "TEACHER" as any },
    ]); // Mock data - connect to API later
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

    const handleDelete = (username: string) => {
        if (confirm(`Bạn có chắc chắn muốn xóa người dùng ${username}?`)) {
            setUsers(users.filter((u) => u.username !== username));
        }
    };

    const handleEdit = (user: AdminUser) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleSave = (user: AdminUser) => {
        if (editingUser) {
            setUsers(users.map(u => u.username === user.username ? user : u));
        } else {
            setUsers([...users, user]);
        }
        setIsModalOpen(false);
        setEditingUser(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800">Quản lý Người dùng</h2>
                <button
                    onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                    <Users size={18} />
                    <span>Thêm người dùng</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-600">Tên người dùng</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Tài khoản</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Vai trò</th>
                            <th className="px-6 py-4 font-semibold text-slate-600 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users.map((u) => (
                            <tr key={u.username} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800">{u.name}</td>
                                <td className="px-6 py-4 text-slate-500">{u.username}</td>
                                <td className="px-6 py-4">
                                    <span
                                        className={`px-2 py-1 rounded-md text-xs font-bold ${u.role === "ADMIN"
                                            ? "bg-purple-100 text-purple-700"
                                            : u.role === "TEACHER"
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-slate-100 text-slate-700"
                                            }`}
                                    >
                                        {u.role === "ADMIN" ? "Quản trị viên" : u.role === "TEACHER" ? "Giáo viên" : "Học sinh"}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                                        Sửa
                                    </button>
                                    <button onClick={() => handleDelete(u.username)} className="text-red-600 hover:text-red-800 font-medium text-sm">
                                        Xóa
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <UserModal
                    user={editingUser}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

function UserModal({
    user,
    onClose,
    onSave,
}: {
    user: AdminUser | null;
    onClose: () => void;
    onSave: (u: AdminUser) => void;
}) {
    const [name, setName] = useState(user?.name || "");
    const [username, setUsername] = useState(user?.username || "");
    const [role, setRole] = useState(user?.role || "TEACHER");

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">{user ? "Sửa người dùng" : "Thêm người dùng mới"}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tên hiển thị</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản (Username)</label>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={!!user}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Vai trò</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as any)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="TEACHER">Giáo viên</option>
                            <option value="ADMIN">Quản trị viên</option>
                            {/* <option value="STUDENT">Học sinh</option> - Học sinh managed via import usually */}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 font-medium">
                        Hủy
                    </button>
                    <button
                        onClick={() => onSave({ username, name, role: role as any })}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                        Lưu
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ClassItem {
    id: string;
    name: string;
    teacherId?: string;
    studentCount: number;
}

function AdminClassesTab() {
    const [classes, setClasses] = useState<ClassItem[]>([
        { id: "10A1", name: "10A1", teacherId: "gv01", studentCount: 35 },
        { id: "11A2", name: "11A2", teacherId: "gv02", studentCount: 32 },
    ]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleAddClass = (cls: ClassItem) => {
        setClasses([...classes, cls]);
        setIsModalOpen(false);
    };

    const handleDelete = (id: string) => {
        if (confirm(`Xóa lớp ${id}?`)) {
            setClasses(classes.filter((c) => c.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800">Quản lý Lớp học</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                    <School size={18} />
                    <span>Thêm lớp học</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-600">Mã Lớp / Tên Lớp</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Giáo viên chủ nhiệm</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Sĩ số</th>
                            <th className="px-6 py-4 font-semibold text-slate-600 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {classes.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800">{c.name}</td>
                                <td className="px-6 py-4 text-slate-500">{c.teacherId || "--"}</td>
                                <td className="px-6 py-4">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-sm font-bold">
                                        {c.studentCount} HS
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800 font-medium text-sm">
                                        Xóa
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <ClassModal onClose={() => setIsModalOpen(false)} onSave={handleAddClass} />
            )}
        </div>
    );
}

function ClassModal({ onClose, onSave }: { onClose: () => void; onSave: (c: ClassItem) => void }) {
    const [name, setName] = useState("");
    const [teacherId, setTeacherId] = useState("");

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Thêm lớp học mới</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tên Lớp (Mã Lớp)</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ví dụ: 10A1"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Giáo viên chủ nhiệm (Mã GV)</label>
                        <input
                            value={teacherId}
                            onChange={(e) => setTeacherId(e.target.value)}
                            placeholder="Ví dụ: gv05"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 font-medium">Hủy</button>
                    <button onClick={() => onSave({ id: name, name, teacherId, studentCount: 0 })}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
                        Tạo lớp
                    </button>
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: "blue" | "purple" | "emerald" }) {
    const colorStyles = {
        blue: "bg-blue-50 text-blue-700 border-blue-100",
        purple: "bg-purple-50 text-purple-700 border-purple-100",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    }
    return (
        <div className={`p-6 rounded-2xl border ${colorStyles[color]}`}>
            <div className="text-sm font-medium opacity-80">{label}</div>
            <div className="text-4xl font-bold mt-2">{value}</div>
        </div>
    );
}
