"use client";

import { useEffect, useState, useCallback } from "react";
import { getStoredUser, getStoredToken, logout, UserResponse } from "@/app/lib/auth";
import {
  previewClassByCode,
  requestToJoinByCode,
  fetchMyMemberships,
  ClassPreview,
  Membership,
} from "@/app/lib/classes";
import { fetchSyllabusList, downloadSyllabus, viewSyllabus, SyllabusItem } from "@/app/lib/syllabus";
import { StudentExam, getAllStudentExams } from "@/app/lib/student_exams";
import UpdatePasswordCard from "@/app/components/UpdatePasswordCard";
import NotificationBell from "@/app/components/NotificationBell";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Tab = "join" | "my-classes" | "profile" | "upcoming";

function parseUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.match(/(Z|[+-]\d{2}(:\d{2})?)$/) ? dateStr : `${dateStr}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function formatScheduleWindow(startStr?: string, endStr?: string): string {
  if (!startStr && !endStr) return "Open Window (No Restrictions)";
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const startDate = parseUtcDate(startStr);
  const endDate = parseUtcDate(endStr);
  if (startDate && endDate) {
    return `${startDate.toLocaleString("en-US", opts)} — ${endDate.toLocaleString("en-US", opts)}`;
  }
  if (startDate) return `Opens ${startDate.toLocaleString("en-US", opts)}`;
  if (endDate) return `Ends ${endDate.toLocaleString("en-US", opts)}`;
  return "Open Window";
}

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("join");

  const [mounted, setMounted] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<Membership | null>(null);

  const [workspaceSubTab, setWorkspaceSubTab] = useState<"exams" | "syllabus">("exams");

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  // Join by code state
  const [codeInput, setCodeInput] = useState("");
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);

  const [classSearch, setClassSearch] = useState("");
  const [classTab, setClassTab] = useState<"active" | "pending">("active");
  const [allStudentExams, setAllStudentExams] = useState<StudentExam[]>([]);
  const [examCategoryFilter, setExamCategoryFilter] = useState<"all" | "active" | "awaiting" | "graded" | "missed">("all");
  const [examSearch, setExamSearch] = useState("");

  // Custom Invite URL modal, profile dropdown, and class counts
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [inviteUrlInput, setInviteUrlInput] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [classStats, setClassStats] = useState<Record<number, { examsCount: number; syllabusCount: number }>>({});

  useEffect(() => {
    const u = getStoredUser();
    const t = getStoredToken();
    if (!u || u.role !== "student") {
      router.push("/student/login");
      return;
    }
    setUser(u);
    setToken(t);
  }, [router]);

  useEffect(() => {
    setMounted(true);
    const searchParams = new URLSearchParams(window.location.search);
    const qTab = searchParams.get("tab") as Tab | null;
    const savedTab = sessionStorage.getItem("studentDashTab") as Tab | null;
    if (qTab && ["join", "my-classes", "profile"].includes(qTab)) {
      setTab(qTab);
    } else if (savedTab) {
      setTab(savedTab);
    }

    const qClassId = searchParams.get("classId");
    const savedClassId = sessionStorage.getItem("studentDashClassId");
    if (qClassId) {
      setSelectedClassId(qClassId);
    } else if (savedClassId) {
      setSelectedClassId(savedClassId);
    }

    const qSubTab = searchParams.get("sub") as "exams" | "syllabus" | null;
    const savedSubTab = sessionStorage.getItem("studentDashSubTab") as "exams" | "syllabus" | null;
    if (qSubTab && ["exams", "syllabus"].includes(qSubTab)) {
      setWorkspaceSubTab(qSubTab);
    } else if (savedSubTab && ["exams", "syllabus"].includes(savedSubTab)) {
      setWorkspaceSubTab(savedSubTab);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("studentDashTab", tab);
    }
  }, [tab, mounted]);

  useEffect(() => {
    if (selectedClassId && memberships.length > 0) {
      const cls = memberships.find(m => String(m.class_id) === String(selectedClassId));
      setSelectedClass(cls || null);
    } else if (!selectedClassId) {
      setSelectedClass(null);
    }
  }, [selectedClassId, memberships]);

  function openClass(mem: Membership, sub: "exams" | "syllabus" = "exams") {
    setSelectedClassId(String(mem.class_id));
    setWorkspaceSubTab(sub);
    if (mounted) {
      sessionStorage.setItem("studentDashClassId", String(mem.class_id));
      sessionStorage.setItem("studentDashSubTab", sub);
    }
  }

  function closeClass() {
    setSelectedClassId(null);
    if (mounted) {
      sessionStorage.removeItem("studentDashClassId");
    }
  }

  const loadMemberships = useCallback(async () => {
    if (!token) return;
    setMemLoading(true);
    try {
      const mems = await fetchMyMemberships(token);
      setMemberships(mems);
    } catch {
      // silently fail
    } finally {
      setMemLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadMemberships();
  }, [token, loadMemberships]);

  useEffect(() => {
    if (!token || memberships.length === 0) return;
    const approved = memberships.filter((m) => m.status === "approved");
    if (approved.length === 0) return;

    let cancelled = false;
    getAllStudentExams(token)
      .then(async (exams) => {
        if (cancelled) return;
        setAllStudentExams(exams);
        const stats: Record<number, { examsCount: number; syllabusCount: number }> = {};
        await Promise.all(
          approved.map(async (cls) => {
            const cExams = exams.filter((e) => e.class_id === cls.class_id);
            let sylCount = 0;
            try {
              const sList = await fetchSyllabusList(cls.class_id);
              sylCount = sList.length;
            } catch {
              sylCount = 0;
            }
            stats[cls.class_id] = {
              examsCount: cExams.length,
              syllabusCount: sylCount,
            };
          })
        );
        if (!cancelled) setClassStats(stats);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token, memberships]);

  const handleCodeInput = (val: string) => {
    let clean = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length > 8) {
      clean = clean.slice(0, 8);
    }
    if (clean.length > 4) {
      clean = clean.slice(0, 4) + "-" + clean.slice(4, 8);
    }
    setCodeInput(clean);
    setPreview(null);
    setPreviewError("");
    setJoinSuccess(false);

    const raw = clean.replace(/-/g, "");
    if (raw.length === 8 && token) {
      triggerLookup(raw);
    }
  };

  const triggerLookup = async (codeToSearch: string) => {
    if (!token || !codeToSearch.trim()) return;
    setPreviewLoading(true);
    setPreviewError("");
    setPreview(null);
    try {
      const res = await previewClassByCode(token, codeToSearch.trim().toUpperCase());
      setPreview(res);
      toast.success("Class found!");
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : "Class not found";
      setPreviewError(err);
      toast.error(err);
    } finally {
      setPreviewLoading(false);
    }
  };

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleCodeInput(text.trim());
      }
    } catch {
      toast.info("Please paste the code directly into the input.");
    }
  }

  function promptInviteUrl() {
    setUrlModalOpen(true);
  }

  const handleInviteUrlSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = inviteUrlInput.trim();
    if (!cleanUrl) return;
    let detected = "";
    const joinPathMatch = cleanUrl.match(/\/join\/([A-Za-z0-9-]+)/i);
    if (joinPathMatch) {
      detected = joinPathMatch[1];
    } else {
      const match = cleanUrl.match(/[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}/) || cleanUrl.match(/[A-Za-z0-9]{8}/);
      if (match) detected = match[0];
    }
    if (detected) {
      handleCodeInput(detected);
      setUrlModalOpen(false);
      setInviteUrlInput("");
      toast.success(`Class code detected: ${detected.toUpperCase()}`);
    } else {
      toast.error("Valid class code could not be detected from that URL.");
    }
  };

  async function handleEnrollment() {
    if (!token || !preview) return;
    setJoinLoading(true);
    try {
      await requestToJoinByCode(token, preview.join_code);
      setJoinSuccess(true);
      toast.success("Enrolled successfully!");
      setCodeInput("");
      setPreview(null);
      loadMemberships();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Enrollment request failed";
      toast.error(msg);
      setPreviewError(msg);
    } finally {
      setJoinLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("studentDashTab");
    sessionStorage.removeItem("studentDashClassId");
    logout();
    router.push("/student/login");
  }

  if (!user) return null;

  const approvedClasses = memberships.filter(m => m.status === "approved");
  const pendingClasses = memberships.filter(m => m.status === "pending");
  const rejectedClasses = memberships.filter(m => m.status === "rejected");
  const alreadyInClass = preview ? memberships.find(m => m.class_id === preview.id) : undefined;

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      {/* ── Fixed Top Header ── */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant z-50 flex items-center justify-between px-6 md:px-8">
        {/* Brand / Logo (Left) */}
        <div className="flex items-center gap-3">
          <img
            src="/logo_bg_removed.png"
            alt="AutoTest Pro Logo"
            className="h-8 w-auto shrink-0 object-contain"
          />
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
                <span>{user.name.substring(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex flex-col min-w-0 pr-1">
                <span className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface truncate max-w-[120px]">
                  {user.name}
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
                      {user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-sans text-xs font-bold text-on-surface uppercase tracking-wider truncate">
                        {user.name}
                      </span>
                      <span className="font-mono text-[10px] text-secondary truncate">
                        {user.email}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 bg-primary text-white text-[9px] font-bold tracking-widest uppercase mt-1 self-start">
                        STUDENT
                      </span>
                    </div>
                  </div>

                  <div className="py-3 flex flex-col gap-2 border-b border-outline-variant text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Student ID</span>
                      <span className="font-mono text-[11px] font-bold text-on-surface">#{user.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Active Classes</span>
                      <span className="font-sans text-xs font-bold text-on-surface">{approvedClasses.length} Enrolled</span>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setTab("profile");
                        closeClass();
                        setProfileMenuOpen(false);
                      }}
                      className="w-full py-2 px-3 text-left font-sans text-xs font-bold uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">account_circle</span>
                      <span>View Full Profile</span>
                    </button>
                    <button
                      onClick={handleLogout}
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
      <aside className="fixed left-0 top-16 bottom-0 w-64 bg-surface-container-lowest border-r border-outline-variant z-40 flex flex-col justify-between p-4 md:p-6 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {/* Navigation */}
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => { setTab("join"); closeClass(); }}
              className={`w-full flex items-center justify-between px-3.5 py-3 tracking-widest text-xs uppercase transition-colors cursor-pointer text-left ${
                tab === "join" && !selectedClass
                  ? "bg-black text-white font-bold"
                  : "bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container font-semibold"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    tab === "join" && !selectedClass ? "text-primary" : "text-secondary"
                  }`}
                >
                  add_box
                </span>
                <span>Join a Class</span>
              </div>
            </button>

            <button
              onClick={() => { setTab("my-classes"); closeClass(); }}
              className={`w-full flex items-center justify-between px-3.5 py-3 tracking-widest text-xs uppercase transition-colors cursor-pointer text-left ${
                tab === "my-classes"
                  ? "bg-black text-white font-bold"
                  : "bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container font-semibold"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    tab === "my-classes" ? "text-primary" : "text-secondary"
                  }`}
                >
                  school
                </span>
                <span>My Classes</span>
              </div>
              {approvedClasses.length > 0 && (
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold font-sans">
                  {approvedClasses.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setTab("upcoming"); closeClass(); }}
              className={`w-full flex items-center justify-between px-3.5 py-3 tracking-widest text-xs uppercase transition-colors cursor-pointer text-left ${
                tab === "upcoming" && !selectedClass
                  ? "bg-black text-white font-bold"
                  : "bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container font-semibold"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    tab === "upcoming" && !selectedClass ? "text-primary" : "text-secondary"
                  }`}
                >
                  fact_check
                </span>
                <span>My Exams</span>
              </div>
              {allStudentExams.length > 0 && (
                <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold font-sans">
                  {allStudentExams.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setTab("profile"); closeClass(); }}
              className={`w-full flex items-center justify-between px-3.5 py-3 tracking-widest text-xs uppercase transition-colors cursor-pointer text-left ${
                tab === "profile" && !selectedClass
                  ? "bg-black text-white font-bold"
                  : "bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container font-semibold"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    tab === "profile" && !selectedClass ? "text-primary" : "text-secondary"
                  }`}
                >
                  account_circle
                </span>
                <span>Profile</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Bottom Sign Out */}
        <div className="mt-auto pt-6 border-t border-outline-variant">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-secondary hover:!text-primary hover:bg-surface-container transition-colors text-xs font-semibold tracking-widest uppercase cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Canvas (Offset for Top Header and Left Sidebar) ── */}
      <div className="pl-64 pt-16">
        <main className="w-full bg-surface min-h-[calc(100vh-4rem)] px-8 py-8">
          <div className="flex flex-col w-full max-w-7xl mx-auto">
            <div className="flex flex-col w-full">

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 1: JOIN A CLASS (Pixel-accurate Stitch screen)             */}
              {/* ───────────────────────────────────────────────────────────── */}
              {tab === "join" && (
                <div className="animate-fade-up">
                  {/* Editorial Accent Line */}
                  <div className="w-12 h-1 bg-brand-crimson mb-6"></div>

                  {/* Header Section */}
                  <header className="flex flex-col gap-3 mb-10">
                    <div className="flex items-center gap-3">
                      <span className="font-label-caps text-xs font-bold tracking-[0.2em] text-brand-crimson uppercase">
                        Portal Enrollment
                      </span>
                      <span className="text-neutral-400">/</span>
                      <span className="font-label-caps text-xs tracking-[0.15em] text-neutral-500 uppercase">
                        Class Code
                      </span>
                    </div>
                    <h1 className="font-serif text-4xl lg:text-5xl text-brand-dark tracking-tight font-normal">
                      Join a Class
                    </h1>
                    <p className="font-body-md text-base text-neutral-600 max-w-2xl leading-relaxed">
                      Enter the class code provided by your instructor to enroll, synchronize automated test suites, and access live assignments.
                    </p>
                  </header>

                  {/* Two-Column Balanced Workspace */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Primary Column: Enrollment Card (7 cols) */}
                    <section className="lg:col-span-7 flex flex-col gap-6">
                      <div className="bg-surface-container-lowest border border-black/10 p-8 sm:p-10 flex flex-col gap-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)]">
                        {/* Card Header & Badge */}
                        <div className="flex items-center justify-between border-b border-black/10 pb-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-brand-dark flex items-center justify-center text-brand-crimson">
                              <span className="material-symbols-outlined text-[22px]">vpn_key</span>
                            </div>
                            <div>
                              <span className="font-label-caps text-[11px] text-neutral-500 uppercase tracking-[0.18em] block">
                                Access Key
                              </span>
                              <span className="font-serif text-2xl text-brand-dark font-normal">
                                Enter Class Code
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 border border-brand-crimson text-brand-crimson font-label-caps text-[10px] uppercase font-bold tracking-[0.16em]">
                            REQUIRED
                          </span>
                        </div>

                        {/* Code Entry Block */}
                        <form
                          className="flex flex-col gap-6"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (preview) handleEnrollment();
                            else triggerLookup(codeInput);
                          }}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2.5">
                              <label
                                className="font-label-caps text-xs uppercase tracking-[0.16em] text-brand-dark font-bold"
                                htmlFor="classCodeInput"
                              >
                                CLASS CODE
                              </label>
                              <span className="font-label-caps text-[11px] text-neutral-500 flex items-center gap-1 uppercase tracking-wider">
                                <span className="material-symbols-outlined text-[14px] text-brand-crimson">check</span>
                                Case-insensitive
                              </span>
                            </div>

                            {/* Monospace Code Input Box */}
                            <div className="relative flex items-center">
                              <input
                                autoComplete="off"
                                className="w-full bg-white text-brand-dark font-code-input text-2xl tracking-[0.25em] px-5 py-4 border-2 border-black outline-none transition-all placeholder:text-neutral-300 focus:border-brand-crimson focus:ring-0 uppercase font-medium"
                                id="classCodeInput"
                                maxLength={9}
                                value={codeInput}
                                onChange={(e) => handleCodeInput(e.target.value)}
                                placeholder="ABCD-1234"
                                spellCheck={false}
                                type="text"
                              />
                              <button
                                className="absolute right-3 px-3.5 py-2 bg-neutral-100 text-brand-dark border border-black/20 hover:!bg-black hover:!text-white font-label-caps text-xs tracking-wider uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                                id="pasteBtn"
                                onClick={pasteFromClipboard}
                                title="Paste from clipboard"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[15px]">content_paste</span>
                                Paste
                              </button>
                            </div>

                            <div className="flex items-center justify-between mt-3 px-1">
                              <p className="font-label-caps text-xs text-neutral-500 flex items-center gap-1.5 tracking-wider">
                                <span className="material-symbols-outlined text-[15px] text-brand-crimson">info</span>
                                Format: 8-character code with hyphen (e.g. ABCD-1234)
                              </p>
                              <span className="font-code-input text-xs text-neutral-500 tracking-widest font-semibold" id="charCounter">
                                {codeInput.length} / 9
                              </span>
                            </div>
                          </div>

                          {/* Error message */}
                          {previewError && (
                            <div className="border border-brand-crimson bg-neutral-50 p-3.5 text-xs font-medium text-brand-crimson font-label-caps">
                              ⚠️ {previewError}
                            </div>
                          )}

                          {/* Success message */}
                          {joinSuccess && (
                            <div className="border border-black bg-neutral-50 p-4 text-xs font-bold text-brand-dark font-label-caps flex items-center gap-2">
                              <span className="material-symbols-outlined text-brand-crimson">check_circle</span>
                              ENROLLMENT REQUEST RECORDED. YOUR INSTRUCTOR WILL APPROVE IT.
                            </div>
                          )}

                          {/* Live Preview Card */}
                          {preview && (
                            <div className="border border-brand-crimson bg-neutral-50 p-4 transition-all" id="previewCard">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3.5">
                                  <div className="w-10 h-10 bg-brand-crimson text-white flex items-center justify-center font-serif text-lg font-bold">
                                    {preview.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-serif text-lg text-brand-dark block">{preview.name}</span>
                                    <span className="font-label-caps text-xs text-neutral-600 tracking-wider">
                                      Prof. {preview.teacher_name} • {preview.student_count} Students
                                    </span>
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 bg-brand-dark text-white font-label-caps text-[10px] uppercase font-bold tracking-[0.18em]">
                                  FOUND
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Submit Button */}
                          {preview ? (
                            alreadyInClass ? (
                              <div className="w-full bg-neutral-100 text-brand-dark font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-6 border border-black/20 text-center">
                                {alreadyInClass.status === "approved" ? "✓ ALREADY ENROLLED IN CLASS" : "⏳ REQUEST PENDING APPROVAL"}
                              </div>
                            ) : (
                              <button
                                className="w-full bg-brand-crimson text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-6 border border-brand-crimson hover:!bg-brand-dark hover:!border-brand-dark transition-all flex items-center justify-center gap-3 group cursor-pointer"
                                id="enrollButton"
                                type="button"
                                disabled={joinLoading}
                                onClick={handleEnrollment}
                              >
                                <span>{joinLoading ? "ENROLLING..." : "CONFIRM & ENROLL IN CLASS"}</span>
                                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                                  arrow_forward
                                </span>
                              </button>
                            )
                          ) : (
                            <button
                              className="w-full bg-brand-dark text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-6 border border-brand-dark hover:!bg-brand-crimson hover:!border-brand-crimson transition-all flex items-center justify-center gap-3 group cursor-pointer"
                              id="enrollButton"
                              type="submit"
                              disabled={previewLoading || codeInput.length < 7}
                            >
                              <span>{previewLoading ? "LOOKING UP CLASS..." : "FIND & ENROLL IN CLASS"}</span>
                              <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1 text-brand-crimson group-hover:text-white">
                                arrow_forward
                              </span>
                            </button>
                          )}
                        </form>

                        {/* Alternative Action Divider */}
                        <div className="relative flex items-center justify-center my-1">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full h-px bg-black/10"></div>
                          </div>
                          <span className="relative px-4 bg-surface-container-lowest font-label-caps text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">
                            OR
                          </span>
                        </div>

                        {/* Join with URL Option */}
                        <button
                          className="w-full bg-transparent hover:!bg-neutral-100 text-brand-dark font-label-caps text-xs tracking-[0.16em] uppercase font-bold py-3.5 px-4 border border-black/20 hover:!border-black transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          onClick={() => setUrlModalOpen(true)}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[18px] text-brand-crimson">link</span>
                          <span>JOIN WITH AN INVITE URL</span>
                        </button>

                        {/* Custom Modal for Join with Invite URL */}
                        {urlModalOpen && (
                          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                            <div className="bg-surface-container-lowest border-2 border-black p-6 sm:p-8 max-w-lg w-full shadow-[8px_8px_0_0_#000] animate-fade-up">
                              <div className="w-10 h-1 bg-brand-crimson mb-4"></div>
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="font-serif text-2xl sm:text-3xl font-normal text-brand-dark">Join With Invite URL</h3>
                                <button
                                  onClick={() => setUrlModalOpen(false)}
                                  className="p-1 text-secondary hover:!text-black transition-colors cursor-pointer"
                                  type="button"
                                  aria-label="Close modal"
                                >
                                  <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                              </div>
                              <p className="font-label-caps text-xs tracking-wider text-secondary uppercase mb-6">
                                Paste your course invitation link to automatically extract the enrollment code.
                              </p>
                              <form onSubmit={handleInviteUrlSubmit} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                  <label className="font-label-caps text-[11px] font-bold text-on-surface uppercase tracking-wider">
                                    Invitation Link
                                  </label>
                                  <input
                                    type="url"
                                    autoFocus
                                    value={inviteUrlInput}
                                    onChange={(e) => setInviteUrlInput(e.target.value)}
                                    placeholder="https://autotest.pro/join/ABC-1234"
                                    className="w-full bg-white text-on-surface font-sans text-sm px-4 py-3 border-2 border-black outline-none placeholder:text-neutral-400 focus:border-brand-crimson transition-colors"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setUrlModalOpen(false)}
                                    className="px-4 py-2.5 border border-outline-variant hover:!border-black text-xs font-bold uppercase tracking-wider text-secondary hover:!text-black transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-black hover:!bg-brand-crimson text-white text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-[3px_3px_0_0_#ff1d58]"
                                  >
                                    Extract &amp; Enroll
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                        )}

                        {/* Tip / Helper Callout Box */}
                        <div className="border-l-2 border-brand-crimson bg-neutral-100/70 p-4 flex items-start gap-3.5">
                          <span className="material-symbols-outlined text-brand-crimson text-[20px] shrink-0 mt-0.5">
                            help_outline
                          </span>
                          <div className="flex flex-col gap-1">
                            <span className="font-label-caps text-xs text-brand-dark font-bold uppercase tracking-wider">
                              Need help finding your code?
                            </span>
                            <p className="font-body-md text-xs text-neutral-600 leading-relaxed">
                              Class codes are 6 to 8 alphanumeric characters provided directly by your teacher on the syllabus or whiteboard. Codes are case-insensitive.
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Side / Context Column (5 cols) */}
                    <aside className="lg:col-span-5 flex flex-col gap-6">
                      {/* Currently Enrolled Card */}
                      <div className="bg-surface-container-lowest border border-black/10 p-6 flex flex-col gap-5 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center justify-between border-b border-black/10 pb-4">
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-brand-crimson text-[20px]">school</span>
                            <h2 className="font-label-caps text-xs uppercase tracking-[0.18em] text-brand-dark font-bold">
                              CURRENTLY ENROLLED
                            </h2>
                          </div>
                          <span className="w-5 h-5 bg-black text-white font-label-caps text-[10px] flex items-center justify-center font-bold">
                            {approvedClasses.length}
                          </span>
                        </div>

                        {approvedClasses.length === 0 ? (
                          <div className="p-4 bg-surface-container-low border border-black/5 text-center text-xs font-label-caps text-neutral-500">
                            NO ACTIVE CLASSES YET
                          </div>
                        ) : (
                          approvedClasses.map(cls => (
                            <div key={cls.id} className="bg-surface-container-low border border-black/10 p-4 flex flex-col gap-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-brand-crimson text-white flex items-center justify-center font-serif text-base font-bold">
                                    {cls.class_name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="font-serif text-lg text-brand-dark leading-snug truncate">
                                      {cls.class_name}
                                    </h3>
                                  </div>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-brand-dark bg-white text-brand-dark font-label-caps text-[9px] font-bold tracking-[0.15em] shrink-0 uppercase">
                                  <span className="w-1.5 h-1.5 bg-brand-crimson"></span>ACTIVE
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5 pt-1 border-t border-black/5">
                                <div className="w-5 h-5 bg-black text-white flex items-center justify-center font-label-caps text-[10px] font-bold">
                                  {cls.teacher_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-body-md text-xs text-brand-dark font-medium">
                                  Prof. {cls.teacher_name}
                                </span>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => { setTab("my-classes"); openClass(cls); }}
                                  className="inline-flex items-center gap-1 font-label-caps text-xs text-brand-dark hover:text-brand-crimson font-bold uppercase tracking-wider group cursor-pointer"
                                >
                                  <span>View Class Workspace</span>
                                  <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-1">
                                    arrow_forward
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* FAQ Accordion Module */}
                      <div className="bg-surface-container-lowest border border-black/10 p-6 flex flex-col gap-5 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2.5 border-b border-black/10 pb-4">
                          <span className="material-symbols-outlined text-brand-crimson text-[20px]">help</span>
                          <h2 className="font-label-caps text-xs uppercase tracking-[0.18em] text-brand-dark font-bold">
                            FREQUENTLY ASKED QUESTIONS
                          </h2>
                        </div>
                        <div className="flex flex-col gap-2.5">
                          <details className="group bg-surface-container-low border border-black/10 open:border-black transition-colors">
                            <summary className="flex items-center justify-between p-3.5 cursor-pointer list-none select-none font-label-caps text-xs uppercase tracking-wider text-brand-dark font-bold">
                              <span>Can't find your class code?</span>
                              <span className="material-symbols-outlined text-[18px] text-neutral-600 transition-transform group-open:rotate-180">
                                expand_more
                              </span>
                            </summary>
                            <div className="px-3.5 pb-3.5 font-body-md text-xs text-neutral-600 leading-relaxed border-t border-black/5 pt-2 mt-1">
                              Check your course management system (Canvas, Google Classroom, Blackboard) or check the top of your syllabus handout. Your teacher can regenerate or confirm your code anytime.
                            </div>
                          </details>

                          <details className="group bg-surface-container-low border border-black/10 open:border-black transition-colors">
                            <summary className="flex items-center justify-between p-3.5 cursor-pointer list-none select-none font-label-caps text-xs uppercase tracking-wider text-brand-dark font-bold">
                              <span>Already enrolled in a section?</span>
                              <span className="material-symbols-outlined text-[18px] text-neutral-600 transition-transform group-open:rotate-180">
                                expand_more
                              </span>
                            </summary>
                            <div className="px-3.5 pb-3.5 font-body-md text-xs text-neutral-600 leading-relaxed border-t border-black/5 pt-2 mt-1">
                              If you are switching class periods, entering the new code will automatically migrate your assignments and grades while alerting your instructor.
                            </div>
                          </details>

                          <details className="group bg-surface-container-low border border-black/10 open:border-black transition-colors">
                            <summary className="flex items-center justify-between p-3.5 cursor-pointer list-none select-none font-label-caps text-xs uppercase tracking-wider text-brand-dark font-bold">
                              <span>Are class codes case-sensitive?</span>
                              <span className="material-symbols-outlined text-[18px] text-neutral-600 transition-transform group-open:rotate-180">
                                expand_more
                              </span>
                            </summary>
                            <div className="px-3.5 pb-3.5 font-body-md text-xs text-neutral-600 leading-relaxed border-t border-black/5 pt-2 mt-1">
                              No. You can type <code className="font-code-input text-brand-crimson font-bold uppercase">abc-1234</code> or <code className="font-code-input text-brand-crimson font-bold uppercase">ABC-1234</code>; our parser automatically formats and normalizes your input.
                            </div>
                          </details>
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              )}


              {/* ── TAB 2: MY CLASSES ── */}
              {tab === "my-classes" && selectedClass ? (
                <StudentClassWorkspaceView
                  m={selectedClass}
                  onBack={closeClass}
                  token={token!}
                  initialSubTab={workspaceSubTab}
                />
              ) : tab === "my-classes" && (
                <div className="animate-fade-up">
                  {/* Page Header */}
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 pb-6 border-b border-black/10">
                    <div>
                      <span className="text-[11px] font-bold tracking-[0.25em] uppercase text-brand-crimson mb-1 block">
                        Course Management
                      </span>
                      <h1 className="font-serif text-4xl lg:text-5xl text-brand-dark tracking-tight font-normal">
                        My Classes
                      </h1>
                      <p className="text-xs uppercase tracking-[0.15em] text-neutral-500 mt-2 flex items-center gap-2 font-medium flex-wrap">
                        <span className="w-2 h-2 bg-brand-crimson inline-block shrink-0"></span>
                        {approvedClasses.length} Active Course{approvedClasses.length !== 1 ? "s" : ""}
                        <span className="text-black/20">|</span>
                        {pendingClasses.length} Pending Approval
                        <span className="text-black/20">|</span>
                        AutoTest Bench Active
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setTab("join")}
                        className="px-6 py-3 bg-brand-dark hover:!bg-brand-crimson hover:!border-brand-crimson text-white text-[12px] font-bold uppercase tracking-[0.18em] transition-all flex items-center gap-2 border border-brand-dark cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Join New Class</span>
                      </button>
                    </div>
                  </div>

                  {/* Stats Bento Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
                    <div className="p-6 bg-surface-container-lowest border border-black/10 flex items-start justify-between relative hover:border-black transition-colors overflow-hidden">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">Active Enrollment</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="font-serif text-3xl font-medium text-brand-dark">{String(approvedClasses.length).padStart(2, "0")}</span>
                          <span className="text-[10px] font-bold tracking-[0.15em] text-brand-crimson uppercase">Verified</span>
                        </div>
                        <span className="text-[11px] tracking-wider uppercase text-neutral-500 mt-2 font-medium">
                          {approvedClasses.length > 0 ? approvedClasses[0].class_name.substring(0, 20) : "No active courses"}
                        </span>
                      </div>
                      <div className="w-10 h-10 border border-black/10 bg-surface flex items-center justify-center text-brand-dark shrink-0">
                        <span className="material-symbols-outlined text-[20px]">school</span>
                      </div>
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-crimson"></div>
                    </div>
                    <div className="p-6 bg-surface-container-lowest border border-black/10 flex items-start justify-between relative hover:border-black transition-colors overflow-hidden">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">Pending Approval</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="font-serif text-3xl font-medium text-brand-dark">{String(pendingClasses.length).padStart(2, "0")}</span>
                          <span className="text-[10px] font-bold tracking-[0.15em] text-brand-dark uppercase">
                            {pendingClasses.length === 0 ? "All Clear" : "Pending"}
                          </span>
                        </div>
                        <span className="text-[11px] tracking-wider uppercase text-neutral-500 mt-2 font-medium">Awaiting instructor review</span>
                      </div>
                      <div className="w-10 h-10 border border-black/10 bg-surface flex items-center justify-center text-brand-dark shrink-0">
                        <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
                      </div>
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-dark"></div>
                    </div>
                    <div className="p-6 bg-surface-container-lowest border border-black/10 flex items-start justify-between relative hover:border-black transition-colors overflow-hidden">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">Total Enrolled</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="font-serif text-3xl font-medium text-brand-crimson">{String(memberships.length).padStart(2, "0")}</span>
                          <span className="text-[10px] font-bold tracking-[0.15em] text-brand-crimson uppercase">Sessions</span>
                        </div>
                        <span className="text-[11px] tracking-wider uppercase text-neutral-500 mt-2 font-medium">Academic year 2024–25</span>
                      </div>
                      <div className="w-10 h-10 border border-black/10 bg-surface flex items-center justify-center text-brand-crimson shrink-0">
                        <span className="material-symbols-outlined text-[20px]">analytics</span>
                      </div>
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-crimson"></div>
                    </div>
                  </div>

                  {/* Search & Filter Ribbon */}
                  <div className="p-4 bg-surface-container-lowest border border-black/10 flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                    <div className="relative w-full md:w-96 flex items-center">
                      <span className="material-symbols-outlined text-neutral-400 absolute left-3 pointer-events-none text-[18px]">search</span>
                      <input
                        className="w-full pl-9 pr-4 py-2 border border-black/10 bg-surface text-brand-dark placeholder:text-neutral-400 text-xs uppercase tracking-wider font-medium focus:bg-white focus:border-black focus:outline-none transition-all"
                        placeholder="SEARCH CLASSES, INSTRUCTORS..."
                        type="text"
                        value={classSearch}
                        onChange={(e) => setClassSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-black/10 bg-surface p-0.5">
                        <button
                          onClick={() => setClassTab("active")}
                          className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-all cursor-pointer ${classTab === "active" ? "bg-brand-dark text-white" : "text-neutral-500 hover:text-brand-dark"}`}
                        >
                          Active ({approvedClasses.length})
                        </button>
                        <button
                          onClick={() => setClassTab("pending")}
                          className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] transition-all cursor-pointer ${classTab === "pending" ? "bg-brand-dark text-white" : "text-neutral-500 hover:text-brand-dark"}`}
                        >
                          Pending ({pendingClasses.length})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  {memLoading ? (
                    <div className="flex flex-col gap-4">
                      {[1, 2].map(i => (
                        <div key={i} className="h-64 bg-surface-container-low border border-black/10 animate-pulse" />
                      ))}
                    </div>
                  ) : memberships.length === 0 ? (
                    <div className="bg-surface-container-lowest border border-black/10 p-12 text-center">
                      <span className="material-symbols-outlined text-[48px] text-neutral-400 mb-4 block">school</span>
                      <h2 className="font-serif text-2xl text-brand-dark mb-2">No Enrolled Classes</h2>
                      <p className="font-body-md text-sm text-neutral-600 mb-6">You have not enrolled in any classes yet.</p>
                      <button onClick={() => setTab("join")} className="bg-brand-dark text-white text-xs tracking-[0.2em] uppercase font-bold py-3.5 px-6 hover:bg-brand-crimson transition-all cursor-pointer">
                        Join a Class →
                      </button>
                    </div>
                  ) : (
                    <>
                      {classTab === "active" && (
                        <div className="flex flex-col gap-4">
                          {/* Section header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-bold tracking-[0.25em] text-brand-dark uppercase">
                                Enrolled Courses ({approvedClasses.length})
                              </span>
                              <span className="px-2 py-0.5 bg-brand-crimson text-white text-[9px] font-bold tracking-[0.15em] uppercase">Active Term</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-medium uppercase tracking-wider">
                              <span className="material-symbols-outlined text-[15px]">sync</span>
                              <span>Live</span>
                            </div>
                          </div>

                          {/* Class cards */}
                          {approvedClasses
                            .filter(cls =>
                              !classSearch ||
                              cls.class_name.toLowerCase().includes(classSearch.toLowerCase()) ||
                              cls.teacher_name.toLowerCase().includes(classSearch.toLowerCase())
                            )
                            .map(cls => {
                              const stats = classStats[cls.class_id] || { examsCount: 0, syllabusCount: 0 };
                              return (
                                <div
                                  key={cls.id}
                                  className="w-full bg-surface-container-lowest border border-outline-variant hover:border-black transition-all duration-200 p-6 sm:p-7 shadow-[2px_2px_0_0_rgba(0,0,0,0.02)] group flex flex-col gap-5"
                                >
                                  {/* Top Header Row: Course Code, Title & Instructor */}
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-3">
                                        <span className="px-2.5 py-1 bg-black text-white font-mono text-[11px] font-bold tracking-[0.15em] uppercase">
                                          {cls.class_name.replace(/\s+/g, "-").substring(0, 8).toUpperCase()}
                                        </span>
                                        <span className="text-xs uppercase tracking-wider font-semibold text-secondary flex items-center gap-1.5">
                                          <span className="w-5 h-5 bg-black text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                            {cls.teacher_name.charAt(0).toUpperCase()}
                                          </span>
                                          Prof. {cls.teacher_name}
                                        </span>
                                      </div>
                                      <h2 className="font-serif text-2xl lg:text-3xl text-brand-dark group-hover:text-primary transition-colors font-medium">
                                        {cls.class_name}
                                      </h2>
                                      {cls.class_description && (
                                        <p className="text-sm text-neutral-600 font-body-md leading-relaxed mt-1 max-w-3xl">
                                          {cls.class_description}
                                        </p>
                                      )}
                                    </div>

                                    {/* Linear Counts Metrics Display */}
                                    <div className="flex items-center gap-3 shrink-0 self-start">
                                      <div className="px-3.5 py-2 bg-surface border border-outline-variant flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-[18px] text-primary">menu_book</span>
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary leading-none">
                                            Syllabus
                                          </span>
                                          <span className="font-serif text-sm font-bold text-on-surface leading-tight mt-0.5">
                                            {stats.syllabusCount} Uploaded
                                          </span>
                                        </div>
                                      </div>

                                      <div className="px-3.5 py-2 bg-surface border border-outline-variant flex items-center gap-2.5">
                                        <span className="material-symbols-outlined text-[18px] text-primary">quiz</span>
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary leading-none">
                                            Assessments
                                          </span>
                                          <span className="font-serif text-sm font-bold text-on-surface leading-tight mt-0.5">
                                            {stats.examsCount} Exam{stats.examsCount !== 1 ? "s" : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action Ribbon */}
                                  <div className="pt-4 border-t border-outline-variant flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => openClass(cls, "syllabus")}
                                        className="px-4 py-2.5 border border-outline-variant bg-surface-container-lowest hover:!border-black hover:!bg-black hover:!text-white text-on-surface text-xs font-bold tracking-[0.15em] uppercase transition-all flex items-center gap-2 cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">menu_book</span>
                                        <span>View Syllabus</span>
                                      </button>
                                      <button
                                        onClick={() => openClass(cls, "exams")}
                                        className="px-4 py-2.5 border border-outline-variant bg-surface-container-lowest hover:!border-black hover:!bg-black hover:!text-white text-on-surface text-xs font-bold tracking-[0.15em] uppercase transition-all flex items-center gap-2 cursor-pointer"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">quiz</span>
                                        <span>View Exams</span>
                                      </button>
                                    </div>

                                    <button
                                      onClick={() => openClass(cls, "exams")}
                                      className="px-6 py-2.5 bg-black hover:!bg-brand-crimson text-white transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] cursor-pointer shadow-[2px_2px_0_0_#000]"
                                    >
                                      <span>Enter Class</span>
                                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                          {/* Empty active state */}
                          {approvedClasses.filter(cls =>
                            !classSearch ||
                            cls.class_name.toLowerCase().includes(classSearch.toLowerCase()) ||
                            cls.teacher_name.toLowerCase().includes(classSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="p-12 border border-dashed border-black/15 bg-surface flex flex-col items-center justify-center text-center">
                              <div className="w-10 h-10 border border-black/10 bg-white flex items-center justify-center text-neutral-400 mb-3">
                                <span className="material-symbols-outlined text-[20px]">inbox</span>
                              </div>
                              <span className="text-xs font-bold uppercase tracking-[0.15em] text-brand-dark">
                                {classSearch ? "No matching classes found" : "No active classes yet"}
                              </span>
                              <p className="text-[11px] text-neutral-500 mt-1 max-w-sm tracking-wide">
                                {classSearch ? "Try a different search term." : "Join a class using an enrollment code from your instructor."}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {classTab === "pending" && (
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-[11px] font-bold tracking-[0.25em] text-neutral-600 uppercase">
                              Pending Review ({pendingClasses.length})
                            </span>
                          </div>
                          {pendingClasses.length === 0 ? (
                            <div className="p-12 border border-dashed border-black/15 bg-surface flex flex-col items-center justify-center text-center">
                              <div className="w-10 h-10 border border-black/10 bg-white flex items-center justify-center text-neutral-400 mb-3">
                                <span className="material-symbols-outlined text-[20px]">inbox</span>
                              </div>
                              <span className="text-xs font-bold uppercase tracking-[0.15em] text-brand-dark">No pending class requests</span>
                              <p className="text-[11px] text-neutral-500 mt-1 max-w-sm tracking-wide">Have a new course enrollment token? Enter it in the enrollment panel to get started.</p>
                            </div>
                          ) : (
                            pendingClasses.map(cls => (
                              <div key={cls.id} className="bg-surface-container-lowest border border-black/10 p-6 flex items-center justify-between gap-4">
                                <div>
                                  <h3 className="font-serif text-xl text-brand-dark">{cls.class_name}</h3>
                                  <span className="text-xs text-neutral-500 uppercase tracking-wider">Prof. {cls.teacher_name}</span>
                                </div>
                                <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 text-[9px] font-bold tracking-[0.15em] uppercase shrink-0">PENDING</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* ── TAB 3: STUDENT PROFILE ── */}
              {tab === "profile" && (
                <div className="animate-fade-up max-w-[840px]">
                  {/* Editorial Accent Line */}
                  <div className="w-12 h-1 bg-brand-crimson mb-6"></div>

                  {/* Header Section */}
                  <header className="flex flex-col gap-3 mb-10">
                    <h1 className="font-serif text-4xl lg:text-5xl text-brand-dark tracking-tight font-normal">
                      Student Profile
                    </h1>
                    <p className="font-body-md text-base text-neutral-600 max-w-2xl leading-relaxed">
                      View your verified student credentials, enrolled class summaries, and assessment access permissions.
                    </p>
                  </header>

                  <div className="bg-surface-container-lowest border border-black/10 p-8 sm:p-10 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] flex flex-col gap-8">
                    {/* Identity Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6 border-b border-black/10 pb-8">
                      <div className="w-20 h-20 bg-brand-dark text-white font-serif text-3xl font-bold flex items-center justify-center shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-serif text-3xl text-brand-dark">{user.name}</span>
                        <span className="font-code-input text-sm text-neutral-600 mt-1">{user.email}</span>
                        <span className="inline-flex items-center self-start px-2 py-0.5 bg-black text-white font-label-caps text-[9px] font-bold tracking-[0.18em] uppercase mt-2">
                          STUDENT PORTAL
                        </span>
                      </div>
                    </div>

                    {/* Detailed Information Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-surface-container-low border border-black/10">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          STUDENT FULL NAME
                        </span>
                        <span className="font-serif text-lg text-brand-dark font-medium">{user.name}</span>
                      </div>

                      <div className="p-4 bg-surface-container-low border border-black/10">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          REGISTERED EMAIL
                        </span>
                        <span className="font-code-input text-xs text-brand-dark font-medium">{user.email}</span>
                      </div>

                      <div className="p-4 bg-surface-container-low border border-black/10">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          PORTAL ROLE
                        </span>
                        <span className="font-label-caps text-xs text-brand-dark font-bold">STUDENT (AUTHENTICATED)</span>
                      </div>

                      <div className="p-4 bg-surface-container-low border border-black/10">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          ACCOUNT STATUS
                        </span>
                        <span className="font-label-caps text-xs text-brand-crimson font-bold">ACTIVE &bull; VERIFIED</span>
                      </div>
                    </div>

                    {/* Academic Stat Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          ENROLLED CLASSES
                        </span>
                        <span className="font-serif text-3xl text-brand-dark font-bold">
                          {approvedClasses.length}
                        </span>
                      </div>

                      <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          PENDING REVIEWS
                        </span>
                        <span className="font-serif text-3xl text-brand-crimson font-bold">
                          {pendingClasses.length}
                        </span>
                      </div>

                      <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                        <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                          SYSTEM INTEGRITY
                        </span>
                        <span className="font-label-caps text-sm text-brand-dark font-bold tracking-wider mt-2 block">
                          VERIFIED
                        </span>
                      </div>
                    </div>

                    {/* Password Management */}
                    <div className="border-t border-black/10 pt-6">
                      <UpdatePasswordCard userEmail={user.email} />
                    </div>

                    {/* Sign Out Action */}
                    <div className="border-t border-black/10 pt-6 flex justify-end">
                      <button
                        onClick={handleLogout}
                        className="px-6 py-3.5 bg-brand-dark hover:!bg-brand-crimson hover:!border-brand-crimson text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold transition-all cursor-pointer"
                      >
                        Sign Out of Portal
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB 4: UPCOMING EXAMS SCHEDULE ── */}
              {tab === "upcoming" && (
                <div className="animate-fade-up max-w-6xl flex flex-col gap-8">
                  {/* Accent & Header */}
                  <div>
                    <div className="w-12 h-1 bg-brand-crimson mb-6"></div>
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-black">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 bg-brand-crimson"></span>
                          <span className="font-mono text-xs uppercase tracking-widest font-bold text-neutral-500">
                            CANDIDATE LEDGER // ALL ENROLLED COURSES
                          </span>
                        </div>
                        <h1 className="font-serif text-3xl sm:text-4xl text-[#111111] font-semibold tracking-tight">
                          My Examinations &amp; Records
                        </h1>
                        <p className="font-sans text-xs text-neutral-600 mt-1 max-w-2xl">
                          Track upcoming test schedules, review papers awaiting grading, and inspect authoritative transcripts with accredited Pass/Fail benchmarks.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-widest px-3 py-1 bg-black text-white font-bold">
                          {allStudentExams.length} TOTAL ASSIGNED
                        </span>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const now = new Date();

                    // Pre-classify all exams
                    const categorized = allStudentExams.map((exam) => {
                      const isSubmitted = exam.attempt && (exam.attempt.status === "submitted" || exam.attempt.status === "evaluated");
                      const isResultPublished = Boolean(exam.attempt?.result_published_at);
                      const isGraded = Boolean(isSubmitted && isResultPublished);
                      const isAwaiting = Boolean(isSubmitted && !isResultPublished);
                      const isInProgress = Boolean(exam.attempt && exam.attempt.status === "in_progress");

                      const start = parseUtcDate(exam.start_time);
                      const end = parseUtcDate(exam.end_time);

                      const isUpcoming = Boolean(start && now < start && !isSubmitted && !isInProgress);
                      const isEnded = Boolean(end && now > end && !isSubmitted && !isInProgress);
                      const isWindowActive = Boolean((!start || now >= start) && (!end || now <= end) && !isSubmitted && !isInProgress);

                      const passThreshold = exam.passing_percentage !== undefined && exam.passing_percentage !== null ? Number(exam.passing_percentage) : 40.0;
                      const hasScore = isGraded && exam.attempt?.total_marks !== undefined && exam.attempt?.total_marks !== null;
                      const rawScore = hasScore ? Number(exam.attempt!.total_marks) : 0;
                      const adjScore = Number(exam.attempt?.adjustment_marks || 0);
                      const totalScore = hasScore ? Math.max(0, rawScore + adjScore) : null;
                      const maxScore = exam.total_marks || 100;
                      const scorePct = totalScore !== null && maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null;
                      const isPass = scorePct !== null && scorePct >= passThreshold;

                      return {
                        exam,
                        isSubmitted,
                        isResultPublished,
                        isGraded,
                        isAwaiting,
                        isInProgress,
                        isUpcoming,
                        isEnded,
                        isWindowActive,
                        passThreshold,
                        totalScore,
                        maxScore,
                        scorePct,
                        isPass,
                        start,
                        end,
                      };
                    });

                    // KPI counts
                    const activeCount = categorized.filter((c) => c.isInProgress || c.isWindowActive || c.isUpcoming).length;
                    const awaitingCount = categorized.filter((c) => c.isAwaiting).length;
                    const gradedCount = categorized.filter((c) => c.isGraded).length;
                    const missedCount = categorized.filter((c) => c.isEnded).length;
                    const passedCount = categorized.filter((c) => c.isGraded && c.isPass).length;

                    // Filtered list
                    const filtered = categorized.filter((item) => {
                      if (examCategoryFilter === "active" && !(item.isInProgress || item.isWindowActive || item.isUpcoming)) return false;
                      if (examCategoryFilter === "awaiting" && !item.isAwaiting) return false;
                      if (examCategoryFilter === "graded" && !item.isGraded) return false;
                      if (examCategoryFilter === "missed" && !item.isEnded) return false;

                      if (examSearch.trim()) {
                        const q = examSearch.toLowerCase().trim();
                        const title = (item.exam.title || "").toLowerCase();
                        const course = (item.exam.class_name || "").toLowerCase();
                        if (!title.includes(q) && !course.includes(q)) return false;
                      }

                      return true;
                    });

                    return (
                      <div className="space-y-6">
                        {/* 4 Summary Metric Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div
                            onClick={() => setExamCategoryFilter("all")}
                            className={`p-4 border-2 border-black transition-all cursor-pointer ${
                              examCategoryFilter === "all"
                                ? "bg-black text-white shadow-[4px_4px_0px_#ba1a1a]"
                                : "bg-white text-[#111111] shadow-[3px_3px_0px_#111111] hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest block font-bold mb-1 opacity-80">
                              TOTAL ENROLLED
                            </span>
                            <div className="font-serif text-3xl font-bold leading-none">
                              {categorized.length}
                            </div>
                            <span className="font-sans text-[11px] opacity-70 mt-1 block">
                              All assigned papers
                            </span>
                          </div>

                          <div
                            onClick={() => setExamCategoryFilter("active")}
                            className={`p-4 border-2 border-black transition-all cursor-pointer ${
                              examCategoryFilter === "active"
                                ? "bg-black text-white shadow-[4px_4px_0px_#ba1a1a]"
                                : "bg-white text-[#111111] shadow-[3px_3px_0px_#111111] hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest block font-bold mb-1 text-emerald-600">
                              ACTIVE &amp; UPCOMING
                            </span>
                            <div className="font-serif text-3xl font-bold leading-none text-emerald-600">
                              {activeCount}
                            </div>
                            <span className="font-sans text-[11px] opacity-70 mt-1 block">
                              Ready or scheduled
                            </span>
                          </div>

                          <div
                            onClick={() => setExamCategoryFilter("awaiting")}
                            className={`p-4 border-2 border-black transition-all cursor-pointer ${
                              examCategoryFilter === "awaiting"
                                ? "bg-black text-white shadow-[4px_4px_0px_#ba1a1a]"
                                : "bg-white text-[#111111] shadow-[3px_3px_0px_#111111] hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest block font-bold mb-1 text-amber-600">
                              AWAITING REVIEW
                            </span>
                            <div className="font-serif text-3xl font-bold leading-none text-amber-600">
                              {awaitingCount}
                            </div>
                            <span className="font-sans text-[11px] opacity-70 mt-1 block">
                              Pending instructor release
                            </span>
                          </div>

                          <div
                            onClick={() => setExamCategoryFilter("graded")}
                            className={`p-4 border-2 border-black transition-all cursor-pointer ${
                              examCategoryFilter === "graded"
                                ? "bg-black text-white shadow-[4px_4px_0px_#ba1a1a]"
                                : "bg-white text-[#111111] shadow-[3px_3px_0px_#111111] hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest block font-bold mb-1 text-[#0047ff]">
                              GRADED TRANSCRIPTS
                            </span>
                            <div className="font-serif text-3xl font-bold leading-none text-[#0047ff]">
                              {gradedCount}
                            </div>
                            <span className="font-sans text-[11px] opacity-70 mt-1 block">
                              {passedCount} Passed benchmark
                            </span>
                          </div>
                        </div>

                        {/* Interactive Filter Pills & Search Bar */}
                        <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_#111111] flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {[
                              { id: "all", label: "ALL PAPERS", count: categorized.length },
                              { id: "active", label: "ACTIVE & UPCOMING", count: activeCount },
                              { id: "awaiting", label: "AWAITING RESULTS", count: awaitingCount },
                              { id: "graded", label: "COMPLETED & GRADED", count: gradedCount },
                              { id: "missed", label: "MISSED", count: missedCount },
                            ].map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setExamCategoryFilter(f.id as any)}
                                className={`px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider border border-black transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                  examCategoryFilter === f.id
                                    ? "bg-black text-white shadow-[2px_2px_0px_#111111]"
                                    : "bg-surface hover:bg-neutral-100 text-[#111111]"
                                }`}
                              >
                                <span>{f.label}</span>
                                <span className={`px-1.5 py-0.2 text-[10px] font-bold ${
                                  examCategoryFilter === f.id ? "bg-white text-black" : "bg-neutral-200 text-black"
                                }`}>
                                  {f.count}
                                </span>
                              </button>
                            ))}
                          </div>

                          <div className="relative min-w-[240px]">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-neutral-400 text-[18px]">
                              search
                            </span>
                            <input
                              type="text"
                              value={examSearch}
                              onChange={(e) => setExamSearch(e.target.value)}
                              placeholder="Search assessment or course..."
                              className="w-full pl-9 pr-3 py-2 bg-surface border border-black font-sans text-xs outline-none focus:border-[#ba1a1a]"
                            />
                            {examSearch && (
                              <button
                                onClick={() => setExamSearch("")}
                                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-black font-bold text-xs"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Table or Empty State */}
                        {filtered.length === 0 ? (
                          <div className="bg-white border-2 border-black p-12 text-center shadow-[4px_4px_0px_#111111]">
                            <span className="material-symbols-outlined text-4xl text-neutral-400 mb-3 block">
                              inventory_2
                            </span>
                            <h3 className="font-serif text-2xl font-bold text-[#111111] mb-2">
                              No Examinations Found
                            </h3>
                            <p className="font-sans text-xs text-neutral-600 max-w-md mx-auto mb-6">
                              No assessment records match your current filter selection. Clear filters to review all papers.
                            </p>
                            <button
                              onClick={() => { setExamCategoryFilter("all"); setExamSearch(""); }}
                              className="px-6 py-2.5 bg-black hover:bg-brand-crimson text-white font-mono text-xs uppercase tracking-widest font-bold transition-colors border border-black cursor-pointer"
                            >
                              Reset Filters
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#111111] overflow-x-auto">
                            <table className="w-full border-collapse text-left font-sans text-xs">
                              <thead>
                                <tr className="border-b-2 border-black bg-[#f9f9f9] font-mono text-[11px] uppercase tracking-wider text-[#111111]">
                                  <th className="py-3.5 px-5 font-bold">Assessment &amp; Course</th>
                                  <th className="py-3.5 px-5 font-bold">Window Schedule / Submission</th>
                                  <th className="py-3.5 px-5 font-bold">Specifications &amp; Benchmark</th>
                                  <th className="py-3.5 px-5 font-bold text-center">Status / Rating</th>
                                  <th className="py-3.5 px-5 font-bold text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-black/10">
                                {filtered.map((item) => {
                                  const {
                                    exam,
                                    isSubmitted,
                                    isGraded,
                                    isAwaiting,
                                    isInProgress,
                                    isUpcoming,
                                    isEnded,
                                    isWindowActive,
                                    passThreshold,
                                    totalScore,
                                    maxScore,
                                    scorePct,
                                    isPass,
                                  } = item;

                                  return (
                                    <tr key={exam.id} className="hover:bg-[#fbfbfb] transition-colors">
                                      {/* Assessment & Course */}
                                      <td className="py-4 px-5">
                                        <span className="font-serif text-base font-bold text-[#111111] block mb-0.5">
                                          {exam.title}
                                        </span>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="font-mono text-[10px] uppercase font-bold text-brand-crimson tracking-wider">
                                            {exam.class_name}
                                          </span>
                                        </div>
                                      </td>

                                      {/* Window Schedule / Submission */}
                                      <td className="py-4 px-5 font-mono text-xs text-neutral-600">
                                        {isSubmitted && exam.attempt?.completed_at ? (
                                          <div>
                                            <span className="block font-bold text-[#111111]">
                                              Submitted: {new Date(exam.attempt.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                            </span>
                                            <span className="text-[10px] text-neutral-500">
                                              {new Date(exam.attempt.completed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                          </div>
                                        ) : (
                                          formatScheduleWindow(exam.start_time, exam.end_time)
                                        )}
                                      </td>

                                      {/* Specifications & Benchmark */}
                                      <td className="py-4 px-5 font-mono text-xs">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="font-bold text-[#111111]">
                                            {exam.total_marks} TOTAL MARKS
                                          </span>
                                          <span className="text-neutral-500 text-[10px]">
                                            {exam.duration_minutes} MINS • {(exam.difficulty || "MEDIUM").toUpperCase()}
                                          </span>
                                          <span className="text-blue-700 text-[10px] font-bold">
                                            PASS REQ: {passThreshold}% (≥ {((exam.total_marks * passThreshold) / 100).toFixed(1)} pts)
                                          </span>
                                        </div>
                                      </td>

                                      {/* Status / Rating */}
                                      <td className="py-4 px-5 text-center">
                                        {isGraded ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-baseline gap-1">
                                              <span className="font-serif text-base font-bold text-primary">
                                                {totalScore}
                                              </span>
                                              <span className="font-mono text-xs text-secondary font-bold">
                                                / {maxScore}
                                              </span>
                                              <span className="font-mono text-xs text-neutral-600 ml-1 font-bold">
                                                ({scorePct}%)
                                              </span>
                                            </div>
                                            <span
                                              className={`px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                                                isPass
                                                  ? "bg-[#005430] text-white"
                                                  : "bg-[#ba1a1a] text-white"
                                              }`}
                                            >
                                              {isPass ? "PASS" : "FAIL"}
                                            </span>
                                          </div>
                                        ) : isAwaiting ? (
                                          <div className="inline-flex flex-col items-center">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-bold uppercase tracking-wider">
                                              <span className="material-symbols-outlined text-[13px] animate-spin">
                                                sync
                                              </span>
                                              IN REVIEW
                                            </span>
                                            <span className="font-mono text-[9px] text-neutral-500 mt-0.5">
                                              Pending publication
                                            </span>
                                          </div>
                                        ) : isInProgress ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-crimson text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                                            <span className="w-1.5 h-1.5 bg-white animate-pulse rounded-full" />
                                            IN PROGRESS
                                          </span>
                                        ) : isWindowActive ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#005430] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                                            <span className="w-1.5 h-1.5 bg-[#7afbb1] rounded-full" />
                                            WINDOW ACTIVE
                                          </span>
                                        ) : isUpcoming ? (
                                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#eeeeee] text-neutral-600 font-mono text-[10px] font-bold uppercase tracking-wider">
                                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                                            SCHEDULED
                                          </span>
                                        ) : (
                                          <span className="px-2.5 py-1 bg-[#eeeeee] text-neutral-600 font-mono text-[10px] font-bold uppercase tracking-wider">
                                            WINDOW CLOSED
                                          </span>
                                        )}
                                      </td>

                                      {/* Action */}
                                      <td className="py-4 px-5 text-right">
                                        {isGraded ? (
                                          <a
                                            href={`/student/exams/${exam.id}/result`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-black hover:bg-brand-crimson text-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border border-black shadow-[2px_2px_0px_#111111]"
                                          >
                                            <span>VIEW TRANSCRIPT</span>
                                            <span>→</span>
                                          </a>
                                        ) : isAwaiting ? (
                                          <a
                                            href={`/student/exams/${exam.id}/submitted`}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-black text-[#111111] hover:bg-black hover:text-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors"
                                          >
                                            <span>RECEIPT</span>
                                          </a>
                                        ) : isInProgress ? (
                                          <a
                                            href={`/student/exams/${exam.id}/attempt`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-crimson hover:bg-black text-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border border-black shadow-[2px_2px_0px_#111111]"
                                          >
                                            <span>RESUME</span>
                                            <span>→</span>
                                          </a>
                                        ) : isWindowActive ? (
                                          <a
                                            href={`/student/exams/${exam.id}`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#111111] hover:bg-brand-crimson text-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors border border-black shadow-[2px_2px_0px_#111111]"
                                          >
                                            <span>BEGIN EXAM</span>
                                            <span>→</span>
                                          </a>
                                        ) : isUpcoming ? (
                                          <a
                                            href={`/student/exams/${exam.id}`}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-black text-[#111111] hover:bg-black hover:text-white font-mono text-[11px] font-bold uppercase tracking-wider transition-colors"
                                          >
                                            <span>BRIEFING</span>
                                          </a>
                                        ) : (
                                          <span className="font-mono text-[11px] text-neutral-400 uppercase font-semibold">
                                            CLOSED
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Course Details Workspace: Syllabus (9fd77788) & Exams (e5d38fbc) ───────────

function StudentClassWorkspaceView({
  m,
  onBack,
  token,
  initialSubTab = "exams",
}: {
  m: Membership;
  onBack: () => void;
  token: string;
  initialSubTab?: "syllabus" | "exams";
}) {
  const [subTab, setSubTab] = useState<"syllabus" | "exams">(initialSubTab);
  const [syllabusList, setSyllabusList] = useState<SyllabusItem[]>([]);
  const [syllabusLoading, setSyllabusLoading] = useState(true);

  const [examList, setExamList] = useState<StudentExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadSyllabus = useCallback(() => {
    setSyllabusLoading(true);
    fetchSyllabusList(m.class_id)
      .then(setSyllabusList)
      .catch(() => {})
      .finally(() => setSyllabusLoading(false));
  }, [m.class_id]);

  const loadExams = useCallback(() => {
    setExamsLoading(true);
    getAllStudentExams(token)
      .then((data) => setExamList(data.filter((e) => e.class_id === m.class_id)))
      .catch(() => {})
      .finally(() => setExamsLoading(false));
  }, [token, m.class_id]);

  useEffect(() => {
    loadSyllabus();
    loadExams();
  }, [loadSyllabus, loadExams]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        fetchSyllabusList(m.class_id).then(setSyllabusList),
        getAllStudentExams(token).then((data) => setExamList(data.filter((e) => e.class_id === m.class_id))),
      ]);
      toast.success("Workspace synchronized successfully");
    } catch {
      toast.error("Failed to sync workspace");
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  };



  const formatSubmissionDate = (completedStr?: string | null, startedStr?: string | null) => {
    if (!completedStr) return "";
    const opts: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    const compDate = new Date(completedStr);
    let diffText = "";
    if (startedStr) {
      const diffMs = compDate.getTime() - new Date(startedStr).getTime();
      const mins = Math.max(1, Math.round(diffMs / 60000));
      diffText = ` (Took ${mins} min${mins !== 1 ? "s" : ""})`;
    }
    return `${compDate.toLocaleString("en-US", opts)}${diffText}`;
  };

  const completedExams = examList.filter(
    (e) => e.attempt && (e.attempt.status === "submitted" || e.attempt.status === "evaluated")
  );
  const completionRate = examList.length > 0 ? Math.round((completedExams.length / examList.length) * 100) : 0;

  return (
    <div className="animate-fade-up">
      {/* Back Breadcrumb Anchor */}
      <div className="flex items-center justify-between pb-6">
        <button
          onClick={onBack}
          type="button"
          className="group inline-flex items-center gap-2 text-secondary hover:!text-primary transition-colors uppercase font-sans text-xs font-bold tracking-widest cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-1">
            arrow_back
          </span>
          <span>Back to My Classes</span>
        </button>
      </div>

      {/* Course Masthead & Header Profile */}
      <section
        className="relative bg-surface-container-lowest border-2 border-black p-8 mb-6"
        style={{ boxShadow: "6px 6px 0px #000000" }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start md:items-center gap-5">
            <div className="flex flex-col">
              <h1 className="font-serif text-3xl md:text-4xl text-on-surface font-semibold tracking-tight">
                {m.class_name}
              </h1>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-secondary font-sans tracking-wide">
                <span className="material-symbols-outlined text-[15px] text-primary">person</span>
                <span className="font-semibold uppercase text-on-surface">
                  PROF. {m.teacher_name.toUpperCase()}
                </span>
                <span className="text-outline-variant">•</span>
                <span className="font-bold text-[10px] uppercase tracking-wider bg-surface-container-low px-2 py-0.5 text-secondary border border-outline-variant">
                  ENROLLED
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0 border-t md:border-t-0 md:border-l border-outline-variant pt-4 md:pt-0 md:pl-6">
            <div className="flex flex-col items-start md:items-end">
              <span className="font-sans text-[10px] uppercase tracking-widest text-secondary font-bold">
                Class Cohort
              </span>
              <span className="font-serif text-2xl font-bold text-on-surface">Active Student</span>
            </div>
            <button
              onClick={handleSync}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-black bg-surface-container-lowest hover:!bg-black hover:!text-white transition-colors text-xs font-bold tracking-widest uppercase font-sans cursor-pointer"
              style={{ boxShadow: "3px 3px 0px #000" }}
            >
              <span className={`material-symbols-outlined text-[15px] ${syncing ? "animate-spin" : ""}`}>
                sync
              </span>
              <span>SYNC STATUS</span>
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Tabs Bar & Actions */}
      <div className="flex items-center justify-between mb-8 border-b border-outline-variant pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab("syllabus")}
            type="button"
            className={`px-5 py-2 font-sans text-xs uppercase tracking-widest font-bold transition-colors cursor-pointer flex items-center gap-2 ${
              subTab === "syllabus" ? "bg-black text-white" : "text-secondary hover:text-black"
            }`}
          >
            <span>Syllabus</span>
            {syllabusList.length > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold ${
                  subTab === "syllabus" ? "bg-primary text-white" : "bg-surface-container text-secondary"
                }`}
              >
                {syllabusList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubTab("exams")}
            type="button"
            className={`px-5 py-2 font-sans text-xs uppercase tracking-widest font-bold flex items-center gap-2.5 transition-colors cursor-pointer ${
              subTab === "exams" ? "bg-black text-white" : "text-secondary hover:text-black"
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-primary">assignment_turned_in</span>
            <span>Exams</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-bold ${
                subTab === "exams" ? "bg-primary text-white" : "bg-surface-container text-secondary"
              }`}
            >
              {examList.length}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={subTab === "exams" ? loadExams : loadSyllabus}
            type="button"
            className="text-xs uppercase tracking-widest font-sans font-semibold text-secondary hover:text-on-surface transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Primary Workspace Content: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Exams Timeline & Cards (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {subTab === "exams" && (
            <>
              {examsLoading ? (
                <div className="bg-surface-container-lowest border border-outline-variant p-12 text-center font-sans text-xs font-bold tracking-widest uppercase text-secondary">
                  LOADING COURSE EXAMINATIONS...
                </div>
              ) : examList.length === 0 ? (
                <div className="bg-surface-container-lowest border border-outline-variant p-12 text-center">
                  <span className="material-symbols-outlined text-[48px] text-secondary mb-3 block">quiz</span>
                  <h3 className="font-serif text-2xl text-on-surface mb-1">No Active Exams</h3>
                  <p className="font-sans text-sm text-secondary">
                    There are no scheduled examinations currently assigned for this class.
                  </p>
                </div>
              ) : (
                examList.map((exam) => {
                  const isSubmitted =
                    exam.attempt && (exam.attempt.status === "submitted" || exam.attempt.status === "evaluated");
                  const isInProgress = exam.attempt && exam.attempt.status === "in_progress";

                  const now = new Date();
                  const start = parseUtcDate(exam.start_time);
                  const end = parseUtcDate(exam.end_time);
                  const isUpcoming = Boolean(start && now < start && !isSubmitted && !isInProgress);
                  const isEnded = Boolean(end && now > end && !isSubmitted && !isInProgress);

                  const isResultPublished = Boolean(exam.attempt?.result_published_at);
                  const hasScore =
                    isResultPublished && exam.attempt?.total_marks !== undefined && exam.attempt?.total_marks !== null;
                  const rawScore = hasScore ? Number(exam.attempt!.total_marks) : 0;
                  const adjScore = Number(exam.attempt?.adjustment_marks || 0);
                  const scoreVal = hasScore ? Math.max(0, rawScore + adjScore) : null;
                  const scorePct =
                    hasScore && exam.total_marks > 0
                      ? Math.round((scoreVal! / exam.total_marks) * 100)
                      : null;

                  return (
                    <article
                      key={exam.id}
                      className="bg-surface-container-lowest border border-outline-variant p-8 relative"
                    >
                      {isSubmitted && <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>}

                      {/* Top Status Bar & Score Highlights */}
                      <div className="flex flex-wrap items-start justify-between gap-6 mb-6">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3 mb-1">
                            {isSubmitted ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black text-white font-sans text-[10px] uppercase font-bold tracking-widest">
                                <span className="w-1.5 h-1.5 bg-primary"></span>
                                SUBMITTED
                              </span>
                            ) : isInProgress ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-white font-sans text-[10px] uppercase font-bold tracking-widest">
                                <span className="w-1.5 h-1.5 bg-white animate-pulse"></span>
                                IN PROGRESS
                              </span>
                            ) : isUpcoming ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container text-secondary font-sans text-[10px] uppercase font-bold tracking-widest">
                                <span className="material-symbols-outlined text-[12px]">lock</span>
                                UPCOMING
                              </span>
                            ) : isEnded ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container text-secondary font-sans text-[10px] uppercase font-bold tracking-widest">
                                WINDOW CLOSED
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black text-white font-sans text-[10px] uppercase font-bold tracking-widest">
                                <span className="w-1.5 h-1.5 bg-primary"></span>
                                AVAILABLE
                              </span>
                            )}
                          </div>
                          <h2 className="font-serif text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
                            {exam.title}
                          </h2>
                        </div>

                        {/* Grade Badge / Numerical Result OR Weightage */}
                        {isSubmitted ? (
                          isResultPublished ? (
                            <div className="flex flex-col items-end bg-surface-container-low border border-outline-variant px-6 py-4">
                              <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold mb-1">
                                Official Score
                              </span>
                              <div className="flex items-baseline gap-2">
                                <span className="font-serif text-4xl text-primary font-bold">
                                  {scoreVal !== null ? scoreVal : "—"}
                                </span>
                                <span className="font-sans text-xl font-bold text-secondary">
                                  / {exam.total_marks}
                                </span>
                                {scorePct !== null && (
                                  <>
                                    <span className="ml-2 px-2 py-0.5 bg-black text-white font-sans text-[11px] font-bold tracking-widest">
                                      {scorePct}%
                                    </span>
                                    {(() => {
                                      const passPct = exam.passing_percentage ?? 40.0;
                                      const isPass = scorePct >= passPct;
                                      return (
                                        <span
                                          className={`ml-1 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                                            isPass ? "bg-[#005430] text-white" : "bg-primary text-white"
                                          }`}
                                        >
                                          {isPass ? "PASS" : "FAIL"}
                                        </span>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end bg-surface-container-low border border-outline-variant px-5 py-3">
                              <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold mb-1">
                                Evaluation Status
                              </span>
                              <span className="font-mono text-xs font-bold text-on-surface uppercase tracking-wider">
                                AWAITING INSTRUCTOR PUBLICATION
                              </span>
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-end bg-surface-container-low border border-outline-variant px-5 py-3">
                            <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold">
                              Weightage
                            </span>
                            <span className="font-sans text-base font-bold text-on-surface tracking-wider uppercase">
                              {exam.total_marks} Points
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Exam Parameters Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-surface-container-low border border-outline-variant mb-6 text-xs uppercase tracking-wider font-sans text-secondary">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-primary">military_tech</span>
                          <span>
                            Marks: <strong className="text-on-surface font-bold">{exam.total_marks} PTS</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
                          <span>
                            Duration:{" "}
                            <strong className="text-on-surface font-bold">{exam.duration_minutes} MIN</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-primary">speed</span>
                          <span>
                            Level:{" "}
                            <strong className="text-on-surface font-bold">
                              {(exam.difficulty || "MEDIUM").toUpperCase()}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-primary">
                            format_list_numbered
                          </span>
                          <span>
                            Mode: <strong className="text-on-surface font-bold">ONLINE CBT</strong>
                          </span>
                        </div>
                      </div>

                      {/* Schedule / Window & Submission Callout */}
                      <div className="bg-surface-container-low border-l-2 border-l-black border-y border-r border-outline-variant p-4 mb-6 flex flex-col gap-2 font-sans text-xs">
                        <div className="flex items-start sm:items-center justify-between flex-wrap gap-2 text-on-surface">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-primary">
                              calendar_month
                            </span>
                            <span className="tracking-wide">
                              Window:{" "}
                              <strong className="font-bold">
                                {formatScheduleWindow(exam.start_time, exam.end_time)}
                              </strong>
                            </span>
                          </div>
                          <span className="font-sans text-[10px] uppercase font-bold tracking-widest bg-outline-variant px-2 py-0.5 text-secondary">
                            {isSubmitted ? "Completed" : isEnded ? "Ended" : isUpcoming ? "Scheduled" : "Active"}
                          </span>
                        </div>
                        {isSubmitted && exam.attempt?.completed_at && (
                          <div className="flex items-center gap-2 text-secondary pt-1 border-t border-outline-variant/60">
                            <span className="material-symbols-outlined text-[15px] text-primary">task_alt</span>
                            <span className="tracking-wide">
                              Submitted on{" "}
                              <strong className="text-on-surface font-bold">
                                {formatSubmissionDate(exam.attempt.completed_at, exam.attempt.started_at)}
                              </strong>
                            </span>
                          </div>
                        )}
                        {isInProgress && exam.attempt?.deadline && (
                          <div className="flex items-center gap-2 text-secondary pt-1 border-t border-outline-variant/60">
                            <span className="material-symbols-outlined text-[15px] text-primary">alarm</span>
                            <span className="tracking-wide">
                              Active Deadline:{" "}
                              <strong className="text-on-surface font-bold">
                                {new Date(exam.attempt.deadline).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Primary Call to Action */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        {isSubmitted ? (
                          isResultPublished ? (
                            <a
                              href={`/student/exams/${exam.id}/result`}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 bg-black hover:bg-primary text-white font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                            >
                              <span>VIEW RESULT &amp; TEST DIAGNOSTICS</span>
                              <span className="font-bold text-sm">→</span>
                            </a>
                          ) : (
                            <button
                              disabled
                              type="button"
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-outline-variant bg-surface-container text-secondary font-sans text-xs font-bold tracking-widest uppercase cursor-not-allowed opacity-75"
                            >
                              <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                              <span>AWAITING INSTRUCTOR PUBLICATION</span>
                            </button>
                          )
                        ) : isInProgress ? (
                          <a
                            href={`/student/exams/${exam.id}/attempt`}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 bg-primary hover:bg-primary-dark text-white font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                          >
                            <span>RESUME ASSESSMENT</span>
                            <span className="font-bold text-sm">→</span>
                          </a>
                        ) : isUpcoming ? (
                          <button
                            disabled
                            type="button"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-outline-variant bg-surface-container text-secondary font-sans text-xs font-bold tracking-widest uppercase cursor-not-allowed opacity-70"
                          >
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            <span>START ASSESSMENT</span>
                          </button>
                        ) : isEnded ? (
                          <button
                            disabled
                            type="button"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 border border-outline-variant bg-surface-container text-secondary font-sans text-xs font-bold tracking-widest uppercase cursor-not-allowed opacity-70"
                          >
                            <span>EXAM WINDOW CLOSED</span>
                          </button>
                        ) : (
                          <a
                            href={`/student/exams/${exam.id}`}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 bg-black hover:bg-primary text-white font-sans text-xs font-bold tracking-widest uppercase transition-colors"
                          >
                            <span>START ASSESSMENT</span>
                            <span className="font-bold text-sm">→</span>
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </>
          )}

          {/* Sub-tab: Syllabus */}
          {subTab === "syllabus" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-outline-variant pb-3 mb-2">
                <div>
                  <h2 className="font-serif text-2xl font-normal text-on-surface">Curriculum Modules</h2>
                  <p className="font-sans text-xs text-secondary uppercase tracking-wider mt-0.5">
                    Automated test harness synthesized from accredited course lecture PDFs
                  </p>
                </div>
                <span className="font-sans text-[10px] font-bold text-primary uppercase tracking-[0.2em] border border-outline-variant bg-surface-container-low px-2.5 py-1">
                  {syllabusList.length} Modules Total
                </span>
              </div>

              {syllabusLoading ? (
                <div className="bg-surface-container-lowest border border-outline-variant p-12 text-center font-sans text-xs font-bold tracking-widest uppercase text-secondary">
                  LOADING COURSE SYLLABUS...
                </div>
              ) : syllabusList.length === 0 ? (
                <div className="bg-surface-container-lowest border border-outline-variant p-12 text-center">
                  <span className="material-symbols-outlined text-[48px] text-secondary mb-3 block">
                    folder_open
                  </span>
                  <h3 className="font-serif text-2xl text-on-surface mb-1">No Syllabus Uploaded</h3>
                  <p className="font-sans text-sm text-secondary">
                    Your instructor has not uploaded any syllabus documents for this class yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {syllabusList.map((doc) => {
                    const isPdf = doc.file_ref.toLowerCase().endsWith(".pdf");
                    return (
                      <article
                        key={doc.id}
                        className="bg-surface-container-lowest border border-outline-variant p-6 flex flex-col gap-5 hover:border-black transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 border border-black bg-black flex items-center justify-center text-white shrink-0">
                              <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
                            </div>
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <h3 className="font-serif text-lg font-medium text-on-surface">{doc.title}</h3>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-outline-variant bg-surface-container-low text-on-surface font-sans text-[10px] font-bold uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 bg-primary inline-block"></span>
                                  Processed
                                </span>
                              </div>
                              <p className="font-sans text-xs text-secondary tracking-wider uppercase">
                                {doc.file_ref.split("/").pop()} &bull; Uploaded{" "}
                                {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                            <button
                              onClick={() => viewSyllabus(doc.id)}
                              disabled={!isPdf}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-black bg-primary hover:bg-primary-dark text-white font-sans text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-30"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[15px]">visibility</span>
                              <span>View PDF</span>
                            </button>
                            <button
                              onClick={() => downloadSyllabus(doc.id, doc.title)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-black bg-surface-container-lowest hover:!bg-brand-crimson hover:!border-brand-crimson hover:!text-white text-on-surface font-sans text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[15px]">download</span>
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Rail: Performance Analytics & Proctoring Environment (4 cols) */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          {/* Performance Analytics Panel */}
          <div className="bg-surface-container-lowest border border-outline-variant p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">analytics</span>
                <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-on-surface">
                  Class Performance
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-surface-container-low px-2 py-0.5 border border-outline-variant">
                Live
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface-container-low border border-outline-variant flex flex-col">
                <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Assigned
                </span>
                <span className="font-serif text-2xl font-bold text-on-surface mt-1">{examList.length}</span>
              </div>
              <div className="p-3 bg-surface-container-low border border-outline-variant flex flex-col">
                <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold">
                  Completed
                </span>
                <span className="font-serif text-2xl font-bold text-primary mt-1">{completedExams.length}</span>
              </div>
            </div>
            <div className="p-3 bg-surface-container-low border border-outline-variant flex items-center justify-between">
              <span className="font-sans text-[10px] text-secondary uppercase tracking-widest font-bold">
                Completion Rate
              </span>
              <span className="font-sans text-sm font-bold text-on-surface">{completionRate}%</span>
            </div>
          </div>

          {/* Testing Rules & Environment Specifications */}
          <div className="bg-surface-container-lowest border border-outline-variant p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-outline-variant pb-3">
              <span className="material-symbols-outlined text-primary text-[18px]">shield</span>
              <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-on-surface">
                Proctoring Rules
              </h3>
            </div>
            <ul className="flex flex-col gap-3 font-sans text-xs text-secondary">
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5">videocam</span>
                <span>
                  <strong className="text-on-surface">Webcam Verification:</strong> Periodic video frame checks during active exam sessions.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5">fullscreen</span>
                <span>
                  <strong className="text-on-surface">Lockdown Mode:</strong> Enforces full-screen window and tracks defocus/tab-switching.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5">timer</span>
                <span>
                  <strong className="text-on-surface">Server Timer:</strong> Auto-submits responses once exam time limit expires.
                </span>
              </li>
            </ul>
          </div>

          {/* Quick Help Pod */}
          <div className="bg-surface-container-low border border-outline-variant p-6 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">help</span>
              <h3 className="font-sans text-xs font-bold uppercase tracking-widest text-on-surface">
                Assessment Support
              </h3>
            </div>
            <p className="font-sans text-xs text-secondary leading-relaxed">
              Encountering connectivity issues or technical difficulties? Progress is continuously auto-saved.
              Reconnect to resume without loss of responses.
            </p>
            <div className="pt-2">
              <button
                onClick={handleSync}
                type="button"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface hover:!text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                <span>Verify Network &amp; Sync State</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
