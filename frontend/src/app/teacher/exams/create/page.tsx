"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { fetchMyClasses, ClassItem } from "@/app/lib/classes";
import { createExam, getAvailableSyllabuses, SyllabusAvailable } from "@/app/lib/exams";

export default function CreateExamPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [syllabuses, setSyllabuses] = useState<SyllabusAvailable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    class_id: "",
    total_marks: "50",
    duration_minutes: "60",
    difficulty: "medium",
  });
  const [selectedPdfs, setSelectedPdfs] = useState<Set<string>>(new Set());

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
        const [cls, sylls] = await Promise.all([
          fetchMyClasses(token!),
          getAvailableSyllabuses(token!)
        ]);
        setClasses(cls);
        setSyllabuses(sylls);
        if (cls.length > 0) {
          setFormData(prev => ({ ...prev, class_id: cls[0].id.toString() }));
        }
      } catch (err: any) {
        setError(err.message || "Failed to load required data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const togglePdf = (id: string) => {
    setSelectedPdfs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (selectedPdfs.size === 0) {
      setError("Please select at least one syllabus PDF.");
      return;
    }
    
    setError("");
    setSubmitting(true);
    try {
      const exam = await createExam(token, {
        title: formData.title,
        class_id: parseInt(formData.class_id),
        total_marks: parseInt(formData.total_marks),
        duration_minutes: parseInt(formData.duration_minutes),
        difficulty: formData.difficulty,
        selected_pdf_ids: Array.from(selectedPdfs)
      });
      router.push(`/teacher/exams/${exam.id}/blueprint`);
    } catch (err: any) {
      setError(err.message || "Failed to create exam");
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading...</div>;
  }

  // Filter syllabuses to only those matching the selected class
  const classSyllabuses = syllabuses.filter(s => s.class_id.toString() === formData.class_id);

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push("/teacher/dashboard")} className="text-[#2563eb] text-[0.9rem] mb-6 flex items-center gap-2 hover:underline">
          &larr; Back to Dashboard
        </button>
        
        <h1 className="text-[2rem] font-bold text-slate-900 tracking-tight mb-2">Create Exam</h1>
        <p className="text-slate-600 mb-8">Enter the exam details and select syllabus PDFs to begin building the exam blueprint.</p>
        
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          {error && <div className="mb-6 p-3 bg-red-50 text-red-600 rounded border border-red-200 text-sm font-semibold">{error}</div>}
          
          <div className="grid grid-cols-1 gap-6 mb-8">
            <div>
              <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Exam Title</label>
              <input 
                required 
                type="text" 
                placeholder="e.g. Database Management System Mid-Term"
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                value={formData.title} 
                onChange={e => setFormData({ ...formData, title: e.target.value })} 
              />
            </div>
            
            <div>
              <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Class</label>
              <select 
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                value={formData.class_id} 
                onChange={e => {
                  setFormData({ ...formData, class_id: e.target.value });
                  setSelectedPdfs(new Set()); // Reset pdfs when class changes
                }}
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Total Marks</label>
                <input 
                  required 
                  type="number" 
                  min="1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                  value={formData.total_marks} 
                  onChange={e => setFormData({ ...formData, total_marks: e.target.value })} 
                />
              </div>
              <div>
                <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Duration (mins)</label>
                <input 
                  required 
                  type="number" 
                  min="1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                  value={formData.duration_minutes} 
                  onChange={e => setFormData({ ...formData, duration_minutes: e.target.value })} 
                />
              </div>
              <div>
                <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Difficulty</label>
                <select 
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                  value={formData.difficulty} 
                  onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="mb-8">
            <h3 className="text-[1.1rem] font-bold text-slate-900 mb-2">Select Syllabus Files</h3>
            <p className="text-slate-500 text-[0.85rem] mb-4">Only processed syllabus files with topic extraction completed are shown.</p>
            
            {classSyllabuses.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-300 rounded-md text-center text-slate-500 text-sm">
                No processed syllabus files found for this class. Upload and process a syllabus first.
              </div>
            ) : (
              <div className="space-y-3">
                {classSyllabuses.map(pdf => (
                  <label key={pdf.id} className="flex items-start gap-3 p-3 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-1 w-4 h-4 text-[#2563eb] rounded border-slate-300 focus:ring-[#2563eb]" 
                      checked={selectedPdfs.has(pdf.id)}
                      onChange={() => togglePdf(pdf.id)}
                    />
                    <div>
                      <div className="font-semibold text-slate-800 text-[0.95rem]">{pdf.title}</div>
                      <div className="text-[0.75rem] text-slate-500">{pdf.file_ref} • {new Date(pdf.created_at).toLocaleDateString()}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-6 border-t border-slate-200">
            <button 
              type="submit" 
              disabled={submitting || classSyllabuses.length === 0}
              className="px-6 py-2.5 bg-[#2563eb] text-white font-bold text-[0.95rem] rounded-md hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating Draft..." : "Next: Configure Blueprint"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
