"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams } from "@/app/lib/student_exams";

export default function ExamSubmittedPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;
  
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "student") {
      router.push("/student/login");
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    
    getAllStudentExams(token)
      .then(exams => {
        const found = exams.find(e => e.id === examId);
        if (found) {
          if (!found.attempt || (found.attempt.status !== "submitted" && found.attempt.status !== "evaluated")) {
            setError("This exam has not been submitted yet.");
          } else {
            setExam(found);
          }
        } else {
          setError("Exam not found or you are not authorized.");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, examId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#6c63ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !exam || !exam.attempt) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full shadow-sm text-center">
          <div className="text-red-500 mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error || "Could not load submission receipt"}</p>
          <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const completedAtStr = exam.attempt.completed_at;
  const completedAt = new Date(
    completedAtStr?.match(/(Z|[+-]\d{2}(:\d{2})?)$/) 
      ? completedAtStr 
      : completedAtStr + 'Z'
  );

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-lg w-full overflow-hidden animate-fade-up">
        <div className="bg-green-500 p-8 text-center text-white relative">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h1 className="text-2xl font-bold mb-1">Exam Submitted Successfully</h1>
          <p className="text-green-50 font-medium">Your answers have been securely recorded.</p>
          
          <div className="absolute -bottom-4 left-0 right-0 h-8">
             {/* decorative zigzag or curved border could go here */}
          </div>
        </div>

        <div className="p-8 pt-10">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Exam Title</span>
              <span className="text-slate-900 font-bold text-right max-w-[60%]">{exam.title}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Class</span>
              <span className="text-slate-900 font-bold uppercase tracking-wide text-sm">{exam.class_name}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Submission ID</span>
              <span className="text-slate-900 font-mono text-sm">{exam.attempt.id.split('-')[0]}...</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Submitted At</span>
              <span className="text-slate-900 font-bold">{completedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Evaluation Status</span>
              <span className={`font-bold ${exam.attempt.status === 'evaluated' ? 'text-green-600' : 'text-amber-500'}`}>
                {exam.attempt.status === 'evaluated' ? 'Completed' : 'Evaluation pending'}
              </span>
            </div>
            {exam.attempt.result_published_at && (
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Results</span>
                <button 
                  onClick={() => router.push(`/student/exams/${exam.id}/result`)}
                  className="text-[#6c63ff] font-bold hover:underline"
                >
                  View Results →
                </button>
              </div>
            )}
          </div>

          <div className="mt-10">
            <button 
              onClick={() => router.push("/student/dashboard")}
              className="w-full py-3.5 bg-[#6c63ff] hover:bg-[#5a52d5] text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(108,99,255,0.39)] transition-all transform hover:-translate-y-0.5 text-[0.95rem]"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
