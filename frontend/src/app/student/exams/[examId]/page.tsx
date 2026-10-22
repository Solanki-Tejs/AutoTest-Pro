"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams, startExamAttempt } from "@/app/lib/student_exams";
import Link from "next/link";

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
        } else {
          setError("Exam not found or you are not authorized.");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, examId, router]);

  const handleStartExam = async () => {
    if (!token || !exam || !cameraReady) return;
    setStarting(true);
    setError("");
    try {
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
      setCameraError("Webcam and microphone access are required for proctoring. Please allow camera & microphone permissions.");
    }
  };

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
      <div className="min-h-screen bg-surface flex items-center justify-center font-label-caps text-xs text-neutral-500">
        LOADING ASSESSMENT DETAILS...
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest border border-brand-crimson p-8 max-w-md w-full shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] text-center">
          <span className="material-symbols-outlined text-brand-crimson text-[36px] mb-2">error</span>
          <h2 className="font-serif text-2xl text-brand-dark mb-2">Examination Notice</h2>
          <p className="font-body-md text-xs text-neutral-600 mb-6">{error || "Exam not found"}</p>
          <Link
            href="/student/dashboard"
            className="inline-block bg-brand-dark text-white font-label-caps text-xs uppercase tracking-wider py-3 px-6 hover:bg-brand-crimson"
          >
            Return to Dashboard
          </Link>
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
    <main className="min-h-screen bg-surface py-12 px-6 sm:px-10 font-body-md text-on-surface">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="w-12 h-1 bg-brand-crimson"></div>

        <Link
          href="/student/dashboard"
          className="flex items-center gap-2 font-label-caps text-xs uppercase tracking-wider text-neutral-600 hover:text-black self-start"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to My Classes</span>
        </Link>

        <div className="bg-surface-container-lowest border border-black/10 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-8 sm:p-10 border-b border-black/10">
            <div className="flex flex-col gap-2">
              <span className="font-label-caps text-xs font-bold tracking-[0.2em] text-brand-crimson uppercase">
                {exam.class_name} / Assessment
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl text-brand-dark tracking-tight">
                {exam.title}
              </h1>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-surface-container-low border border-black/10">
              <div>
                <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block">TOTAL MARKS</span>
                <span className="font-serif text-2xl text-brand-dark font-bold">{exam.total_marks}</span>
              </div>
              <div>
                <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block">DURATION</span>
                <span className="font-serif text-2xl text-brand-dark font-bold">{exam.duration_minutes} Mins</span>
              </div>
              <div>
                <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block">DIFFICULTY</span>
                <span className="font-label-caps text-sm text-brand-dark font-bold tracking-wider mt-1 block uppercase">{exam.difficulty}</span>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-10 flex flex-col gap-8">
            <div>
              <h3 className="font-label-caps text-xs uppercase tracking-[0.18em] text-brand-dark font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-crimson text-[18px]">verified_user</span>
                <span>EXAMINATION PROTOCOL & INSTRUCTIONS</span>
              </h3>
              
              <ul className="space-y-3 font-body-md text-xs text-neutral-600 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 bg-brand-crimson mt-1.5 shrink-0"></span>
                  <span>You have exactly <strong className="text-black">{exam.duration_minutes} minutes</strong> to complete the assessment.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 bg-brand-crimson mt-1.5 shrink-0"></span>
                  <span>The timer will start immediately upon clicking Start Exam. Auto-save ensures answers are persisted.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 bg-brand-crimson mt-1.5 shrink-0"></span>
                  <span>AI and instructor proctoring checks will periodically audit session focus.</span>
                </li>
                <li className="flex items-start gap-2.5 bg-amber-500/10 p-2.5 border-l-2 border-brand-crimson">
                  <span className="material-symbols-outlined text-brand-crimson text-[16px] shrink-0 mt-0.5">volume_off</span>
                  <span>
                    <strong className="text-black uppercase">Acoustic Isolation Rule:</strong> You must sit in an isolated, quiet room. Any ambient talking, voice speaking, or sound exceeding the calibrated room threshold will trigger an immediate academic integrity infraction and be submitted directly to the instructor.
                  </span>
                </li>
                <li className="flex items-start gap-2.5 bg-amber-500/10 p-2.5 border-l-2 border-brand-crimson">
                  <span className="material-symbols-outlined text-brand-crimson text-[16px] shrink-0 mt-0.5">volume_off</span>
                  <span>
                    <strong className="text-black uppercase">Acoustic Isolation Rule:</strong> You must sit in an isolated, quiet room. Any ambient talking, voice speaking, or sound exceeding the calibrated room threshold will trigger an immediate academic integrity infraction and be submitted directly to the instructor.
                  </span>
                </li>
              </ul>
            </div>

            {/* Webcam Proctoring Verification */}
            {(!exam.attempt || exam.attempt?.status === "in_progress") && isAvailable && !isPast && (
              <div className="bg-surface-container-low border border-black/10 p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-crimson text-[20px]">videocam</span>
                  <h4 className="font-label-caps text-xs uppercase tracking-widest text-brand-dark font-bold">
                    PROCTORING VERIFICATION FEED
                  </h4>
                </div>

                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div className="w-full sm:w-[260px] h-[180px] bg-black border-2 border-black flex items-center justify-center shrink-0 overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    {cameraReady && micReady ? (
                      <div className="border border-black bg-white p-3 text-xs font-label-caps font-bold text-brand-dark flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-brand-crimson">check_circle</span>
                          <span>WEBCAM & MIC READY // PROCTORING ACTIVE</span>
                        </div>
                        <span className="px-2 py-0.5 bg-brand-dark text-white font-mono text-[10px]">ACOUSTIC PROCTOR ON</span>
                      </div>
                    ) : cameraError ? (
                      <div className="border border-brand-crimson bg-white p-3 text-xs text-brand-crimson flex flex-col gap-2">
                        <span>{cameraError}</span>
                        <button
                          onClick={requestCamera}
                          className="bg-brand-dark text-white font-label-caps text-[10px] uppercase font-bold py-2 px-3 self-start cursor-pointer"
                        >
                          Retry Camera
                        </button>
                      </div>
                    ) : (
                      <span className="font-label-caps text-xs text-neutral-500">REQUESTING CAMERA ACCESS...</span>
                    )}

                    <p className="font-body-md text-[11px] text-neutral-500 leading-relaxed">
                      This exam requires webcam active monitoring to preserve test integrity.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action CTA */}
            <div className="border-t border-black/10 pt-6 flex justify-center">
              {isPast ? (
                <div className="p-4 bg-neutral-100 text-neutral-600 font-label-caps text-xs uppercase tracking-wider text-center w-full">
                  EXAMINATION WINDOW CLOSED
                </div>
              ) : !isAvailable ? (
                <div className="p-4 bg-neutral-100 text-neutral-800 font-label-caps text-xs uppercase tracking-wider text-center w-full">
                  OPENS AT: {startTime.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              ) : (
                <button
                  onClick={handleStartExam}
                  disabled={starting || !cameraReady || !micReady}
                  className={`w-full sm:w-auto font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-10 transition-all cursor-pointer ${
                    starting || !cameraReady
                      ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                      : "bg-brand-dark hover:bg-brand-crimson text-white border border-brand-dark hover:border-brand-crimson"
                  }`}
                >
                  {starting ? "INITIALIZING TEST..." : (!cameraReady || !micReady) ? "WAITING FOR CAMERA & MIC..." : "START EXAM →"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
