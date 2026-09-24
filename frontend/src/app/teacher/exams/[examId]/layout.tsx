"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import { getStoredToken, getStoredUser } from "@/app/lib/auth";

export default function ExamWorkspaceLayout(props: {
  children: React.ReactNode;
  params: Promise<{ examId: string }>;
}) {
  const params = use(props.params);
  const { children } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    const token = getStoredToken();
    if (!user || user.role !== "teacher" || !token) {
      router.push("/teacher/login");
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  if (!isAuthorized) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  const steps = [
    { id: "general", label: "General", path: `/teacher/exams/${params.examId}/general` },
    { id: "syllabus", label: "Syllabus", path: `/teacher/exams/${params.examId}/syllabus` },
    { id: "blueprint", label: "Blueprint", path: `/teacher/exams/${params.examId}/blueprint` },
    { id: "paper", label: "Paper", path: `/teacher/exams/${params.examId}/paper` },
    { id: "answers", label: "Answers", path: `/teacher/exams/${params.examId}/answers` }
  ];

  // Determine current step index
  const currentStepIndex = steps.findIndex(s => pathname.includes(s.id));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Workspace Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 shrink-0 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/teacher/dashboard")} 
            className="text-slate-500 hover:text-slate-900 transition-colors"
            title="Back to Dashboard"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Exam Workspace</h1>
            <p className="text-[0.75rem] text-slate-500 font-medium tracking-wide">ID: {params.examId}</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-8">
          {steps.map((step, index) => {
            const isCurrent = currentStepIndex === index;
            const isCompleted = index < currentStepIndex; // Naive check, actual guards happen in pages
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => router.push(step.path)}
                  className={`flex items-center gap-2 transition-all ${
                    isCurrent ? "text-[#2563eb]" : 
                    "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.8rem] font-bold border-2 ${
                    isCurrent ? "border-[#2563eb] bg-[#2563eb]/10 text-[#2563eb]" : 
                    isCompleted ? "border-slate-300 bg-slate-100 text-slate-600" :
                    "border-slate-200 bg-transparent text-slate-400"
                  }`}>
                    {isCompleted ? "✓" : (index + 1)}
                  </div>
                  <span className={`text-[0.9rem] font-semibold ${isCurrent ? "text-slate-900" : ""}`}>
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div className="w-12 h-[2px] bg-slate-200 mx-4" />
                )}
              </div>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
