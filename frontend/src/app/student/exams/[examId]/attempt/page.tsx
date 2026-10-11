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
import Badge from "@/app/components/Badge";
import Modal from "@/app/components/Modal";
import { toast } from "sonner";

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
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      toast.error("Navigation disabled: Complete or submit your exam to exit.", { duration: 4000 });
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
        setIsTimeLow(diff < 5 * 60 * 1000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [exam]);

  // Auto-submit on deadline
  useEffect(() => {
    if (deadlineReached && !submitting) {
      toast.warning("Time limit expired. Auto-submitting exam...");
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
    }, 2000);

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
      toast.success("Exam submitted successfully");
      router.replace(`/student/exams/${exam.id}/submitted`);
    } catch (err: any) {
      toast.error("Submission failed: " + err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-grid border-t-[#FF3366] rounded-full animate-spin mx-auto mb-4" />
          <h2 className="font-serif text-2xl text-graphite font-semibold mb-1">Loading Exam Sheet...</h2>
          <span className="font-mono text-xs text-graphite/50 tracking-widest uppercase">STUDENT // TEST_INITIALIZE</span>
        </div>
      </div>
    );
  }

  if (error || !exam || !paper) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="bg-surface border border-grid rounded-xl p-8 max-w-md w-full shadow-lg text-center">
          <Badge variant="danger" className="mb-4">ERROR</Badge>
          <h2 className="font-serif text-2xl font-semibold text-graphite mb-2">Examination Error</h2>
          <p className="font-sans text-graphite/60 text-sm mb-6">{error || "Could not load exam paper data"}</p>
          <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2.5 bg-graphite text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-md">
            Return to Portal
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
    <div className="min-h-screen bg-paper flex flex-col font-sans">
      {/* ── Top Bar ── */}
      <header className="bg-surface border-b border-grid px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold text-graphite leading-tight">{exam.title}</h1>
            <Badge variant="student">{exam.class_name}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[0.72rem] tracking-wider text-graphite/50 uppercase">
              {saving ? "SYNCING..." : lastSavedTime ? `SAVED // ${lastSavedTime.toLocaleTimeString()}` : "AUTOSAVE READY"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-base font-bold border transition-colors ${
            isTimeLow ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse' : 'bg-paper text-graphite border-grid'
          }`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            {timeLeftStr || "--:--:--"}
          </div>

          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="px-5 py-2 bg-[#FF3366] hover:bg-[#FF3366]/90 text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-md shadow-xs transition-colors"
          >
            Submit Paper
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar (Navigation) ── */}
        <aside className="w-[300px] bg-surface border-r border-grid flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-grid bg-paper/40">
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-graphite mb-2">Paper Completion</div>
            <div className="w-full bg-grid h-2 rounded-full overflow-hidden mb-2">
              <div
                className="bg-[#FF3366] h-full transition-all duration-500"
                style={{ width: `${Math.round((answeredCount / totalQuestions) * 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between font-mono text-[0.7rem] text-graphite/60 font-semibold uppercase">
              <span>{answeredCount} Answered</span>
              <span>{totalQuestions - answeredCount} Pending</span>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-6">
            {paper.sections.map((sec, sIdx) => (
              <div key={sec.sectionNo}>
                <div className="font-mono text-[0.7rem] font-bold uppercase tracking-widest text-graphite/60 mb-3">
                  SECTION {sec.sectionNo}: {sec.sectionName}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {sec.questions.map((q, qIdx) => {
                    const isAnswered = !!answers[q.question_id];
                    const isReview = reviewFlags[q.question_id];
                    const isActive = activeSectionIdx === sIdx && activeQuestionIdx === qIdx;

                    let bg = "bg-paper border-grid text-graphite/70 hover:border-graphite";
                    if (isActive) bg = "bg-[#FF3366]/10 border-[#FF3366] text-[#FF3366] font-bold ring-1 ring-[#FF3366]";
                    else if (isReview) bg = "bg-amber-50 border-amber-300 text-amber-800";
                    else if (isAnswered) bg = "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold";

                    return (
                      <button
                        key={q.question_id}
                        onClick={() => {
                          setActiveSectionIdx(sIdx);
                          setActiveQuestionIdx(qIdx);
                        }}
                        className={`w-10 h-10 rounded-md border flex items-center justify-center font-mono text-xs transition-all ${bg}`}
                      >
                        {qIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-grid bg-paper/60 font-mono text-[0.68rem] text-graphite/60 space-y-2 uppercase tracking-wider font-medium">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></div> Answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div> Marked for Review</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-paper border border-grid"></div> Unanswered</div>
          </div>
        </aside>

        {/* ── Main Question Sheet Area ── */}
        <main className="flex-1 p-8 overflow-y-auto relative">
          {activeQuestion && (
            <div className="max-w-4xl mx-auto bg-surface rounded-2xl shadow-xl border border-grid p-10 animate-fade-up">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-grid">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-paper border border-grid text-graphite font-mono font-bold flex items-center justify-center text-sm">
                    {activeQuestionIdx + 1}
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold uppercase tracking-widest text-graphite/60">
                      SECTION {activeSection.sectionNo}
                    </div>
                    <div className="font-mono text-[0.7rem] text-graphite/40 uppercase">{activeQuestion.type.replace('_', ' ')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Badge variant="neutral">
                    {activeQuestion.mark} {activeQuestion.mark > 1 ? 'MARKS' : 'MARK'}
                  </Badge>
                  <button
                    onClick={() => toggleReviewFlag(activeQuestion.question_id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-xs uppercase tracking-wider transition-colors ${
                      reviewFlags[activeQuestion.question_id] ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-paper text-graphite/60 border border-grid hover:text-graphite"
                    }`}
                  >
                    {reviewFlags[activeQuestion.question_id] ? "★ REVIEWED" : "☆ MARK REVIEW"}
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <div className="font-serif text-xl text-graphite leading-relaxed mb-8">
                {activeQuestion.question_text}
              </div>

              {/* Answer Input */}
              <div className="mb-8">
                {(activeQuestion.type === "mcq" || (activeQuestion.options && activeQuestion.options.length > 0 && activeQuestion.type !== "multiple_select")) && (
                  <div className="space-y-3 font-serif">
                    {activeQuestion.options?.map(opt => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          answers[activeQuestion.question_id] === opt.id
                            ? "border-[#FF3366] bg-[#FF3366]/5"
                            : "border-grid hover:border-graphite/40 bg-surface"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleAnswerChange(activeQuestion.question_id, opt.id);
                        }}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          answers[activeQuestion.question_id] === opt.id ? "border-[#FF3366]" : "border-grid"
                        }`}>
                          {answers[activeQuestion.question_id] === opt.id && <div className="w-2.5 h-2.5 rounded-full bg-[#FF3366]"></div>}
                        </div>
                        <span className="text-graphite text-lg">{opt.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {(!activeQuestion.options || activeQuestion.options.length === 0) && (!activeQuestion.type || !activeQuestion.type.includes("long")) && (
                  <input
                    type="text"
                    value={answers[activeQuestion.question_id] || ""}
                    onChange={(e) => handleAnswerChange(activeQuestion.question_id, e.target.value)}
                    placeholder="Type your response here..."
                    className="w-full p-4 rounded-xl border border-grid focus:border-[#FF3366] outline-none font-serif text-lg text-graphite bg-paper transition-colors"
                  />
                )}

                {(!activeQuestion.options || activeQuestion.options.length === 0) && activeQuestion.type && activeQuestion.type.includes("long") && (
                  <textarea
                    rows={6}
                    value={answers[activeQuestion.question_id] || ""}
                    onChange={(e) => handleAnswerChange(activeQuestion.question_id, e.target.value)}
                    placeholder="Type your detailed response here..."
                    className="w-full p-4 rounded-xl border border-grid focus:border-[#FF3366] outline-none font-serif text-lg text-graphite bg-paper transition-colors resize-y"
                  ></textarea>
                )}

                {answers[activeQuestion.question_id] && activeQuestion.options && activeQuestion.options.length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleAnswerChange(activeQuestion.question_id, null)}
                      className="font-mono text-xs uppercase tracking-wider text-graphite/40 hover:text-rose-600 transition-colors"
                    >
                      Clear Choice
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-6 border-t border-grid mt-10">
                <button
                  onClick={() => {
                    if (activeQuestionIdx > 0) setActiveQuestionIdx(i => i - 1);
                    else if (activeSectionIdx > 0) {
                      setActiveSectionIdx(i => i - 1);
                      setActiveQuestionIdx(paper.sections[activeSectionIdx - 1].questions.length - 1);
                    }
                  }}
                  disabled={activeSectionIdx === 0 && activeQuestionIdx === 0}
                  className="px-6 py-2.5 rounded-md font-mono text-xs uppercase tracking-wider text-graphite/70 bg-paper border border-grid hover:border-graphite disabled:opacity-40 transition-colors"
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
                  className="px-6 py-2.5 rounded-md font-mono text-xs uppercase tracking-wider font-semibold text-white bg-graphite hover:bg-graphite/90 disabled:opacity-40 shadow-xs transition-colors"
                >
                  Save & Next
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Submit Modal ── */}
      <Modal
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        title="Confirm Exam Submission"
        badge="FINAL // SUBMISSION"
        subtitle={`Answered ${answeredCount} of ${totalQuestions} questions.`}
      >
        <p className="font-sans text-graphite/80 text-sm leading-relaxed mb-6">
          Are you sure you want to finalize your exam submission? Once confirmed, your response paper will be locked for evaluation.
        </p>

        <div className="flex items-center gap-3 justify-end pt-4 border-t border-grid">
          <button
            onClick={() => setShowSubmitConfirm(false)}
            disabled={submitting}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider text-graphite/60 hover:text-graphite transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleFinalSubmit}
            disabled={submitting}
            className="px-6 py-2.5 font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[#FF3366] hover:bg-[#FF3366]/90 rounded-md transition-colors"
          >
            {submitting ? "Submitting..." : "Confirm & Submit"}
          </button>
        </div>
      </Modal>

      {/* Proctoring Components */}
      {exam && exam.attempt && (
        <>
          <WebcamProctor examId={exam.id} attemptId={exam.attempt.id} />
          <BrowserSecurity examId={exam.id} attemptId={exam.attempt.id} />
        </>
      )}
    </div>
  );
}
