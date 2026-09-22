"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken, logout } from "@/app/lib/auth";
import {
  Exam, getExam, getExamBlueprint, Blueprint,
  QuestionBank, getQuestionBank,
  generatePaper, getGenerationStatus,
  editQuestion, regenerateQuestion, deleteQuestion, approveQuestionBank,
  Question
} from "@/app/lib/exams";
import EditableQuestionCard from "@/app/components/EditableQuestionCard";

export default function PaperEditorPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [paper, setPaper] = useState<QuestionBank | null>(null);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStale, setIsStale] = useState(false);
  
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState("");
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
        const [ex, blp] = await Promise.all([
          getExam(token!, examId),
          getExamBlueprint(token!, examId)
        ]);
        setExam(ex);
        setBlueprint(blp);

        // Check if generation is ongoing
        const status = await getGenerationStatus(token!, examId);
        if (status.status === "generating") {
          setGenerating(true);
          setProgress(status.progress || 0);
          setCurrentSection(status.current_section || "");
          pollGeneration(token!, examId);
          return;
        }

        try {
          const pb = await getQuestionBank(token!, examId);
          setPaper(pb);
          
          if (pb.generation) {
            const bpVer = pb.generation.blueprint_version || 1;
            const pbSylls = [...(pb.generation.syllabus_ids || [])].sort();
            const exSylls = [...(ex.selected_pdf_ids || [])].sort();
            if (bpVer !== blp.version || JSON.stringify(pbSylls) !== JSON.stringify(exSylls)) {
              setIsStale(true);
            }
          }
        } catch (e) {
          // No paper yet, show generation UI
          setPaper(null);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load exam");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, examId]);

  function pollGeneration(t: string, eId: string) {
    const interval = setInterval(async () => {
      try {
        const status = await getGenerationStatus(t, eId);
        if (status.status === "generating") {
          setProgress(status.progress || 0);
          setCurrentSection(status.current_section || "");
        } else if (status.status === "generated") {
          clearInterval(interval);
          setGenerating(false);
          const pb = await getQuestionBank(t, eId);
          setPaper(pb);
          setIsStale(false);
        } else if (status.status === "generation_failed") {
          clearInterval(interval);
          setGenerating(false);
          setError("Paper generation failed. Please try again.");
        }
      } catch {
        // ignore fetch errors during polling
      }
    }, 2000);
  }

  async function handleGenerateFullPaper() {
    if (!token) return;
    if (paper && !confirm("Regenerate Entire Paper? A new version will be generated using the current blueprint. Your current version will be preserved. Continue?")) {
      return;
    }
    setGenerating(true);
    setProgress(0);
    setCurrentSection("Starting...");
    setError("");
    try {
      await generatePaper(token, examId);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to start generation");
    }
  }

  async function handleApprove() {
    if (!token || !paper) return;
    // Basic frontend validation for required counts
    let valid = true;
    for (const sec of paper.question_body.sections) {
      if (sec.questions.length === 0) valid = false; // Add stricter count validation if blueprint is available
    }
    if (!valid && !confirm("Some sections may be incomplete. Approve anyway?")) {
      return;
    }

    try {
      await approveQuestionBank(token, examId);
      alert("Paper approved successfully!");
      router.push("/teacher/dashboard");
    } catch (e: any) {
      alert(e.message || "Failed to approve paper");
    }
  }

  async function handleEditSave(questionId: string, updates: Partial<Question>) {
    if (!token || !paper) return;
    await editQuestion(token, examId, questionId, updates);
    // Optimistic update
    setPaper(prev => {
      if (!prev) return prev;
      const newSecs = prev.question_body.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => q.question_id === questionId ? { ...q, ...updates, is_edited: true } : q)
      }));
      return { ...prev, question_body: { sections: newSecs } };
    });
  }

  async function handleRegenerateQuestion(questionId: string) {
    if (!token || !paper) return;
    setRegeneratingIds(prev => new Set(prev).add(questionId));
    try {
      const newQ = await regenerateQuestion(token, examId, questionId);
      setPaper(prev => {
        if (!prev) return prev;
        const newSecs = prev.question_body.sections.map(sec => ({
          ...sec,
          questions: sec.questions.map(q => q.question_id === questionId ? newQ : q)
        }));
        return { ...prev, question_body: { sections: newSecs } };
      });
    } catch (e: any) {
      alert(e.message || "Failed to regenerate question");
    } finally {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!token || !paper) return;
    try {
      await deleteQuestion(token, examId, questionId);
      setPaper(prev => {
        if (!prev) return prev;
        const newSecs = prev.question_body.sections.map(sec => ({
          ...sec,
          questions: sec.questions.filter(q => q.question_id !== questionId)
        }));
        return { ...prev, question_body: { sections: newSecs } };
      });
    } catch (e: any) {
      alert(e.message || "Failed to delete question");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#2563eb] rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-slate-900 font-bold text-xl mb-1">Loading Paper...</h2>
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
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </div>
          
          <h2 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-2">Generating Paper</h2>
          <p className="text-slate-500 mb-8 max-w-[300px] mx-auto text-sm leading-relaxed">
            Please wait while the AI analyzes your syllabus and creates questions based on your blueprint.
          </p>
          
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-3 border border-slate-200/50">
            <div className="bg-[#2563eb] h-full transition-all duration-500 ease-out rounded-r-full" style={{ width: `${progress}%` }} />
          </div>
          
          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="text-[#2563eb] animate-pulse">{currentSection}</span>
            <span className="text-slate-500">{progress}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) return <div className="p-8 text-red-600">Exam not found.</div>;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Paper Viewer</h2>
          <p className="text-slate-600 text-[0.9rem]">Review, edit, and approve the generated paper</p>
        </div>
        
        {paper && !generating && (
          <div className="flex items-center gap-3">
            <button 
              onClick={handleGenerateFullPaper}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[0.9rem] font-bold rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.84-10.36L2 2"/></svg>
              Regenerate All
            </button>
            <button 
              onClick={handleApprove}
              className="px-6 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white text-[0.9rem] font-bold rounded-md shadow-sm transition-colors flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Approve Paper &rarr;
            </button>
          </div>
        )}
      </div>

      {isStale && paper && !generating && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-4 animate-fade-in">
          <div className="text-amber-500 mt-0.5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          </div>
          <div>
            <h4 className="text-amber-800 font-bold mb-1">Stale Paper Warning</h4>
            <p className="text-amber-700 text-[0.9rem]">
              The blueprint or syllabus selection was modified after this paper was generated. 
              The current paper does not reflect your latest settings. Regenerate the paper to apply changes.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-8 flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <p className="font-bold mb-1">Generation Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {!paper ? (
          !generating && (
            <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">No Paper Generated Yet</h2>
              <p className="text-slate-500 mb-6 text-sm max-w-[300px] mx-auto">
                Generate the first version of this exam paper using your configured blueprint and syllabus documents.
              </p>
              <button onClick={handleGenerateFullPaper}
                className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-md font-semibold shadow-sm transition-colors">
                Generate Paper Now
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-10">
            {paper.question_body.sections.map((section) => (
              <div key={section.sectionNo} className="animate-fade-up">
                <div className="border-b-2 border-slate-200 pb-3 mb-6 flex justify-between items-end">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      Section {section.sectionNo} — {section.sectionName}
                    </h2>
                    <p className="text-slate-500 font-semibold text-sm mt-1">
                      {section.questions.length} Questions
                    </p>
                  </div>
                </div>

                {section.questions.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center">
                    <p className="text-slate-500 font-medium text-sm">No questions generated for this section.</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {section.questions.map((q) => (
                      <EditableQuestionCard
                        key={q.question_id}
                        question={q}
                        isRegenerating={regeneratingIds.has(q.question_id)}
                        onSave={(updates) => handleEditSave(q.question_id, updates)}
                        onRegenerate={() => handleRegenerateQuestion(q.question_id)}
                        onDelete={() => handleDeleteQuestion(q.question_id)}
                      />
                    ))}
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
