"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { Exam, getExam, publishExam } from "@/app/lib/exams";
import { toast } from "sonner";

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
          const stStr = ex.start_time.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? ex.start_time : ex.start_time + 'Z';
          const tzOffset = new Date().getTimezoneOffset() * 60000;
          setStartTime(new Date(new Date(stStr).getTime() - tzOffset).toISOString().slice(0, 16));
        }
        if (ex.end_time) {
          const etStr = ex.end_time.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? ex.end_time : ex.end_time + 'Z';
          const tzOffset = new Date().getTimezoneOffset() * 60000;
          setEndTime(new Date(new Date(etStr).getTime() - tzOffset).toISOString().slice(0, 16));
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
      toast.error("Both Start Date & Time and End Date & Time are required.");
      return;
    }

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const durationMs = (exam?.duration_minutes || 0) * 60000;

    if (end <= start) {
      toast.error("End time must be strictly after start time.");
      return;
    }

    if (end < start + durationMs) {
      toast.error(`The time window must be at least ${exam?.duration_minutes} minutes long to accommodate exam duration.`);
      return;
    }

    const current = Date.now();
    if (start <= current || end <= current) {
      toast.error("Start time and End time must be set in the future.");
      return;
    }
    
    setPublishing(true);
    try {
      await publishExam(token, params.examId, {
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      });
      
      const successMsg = isPublished 
        ? (isFinished ? "Exam republished successfully!" : "Publish details updated successfully!")
        : "Exam published successfully! It is now accessible to students.";
      toast.success(successMsg);
      router.push("/teacher/dashboard");
    } catch (e: any) {
      toast.error(e.message || "Failed to publish exam");
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center font-sans">
        <div className="w-10 h-10 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mx-auto mb-4" />
        <span className="font-mono text-xs text-secondary uppercase tracking-widest block">
          Loading Deployment Configuration...
        </span>
      </div>
    );
  }

  const isPublished = exam?.status === "published";
  const isFinished = exam?.end_time ? new Date(exam.end_time).getTime() < Date.now() : false;

  let buttonText = publishing ? "Publishing..." : "Publish & Open Exam";
  let titleText = "Finalize & Publish Exam";
  let subtitleText = "Establish access windows and activate test administration for enrolled candidates.";

  if (isPublished) {
    if (isFinished) {
      buttonText = publishing ? "Republishing..." : "Republish Exam";
      titleText = "Republish Exam";
      subtitleText = "This exam cycle has concluded. Extend or modify the active window to reopen.";
    } else {
      buttonText = publishing ? "Updating..." : "Update Publish Window";
      titleText = "Update Publish Details";
      subtitleText = "Modify active scheduling constraints for this published assessment.";
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              STEP 06
            </span>
            <span className="font-mono text-xs text-[#0047ff] font-bold uppercase tracking-wider">
              DEPLOYMENT &amp; TIMING SCHEDULE
            </span>
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-on-surface tracking-tight">
            {titleText}
          </h2>
          <p className="font-sans text-sm text-secondary mt-1">
            {subtitleText}
          </p>
        </div>
      </div>

      {/* Main Box Card */}
      <div className="bg-surface-container-lowest p-6 md:p-8 border border-black shadow-[4px_4px_0px_#111111]">
        {/* Exam Summary Ledger */}
        <div className="mb-8 p-6 bg-surface-container-low border border-black shadow-[2px_2px_0px_#111111]">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#0047ff] font-bold">
              ASSESSMENT DOSSIER
            </span>
            <span className={`font-mono text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 border border-black ${
              isPublished ? "bg-[#005430] text-white" : "bg-black text-white"
            }`}>
              {isPublished ? (isFinished ? "EXPIRED" : "LIVE ACTIVE") : "READY TO PUBLISH"}
            </span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-on-surface mb-2">{exam?.title}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs pt-3 border-t border-outline-variant/60">
            <div>
              <span className="text-secondary block text-[10px] uppercase">Classroom:</span>
              <span className="font-bold text-on-surface">{exam?.class_name}</span>
            </div>
            <div>
              <span className="text-secondary block text-[10px] uppercase">Total Marks:</span>
              <span className="font-bold text-[#0047ff]">{exam?.total_marks} Marks</span>
            </div>
            <div>
              <span className="text-secondary block text-[10px] uppercase">Duration:</span>
              <span className="font-bold text-on-surface">{exam?.duration_minutes} Mins</span>
            </div>
            <div>
              <span className="text-secondary block text-[10px] uppercase">Difficulty:</span>
              <span className="font-bold text-on-surface capitalize">{exam?.difficulty}</span>
            </div>
          </div>
        </div>

        {/* Date Time Windows Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
              Start Date &amp; Time <span className="text-[#0047ff]">*</span>
            </label>
            <input 
              type="datetime-local" 
              required
              min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] outline-none font-sans text-sm focus:ring-1 focus:ring-[#0047ff] transition-colors"
              value={startTime} 
              onChange={e => setStartTime(e.target.value)} 
            />
            <p className="font-mono text-[10px] text-secondary mt-1.5 uppercase">
              Students cannot access assessment prior to this timestamp.
            </p>
          </div>

          <div>
            <label className="block font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">
              End Date &amp; Time <span className="text-[#0047ff]">*</span>
            </label>
            <input 
              type="datetime-local" 
              required
              min={startTime || new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              className="w-full px-4 py-2.5 bg-surface-container-lowest border border-black focus:border-[#0047ff] outline-none font-sans text-sm focus:ring-1 focus:ring-[#0047ff] transition-colors"
              value={endTime} 
              onChange={e => setEndTime(e.target.value)} 
            />
            <p className="font-mono text-[10px] text-secondary mt-1.5 uppercase">
              Submissions automatically close once this timestamp lapses.
            </p>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex justify-between items-center pt-6 border-t border-black mt-8 gap-4 flex-wrap">
          <button 
            onClick={() => router.push(`/teacher/exams/${params.examId}/answers`)}
            disabled={publishing}
            className="px-6 py-3 border border-black bg-surface text-on-surface hover:bg-black hover:text-white font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back to Answers</span>
          </button>
          <button 
            onClick={handlePublish}
            disabled={publishing || !startTime || !endTime}
            className="px-8 py-3 bg-[#0047ff] hover:bg-black text-white font-mono text-xs uppercase tracking-wider font-bold border border-black shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <span>{buttonText}</span>
            <span className="material-symbols-outlined text-[16px]">verified</span>
          </button>
        </div>
      </div>
    </div>
  );
}
