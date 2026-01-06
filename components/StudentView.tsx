"use client";
import React, { useState } from 'react';
import { Student, StudyAction } from '../types';
import ScoreChart from './ScoreChart';
import { CheckCircle2, Circle, Calendar, AlertTriangle, TrendingUp, BookOpen, LogOut, Star } from 'lucide-react';

interface StudentViewProps {
  student: Student;
  onUpdateAction: (actionId: string, date: string, completed: boolean) => void;
  onLogout: () => void;
}

const StudentView: React.FC<StudentViewProps> = ({ student, onUpdateAction, onLogout }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const report = student.aiReport;

  const handleTick = (actionId: string) => {
    const action = student.activeActions.find(a => a.id === actionId);
    if (!action) return;
    
    const isCompleted = action.ticks.some(t => t.date === selectedDate && t.completed);
    onUpdateAction(actionId, selectedDate, !isCompleted);
  };

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-md mx-4">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="text-indigo-600" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Chưa có dữ liệu phân tích</h2>
          <p className="text-slate-500 mb-6">Giáo viên chưa tạo báo cáo AI cho bạn. Vui lòng quay lại sau nhé.</p>
          <button onClick={onLogout} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors">Đăng xuất</button>
        </div>
      </div>
    );
  }

  // Helper colors for risk
  const getRiskColor = (level: string) => {
    if (level === 'Cao') return 'text-red-600 bg-red-50 border-red-100';
    if (level === 'Trung bình') return 'text-orange-600 bg-orange-50 border-orange-100';
    return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20 font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Xin chào, {student.name} 👋</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">MHS: <span className="text-indigo-600">{student.mhs}</span> | Lớp: {student.class}</p>
          </div>
          <button 
            onClick={onLogout} 
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* General Overview */}
            <div className={`p-6 rounded-3xl border shadow-sm transition-transform hover:-translate-y-1 duration-300 ${getRiskColor(report.riskLevel)}`}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-white rounded-full shadow-sm">
                        <TrendingUp size={20} className="currentColor" />
                    </div>
                    <h3 className="font-bold opacity-90">Tổng quan</h3>
                </div>
                <p className="text-sm opacity-90 leading-relaxed">{report.overview}</p>
            </div>

            {/* Strengths */}
            <div className="p-6 rounded-3xl border border-indigo-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform hover:-translate-y-1 duration-300">
                 <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-full">
                        <Star size={20} />
                    </div>
                    <h3 className="font-bold text-slate-700">Điểm mạnh</h3>
                </div>
                <ul className="space-y-2">
                    {report.strengths.slice(0,3).map((s, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"></span>
                            {s}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Risks/Notes */}
             <div className="p-6 rounded-3xl border border-orange-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform hover:-translate-y-1 duration-300">
                 <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-orange-50 text-orange-500 rounded-full">
                        <AlertTriangle size={20} />
                    </div>
                    <h3 className="font-bold text-slate-700">Cần lưu ý</h3>
                </div>
                <ul className="space-y-2">
                    {report.risks.slice(0,3).map((s, i) => (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0"></span>
                            {s}
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* Charts */}
        <ScoreChart data={student.scores} />

        {/* Daily Habits & Study Plan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Habits Section */}
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 size={18} />
                        </div>
                        Thói quen Hàng ngày
                    </h3>
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600"
                    />
                </div>
                <p className="text-xs text-slate-400 mb-4 px-1">Đánh dấu tích để hoàn thành mục tiêu hôm nay.</p>
                
                <div className="space-y-3">
                    {student.activeActions.map(action => {
                        const isDone = action.ticks.some(t => t.date === selectedDate && t.completed);
                        return (
                            <div 
                                key={action.id}
                                onClick={() => handleTick(action.id)}
                                className={`group flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                                    isDone 
                                    ? 'bg-emerald-50/80 border-emerald-200 shadow-none' 
                                    : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200'
                                }`}
                            >
                                <div className={`mt-0.5 transition-colors duration-300 ${isDone ? 'text-emerald-500' : 'text-slate-300 group-hover:text-indigo-400'}`}>
                                    {isDone ? <CheckCircle2 size={24} className="fill-emerald-100" /> : <Circle size={24} />}
                                </div>
                                <div>
                                    <p className={`font-semibold text-sm transition-colors duration-300 ${isDone ? 'text-emerald-900 line-through opacity-70' : 'text-slate-700'}`}>
                                        {action.description}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1 font-medium bg-slate-100 inline-block px-2 py-0.5 rounded-lg">{action.frequency}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Study Plan Section */}
            <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Calendar size={18} />
                    </div>
                    Kế hoạch 2 Tuần tới
                </h3>
                <div className="space-y-0 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                    {report.studyPlan.map((plan, idx) => (
                        <div key={idx} className="flex gap-4 group">
                            <div className="min-w-[70px] pt-1">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{plan.day}</span>
                            </div>
                            <div className="flex-1 pb-6 border-l-2 border-slate-100 pl-4 relative group-last:border-0 group-last:pb-0">
                                <span className="absolute -left-[5px] top-[6px] w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white group-hover:bg-indigo-500 transition-colors duration-300"></span>
                                <div className="bg-slate-50 p-3 rounded-xl group-hover:bg-indigo-50/50 transition-colors duration-300">
                                    <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-white text-indigo-600 shadow-sm mb-2 border border-indigo-100">
                                        {plan.subject}
                                    </span>
                                    <div className="text-slate-700 font-semibold text-sm mb-1">{plan.content}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                        <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                                        {plan.duration}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* AI Message */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-3xl text-white shadow-xl shadow-indigo-500/20">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-purple-400 opacity-20 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
                <h3 className="font-bold text-xl mb-3 flex items-center gap-2">
                    <span>✨</span> Lời nhắn từ AI Mentor
                </h3>
                <p className="text-indigo-50 text-lg leading-relaxed font-light italic">"{report.messageToStudent}"</p>
                <div className="mt-6 text-[10px] uppercase tracking-widest opacity-50 border-t border-white/20 pt-4">
                    Disclaimer: {report.disclaimer}
                </div>
            </div>
        </div>

      </main>
    </div>
  );
};

export default StudentView;