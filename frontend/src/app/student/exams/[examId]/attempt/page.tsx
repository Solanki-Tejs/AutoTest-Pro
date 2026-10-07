"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import {
  StudentExam,
  getAllStudentExams,
  getExamAttempt,
  getExamPaper,
  saveAnswers,
  submitExam
} from "@/app/lib/student_exams";
import WebcamProctor from "./WebcamProctor";
import BrowserSecurity from "./BrowserSecurity";

// Minimal types for the exam paper
type QuestionType = "mcq" | "short_answer" | "long_answer" | "multiple_select";

interface Option {
  id: string;
  text: string;
}

interface Question {
  question_id: string;
  question_text: string;
  type: QuestionType;
  mark: number;
  order: number;
  options?: Option[];
}

interface Section {
  sectionNo: string;
  sectionName: string;
  questions: Question[];
}

interface Paper {
  exam_id: string;
  version: number;
  sections: Section[];
}

interface AnswerRecord {
  question_id: string;
  answer: any;
}

export default function LiveExamPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>({});

  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const [timeLeftStr, setTimeLeftStr] = useState("");
  const [isTimeLow, setIsTimeLow] = useState(false);
  const [deadlineReached, setDeadlineReached] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const answersRef = useRef(answers);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Auth & Initial load
  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "student") {
      router.push("/student/login");
      return;
    }
    setToken(t);
  }, [router]);

  // Prevent Navigation / Lock down
  useEffect(() => {
    // Push an extra state to trap the back button
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      // Push the state again to keep them on this page
      window.history.pushState(null, "", window.location.href);
      alert("You cannot leave the exam until it is submitted or the time expires.");
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have an exam in progress. Are you sure you want to leave?";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    async function loadData() {
      try {
        const exams = await getAllStudentExams(token!);
        const found = exams.find(e => e.id === examId);

        if (!found) throw new Error("Exam not found");
        if (!found.attempt || found.attempt.status === "submitted" || found.attempt.status === "evaluated") {
          router.replace(`/student/exams/${examId}/submitted`);
          return;
        }

        setExam(found);

        const paperData = await getExamPaper(token!, examId);
        setPaper(paperData);

        // Load previously saved answers from backend
        try {
          const attemptData = await getExamAttempt(token!, examId);
          if (attemptData.saved_answers && Array.isArray(attemptData.saved_answers)) {
            const initialAnswers: Record<string, any> = {};
            attemptData.saved_answers.forEach((ans: any) => {
              if (ans.question_id && ans.answer !== undefined) {
                initialAnswers[ans.question_id] = ans.answer;
              }
            });
            setAnswers(initialAnswers);
          }
        } catch (attemptErr) {
          console.error("Failed to load saved answers", attemptErr);
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load exam data");
        setLoading(false);
      }
    }

    loadData();
  }, [token, examId, router]);

  // Timer logic
  useEffect(() => {
    if (!exam || !exam.attempt) return;

    const deadlineStr = exam.attempt.deadline;
    const deadline = new Date(deadlineStr.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? deadlineStr : deadlineStr + 'Z').getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = deadline - now;

      if (diff <= 0) {
        clearInterval(interval);
        setTimeLeftStr("00:00:00");
        setDeadlineReached(true);
      } else {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeftStr(
          `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        );
        setIsTimeLow(diff < 5 * 60 * 1000); // Less than 5 mins
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [exam]);

  // Auto-submit on deadline
  useEffect(() => {
    if (deadlineReached && !submitting) {
      handleFinalSubmit();
    }
  }, [deadlineReached]);

  // Auto-save logic
  const handleSaveAnswers = useCallback(async (currentAnswers: Record<string, any>) => {
    if (!token || !exam || !exam.attempt) return;
    setSaving(true);
    try {
      const answerArr: AnswerRecord[] = Object.entries(currentAnswers).map(([qid, ans]) => ({
        question_id: qid,
        answer: ans
      }));
      await saveAnswers(token, exam.id, exam.attempt.id, answerArr);
      setLastSavedTime(new Date());
    } catch (err) {
      console.error("Auto-save failed", err);
    } finally {
      setSaving(false);
    }
  }, [token, exam]);

  // Debounced save
  useEffect(() => {
    if (loading || !token || !exam) return;

    const handler = setTimeout(() => {
      if (Object.keys(answersRef.current).length > 0) {
        handleSaveAnswers(answersRef.current);
      }
    }, 2000); // 2s debounce

    return () => clearTimeout(handler);
  }, [answers, loading, token, exam, handleSaveAnswers]);


  const handleFinalSubmit = async () => {
    if (!token || !exam) return;
    setSubmitting(true);

    try {
      const answerArr: AnswerRecord[] = Object.entries(answersRef.current).map(([qid, ans]) => ({
        question_id: qid,
        answer: ans
      }));
      await submitExam(token, exam.id, answerArr);
      router.replace(`/student/exams/${exam.id}/submitted`);
    } catch (err: any) {
      alert("Submission failed: " + err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#6c63ff] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-slate-600 font-medium">Loading your exam paper...</div>
        </div>
      </div>
    );
  }

  if (error || !exam || !paper) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full shadow-sm text-center">
          <div className="text-red-500 mb-4 text-4xl">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error || "Could not load exam data"}</p>
          <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const activeSection = paper.sections[activeSectionIdx];
  const activeQuestion = activeSection?.questions[activeQuestionIdx];
  const totalQuestions = paper.sections.reduce((acc, sec) => acc + sec.questions.length, 0);
  const answeredCount = Object.keys(answers).length;

  const handleAnswerChange = (qId: string, val: any) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const toggleReviewFlag = (qId: string) => {
    setReviewFlags(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-[family-name:var(--font-geist-sans)]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{exam.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {exam.class_name}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {saving ? "Saving..." : lastSavedTime ? `Saved ${lastSavedTime.toLocaleTimeString()}` : "Ready"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold border ${isTimeLow ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            {timeLeftStr || "--:--:--"}
          </div>

          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="px-6 py-2.5 bg-[#6c63ff] hover:bg-[#5a52d5] text-white font-bold rounded-lg shadow-sm transition-colors"
          >
            Submit Exam
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar (Navigation) ── */}
        <aside className="w-[300px] bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-slate-100">
            <div className="text-sm font-bold text-slate-900 mb-3">Exam Progress</div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
              <div
                className="bg-green-500 h-full transition-all duration-500"
                style={{ width: `${Math.round((answeredCount / totalQuestions) * 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 font-semibold">
              <span>{answeredCount} Answered</span>
              <span>{totalQuestions - answeredCount} Pending</span>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-6">
            {paper.sections.map((sec, sIdx) => (
              <div key={sec.sectionNo}>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                  Section {sec.sectionNo}: {sec.sectionName}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {sec.questions.map((q, qIdx) => {
                    const isAnswered = !!answers[q.question_id];
                    const isReview = reviewFlags[q.question_id];
                    const isActive = activeSectionIdx === sIdx && activeQuestionIdx === qIdx;

                    let bg = "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100";
                    if (isActive) bg = "bg-blue-50 border-blue-400 text-blue-700 font-bold ring-2 ring-blue-400/20";
                    else if (isReview) bg = "bg-purple-50 border-purple-300 text-purple-700";
                    else if (isAnswered) bg = "bg-green-50 border-green-300 text-green-700";

                    return (
                      <button
                        key={q.question_id}
                        onClick={() => {
                          setActiveSectionIdx(sIdx);
                          setActiveQuestionIdx(qIdx);
                        }}
                        className={`w-10 h-10 rounded-md border flex items-center justify-center text-sm transition-all ${bg}`}
                      >
                        {qIdx + 1}
                        {isReview && <div className="absolute w-2 h-2 rounded-full bg-purple-500 -top-1 -right-1 border border-white"></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 space-y-2 font-medium">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div> Answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-100 border border-purple-300"></div> Marked for Review</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-slate-50 border border-slate-200"></div> Unanswered</div>
          </div>
        </aside>

        {/* ── Main Question Area ── */}
        <main className="flex-1 p-8 overflow-y-auto relative">
          {activeQuestion && (
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-10 animate-fade-in">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-lg">
                    {activeQuestionIdx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                      Section {activeSection.sectionNo}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">{activeQuestion.type.replace('_', ' ')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-sm font-bold bg-slate-100 px-3 py-1 rounded-md text-slate-600">
                    {activeQuestion.mark} Mark{activeQuestion.mark > 1 ? 's' : ''}
                  </div>
                  <button
                    onClick={() => toggleReviewFlag(activeQuestion.question_id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${reviewFlags[activeQuestion.question_id] ? "bg-purple-100 text-purple-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={reviewFlags[activeQuestion.question_id] ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    {reviewFlags[activeQuestion.question_id] ? "Reviewed" : "Mark for Review"}
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <div className="text-lg text-slate-900 leading-relaxed mb-8">
                {activeQuestion.question_text}
              </div>

              {/* Answer Input */}
              <div className="mb-8">
                {(activeQuestion.type === "mcq" || (activeQuestion.options && activeQuestion.options.length > 0 && activeQuestion.type !== "multiple_select")) && (
                  <div className="space-y-3">
                    {activeQuestion.options?.map(opt => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${answers[activeQuestion.question_id] === opt.id
                            ? "border-[#6c63ff] bg-[#6c63ff]/5"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        onClick={(e) => {
                          e.preventDefault(); // prevent double firing if nested input added later
                          handleAnswerChange(activeQuestion.question_id, opt.id);
                        }}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${answers[activeQuestion.question_id] === opt.id ? "border-[#6c63ff]" : "border-slate-300"
                          }`}>
                          {answers[activeQuestion.question_id] === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-[#6c63ff]"></div>}
                        </div>
                        <span className="text-slate-700 font-medium">{opt.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {activeQuestion.type === "multiple_select" && (
                  <div className="space-y-3">
                    {activeQuestion.options?.map(opt => {
                      const currAns = answers[activeQuestion.question_id] || [];
                      const isSelected = Array.isArray(currAns) && currAns.includes(opt.id);

                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? "border-[#6c63ff] bg-[#6c63ff]/5" : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          onClick={(e) => {
                            e.preventDefault();
                            let newArr = [...currAns];
                            if (!isSelected) newArr.push(opt.id);
                            else newArr = newArr.filter((id: string) => id !== opt.id);
                            handleAnswerChange(activeQuestion.question_id, newArr);
                          }}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-[#6c63ff] bg-[#6c63ff]" : "border-slate-300"
                            }`}>
                            {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                          </div>
                          <span className="text-slate-700 font-medium">{opt.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {(!activeQuestion.options || activeQuestion.options.length === 0) && (!activeQuestion.type || !activeQuestion.type.includes("long")) && (
                  <input
                    type="text"
                    value={answers[activeQuestion.question_id] || ""}
                    onChange={(e) => handleAnswerChange(activeQuestion.question_id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-[#6c63ff] outline-none text-slate-800 transition-colors"
                  />
                )}

                {(!activeQuestion.options || activeQuestion.options.length === 0) && activeQuestion.type && activeQuestion.type.includes("long") && (
                  <textarea
                    rows={6}
                    value={answers[activeQuestion.question_id] || ""}
                    onChange={(e) => handleAnswerChange(activeQuestion.question_id, e.target.value)}
                    placeholder="Type your detailed answer here..."
                    className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-[#6c63ff] outline-none text-slate-800 transition-colors resize-y"
                  ></textarea>
                )}

                {answers[activeQuestion.question_id] && activeQuestion.options && activeQuestion.options.length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleAnswerChange(activeQuestion.question_id, activeQuestion.type === "multiple_select" ? [] : null)}
                      className="text-sm font-semibold text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Clear Answer
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-10">
                <button
                  onClick={() => {
                    if (activeQuestionIdx > 0) setActiveQuestionIdx(i => i - 1);
                    else if (activeSectionIdx > 0) {
                      setActiveSectionIdx(i => i - 1);
                      setActiveQuestionIdx(paper.sections[activeSectionIdx - 1].questions.length - 1);
                    }
                  }}
                  disabled={activeSectionIdx === 0 && activeQuestionIdx === 0}
                  className="px-6 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <button
                  onClick={() => {
                    if (activeQuestionIdx < activeSection.questions.length - 1) setActiveQuestionIdx(i => i + 1);
                    else if (activeSectionIdx < paper.sections.length - 1) {
                      setActiveSectionIdx(i => i + 1);
                      setActiveQuestionIdx(0);
                    }
                  }}
                  disabled={activeSectionIdx === paper.sections.length - 1 && activeQuestionIdx === activeSection.questions.length - 1}
                  className="px-6 py-2.5 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                >
                  Save & Next
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Submit Confirmation Modal ── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl animate-fade-up">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Submit Exam?</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to submit your exam? You have answered <strong>{answeredCount}</strong> out of <strong>{totalQuestions}</strong> questions.
              Once submitted, you will not be able to change your answers.
            </p>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg font-bold text-white bg-[#6c63ff] hover:bg-[#5a52d5] shadow-sm transition-colors flex items-center gap-2"
              >
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Submitting...</>
                ) : "Confirm Submission"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Component */}
      {exam && exam.attempt && (
        <>
          <WebcamProctor examId={exam.id} attemptId={exam.attempt.id} />
          <BrowserSecurity examId={exam.id} attemptId={exam.attempt.id} />
        </>
      )}
    </div>
  );
}
