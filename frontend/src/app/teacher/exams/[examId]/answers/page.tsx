"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import {
  Exam, getExam, getExamBlueprint,
  QuestionBank, getQuestionBank,
  AnswerBank, getAnswerBank,
  getAnswerGenerationStatus, generateAnswers,
  editAnswer, regenerateAnswer, regenerateAllAnswers, approveAnswerBank
} from "@/app/lib/exams";
import EditableAnswerCard from "@/app/components/EditableAnswerCard";
import { toast } from "sonner";

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
  const [isPaperStale, setIsPaperStale] = useState(false);

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
        const [ex, blp] = await Promise.all([
          getExam(token!, examId),
          getExamBlueprint(token!, examId)
        ]);
        setExam(ex);

        // Fetch paper to display questions
        const pb = await getQuestionBank(token!, examId);
        setPaper(pb);

        if (pb.generation) {
          const bpVer = pb.generation.blueprint_version || 1;
          const pbSylls = [...(pb.generation.syllabus_ids || [])].sort();
          const exSylls = [...(ex.selected_pdf_ids || [])].sort();

          let paperMarks = 0;
          pb.question_body?.sections?.forEach(sec => {
            sec.questions?.forEach(q => paperMarks += (q.mark || 0));
          });

          if (bpVer !== blp.version || JSON.stringify(pbSylls) !== JSON.stringify(exSylls) || paperMarks !== ex.total_marks) {
            setIsPaperStale(true);
          }
        }

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
        setProgress(status.progress || 0);
        setGenStats({
          total: status.total_questions,
          generated: status.generated_questions,
          failed: status.failed_questions
        });

        if (status.status === "complete") {
          clearInterval(interval);
          setGenerating(false);
          const ab = await getAnswerBank(t, eId);
          setAnswerBank(ab);
          toast.success("Answer key generated successfully!");
        } else if (status.status === "error") {
          clearInterval(interval);
          setGenerating(false);
          setError(status.error || "Generation failed.");
          toast.error("Generation failed");
        }
      } catch (e) {
        clearInterval(interval);
        setGenerating(false);
      }
    }, 2000);
  }

  async function handleGenerateAnswers() {
    if (!token) return;
    setError("");
    setGenerating(true);
    setProgress(0);

    try {
      await generateAnswers(token, examId);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to start answer generation.");
      toast.error(e.message || "Failed to start generation");
    }
  }

  async function handleApprove() {
    if (!token || !answerBank) return;
    try {
      await approveAnswerBank(token, examId);
      toast.success("Answers approved successfully!");
      router.push(`/teacher/exams/${examId}/publish`);
    } catch (e: any) {
      toast.error(e.message || "Failed to approve answers");
    }
  }

  async function handleEditSave(answerId: string, updates: any) {
    if (!token || !answerBank) return;
    await editAnswer(token, examId, answerId, updates);
    setAnswerBank(prev => {
      if (!prev) return prev;
      const newAns = prev.answer_body.map(a => a.answer_id === answerId ? { ...a, ...updates, is_edited: true } : a);
      return { ...prev, answer_body: newAns };
    });
  }

  async function handleRegenerateAnswer(answerId: string) {
    if (!token || !answerBank) return;
    setRegeneratingIds(prev => new Set(prev).add(answerId));
    try {
      const newA = await regenerateAnswer(token, examId, answerId);
      setAnswerBank(prev => {
        if (!prev) return prev;
        const newAns = prev.answer_body.map(a => a.answer_id === answerId ? newA : a);
        return { ...prev, answer_body: newAns };
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate answer");
    } finally {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(answerId);
        return next;
      });
    }
  }

  async function handleRegenerateAll(mode: "unedited" | "all") {
    if (!token || !answerBank) return;
    if (mode === "all" && !confirm("This will overwrite all answers including your manual edits. Are you sure?")) {
      return;
    }
    setError("");
    setGenerating(true);
    setProgress(0);
    try {
      await regenerateAllAnswers(token, examId, mode);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to regenerate answers");
      toast.error(e.message || "Failed to regenerate");
    }
  }

  async function handleDownloadPDF() {
    const element = document.getElementById('answers-container');
    if (!element) return;
    
    const oldCursor = document.body.style.cursor;
    document.body.style.cursor = 'wait';
    const toastId = toast.loading("Generating PDF document...");

    try {
      // @ts-ignore
      const domtoimage = (await import('dom-to-image-more')).default;
      const { jsPDF } = await import('jspdf');

      const blocks = element.querySelectorAll('.pdf-block');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const usableWidth = pageWidth - 2 * margin;
      
      let currentY = margin;
      const scale = 2;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i] as HTMLElement;
        if (block.clientHeight === 0) continue;

        const dataUrl = await domtoimage.toPng(block, {
          quality: 1,
          bgcolor: '#ffffff',
          width: block.clientWidth * scale,
          height: block.clientHeight * scale,
          style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${block.clientWidth}px`,
            height: `${block.clientHeight}px`,
            margin: '0'
          }
        });

        const imgHeight = (block.clientHeight * usableWidth) / block.clientWidth;
        
        if (currentY + imgHeight > pageHeight - margin && currentY > margin) {
          pdf.addPage();
          currentY = margin;
        }
        
        pdf.addImage(dataUrl, 'PNG', margin, currentY, usableWidth, imgHeight);
        currentY += imgHeight + 6;
      }

      pdf.save(`${exam?.title || 'Exam'}_Answer_Key.pdf`);
      toast.success("PDF downloaded successfully", { id: toastId });
    } catch (e) {
      console.error("PDF generation failed", e);
      toast.error("Failed to generate PDF", { id: toastId });
    } finally {
      document.body.style.cursor = oldCursor;
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center font-sans">
        <div className="w-10 h-10 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mx-auto mb-4" />
        <span className="font-mono text-xs text-secondary uppercase tracking-widest block">
          Loading Official Answers...
        </span>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="py-12 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-[540px] bg-surface-container-lowest border border-black shadow-[6px_6px_0px_#111111] p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1.5 bg-[#0047ff] transition-all duration-300" style={{ width: `${progress}%` }} />

          <div className="w-16 h-16 bg-[#dde1ff] text-[#001257] border border-black flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-[32px] animate-spin">auto_fix_high</span>
          </div>

          <span className="px-2.5 py-1 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase mb-3 inline-block">
            SYNTHESIS RUNNER
          </span>

          <h2 className="font-serif text-3xl font-normal text-on-surface tracking-tight mb-2">
            Generating Answer Key
          </h2>
          <p className="font-sans text-secondary mb-8 max-w-[340px] mx-auto text-sm leading-relaxed">
            Synthesizing reference responses, grading keys, and evaluation criteria for each question.
          </p>

          <div className="w-full bg-surface-container h-3 border border-black overflow-hidden mb-4">
            <div className="bg-[#0047ff] h-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest font-bold">
            <span className="text-[#0047ff] animate-pulse">
              {genStats.generated} / {genStats.total} ANSWERS COMPILED
            </span>
            <span className="text-secondary">{progress}% COMPLETE</span>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) return <div className="p-8 text-[#ba1a1a] font-mono text-xs">EXAM_NOT_FOUND // 404</div>;
  if (!paper) return <div className="p-8 text-[#ba1a1a] font-mono text-xs">PLEASE GENERATE QUESTION PAPER FIRST.</div>;

  const isPublished = exam.status === "published";

  return (
    <div className="space-y-6">
      {/* Editorial Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              STEP 05
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              MODEL ANSWERS &amp; RUBRICS
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            Answer Key Viewer
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            Review, edit model answers, and establish authoritative evaluation rubrics.
          </p>
        </div>

        {answerBank && !generating && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleDownloadPDF}
              className="px-4 py-2.5 bg-surface-container-lowest hover:bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              <span>Download PDF</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-surface-container-lowest hover:bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
              title="Print model answer sheet"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print Answers</span>
            </button>

            <div className="relative group">
              <button
                disabled={isPublished}
                className="px-4 py-2.5 bg-surface-container-lowest hover:bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Regenerate</span>
              </button>
              {!isPublished && (
                <div className="absolute right-0 mt-1 w-56 bg-surface-container-lowest border border-black shadow-[4px_4px_0px_#111111] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 flex flex-col p-1.5">
                  <button 
                    onClick={() => handleRegenerateAll("unedited")} 
                    className="px-3 py-2 text-xs text-left font-mono font-bold hover:bg-surface text-on-surface transition-colors cursor-pointer"
                  >
                    Regenerate Only Unedited
                  </button>
                  <button 
                    onClick={() => handleRegenerateAll("all")} 
                    className="px-3 py-2 text-xs text-left font-mono font-bold hover:bg-[#ffdad6] text-[#ba1a1a] transition-colors cursor-pointer"
                  >
                    Regenerate All (Overwrite)
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleApprove}
              className="px-6 py-2.5 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{exam?.status === "published" ? "Publish Settings" : "Continue to Publish"}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        )}
      </div>

      {isPublished && answerBank && !generating && (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-start gap-3 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px] text-amber-700">lock</span>
          <div>
            <span className="font-bold">[LOCKED NOTICE]:</span> This exam has been published. The answer key is finalized and cannot be modified.
          </div>
        </div>
      )}

      {isPaperStale && paper && !isPublished && !generating && (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-start gap-3 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
          <div>
            <span className="font-bold">[STALE NOTICE]:</span> The blueprint or syllabus was modified after paper generation. Regenerate paper to sync.
          </div>
        </div>
      )}

      {isStale && !isPaperStale && answerBank && !isPublished && !generating && (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-start gap-3 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
          <div>
            <span className="font-bold">[SYNC REQUIRED]:</span> The question paper was modified after this answer key was compiled. Review or regenerate answers.
          </div>
        </div>
      )}

      <div className="max-w-[850px] mx-auto px-6 py-4 print:p-0">
        {error && (
          <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#93000a] font-mono text-xs mb-8 flex items-center gap-2 print:hidden">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {!answerBank ? (
          !generating && (
            <div className="text-center py-20 bg-surface-container-lowest border border-black shadow-[4px_4px_0px_#111111] print:hidden">
              <div className="w-16 h-16 bg-surface border border-black flex items-center justify-center mx-auto mb-4 font-mono text-2xl">
                📝
              </div>
              <h2 className="font-serif text-2xl font-bold text-on-surface mb-2">No Answers Generated Yet</h2>
              <p className="font-sans text-secondary mb-6 text-sm max-w-[340px] mx-auto">
                Generate the official answer key and evaluation rubric using automated intelligence.
              </p>
              <button 
                onClick={handleGenerateAnswers}
                className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Generate Answers Now</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          )
        ) : (
          <div id="answers-container" className="bg-surface shadow-2xl mx-auto border border-grid min-h-[1100px] p-12 sm:p-16 font-serif text-black print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full">
            <div className="text-center mb-10 pdf-block border-b border-grid/80 pb-8">
              <span className="font-mono text-[0.7rem] uppercase tracking-widest text-graphite/50 block mb-2">
                OFFICIAL RUBRIC &amp; ANSWER REPOSITORY
              </span>
              <h1 className="text-xl sm:text-2xl font-bold uppercase mb-2">{exam.title}</h1>
              <div className="text-lg mb-1 text-graphite/80">{exam.class_name}</div>
            </div>

            <div className="flex flex-col gap-8 mt-8">
              {paper.question_body.sections.map((section) => (
                <div key={section.sectionNo} className="animate-fade-up break-inside-avoid">
                  {paper.question_body.sections.length > 1 && (
                    <div className="font-mono text-xs font-bold uppercase tracking-widest text-graphite/70 mb-6 pb-2 border-b border-grid/60 pdf-block">
                      SECTION // {section.sectionNo}
                    </div>
                  )}

                  {section.questions.length === 0 ? (
                    <div className="text-center text-slate-500 italic text-sm py-4">No questions in this section.</div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {section.questions.map((q) => {
                        const ans = answerBank.answer_body.find(a => a.question_id === q.question_id);
                        return (
                          <div key={q.question_id} className="pdf-block w-full bg-surface">
                            <EditableAnswerCard
                              question={q}
                              answer={ans}
                              isRegenerating={regeneratingIds.has(ans?.answer_id || "")}
                              disabled={isPublished}
                              onSave={async (updates) => {
                                if (ans) await handleEditSave(ans.answer_id, updates);
                              }}
                              onRegenerate={async () => {
                                if (ans) await handleRegenerateAnswer(ans.answer_id);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
