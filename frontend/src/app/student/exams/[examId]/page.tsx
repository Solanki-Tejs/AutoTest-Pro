"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams, startExamAttempt } from "@/app/lib/student_exams";
import Link from "next/link";

function parseUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? dateStr : `${dateStr}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

export default function ExamInstructionsPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // Camera & Mic states
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);

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
      .then((exams) => {
        const found = exams.find((e) => e.id === examId);
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
        } else {
          setError("Assessment paper not found or access is restricted.");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, examId, router]);

  const handleStartExam = async () => {
    if (!token || !exam || !cameraReady || !micReady) return;
    setStarting(true);
    setError("");
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      await startExamAttempt(token, exam.id);
      router.push(`/student/exams/${exam.id}/attempt`);
    } catch (e: any) {
      setError(e.message || "Failed to initialize exam attempt");
      setStarting(false);
    }
  };

  const requestCamera = async () => {
    try {
      setCameraError("");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setCameraReady(true);
      const hasAudio = mediaStream.getAudioTracks().length > 0;
      setMicReady(hasAudio);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      setCameraReady(false);
      setMicReady(false);
      setCameraError(
        "Webcam and microphone access are required for online invigilation. Please grant device permissions."
      );
    }
  };

  useEffect(() => {
    if (exam && (!exam.attempt || exam.attempt.status === "in_progress") && !cameraReady) {
      requestCamera();
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [exam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center font-mono text-xs uppercase tracking-widest text-[#111111]">
        INITIALIZING SECURE ASSESSMENT ENVIRONMENT...
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center p-6">
        <div className="bg-white border-2 border-black p-8 max-w-md w-full shadow-[6px_6px_0px_#111111] text-center">
          <div className="w-12 h-12 bg-black text-white flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[24px] text-brand-crimson">error</span>
          </div>
          <span className="font-mono text-[10px] text-brand-crimson tracking-[0.2em] uppercase font-bold block mb-1">
            INTEGRITY NOTICE
          </span>
          <h2 className="font-serif text-2xl font-bold text-[#111111] mb-2">Access Denied</h2>
          <p className="font-sans text-xs text-neutral-600 mb-6">{error || "Exam not found"}</p>
          <Link
            href="/student/dashboard"
            className="inline-block bg-[#111111] text-white font-mono text-xs uppercase tracking-widest font-bold py-3 px-6 hover:bg-brand-crimson border border-black transition-colors"
          >
            Return to Portal
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const startTime = parseUtcDate(exam.start_time);
  const endTime = parseUtcDate(exam.end_time);

  const isAvailable = (!startTime || now >= startTime) && (!endTime || now <= endTime);
  const isPast = Boolean(endTime && now > endTime);

  return (
    <main className="min-h-screen bg-[#f9f9f9] py-10 px-4 sm:px-8 font-sans text-[#111111]">
      <div className="max-w-3xl mx-auto flex flex-col gap-6 animate-fade-up">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between border-b border-black pb-4">
          <Link
            href="/student/dashboard"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-neutral-600 hover:text-black transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>BACK TO CANDIDATE DASHBOARD</span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 bg-black text-white font-bold">
            SECURE EXAM BRIEFING
          </span>
        </div>

        {/* Primary Paper Card */}
        <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#111111]">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b-2 border-black bg-[#fdfdfd]">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-brand-crimson text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                {exam.class_name}
              </span>
              <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-widest">
                // CBT SPECIFICATION
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-[#111111] font-bold tracking-tight">
              {exam.title}
            </h1>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="p-4 bg-[#f9f9f9] border border-black">
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest block">
                  MAX MARKS
                </span>
                <span className="font-serif text-2xl font-bold text-[#111111]">
                  {exam.total_marks} PTS
                </span>
              </div>
              <div className="p-4 bg-[#f9f9f9] border border-black">
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest block">
                  TIME LIMIT
                </span>
                <span className="font-serif text-2xl font-bold text-[#111111]">
                  {exam.duration_minutes} MINS
                </span>
              </div>
              <div className="p-4 bg-[#f9f9f9] border border-black">
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest block">
                  RIGOR LEVEL
                </span>
                <span className="font-mono text-sm font-bold text-brand-crimson tracking-wider uppercase mt-1 block">
                  {(exam.difficulty || "MEDIUM").toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Protocol Instructions */}
          <div className="p-6 sm:p-8 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-black/10">
                <span className="material-symbols-outlined text-[18px] text-brand-crimson">
                  policy
                </span>
                <h3 className="font-mono text-xs uppercase tracking-widest font-bold text-[#111111]">
                  CANDIDATE CODE OF CONDUCT &amp; PROTOCOL
                </h3>
              </div>

              <ul className="space-y-3 font-sans text-xs text-neutral-700 leading-relaxed">
                <li className="flex items-start gap-3 p-2 bg-[#f9f9f9] border border-black/10">
                  <span className="font-mono font-bold text-brand-crimson">01.</span>
                  <span>
                    Allocated duration is strictly{" "}
                    <strong className="text-black font-bold">{exam.duration_minutes} minutes</strong>. The timer commences immediately upon initialization and cannot be paused.
                  </span>
                </li>
                <li className="flex items-start gap-3 p-2 bg-[#f9f9f9] border border-black/10">
                  <span className="font-mono font-bold text-brand-crimson">02.</span>
                  <span>
                    Continuous auto-save operates throughout the attempt. Final responses are securely vaulted upon timeout or manual submission.
                  </span>
                </li>
                <li className="flex items-start gap-3 p-2 bg-[#f9f9f9] border border-black/10">
                  <span className="font-mono font-bold text-brand-crimson">03.</span>
                  <span>
                    Browser tab switching, window blurring, or keyboard shortcut exploitation is captured as biometric telemetry violations.
                  </span>
                </li>
                <li className="flex items-start gap-3 p-3 bg-brand-crimson/5 border-l-4 border-brand-crimson border-y border-r border-black/10">
                  <span className="material-symbols-outlined text-brand-crimson text-[18px] shrink-0 mt-0.5">
                    mic_off
                  </span>
                  <div>
                    <strong className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand-crimson block mb-0.5">
                      ACOUSTIC &amp; SPATIAL ISOLATION RULE
                    </strong>
                    <span className="text-neutral-800">
                      You must remain in a quiet, isolated environment. Any ambient talking, voice discussion, or noise exceeding the calibrated threshold will automatically trigger incident surveillance audio recording and report directly to your instructor.
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            {/* Webcam & Mic Invigilation Pre-Flight */}
            {(!exam.attempt || exam.attempt?.status === "in_progress") && isAvailable && !isPast && (
              <div className="p-5 border-2 border-black bg-[#fdfdfd] flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-black/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand-crimson text-[20px]">
                      videocam
                    </span>
                    <h4 className="font-mono text-xs uppercase tracking-widest font-bold text-[#111111]">
                      INVIGILATION TELEMETRY CHECK
                    </h4>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest">
                    SYSTEM SENSORS
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-5 items-center">
                  <div className="w-full sm:w-[240px] h-[160px] bg-black border-2 border-black flex items-center justify-center shrink-0 overflow-hidden relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                    {cameraReady && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/80 px-2 py-0.5 border border-white/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono text-[9px] text-white tracking-widest uppercase">
                          FEED OK
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col gap-3 w-full">
                    {cameraReady && micReady ? (
                      <div className="border border-black bg-[#7afbb1]/15 p-3 text-xs font-mono font-bold text-[#005430] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                          <span>HARDWARE CALIBRATED // CAMERA &amp; MIC ACTIVE</span>
                        </div>
                        <span className="px-2 py-0.5 bg-black text-white text-[9px] tracking-wider uppercase">
                          READY
                        </span>
                      </div>
                    ) : cameraError ? (
                      <div className="border border-brand-crimson bg-[#ffdad6] p-3 text-xs font-mono text-[#ba1a1a] flex flex-col gap-2">
                        <span>{cameraError}</span>
                        <button
                          onClick={requestCamera}
                          className="bg-black hover:bg-brand-crimson text-white font-mono text-[10px] uppercase font-bold py-2 px-3 self-start cursor-pointer transition-colors"
                        >
                          Retry Camera Authorization
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 border border-black/20 bg-[#f9f9f9] text-xs font-mono text-neutral-600 flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        <span>INITIALIZING HARDWARE PERMISSIONS...</span>
                      </div>
                    )}

                    <p className="font-sans text-[11px] text-neutral-500 leading-relaxed">
                      Continuous proctoring evaluates head posture, tab compliance, and sound levels throughout the session.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Launch Assessment Action */}
            <div className="border-t-2 border-black pt-6 flex flex-col items-center gap-3">
              {isPast ? (
                <div className="p-4 bg-[#f3f3f3] text-neutral-600 font-mono text-xs uppercase tracking-wider text-center w-full border border-black">
                  EXAMINATION WINDOW CLOSED
                </div>
              ) : !isAvailable ? (
                <div className="p-4 bg-[#f3f3f3] text-neutral-800 font-mono text-xs uppercase tracking-wider text-center w-full border border-black">
                  EXAMINATION OPENS:{" "}
                  {startTime
                    ? startTime.toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "TBD"}
                </div>
              ) : (
                <button
                  onClick={handleStartExam}
                  disabled={starting || !cameraReady || !micReady}
                  className={`w-full sm:w-auto font-mono text-xs tracking-[0.2em] uppercase font-bold py-4 px-12 transition-all cursor-pointer border-2 border-black shadow-[4px_4px_0px_#111111] ${
                    starting || !cameraReady || !micReady
                      ? "bg-neutral-200 text-neutral-400 cursor-not-allowed shadow-none border-neutral-300"
                      : "bg-[#111111] hover:bg-brand-crimson text-white hover:shadow-[4px_4px_0px_#ff1d58]"
                  }`}
                >
                  {starting
                    ? "INITIALIZING TEST SESSION..."
                    : !cameraReady || !micReady
                    ? "AWAITING SENSOR CALIBRATION..."
                    : "BEGIN EXAMINATION →"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
