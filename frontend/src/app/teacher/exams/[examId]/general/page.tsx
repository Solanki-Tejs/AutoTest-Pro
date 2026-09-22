"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { fetchMyClasses, ClassItem } from "@/app/lib/classes";
import { getExam, updateExam } from "@/app/lib/exams";
import debounce from "lodash/debounce";

export default function GeneralStepPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [formData, setFormData] = useState({
    title: "",
    class_id: "",
    total_marks: "50",
    duration_minutes: "60",
    difficulty: "medium",
  });

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
        const [cls, exam] = await Promise.all([
          fetchMyClasses(token!),
          getExam(token!, params.examId)
        ]);
        setClasses(cls);
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
      setSaveStatus("saving");
      try {
        await updateExam(t, params.examId, {
          title: data.title,
          class_id: parseInt(data.class_id),
          total_marks: parseInt(data.total_marks),
          duration_minutes: parseInt(data.duration_minutes),
          difficulty: data.difficulty,
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

  const handleChange = (field: keyof typeof formData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    if (token) {
      debouncedSave(newData, token);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Loading General Settings...</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">General Details</h2>
          <p className="text-slate-600 text-[0.9rem]">Configure basic details for this exam</p>
        </div>
        
        <div className="text-sm font-medium">
          {saveStatus === "saving" && <span className="text-slate-500 flex items-center gap-2"><div className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-[#2563eb] animate-spin"></div> Saving...</span>}
          {saveStatus === "saved" && <span className="text-green-600">✓ Saved</span>}
          {saveStatus === "error" && <span className="text-red-500">⚠ Failed to save</span>}
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div>
            <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Exam Title</label>
            <input 
              required 
              type="text" 
              placeholder="e.g. Database Management System Mid-Term"
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
              value={formData.title} 
              onChange={e => handleChange("title", e.target.value)} 
            />
          </div>
          
          <div>
            <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Class</label>
            <select 
              required
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
              value={formData.class_id} 
              onChange={e => handleChange("class_id", e.target.value)}
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
                onChange={e => handleChange("total_marks", e.target.value)} 
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
                onChange={e => handleChange("duration_minutes", e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Difficulty</label>
              <select 
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
                value={formData.difficulty} 
                onChange={e => handleChange("difficulty", e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t border-slate-200 mt-6">
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/syllabus`)}
            className="px-6 py-2.5 bg-[#2563eb] text-white font-bold text-[0.95rem] rounded-md hover:bg-[#1d4ed8] transition-colors"
          >
            Continue to Syllabus &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
