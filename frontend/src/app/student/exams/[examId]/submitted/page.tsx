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
      .then((exams) => {
        const found = exams.find((e) => e.id === examId);
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, examId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-[#111111]">
        GENERATING SECURE SUBMISSION RECEIPT...
      </div>
    );
  }

  if (error || !exam || !exam.attempt) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-6">
        <div className="bg-white border-2 border-black p-8 max-w-md w-full shadow-[6px_6px_0px_#111111] text-center">
          <div className="w-12 h-12 bg-black text-white flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[24px] text-brand-crimson">error</span>
          </div>
          <span className="font-mono text-[10px] text-brand-crimson tracking-[0.2em] uppercase font-bold block mb-1">
            SUBMISSION AUDIT
          </span>
          <h2 className="font-serif text-2xl font-bold text-[#111111] mb-2">Notice</h2>
          <p className="font-sans text-xs text-neutral-600 mb-6">{error || "Could not load submission receipt"}</p>
          <Link
            href="/student/dashboard"
            className="inline-block bg-[#111111] text-white font-mono text-xs uppercase tracking-widest font-bold py-3 px-6 hover:bg-brand-crimson border border-black transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const completedAtStr = exam.attempt.completed_at;
  const completedAt = completedAtStr
    ? new Date(completedAtStr.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? completedAtStr : completedAtStr + "Z")
    : new Date();

  const isPublished = Boolean(exam.attempt.result_published_at);

  return (
    <main className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-4 sm:p-6 font-sans text-[#111111]">
      <div className="bg-white border-2 border-black max-w-lg w-full shadow-[6px_6px_0px_#111111] overflow-hidden animate-fade-up">
        {/* Accent Bar & Header */}
        <div className="bg-[#111111] p-8 text-center text-white relative border-b-2 border-black">
          <div className="w-12 h-12 bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[28px] text-[#7afbb1]">task_alt</span>
          </div>
          <span className="font-mono text-[10px] text-brand-crimson tracking-[0.2em] uppercase font-bold block mb-1">
            EXAMINATION VAULT CONFIRMATION
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold mb-1">Paper Submitted Successfully</h1>
          <p className="font-sans text-xs text-neutral-400">
            Responses and biometric proctoring telemetry have been securely preserved.
          </p>
        </div>

        <div className="p-6 sm:p-8 flex flex-col gap-5">
          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex justify-between items-center py-2 border-b border-black/10">
              <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Assessment</span>
              <span className="font-bold text-[#111111] text-right max-w-[65%] truncate">
                {exam.title}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-black/10">
              <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Course Class</span>
              <span className="font-bold text-[#111111] uppercase tracking-wider">
                {exam.class_name}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-black/10">
              <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Submission ID</span>
              <span className="text-neutral-600">
                {exam.attempt.id.split("-")[0].toUpperCase()}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-black/10">
              <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Timestamp</span>
              <span className="text-[#111111] font-semibold">
                {completedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-black/10">
              <span className="text-neutral-500 uppercase tracking-wider text-[11px]">Review Status</span>
              <span className="px-2 py-0.5 bg-[#f3f3f3] border border-black/20 text-[#111111] font-bold uppercase text-[10px]">
                {isPublished ? "RESULTS PUBLISHED" : "AWAITING INSTRUCTOR PUBLICATION"}
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#f9f9f9] border border-black/15 text-neutral-600 font-sans text-xs flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[16px] text-brand-crimson shrink-0 mt-0.5">
              info
            </span>
            <span>
              {isPublished
                ? "Your official evaluated score and diagnostic review have been released by the educator."
                : "Your submission is undergoing AI evaluation. Per institutional integrity policy, results and diagnostic reviews become accessible only after release by your instructor."}
            </span>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            {isPublished && (
              <Link
                href={`/student/exams/${exam.id}/result`}
                className="w-full py-3.5 bg-brand-crimson hover:bg-black text-white font-mono text-xs tracking-[0.2em] uppercase font-bold transition-all text-center border border-black shadow-[3px_3px_0px_#111111]"
              >
                VIEW RESULTS BREAKDOWN →
              </Link>
            )}

            <Link
              href="/student/dashboard"
              className="w-full py-3.5 bg-[#111111] hover:bg-brand-crimson text-white font-mono text-xs tracking-[0.15em] uppercase font-bold transition-all text-center border border-black shadow-[3px_3px_0px_#111111]"
            >
              RETURN TO CANDIDATE DASHBOARD
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
