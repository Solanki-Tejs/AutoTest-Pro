"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { getExam, getExamBlueprint, saveExamBlueprint, Exam, Section } from "@/app/lib/exams";
import { SyllabusAvailable } from "@/app/lib/exams";
import debounce from "lodash/debounce";
import { toast } from "sonner";

export default function ExamBlueprintPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [syllabuses, setSyllabuses] = useState<SyllabusAvailable[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [version, setVersion] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [dbBlueprintMarks, setDbBlueprintMarks] = useState<number | null>(null);
  const [isPaperApproved, setIsPaperApproved] = useState(false);
  const [passingPercentage, setPassingPercentage] = useState<number>(40);

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
    if (!token || !examId) return;
    async function loadData() {
      try {
        const [exm, blp, sylls, qb] = await Promise.all([
          getExam(token!, examId),
          getExamBlueprint(token!, examId),
          import("@/app/lib/exams").then(m => m.getAvailableSyllabuses(token!)),
          import("@/app/lib/exams").then(m => m.getQuestionBank(token!, examId).catch(() => null))
        ]);
        setExam(exm);
        setSections(blp.sections || []);
        setVersion(blp.version || 1);
        const loadedPassPct = blp.passing_percentage ?? exm.passing_percentage ?? 40;
        setPassingPercentage(Number(loadedPassPct));
        const paperApproved = exm.status === "ready" || exm.status === "published" || qb?.status === "approved";
        setIsPaperApproved(paperApproved);

        const initialMarks = (blp.sections || []).reduce((acc: number, sec: any) => acc + ((parseInt(String(sec.count)) || 0) * (parseInt(String(sec.marks_each)) || 0)), 0);
        setDbBlueprintMarks(initialMarks);

        setSyllabuses(sylls.filter(s => exm.selected_pdf_ids.includes(s.id)));
      } catch (err: any) {
        setError(err.message || "Failed to load blueprint data");
        toast.error("Failed to load blueprint");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token, examId]);

  const configuredMarks = sections.reduce((acc, sec) => acc + ((parseInt(String(sec.count)) || 0) * (parseInt(String(sec.marks_each)) || 0)), 0);
  const examTotal = exam?.total_marks || 0;
  const remainingMarks = examTotal - configuredMarks;

  const isPublished = exam?.status === "published";
  const isLocked = isPaperApproved || isPublished;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(async (secs: Section[], currentMarks: number, t: string, v: number, passPct?: number) => {
      if (isLocked) return;
      const hasInvalidNumeric = secs.some(sec => {
        const c = parseInt(String(sec.count));
        const m = parseInt(String(sec.marks_each));
        return isNaN(c) || c <= 0 || isNaN(m) || m <= 0;
      });
      if (hasInvalidNumeric || currentMarks !== examTotal) {
        setSaveStatus("idle");
        if (hasInvalidNumeric) {
          setError("Count and Marks/Q must be positive numbers.");
        } else {
          setError("");
        }
        return;
      }
      setSaveStatus("saving");
      try {
        const newBlp = await saveExamBlueprint(t, examId, secs, v, passPct ?? passingPercentage);
        setVersion(newBlp.version || 1);
        setDbBlueprintMarks(currentMarks);
        setSaveStatus("saved");
        setError("");
        toast.success("Blueprint saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (err: any) {
        console.error(err);
        setSaveStatus("error");
        setError(err.message || "Failed to save");
        toast.error("Blueprint save failed");
      }
    }, 1000),
    [examId, examTotal, isLocked]
  );

  const triggerUpdate = (newSections: Section[]) => {
    if (isLocked) return;
    setSections(newSections);
    const newMarks = newSections.reduce((acc, sec) => acc + ((parseInt(String(sec.count)) || 0) * (parseInt(String(sec.marks_each)) || 0)), 0);
    if (token) {
      debouncedSave(newSections, newMarks, token, version, passingPercentage);
    }
  };

  const addSection = () => {
    if (isLocked) return;
    triggerUpdate([
      ...sections,
      { section: `Section ${String.fromCharCode(65 + sections.length)}`, type: "mcq", count: 1, marks_each: 1, order: sections.length }
    ]);
  };

  const updateSection = (index: number, field: keyof Section, value: any) => {
    if (isLocked) return;
    const next = [...sections];
    next[index] = { ...next[index], [field]: value };
    triggerUpdate(next);
  };

  const removeSection = (index: number) => {
    if (isLocked) return;
    triggerUpdate(sections.filter((_, i) => i !== index));
    toast.success("Section removed");
  };

  const handleGenerate = async () => {
    if (!token || isLocked) return;
    setError("");
    if (configuredMarks !== examTotal) {
      setError(`Configured marks (${configuredMarks}) must match exam total marks (${examTotal}).`);
      toast.error(`Marks mismatch: ${configuredMarks}/${examTotal}`);
      return;
    }

    setSaveStatus("saving");
    try {
      const newBlp = await saveExamBlueprint(token, examId, sections, version, passingPercentage);
      setVersion(newBlp.version || 1);
      const { generatePaper } = await import("@/app/lib/exams");
      await generatePaper(token, examId);
      toast.success("Paper generation started");
      router.push(`/teacher/exams/${examId}/paper`);
    } catch (err: any) {
      setError(err.message || "Failed to generate paper. Make sure Ollama is running.");
      setSaveStatus("error");
      toast.error(err.message || "Paper generation failed");
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center font-sans">
        <div className="w-10 h-10 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mx-auto mb-4" />
        <span className="font-mono text-xs text-secondary uppercase tracking-widest block">
          Loading Blueprint Schema...
        </span>
      </div>
    );
  }

  if (!exam) return <div className="p-8 text-[#ba1a1a] font-mono text-xs">EXAM_NOT_FOUND // 404</div>;

  return (
    <div className="space-y-6">
      {dbBlueprintMarks !== null && dbBlueprintMarks > 0 && dbBlueprintMarks !== examTotal && (
        <div className="p-4 bg-amber-50 text-amber-900 border border-amber-300 font-mono text-xs flex items-start gap-3">
          <span className="material-symbols-outlined text-[18px] text-amber-700">warning</span>
          <div>
            The exam's total marks were set to {examTotal}, but your blueprint currently totals {dbBlueprintMarks}. Adjust section counts to reach {examTotal} marks.
          </div>
        </div>
      )}

      {/* Editorial Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              STEP 03
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              BLUEPRINT SPECIFICATION // v{version}
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            Blueprint Architecture
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            Structure question sections, taxonomies, item frequencies, and mark allocations.
          </p>
        </div>

        {/* Marks Status Box */}
        <div className="flex items-center gap-4">
          <div className="bg-surface-container-lowest border border-black shadow-[3px_3px_0px_#111111] px-5 py-2.5 text-right">
            <span className="font-mono text-[10px] uppercase tracking-widest text-secondary block font-bold">
              CONFIGURED MARKS
            </span>
            <div className={`font-mono text-2xl font-bold leading-tight ${
              remainingMarks === 0 ? "text-[#005430]" : remainingMarks < 0 ? "text-[#ba1a1a]" : "text-[#0047ff]"
            }`}>
              {configuredMarks} <span className="text-secondary text-sm">/ {examTotal}</span>
            </div>
          </div>

          <div className="font-mono text-xs font-bold">
            {isLocked ? (
              <span className="font-mono text-xs text-[#005430] font-bold px-3 py-1 bg-[#e8f5e9] border border-[#81c784]/60 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                VIEW ONLY
              </span>
            ) : (
              <>
                {saveStatus === "saving" && (
                  <span className="text-secondary flex items-center gap-1.5 px-3 py-1 bg-surface-container border border-outline-variant">
                    <span className="w-2 h-2 rounded-full border border-black border-t-[#0047ff] animate-spin" />
                    SAVING
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="text-[#005430] px-3 py-1 bg-[#e8f5e9] border border-[#81c784]/60">
                    ✓ SAVED
                  </span>
                )}
                {saveStatus === "error" && (
                  <span className="text-[#ba1a1a] px-3 py-1 bg-[#ffdad6] border border-[#ba1a1a]/40">
                    ⚠ ERROR
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {isPublished ? (
        <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-amber-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>THIS EXAM IS PUBLISHED. BLUEPRINT CONFIGURATION IS LOCKED.</span>
        </div>
      ) : isPaperApproved ? (
        <div className="p-4 bg-emerald-50 border border-emerald-300 font-mono text-xs text-emerald-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-emerald-700">lock</span>
          <span>QUESTION PAPER IS APPROVED. BLUEPRINT SPECIFICATION IS LOCKED IN VIEW-ONLY MODE.</span>
        </div>
      ) : null}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sections Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold text-on-surface">Exam Sections</span>
              <span className="font-mono text-xs px-2 py-0.5 bg-black text-white font-bold">
                {sections.length} TOTAL
              </span>
            </div>
            <button
              onClick={addSection}
              disabled={isLocked}
              className="px-4 py-2 bg-surface hover:bg-black hover:text-white text-on-surface border border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Section</span>
            </button>
          </div>

          {error && (
            <div className="p-4 bg-[#ffdad6] text-[#93000a] border border-[#ba1a1a] font-mono text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="text-center py-16 px-8 bg-surface-container-lowest border border-dashed border-black shadow-[4px_4px_0px_#111111]">
              <span className="material-symbols-outlined text-4xl text-secondary mb-2">dashboard_customize</span>
              <h3 className="font-serif text-xl font-bold text-on-surface mb-1">No Sections Defined</h3>
              <p className="font-sans text-xs text-secondary mb-6 max-w-sm mx-auto">
                Add sections to establish questions types, marks per question, and frequency distribution.
              </p>
              <button 
                onClick={addSection} 
                disabled={isLocked} 
                className="px-6 py-2.5 bg-[#0047ff] text-white border border-black shadow-[3px_3px_0px_#111111] font-mono text-xs uppercase tracking-wider font-bold hover:bg-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add First Section
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, index) => (
                <div 
                  key={index} 
                  className="bg-surface-container-lowest border border-black p-6 shadow-[3px_3px_0px_#111111] relative"
                >
                  <button
                    onClick={() => removeSection(index)}
                    disabled={isLocked}
                    className="absolute top-4 right-4 w-7 h-7 border border-black bg-surface text-secondary hover:bg-[#ba1a1a] hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Section"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>

                  <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-secondary font-bold mb-1.5">
                        Section Label
                      </label>
                      <input
                        type="text"
                        value={section.section}
                        disabled={isLocked}
                        onChange={e => updateSection(index, "section", e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-black focus:border-[#0047ff] outline-none font-sans text-sm disabled:opacity-50"
                      />
                    </div>

                    <div className="col-span-6 md:col-span-3">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-secondary font-bold mb-1.5">
                        Question Type
                      </label>
                      <select
                        value={section.type}
                        disabled={isLocked}
                        onChange={e => updateSection(index, "type", e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-black focus:border-[#0047ff] outline-none font-sans text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <option value="mcq">MCQ (Objective)</option>
                        <option value="short">Short Conceptual</option>
                        <option value="long">Long Essay / Proof</option>
                        <option value="case_study">Case Analysis</option>
                      </select>
                    </div>

                    <div className="col-span-3 md:col-span-2">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-secondary font-bold mb-1.5">
                        Quantity
                      </label>
                      <input
                        type="number" min="1"
                        value={section.count}
                        disabled={isLocked}
                        onChange={e => updateSection(index, "count", e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-black focus:border-[#0047ff] outline-none font-mono text-sm font-bold text-center disabled:opacity-50"
                      />
                    </div>

                    <div className="col-span-3 md:col-span-2">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-secondary font-bold mb-1.5">
                        Marks / Q
                      </label>
                      <input
                        type="number" min="1"
                        value={section.marks_each}
                        disabled={isLocked}
                        onChange={e => updateSection(index, "marks_each", e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-black focus:border-[#0047ff] outline-none font-mono text-sm font-bold text-center disabled:opacity-50"
                      />
                    </div>

                    <div className="col-span-12 md:col-span-1 pb-2">
                      <div className="font-mono text-sm font-bold text-on-surface text-right">
                        = {(parseInt(String(section.count)) || 0) * (parseInt(String(section.marks_each)) || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Navigation Bar */}
          <div className="flex justify-between items-center pt-6 border-t border-black mt-6">
            <button
              onClick={() => router.push(`/teacher/exams/${examId}/syllabus`)}
              className="px-6 py-3 border border-black bg-surface text-on-surface hover:bg-black hover:text-white font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Syllabus</span>
            </button>
            {isPaperApproved ? (
              <button
                onClick={() => router.push(`/teacher/exams/${examId}/paper`)}
                className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>View Paper Sheet</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={isPublished || saveStatus === "saving" || remainingMarks !== 0}
                className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <span>Generate Paper</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Info Column (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-surface-container-lowest border border-black shadow-[3px_3px_0px_#111111] p-6">
            <h3 className="font-serif text-lg font-bold text-on-surface mb-4 pb-2 border-b border-black">
              Exam Summary
            </h3>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <span className="text-secondary uppercase tracking-widest block text-[10px] mb-1">
                  Classroom
                </span>
                <span className="text-on-surface font-bold font-sans text-sm">{exam.class_name}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-outline-variant/60">
                <div>
                  <span className="text-secondary uppercase tracking-widest block text-[10px] mb-1">
                    Duration
                  </span>
                  <span className="text-on-surface font-bold">{exam.duration_minutes} Mins</span>
                </div>
                <div>
                  <span className="text-secondary uppercase tracking-widest block text-[10px] mb-1">
                    Difficulty
                  </span>
                  <span className="text-on-surface font-bold capitalize">{exam.difficulty}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-black shadow-[3px_3px_0px_#111111] p-6">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-black">
              <h3 className="font-serif text-lg font-bold text-on-surface">
                Passing Benchmark
              </h3>
              <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[#0047ff] text-white">
                {passingPercentage}%
              </span>
            </div>

            <p className="font-sans text-xs text-secondary mb-4 leading-relaxed">
              Establish the minimum percentage required for candidates to receive an accredited Pass rating.
            </p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[33, 40, 50, 60].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    setPassingPercentage(pct);
                    if (token) debouncedSave(sections, configuredMarks, token, version, pct);
                  }}
                  className={`py-1.5 font-mono text-xs font-bold border border-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    passingPercentage === pct
                      ? "bg-black text-white shadow-[2px_2px_0px_#111111]"
                      : "bg-surface hover:bg-surface-container text-on-surface"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="block font-mono text-[10px] uppercase tracking-wider text-secondary font-bold mb-1.5">
                Custom Passing Threshold (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={passingPercentage}
                  disabled={isLocked}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(1, parseFloat(e.target.value) || 0));
                    setPassingPercentage(val);
                    if (token) debouncedSave(sections, configuredMarks, token, version, val);
                  }}
                  className="w-full px-3 py-2 bg-surface border border-black focus:border-[#0047ff] outline-none font-mono text-sm font-bold disabled:opacity-50 pr-8"
                />
                <span className="absolute right-3 top-2.5 font-mono text-xs text-secondary font-bold pointer-events-none">
                  %
                </span>
              </div>
            </div>

            <div className="p-3 bg-surface border border-outline-variant/60 font-mono text-xs text-secondary">
              <div className="flex justify-between items-center mb-1">
                <span>Passing Threshold:</span>
                <span className="font-bold text-on-surface">
                  {((examTotal * passingPercentage) / 100).toFixed(1)} / {examTotal} marks
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span>Rating:</span>
                <span className="text-[#005430] font-bold">
                  ≥ {passingPercentage}% = PASS
                </span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-black shadow-[3px_3px_0px_#111111] p-6">
            <h3 className="font-serif text-lg font-bold text-on-surface mb-3 pb-2 border-b border-black">
              Loaded Curriculum
            </h3>

            <div className="space-y-2">
              {syllabuses.length === 0 ? (
                <div className="font-mono text-xs text-secondary italic">No syllabuses linked.</div>
              ) : (
                syllabuses.map(s => (
                  <div key={s.id} className="flex items-start gap-2 p-2 bg-surface border border-outline-variant/60">
                    <span className="font-mono text-[#005430] font-bold text-xs mt-0.5">✓</span>
                    <span className="font-sans text-xs font-medium text-on-surface leading-tight">{s.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
