"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { getExam, getExamBlueprint, saveExamBlueprint, Exam, Section, Blueprint } from "@/app/lib/exams";
import { getAvailableSyllabuses, SyllabusAvailable } from "@/app/lib/exams";

export default function ExamBlueprintPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;
  
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [syllabuses, setSyllabuses] = useState<SyllabusAvailable[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
        const [exm, blp, sylls] = await Promise.all([
          getExam(token!, examId),
          getExamBlueprint(token!, examId),
          getAvailableSyllabuses(token!)
        ]);
        setExam(exm);
        setSections(blp.sections || []);
        setSyllabuses(sylls.filter(s => exm.selected_pdf_ids.includes(s.id)));
      } catch (err: any) {
        setError(err.message || "Failed to load blueprint data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token, examId]);

  const configuredMarks = sections.reduce((acc, sec) => acc + (sec.count * sec.marks_each), 0);
  const examTotal = exam?.total_marks || 0;
  const remainingMarks = examTotal - configuredMarks;

  const addSection = () => {
    setSections(prev => [
      ...prev,
      { section: `Section ${String.fromCharCode(65 + prev.length)}`, type: "mcq", count: 1, marks_each: 1, order: prev.length }
    ]);
  };

  const updateSection = (index: number, field: keyof Section, value: any) => {
    setSections(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeSection = (index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!token) return;
    setError("");
    setSuccess("");
    
    if (configuredMarks !== examTotal) {
      setError(`Configured marks (${configuredMarks}) must match exam total marks (${examTotal}).`);
      return;
    }
    
    setSaving(true);
    try {
      const blueprint = await saveExamBlueprint(token, examId, sections);
      setSections(blueprint.sections);
      setSuccess("Blueprint saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save blueprint");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading...</div>;
  }

  if (!exam) return <div className="p-8 text-red-600">Exam not found.</div>;

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button onClick={() => router.push("/teacher/dashboard")} className="text-slate-500 text-[0.85rem] mb-1 flex items-center gap-1 hover:text-[#2563eb] transition-colors">
              &larr; Dashboard
            </button>
            <h1 className="text-[1.4rem] font-bold text-slate-900 leading-tight">{exam.title}</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[0.75rem] font-bold text-slate-500 uppercase tracking-widest mb-1">Marks</div>
              <div className={`text-[1.5rem] font-bold leading-none ${remainingMarks === 0 ? "text-green-600" : remainingMarks < 0 ? "text-red-600" : "text-[#2563eb]"}`}>
                {configuredMarks} <span className="text-slate-300 text-[1.1rem]">/ {examTotal}</span>
              </div>
            </div>
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[0.95rem] font-bold rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-8 flex items-start gap-8">
        
        {/* ── Main Content ── */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[1.2rem] font-bold text-slate-900">Exam Sections</h2>
            <button 
              onClick={addSection}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 hover:border-[#2563eb] text-slate-700 hover:text-[#2563eb] bg-white rounded-md text-[0.85rem] font-semibold transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Section
            </button>
          </div>
          
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 border border-red-200 rounded-md font-semibold text-[0.9rem]">{error}</div>}
          {success && <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-md font-semibold text-[0.9rem]">{success}</div>}

          {sections.length === 0 ? (
            <div className="text-center py-16 px-8 bg-white border border-dashed border-slate-300 rounded-xl">
              <div className="text-4xl mb-4">📑</div>
              <h3 className="text-[1.1rem] font-bold text-slate-900 mb-2">No Sections Yet</h3>
              <p className="text-slate-500 text-[0.9rem] mb-6">Add a section to define the structure of your exam.</p>
              <button onClick={addSection} className="text-[#2563eb] font-semibold hover:underline">Add First Section</button>
            </div>
          ) : (
            <div className="space-y-5">
              {sections.map((section, index) => (
                <div key={index} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative group animate-fade-up" style={{ animationDelay: `${index * 0.05}s` }}>
                  <button 
                    onClick={() => removeSection(index)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-red-500 p-1.5 bg-slate-50 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete Section"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                  </button>
                  
                  <div className="grid grid-cols-12 gap-5 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[0.8rem] font-bold text-slate-700 mb-1.5">Section Name</label>
                      <input 
                        type="text" 
                        value={section.section}
                        onChange={e => updateSection(index, "section", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none text-[0.9rem]"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <label className="block text-[0.8rem] font-bold text-slate-700 mb-1.5">Question Type</label>
                      <select 
                        value={section.type}
                        onChange={e => updateSection(index, "type", e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none text-[0.9rem]"
                      >
                        <option value="mcq">MCQ</option>
                        <option value="short">Short Answer</option>
                        <option value="long">Long Answer</option>
                        <option value="case_study">Case Study</option>
                      </select>
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="block text-[0.8rem] font-bold text-slate-700 mb-1.5">Count</label>
                      <input 
                        type="number" min="1"
                        value={section.count}
                        onChange={e => updateSection(index, "count", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none text-[0.9rem]"
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="block text-[0.8rem] font-bold text-slate-700 mb-1.5">Marks/Q</label>
                      <input 
                        type="number" min="1"
                        value={section.marks_each}
                        onChange={e => updateSection(index, "marks_each", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none text-[0.9rem]"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-1 pb-2">
                      <div className="text-[1.1rem] font-bold text-slate-900 text-right">
                        = {section.count * section.marks_each}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sidebar Info ── */}
        <div className="w-[300px] shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-5">
            <h3 className="font-bold text-slate-900 text-[1.05rem] mb-4">Exam Info</h3>
            
            <div className="space-y-4">
              <div>
                <div className="text-[0.75rem] text-slate-500 uppercase tracking-widest font-semibold mb-1">Class</div>
                <div className="text-[0.9rem] font-medium text-slate-900">{exam.class_name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[0.75rem] text-slate-500 uppercase tracking-widest font-semibold mb-1">Duration</div>
                  <div className="text-[0.9rem] font-medium text-slate-900">{exam.duration_minutes} Mins</div>
                </div>
                <div>
                  <div className="text-[0.75rem] text-slate-500 uppercase tracking-widest font-semibold mb-1">Difficulty</div>
                  <div className="text-[0.9rem] font-medium text-slate-900 capitalize">{exam.difficulty}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-900 text-[1.05rem] mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#2563eb]"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
              Selected Syllabuses
            </h3>
            
            <div className="space-y-3">
              {syllabuses.length === 0 ? (
                <div className="text-[0.85rem] text-slate-500 italic">No syllabuses loaded.</div>
              ) : (
                syllabuses.map(s => (
                  <div key={s.id} className="flex items-start gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 mt-0.5 shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-[0.85rem] font-medium text-slate-700 leading-tight">{s.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
      </div>
    </main>
  );
}
