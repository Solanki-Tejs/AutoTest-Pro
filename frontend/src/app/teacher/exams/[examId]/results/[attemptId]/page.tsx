"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/app/lib/auth";
import Modal from "@/app/components/Modal";
import { toast } from "sonner";
import { API_BASE_URL, getAssetUrl } from "@/app/lib/apiConfig";

interface StackedAlert {
  key: string;
  eventType: string;
  description: string;
  count: number;
  timestamps: string[];
  lastTimestamp: string;
  snapshotUrl?: string;
}

function groupAlerts(events: any[]): StackedAlert[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const map = new Map<string, StackedAlert>();

  for (const ev of events) {
    if (!ev) continue;
    const type = String(ev.eventType || ev.event_type || "Violation").trim();
    let desc = "";
    if (typeof ev.details === "string") {
      desc = ev.details.trim();
    } else if (ev.details && typeof ev.details === "object") {
      desc = String(ev.details.description || ev.details.event_type || "").trim();
    } else if (ev.description) {
      desc = String(ev.description).trim();
    }
    if (!desc) {
      desc = `Proctoring alert: ${type.replace(/_/g, " ")}`;
    }

    const snapshot = ev.details?.snapshot_url || ev.snapshot_url;
    const ts = ev.timestamp || "";

    const key = `${type.toUpperCase()}:::${desc.toLowerCase()}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        eventType: type,
        description: desc,
        count: 1,
        timestamps: ts ? [ts] : [],
        lastTimestamp: ts,
        snapshotUrl: snapshot,
      });
    } else {
      const item = map.get(key)!;
      item.count += 1;
      if (ts) {
        item.timestamps.push(ts);
        item.lastTimestamp = ts;
      }
      if (snapshot && !item.snapshotUrl) {
        item.snapshotUrl = snapshot;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function formatAlertTimestamp(ts?: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

export default function AttemptReviewPage(props: {
  params: Promise<{ examId: string; attemptId: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();

  const [answers, setAnswers] = useState<any[]>([]);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [maxMarks, setMaxMarks] = useState<number | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<any | null>(null);
  const [examInfo, setExamInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Flags
  const [activeFilter, setActiveFilter] = useState<"ALL" | "FLAGGED" | "INCORRECT" | "CORRECT">("ALL");
  const [flaggedQIds, setFlaggedQIds] = useState<Set<string>>(new Set());

  // Editing Override
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideMarks, setOverrideMarks] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Approval status
  const [approving, setApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  // Cheating alert modal
  const [showCheatingModal, setShowCheatingModal] = useState(false);

  const token = getStoredToken();
  const BASE_URL = API_BASE_URL;

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const [evalRes, attemptsRes, examRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/evaluation`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BASE_URL}/teacher/exams/${params.examId}/attempts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BASE_URL}/exams/${params.examId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (evalRes.status === "fulfilled" && evalRes.value.ok) {
        const data = await evalRes.value.json();
        setAnswers(data.answers || []);
        setTotalMarks(data.total_marks);
        setMaxMarks(data.max_marks);
      } else {
        const errDetail =
          evalRes.status === "fulfilled"
            ? (await evalRes.value.json().catch(() => ({}))).detail
            : "Failed to fetch evaluation";
        throw new Error(errDetail || "Failed to fetch evaluation");
      }

      if (attemptsRes.status === "fulfilled" && attemptsRes.value.ok) {
        const attemptsData = await attemptsRes.value.json();
        const found = attemptsData.find((a: any) => String(a.id) === String(params.attemptId));
        if (found) {
          setAttemptInfo(found);
          if (found.status === "approved") {
            setIsApproved(true);
          }
        }
      }

      if (examRes.status === "fulfilled" && examRes.value.ok) {
        const examData = await examRes.value.json();
        setExamInfo(examData);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load evaluation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchData();
  }, [params.attemptId, params.examId, token]);

  const handleOverride = async (qId: string) => {
    if (!overrideReason.trim()) {
      toast.error("Adjustment rationale is required");
      return;
    }

    setSubmittingOverride(true);
    try {
      const res = await fetch(
        `${BASE_URL}/teacher/attempts/${params.attemptId}/questions/${qId}/marks`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ marks: Number(overrideMarks), reason: overrideReason.trim() }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to apply marks override");
      }

      toast.success("Score modification successfully saved");
      setEditingId(null);

      // Refresh evaluation data
      const evalRes = await fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/evaluation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (evalRes.ok) {
        const data = await evalRes.json();
        setAnswers(data.answers || []);
        setTotalMarks(data.total_marks);
        setMaxMarks(data.max_marks);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save override");
    } finally {
      setSubmittingOverride(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/review/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to approve review");
      }
      setIsApproved(true);
      toast.success("Results approved and filed to ledger");
    } catch (err: any) {
      toast.error(err.message || "Failed to approve evaluation");
    } finally {
      setApproving(false);
    }
  };

  const toggleFlag = (qId: string) => {
    setFlaggedQIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
        toast.info("Question unflagged");
      } else {
        next.add(qId);
        toast.info("Question flagged for peer review");
      }
      return next;
    });
  };

  const scrollToQuestion = (idx: number) => {
    if (activeFilter !== "ALL") {
      setActiveFilter("ALL");
    }
    setTimeout(() => {
      const el = document.getElementById(`question-${idx + 1}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-[#0047ff]");
        setTimeout(() => el.classList.remove("ring-2", "ring-[#0047ff]"), 2000);
      }
    }, 60);
  };

  // Safe Student Answer renderer
  const renderStudentAnswer = (ansVal: any) => {
    if (ansVal === null || ansVal === undefined || ansVal === "") {
      return <span className="italic text-secondary">No answer recorded</span>;
    }
    if (typeof ansVal === "string" || typeof ansVal === "number" || typeof ansVal === "boolean") {
      return (
        <span className="font-semibold text-on-surface">
          <code className="bg-surface px-2 py-0.5 font-mono text-xs text-on-surface font-bold border border-outline-variant mr-2">
            "{String(ansVal)}"
          </code>
        </span>
      );
    }
    if (Array.isArray(ansVal)) {
      return (
        <div className="flex flex-wrap gap-1.5 items-center">
          {ansVal.map((item, i) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-surface font-mono text-xs font-bold border border-outline-variant text-on-surface"
            >
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <pre className="font-mono text-xs text-on-surface whitespace-pre-wrap bg-surface p-2 border border-outline-variant overflow-x-auto">
        {JSON.stringify(ansVal, null, 2)}
      </pre>
    );
  };

  // Derived metrics
  const rawEvents = attemptInfo?.cheating_summary?.events || [];
  const stackedAlerts = groupAlerts(rawEvents);
  const violationCount = rawEvents.length;

  let correctCount = 0;
  let incorrectCount = 0;
  let partialCount = 0;
  let overridesCount = 0;
  let baselineScore = 0;

  answers.forEach((ans) => {
    const evalData = ans.evaluation || {};
    const curr = evalData.modified_by_teacher
      ? (evalData.teacher_override_marks ?? 0)
      : (evalData.ai_assigned_marks ?? 0);
    const qMax = ans.max_marks || 1;

    baselineScore += evalData.ai_assigned_marks ?? 0;
    if (evalData.modified_by_teacher) overridesCount++;

    if (curr >= qMax) {
      correctCount++;
    } else if (curr === 0) {
      incorrectCount++;
    } else {
      partialCount++;
    }
  });

  const flaggedCount = flaggedQIds.size;
  const currentTotal = totalMarks !== null ? totalMarks : 0;
  const globalAdj = attemptInfo?.adjustment_marks !== undefined && attemptInfo?.adjustment_marks !== null
    ? Number(attemptInfo.adjustment_marks)
    : 0;
  const grandTotal = Math.max(0, currentTotal + globalAdj);
  const currentMax = maxMarks && maxMarks > 0 ? maxMarks : answers.length || 1;
  const scorePercentage = currentMax > 0 ? ((grandTotal / currentMax) * 100).toFixed(1) : "0.0";
  const isPublished = Boolean(attemptInfo?.result_published_at);

  // Filtered list
  const filteredAnswers = answers.filter((ans) => {
    const evalData = ans.evaluation || {};
    const curr = evalData.modified_by_teacher
      ? (evalData.teacher_override_marks ?? 0)
      : (evalData.ai_assigned_marks ?? 0);
    const qMax = ans.max_marks || 1;

    if (activeFilter === "FLAGGED") return flaggedQIds.has(ans.question_id);
    if (activeFilter === "INCORRECT") return curr === 0;
    if (activeFilter === "CORRECT") return curr >= qMax;
    return true;
  });

  const studentName = attemptInfo?.student_name || attemptInfo?.student_email?.split("@")[0] || "Candidate";
  const studentEmail = attemptInfo?.student_email || "candidate@mail.com";
  const examTitle = examInfo?.title || "Exam Assessment";
  const completedDate = attemptInfo?.completed_at
    ? new Date(attemptInfo.completed_at).toUTCString()
    : "RECORDED SESSION";

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-surface flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-12 h-12 border-4 border-[#c4c5da] border-t-[#0047ff] animate-spin mb-4" />
        <h2 className="font-serif text-2xl text-on-surface tracking-tight">
          Loading Evaluation Dossier...
        </h2>
        <span className="font-mono text-xs text-secondary tracking-widest uppercase block mt-2">
          ATTEMPT ID: {params.attemptId}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-screen bg-surface flex flex-col items-center justify-center p-8 text-center font-sans">
        <div className="w-12 h-12 bg-error text-white flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h2 className="font-serif text-2xl text-[#ba1a1a] tracking-tight">
          Failed to Load Evaluation
        </h2>
        <p className="font-sans text-sm text-secondary mt-2 max-w-md">{error}</p>
        <button
          onClick={() => router.push(`/teacher/exams/${params.examId}/results`)}
          className="mt-6 px-6 py-2.5 bg-on-surface text-surface hover:bg-[#0047ff] font-mono text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer"
        >
          Return to Results
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-surface min-h-screen font-sans text-on-surface pb-16">
      {/* ── Sub-header / Back Breadcrumb Bar ── */}
      <div className="w-full bg-surface-container-lowest px-6 md:px-12 py-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/teacher/exams/${params.examId}/results`)}
            className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest font-bold text-on-surface hover:text-[#0047ff] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back to Exam Results</span>
          </button>
          <span className="text-outline-variant">/</span>
          <span className="font-mono text-xs text-secondary uppercase tracking-wider">
            {examTitle}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 bg-[#dde1ff] text-[#001257] font-bold border border-[#c4c5da]">
            ATTEMPT ID: {params.attemptId.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* ── Primary Page Canvas: Asymmetric Editorial Workspace ── */}
      <div className="w-full px-6 md:px-12 py-8 flex flex-col gap-6">
        {/* Dossier Header Block */}
        <div className="w-full bg-surface-container-lowest p-6 md:p-8 border border-outline-variant shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] text-secondary uppercase tracking-wider font-bold">
                TIMESTAMP: {completedDate}
              </span>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl text-on-surface tracking-tight font-normal">
              Review Evaluation
            </h1>
            <p className="font-sans text-sm md:text-base text-secondary leading-relaxed">
              <span className="font-bold text-on-surface">{studentName}</span> (
              <span className="font-mono text-xs text-[#0047ff] tracking-normal">{studentEmail}</span>
              ) — <span className="text-on-surface font-medium">{examTitle}</span>
            </p>
            {(() => {
              const audioAlerts = (attemptInfo?.cheating_summary?.events || []).filter(
                (e: any) => e.eventType === "AUDIO_VIOLATION" || e.eventType === "VOICE_DETECTED"
              );
              if (audioAlerts.length > 0) {
                return (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-300 text-amber-900 font-mono text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-700 text-[18px]">mic</span>
                      <span className="font-bold uppercase">
                        Acoustic Integrity Infraction: {audioAlerts.length} Sound / Talking Incident{audioAlerts.length === 1 ? "" : "s"} Detected
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCheatingModal(true)}
                      className="text-xs uppercase font-bold text-amber-900 underline hover:text-black cursor-pointer"
                    >
                      View Timestamps →
                    </button>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Live Score Badge + Action Matrix */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4">
            <div className="bg-surface-container-low px-6 py-3 border border-outline-variant flex items-baseline gap-4 min-w-[240px] justify-between shadow-sm">
              <span className="font-mono text-[11px] uppercase tracking-widest text-secondary font-bold">
                AGGREGATE SCORE
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-2xl md:text-3xl font-bold text-[#0047ff]">
                  {currentTotal}
                </span>
                <span className="font-mono text-xs text-secondary font-bold">
                  / {currentMax}
                </span>
                <span className="font-mono text-xs text-[#0047ff] font-bold ml-1">
                  ({scorePercentage}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto">
              <button
                onClick={handleApprove}
                disabled={approving || isApproved}
                className={`flex-1 lg:flex-initial px-6 py-3 font-mono text-xs uppercase tracking-wider font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer border ${
                  isApproved
                    ? "bg-[#005430] text-white border-[#005430]"
                    : "bg-[#0047ff] text-white hover:bg-[#0035c5] border-[#0047ff]"
                }`}
              >
                {isApproved ? (
                  <>
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>APPROVED & FILED</span>
                  </>
                ) : approving ? (
                  <span>APPROVING...</span>
                ) : (
                  <>
                    <span>Approve Results</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Security & Integrity Alert Banner */}
        {violationCount > 0 ? (
          <div className="w-full bg-[#ffdad6] text-[#93000a] p-4 border border-[#ba1a1a]/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-[#ba1a1a] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">warning</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#ba1a1a]">
                  PROCTOR INTEGRITY ANOMALY
                </span>
                <span className="font-sans text-sm font-medium text-[#93000a]">
                  {violationCount} Cheating Alert{violationCount === 1 ? "" : "s"} detected during proctored session (
                  {stackedAlerts.slice(0, 2).map((a) => `${a.count}x ${a.eventType}`).join(", ")}
                  {stackedAlerts.length > 2 ? `, and ${stackedAlerts.length - 2} more` : ""}).
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowCheatingModal(true)}
                className="px-4 py-2 bg-[#ba1a1a] text-white font-mono text-[10px] uppercase font-bold tracking-widest hover:bg-[#93000a] transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">visibility</span>
                <span>View Anomaly Ledger ({violationCount})</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full bg-[#e8f5e9] text-[#1b5e20] p-3.5 border border-[#81c784]/40 flex items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-[#2e7d32] text-[20px]">verified_user</span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              PROCTOR INTEGRITY VERIFIED — ZERO IRREGULARITIES OR CHEATING ALERTS DETECTED
            </span>
          </div>
        )}

        {/* Split Assessment Layout: Left Questions Stack (8 Cols) / Right Sticky Rail (4 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* MAIN QUESTION STREAM (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Stream Filter Bar */}
            <div className="bg-surface-container-lowest px-6 py-3 border border-outline-variant shadow-sm flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-mono text-[10px] uppercase tracking-widest text-secondary font-bold">
                  VIEW FILTER:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveFilter("ALL")}
                    className={`px-3 py-1 font-mono text-[11px] uppercase tracking-widest font-bold cursor-pointer transition-colors ${
                      activeFilter === "ALL"
                        ? "bg-[#1b1c1c] text-white"
                        : "bg-surface-container text-secondary hover:bg-surface-container-high"
                    }`}
                  >
                    ALL ({answers.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter("FLAGGED")}
                    className={`px-3 py-1 font-mono text-[11px] uppercase tracking-widest font-bold cursor-pointer transition-colors ${
                      activeFilter === "FLAGGED"
                        ? "bg-[#1b1c1c] text-white"
                        : "bg-surface-container text-secondary hover:bg-surface-container-high"
                    }`}
                  >
                    FLAGGED ({flaggedCount})
                  </button>
                  <button
                    onClick={() => setActiveFilter("INCORRECT")}
                    className={`px-3 py-1 font-mono text-[11px] uppercase tracking-widest font-bold cursor-pointer transition-colors ${
                      activeFilter === "INCORRECT"
                        ? "bg-[#ba1a1a] text-white"
                        : "bg-surface-container text-secondary hover:bg-surface-container-high"
                    }`}
                  >
                    INCORRECT ({incorrectCount})
                  </button>
                  <button
                    onClick={() => setActiveFilter("CORRECT")}
                    className={`px-3 py-1 font-mono text-[11px] uppercase tracking-widest font-bold cursor-pointer transition-colors ${
                      activeFilter === "CORRECT"
                        ? "bg-[#005430] text-white"
                        : "bg-surface-container text-secondary hover:bg-surface-container-high"
                    }`}
                  >
                    CORRECT ({correctCount})
                  </button>
                </div>
              </div>
              <span className="font-mono text-[10px] text-secondary uppercase tracking-widest">
                DISPLAYING: {filteredAnswers.length} OF {answers.length} QUESTIONS
              </span>
            </div>

            {/* Question Cards List */}
            {filteredAnswers.length === 0 ? (
              <div className="bg-surface-container-lowest p-12 border border-outline-variant text-center">
                <span className="font-serif text-lg text-secondary">
                  No questions match the selected filter.
                </span>
                <button
                  onClick={() => setActiveFilter("ALL")}
                  className="mt-4 px-4 py-2 bg-on-surface text-surface font-mono text-xs uppercase font-bold tracking-widest block mx-auto cursor-pointer"
                >
                  Clear Filter
                </button>
              </div>
            ) : (
              filteredAnswers.map((ans, idx) => {
                const evalData = ans.evaluation || {};
                const isEditing = editingId === ans.question_id;
                const isFlagged = flaggedQIds.has(ans.question_id);

                const currentScore = evalData.modified_by_teacher
                  ? (evalData.teacher_override_marks ?? 0)
                  : (evalData.ai_assigned_marks ?? 0);
                const qMax = ans.max_marks || 1;
                const isFullScore = currentScore >= qMax;
                const isZeroScore = currentScore === 0;

                // Index in the original answers array for numbering
                const originalIndex = answers.findIndex(
                  (item) => item.question_id === ans.question_id
                );
                const qNumber = originalIndex !== -1 ? originalIndex + 1 : idx + 1;
                const qNumberFormatted = `Q${String(qNumber).padStart(2, "0")}`;

                return (
                  <article
                    key={ans.question_id || idx}
                    id={`question-${qNumber}`}
                    className="bg-surface-container-lowest shadow-sm flex flex-col border border-outline-variant transition-all"
                  >
                    {/* Card Header & Metadata */}
                    <div className="p-6 bg-surface-container-lowest flex flex-col gap-2 border-b border-outline-variant">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest ${
                              isZeroScore
                                ? "bg-[#ba1a1a] text-white"
                                : isFullScore
                                ? "bg-[#1b1c1c] text-white"
                                : "bg-surface-container-high text-on-surface"
                            }`}
                          >
                            {qNumberFormatted}
                          </span>
                          <span className="font-mono text-[10px] text-secondary uppercase tracking-wider font-bold">
                            {ans.question_type || "ASSESSMENT QUESTION"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isFullScore ? (
                            <span className="px-2.5 py-1 bg-[#005430] text-white font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">check</span>
                              <span>Marks: {currentScore} / {qMax}</span>
                            </span>
                          ) : isZeroScore ? (
                            <span className="px-2.5 py-1 bg-[#ffdad6] text-[#93000a] font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-1 border border-[#ba1a1a]/20">
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              <span>Marks: {currentScore} / {qMax}</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-surface-container-high text-on-surface font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-1 border border-outline-variant">
                              <span className="material-symbols-outlined text-[14px]">tune</span>
                              <span>Marks: {currentScore} / {qMax}</span>
                            </span>
                          )}

                          {evalData.modified_by_teacher && (
                            <span className="px-2 py-0.5 bg-[#dde1ff] text-[#001257] font-mono text-[10px] font-bold uppercase tracking-widest border border-[#c4c5da]">
                              OVERRIDDEN
                            </span>
                          )}
                        </div>
                      </div>

                      <h2 className="font-serif text-xl md:text-2xl text-on-surface tracking-tight mt-1 font-medium leading-snug">
                        {ans.question_text || `Question ${qNumber}`}
                      </h2>

                      <div className="font-mono text-[10px] text-secondary uppercase tracking-wider">
                        QID: <span className="text-on-surface font-bold">{ans.question_id}</span>
                      </div>
                    </div>

                    {/* Responses & AI Evaluation Segment */}
                    <div className="p-6 flex flex-col gap-4">
                      {/* Student Answer Box */}
                      <div
                        className={`p-4 border ${
                          isZeroScore
                            ? "bg-[#ffdad6]/20 border-[#ffdad6]"
                            : "bg-surface-container-low border-outline-variant/60"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[10px] text-secondary uppercase tracking-widest font-bold">
                            RECORDED CANDIDATE SELECTION
                          </span>
                          <span
                            className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                              isFullScore
                                ? "text-[#005430]"
                                : isZeroScore
                                ? "text-[#ba1a1a]"
                                : "text-secondary"
                            }`}
                          >
                            {isFullScore
                              ? "MATCH CONFIRMED"
                              : isZeroScore
                              ? "DISCREPANCY DETECTED"
                              : "PARTIAL / EVALUATED"}
                          </span>
                        </div>
                        <div className="font-sans text-sm md:text-base text-on-surface font-medium leading-relaxed">
                          {renderStudentAnswer(ans.answer)}
                        </div>
                      </div>

                      {/* AI Feedback Box */}
                      <div className="bg-surface-container p-4 border border-outline-variant flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <div
                            className={`flex items-center gap-1.5 font-bold font-mono text-xs uppercase tracking-wider ${
                              isZeroScore ? "text-[#ba1a1a]" : "text-[#0047ff]"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isZeroScore ? "cancel" : "smart_toy"}
                            </span>
                            <span>
                              AI Feedback:{" "}
                              {evalData.ai_feedback || (isFullScore ? "Correct" : isZeroScore ? "Incorrect" : "Evaluated")}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-secondary font-bold uppercase tracking-widest">
                            Confidence: {evalData.ai_confidence_level !== undefined && evalData.ai_confidence_level !== null ? evalData.ai_confidence_level : "1.00"}
                          </span>
                        </div>
                        {evalData.ai_justification && (
                          <p className="font-mono text-xs text-on-surface tracking-normal leading-relaxed mt-1">
                            <span className="text-secondary font-bold">Justification: </span>
                            {evalData.ai_justification}
                          </p>
                        )}
                      </div>

                      {/* Overridden Reason display if present */}
                      {evalData.modified_by_teacher && evalData.override_reason && (
                        <div className="bg-[#dde1ff]/40 p-4 border border-[#c4c5da] flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#001257]">
                            <span className="material-symbols-outlined text-[14px]">edit_note</span>
                            <span>Teacher Adjustment Rationale</span>
                          </div>
                          <p className="font-sans text-xs text-on-surface italic">
                            "{evalData.override_reason}"
                          </p>
                        </div>
                      )}

                      {/* Teacher Action Segment */}
                      <div className="pt-2 flex items-center justify-between flex-wrap gap-4 border-t border-outline-variant/60">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (isPublished) {
                                toast.error("Results published and locked against modification");
                                return;
                              }
                              if (isEditing) {
                                setEditingId(null);
                              } else {
                                setEditingId(ans.question_id);
                                setOverrideMarks(currentScore);
                                setOverrideReason(evalData.override_reason || "");
                              }
                            }}
                            disabled={isPublished}
                            className="px-4 py-2 bg-[#1b1c1c] text-white hover:bg-[#0047ff] font-mono text-[11px] uppercase tracking-widest font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            <span>{isPublished ? "Locked" : isEditing ? "Close Override" : "Override Marks"}</span>
                          </button>

                          <button
                            onClick={() => toggleFlag(ans.question_id)}
                            className={`px-4 py-2 font-mono text-[11px] uppercase tracking-widest font-bold inline-flex items-center gap-1 transition-colors cursor-pointer border ${
                              isFlagged
                                ? "bg-[#ffdad6] text-[#ba1a1a] border-[#ba1a1a]"
                                : "bg-surface-container hover:bg-surface-container-high text-on-surface border-outline-variant"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {isFlagged ? "flag_circle" : "flag"}
                            </span>
                            <span>{isFlagged ? "Flagged" : "Flag Question"}</span>
                          </button>
                        </div>

                        <span className="font-mono text-[10px] text-secondary uppercase tracking-wider">
                          {evalData.modified_by_teacher
                            ? "AUDITED BY INSTRUCTOR"
                            : "AUTO-GRADED VIA RULES ENGINE"}
                        </span>
                      </div>

                      {/* Interactive Override Form */}
                      {isEditing && (
                        <div className="bg-surface-container-high p-4 flex flex-col gap-3 mt-1 border border-outline-variant">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                              MANUAL SCORE MODIFICATION ({qNumberFormatted})
                            </span>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-on-surface hover:text-error text-[18px] material-symbols-outlined cursor-pointer"
                            >
                              close
                            </button>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <label className="font-mono text-[11px] text-secondary uppercase">
                                New Mark (0 to {qMax}):
                              </label>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={qMax}
                                value={overrideMarks}
                                onChange={(e) => setOverrideMarks(parseFloat(e.target.value) || 0)}
                                className="w-24 px-3 py-1.5 bg-surface-container-lowest text-on-surface font-mono text-sm text-center outline-none font-bold border border-outline-variant focus:border-[#0047ff]"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Mandatory adjustment rationale..."
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              className="flex-1 min-w-[220px] px-3 py-1.5 bg-surface-container-lowest text-on-surface font-sans text-sm outline-none border border-outline-variant focus:border-[#0047ff]"
                            />
                            <button
                              onClick={() => handleOverride(ans.question_id)}
                              disabled={submittingOverride}
                              className="px-5 py-1.5 bg-[#0047ff] text-white hover:bg-[#0035c5] font-mono text-xs uppercase font-bold tracking-widest disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
                            >
                              {submittingOverride ? "Applying..." : "Apply Mark"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* RIGHT DIAGNOSTIC COMPANION SIDEBAR / STICKY RAIL (4 Cols) */}
          <aside className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-16">
            {/* MODULE 1: Question 1-N Matrix Navigator */}
            <div className="bg-surface-container-lowest p-6 border border-outline-variant shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-surface-container pb-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                  ASSESSMENT MATRIX
                </span>
                <span className="font-mono text-[10px] text-secondary uppercase font-bold">
                  {answers.length} TOTAL ITEMS
                </span>
              </div>
              <p className="font-sans text-xs text-secondary leading-relaxed">
                Click any cell to navigate directly to question telemetry and AI rationale.
              </p>

              {/* Matrix Grid */}
              <div className="grid grid-cols-5 gap-1.5 font-mono text-xs font-bold text-center">
                {answers.map((ans, idx) => {
                  const evalData = ans.evaluation || {};
                  const curr = evalData.modified_by_teacher
                    ? (evalData.teacher_override_marks ?? 0)
                    : (evalData.ai_assigned_marks ?? 0);
                  const qMax = ans.max_marks || 1;
                  const isCorrect = curr >= qMax;
                  const isWrong = curr === 0;

                  return (
                    <button
                      key={ans.question_id || idx}
                      onClick={() => scrollToQuestion(idx)}
                      className={`py-2.5 flex items-center justify-center transition-all cursor-pointer font-bold ${
                        isCorrect
                          ? "bg-[#005430] text-white hover:opacity-85"
                          : isWrong
                          ? "bg-[#ba1a1a] text-white hover:opacity-85"
                          : "bg-surface-container-high text-on-surface hover:opacity-85"
                      }`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-[11px] font-mono text-secondary pt-1 border-t border-surface-container">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#005430] inline-block" /> Correct ({correctCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#ba1a1a] inline-block" /> Wrong ({incorrectCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-surface-container-high inline-block" /> Partial ({partialCount})
                </span>
              </div>
            </div>

            {/* MODULE 2: Live Proctoring & Anomaly Timeline */}
            <div className="bg-surface-container-lowest p-6 border border-outline-variant shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-surface-container pb-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      violationCount > 0 ? "text-[#ba1a1a]" : "text-[#005430]"
                    }`}
                  >
                    {violationCount > 0 ? "videocam_off" : "videocam"}
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                    PROCTOR INCIDENT FEED
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    violationCount > 0
                      ? "bg-[#ba1a1a] text-white"
                      : "bg-[#005430] text-white"
                  }`}
                >
                  {violationCount} FLAGS
                </span>
              </div>

              {rawEvents.length > 0 ? (
                <>
                  <p className="font-sans text-xs text-secondary">
                    Session surveillance highlights recorded during examination interval.
                  </p>
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {stackedAlerts.slice(0, 5).map((alert, i) => (
                      <div
                        key={alert.key || i}
                        className="bg-surface-container-low p-3 border border-outline-variant/60 flex items-start gap-2.5"
                      >
                        <div className="w-2 h-2 mt-1.5 bg-[#ba1a1a] shrink-0" />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-on-surface uppercase truncate">
                              {alert.eventType} ({alert.count}x)
                            </span>
                            <span className="font-mono text-[10px] text-secondary shrink-0">
                              {formatAlertTimestamp(alert.lastTimestamp)}
                            </span>
                          </div>
                          <span className="font-sans text-xs text-secondary mt-0.5 line-clamp-2">
                            {alert.description}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowCheatingModal(true)}
                    className="w-full py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-[11px] uppercase tracking-wider font-bold border border-outline-variant transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                    <span>View All {violationCount} Violations</span>
                  </button>
                </>
              ) : (
                <div className="py-6 text-center text-secondary">
                  <span className="material-symbols-outlined text-3xl text-[#005430] mb-1">
                    check_circle
                  </span>
                  <p className="font-sans text-xs font-medium">
                    No proctoring anomalies or suspicious activities logged.
                  </p>
                </div>
              )}
            </div>

            {/* MODULE 3: Grade Summary & Adjustment Calculator */}
            <div className="bg-surface-container-lowest p-6 border border-outline-variant shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-surface-container pb-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                  AUDITED GRADE LEDGER
                </span>
                <span className="font-mono text-[10px] text-[#0047ff] uppercase font-bold">
                  {isApproved ? "APPROVED" : "PENDING AUDIT"}
                </span>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="flex justify-between items-center text-secondary">
                  <span>Baseline Rules Score:</span>
                  <span className="text-on-surface font-bold">{baselineScore.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center text-secondary">
                  <span>Manual Modifications:</span>
                  <span className="text-on-surface font-bold">{overridesCount} Items</span>
                </div>
                {globalAdj !== 0 && (
                  <div className="flex justify-between items-center text-secondary">
                    <span>Global Adjustment:</span>
                    <span className={`font-bold ${globalAdj > 0 ? "text-[#005430]" : "text-[#ba1a1a]"}`}>
                      {globalAdj > 0 ? `+${globalAdj.toFixed(1)}` : globalAdj.toFixed(1)} PTS
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-secondary">
                  <span>Final Total Score:</span>
                  <span className="text-[#0047ff] font-bold text-sm">
                    {grandTotal.toFixed(1)} / {currentMax}
                  </span>
                </div>
                <div className="flex justify-between items-center text-secondary">
                  <span>Performance Quotient:</span>
                  <span className="text-on-surface font-bold">{scorePercentage}%</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-outline-variant text-secondary">
                  <span>Institutional Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 text-[10px] uppercase ${
                      parseFloat(scorePercentage) >= 40
                        ? "bg-[#005430] text-white"
                        : "bg-[#ffdad6] text-[#93000a]"
                    }`}
                  >
                    {parseFloat(scorePercentage) >= 40 ? "PASSING GRADE" : "REMEDIATION REQUIRED"}
                  </span>
                </div>
              </div>

              <button
                onClick={handleApprove}
                disabled={approving || isApproved || isPublished}
                className={`w-full py-3 font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPublished
                    ? "bg-surface-container text-secondary"
                    : isApproved
                    ? "bg-[#005430] text-white"
                    : "bg-[#0047ff] text-white hover:bg-[#0035c5]"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isPublished ? "lock" : isApproved ? "check_circle" : "verified"}
                </span>
                <span>
                  {isPublished
                    ? "RESULTS FINALIZED & LOCKED"
                    : isApproved
                    ? "RESULTS FILED TO TRANSCRIPT"
                    : "AUTHORIZE & FILE RESULTS"}
                </span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Stacked Proctoring Anomaly Modal ── */}
      <Modal
        isOpen={showCheatingModal}
        onClose={() => setShowCheatingModal(false)}
        title="PROCTOR INTEGRITY ANOMALIES"
        subtitle={`${studentName} (${studentEmail}) — ${violationCount} Total Violation Events`}
        badge="TELEMETRY AUDIT"
        maxWidth="max-w-[720px]"
      >
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto font-sans">
          <p className="text-xs text-secondary">
            Violations are stacked and deduplicated by incident type. Expand timestamps to audit individual alerts.
          </p>

          {stackedAlerts.length === 0 ? (
            <div className="text-center py-8 text-secondary">No recorded alerts.</div>
          ) : (
            <div className="space-y-3">
              {stackedAlerts.map((alert, idx) => (
                <div
                  key={alert.key || idx}
                  className="bg-surface-container-lowest p-4 border border-[#ba1a1a]/30 shadow-xs flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#ba1a1a] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                        {alert.count}x OCCURRENCE{alert.count === 1 ? "" : "S"}
                      </span>
                      <span className="font-mono text-xs font-bold text-on-surface uppercase">
                        {alert.eventType}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-secondary">
                      Last: {formatAlertTimestamp(alert.lastTimestamp)}
                    </span>
                  </div>

                  <p className="font-sans text-xs text-on-surface leading-relaxed">
                    {alert.description}
                  </p>

                  {alert.snapshotUrl && (
                    <div className="mt-2">
                      <span className="font-mono text-[10px] text-secondary uppercase font-bold block mb-1">
                        Surveillance Frame Snapshot:
                      </span>
                      <img
                        src={getAssetUrl(alert.snapshotUrl)}
                        alt="Violation snapshot"
                        className="w-full max-h-48 object-contain border border-outline-variant bg-black"
                      />
                    </div>
                  )}

                  {alert.timestamps.length > 1 && (
                    <div className="mt-1 pt-2 border-t border-outline-variant/40">
                      <span className="font-mono text-[10px] text-secondary uppercase font-bold block mb-1">
                        Recorded Timestamps:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {alert.timestamps.map((t, ti) => (
                          <span
                            key={ti}
                            className="px-2 py-0.5 bg-surface-container text-on-surface font-mono text-[10px]"
                          >
                            {formatAlertTimestamp(t)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-outline-variant flex justify-end">
            <button
              onClick={() => setShowCheatingModal(false)}
              className="px-6 py-2 bg-on-surface text-surface font-mono text-xs uppercase font-bold tracking-widest hover:bg-[#0047ff] transition-colors cursor-pointer"
            >
              Close Ledger
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
