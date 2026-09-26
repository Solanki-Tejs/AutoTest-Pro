"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { Exam, getExam, updateExam, approveAnswerBank } from "@/app/lib/exams";

export default function PublishStepPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [publishing, setPublishing] = useState(false);

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
        const ex = await getExam(token!, params.examId);
        setExam(ex);
        if (ex.start_time) {
          const tzOffset = new Date().getTimezoneOffset() * 60000;
          setStartTime(new Date(new Date(ex.start_time).getTime() - tzOffset).toISOString().slice(0, 16));
        }
        if (ex.end_time) {
          const tzOffset = new Date().getTimezoneOffset() * 60000;
          setEndTime(new Date(new Date(ex.end_time).getTime() - tzOffset).toISOString().slice(0, 16));
        }
      } catch (err: any) {
        console.error("Failed to load exam data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, params.examId]);

  async function handlePublish() {
    if (!token) return;
    
    if (!startTime || !endTime) {
      alert("Both Start Date & Time and End Date & Time are required to publish the exam.");
      return;
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = (exam?.duration_minutes || 0) * 60000;

    if (end < start + durationMs) {
      alert(`The time window must be at least ${exam?.duration_minutes} minutes long to accommodate the exam duration.`);
      return;
    }
    
    setPublishing(true);
    try {
      await updateExam(token, params.examId, {
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        status: "published",
      });
      await approveAnswerBank(token, params.examId);
      
      const successMsg = isPublished 
        ? (isFinished ? "Exam republished successfully!" : "Publish details updated successfully!")
        : "Exam published successfully! It is now available to students.";
      alert(successMsg);
      router.push("/teacher/dashboard");
    } catch (e: any) {
      alert(e.message || "Failed to publish exam");
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-slate-500">Loading Publish Settings...</div>;
  }

  const isPublished = exam?.status === "published";
  const isFinished = exam?.end_time ? new Date(exam.end_time).getTime() < Date.now() : false;

  let buttonText = publishing ? "Publishing..." : "Publish Exam";
  let titleText = "Finalize & Publish Exam";
  let subtitleText = "Set the start and end time and make the exam available to students.";

  if (isPublished) {
    if (isFinished) {
      buttonText = publishing ? "Republishing..." : "Republish Exam";
      titleText = "Republish Exam";
      subtitleText = "This exam has ended. Update the time window to republish it.";
    } else {
      buttonText = publishing ? "Updating..." : "Update Publish Details";
      titleText = "Update Publish Details";
      subtitleText = "Modify the active time window for this exam.";
    }
  }

  return (
    <div className="animate-fade-in max-w-3xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{titleText}</h2>
          <p className="text-slate-600 text-[0.9rem]">{subtitleText}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="mb-8 p-5 bg-slate-50 border border-slate-200 rounded-lg">
          <h3 className="font-bold text-slate-900 text-lg mb-2">{exam?.title}</h3>
          <div className="flex gap-6 text-sm text-slate-600 mt-2">
            <div><span className="font-semibold text-slate-700">Marks:</span> {exam?.total_marks}</div>
            <div><span className="font-semibold text-slate-700">Duration:</span> {exam?.duration_minutes} mins</div>
            <div><span className="font-semibold text-slate-700">Difficulty:</span> <span className="capitalize">{exam?.difficulty}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">Start Date & Time (Required)</label>
            <input 
              type="datetime-local" 
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
              value={startTime} 
              onChange={e => setStartTime(e.target.value)} 
            />
            <p className="text-xs text-slate-500 mt-2">When students can begin the exam.</p>
          </div>
          <div>
            <label className="block text-[0.85rem] font-bold text-slate-700 mb-2">End Date & Time (Required)</label>
            <input 
              type="datetime-local" 
              required
              className="w-full px-4 py-3 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all"
              value={endTime} 
              onChange={e => setEndTime(e.target.value)} 
            />
            <p className="text-xs text-slate-500 mt-2">When the exam will automatically close.</p>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t border-slate-200 mt-6 gap-4">
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/answers`)}
            disabled={publishing}
            className="px-6 py-2.5 border border-slate-300 bg-white text-slate-700 font-bold text-[0.95rem] rounded-md hover:bg-slate-50 transition-colors"
          >
            &larr; Back to Answers
          </button>
          <button 
            onClick={handlePublish}
            disabled={publishing || !startTime || !endTime}
            className="px-8 py-2.5 bg-[#2563eb] text-white font-bold text-[0.95rem] rounded-md hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
