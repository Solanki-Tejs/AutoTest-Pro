"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams, startExamAttempt } from "@/app/lib/student_exams";

export default function ExamInstructionsPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;
  
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // Camera states
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "student") {
      router.push("/student/login");
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getAllStudentExams(token)
      .then(exams => {
        const found = exams.find(e => e.id === examId);
        if (found) {
          if (found.attempt?.status === "in_progress") {
            router.replace(`/student/exams/${found.id}/attempt`);
            return;
          }
          if (found.attempt?.status === "submitted" || found.attempt?.status === "evaluated") {
            router.replace(`/student/exams/${found.id}/submitted`);
            return;
          }
          setExam(found);
        }
        else setError("Exam not found or you are not authorized.");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, examId, router]);

  const handleStartExam = async () => {
    if (!token || !exam || !cameraReady) return;
    setStarting(true);
    setError("");
    try {
      // Stop the preview stream before navigating so the attempt page can grab it
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      await startExamAttempt(token, exam.id);
      router.push(`/student/exams/${exam.id}/attempt`);
    } catch (e: any) {
      setError(e.message || "Failed to start exam");
      setStarting(false);
    }
  };

  const requestCamera = async () => {
    try {
      setCameraError("");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(mediaStream);
      setCameraReady(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      setCameraReady(false);
      setCameraError("Camera access is required for this exam's proctoring. Please allow camera access and try again.");
    }
  };

  // Try to start camera when exam data is loaded
  useEffect(() => {
    if (exam && (!exam.attempt || exam.attempt.status === "in_progress") && !cameraReady) {
      requestCamera();
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [exam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#6c63ff] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full shadow-sm text-center">
          <div className="text-red-500 mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error loading exam</h2>
          <p className="text-slate-600 mb-6">{error || "Exam not found"}</p>
          <button onClick={() => router.push("/student/dashboard")} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startTime = new Date(exam.start_time.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? exam.start_time : exam.start_time + 'Z');
  const endTime = new Date(exam.end_time.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? exam.end_time : exam.end_time + 'Z');
  
  const isAvailable = now >= startTime && now <= endTime;
  const isPast = now > endTime;

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push("/student/dashboard")} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
          <div className="h-2 bg-[#6c63ff] absolute top-0 left-0 right-0"></div>
          
          <div className="p-8 sm:p-10 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
              <div>
                <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-widest rounded-full mb-3">
                  {exam.class_name}
                </span>
                <h1 className="text-[2rem] font-bold text-slate-900 tracking-tight leading-tight">
                  {exam.title}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm mt-6 p-5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex-1 min-w-[120px]">
                <div className="text-slate-500 mb-1 font-semibold">Total Marks</div>
                <div className="text-xl font-bold text-slate-900">{exam.total_marks}</div>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="text-slate-500 mb-1 font-semibold">Duration</div>
                <div className="text-xl font-bold text-slate-900">{exam.duration_minutes} mins</div>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="text-slate-500 mb-1 font-semibold">Difficulty</div>
                <div className="text-xl font-bold text-slate-900 capitalize">{exam.difficulty}</div>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-10 bg-white">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              Instructions
            </h3>
            
            <ul className="space-y-4 text-slate-600 mb-10 text-[0.95rem] leading-relaxed">
              <li className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#6c63ff] shrink-0"></div>
                You have exactly <strong className="text-slate-900 mx-1">{exam.duration_minutes} minutes</strong> to complete this exam.
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#6c63ff] shrink-0"></div>
                The timer will start as soon as you click the button below. It will continue running even if you refresh or close the page.
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#6c63ff] shrink-0"></div>
                Your answers will be saved automatically as you progress.
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#6c63ff] shrink-0"></div>
                The exam will be submitted automatically when the time runs out. You can also submit manually at any time.
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></div>
                Ensure you have a stable internet connection before starting.
              </li>
            </ul>

            {/* Webcam Preview Section */}
            {(!exam.attempt || exam.attempt?.status === "in_progress") && isAvailable && !isPast && (
              <div className="mb-10 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <h4 className="text-[1.05rem] font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6c63ff]"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  Proctoring Setup
                </h4>
                
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="w-full sm:w-[280px] h-[210px] bg-black rounded-xl overflow-hidden relative shadow-inner shrink-0 border-2 border-slate-800">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    {!cameraReady && !cameraError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                        <div className="w-8 h-8 border-4 border-slate-600 border-t-white rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    {cameraReady ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
                        <div className="font-bold flex items-center gap-2 mb-1">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          Camera Ready
                        </div>
                        <p className="text-[0.9rem]">Your webcam is successfully connected and proctoring is active.</p>
                      </div>
                    ) : cameraError ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                        <div className="font-bold flex items-center gap-2 mb-2">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                          Camera Error
                        </div>
                        <p className="text-[0.9rem] mb-3">{cameraError}</p>
                        <button 
                          onClick={requestCamera}
                          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-md text-sm transition-colors"
                        >
                          Retry Camera Access
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[0.9rem]">
                        Requesting camera access...
                      </div>
                    )}
                    
                    <p className="text-xs text-slate-500 mt-4 bg-white p-3 rounded-md border border-slate-200">
                      <strong>Privacy Notice:</strong> This exam requires webcam monitoring. Snapshots will be taken periodically to ensure academic integrity.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-8 flex flex-col items-center justify-center">
              {(exam.attempt?.status === "submitted" || exam.attempt?.status === "evaluated") ? (
                <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg w-full">
                  <div className="font-bold text-green-800 mb-1">Exam Submitted</div>
                  <div className="text-green-700 text-sm">You have already completed this exam.</div>
                  <button onClick={() => router.push(`/student/exams/${exam.id}/submitted`)} className="mt-3 px-4 py-2 bg-green-600 text-white font-bold rounded-md hover:bg-green-700">View Receipt</button>
                </div>
              ) : exam.attempt?.status === "in_progress" ? (
                <button 
                  onClick={() => router.push(`/student/exams/${exam.id}/attempt`)}
                  disabled={!cameraReady}
                  className={`w-full sm:w-auto px-8 py-3.5 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(245,158,11,0.39)] transition-all transform text-lg ${
                    cameraReady ? "bg-amber-500 hover:bg-amber-600 hover:-translate-y-0.5" : "bg-slate-300 cursor-not-allowed shadow-none"
                  }`}
                >
                  Resume Exam Attempt
                </button>
              ) : isPast ? (
                <div className="text-center p-4 bg-slate-100 border border-slate-200 rounded-lg w-full text-slate-500 font-semibold">
                  This exam is no longer available.
                </div>
              ) : !isAvailable ? (
                <div className="text-center p-4 bg-indigo-50 border border-indigo-200 rounded-lg w-full">
                  <div className="font-bold text-indigo-800 mb-1">Not Yet Available</div>
                  <div className="text-indigo-700 text-sm">
                    This exam opens at {startTime.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleStartExam}
                  disabled={starting || !cameraReady}
                  className={`w-full sm:w-auto px-8 py-3.5 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(108,99,255,0.39)] transition-all transform text-lg ${
                    starting ? "bg-[#6c63ff]/70 cursor-not-allowed" : 
                    !cameraReady ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-[#6c63ff] hover:bg-[#5a52d5] hover:-translate-y-0.5"
                  }`}
                >
                  {starting ? "Preparing your exam..." : !cameraReady ? "Waiting for camera..." : "Start Exam"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
