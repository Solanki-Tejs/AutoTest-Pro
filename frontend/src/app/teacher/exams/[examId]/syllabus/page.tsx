"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { getExam, updateExam, getAvailableSyllabuses, SyllabusAvailable, Exam, getExamBlueprint, getQuestionBank } from "@/app/lib/exams";
import debounce from "lodash/debounce";

export default function SyllabusStepPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [syllabuses, setSyllabuses] = useState<SyllabusAvailable[]>([]);
  const [selectedPdfs, setSelectedPdfs] = useState<Set<string>>(new Set());
  const [hasBlueprint, setHasBlueprint] = useState(false);
  const [isSyllabusLocked, setIsSyllabusLocked] = useState(false);
  const [isPaperApproved, setIsPaperApproved] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const u = getStoredUser();
    const t = getStoredToken();
    if (!u || u.role !== "teacher" || !t) {
      router.push("/teacher/login");
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const [exm, sylls, blueprint, qb] = await Promise.all([
          getExam(token!, params.examId),
          getAvailableSyllabuses(token!),
          getExamBlueprint(token!, params.examId),
          getQuestionBank(token!, params.examId).catch(() => null)
        ]);
        setExam(exm);
        setSyllabuses(sylls.filter(s => s.class_id === exm.class_id));
        setSelectedPdfs(new Set(exm.selected_pdf_ids || []));
        const blueprintExists = blueprint.sections && blueprint.sections.length > 0;
        setHasBlueprint(blueprintExists);
        setIsSyllabusLocked(blueprintExists);
        const paperApproved = exm.status === "ready" || exm.status === "published" || qb?.status === "approved";
        setIsPaperApproved(paperApproved);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, params.examId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(async (pdfIds: string[], t: string) => {
      setSaveStatus("saving");
      try {
        await updateExam(t, params.examId, {
          selected_pdf_ids: pdfIds
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        console.error(e);
        setSaveStatus("error");
      }
    }, 1000),
    [params.examId]
  );

  const isPublished = exam?.status === "published";
  const isLocked = isPaperApproved || isPublished;

  const togglePdf = (id: string) => {
    if (isLocked || (hasBlueprint && isSyllabusLocked)) return;
    
    const next = new Set(selectedPdfs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPdfs(next);
    
    if (token) {
      debouncedSave(Array.from(next), token);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center font-sans">
        <div className="w-10 h-10 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mx-auto mb-4" />
        <span className="font-mono text-xs text-secondary uppercase tracking-widest block">
          Loading Syllabus Repository...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              STEP 02
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              SOURCE CURRICULUM
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            Syllabus Selection
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            Choose institutional syllabus documents to supply source topics for question generation.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isLocked ? (
            <span className="font-mono text-xs text-[#005430] font-bold px-3 py-1 bg-[#e8f5e9] border border-[#81c784]/60 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              VIEW ONLY (LOCKED)
            </span>
          ) : (
            <>
              {saveStatus === "saving" && (
                <span className="font-mono text-xs text-secondary flex items-center gap-1.5 px-3 py-1 bg-surface-container border border-outline-variant">
                  <span className="w-2 h-2 rounded-full border border-black border-t-[#0047ff] animate-spin" />
                  SAVING...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="font-mono text-xs text-[#005430] font-bold px-3 py-1 bg-[#e8f5e9] border border-[#81c784]/60">
                  ✓ SAVED
                </span>
              )}
              {saveStatus === "error" && (
                <span className="font-mono text-xs text-[#ba1a1a] font-bold px-3 py-1 bg-[#ffdad6] border border-[#ba1a1a]/40">
                  ⚠ FAILED TO SAVE
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Box Card */}
      <div className="bg-surface-container-lowest p-6 md:p-8 border border-black shadow-[4px_4px_0px_#111111]">
        {isPublished ? (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            <span>THIS EXAM IS PUBLISHED. SYLLABUS SELECTION IS IMMUTABLE.</span>
          </div>
        ) : isPaperApproved ? (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 font-mono text-xs text-emerald-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-700">lock</span>
            <span>QUESTION PAPER IS APPROVED. CURRICULUM SELECTION IS LOCKED IN VIEW-ONLY MODE.</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between mb-4 pb-2 border-b border-outline-variant/60">
          <div>
            <h3 className="font-serif text-xl font-bold text-on-surface">Available Curriculum Documents</h3>
            <p className="font-mono text-xs text-secondary mt-0.5">
              Only processed files with confirmed topic extraction are active.
            </p>
          </div>
          {hasBlueprint && isSyllabusLocked && !isLocked && (
            <button
              onClick={() => {
                if (confirm("Changing syllabus will require you to regenerate the entire paper and all manual edits will be lost. Are you sure?")) {
                  setIsSyllabusLocked(false);
                }
              }}
              className="px-3 py-1 bg-surface border border-black font-mono text-[10px] text-[#0047ff] hover:bg-black hover:text-white uppercase tracking-widest font-bold transition-all shadow-[2px_2px_0px_#111111] cursor-pointer"
            >
              [UNLOCK SELECTION]
            </button>
          )}
        </div>
        
        {syllabuses.length === 0 ? (
          <div className="p-12 border border-dashed border-black bg-surface-container-low text-center">
            <span className="material-symbols-outlined text-4xl text-secondary mb-2">folder_off</span>
            <h4 className="font-serif text-lg font-bold text-on-surface mb-1">No Processed Syllabuses Found</h4>
            <p className="font-sans text-xs text-secondary max-w-md mx-auto">
              Please upload and process a syllabus document for this classroom in the dashboard before continuing.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {syllabuses.map(pdf => {
              const isSelected = selectedPdfs.has(pdf.id);
              return (
                <div 
                  key={pdf.id} 
                  onClick={() => {
                    if (!isLocked) togglePdf(pdf.id);
                  }}
                  className={`border transition-all p-5 flex items-start gap-4 ${
                    isLocked ? "cursor-default" : "cursor-pointer"
                  } ${
                    isSelected 
                      ? "border-black bg-[#dde1ff]/20 ring-2 ring-[#0047ff] shadow-[3px_3px_0px_#111111]" 
                      : "border-black bg-surface-container-low hover:bg-surface shadow-[2px_2px_0px_#111111]"
                  }`}
                >
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 accent-[#0047ff] border border-black rounded-none cursor-pointer disabled:cursor-not-allowed" 
                      checked={isSelected}
                      disabled={isLocked || (hasBlueprint && isSyllabusLocked)}
                      onChange={() => {}} // handled by parent div
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-sans text-base font-bold text-on-surface">{pdf.title}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 bg-surface border border-outline-variant text-secondary">
                        {isSelected ? "SELECTED FOR GENERATION" : "AVAILABLE"}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-secondary mt-1 flex items-center gap-3 flex-wrap">
                      <span>FILE: {pdf.file_ref}</span>
                      <span>•</span>
                      <span>UPLOADED: {new Date(pdf.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    {isSelected && (
                      <div className="mt-3 p-3 bg-surface-container-lowest border border-outline-variant font-mono text-xs text-[#0047ff] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Corpus indexed. Topics will populate the Section Blueprint in Step 3.</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex justify-between items-center pt-6 border-t border-black mt-8">
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/general`)}
            className="px-6 py-3 border border-black bg-surface text-on-surface hover:bg-black hover:text-white font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back to General</span>
          </button>
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/blueprint`)}
            disabled={selectedPdfs.size === 0}
            className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <span>Continue to Blueprint</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
