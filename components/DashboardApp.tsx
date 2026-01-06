"use client";
import React, { useState, useEffect } from 'react';
import StudentView from './StudentView';
import TeacherView from './TeacherView';
import { User, Role, Student, AIReport, StudyAction } from '../types';
import { Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '../services/clientApi';

// --- Inline Login Component ---
const LoginScreen = ({ onLogin, loading }: { onLogin: (u: string, p: string) => void, loading: boolean }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if(!username || !password) {
        setError("Vui lòng nhập đầy đủ thông tin");
        return;
    }
    onLogin(username, password);
  };


  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    setUser(null);
    setCurrentStudent(null);
    setStudents([]);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 opacity-50 z-0"></div>
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-md relative z-10 border border-white/50">
        <div className="text-center mb-10">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <span className="text-white font-bold text-xl">D</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">Deep Dashboard</h1>
            <p className="text-slate-500 font-medium">Hệ thống Phân tích & AI Mentor</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Tên đăng nhập (MHS)</label>
                <div className="relative group">
                    <UserIcon className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input 
                        type="text" 
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
                        placeholder="Ví dụ: HS001"
                        disabled={loading}
                    />
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Mật khẩu</label>
                <div className="relative group">
                    <Lock className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input 
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
                        placeholder="••••••••"
                        disabled={loading}
                    />
                </div>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 text-center font-medium animate-pulse">{error}</div>}
            
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="animate-spin" size={20} /> : <>Đăng Nhập <ArrowRight size={18} /></>}
            </button>
        </form>
        <div className="mt-8 text-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
             <p className="text-xs text-slate-500 font-medium leading-relaxed">
                <span className="font-bold text-indigo-600 block mb-1">Dành cho Học sinh:</span>
                Tên đăng nhập: <b>Mã HS</b> (vd: HS001)<br/>
                Mật khẩu: <b>Mã HS</b> hoặc <b>123456</b>
            </p>
        </div>
      </div>
    </div>
  );
};

const DashboardApp: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [students, setStudents] = useState<Student[]>([]); // Teacher View Data
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null); // Student View Data
  const [isLoading, setIsLoading] = useState(false);

  // Initial Load Check (Could verify session token here in robust app, but we stick to state for now)

  const loadTeacherData = async () => {
      setIsLoading(true);
      try {
          const data = await api.getAllStudents();
          setStudents(data);
      } catch (e) {
          console.error(e);
          alert("Lỗi tải dữ liệu lớp học.");
      } finally {
          setIsLoading(false);
      }
  };

  const loadStudentData = async (mhs: string) => {
      setIsLoading(true);
      try {
          const data = await api.getStudentMe(mhs);
          setCurrentStudent(data);
      } catch (e) {
          console.error(e);
          alert("Lỗi tải dữ liệu học sinh.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleLogin = async (u: string, p: string) => {
    setIsLoading(true);
    try {
        const { success, user: loggedInUser, error } = await api.login(u.trim(), p.trim());
        
        if (success && loggedInUser) {
            setUser(loggedInUser);
            if (loggedInUser.role === Role.TEACHER) {
                await loadTeacherData();
            } else {
                await loadStudentData(loggedInUser.username);
            }
        } else {
            alert(error || "Đăng nhập thất bại");
        }
    } catch (e) {
        alert("Lỗi kết nối server.");
    } finally {
        setIsLoading(false);
    }
  };

  // --- Actions ---

  const handleImportData = async (newStudents: Student[]) => {
      setIsLoading(true);
      try {
          await api.importExcel(newStudents);
          await loadTeacherData(); // Refresh list
      } catch (e) {
          console.error(e);
          alert("Lỗi lưu dữ liệu.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleUpdateStudentReport = async (mhs: string, report: AIReport, actions: StudyAction[]) => {
      // Optimistic update for UI responsiveness
      const updatedStudents = students.map(s => 
          s.mhs === mhs ? { ...s, aiReport: report, activeActions: actions } : s
      );
      setStudents(updatedStudents);

      try {
          await api.saveReport(mhs, report, actions);
      } catch (e) {
          console.error("Failed to save report", e);
          alert("Lỗi lưu báo cáo vào Database.");
      }
  };

  const handleUpdateAction = async (actionId: string, date: string, completed: boolean) => {
    if (!user || user.role !== Role.STUDENT || !currentStudent) return;

    // Optimistic Update
    const updatedActions = currentStudent.activeActions.map(a => {
        if (a.id !== actionId) return a;
        const ticks = a.ticks.filter(t => t.date !== date);
        if (completed) {
            ticks.push({ date, completed: true });
        }
        return { ...a, ticks };
    });
    
    setCurrentStudent({ ...currentStudent, activeActions: updatedActions });

    // API Call
    try {
        await api.tick(user.username, actionId, date, completed);
    } catch (e) {
        console.error("Tick failed", e);
    }
  };

  if (!user) {
      return <LoginScreen onLogin={handleLogin} loading={isLoading} />;
  }

  return (
    <>
        {user.role === Role.TEACHER ? (
            <TeacherView 
                students={students} 
                onImportData={handleImportData} 
                onUpdateStudentReport={handleUpdateStudentReport}
                onLogout={handleLogout}
            />
        ) : (
            currentStudent ? (
                <StudentView 
                    student={currentStudent} 
                    onUpdateAction={handleUpdateAction}
                    onLogout={handleLogout}
                />
            ) : (
                <div className="flex h-screen items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-600" size={40} />
                </div>
            )
        )}
    </>
  );
};

export default DashboardApp;