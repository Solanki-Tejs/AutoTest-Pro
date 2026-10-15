"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { fetchMyClasses, ClassItem } from "@/app/lib/classes";
import { getExam, updateExam, getExamBlueprint, getQuestionBank } from "@/app/lib/exams";
import debounce from "lodash/debounce";

export default function GeneralStepPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasBlueprint, setHasBlueprint] = useState(false);
  const [isTotalMarksLocked, setIsTotalMarksLocked] = useState(false);
  const [isPaperApproved, setIsPaperApproved] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    class_id: "",
    total_marks: "50",
    duration_minutes: "60",
    difficulty: "medium",
  });

  const [examStatus, setExamStatus] = useState<string>("draft");
  const [error, setError] = useState("");

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
        const [cls, exam, blueprint, qb] = await Promise.all([
          fetchMyClasses(token!),
          getExam(token!, params.examId),
          getExamBlueprint(token!, params.examId),
          getQuestionBank(token!, params.examId).catch(() => null)
        ]);
        setClasses(cls);
        setExamStatus(exam.status);
        const paperApproved = exam.status === "ready" || exam.status === "published" || qb?.status === "approved";
        setIsPaperApproved(paperApproved);
        const blueprintExists = blueprint.sections && blueprint.sections.length > 0;
        setHasBlueprint(blueprintExists);
        setIsTotalMarksLocked(blueprintExists);
        setFormData({
          title: exam.title,
          class_id: exam.class_id.toString(),
          total_marks: exam.total_marks.toString(),
          duration_minutes: exam.duration_minutes.toString(),
          difficulty: exam.difficulty,
        });
      } catch (err: any) {
        console.error("Failed to load exam data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, params.examId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(async (data: typeof formData, t: string) => {
      const tm = parseInt(data.total_marks);
      const dm = parseInt(data.duration_minutes);
      
      if (isNaN(tm) || tm <= 0 || isNaN(dm) || dm <= 0 || !data.title || !data.class_id) {
        setSaveStatus("idle");
        setError("Please enter valid, positive numbers for total marks and duration.");
        return;
      }
      
      setSaveStatus("saving");
      setError("");
      
      try {
        await updateExam(t, params.examId, {
          title: data.title,
          class_id: parseInt(data.class_id),
          total_marks: tm,
          duration_minutes: dm,
          difficulty: data.difficulty,
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e: any) {
        console.error(e);
        setSaveStatus("error");
        setError(e.message || "Failed to save");
      }
    }, 1000),
    [params.examId]
  );

  const isLocked = isPaperApproved || examStatus === "published";

  const handleChange = (field: keyof typeof formData, value: string) => {
    if (isLocked) return;
    
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    if (token) {
      debouncedSave(newData, token);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center font-sans">
        <div className="w-10 h-10 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mx-auto mb-4" />
        <span className="font-mono text-xs text-secondary uppercase tracking-widest block">
          Loading General Configuration...
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
              STEP 01
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              GENERAL CONFIGURATION
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            General Details
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            Configure primary attributes and runtime parameters for this examination.
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
                  ✓ AUTO-SAVED
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

      {/* Brutalist Box Form Container */}
      <div className="bg-surface-container-lowest p-6 md:p-8 border border-black shadow-[4px_4px_0px_#111111]">
        {examStatus === "published" ? (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            <span>THIS EXAM IS PUBLISHED. CORE ATTRIBUTES ARE LOCKED AGAINST MODIFICATION.</span>
          </div>
        ) : isPaperApproved ? (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 font-mono text-xs text-emerald-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-700">lock</span>
            <span>QUESTION PAPER IS APPROVED. CORE CONFIGURATION IS LOCKED IN VIEW-ONLY MODE.</span>
          </div>
        ) : null}
        {error && (
          <div className="mb-6 p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#93000a] font-mono text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 mb-8">
          {/* Exam Title */}
          <div>
            <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
              Exam Title <span className="text-[#0047ff]">*</span>
            </label>
            <input 
              required 
              disabled={isLocked}
              type="text" 
              placeholder="e.g. Database Management System Mid-Term"
              className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] focus:ring-1 focus:ring-[#0047ff] outline-none font-sans text-sm disabled:bg-[#efeded] disabled:text-[#747688] transition-colors"
              value={formData.title} 
              onChange={e => handleChange("title", e.target.value)} 
            />
          </div>
          
          {/* Assigned Class */}
          <div>
            <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
              Target Classroom <span className="text-[#0047ff]">*</span>
            </label>
            <select 
              required
              disabled={isLocked}
              className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] focus:ring-1 focus:ring-[#0047ff] outline-none font-sans text-sm disabled:bg-[#efeded] disabled:text-[#747688] transition-colors cursor-pointer"
              value={formData.class_id} 
              onChange={e => handleChange("class_id", e.target.value)}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          
          {/* Triplet Grid: Marks, Duration, Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                  Total Marks <span className="text-[#0047ff]">*</span>
                </label>
                {hasBlueprint && isTotalMarksLocked && !isLocked && (
                  <button
                    onClick={() => {
                      if (confirm("Changing total marks will require you to regenerate the entire paper and all manual edits will be lost. Are you sure?")) {
                        setIsTotalMarksLocked(false);
                      }
                    }}
                    className="font-mono text-[10px] text-[#0047ff] hover:underline font-bold uppercase tracking-widest cursor-pointer"
                  >
                    [UNLOCK]
                  </button>
                )}
              </div>
              <input 
                required 
                disabled={isLocked || (hasBlueprint && isTotalMarksLocked)}
                type="number" 
                min="1"
                className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] focus:ring-1 focus:ring-[#0047ff] outline-none font-mono text-sm font-bold disabled:bg-[#efeded] disabled:text-[#747688] transition-colors"
                value={formData.total_marks} 
                onChange={e => handleChange("total_marks", e.target.value)} 
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
                Duration (mins) <span className="text-[#0047ff]">*</span>
              </label>
              <input 
                required 
                disabled={isLocked}
                type="number" 
                min="1"
                className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] focus:ring-1 focus:ring-[#0047ff] outline-none font-mono text-sm font-bold disabled:bg-[#efeded] disabled:text-[#747688] transition-colors"
                value={formData.duration_minutes} 
                onChange={e => handleChange("duration_minutes", e.target.value)} 
              />
            </div>

            <div>
              <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
                Difficulty Level <span className="text-[#0047ff]">*</span>
              </label>
              <select 
                required
                disabled={isLocked}
                className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] focus:ring-1 focus:ring-[#0047ff] outline-none font-sans text-sm disabled:bg-[#efeded] disabled:text-[#747688] transition-colors cursor-pointer"
                value={formData.difficulty} 
                onChange={e => handleChange("difficulty", e.target.value)}
              >
                <option value="easy">Easy (Foundational)</option>
                <option value="medium">Medium (Standard)</option>
                <option value="hard">Hard (Advanced)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex justify-between items-center pt-6 border-t border-black mt-8">
          <span className="font-mono text-xs text-secondary">AUTO-SAVED CHANGES</span>
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/syllabus`)}
            className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span>Continue to Syllabus</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
