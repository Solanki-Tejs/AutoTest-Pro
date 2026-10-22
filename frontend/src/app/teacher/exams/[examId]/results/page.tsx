"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/app/lib/auth";
import Modal from "@/app/components/Modal";
import { toast } from "sonner";
import { API_BASE_URL } from "@/app/lib/apiConfig";

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

export default function ExamResultsPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();

  const [exam, setExam] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cheatingModal, setCheatingModal] = useState<{ isOpen: boolean; events: any[]; student: string }>({
    isOpen: false,
    events: [],
    student: "",
  });
  const [updatingAdj, setUpdatingAdj] = useState<string | null>(null);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "evaluated" | "pending" | "manual">("all");
  const [filterAnomaly, setFilterAnomaly] = useState<"all" | "flagged" | "clean" | "audio">("all");

  // CSV Modal
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const availableColumns = [
    { id: "student", label: "Student" },
    { id: "status", label: "Status" },
    { id: "cheating", label: "Cheating Alerts" },
    { id: "eval", label: "Eval Marks" },
    { id: "adjust", label: "Adjust Marks" },
    { id: "total", label: "Total Marks" },
    { id: "result", label: "Result" },
    { id: "date", label: "Submitted At" },
  ];
  const [selectedCols, setSelectedCols] = useState<string[]>(availableColumns.map((c) => c.id));

  useEffect(() => {
    fetchData();
  }, [params.examId]);

  const fetchData = async () => {
    const token = getStoredToken();
    if (!token) return;

    setLoading(true);
    try {
      const [attemptsRes, examRes] = await Promise.all([
        fetch(`${API_BASE_URL}/teacher/exams/${params.examId}/attempts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/exams/${params.examId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!attemptsRes.ok) {
        const errJson = await attemptsRes.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to fetch student attempts");
      }
      const attemptsData = await attemptsRes.json();
      setAttempts(attemptsData);

      if (examRes.ok) {
        const examData = await examRes.json();
        setExam(examData);
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishResults = async () => {
    if (!confirm("PUBLISH VERIFIED RESULTS: This will finalize scores and notify candidates with authoritative transcripts. Proceed?")) return;
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/teacher/exams/${params.examId}/results/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to publish results");
      toast.success("Results published successfully!");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to publish");
    }
  };

  const handleUpdateAdjustment = async (attemptId: string, adj: number | string) => {
    if (isPublished) return toast.error("Results are published and locked against modification");
    const numAdj = typeof adj === "number" ? adj : parseFloat(adj);
    if (isNaN(numAdj)) return toast.error("Invalid mark adjustment");

    setUpdatingAdj(attemptId);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE_URL}/teacher/attempts/${attemptId}/global_marks`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adjustment: numAdj }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to update marks");

      setAttempts((prev) => prev.map((a) => (a.id === attemptId ? { ...a, adjustment_marks: numAdj } : a)));
      toast.success("Adjustment marks updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update adjustment");
    } finally {
      setUpdatingAdj(null);
    }
  };

  const handleDeltaAdjustment = (attemptId: string, currentAdj: number, delta: number) => {
    const newAdj = currentAdj + delta;
    handleUpdateAdjustment(attemptId, newAdj);
  };

  const handleDownloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = availableColumns.filter((c) => selectedCols.includes(c.id)).map((c) => c.label);
    csvContent += headers.join(",") + "\n";

    attempts.forEach((a) => {
      const row = [];
      const evalMarks = a.total_marks !== null ? Number(a.total_marks) : 0;
      const adjMarks = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
      const finalMarks = evalMarks + adjMarks;
      const maxMarks = a.max_marks || exam?.total_marks || 100;
      const isPass = maxMarks > 0 ? finalMarks / maxMarks >= 0.4 : false;
      const violationCount = a.cheating_summary?.events?.length || 0;

      if (selectedCols.includes("student")) row.push(`"${a.student_name || ""} (${a.student_email || ""})"`);
      if (selectedCols.includes("status")) row.push(`"${a.status}"`);
      if (selectedCols.includes("cheating")) row.push(`"${violationCount} Alerts"`);
      if (selectedCols.includes("eval")) row.push(`"${evalMarks}"`);
      if (selectedCols.includes("adjust")) row.push(`"${adjMarks}"`);
      if (selectedCols.includes("total")) row.push(`"${finalMarks}"`);
      if (selectedCols.includes("result")) row.push(`"${a.status === "evaluated" ? (isPass ? "PASS" : "FAIL") : "-"}"`);
      if (selectedCols.includes("date")) row.push(`"${a.completed_at ? new Date(a.completed_at).toLocaleString() : "-"}"`);

      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Exam_Results_${params.examId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowDownloadModal(false);
    toast.success("CSV export downloaded successfully");
  };

  const formatAttemptDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
    } catch {
      return dateStr;
    }
  };

  const formatAttemptTime = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) + " UTC";
    } catch {
      return "";
    }
  };

  // KPIs
  const totalSubmissions = attempts.length;
  const evaluatedAttempts = attempts.filter((a) => a.status === "evaluated");
  const pendingAttempts = attempts.filter((a) => a.status !== "evaluated");
  const evaluatedCount = evaluatedAttempts.length;
  const evalPct = totalSubmissions > 0 ? Math.round((evaluatedCount / totalSubmissions) * 100) : 0;

  const passingCount = evaluatedAttempts.filter((a) => {
    const finalMarks = (a.total_marks || 0) + (a.adjustment_marks || 0);
    const maxMarks = a.max_marks || exam?.total_marks || 100;
    return maxMarks > 0 && finalMarks / maxMarks >= 0.4;
  }).length;
  const deficientCount = evaluatedCount - passingCount;
  const passingPct = evaluatedCount > 0 ? Math.round((passingCount / evaluatedCount) * 100) : 0;
  const passRate = evaluatedCount > 0 ? Math.round((passingCount / evaluatedCount) * 100) : 0;

  const isPublished = attempts.length > 0 && attempts.some((a) => a.result_published_at !== null && a.result_published_at !== undefined);
  const isDueDatePassed = exam?.end_time ? new Date() >= new Date(exam.end_time) : true;
  const hasPending = pendingAttempts.length > 0;
  const hasNoAttempts = totalSubmissions === 0;
  const canPublish = !isPublished && isDueDatePassed && !hasPending && !hasNoAttempts;

  // Filtered rows
  const filteredAttempts = attempts.filter((a) => {
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim();
      const email = (a.student_email || "").toLowerCase();
      const name = (a.student_name || "").toLowerCase();
      const uid = `stu-${a.student_id}`.toLowerCase();
      if (!email.includes(q) && !name.includes(q) && !uid.includes(q)) return false;
    }
    if (filterStatus === "evaluated" && a.status !== "evaluated") return false;
    if (filterStatus === "pending" && a.status === "evaluated") return false;
    if (filterStatus === "manual") {
      const adj = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
      if (adj === 0) return false;
    }
    const alerts = a.cheating_summary?.events?.length || 0;
    if (filterAnomaly === "flagged" && alerts === 0) return false;
    if (filterAnomaly === "clean" && alerts > 0) return false;
    if (filterAnomaly === "audio") {
      const hasAudio = (a.cheating_summary?.events || []).some(
        (e: any) => e.eventType === "AUDIO_VIOLATION" || e.eventType === "VOICE_DETECTED"
      );
      if (!hasAudio) return false;
    }
    if (filterAnomaly === "audio") {
      const hasAudio = (a.cheating_summary?.events || []).some(
        (e: any) => e.eventType === "AUDIO_VIOLATION" || e.eventType === "VOICE_DETECTED"
      );
      if (!hasAudio) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-black border-t-[#0047ff] animate-spin mx-auto" />
          <h2 className="font-serif text-2xl text-on-surface font-semibold tracking-tight">
            Synchronizing Evaluation Ledger...
          </h2>
          <span className="font-mono text-xs text-secondary tracking-widest uppercase block">
            EXAM ID: {params.examId}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-surface min-h-screen font-sans text-on-surface">
      {/* ── Top Context Breadcrumbs & Assessment Identifier ── */}
      <div className="px-6 md:px-12 pt-6 pb-3 bg-surface flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant">
        <div className="flex items-center gap-3 font-sans text-xs uppercase tracking-wider text-secondary">
          <button
            onClick={() => router.push("/teacher/dashboard")}
            className="inline-flex items-center gap-1.5 text-on-surface hover:text-[#0047ff] transition-colors font-bold cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>EXAM REGISTRY</span>
          </button>
          <span>/</span>
          <span className="font-mono text-xs text-on-surface font-bold">
            {exam?.title || "ASSESSMENT EVALUATION"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 bg-[#dde1ff] text-[#001257] font-bold border border-[#c4c5da]">
            EXAM ID: {params.examId.slice(0, 8)}...
          </span>
        </div>
      </div>

      {/* ── Primary Editorial Header Bar ── */}
      <div className="px-6 md:px-12 py-8 bg-surface-container-lowest border-b border-outline-variant flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="flex flex-col max-w-3xl">
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-on-surface tracking-tight leading-tight font-normal">
            Exam Evaluation &amp; Results
          </h1>
          <p className="font-sans text-sm md:text-base text-secondary max-w-2xl mt-2 leading-relaxed">
            Review candidate telemetry records, administer authoritative global score adjustments, and release institutional verified grade transcripts.
          </p>
        </div>

        {/* Global Ledger Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => setShowDownloadModal(true)}
            className="h-12 px-6 bg-surface-container-lowest text-on-surface hover:bg-surface-container font-sans text-xs uppercase tracking-wider border border-black flex items-center gap-2 shadow-[2px_2px_0px_#111111] transition-all cursor-pointer font-bold active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            <span>EXPORT CSV</span>
          </button>
          <button
            onClick={handlePublishResults}
            disabled={!canPublish}
            title={
              isPublished
                ? "Results are already published and finalized"
                : !isDueDatePassed
                ? `Cannot publish before exam due date (${formatAttemptDate(exam?.end_time)})`
                : hasPending
                ? `${pendingAttempts.length} paper(s) pending evaluation`
                : hasNoAttempts
                ? "No student submissions to publish"
                : "Publish all results"
            }
            className={`h-12 px-7 font-sans text-xs uppercase tracking-wider font-bold flex items-center gap-2 shadow-[4px_4px_0px_#111111] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isPublished
                ? "bg-[#005430] text-white cursor-default shadow-none"
                : "bg-[#0047ff] text-white hover:bg-black active:translate-x-[2px] active:translate-y-[2px]"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isPublished ? "check_circle" : "verified"}
            </span>
            <span>{isPublished ? "RESULTS PUBLISHED" : "PUBLISH ALL RESULTS"}</span>
            {!isPublished && <span>→</span>}
          </button>
        </div>
      </div>

      {/* ── KPI Precision Grid (4 Sharp Brutalist Cards) ── */}
      <div className="px-6 md:px-12 py-8 bg-surface border-b border-outline-variant">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Submissions */}
          <div className="bg-surface-container-lowest p-6 border border-black shadow-[4px_4px_0px_#111111] flex flex-col justify-between h-40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-secondary font-medium">
                TOTAL SUBMISSIONS
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-surface-container text-on-surface uppercase font-bold">
                REGISTRY
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <span className="font-serif text-4xl leading-none text-on-surface font-normal">
                {totalSubmissions}
              </span>
              <span className="font-mono text-xs text-secondary font-semibold">
                {totalSubmissions} LOGGED
              </span>
            </div>
            <div className="w-full bg-surface-container h-1 mt-3">
              <div className="bg-black h-1 w-full" />
            </div>
          </div>

          {/* Card 2: Evaluated */}
          <div className="bg-surface-container-lowest p-6 border border-black shadow-[4px_4px_0px_#111111] flex flex-col justify-between h-40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#0047ff] font-bold">
                EVALUATED
              </span>
              <span className="w-2.5 h-2.5 bg-[#0047ff]" />
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <span className="font-serif text-4xl leading-none text-[#0047ff] font-normal">
                {evaluatedCount}
              </span>
              <span className="font-mono text-xs text-[#0047ff] font-bold">
                {evalPct}% COMPLETE
              </span>
            </div>
            <div className="w-full bg-surface-container h-1 mt-3">
              <div className="bg-[#0047ff] h-1 transition-all duration-500" style={{ width: `${evalPct}%` }} />
            </div>
          </div>

          {/* Card 3: Passing Candidates */}
          <div className="bg-surface-container-lowest p-6 border border-black shadow-[4px_4px_0px_#111111] flex flex-col justify-between h-40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#ba1a1a] font-bold">
                PASSING CANDIDATES
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#ffdad6] text-[#93000a] font-bold">
                THRESHOLD 40%
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <span className="font-serif text-4xl leading-none text-[#ba1a1a] font-normal">
                {passingCount}
              </span>
              <span className="font-mono text-xs text-[#ba1a1a] font-medium">
                {deficientCount} DEFICIENT
              </span>
            </div>
            <div className="w-full bg-surface-container h-1 mt-3">
              <div className="bg-[#ba1a1a] h-1 transition-all duration-500" style={{ width: `${passingPct}%` }} />
            </div>
          </div>

          {/* Card 4: Pass Rate */}
          <div className="bg-surface-container-lowest p-6 border border-black shadow-[4px_4px_0px_#111111] flex flex-col justify-between h-40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#005430] font-bold">
                PASS RATE
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#7afbb1]/30 text-[#005430] font-bold">
                ACCREDITED
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-auto">
              <span className="font-serif text-4xl leading-none text-on-surface font-normal">
                {passRate}%
              </span>
              <span className="font-mono text-xs text-secondary font-medium">
                OF EVALUATED
              </span>
            </div>
            <div className="w-full bg-surface-container h-1 mt-3">
              <div className="bg-[#005430] h-1 transition-all duration-500" style={{ width: `${passRate}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Operational Filter Strip & Bulk Control Bar ── */}
      <div className="px-6 md:px-12 py-4 bg-surface-container-lowest border-b border-outline-variant flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
              <span className="material-symbols-outlined text-[18px]">search</span>
            </span>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-surface text-on-surface border border-black font-sans text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#0047ff] placeholder:text-secondary"
              placeholder="SEARCH STUDENT / EMAIL / UID..."
            />
          </div>

          {/* Filter: Evaluation Status */}
          <div className="flex items-center">
            <select
              value={filterStatus}
              onChange={(e: any) => setFilterStatus(e.target.value)}
              className="h-10 px-4 bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#0047ff] cursor-pointer"
            >
              <option value="all">STATUS: ALL CANDIDATES ({totalSubmissions})</option>
              <option value="evaluated">STATUS: EVALUATED ({evaluatedCount})</option>
              <option value="pending">STATUS: PENDING ({pendingAttempts.length})</option>
              <option value="manual">STATUS: HAS ADJUSTMENT</option>
            </select>
          </div>

          {/* Filter: Integrity & Anomaly Flags */}
          <div className="flex items-center">
            <select
              value={filterAnomaly}
              onChange={(e: any) => setFilterAnomaly(e.target.value)}
              className="h-10 px-4 bg-surface text-on-surface border border-black font-mono text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#0047ff] cursor-pointer"
            >
              <option value="all">ALL INTEGRITY RECORDS</option>
              <option value="flagged">ANOMALY FLAGGED (&gt;0 ALERTS)</option>
              <option value="clean">CLEAN TELEMETRY</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-secondary shrink-0">
          <span>SHOWING {filteredAttempts.length} OF {attempts.length} RECORDS</span>
        </div>
      </div>

      {/* ── Primary Assessment Ledger (Tabular Architecture) ── */}
      <div className="px-6 md:px-12 py-8 bg-surface">
        {isPublished && (
          <div className="mb-6 p-4 bg-[#e8f5e9] border-2 border-[#2e7d32] text-[#1b5e20] flex items-center gap-3 shadow-[3px_3px_0px_#2e7d32]">
            <span className="material-symbols-outlined text-2xl">verified</span>
            <div>
              <p className="font-bold text-xs uppercase font-mono tracking-wider">Results Released &amp; Finalized</p>
              <p className="text-xs">Official transcripts have been released to candidates. Mark overrides and score adjustments are locked against further changes.</p>
            </div>
          </div>
        )}
        {!isPublished && !isDueDatePassed && (
          <div className="mb-6 p-4 bg-[#fff8e1] border-2 border-[#f57f17] text-[#e65100] flex items-center gap-3 shadow-[3px_3px_0px_#f57f17]">
            <span className="material-symbols-outlined text-2xl">schedule</span>
            <div>
              <p className="font-bold text-xs uppercase font-mono tracking-wider">Exam Window Open (Due Date Pending)</p>
              <p className="text-xs">
                Results cannot be published until the exam end time ({formatAttemptDate(exam?.end_time)} {formatAttemptTime(exam?.end_time)}) has elapsed.
              </p>
            </div>
          </div>
        )}
        {!isPublished && isDueDatePassed && hasPending && (
          <div className="mb-6 p-4 bg-[#fff3e0] border-2 border-[#e65100] text-[#bf360c] flex items-center gap-3 shadow-[3px_3px_0px_#e65100]">
            <span className="material-symbols-outlined text-2xl">pending_actions</span>
            <div>
              <p className="font-bold text-xs uppercase font-mono tracking-wider">Pending Evaluations</p>
              <p className="text-xs">
                {pendingAttempts.length} student submission(s) are still pending evaluation. All student papers must be fully evaluated before results can be published.
              </p>
            </div>
          </div>
        )}

        <div className="border border-black bg-surface-container-lowest shadow-[6px_6px_0px_#111111] overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black bg-surface-container font-mono text-[10px] uppercase tracking-wider text-on-surface">
                  <th className="py-3.5 px-4 font-bold" scope="col">STUDENT RECORD</th>
                  <th className="py-3.5 px-4 font-bold" scope="col">STATUS</th>
                  <th className="py-3.5 px-4 font-bold" scope="col">CHEATING ALERTS</th>
                  <th className="py-3.5 px-4 font-bold text-center" scope="col">AI EVAL</th>
                  <th className="py-3.5 px-4 font-bold text-center" scope="col">ADJUSTMENT</th>
                  <th className="py-3.5 px-4 font-bold text-center" scope="col">FINAL SCORE</th>
                  <th className="py-3.5 px-4 font-bold text-center" scope="col">RESULT</th>
                  <th className="py-3.5 px-4 font-bold" scope="col">SUBMITTED</th>
                  <th className="py-3.5 px-4 font-bold text-right" scope="col">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-sans text-xs">
                {filteredAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-secondary">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <span className="material-symbols-outlined text-4xl text-secondary">assignment_turned_in</span>
                        <h4 className="font-serif text-lg font-bold text-on-surface">No Student Records Found</h4>
                        <p className="font-sans text-xs text-secondary max-w-sm">
                          No student attempt matched your search or status filter specifications.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAttempts.map((a) => {
                    const evalMarks = a.total_marks !== null ? Number(a.total_marks) : 0;
                    const adjMarks = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
                    const finalMarks = evalMarks + adjMarks;
                    const maxMarks = a.max_marks || exam?.total_marks || 100;
                    const netPct = maxMarks > 0 ? ((finalMarks / maxMarks) * 100).toFixed(1) : "0.0";
                    const isPass = maxMarks > 0 ? (finalMarks / maxMarks) >= 0.4 : false;
                    const violationCount = a.cheating_summary?.events?.length || 0;
                    const isEvaluated = a.status === "evaluated";

                    return (
                      <tr key={a.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                        {/* Student Identifiers */}
                        <td className="py-4 px-4 align-middle">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-on-surface tracking-tight">
                              {a.student_email || "Unregistered Candidate"}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] text-secondary">
                              <span>{a.student_name || "Student"}</span>
                              <span>•</span>
                              <span>UID: STU-{a.student_id}</span>
                            </div>
                          </div>
                        </td>

                        {/* Evaluation Status */}
                        <td className="py-4 px-4 align-middle">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold tracking-widest uppercase border ${
                              isEvaluated
                                ? "bg-surface-container border-[#005430] text-[#005430]"
                                : "bg-surface-container-high border-outline text-secondary"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 ${isEvaluated ? "bg-[#005430]" : "bg-secondary"}`} />
                            <span>{isEvaluated ? "EVALUATED" : "SUBMITTED"}</span>
                          </div>
                        </td>

                        {/* Cheating Alerts */}
                        <td className="py-4 px-4 align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(() => {
                              const audioCount = (a.cheating_summary?.events || []).filter(
                                (e: any) => e.eventType === "AUDIO_VIOLATION" || e.eventType === "VOICE_DETECTED"
                              ).length;
                              if (audioCount > 0) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-400 font-mono text-[9px] font-bold" title={`${audioCount} audio threshold violations`}>
                                    <span className="material-symbols-outlined text-[12px]">mic</span>
                                    <span>{audioCount} AUDIO</span>
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {violationCount > 0 ? (
                              <button
                                onClick={() =>
                                  setCheatingModal({
                                    isOpen: true,
                                    events: a.cheating_summary?.events || [],
                                    student: a.student_email || `Student ${a.student_id}`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#ffdad6] hover:bg-[#ffcdd2] text-[#93000a] border border-[#ba1a1a] font-mono text-[10px] font-bold uppercase tracking-widest shadow-[2px_2px_0px_#111111] hover:shadow-[3px_3px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer group"
                                title="Click to view stacked proctoring alerts"
                              >
                                <span className="material-symbols-outlined text-[14px]">warning</span>
                                <span>{violationCount} ALERTS</span>
                                <span className="material-symbols-outlined text-[14px] text-[#93000a] opacity-75 group-hover:opacity-100 ml-0.5">
                                  visibility
                                </span>
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container text-[#005430] border border-[#005430] font-mono text-[10px] font-bold uppercase tracking-widest">
                                <span className="w-1.5 h-1.5 bg-[#005430] inline-block" />
                                <span>CLEAN</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* AI Evaluation Output */}
                        <td className="py-4 px-4 text-center align-middle">
                          <span className="font-mono text-xs font-bold text-on-surface tracking-wider">
                            {evalMarks} <span className="text-secondary font-normal">/ {maxMarks}</span>
                          </span>
                        </td>

                        {/* Adjustment Input Field */}
                        <td className="py-4 px-4 text-center align-middle">
                          <div className="inline-flex items-center gap-1 bg-surface border border-black p-1 shadow-[2px_2px_0px_#111111]">
                            <button
                              onClick={() => handleDeltaAdjustment(a.id, adjMarks, -1)}
                              disabled={updatingAdj === a.id || !isEvaluated || isPublished}
                              className="w-6 h-6 flex items-center justify-center bg-surface-container hover:bg-black hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer select-none disabled:opacity-40"
                              title="Decrement mark"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              step="0.5"
                              defaultValue={adjMarks}
                              key={`${a.id}-${adjMarks}`}
                              onBlur={(e) => {
                                if (e.target.value !== String(adjMarks)) {
                                  handleUpdateAdjustment(a.id, e.target.value);
                                }
                              }}
                              disabled={updatingAdj === a.id || !isEvaluated || isPublished}
                              className={`w-14 text-center bg-surface font-mono text-xs font-bold focus:outline-none ${
                                adjMarks < 0 ? "text-[#ba1a1a]" : adjMarks > 0 ? "text-[#005430]" : "text-on-surface"
                              }`}
                            />
                            <button
                              onClick={() => handleDeltaAdjustment(a.id, adjMarks, 1)}
                              disabled={updatingAdj === a.id || !isEvaluated || isPublished}
                              className="w-6 h-6 flex items-center justify-center bg-surface-container hover:bg-black hover:text-white font-mono text-xs font-bold transition-colors cursor-pointer select-none disabled:opacity-40"
                              title="Increment mark"
                            >
                              +
                            </button>
                          </div>
                          <div
                            className={`font-mono text-[9px] uppercase mt-1 tracking-widest ${
                              adjMarks < 0 ? "text-[#ba1a1a] font-bold" : adjMarks > 0 ? "text-[#005430] font-bold" : "text-secondary"
                            }`}
                          >
                            {adjMarks < 0 ? "PENALTY APPLIED" : adjMarks > 0 ? "BONUS APPLIED" : "NO ADJUSTMENT"}
                          </div>
                        </td>

                        {/* Final Score */}
                        <td className="py-4 px-4 text-center align-middle">
                          <div className="flex flex-col items-center justify-center">
                            <span className="font-serif text-lg font-bold text-on-surface leading-none tracking-tight">
                              {finalMarks} <span className="font-mono text-xs text-secondary font-normal">/ {maxMarks}</span>
                            </span>
                            <span className="font-mono text-[10px] text-secondary mt-1">
                              NET {netPct}%
                            </span>
                          </div>
                        </td>

                        {/* Result Tag */}
                        <td className="py-4 px-4 text-center align-middle">
                          {isEvaluated ? (
                            <div
                              className={`inline-block px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest shadow-[2px_2px_0px_#111111] ${
                                isPass
                                  ? "bg-[#005430] text-white"
                                  : "bg-[#ba1a1a] text-white"
                              }`}
                            >
                              {isPass ? "PASS" : "FAIL"}
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-secondary">-</span>
                          )}
                        </td>

                        {/* Submission Timestamp */}
                        <td className="py-4 px-4 align-middle whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-mono text-[10px] font-bold text-on-surface tracking-wider uppercase">
                              {formatAttemptDate(a.completed_at || a.started_at)}
                            </span>
                            <span className="font-mono text-[10px] text-secondary">
                              {formatAttemptTime(a.completed_at || a.started_at)}
                            </span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-4 px-4 text-right align-middle whitespace-nowrap">
                          <button
                            onClick={() => router.push(`/teacher/exams/${params.examId}/results/${a.id}`)}
                            disabled={!isEvaluated}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-all ${
                              isEvaluated
                                ? "bg-black text-white hover:bg-[#0047ff] shadow-[3px_3px_0px_#0047ff] cursor-pointer"
                                : "bg-surface-container text-secondary cursor-not-allowed border border-outline-variant"
                            }`}
                          >
                            <span>REVIEW EVALUATION</span>
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Cheating Detection Modal (Stacked Format) ── */}
      <Modal
        isOpen={cheatingModal.isOpen}
        onClose={() => setCheatingModal({ isOpen: false, events: [], student: "" })}
        title="Proctoring Violations Log"
        badge="PROCTORING // ALERTS"
        subtitle={`Candidate: ${cheatingModal.student} • ${cheatingModal.events.length} Total Incident${cheatingModal.events.length === 1 ? "" : "s"}`}
        maxWidth="max-w-2xl"
      >
        {(() => {
          const stackedAlerts = groupAlerts(cheatingModal.events);
          if (stackedAlerts.length === 0) {
            return (
              <div className="text-center py-10 font-mono text-xs text-secondary">
                <span className="material-symbols-outlined text-3xl text-secondary block mb-2">verified_user</span>
                No security violation events recorded for this candidate.
              </div>
            );
          }

          return (
            <div className="space-y-3 font-sans max-h-[65vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between pb-2 mb-1 border-b border-outline-variant font-mono text-[11px] text-secondary">
                <span>{stackedAlerts.length} UNIQUE PATTERN{stackedAlerts.length === 1 ? "" : "S"} DETECTED</span>
                <span className="font-bold text-on-surface">{cheatingModal.events.length} TOTAL VIOLATIONS</span>
              </div>

              {stackedAlerts.map((alert) => (
                <div
                  key={alert.key}
                  className="p-4 border-2 border-black bg-surface-container-lowest shadow-[3px_3px_0px_#111111] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-[#ba1a1a] text-white font-mono font-bold uppercase tracking-widest text-[10px]">
                        {alert.eventType.replace(/_/g, " ")}
                      </span>
                      {alert.count > 1 ? (
                        <span className="px-2 py-0.5 bg-black text-white font-mono font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-[#ffdad6]">repeat</span>
                          <span>{alert.count}× OCCURRED</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-surface-container text-secondary font-mono text-[9px] font-bold uppercase">
                          SINGLE EVENT
                        </span>
                      )}
                    </div>
                    {alert.lastTimestamp && (
                      <span className="text-secondary font-mono text-[10px]">
                        MOST RECENT: {formatAlertTimestamp(alert.lastTimestamp)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-on-surface font-sans leading-relaxed">
                    {alert.description}
                  </p>

                  {alert.timestamps.length > 1 && (
                    <details className="mt-1 font-mono text-[10px] text-secondary group">
                      <summary className="cursor-pointer hover:text-black uppercase font-bold tracking-wider select-none flex items-center gap-1">
                        <span>VIEW ALL {alert.count} INCIDENT TIMESTAMPS</span>
                        <span className="material-symbols-outlined text-[14px] group-open:rotate-180 transition-transform">
                          expand_more
                        </span>
                      </summary>
                      <div className="mt-2 p-2 bg-surface-container-low border border-outline-variant flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {alert.timestamps.map((ts, tIdx) => (
                          <span
                            key={tIdx}
                            className="px-2 py-0.5 bg-surface-container-lowest border border-outline-variant text-[9px] text-on-surface font-mono font-semibold"
                          >
                            #{tIdx + 1} {formatAlertTimestamp(ts)}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>

      {/* ── CSV Column Select Modal ── */}
      <Modal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        title="Export Evaluation Dataset"
        badge="EXPORT // TELEMETRY"
        subtitle="Select dataset columns to format and compile into audit CSV."
      >
        <div className="space-y-3 mb-6">
          {availableColumns.map((col) => (
            <label key={col.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-surface-container transition-colors">
              <input
                type="checkbox"
                checked={selectedCols.includes(col.id)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedCols((prev) => [...prev, col.id]);
                  else setSelectedCols((prev) => prev.filter((c) => c !== col.id));
                }}
                className="w-4 h-4 rounded text-[#0047ff] focus:ring-[#0047ff]"
              />
              <span className="font-mono text-xs uppercase tracking-wider text-on-surface font-semibold">{col.label}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
          <button
            onClick={() => setShowDownloadModal(false)}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider text-secondary hover:text-black cursor-pointer font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleDownloadCSV}
            className="px-6 py-2.5 bg-black text-white hover:bg-[#0047ff] font-sans text-xs uppercase tracking-wider font-bold transition-all shadow-[2px_2px_0px_#111111] cursor-pointer"
          >
            Compile &amp; Download CSV
          </button>
        </div>
      </Modal>
    </div>
  );
}
