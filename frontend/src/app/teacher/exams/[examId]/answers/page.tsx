"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import {
  Exam, getExam,
  QuestionBank, getQuestionBank,
  AnswerBank, getAnswerBank,
  getAnswerGenerationStatus, generateAnswers,
  editAnswer, regenerateAnswer, regenerateAllAnswers, approveAnswerBank
} from "@/app/lib/exams";
import EditableAnswerCard from "@/app/components/EditableAnswerCard";

export default function AnswersPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [paper, setPaper] = useState<QuestionBank | null>(null);
  const [answerBank, setAnswerBank] = useState<AnswerBank | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStale, setIsStale] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [genStats, setGenStats] = useState({ total: 0, generated: 0, failed: 0 });
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "teacher") {
      router.push("/teacher/login");
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token || !examId) return;

    async function fetchData() {
      try {
        const ex = await getExam(token!, examId);
        setExam(ex);

        // Fetch paper to display questions
        const pb = await getQuestionBank(token!, examId);
        setPaper(pb);

        // Check if generation is ongoing
        const status = await getAnswerGenerationStatus(token!, examId);
        if (status.status === "generating") {
          setGenerating(true);
          setProgress(status.progress || 0);
          setGenStats({ total: status.total_questions, generated: status.generated_questions, failed: status.failed_questions });
          pollGeneration(token!, examId);
          return;
        }

        try {
          const ab = await getAnswerBank(token!, examId);
          setAnswerBank(ab);

          if (ab.question_bank_version !== pb.version) {
             setIsStale(true);
          }
        } catch (e) {
          // No answer bank yet, show generation UI
          setAnswerBank(null);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load answer data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, examId]);

  function pollGeneration(t: string, eId: string) {
    const interval = setInterval(async () => {
      try {
        const status = await getAnswerGenerationStatus(t, eId);
        if (status.status === "generating") {
          setProgress(status.progress || 0);
          setGenStats({ total: status.total_questions, generated: status.generated_questions, failed: status.failed_questions });
        } else if (status.status === "generated") {
          clearInterval(interval);
          setGenerating(false);
          const ab = await getAnswerBank(t, eId);
          setAnswerBank(ab);
          setIsStale(false);
        } else if (status.status === "failed") {
          clearInterval(interval);
          setGenerating(false);
          setError("Answer generation failed. Please try again.");
        }
      } catch {
        // ignore fetch errors during polling
      }
    }, 2000);
  }

  async function handleGenerateAnswers() {
    if (!token) return;
    setGenerating(true);
    setProgress(0);
    setError("");
    try {
      await generateAnswers(token, examId);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to start generation");
    }
  }

  async function handleRegenerateAll(mode: "all" | "unedited") {
    if (!token) return;
    if (mode === "all" && !confirm("Regenerate all answers? This will overwrite manual edits.")) return;
    setGenerating(true);
    setProgress(0);
    setError("");
    try {
      await regenerateAllAnswers(token, examId, mode);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to start regeneration");
    }
  }

  async function handleApprove() {
    if (!token || !answerBank || !paper) return;
    
    // Validation
    const allQuestions = paper.question_body.sections.flatMap(s => s.questions);
    const hasMissing = allQuestions.some(q => !answerBank.answer_body.find(a => a.question_id === q.question_id));
    if (hasMissing) {
      alert("Cannot approve. Some questions are missing answers.");
      return;
    }
    const hasFailed = answerBank.answer_body.some(a => a.answer_key === null && a.answer_type === 'mcq');
    if (hasFailed) {
      alert("Cannot approve. Some MCQ answers are missing options.");
      return;
    }

    try {
      await approveAnswerBank(token, examId);
      alert("Answer Key approved successfully! The exam is now READY.");
      router.push("/teacher/dashboard");
    } catch (e: any) {
      alert(e.message || "Failed to approve answer key");
    }
  }

  async function handleEditSave(answerId: string, updates: any) {
    if (!token || !answerBank) return;
    try {
      await editAnswer(token, examId, answerId, updates);
      setAnswerBank(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          answer_body: prev.answer_body.map(a => 
            a.answer_id === answerId ? { ...a, ...updates, is_edited: true } : a
          )
        };
      });
    } catch (e: any) {
      alert(e.message || "Failed to edit answer");
    }
  }

  async function handleRegenerateAnswer(answerId: string) {
    if (!token || !answerBank) return;
    setRegeneratingIds(prev => new Set(prev).add(answerId));
    try {
      const newAns = await regenerateAnswer(token, examId, answerId);
      setAnswerBank(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          answer_body: prev.answer_body.map(a => a.answer_id === answerId ? newAns : a)
        };
      });
    } catch (e: any) {
      alert(e.message || "Failed to regenerate answer");
    } finally {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(answerId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#2563eb] rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-slate-900 font-bold text-xl mb-1">Loading Answers...</h2>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-fade-up">
        <div className="w-full max-w-[500px] bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1 bg-[#2563eb] transition-all duration-300" style={{ width: `${progress}%` }} />

          <div className="w-16 h-16 bg-[#2563eb]/10 text-[#2563eb] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
          </div>

          <h2 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-2">Generating Answer Key</h2>
          <p className="text-slate-500 mb-8 max-w-[300px] mx-auto text-sm leading-relaxed">
            Please wait while the AI generates model answers for your question paper.
          </p>

          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-3 border border-slate-200/50">
            <div className="bg-[#2563eb] h-full transition-all duration-500 ease-out rounded-r-full" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="text-[#2563eb] animate-pulse">
              {genStats.generated} / {genStats.total} Answers Generated
            </span>
            <span className="text-slate-500">{progress}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) return <div className="p-8 text-red-600">Exam not found.</div>;
  if (!paper) return <div className="p-8 text-red-600">Please generate the paper first.</div>;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Answer Key Viewer</h2>
          <p className="text-slate-600 text-[0.9rem]">Review, edit, and approve the official answers</p>
        </div>

        {answerBank && !generating && (
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[0.9rem] font-bold rounded-md shadow-sm transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.84-10.36L2 2" /></svg>
                Regenerate
              </button>
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 flex flex-col p-1">
                <button onClick={() => handleRegenerateAll("unedited")} className="px-3 py-2 text-sm text-left hover:bg-slate-50 text-slate-700 font-medium rounded">Regenerate Only Unedited</button>
                <button onClick={() => handleRegenerateAll("all")} className="px-3 py-2 text-sm text-left hover:bg-slate-50 text-red-600 font-medium rounded">Regenerate All</button>
              </div>
            </div>
            
            <button
              onClick={handleApprove}
              className="px-6 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white text-[0.9rem] font-bold rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Approve Answer Key &rarr;
            </button>
          </div>
        )}
      </div>

      {isStale && answerBank && !generating && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-4 animate-fade-in">
          <div className="text-amber-500 mt-0.5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <div>
            <h4 className="text-amber-800 font-bold mb-1">Stale Answers Warning</h4>
            <p className="text-amber-700 text-[0.9rem]">
              The question paper was modified after this answer key was generated.
              Some answers might be out of sync. Please review or regenerate the answer key.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-8 flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <div>
              <p className="font-bold mb-1">Generation Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {!answerBank ? (
          !generating && (
            <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">No Answers Generated Yet</h2>
              <p className="text-slate-500 mb-6 text-sm max-w-[300px] mx-auto">
                Generate the official answer key for this exam using the AI model.
              </p>
              <button onClick={handleGenerateAnswers}
                className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-md font-semibold shadow-sm transition-colors">
                Generate Answers Now
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-10">
            {paper.question_body.sections.map((section) => (
              <div key={section.sectionNo} className="animate-fade-up">
                {paper.question_body.sections.length > 1 && (
                  <h3 className="font-bold text-xl text-slate-900 mb-6 pb-2 border-b border-slate-200">
                    Section {section.sectionNo}: {section.sectionName}
                  </h3>
                )}

                {section.questions.length === 0 ? (
                  <div className="text-center text-slate-500 italic text-sm">No questions in this section.</div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {section.questions.map((q) => {
                      const ans = answerBank.answer_body.find(a => a.question_id === q.question_id);
                      return (
                        <EditableAnswerCard
                          key={q.question_id}
                          question={q}
                          answer={ans}
                          isRegenerating={regeneratingIds.has(ans?.answer_id || "")}
                          onSave={async (updates) => {
                            if (ans) await handleEditSave(ans.answer_id, updates);
                          }}
                          onRegenerate={async () => {
                            if (ans) await handleRegenerateAnswer(ans.answer_id);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
