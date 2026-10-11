"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams } from "@/app/lib/student_exams";
import Link from "next/link";

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
      <div className="min-h-screen bg-surface flex items-center justify-center font-label-caps text-xs text-neutral-500">
        LOADING SUBMISSION RECEIPT...
      </div>
    );
  }

  if (error || !exam || !exam.attempt) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest border border-brand-crimson p-8 max-w-md w-full shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] text-center">
          <span className="material-symbols-outlined text-brand-crimson text-[36px] mb-2">error</span>
          <h2 className="font-serif text-2xl text-brand-dark mb-2">Submission Error</h2>
          <p className="font-body-md text-xs text-neutral-600 mb-6">{error || "Could not load submission receipt"}</p>
          <Link
            href="/student/dashboard"
            className="inline-block bg-brand-dark text-white font-label-caps text-xs uppercase tracking-wider py-3 px-6 hover:bg-brand-crimson"
          >
            Return to Dashboard
          </Link>
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
    <main className="min-h-screen bg-surface flex items-center justify-center p-6 font-body-md text-on-surface">
      <div className="bg-surface-container-lowest border border-black/10 max-w-lg w-full shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] overflow-hidden animate-fade-up">
        {/* Accent Bar & Header */}
        <div className="bg-brand-dark p-8 text-center text-white relative">
          <div className="w-12 h-12 bg-white/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-brand-crimson text-[28px]">check_circle</span>
          </div>
          <span className="font-label-caps text-[10px] text-brand-crimson tracking-[0.2em] uppercase font-bold block mb-1">
            EXAMINATION RECEIPT
          </span>
          <h1 className="font-serif text-2xl font-bold mb-1">Exam Submitted Successfully</h1>
          <p className="font-body-md text-xs text-neutral-400">
            Your assessment responses have been securely recorded.
          </p>
        </div>

        <div className="p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center py-2.5 border-b border-black/5">
              <span className="font-label-caps text-xs text-neutral-500 uppercase tracking-wider">Exam Title</span>
              <span className="font-serif text-base text-brand-dark font-bold text-right max-w-[65%] line-clamp-1">
                {exam.title}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 border-b border-black/5">
              <span className="font-label-caps text-xs text-neutral-500 uppercase tracking-wider">Course</span>
              <span className="font-label-caps text-xs text-brand-dark font-bold uppercase tracking-wider">
                {exam.class_name}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 border-b border-black/5">
              <span className="font-label-caps text-xs text-neutral-500 uppercase tracking-wider">Submission ID</span>
              <span className="font-code-input text-xs text-neutral-600">
                {exam.attempt.id.split('-')[0].toUpperCase()}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 border-b border-black/5">
              <span className="font-label-caps text-xs text-neutral-500 uppercase tracking-wider">Submitted At</span>
              <span className="font-body-md text-xs text-brand-dark font-medium">
                {completedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 border-b border-black/5">
              <span className="font-label-caps text-xs text-neutral-500 uppercase tracking-wider">Status</span>
              <span className={`font-label-caps text-xs font-bold uppercase tracking-wider ${
                exam.attempt.status === 'evaluated' ? 'text-black' : 'text-brand-crimson'
              }`}>
                {exam.attempt.status === 'evaluated' ? 'EVALUATION COMPLETED' : 'AWAITING EVALUATION'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <Link
              href={`/student/exams/${exam.id}/result`}
              className="w-full py-3.5 bg-brand-crimson text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold hover:bg-brand-dark transition-all text-center"
            >
              VIEW RESULTS BREAKDOWN →
            </Link>

            <Link
              href="/student/dashboard"
              className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-brand-dark font-label-caps text-xs tracking-wider uppercase font-bold transition-all text-center border border-black/10"
            >
              Return to Student Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
