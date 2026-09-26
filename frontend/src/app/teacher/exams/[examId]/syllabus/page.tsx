"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { getExam, updateExam, getAvailableSyllabuses, SyllabusAvailable, Exam, getExamBlueprint } from "@/app/lib/exams";
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
        const [exm, sylls, blueprint] = await Promise.all([
          getExam(token!, params.examId),
          getAvailableSyllabuses(token!),
          getExamBlueprint(token!, params.examId)
        ]);
        setExam(exm);
        // Only show syllabuses matching the exam's class
        setSyllabuses(sylls.filter(s => s.class_id === exm.class_id));
        setSelectedPdfs(new Set(exm.selected_pdf_ids || []));
        const blueprintExists = blueprint.sections && blueprint.sections.length > 0;
        setHasBlueprint(blueprintExists);
        setIsSyllabusLocked(blueprintExists);
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

  const togglePdf = (id: string) => {
    if (exam?.status === "published" || (hasBlueprint && isSyllabusLocked)) return;
    
    const next = new Set(selectedPdfs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPdfs(next);
    
    if (token) {
      debouncedSave(Array.from(next), token);
    }
  };

  const isPublished = exam?.status === "published";

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Loading Syllabus Options...</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Syllabus Selection</h2>
          <p className="text-slate-600 text-[0.9rem]">Choose the source materials for this exam</p>
        </div>
        
        <div className="text-sm font-medium">
          {saveStatus === "saving" && <span className="text-slate-500 flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-[#2563eb] animate-spin"></div> Saving...</span>}
          {saveStatus === "saved" && <span className="text-green-600">✓ Saved</span>}
          {saveStatus === "error" && <span className="text-red-500">⚠ Failed to save</span>}
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        {isPublished && (
          <div className="mb-6 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-semibold text-[0.9rem]">
            This exam is published. The syllabus cannot be modified.
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[1.1rem] font-bold text-slate-900">Select Syllabus Files</h3>
          {hasBlueprint && isSyllabusLocked && !isPublished && (
            <button
              onClick={() => {
                if (confirm("Changing syllabus will require you to regenerate the entire paper and all manual edits will be lost. Are you sure?")) {
                  setIsSyllabusLocked(false);
                }
              }}
              className="text-xs text-[#2563eb] hover:text-[#1d4ed8] font-bold uppercase tracking-wider bg-[#2563eb]/10 px-3 py-1 rounded-md"
            >
              Unlock Selection
            </button>
          )}
        </div>
        <p className="text-slate-500 text-[0.85rem] mb-6">Only processed syllabus files with topic extraction completed are shown.</p>
        
        {syllabuses.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-300 rounded-md text-center">
            <h4 className="text-slate-700 font-semibold mb-2">No Processed Syllabuses Found</h4>
            <p className="text-slate-500 text-sm">Upload and process a syllabus for this class before you can select it for an exam.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {syllabuses.map(pdf => {
              const isSelected = selectedPdfs.has(pdf.id);
              return (
                <div key={pdf.id} className={`border rounded-lg overflow-hidden transition-colors ${isSelected ? "border-[#2563eb] bg-[#2563eb]/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <label className="flex items-start gap-4 p-4 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="mt-1 w-5 h-5 text-[#2563eb] rounded border-slate-300 focus:ring-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed" 
                      checked={isSelected}
                      disabled={isPublished || (hasBlueprint && isSyllabusLocked)}
                      onChange={() => {
                        if (!isPublished) togglePdf(pdf.id);
                      }}
                    />
                    <div>
                      <div className="font-bold text-slate-800">{pdf.title}</div>
                      <div className="text-[0.8rem] text-slate-500 mt-0.5">{pdf.file_ref} &bull; Uploaded {new Date(pdf.created_at).toLocaleDateString()}</div>
                      
                      {/* Topic browser logic would go here if backend returns topic tree */}
                      {isSelected && (
                        <div className="mt-4 p-4 bg-white rounded-md border border-[#2563eb]/20 shadow-sm text-sm">
                          <p className="text-slate-600 italic">Topics will be available in the Blueprint step.</p>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-center pt-6 border-t border-slate-200 mt-8">
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/general`)}
            className="px-6 py-2.5 text-slate-600 font-semibold text-[0.95rem] hover:text-slate-900 transition-colors"
          >
            &larr; Back to General
          </button>
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/blueprint`)}
            disabled={selectedPdfs.size === 0}
            className="px-6 py-2.5 bg-[#2563eb] text-white font-bold text-[0.95rem] rounded-md hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Blueprint &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
