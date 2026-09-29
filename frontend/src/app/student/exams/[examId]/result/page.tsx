"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams, getAttemptResult, getExamPaper } from "@/app/lib/student_exams";

export default function ExamResultPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;
  
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [result, setResult] = useState<any>(null);
  const [paper, setPaper] = useState<any>(null);
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
    
    async function loadData() {
      try {
        const exams = await getAllStudentExams(token!);
        const found = exams.find(e => e.id === examId);
        
        if (!found || !found.attempt || !found.attempt.id) {
          throw new Error("Exam attempt not found");
        }
        setExam(found);

        const attemptId = found.attempt.id;
        const resData = await getAttemptResult(token!, examId, attemptId);
        setResult(resData);
        
        const paperData = await getExamPaper(token!, examId);
        setPaper(paperData);
        
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load result");
        setLoading(false);
      }
    }
    
    loadData();
  }, [token, examId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#6c63ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !exam || !result || !paper) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full shadow-sm text-center">
          <div className="text-red-500 mb-4 text-4xl">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error || "Could not load exam result"}</p>
          <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const answers = result.saved_answers || [];
  const qMap = new Map();
  paper.sections.forEach((sec: any) => {
    sec.questions.forEach((q: any) => {
      qMap.set(q.question_id, q);
    });
  });

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{exam.title} - Results</h1>
          <div className="text-slate-600 flex justify-between font-semibold">
            <span>Score: {result.total_marks} / {result.max_marks}</span>
            <span>Evaluated At: {new Date(result.evaluated_at).toLocaleString()}</span>
          </div>
        </div>
        
        {answers.map((ans: any, idx: number) => {
          const q = qMap.get(ans.question_id);
          if (!q) return null;
          
          const evalData = ans.evaluation || {};
          const isCorrect = evalData.ai_assigned_marks === q.mark;
          const bg = isCorrect ? "bg-green-50 border-green-200" : (evalData.ai_assigned_marks > 0 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200");

          return (
            <div key={idx} className={`p-6 rounded-xl border ${bg} shadow-sm space-y-4`}>
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-slate-800">Q: {q.question_text}</h3>
                <span className="font-bold whitespace-nowrap ml-4 text-slate-700">
                  {evalData.modified_by_teacher ? evalData.teacher_override_marks : evalData.ai_assigned_marks} / {q.mark}
                </span>
              </div>
              <div className="text-sm text-slate-600">
                <strong>Your Answer:</strong> {JSON.stringify(ans.answer)}
              </div>
              <div className="text-sm text-slate-700 mt-2 bg-white/60 p-3 rounded-lg border border-slate-200/60">
                <strong>Feedback:</strong> {evalData.ai_feedback || "No feedback"}
                {evalData.modified_by_teacher && (
                  <div className="mt-2 text-purple-700">
                    <strong>Teacher Note:</strong> {evalData.override_reason}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        <button onClick={() => router.push("/student/dashboard")} className="mt-8 px-6 py-3 bg-[#6c63ff] hover:bg-[#5a52d5] text-white font-bold rounded-xl shadow-sm transition-colors block mx-auto">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
