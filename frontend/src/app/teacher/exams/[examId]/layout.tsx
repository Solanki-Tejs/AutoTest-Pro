"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";
import { toast } from "sonner";
import NotificationBell from "@/app/components/NotificationBell";

export default function ExamWorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ examId: string }>;
}) {
  const params = use(props.params);
  const { children } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [exam, setExam] = useState<any>(null);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(0);

  useEffect(() => {
    const user = getStoredUser();
    const token = getStoredToken();
    if (!user || user.role !== "teacher" || !token) {
      router.push("/teacher/login");
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !params.examId) return;

    async function checkProgression() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/exams/${params.examId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const ex = await res.json();
        setExam(ex);

        if (ex.status === "published") {
          setMaxUnlockedStep(5);
          return;
        }

        let unlocked = 1; // Syllabus is unlocked once exam exists
        if (ex.selected_pdf_ids && ex.selected_pdf_ids.length > 0) {
          unlocked = 2; // Blueprint unlocked

          const bpRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/exams/${params.examId}/blueprint`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (bpRes.ok) {
            unlocked = 3; // Paper unlocked

            const qbRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/question-bank/${params.examId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (qbRes.ok) {
              unlocked = 4; // Answers unlocked

              const abRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/answers/${params.examId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (abRes.ok) {
                unlocked = 5; // Publish unlocked
              }
            }
          }
        }
        setMaxUnlockedStep(unlocked);
      } catch {
        // Fallback: maintain current state
      }
    }
    checkProgression();
  }, [params.examId, pathname]);

  if (!isAuthorized) {
    return <div className="min-h-screen bg-surface" />;
  }

  const steps = [
    { id: "general", label: "General", path: `/teacher/exams/${params.examId}/general` },
    { id: "syllabus", label: "Syllabus", path: `/teacher/exams/${params.examId}/syllabus` },
    { id: "blueprint", label: "Blueprint", path: `/teacher/exams/${params.examId}/blueprint` },
    { id: "paper", label: "Paper", path: `/teacher/exams/${params.examId}/paper` },
    { id: "answers", label: "Answers", path: `/teacher/exams/${params.examId}/answers` },
    { id: "publish", label: "Publish", path: `/teacher/exams/${params.examId}/publish` },
  ];

  const currentStepIndex = steps.findIndex((s) => pathname.includes(s.id));
  const isResultsPage = pathname.includes("/results");

  if (isResultsPage) {
    return <div className="min-h-screen bg-surface text-on-surface">{children}</div>;
  }

  const handleStepClick = (stepIndex: number, stepPath: string) => {
    if (stepIndex > maxUnlockedStep && exam?.status !== "published") {
      toast.warning(`Step locked: please complete ${steps[maxUnlockedStep].label} before proceeding to ${steps[stepIndex].label}.`);
      return;
    }
    router.push(stepPath);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      {/* Workspace Header */}
      <header className="bg-surface-container-lowest border-b border-black px-6 md:px-10 py-4 shrink-0 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 shadow-sm print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/teacher/dashboard")}
            className="w-10 h-10 border border-black bg-surface hover:bg-black hover:text-white flex items-center justify-center shadow-[2px_2px_0px_#111111] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer font-bold text-on-surface"
            title="Back to Dashboard"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#0047ff] font-bold">
                EXAM GENERATOR WORKSPACE
              </span>
              <span className="w-1.5 h-1.5 bg-[#0047ff]"></span>
              {exam?.status === "published" && (
                <span className="px-2 py-0.5 bg-[#005430] text-white font-mono text-[9px] font-bold tracking-widest uppercase">
                  PUBLISHED &amp; LOCKED
                </span>
              )}
            </div>
            <h1 className="font-serif text-xl md:text-2xl font-bold text-on-surface tracking-tight leading-tight">
              {exam?.title || "Exam Builder"}
            </h1>
            <p className="font-mono text-[10px] text-secondary tracking-widest uppercase">
              ID: {params.examId.slice(0, 12)}...
            </p>
          </div>
        </div>

        {/* Stepper with Step Locking & Notification Bell */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1">
          {steps.map((step, index) => {
            const isCurrent = currentStepIndex === index;
            const isPrevious = index < currentStepIndex;
            const isLocked = index > maxUnlockedStep && exam?.status !== "published";

            return (
              <div key={step.id} className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => handleStepClick(index, step.path)}
                  disabled={isLocked}
                  className={`flex items-center gap-2 transition-all ${
                    isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer group"
                  }`}
                  title={isLocked ? `Locked: complete ${steps[maxUnlockedStep].label} first` : step.label}
                >
                  {/* Square step box */}
                  <div
                    className={`w-8 h-8 rounded-none flex items-center justify-center font-mono text-xs font-bold transition-all ${
                      isLocked
                        ? "bg-[#e5e2e1] text-[#747688] border border-[#c4c5da]"
                        : isPrevious
                        ? "bg-[#0047ff] text-white border border-black shadow-[2px_2px_0px_#111111]"
                        : isCurrent
                        ? "bg-[#111111] text-white border border-black shadow-[2px_2px_0px_#0047ff] ring-2 ring-[#0047ff]"
                        : "bg-[#e5e2e1] text-[#747688] border border-[#c4c5da]"
                    }`}
                  >
                    {isLocked ? (
                      <span className="material-symbols-outlined text-[14px]">lock</span>
                    ) : isPrevious ? (
                      "✓"
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`font-mono text-xs uppercase tracking-wider hidden md:inline-block ${
                      isLocked
                        ? "text-[#747688]"
                        : isPrevious
                        ? "text-on-surface font-bold"
                        : isCurrent
                        ? "text-[#0047ff] font-bold underline underline-offset-4 decoration-2"
                        : "text-[#747688] font-medium"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div
                    className={`w-3 sm:w-6 h-[2px] transition-colors ${
                      index < currentStepIndex ? "bg-[#0047ff]" : "bg-[#c4c5da]"
                    }`}
                  />
                )}
              </div>
            );
          })}
          </div>
          <div className="shrink-0 border-l border-neutral-300 pl-3">
            <NotificationBell role="teacher" />
          </div>
        </div>
      </header>

      {/* Published State Notice Banner */}
      {exam?.status === "published" && (
        <div className="bg-[#005430] text-white px-6 md:px-10 py-3 font-mono text-xs flex flex-wrap items-center justify-between gap-4 border-b border-black print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            <span className="font-bold uppercase tracking-wider">Exam Published &amp; Active:</span>
            <span className="opacity-90">Question paper, blueprint structure, and model answers are permanently locked against modifications.</span>
          </div>
          <button
            onClick={() => router.push(`/teacher/exams/${params.examId}/results`)}
            className="px-3.5 py-1.5 bg-white text-[#005430] hover:bg-neutral-100 font-bold uppercase text-[11px] tracking-wider transition-colors cursor-pointer border border-black shadow-[2px_2px_0px_#000]"
          >
            Open Evaluation &amp; Results →
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 bg-surface overflow-y-auto print:p-0 print:overflow-visible print:bg-white">
        <div className="max-w-5xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
