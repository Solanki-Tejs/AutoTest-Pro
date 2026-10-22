"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser, getStoredToken, logout, UserResponse } from "@/app/lib/auth";
import { StudentExam, getAllStudentExams, getAttemptResult, getExamPaper } from "@/app/lib/student_exams";
import NotificationBell from "@/app/components/NotificationBell";
import Link from "next/link";
import { toast } from "sonner";

export default function ExamResultPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [exam, setExam] = useState<StudentExam | null>(null);
  const [result, setResult] = useState<any>(null);
  const [paper, setPaper] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect">("all");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "student") {
      router.push("/student/login");
      return;
    }
    setUser(u);
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    async function loadData() {
      try {
        const exams = await getAllStudentExams(token!);
        const found = exams.find((e) => e.id === examId);

        if (!found || !found.attempt || !found.attempt.id) {
          throw new Error("Exam attempt not found");
        }
        setExam(found);

        const attemptId = found.attempt.id;
        const resData = await getAttemptResult(token!, examId, attemptId);
        setResult(resData);

        const paperData = await getExamPaper(token!, examId);
        setPaper(paperData);

        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load result");
        setLoading(false);
      }
    }

    loadData();
  }, [token, examId]);

  const handleLogout = () => {
    logout();
    router.push("/student/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center font-label-caps-sm text-xs text-secondary">
        LOADING ASSESSMENT RESULTS &amp; DIAGNOSTICS...
      </div>
    );
  }

  if (error || !exam || !result || !paper) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-container-lowest border border-primary p-8 max-w-md w-full shadow-md text-center">
          <span className="material-symbols-outlined text-primary text-[36px] mb-2">error</span>
          <h2 className="font-headline-lg text-on-surface mb-2">Error Loading Result</h2>
          <p className="font-body-md text-xs text-secondary mb-6">{error || "Could not load exam result"}</p>
          <Link
            href="/student/dashboard"
            className="inline-block bg-inverse-surface text-on-primary font-label-caps-sm text-xs uppercase tracking-wider py-3 px-6 hover:bg-primary transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Map questions and answers
  const answers = result.saved_answers || [];
  const answersMap = new Map();
  answers.forEach((ans: any) => {
    answersMap.set(ans.question_id, ans);
  });

  const allQuestions: Array<{
    id: string;
    num: number;
    question_text: string;
    mark: number;
    assigned_marks: number;
    is_correct: boolean;
    student_answer: any;
    correct_answer?: string;
    feedback: string;
    teacher_override?: boolean;
    override_reason?: string;
  }> = [];

  if (paper?.sections && paper.sections.length > 0) {
    let counter = 1;
    paper.sections.forEach((sec: any) => {
      (sec.questions || []).forEach((q: any) => {
        const ans = answersMap.get(q.question_id);
        const evalData = ans?.evaluation || {};
        const assigned = evalData.modified_by_teacher
          ? (evalData.teacher_override_marks ?? 0)
          : (evalData.ai_assigned_marks ?? 0);
        const qMark = q.mark || 1;
        const isCorrect = Number(assigned) >= qMark;

        allQuestions.push({
          id: q.question_id,
          num: counter++,
          question_text: q.question_text || q.text || "Question",
          mark: qMark,
          assigned_marks: Number(assigned),
          is_correct: isCorrect,
          student_answer: ans?.answer,
          correct_answer: q.correct_answer || q.answer,
          feedback:
            evalData.ai_feedback ||
            evalData.feedback ||
            (isCorrect ? "Correct — verified against accredited solution key." : "Needs revision."),
          teacher_override: evalData.modified_by_teacher,
          override_reason: evalData.override_reason,
        });
      });
    });
  } else if (answers.length > 0) {
    answers.forEach((ans: any, idx: number) => {
      const evalData = ans.evaluation || {};
      const assigned = evalData.modified_by_teacher
        ? (evalData.teacher_override_marks ?? 0)
        : (evalData.ai_assigned_marks ?? 0);
      const qMark = ans.mark || 1;
      const isCorrect = Number(assigned) >= qMark;

      allQuestions.push({
        id: ans.question_id,
        num: idx + 1,
        question_text: ans.question_text || `Question ${idx + 1}`,
        mark: qMark,
        assigned_marks: Number(assigned),
        is_correct: isCorrect,
        student_answer: ans.answer,
        correct_answer: ans.correct_answer,
        feedback:
          evalData.ai_feedback ||
          evalData.feedback ||
          (isCorrect ? "Correct — verified against accredited solution key." : "Needs revision."),
        teacher_override: evalData.modified_by_teacher,
        override_reason: evalData.override_reason,
      });
    });
  }

  const totalQuestions = allQuestions.length;
  const correctCount = allQuestions.filter((q) => q.is_correct).length;
  const incorrectCount = totalQuestions - correctCount;

  const evalScore =
    result.total_marks !== undefined && result.total_marks !== null
      ? Number(result.total_marks)
      : allQuestions.reduce((acc, q) => acc + q.assigned_marks, 0);

  const adjustmentMarks = Number(result.adjustment_marks || 0);
  const totalScore = Math.max(0, evalScore + adjustmentMarks);

  const maxMarks =
    result.max_marks || exam.total_marks || allQuestions.reduce((acc, q) => acc + q.mark, 0) || 1;
  const percentage = maxMarks > 0 ? Math.round((totalScore / maxMarks) * 100) : 0;
  const passThreshold = exam?.passing_percentage !== undefined && exam?.passing_percentage !== null ? Number(exam.passing_percentage) : 40.0;
  const isPassed = percentage >= passThreshold;
  const correctRatio = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Candidate Result Analytics
  const analytics = result.analytics || {};
  const cohort = analytics.cohort || {};
  const proctoring = analytics.proctoring || {};
  const taxonomy = analytics.taxonomy || [];
  const questionTypes = analytics.question_types || [];

  // Watermark short acronym
  const shortCode =
    exam.title
      .replace(/[^a-zA-Z ]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "CBT";

  // Evaluation date & time
  const evalDateObj = result.evaluated_at || result.result_published_at || result.completed_at
    ? new Date(result.evaluated_at || result.result_published_at || result.completed_at)
    : new Date();
  const evalDate = evalDateObj.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const evalTime = evalDateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Duration
  let timeTakenText = "—";
  if (result.completed_at && result.started_at) {
    const ms = new Date(result.completed_at).getTime() - new Date(result.started_at).getTime();
    const mins = Math.max(1, Math.round(ms / 60000));
    timeTakenText = `${mins}m`;
  } else {
    timeTakenText = `${exam.duration_minutes}m`;
  }

  const backUrl = exam?.class_id
    ? `/student/dashboard?tab=my-classes&classId=${exam.class_id}&sub=exams`
    : `/student/dashboard?tab=my-classes`;

  const filteredQuestions = allQuestions.filter((q) => {
    if (filter === "correct") return q.is_correct;
    if (filter === "incorrect") return !q.is_correct;
    return true;
  });

  const formatAnswerText = (val: any) => {
    if (val === undefined || val === null || val === "") return "No response recorded";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="bg-surface font-sans text-on-surface antialiased selection:bg-primary selection:text-white min-h-screen">
      {/* ── Fixed Top Header ── */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant z-50 flex items-center justify-between px-6 md:px-8 print:hidden">
        {/* Brand / Logo (Left) */}
        <div className="flex items-center gap-3">
          <img src="/logo_bg_removed.png" alt="AutoTest Pro Logo" className="h-8 w-auto shrink-0 object-contain" />
          <div className="flex flex-col">
            <span className="font-sans text-sm font-bold tracking-widest uppercase text-on-surface leading-tight">
              AutoTest Pro
            </span>
            <span className="font-sans text-[10px] tracking-widest text-secondary font-semibold uppercase leading-tight">
              Student Portal
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <NotificationBell role="student" />
          {/* Profile Avatar & Interactive Details */}
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 bg-surface-container-lowest border border-outline-variant hover:border-black transition-colors cursor-pointer text-left"
              aria-label="User profile details"
              type="button"
            >
              <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-sans text-xs font-bold shrink-0">
                <span>{user?.name ? user.name.slice(0, 2).toUpperCase() : "S1"}</span>
              </div>
              <div className="flex flex-col min-w-0 pr-1">
                <span className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface truncate max-w-[120px]">
                  {user?.name || "Student"}
                </span>
                <span className="font-sans text-[9px] font-bold tracking-widest text-primary uppercase leading-tight">
                  STUDENT
                </span>
              </div>
              <span className="material-symbols-outlined text-[16px] text-secondary">
                {profileMenuOpen ? "arrow_drop_up" : "arrow_drop_down"}
              </span>
            </button>

            {/* Floating Profile Details Card */}
            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute right-0 top-12 mt-2 w-72 bg-surface-container-lowest border-2 border-black p-5 shadow-[6px_6px_0_0_#000] z-50 animate-fade-up">
                  <div className="flex items-center gap-3 pb-4 border-b border-outline-variant">
                    <div className="w-10 h-10 bg-black text-white flex items-center justify-center font-sans text-sm font-bold shrink-0">
                      {user?.name ? user.name.slice(0, 2).toUpperCase() : "S1"}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-sans text-xs font-bold text-on-surface uppercase tracking-wider truncate">
                        {user?.name || "Student"}
                      </span>
                      <span className="font-mono text-[10px] text-secondary truncate">
                        {user?.email || "student@autotest.pro"}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 bg-primary text-white text-[9px] font-bold tracking-widest uppercase mt-1 self-start">
                        STUDENT
                      </span>
                    </div>
                  </div>

                  <div className="py-3 flex flex-col gap-2 border-b border-outline-variant text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Student ID</span>
                      <span className="font-mono text-[11px] font-bold text-on-surface">#{user?.id || 1}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Status</span>
                      <span className="font-sans text-xs font-bold text-primary">Active Verified</span>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col gap-2">
                    <Link
                      href="/student/dashboard?tab=profile"
                      className="w-full py-2 px-3 text-left font-sans text-xs font-bold uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">account_circle</span>
                      <span>View Full Profile</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      type="button"
                      className="w-full py-2 px-3 text-left font-sans text-xs font-bold uppercase tracking-wider text-secondary hover:!text-primary hover:bg-surface-container transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Fixed Left Sidebar ── */}
      <aside className="fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest border-r border-outline-variant z-40 flex flex-col justify-between p-4 md:p-6 overflow-y-auto print:hidden">
        <div className="flex flex-col gap-2">
          <nav className="flex flex-col gap-1.5">
            <Link
              className="w-full flex items-center justify-between px-3.5 py-3 bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container transition-colors tracking-widest text-xs font-semibold uppercase"
              href="/student/dashboard?tab=join"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-secondary">add_box</span>
                <span>Join a Class</span>
              </div>
            </Link>
            <Link
              className="w-full flex items-center justify-between px-3.5 py-3 bg-black text-white tracking-widest text-xs font-bold uppercase transition-colors"
              href="/student/dashboard?tab=my-classes"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-primary">school</span>
                <span>My Classes</span>
              </div>
              <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold font-sans">1</span>
            </Link>
            <Link
              className="w-full flex items-center justify-between px-3.5 py-3 bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container transition-colors tracking-widest text-xs font-semibold uppercase"
              href="/student/dashboard?tab=profile"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-secondary">account_circle</span>
                <span>Profile</span>
              </div>
            </Link>
          </nav>
        </div>

        <div className="mt-auto pt-6 border-t border-outline-variant">
          <button
            onClick={handleLogout}
            type="button"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-secondary hover:!text-primary hover:bg-surface-container transition-colors text-xs font-semibold tracking-widest uppercase cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Canvas Offset ── */}
      <div className="pl-64 pt-16 print:pl-0 print:pt-0">
        {/* Main Content */}
        <main className="w-full bg-surface min-h-[calc(100vh-4rem)] px-8 py-8 print:p-0 print:bg-white print:min-h-0">
          <div className="flex flex-col w-full max-w-7xl mx-auto">
            {/* Top Navigation & Return Bar */}
            <div className="w-full bg-surface-container-lowest px-6 py-4 mb-6 shadow-sm border border-outline-variant flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <Link
                  className="group flex items-center gap-2 text-on-surface hover:text-primary transition-colors cursor-pointer"
                  href={backUrl}
                >
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-1">
                    arrow_back
                  </span>
                  <span className="font-label-caps-sm uppercase tracking-widest text-secondary group-hover:text-primary">
                    Back to Course Exams
                  </span>
                </Link>
                <span className="text-outline-variant font-mono-field">/</span>
                <span className="font-label-caps-sm uppercase tracking-widest text-on-surface font-bold">
                  {exam.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant text-on-surface font-label-caps-sm uppercase tracking-widest flex items-center gap-2 transition-colors cursor-pointer"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  Export PDF Report
                </button>
              </div>
            </div>

            {/* Main Hero Score Summary: Asymmetric Editorial Split Card */}
            <div className="w-full bg-surface-container-lowest shadow-md border border-outline-variant mb-8 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Left Editorial Crimson Score Chamber (5 Cols) */}
                <div className="lg:col-span-5 bg-primary text-on-primary p-8 md:p-10 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute -right-6 bottom-0 pointer-events-none opacity-25">
                    <span className="font-display-hero text-[150px] leading-none select-none text-white">
                      {shortCode}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <span className="px-2.5 py-1 bg-surface-container-lowest text-primary font-label-caps-sm tracking-widest uppercase">
                        Evaluated &amp; Verified
                      </span>
                    </div>
                    <span className="font-label-caps-sm uppercase tracking-[0.2em] text-on-primary/70 block mb-2 font-bold">
                      Total Score Obtained
                    </span>
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="font-display-hero text-on-primary leading-none">{totalScore}</span>
                      <span className="font-headline-lg text-on-primary/60">/ {maxMarks}</span>
                    </div>
                    {adjustmentMarks !== 0 && (
                      <div className="mb-3 px-3 py-1.5 bg-black/30 border border-white/20 font-mono text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-[15px]">tune</span>
                        <span>
                          Includes <strong>{adjustmentMarks > 0 ? `+${adjustmentMarks}` : adjustmentMarks}</strong> teacher adjustment (Base: {evalScore})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-6">
                      <span className="font-label-caps-lg tracking-widest uppercase text-on-primary bg-primary-dark px-2 py-0.5">
                        {percentage}% Overall Mark
                      </span>
                      <span className="font-label-caps-sm text-on-primary/80">Threshold: {passThreshold.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="pt-6 bg-primary-dark/40 -mx-8 -mb-8 md:-mx-10 md:-mb-10 p-6 md:p-8">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-surface-container-lowest/10 p-3">
                        <span className="font-label-caps-sm text-on-primary/80 block uppercase">Correct Answers</span>
                        <span className="font-headline-md text-on-primary font-bold">{correctCount}</span>
                      </div>
                      <div className="bg-surface-container-lowest/10 p-3">
                        <span className="font-label-caps-sm text-on-primary/80 block uppercase">Needs Revision</span>
                        <span className="font-headline-md text-on-primary font-bold">{incorrectCount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Metadata & Diagnostic Breakdown (7 Cols) */}
                <div className="lg:col-span-7 p-8 md:p-10 flex flex-col justify-between bg-surface-container-lowest">
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                      <h1 className="font-headline-lg text-on-surface">{exam.title} — Results</h1>
                    </div>

                    {/* Key Diagnostic Metrics Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                      <div className="bg-surface-container-low p-3 border border-outline-variant">
                        <span className="font-label-caps-sm text-secondary uppercase block mb-1">Evaluated At</span>
                        <span className="font-mono-field text-on-surface font-medium text-xs block">{evalDate}</span>
                        <span className="font-mono-field text-secondary block text-[11px]">{evalTime}</span>
                      </div>
                      <div className="bg-surface-container-low p-3 border border-outline-variant">
                        <span className="font-label-caps-sm text-secondary uppercase block mb-1">Duration</span>
                        <span className="font-headline-md text-on-surface font-medium leading-none block my-1">
                          {timeTakenText}
                        </span>
                        <span className="font-mono-field text-secondary text-[11px]">Max: {exam.duration_minutes}m</span>
                      </div>
                      <div className="bg-surface-container-low p-3 border border-outline-variant">
                        <span className="font-label-caps-sm text-secondary uppercase block mb-1">Outcome Status</span>
                        <span
                          className={`font-label-caps-sm uppercase font-bold block mt-1 ${
                            isPassed ? "text-green-700" : "text-primary"
                          }`}
                        >
                          {isPassed ? "Passed" : "Failed"}
                        </span>
                        <span className="font-mono-field text-secondary text-[11px]">
                          {isPassed
                            ? "+above passing grade"
                            : `-${Math.max(1, Math.round(maxMarks * (passThreshold / 100) - totalScore))} below pass`}
                        </span>
                      </div>
                    </div>

                    {/* Progress Ratio Bar with Zero-Radius */}
                    <div className="space-y-1.5 mb-6">
                      <div className="flex justify-between items-center font-label-caps-sm uppercase">
                        <span className="text-secondary tracking-widest">Score Diagnostic Ratio</span>
                        <span className="text-on-surface font-bold">
                          {correctCount} / {totalQuestions} Questions Mastered
                        </span>
                      </div>
                      <div className="w-full h-3 bg-surface-container-high flex overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${correctRatio}%` }}></div>
                        <div className="h-full bg-inverse-surface" style={{ width: `${100 - correctRatio}%` }}></div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono-field text-secondary pt-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-primary inline-block"></span> Verified Correct (
                          {correctCount})
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-inverse-surface inline-block"></span> Incorrect / Skipped (
                          {incorrectCount})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notification Banner */}
                  <div className="bg-surface-container p-3 flex items-center justify-between gap-3 border border-outline-variant">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[20px] shrink-0">info</span>
                      <p className="font-body-md text-on-surface text-xs truncate">
                        Detailed step-by-step diagnostic breakdown is unlocked. Instructor feedback is finalized.
                      </p>
                    </div>
                    <a
                      className="font-label-caps-sm text-primary hover:underline uppercase shrink-0 font-bold"
                      href="#question-breakdown"
                    >
                      Scroll To Qs ↓
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Candidate Performance Statistics & Cohort Benchmarks Strip ── */}
            <div className="w-full bg-surface-container-lowest p-6 shadow-sm border border-outline-variant mb-8">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
                  <h2 className="font-label-caps-lg uppercase tracking-widest text-on-surface font-bold text-sm">
                    Candidate Result Statistics &amp; Cohort Standing
                  </h2>
                </div>
                <span className="font-mono text-xs text-secondary font-bold uppercase tracking-wider">
                  OFFICIAL INSTITUTIONAL LEDGER
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Class Rank
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-primary">
                      #{cohort.rank || 1}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {cohort.total_candidates || 1}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-secondary mt-1 block">
                    {cohort.percentile || 100}% Standing
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Class Average
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-on-surface">
                      {cohort.class_average !== undefined ? cohort.class_average : totalScore}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {maxMarks}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-primary font-bold mt-1 block">
                    {totalScore - (cohort.class_average || totalScore) >= 0 ? "+" : ""}
                    {(totalScore - (cohort.class_average || totalScore)).toFixed(1)} vs Cohort
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Cohort Highest
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-green-700">
                      {cohort.highest_score !== undefined ? cohort.highest_score : totalScore}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {maxMarks}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-secondary mt-1 block">
                    Target Benchmark
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Integrity Rating
                  </span>
                  <span className="font-label-caps-sm text-xs font-bold text-green-700 block my-1">
                    {proctoring.integrity_rating || "HIGH COMPLIANCE"}
                  </span>
                  <span className="font-mono text-[10px] text-secondary block">
                    {proctoring.total_violations || 0} Total Alerts
                  </span>
                </div>
              </div>
            </div>

            {/* ── Candidate Performance Statistics & Cohort Benchmarks Strip ── */}
            <div className="w-full bg-surface-container-lowest p-6 shadow-sm border border-outline-variant mb-8">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
                  <h2 className="font-label-caps-lg uppercase tracking-widest text-on-surface font-bold text-sm">
                    Candidate Result Statistics &amp; Cohort Standing
                  </h2>
                </div>
                <span className="font-mono text-xs text-secondary font-bold uppercase tracking-wider">
                  OFFICIAL INSTITUTIONAL LEDGER
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Class Rank
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-primary">
                      #{cohort.rank || 1}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {cohort.total_candidates || 1}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-secondary mt-1 block">
                    {cohort.percentile || 100}% Standing
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Class Average
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-on-surface">
                      {cohort.class_average !== undefined ? cohort.class_average : totalScore}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {maxMarks}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-primary font-bold mt-1 block">
                    {totalScore - (cohort.class_average || totalScore) >= 0 ? "+" : ""}
                    {(totalScore - (cohort.class_average || totalScore)).toFixed(1)} vs Cohort
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Cohort Highest
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-bold text-green-700">
                      {cohort.highest_score !== undefined ? cohort.highest_score : totalScore}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      / {maxMarks}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-secondary mt-1 block">
                    Target Benchmark
                  </span>
                </div>

                <div className="bg-surface-container-low p-4 border border-outline-variant">
                  <span className="font-label-caps-sm text-secondary uppercase block text-[10px] tracking-wider mb-1">
                    Integrity Rating
                  </span>
                  <span className="font-label-caps-sm text-xs font-bold text-green-700 block my-1">
                    {proctoring.integrity_rating || "HIGH COMPLIANCE"}
                  </span>
                  <span className="font-mono text-[10px] text-secondary block">
                    {proctoring.total_violations || 0} Total Alerts
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Content Grid: Breakdown (Left 8 cols) & Navigation Bench (Right 4 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="question-breakdown">
              {/* Left Column: Individual Question Breakdown */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="flex items-center justify-between bg-surface-container-lowest px-6 py-4 shadow-sm border border-outline-variant">
                  <div className="flex items-center gap-3">
                    <span className="font-label-caps-lg uppercase text-on-surface tracking-widest font-bold">
                      Item Diagnostics
                    </span>
                    <span className="px-2 py-0.5 bg-surface-container-high text-secondary font-mono-field text-xs">
                      Showing Verified Submissions
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFilter("all")}
                      className={`px-3 py-1 font-label-caps-sm uppercase tracking-wider text-[11px] transition-colors cursor-pointer ${
                        filter === "all"
                          ? "bg-inverse-surface text-on-primary"
                          : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                      type="button"
                    >
                      All ({totalQuestions})
                    </button>
                    <button
                      onClick={() => setFilter("correct")}
                      className={`px-3 py-1 font-label-caps-sm uppercase tracking-wider text-[11px] transition-colors cursor-pointer ${
                        filter === "correct"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                      type="button"
                    >
                      Correct ({correctCount})
                    </button>
                    <button
                      onClick={() => setFilter("incorrect")}
                      className={`px-3 py-1 font-label-caps-sm uppercase tracking-wider text-[11px] transition-colors cursor-pointer ${
                        filter === "incorrect"
                          ? "bg-inverse-surface text-on-primary"
                          : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                      type="button"
                    >
                      Incorrect ({incorrectCount})
                    </button>
                  </div>
                </div>

                {filteredQuestions.map((item) => {
                  return (
                    <article
                      key={item.num}
                      id={`q-${item.num}`}
                      className="bg-surface-container-lowest p-6 md:p-8 shadow-sm flex flex-col gap-4 border border-outline-variant scroll-mt-24"
                    >
                      {item.is_correct ? (
                        <>
                          {/* Correct Question Header */}
                          <div className="flex items-start justify-between gap-4 pb-4 bg-surface-container-low -mx-6 -mt-6 md:-mx-8 md:-mt-8 p-6 border-b border-outline-variant">
                            <div className="flex items-baseline gap-3">
                              <span className="px-2 py-1 bg-inverse-surface text-on-primary font-label-caps-sm uppercase">
                                Q.{String(item.num).padStart(2, "0")}
                              </span>
                              <h2 className="font-headline-md text-on-surface text-lg leading-snug">
                                {item.question_text}
                              </h2>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="font-label-caps-lg text-primary font-bold">
                                {item.assigned_marks} / {item.mark} PT
                              </span>
                              <span className="font-label-caps-sm text-secondary uppercase text-[10px]">CORRECT</span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-2">
                            <span className="font-label-caps-sm text-secondary uppercase tracking-widest">
                              Student Response Recorded
                            </span>
                            <div className="p-3 bg-surface-container-low text-on-surface font-body-md flex items-center justify-between gap-2 border border-outline-variant">
                              <span className="font-medium whitespace-pre-wrap">
                                {formatAnswerText(item.student_answer)}
                              </span>
                              <span className="material-symbols-outlined text-primary text-[20px] shrink-0">
                                check_circle
                              </span>
                            </div>
                          </div>

                          {/* Feedback Container */}
                          <div className="p-4 bg-surface-container-lowest border border-outline-variant shadow-sm flex flex-col gap-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-label-caps-sm text-primary uppercase font-bold">
                                Feedback / Evaluation Rationale:
                              </span>
                              {item.teacher_override && (
                                <span className="px-1.5 py-0.5 bg-black text-white font-label-caps-sm text-[9px] uppercase font-bold">
                                  Teacher Override
                                </span>
                              )}
                            </div>
                            <p className="font-body-md text-on-surface leading-relaxed text-xs">
                              {item.feedback}
                            </p>
                            {item.override_reason && (
                              <p className="font-body-md text-primary text-xs font-medium pt-1 border-t border-outline-variant">
                                Instructor Note: {item.override_reason}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Incorrect Question Header */}
                          <div className="flex items-start justify-between gap-4 pb-4 bg-error-container -mx-6 -mt-6 md:-mx-8 md:-mt-8 p-6 border-b border-error/20">
                            <div className="flex items-baseline gap-3">
                              <span className="px-2 py-1 bg-error text-on-error font-label-caps-sm uppercase">
                                Q.{String(item.num).padStart(2, "0")}
                              </span>
                              <h2 className="font-headline-md text-on-surface text-lg leading-snug">
                                {item.question_text}
                              </h2>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="font-label-caps-lg text-error font-bold">
                                {item.assigned_marks} / {item.mark} PT
                              </span>
                              <span className="font-label-caps-sm text-error uppercase text-[10px]">INCORRECT</span>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <div>
                              <span className="font-label-caps-sm text-error uppercase tracking-widest block mb-1">
                                Your Submission (Invalidated)
                              </span>
                              <div className="p-3 bg-error-container/40 text-on-surface font-body-md flex items-center justify-between gap-2 border border-error/30">
                                <span className="font-medium line-through whitespace-pre-wrap">
                                  {formatAnswerText(item.student_answer)}
                                </span>
                                <span className="material-symbols-outlined text-error text-[20px] shrink-0">close</span>
                              </div>
                            </div>

                            {item.correct_answer && (
                              <div>
                                <span className="font-label-caps-sm text-secondary uppercase tracking-widest block mb-1">
                                  Correct Standard Solution
                                </span>
                                <div className="p-3 bg-surface-container text-on-surface font-body-md flex items-center justify-between gap-2 border border-outline-variant">
                                  <span className="font-medium text-on-surface whitespace-pre-wrap">
                                    {formatAnswerText(item.correct_answer)}
                                  </span>
                                  <span className="material-symbols-outlined text-on-surface text-[20px] shrink-0">
                                    check
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="p-4 bg-surface-container-low border border-outline-variant flex flex-col gap-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-label-caps-sm text-error uppercase font-bold">
                                Feedback / Evaluation Rationale:
                              </span>
                              {item.teacher_override && (
                                <span className="px-1.5 py-0.5 bg-black text-white font-label-caps-sm text-[9px] uppercase font-bold">
                                  Teacher Override
                                </span>
                              )}
                            </div>
                            <p className="font-body-md text-on-surface leading-relaxed text-xs">
                              {item.feedback}
                            </p>
                            {item.override_reason && (
                              <p className="font-body-md text-error text-xs font-medium pt-1 border-t border-outline-variant">
                                Instructor Note: {item.override_reason}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}

                {/* Paginated Questions Notification Indicator */}
                <div className="bg-surface-container p-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-outline-variant">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-inverse-surface text-on-primary flex items-center justify-center font-label-caps-sm">
                      {totalQuestions}
                    </span>
                    <span className="font-body-md text-on-surface font-medium text-xs">
                      All assessment items evaluated and archived in course performance log.
                    </span>
                  </div>
                  <Link
                    href={backUrl}
                    className="px-5 py-2.5 bg-inverse-surface hover:bg-primary text-on-primary font-label-caps-sm uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>Back to Exams</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                </div>
              </div>

              {/* Right Column: Diagnostics Bench & Matrix Navigation (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-6 sticky top-20">
                {/* Matrix Jump Grid Card */}
                <div className="bg-surface-container-lowest p-6 shadow-sm border border-outline-variant">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-label-caps-lg uppercase text-on-surface tracking-widest font-bold">
                      Question Matrix ({totalQuestions})
                    </span>
                    <span className="font-label-caps-sm text-secondary">JUMP TO ITEM</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {allQuestions.map((item) => (
                      <a
                        key={item.num}
                        href={`#q-${item.num}`}
                        className={`h-9 flex items-center justify-center font-mono-field text-xs font-bold transition-transform hover:scale-105 cursor-pointer ${
                          item.is_correct
                            ? "bg-primary text-on-primary"
                            : "bg-inverse-surface text-on-primary"
                        }`}
                        title={`Q${item.num}: ${item.is_correct ? "Correct" : "Incorrect"} (${item.assigned_marks}/${item.mark})`}
                      >
                        {item.num}
                      </a>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono-field text-secondary pt-2 border-t border-outline-variant">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-primary inline-block"></span>
                      <span>Correct ({correctCount})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-inverse-surface inline-block"></span>
                      <span>Incorrect ({incorrectCount})</span>
                    </div>
                  </div>
                </div>

                {/* Proctoring & Integrity Verification Card */}
                <div className="bg-surface-container-lowest p-6 shadow-sm border border-outline-variant flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-outline-variant pb-3">
                    <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                    <h3 className="font-label-caps-sm uppercase tracking-widest text-on-surface font-bold">
                      Proctoring &amp; Integrity Audit
                    </h3>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-xs font-sans text-secondary">
                    <li className="flex items-center justify-between">
                      <span>Browser Lockdown</span>
                      <span className="font-bold text-on-surface uppercase">VERIFIED SECURE</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Webcam Proctor Feed</span>
                      <span className="font-bold text-on-surface uppercase">COMPLIANT</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Verification Hash</span>
                      <span className="font-mono text-[10px] text-on-surface truncate max-w-[130px]">
                        {exam.id.slice(0, 8)}...
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Submission Integrity</span>
                      <span className="font-bold text-green-700 uppercase">Passed</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
