"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import {
  Exam, getExam, getExamBlueprint, Blueprint,
  QuestionBank, getQuestionBank,
  generatePaper, getGenerationStatus,
  editQuestion, regenerateQuestion, approveQuestionBank,
  Question
} from "@/app/lib/exams";
import EditableQuestionCard from "@/app/components/EditableQuestionCard";
import { toast } from "sonner";

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

            let paperMarks = 0;
            pb.question_body?.sections?.forEach(sec => {
              sec.questions?.forEach(q => paperMarks += (q.mark || 0));
            });

            if (bpVer !== blp.version || JSON.stringify(pbSylls) !== JSON.stringify(exSylls) || paperMarks !== ex.total_marks) {
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
        setProgress(status.progress || 0);
        setCurrentSection(status.current_section || "");

        if (status.status === "complete") {
          clearInterval(interval);
          setGenerating(false);
          const pb = await getQuestionBank(t, eId);
          setPaper(pb);
          toast.success("Exam paper generated successfully!");
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

  async function handleGenerateFullPaper() {
    if (!token) return;
    setError("");
    setGenerating(true);
    setProgress(0);
    setCurrentSection("Initializing AI models...");

    try {
      await generatePaper(token, examId);
      pollGeneration(token, examId);
    } catch (e: any) {
      setGenerating(false);
      setError(e.message || "Failed to start generation. Make sure Ollama is reachable.");
      toast.error(e.message || "Failed to start generation");
    }
  }

  async function handleApprove() {
    if (!token || !paper) return;
    let valid = true;
    for (const sec of paper.question_body.sections) {
      if (sec.questions.length === 0) valid = false;
    }
    if (!valid && !confirm("Some sections may be incomplete. Approve anyway?")) {
      return;
    }

    try {
      await approveQuestionBank(token, examId);
      toast.success("Paper approved successfully!");
      window.dispatchEvent(new CustomEvent("exam-updated"));
      router.push(`/teacher/exams/${examId}/answers`);
    } catch (e: any) {
      toast.error(e.message || "Failed to approve paper");
    }
  }

  async function handleEditSave(questionId: string, updates: Partial<Question>) {
    if (!token || !paper) return;
    await editQuestion(token, examId, questionId, updates);
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
      toast.error(e.message || "Failed to regenerate question");
    } finally {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  async function handleDownloadPDF() {
    const element = document.getElementById('paper-container');
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

      pdf.save(`${exam?.title || 'Exam'}_Paper.pdf`);
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
          Loading Exam Paper Sheet...
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
            <span className="material-symbols-outlined text-[32px] animate-spin">smart_toy</span>
          </div>

          <span className="px-2.5 py-1 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase mb-3 inline-block">
            SYNTHESIS RUNNER
          </span>

          <h2 className="font-serif text-3xl font-normal text-on-surface tracking-tight mb-2">
            Generating Question Paper
          </h2>
          <p className="font-sans text-secondary mb-8 max-w-[340px] mx-auto text-sm leading-relaxed">
            Neural models are synthesizing exam questions mapped directly against syllabus topics and blueprint rules.
          </p>

          <div className="w-full bg-surface-container h-3 border border-black overflow-hidden mb-4">
            <div className="bg-[#0047ff] h-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest font-bold">
            <span className="text-[#0047ff] animate-pulse">{currentSection || "Processing..."}</span>
            <span className="text-secondary">{progress}% COMPLETE</span>
          </div>
        </div>
      </div>
    );
  }

  if (!exam) return <div className="p-8 text-[#ba1a1a] font-mono text-xs">EXAM_NOT_FOUND // 404</div>;

  const isPublished = exam.status === "published";
  const isPaperApproved = paper?.status === "approved" || exam.status === "ready" || isPublished;
  const isLocked = isPaperApproved || isPublished;

  return (
    <div className="space-y-6">
      {/* Editorial Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              STEP 04
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              EXAMINATION PAPER SHEET
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            Paper Sheet Review
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            Review, edit inline, regenerate individual questions, and authorize the generated paper sheet.
          </p>
        </div>

        {paper && !generating && (
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
              title="Print question paper sheet"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print Paper</span>
            </button>
            <button
              onClick={handleGenerateFullPaper}
              disabled={isLocked}
              className="px-4 py-2.5 bg-surface-container-lowest hover:bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              <span>Regenerate All</span>
            </button>
            {isPaperApproved ? (
              <button
                onClick={() => router.push(`/teacher/exams/${examId}/answers`)}
                className="px-6 py-2.5 bg-[#005430] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Paper Approved • Proceed to Answers</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleApprove}
                disabled={isPublished}
                className="px-6 py-2.5 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Approve Paper</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            )}
          </div>
        )}
      </div>

      {isPublished ? (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-center gap-2 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>THIS EXAM IS PUBLISHED. QUESTION PAPER IS LOCKED AGAINST MODIFICATIONS.</span>
        </div>
      ) : isPaperApproved ? (
        <div className="p-4 bg-emerald-50 border border-emerald-300 font-mono text-xs text-emerald-900 flex items-center gap-2 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px] text-emerald-700">check_circle</span>
          <span>[PAPER APPROVED]: This examination paper has been authorized. Questions are locked in view-only mode.</span>
        </div>
      ) : null}

      {isStale && paper && !generating && (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-start gap-3 print:hidden shadow-[2px_2px_0px_#111111]">
          <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
          <div className="leading-relaxed">
            <span className="font-bold">[STALE NOTICE]:</span> The blueprint or syllabus selection was modified after this paper was generated. Regenerate to apply recent updates.
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#ffdad6] text-[#93000a] border border-[#ba1a1a] font-mono text-xs flex items-center gap-2 print:hidden">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {!paper ? (
        !generating && (
          <div className="text-center py-20 bg-surface-container-lowest border border-black shadow-[4px_4px_0px_#111111]">
            <div className="w-16 h-16 bg-surface border border-black flex items-center justify-center mx-auto mb-4 font-mono text-2xl">
              📑
            </div>
            <h2 className="font-serif text-2xl font-bold text-on-surface mb-2">No Paper Sheet Generated Yet</h2>
            <p className="font-sans text-secondary mb-6 text-sm max-w-[340px] mx-auto">
              Compile the first iteration using your configured blueprint rules and selected curriculum documents.
            </p>
            <button
              onClick={handleGenerateFullPaper}
              className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span>Generate Paper Now</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        )
      ) : (
        /* CRITICAL: DO NOT TOUCH THE QUESTION PAPER DESIGN WHICH DISPLAYS THE QUESTIONS */
        <div id="paper-container" className="bg-surface shadow-2xl mx-auto border border-grid max-w-[850px] min-h-[1100px] p-12 sm:p-16 font-serif text-graphite print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full">
          <div className="text-center mb-10 pdf-block border-b border-grid/80 pb-8">
            <span className="font-mono text-[0.7rem] uppercase tracking-widest text-graphite/50 block mb-2">
              OFFICIAL ASSESSMENT SHEET
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-2">{exam.title}</h1>
            <div className="text-lg text-graphite/80 font-medium mb-1">{exam.class_name}</div>

            <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest font-semibold mt-8 pt-4 border-t border-grid/60 text-graphite/70">
              <div>TIME DURATION: {exam.duration_minutes} MINS</div>
              <div>TOTAL MARKS: {exam.total_marks}</div>
            </div>
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
                  <div className="text-center text-graphite/40 italic font-mono text-xs py-4">No questions generated for this section.</div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {section.questions.map((q) => (
                      <div key={q.question_id} className="pdf-block w-full bg-surface">
                        <EditableQuestionCard
                          question={q}
                          disabled={isLocked}
                          isRegenerating={regeneratingIds.has(q.question_id)}
                          onSave={(updates) => handleEditSave(q.question_id, updates)}
                          onRegenerate={() => handleRegenerateQuestion(q.question_id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
