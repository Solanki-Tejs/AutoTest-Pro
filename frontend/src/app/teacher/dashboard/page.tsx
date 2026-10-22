"use client";

import { useEffect, useState, useCallback } from "react";
import { getStoredUser, getStoredToken, logout, UserResponse } from "@/app/lib/auth";
import {
  fetchMyClasses,
  fetchAllRequests,
  fetchClassStudents,
  createClass,
  approveRequest,
  rejectRequest,
  deleteClass,
  removeStudentFromClass,
  ClassItem,
  JoinRequest,
  EnrolledStudent,
} from "@/app/lib/classes";
import { uploadSyllabus, fetchSyllabusList, deleteSyllabus, getDownloadUrl, downloadSyllabus, viewSyllabus, SyllabusItem } from "@/app/lib/syllabus";
import { Exam, getTeacherExams, createExam, deleteExam } from "@/app/lib/exams";
import SyllabusUploadModal from "@/app/components/SyllabusUploadModal";
import Modal from "@/app/components/Modal";
import Badge from "@/app/components/Badge";
import UpdatePasswordCard from "@/app/components/UpdatePasswordCard";
import NotificationBell from "@/app/components/NotificationBell";
import { API_BASE_URL } from "@/app/lib/apiConfig";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Tab = "classes" | "requests" | "exams" | "results" | "profile";

export default function TeacherDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("classes");

  // Classes, requests & exams
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Class detail view
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // Create class modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Search & Profile Menu
  const [classSearch, setClassSearch] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Exam filters & search
  const [examFilter, setExamFilter] = useState<"all" | "published" | "draft">("all");
  const [examSearch, setExamSearch] = useState("");

  // Results filters & attempt stream
  const [resultsFilter, setResultsFilter] = useState<"all" | "published" | "unpublished">("published");
  const [resultsSearch, setResultsSearch] = useState("");
  const [resultsSort, setResultsSort] = useState<"newest" | "oldest" | "marks">("newest");
  const [allAttempts, setAllAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // Request action states
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [requestTab, setRequestTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [requestClassTab, setRequestClassTab] = useState<number | "all">("all");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("class-search") as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    const t = getStoredToken();
    if (!u || u.role !== "teacher") {
      router.push("/teacher/login");
      return;
    }
    setUser(u);
    setToken(t);
  }, [router]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTab = sessionStorage.getItem("teacherDashTab") as Tab;
    if (savedTab && ["classes", "requests", "exams", "results", "profile"].includes(savedTab)) {
      setTab(savedTab);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      sessionStorage.setItem("teacherDashTab", tab);
    }
  }, [tab, mounted]);



  const fetchTeacherAttempts = useCallback(async (authToken: string, currentExams: Exam[]) => {
    const published = currentExams.filter((e) => e.status === "published");
    if (published.length === 0) {
      setAllAttempts([]);
      return;
    }
    setAttemptsLoading(true);
    try {
      const results = await Promise.all(
        published.map(async (exam) => {
          try {
            const res = await fetch(`${API_BASE_URL}/teacher/exams/${exam.id}/attempts`, {
              headers: { Authorization: `Bearer ${authToken}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data)
              ? data.map((a: any) => ({
                ...a,
                exam_id: exam.id,
                exam_title: exam.title,
                class_name: exam.class_name
              }))
              : [];
          } catch {
            return [];
          }
        })
      );
      const flattened = results.flat();
      flattened.sort(
        (a, b) =>
          new Date(b.completed_at || b.started_at || 0).getTime() -
          new Date(a.completed_at || a.started_at || 0).getTime()
      );
      setAllAttempts(flattened);
    } catch {
      // silently ignore
    } finally {
      setAttemptsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [cls, reqs, exms] = await Promise.all([fetchMyClasses(token), fetchAllRequests(token), getTeacherExams(token)]);
      setClasses(cls);
      setRequests(reqs);
      setExams(exms);
      fetchTeacherAttempts(token, exms);

      const savedClassId = sessionStorage.getItem("teacherDashClassId");
      if (savedClassId) {
        const found = cls.find(c => c.id.toString() === savedClassId);
        if (found) {
          setSelectedClass(found);
          setStudentsLoading(true);
          try {
            const s = await fetchClassStudents(token, found.id);
            setStudents(s);
          } catch {
            setStudents([]);
          } finally {
            setStudentsLoading(false);
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, fetchTeacherAttempts]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  useEffect(() => {
    if (tab === "results" && token && exams.length > 0) {
      fetchTeacherAttempts(token, exams);
    }
  }, [tab, token, exams, fetchTeacherAttempts]);

  async function openClass(cls: ClassItem) {
    setSelectedClass(cls);
    sessionStorage.setItem("teacherDashClassId", cls.id.toString());
    if (!token) return;
    setStudentsLoading(true);
    try {
      const s = await fetchClassStudents(token, cls.id);
      setStudents(s);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  function closeClass() {
    setSelectedClass(null);
    sessionStorage.removeItem("teacherDashClassId");
    setStudents([]);
  }

  const handleCreateExam = async () => {
    if (!token) return;
    if (classes.length === 0) {
      toast.warning("Please create a class first before creating an exam.");
      setTab("classes");
      return;
    }

    setLoading(true);
    try {
      const draftExam = await createExam(token, {
        title: "Untitled Exam",
        class_id: classes[0].id,
        total_marks: 50,
        duration_minutes: 60,
        difficulty: "medium",
        selected_pdf_ids: []
      });
      toast.success("Exam draft created");
      router.push(`/teacher/exams/${draftExam.id}/general`);
    } catch (e: any) {
      toast.error("Failed to create exam draft: " + e.message);
      setLoading(false);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!token || !confirm("Are you sure you want to delete this exam?")) return;
    try {
      await deleteExam(token, examId);
      setExams(prev => prev.filter(e => e.id !== examId));
      toast.success("Exam deleted");
    } catch (e: any) {
      toast.error("Failed to delete exam: " + e.message);
    }
  };

  async function handleRemoveStudent(studentId: number) {
    if (!token || !selectedClass) return;
    if (!confirm("Remove this student from the class?")) return;
    setRemovingId(studentId);
    try {
      await removeStudentFromClass(token, selectedClass.id, studentId);
      setStudents(prev => prev.filter(s => s.student_id !== studentId));
      // update student_count in class list
      setClasses(prev =>
        prev.map(c =>
          c.id === selectedClass.id ? { ...c, student_count: Math.max(0, c.student_count - 1) } : c
        )
      );
      setSelectedClass(prev => prev ? { ...prev, student_count: Math.max(0, prev.student_count - 1) } : prev);
    } catch {
      // silently fail
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      await createClass(token, newName.trim(), newDesc.trim());
      setNewName(""); setNewDesc("");
      setShowCreate(false);
      loadData();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove(requestId: number) {
    if (!token) return;
    setActionLoading(prev => ({ ...prev, [requestId]: "approving" }));
    try {
      await approveRequest(token, requestId);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: "approved" } : r));
      loadData();
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[requestId]; return n; });
    }
  }

  async function handleReject(requestId: number) {
    if (!token) return;
    setActionLoading(prev => ({ ...prev, [requestId]: "rejecting" }));
    try {
      await rejectRequest(token, requestId);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: "rejected" } : r));
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[requestId]; return n; });
    }
  }

  async function handleDeleteClass(classId: number) {
    if (!token || !confirm("Delete this class? All enrollments will be removed.")) return;
    try {
      await deleteClass(token, classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      if (selectedClass?.id === classId) closeClass();
    } catch { /* silently fail */ }
  }
  function handleLogout() {
    sessionStorage.removeItem("teacherDashTab");
    sessionStorage.removeItem("teacherDashClassId");
    logout();
    router.push("/teacher/login");
  }

  if (!user) return null;

  const pendingRequests = requests.filter(r => r.status === "pending");
  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
  const filteredClasses = classes.filter((cls) => {
    if (!classSearch.trim()) return true;
    const q = classSearch.toLowerCase().trim();
    return (
      cls.name.toLowerCase().includes(q) ||
      cls.join_code.toLowerCase().includes(q) ||
      (cls.description && cls.description.toLowerCase().includes(q))
    );
  });

  const formatExamDate = (dateStr?: string) => {
    if (!dateStr) return "UNSCHEDULED";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "UNSCHEDULED";
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
    } catch {
      return "UNSCHEDULED";
    }
  };

  const formatExamTime = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  const handleExportAuditCSV = () => {
    if (allAttempts.length === 0) {
      toast.info("No student attempts recorded to export.");
      return;
    }
    const headers = [
      "Student ID",
      "Student Email",
      "Target Exam",
      "Status",
      "Evaluated Marks",
      "Max Marks",
      "Adjusted Marks",
      "Final Marks",
      "Percentage",
      "Submitted At"
    ];
    const rows = allAttempts.map((a) => {
      const total = (a.total_marks ?? 0) + (a.adjustment_marks ?? 0);
      const max = a.max_marks || 1;
      const pct = Math.round((total / max) * 100);
      return [
        `"STU-${a.student_id}"`,
        `"${a.student_email || ""}"`,
        `"${a.exam_title || ""}"`,
        `"${a.status || ""}"`,
        a.total_marks ?? 0,
        a.max_marks ?? 0,
        a.adjustment_marks ?? 0,
        total,
        `${pct}%`,
        `"${a.completed_at || a.started_at || ""}"`
      ];
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `autotest_audit_stream_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audit stream CSV exported successfully");
  };

  const publishedExamsCount = exams.filter((e) => e.status === "published").length;
  const unpublishedExamsCount = exams.filter((e) => e.status !== "published").length;

  const filteredResultsExams = exams
    .filter((exam) => {
      if (resultsFilter === "published" && exam.status !== "published") return false;
      if (resultsFilter === "unpublished" && exam.status === "published") return false;
      if (!resultsSearch.trim()) return true;
      const q = resultsSearch.toLowerCase().trim();
      return (
        exam.title.toLowerCase().includes(q) ||
        (exam.class_name && exam.class_name.toLowerCase().includes(q)) ||
        exam.id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (resultsSort === "newest") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      } else if (resultsSort === "oldest") {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      } else {
        return b.total_marks - a.total_marks;
      }
    });

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
            <span className="font-sans text-[10px] tracking-widest text-[#0047ff] font-semibold uppercase leading-tight">
              Educator Portal
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <NotificationBell role="teacher" />

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
                <span className="font-sans text-[9px] font-bold tracking-widest text-[#0047ff] uppercase leading-tight">
                  TEACHER
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
                      <span className="inline-block px-1.5 py-0.5 bg-[#0047ff] text-white text-[9px] font-bold tracking-widest uppercase mt-1 self-start">
                        TEACHER
                      </span>
                    </div>
                  </div>

                  <div className="py-3 flex flex-col gap-2 border-b border-outline-variant text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Teacher ID</span>
                      <span className="font-mono text-[11px] font-bold text-on-surface">#{user.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Active Cohorts</span>
                      <span className="font-sans text-xs font-bold text-on-surface">{classes.length} Classes</span>
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
                      className="w-full py-2 px-3 text-left font-sans text-xs font-bold uppercase tracking-wider text-secondary hover:!text-[#0047ff] hover:bg-surface-container transition-colors flex items-center gap-2 cursor-pointer"
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
          <nav className="flex flex-col gap-1.5">
            {(["classes", "requests", "exams", "results", "profile"] as Tab[]).map((t) => {
              const active = tab === t && !selectedClass;
              const labels: Record<Tab, string> = {
                classes: "My Classes",
                requests: "Join Requests",
                exams: "Exams",
                results: "Results",
                profile: "Profile",
              };
              const icons: Record<Tab, string> = {
                classes: "grid_view",
                requests: "group_add",
                exams: "description",
                results: "bar_chart",
                profile: "person",
              };

              return (
                <button
                  key={t}
                  id={`tab-${t}`}
                  onClick={() => {
                    setTab(t);
                    if (t !== "classes") closeClass();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 tracking-widest text-xs uppercase transition-colors cursor-pointer text-left ${active
                    ? "bg-black text-white font-bold"
                    : "bg-surface-container-lowest text-secondary hover:text-black hover:bg-surface-container font-semibold"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined text-[18px] ${active ? "text-[#0047ff]" : "text-secondary"
                        }`}
                    >
                      {icons[t]}
                    </span>
                    <span>{labels[t]}</span>
                  </div>
                  {t === "requests" && pendingRequests.length > 0 && (
                    <span className="px-2 py-0.5 bg-[#0047ff] text-white text-[10px] font-bold font-sans">
                      {pendingRequests.length}
                    </span>
                  )}
                  {t === "classes" && classes.length > 0 && (
                    <span className="px-2 py-0.5 bg-[#0047ff] text-white text-[10px] font-bold font-sans">
                      {classes.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sign Out at Bottom */}
        <div className="pt-4 border-t border-outline-variant">
          <button
            id="btn-logout"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-3 tracking-widest text-xs uppercase font-semibold text-secondary hover:!text-[#0047ff] hover:bg-surface-container transition-colors cursor-pointer text-left"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Canvas ── */}
      <main className="pl-64 pt-16 min-h-screen bg-surface">
        <div className="p-6 md:p-10 min-h-[calc(100vh-4rem)]">
          {/* ── Classes Tab ── */}
          {tab === "classes" && !selectedClass && (
            <div className="animate-fade-up space-y-8">
              {/* Editorial Header Block */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
                <div className="space-y-1.5 max-w-3xl">
                  <h1 className="font-serif text-3xl md:text-5xl text-on-surface tracking-tight font-normal">
                    My Classes
                  </h1>
                  <p className="font-sans text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                    {classes.length} ACTIVE COHORT{classes.length !== 1 ? "S" : ""} · {pendingRequests.length} PENDING ENROLLMENT
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    id="btn-create-class"
                    onClick={() => setShowCreate(true)}
                    className="h-12 px-6 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#0047ff] hover:text-white transition-colors shadow-sm cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>CREATE NEW CLASS</span>
                  </button>
                </div>
              </div>

              {/* Editorial Metrics Trio (Brutalist Architecture) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Metric 01 */}
                <div className="bg-surface-container-lowest p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group border border-outline-variant">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0047ff]"></div>
                  <div className="flex items-center justify-end pl-1">
                    <span className="material-symbols-outlined text-outline-variant text-[20px]">domain</span>
                  </div>
                  <div className="my-4 pl-1 flex items-baseline gap-2">
                    <span className="font-serif text-3xl text-on-surface font-normal leading-none tracking-tight">
                      {String(classes.length).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-xs uppercase tracking-wider text-[#0047ff] font-bold">
                      CLASSES
                    </span>
                  </div>
                  <div className="pl-4 pr-6 pt-2 bg-surface-container-low -mx-6 -mb-6 p-4 flex items-center justify-between">
                    <span className="font-sans text-xs text-on-surface uppercase tracking-wider pl-2">ACTIVE REGISTERED</span>
                  </div>
                </div>

                {/* Metric 02 */}
                <div className="bg-surface-container-lowest p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group border border-outline-variant">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-black"></div>
                  <div className="flex items-center justify-end pl-1">
                    <span className="material-symbols-outlined text-outline-variant text-[20px]">group</span>
                  </div>
                  <div className="my-4 pl-1 flex items-baseline gap-2">
                    <span className="font-serif text-3xl text-on-surface font-normal leading-none tracking-tight">
                      {String(totalStudents).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                      STUDENTS
                    </span>
                  </div>
                  <div className="pl-4 pr-6 pt-2 bg-surface-container-low -mx-6 -mb-6 p-4 flex items-center justify-between">
                    <span className="font-sans text-xs text-on-surface uppercase tracking-wider pl-2">
                      {classes.length > 0 ? (totalStudents / classes.length).toFixed(1) : 0} PER COHORT
                    </span>
                    <span className="font-sans text-xs text-on-surface-variant font-bold uppercase">
                      {pendingRequests.length} QUEUED
                    </span>
                  </div>
                </div>

                {/* Metric 03 */}
                <div className="bg-surface-container-lowest p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group border border-outline-variant">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0047ff]"></div>
                  <div className="flex items-center justify-end pl-1">
                    <span className="material-symbols-outlined text-outline-variant text-[20px]">description</span>
                  </div>
                  <div className="my-4 pl-1 flex items-baseline gap-2">
                    <span className="font-serif text-3xl text-on-surface font-normal leading-none tracking-tight">
                      {String(exams.length).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-xs uppercase tracking-wider text-[#0047ff] font-bold">
                      EXAMS
                    </span>
                  </div>
                  <div className="pl-4 pr-6 pt-2 bg-surface-container-low -mx-6 -mb-6 p-4 flex items-center justify-end">
                    <span className="font-sans text-xs text-[#006f41] font-bold uppercase">
                      {exams.filter((e) => e.status === "published").length} ACTIVE
                    </span>
                  </div>
                </div>
              </div>

              {/* Filtering & Control Toolbar */}
              <div className="bg-surface-container-lowest p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border border-outline-variant">
                <div className="flex items-center gap-3 flex-1 max-w-lg bg-surface-container-low px-4 py-2.5 border border-outline-variant">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
                  <input
                    id="class-search"
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    placeholder="SEARCH CLASSES, CODES, OR BLUEPRINTS..."
                    className="w-full bg-transparent text-on-surface font-sans text-xs uppercase tracking-wider focus:outline-none placeholder:text-secondary"
                    type="text"
                  />
                  {classSearch && (
                    <button
                      onClick={() => setClassSearch("")}
                      className="text-secondary hover:text-black text-xs font-bold uppercase cursor-pointer"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono uppercase text-secondary">
                  <span>SHOWING {filteredClasses.length} OF {classes.length} COHORTS</span>
                </div>
              </div>

              {/* Error alert */}
              {error && (
                <div className="p-4 bg-error-container text-error border-2 border-error flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                  <span>{error}</span>
                  <button onClick={loadData} className="underline cursor-pointer">Retry</button>
                </div>
              )}

              {/* Class Cohort Cards Grid */}
              {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-64 bg-surface-container-lowest border-2 border-outline-variant animate-pulse" />
                  ))}
                </div>
              ) : filteredClasses.length === 0 ? (
                <div className="p-12 bg-surface-container-lowest border-2 border-black text-center space-y-4">
                  <div className="font-serif text-3xl font-bold text-on-surface">
                    {classSearch ? "NO MATCHING COHORTS FOUND" : "0 COHORTS INITIALIZED"}
                  </div>
                  <p className="font-sans text-xs text-secondary uppercase tracking-widest max-w-md mx-auto">
                    {classSearch
                      ? `No class matched "${classSearch}". Check query or clear filter.`
                      : "Register your first class cohort to issue student access keys and deploy evaluation blueprints."}
                  </p>
                  <button
                    onClick={() => {
                      if (classSearch) setClassSearch("");
                      else setShowCreate(true);
                    }}
                    className="h-11 px-6 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest hover:bg-[#0047ff] transition-colors cursor-pointer"
                  >
                    {classSearch ? "CLEAR SEARCH" : "+ INITIALIZE COHORT"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {filteredClasses.map((cls) => {
                    const classPending = requests.filter((r) => r.class_id === cls.id && r.status === "pending").length;
                    const classExams = exams.filter((e) => e.class_id === cls.id).length;
                    return (
                      <div
                        key={cls.id}
                        className="bg-surface-container-lowest shadow-sm flex flex-col justify-between group transition-none border-2 border-[#1b1c1c] shadow-[5px_5px_0px_#1b1c1c]"
                      >
                        <div>
                          {/* Hero Blueprint Graphic & Identity Area */}
                          <div className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <h2 className="font-serif text-2xl md:text-3xl text-on-surface font-normal tracking-tight line-clamp-1">
                                {cls.name}
                              </h2>
                              {cls.description && (
                                <p className="text-xs text-on-surface-variant font-sans line-clamp-2 mt-1">
                                  {cls.description}
                                </p>
                              )}
                            </div>
                            {/* Abstract Schematic SVG */}
                            <div className="hidden sm:flex w-14 h-14 border border-outline-variant bg-surface-container-low items-center justify-center text-secondary shrink-0">
                              <span className="material-symbols-outlined text-[28px] text-secondary/60">schema</span>
                            </div>
                          </div>

                          {/* Quick Access Class Code Terminal */}
                          <div className="mx-6 mb-4 p-4 bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-outline-variant">
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-[#0047ff] text-[20px]">key</span>
                              <div className="flex flex-col">
                                <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                                  STUDENT ACCESS CODE
                                </span>
                                <span className="font-mono text-base font-bold tracking-widest text-on-surface select-all">
                                  {cls.join_code}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(cls.join_code);
                                  toast.success(`Class code copied: ${cls.join_code}`);
                                }}
                                className="px-3 py-1.5 bg-surface-container-highest text-on-surface font-sans text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                <span>COPY</span>
                              </button>
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/join/${cls.join_code}`;
                                  navigator.clipboard.writeText(url);
                                  toast.success("Direct enrollment link copied to clipboard.");
                                }}
                                className="px-3 py-1.5 bg-surface-container-highest text-on-surface font-sans text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                <span>LINK</span>
                              </button>
                            </div>
                          </div>

                          {/* Academic Performance Pulse / Stats Strip */}
                          <div className="mx-6 py-2 grid grid-cols-3 gap-2 bg-surface-container-high/50 p-3 mb-6 border border-outline-variant">
                            <div className="flex flex-col pl-1 border-r border-outline-variant/60">
                              <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">ROSTER</span>
                              <span className="font-serif text-lg font-bold text-on-surface leading-tight">
                                {cls.student_count || 0}{" "}
                                <span className="font-sans text-[10px] text-on-surface-variant font-normal">
                                  {cls.student_count === 1 ? "STUDENT" : "STUDENTS"}
                                </span>
                              </span>
                            </div>
                            <div className="flex flex-col pl-1 border-r border-outline-variant/60">
                              <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">PENDING</span>
                              <span className="font-serif text-lg font-bold text-on-surface leading-tight">
                                {classPending}{" "}
                                <span className="font-sans text-[10px] text-on-surface-variant font-normal">
                                  {classPending === 1 ? "REQUEST" : "REQUESTS"}
                                </span>
                              </span>
                            </div>
                            <div className="flex flex-col pl-1">
                              <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">ASSESSMENTS</span>
                              <span className="font-serif text-lg font-bold text-on-surface leading-tight">
                                {classExams}{" "}
                                <span className="font-sans text-[10px] text-on-surface-variant font-normal">
                                  ACTIVE
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Matrix Footer */}
                        <div className="p-4 md:p-6 bg-surface-container-low flex items-center justify-between gap-4 border-t border-outline-variant">
                          <button
                            onClick={() => handleDeleteClass(cls.id)}
                            className="p-2 text-secondary hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer border border-transparent hover:border-error flex items-center gap-1.5"
                            title="Delete Cohort"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            <span className="font-sans text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Delete</span>
                          </button>

                          <button
                            onClick={() => openClass(cls)}
                            className="h-11 px-6 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#0047ff] hover:text-white transition-colors cursor-pointer shadow-sm"
                            type="button"
                          >
                            <span>MANAGE CLASS</span>
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Class Detail View ── */}
          {tab === "classes" && selectedClass && (
            <ClassDetailView
              key={selectedClass.id}
              cls={selectedClass}
              students={students}
              studentsLoading={studentsLoading}
              pendingRequests={requests.filter(r => r.class_id === selectedClass.id && r.status === "pending")}
              removingId={removingId}
              actionLoading={actionLoading}
              onBack={closeClass}
              onRemoveStudent={handleRemoveStudent}
              onApprove={handleApprove}
              onReject={handleReject}
              onDeleteClass={() => handleDeleteClass(selectedClass.id)}
              onNavigateToExams={() => {
                closeClass();
                setTab("exams");
              }}
              onNavigateToResults={() => {
                closeClass();
                setTab("results");
              }}
            />
          )}

          {/* ── Requests Tab (Stitch Brutalist Design) ── */}
          {tab === "requests" && (
            <div className="animate-fade-up space-y-8">
              {/* Top Editorial Header & Operational Overview */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/60 pb-6">
                <div className="flex flex-col">
                  <h1 className="font-serif text-3xl md:text-5xl text-on-surface tracking-tight font-normal">
                    Join Requests
                  </h1>
                  <p className="font-sans text-xs text-on-surface-variant max-w-2xl mt-1 uppercase tracking-wider font-semibold">
                    Review and verify candidate student enrollment requests across your active course cohorts and academic directories.
                  </p>
                </div>

                {/* Quick Metrics Ribbon */}
                <div className="flex items-stretch bg-surface-container-low border border-outline-variant divide-x divide-outline-variant shrink-0">
                  <div className="px-5 py-3 flex flex-col">
                    <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                      PENDING AUDIT
                    </span>
                    <span className="font-serif text-2xl text-[#0047ff] font-bold mt-0.5">
                      {String(pendingRequests.length).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="px-5 py-3 flex flex-col">
                    <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                      ACTIVE ENROLLED
                    </span>
                    <span className="font-serif text-2xl text-on-surface font-bold mt-0.5">
                      {String(totalStudents).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Filter & Segment Row */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                {/* Status Tabs */}
                <div className="flex items-center gap-6 border-b border-outline-variant w-full lg:w-auto">
                  {(["pending", "approved", "rejected"] as const).map((t) => {
                    const active = requestTab === t;
                    const count = requests.filter((r) => r.status === t).length;
                    return (
                      <button
                        key={t}
                        onClick={() => setRequestTab(t)}
                        className={`group relative pb-3 px-1 flex items-center gap-2 font-sans text-xs uppercase tracking-wider font-bold cursor-pointer transition-colors ${active ? "text-[#0047ff]" : "text-on-surface-variant hover:text-on-surface"
                          }`}
                      >
                        <span>{t.toUpperCase()}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold font-mono ${active
                            ? "bg-[#dde1ff] text-[#001257]"
                            : "bg-surface-container-highest text-on-surface-variant"
                            }`}
                        >
                          {String(count).padStart(2, "0")}
                        </span>
                        {active && (
                          <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0047ff]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Architectural Content Layout: 8 cols + 4 cols */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT COLUMN: Primary Queue & Historical Verification Stream (8 Cols) */}
                <div className="lg:col-span-8 flex flex-col gap-8">
                  {(() => {
                    const currentFiltered = requests.filter(
                      (r) =>
                        r.status === requestTab &&
                        (requestClassTab === "all" ||
                          String(r.class_id) === String(requestClassTab) ||
                          (r.class_name &&
                            classes.find((c) => String(c.id) === String(requestClassTab))?.name?.toLowerCase() ===
                            r.class_name.toLowerCase()))
                    );
                    const approvedRequests = requests.filter(
                      (r) =>
                        r.status === "approved" &&
                        (requestClassTab === "all" ||
                          String(r.class_id) === String(requestClassTab) ||
                          (r.class_name &&
                            classes.find((c) => String(c.id) === String(requestClassTab))?.name?.toLowerCase() ===
                            r.class_name.toLowerCase()))
                    );

                    return (
                      <>
                        {/* If no items for current tab */}
                        {currentFiltered.length === 0 ? (
                          <div className="bg-surface-container-lowest border border-outline-variant relative overflow-hidden shadow-sm">
                            <div className="h-1 w-full bg-[#0047ff]"></div>
                            <div className="p-8 md:p-12 flex flex-col items-center justify-center text-center">
                              <div className="relative w-16 h-16 bg-surface-container flex items-center justify-center border-2 border-[#0047ff] mb-4">
                                <span className="material-symbols-outlined text-[#0047ff] text-[34px]">
                                  {requestTab === "pending" ? "check_circle" : requestTab === "approved" ? "verified" : "cancel"}
                                </span>
                              </div>
                              <div className="max-w-md flex flex-col items-center">
                                <h2 className="font-serif text-2xl md:text-3xl text-on-surface mt-1 mb-2 font-normal">
                                  {requestTab === "pending"
                                    ? "No Pending Requests"
                                    : requestTab === "approved"
                                      ? "No Approved Requests"
                                      : "No Rejected Requests"}
                                </h2>
                                <p className="font-sans text-xs text-on-surface-variant leading-relaxed">
                                  {requestTab === "pending"
                                    ? "All candidate admission requests have been reviewed. New student enrollment requests dispatched via cohort access tokens will appear in this real-time ledger."
                                    : requestTab === "approved"
                                      ? "Approved candidate enrollments under this cohort filter will be documented here."
                                      : "No candidate student requests have been rejected under this filter."}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : requestTab === "pending" ? (
                          /* Pending Queue Cards */
                          <div className="flex flex-col gap-4">
                            {classes
                              .filter((c) => requestClassTab === "all" || String(c.id) === String(requestClassTab))
                              .map((cls) => {
                                const classPending = currentFiltered.filter(
                                  (r) =>
                                    String(r.class_id) === String(cls.id) ||
                                    (r.class_name && r.class_name.toLowerCase() === cls.name.toLowerCase())
                                );
                                if (classPending.length === 0) return null;
                                return (
                                  <div key={cls.id} className="bg-surface-container-lowest border-2 border-black p-5 shadow-[4px_4px_0_0_#000] space-y-4">
                                    <div className="flex items-center justify-between border-b border-outline-variant pb-3">
                                      <div className="flex items-center gap-2.5">
                                        <span className="px-2 py-0.5 bg-[#0047ff] text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                                          {cls.join_code}
                                        </span>
                                        <h3 className="font-serif text-lg font-bold text-on-surface">
                                          {cls.name}
                                        </h3>
                                      </div>
                                      <span className="font-mono text-xs font-bold text-[#0047ff] bg-[#dde1ff] px-2 py-0.5">
                                        {classPending.length} PENDING
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                      {classPending.map((req) => (
                                        <RequestRow
                                          key={req.id}
                                          req={req}
                                          loadingState={actionLoading[req.id]}
                                          onApprove={() => handleApprove(req.id)}
                                          onReject={() => handleReject(req.id)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          /* Approved or Rejected Table */
                          <div className="flex flex-col gap-4">
                            {classes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => setRequestClassTab("all")}
                                  className={`px-3 py-1.5 font-sans text-[11px] uppercase tracking-widest font-bold transition-colors cursor-pointer border ${requestClassTab === "all"
                                    ? "bg-[#0047ff] text-white border-[#0047ff]"
                                    : "bg-surface-container hover:bg-surface-container-high border-outline-variant text-on-surface"
                                    }`}
                                >
                                  ALL COHORTS ({requests.filter((r) => r.status === requestTab).length})
                                </button>
                                {classes.map((cls) => {
                                  const count = requests.filter(
                                    (r) =>
                                      r.status === requestTab &&
                                      (String(r.class_id) === String(cls.id) ||
                                        (r.class_name && r.class_name.toLowerCase() === cls.name.toLowerCase()))
                                  ).length;
                                  return (
                                    <button
                                      key={cls.id}
                                      onClick={() => setRequestClassTab(cls.id)}
                                      className={`px-3 py-1.5 font-sans text-[11px] uppercase tracking-widest font-bold transition-colors cursor-pointer border ${requestClassTab === cls.id
                                        ? "bg-[#0047ff] text-white border-[#0047ff]"
                                        : "bg-surface-container hover:bg-surface-container-high border-outline-variant text-on-surface"
                                        }`}
                                    >
                                      {cls.name} ({count})
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="bg-surface-container-lowest border border-outline-variant flex flex-col shadow-sm">
                              <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-[#0047ff] text-[20px]">
                                    {requestTab === "approved" ? "verified" : "cancel"}
                                  </span>
                                  <span className="font-sans text-xs uppercase tracking-wider font-bold text-on-surface">
                                    {requestTab === "approved" ? "APPROVED ENROLLMENTS LEDGER" : "REJECTED CANDIDATES LEDGER"}
                                  </span>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-outline-variant bg-surface-container font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                                      <th className="py-3 px-4">STUDENT IDENTIFIER</th>
                                      <th className="py-3 px-4">COHORT</th>
                                      <th className="py-3 px-4 text-right">VERIFICATION STATUS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-outline-variant font-sans text-xs">
                                    {currentFiltered.map((req) => {
                                      const cls = classes.find((c) => c.id === req.class_id);
                                      return (
                                        <tr key={req.id} className="hover:bg-surface-container-low transition-colors">
                                          <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 bg-surface-container-highest text-on-surface flex items-center justify-center font-mono text-xs font-bold border border-outline-variant shrink-0">
                                                {req.student_name.slice(0, 2).toUpperCase()}
                                              </div>
                                              <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-on-surface uppercase tracking-wider">
                                                  {req.student_name}
                                                </span>
                                                <span className="font-mono text-[11px] text-on-surface-variant truncate">
                                                  {req.student_email}
                                                </span>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-3 px-4">
                                            <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface font-mono text-[10px] font-bold uppercase tracking-wider border border-outline-variant">
                                              {cls ? cls.name : `COHORT #${req.class_id}`}
                                            </span>
                                          </td>
                                          <td className="py-3 px-4 text-right">
                                            {req.status === "approved" ? (
                                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#5cde97] bg-[#7afbb1]/20 text-[#005430] font-mono text-[10px] font-bold uppercase tracking-wider">
                                                <span className="w-1.5 h-1.5 bg-[#006f41]"></span>
                                                ACTIVE / VERIFIED
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-red-300 bg-red-100 text-error font-mono text-[10px] font-bold uppercase tracking-wider">
                                                <span className="w-1.5 h-1.5 bg-error"></span>
                                                REJECTED
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <div className="p-3 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                                <span>SHOWING {currentFiltered.length} AUDITED CANDIDATES</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* In Pending tab, display Recently Approved Ledger with Cohort Filter Buttons above it */}
                        {requestTab === "pending" && (
                          <div className="flex flex-col gap-4 mt-2">
                            {classes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => setRequestClassTab("all")}
                                  className={`px-3 py-1.5 font-sans text-[11px] uppercase tracking-widest font-bold transition-colors cursor-pointer border ${requestClassTab === "all"
                                    ? "bg-[#0047ff] text-white border-[#0047ff]"
                                    : "bg-surface-container hover:bg-surface-container-high border-outline-variant text-on-surface"
                                    }`}
                                >
                                  ALL COHORTS ({approvedRequests.length})
                                </button>
                                {classes.map((cls) => {
                                  const count = requests.filter(
                                    (r) =>
                                      r.status === "approved" &&
                                      (String(r.class_id) === String(cls.id) ||
                                        (r.class_name && r.class_name.toLowerCase() === cls.name.toLowerCase()))
                                  ).length;
                                  return (
                                    <button
                                      key={cls.id}
                                      onClick={() => setRequestClassTab(cls.id)}
                                      className={`px-3 py-1.5 font-sans text-[11px] uppercase tracking-widest font-bold transition-colors cursor-pointer border ${requestClassTab === cls.id
                                        ? "bg-[#0047ff] text-white border-[#0047ff]"
                                        : "bg-surface-container hover:bg-surface-container-high border-outline-variant text-on-surface"
                                        }`}
                                    >
                                      {cls.name} ({count})
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {approvedRequests.length > 0 ? (
                              <div className="bg-surface-container-lowest border border-outline-variant flex flex-col shadow-sm">
                                <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
                                  <div className="flex items-center gap-2">
                                    <span className="font-sans text-xs uppercase tracking-wider font-bold text-on-surface">
                                      RECENTLY APPROVED ENROLLMENTS
                                    </span>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-outline-variant bg-surface-container font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                                        <th className="py-3 px-4">STUDENT IDENTIFIER</th>
                                        <th className="py-3 px-4">COHORT</th>
                                        <th className="py-3 px-4 text-right">VERIFICATION STATUS</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-outline-variant font-sans text-xs">
                                      {approvedRequests.slice(0, 5).map((req) => {
                                        const cls = classes.find((c) => c.id === req.class_id);
                                        return (
                                          <tr key={req.id} className="hover:bg-surface-container-low transition-colors">
                                            <td className="py-3 px-4">
                                              <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-surface-container-highest text-on-surface flex items-center justify-center font-mono text-xs font-bold border border-outline-variant shrink-0">
                                                  {req.student_name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                  <span className="font-bold text-on-surface uppercase tracking-wider">
                                                    {req.student_name}
                                                  </span>
                                                  <span className="font-mono text-[11px] text-on-surface-variant truncate">
                                                    {req.student_email}
                                                  </span>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="py-3 px-4">
                                              <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface font-mono text-[10px] font-bold uppercase tracking-wider border border-outline-variant">
                                                {cls ? cls.name : `COHORT #${req.class_id}`}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#5cde97] bg-[#7afbb1]/20 text-[#005430] font-mono text-[10px] font-bold uppercase tracking-wider">
                                                <span className="w-1.5 h-1.5 bg-[#006f41]"></span>
                                                ACTIVE / VERIFIED
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="p-3 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                                  <span>SHOWING {Math.min(5, approvedRequests.length)} OF {approvedRequests.length} TOTAL AUDITED</span>
                                  {approvedRequests.length > 5 && (
                                    <button
                                      onClick={() => setRequestTab("approved")}
                                      className="font-sans text-xs uppercase tracking-wider text-[#0047ff] hover:underline font-bold cursor-pointer"
                                    >
                                      VIEW ALL APPROVED →
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-surface-container-lowest border border-outline-variant flex flex-col shadow-sm">
                                <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
                                  <div className="flex items-center gap-2">
                                    <span className="font-sans text-xs uppercase tracking-wider font-bold text-on-surface">
                                      RECENTLY APPROVED ENROLLMENTS
                                    </span>
                                  </div>
                                </div>
                                <div className="p-8 text-center text-xs font-sans text-on-surface-variant uppercase tracking-wider">
                                  No approved candidate enrollments for this cohort yet.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* RIGHT COLUMN: Codes Directory & Verification Policies (4 Cols) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  {/* Class Code Directory Card */}
                  <div className="bg-surface-container-lowest border border-outline-variant flex flex-col shadow-sm">
                    <div className="p-4 border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#0047ff] text-[20px]">key</span>
                        <span className="font-sans text-xs uppercase tracking-wider font-bold text-on-surface">
                          CLASS CODE DIRECTORY
                        </span>
                      </div>
                    </div>

                    <div className="p-4 flex flex-col gap-4">
                      <p className="font-sans text-xs text-on-surface-variant leading-relaxed">
                        Distribute these cryptographic class tokens to authorized students. Candidates enter this token during portal onboarding.
                      </p>

                      {classes.length === 0 ? (
                        <div className="p-4 bg-surface-container-low border border-outline-variant text-center font-sans text-xs text-secondary">
                          No active classes found.
                        </div>
                      ) : (
                        classes.map((cls) => (
                          <div key={cls.id} className="bg-surface border border-outline-variant p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="font-sans text-xs uppercase tracking-wider font-bold text-on-surface truncate pr-2">
                                {cls.name}
                              </span>
                              <span className="font-mono text-[10px] text-on-surface-variant shrink-0 font-bold">
                                {cls.student_count || 0} ENROLLED
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-surface-container-low px-3 py-2 border border-outline-variant">
                              <span className="font-mono text-sm font-bold tracking-widest text-[#0047ff] select-all">
                                {cls.join_code}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(cls.join_code);
                                  toast.success(`Class code copied: ${cls.join_code}`);
                                }}
                                className="px-2.5 py-1 bg-surface-container-highest hover:bg-black hover:text-white font-sans text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                <span>COPY</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Exams Tab (Stitch Brutalist Design) ── */}
          {tab === "exams" && (
            <div className="animate-fade-up space-y-8">
              {/* Top Action & Editorial Title Bar */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
                <div className="flex flex-col max-w-3xl">
                  <h1 className="font-serif text-3xl md:text-5xl text-on-surface tracking-tight font-normal">
                    My Exams
                  </h1>
                  <p className="font-sans text-xs text-on-surface-variant mt-1 max-w-2xl uppercase tracking-wider font-semibold">
                    Manage test blueprints, questions, grading rubrics, and automated proctoring rules with institutional-grade rigor.
                  </p>
                </div>

                {/* Quick Action / CTA */}
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    onClick={handleCreateExam}
                    className="h-12 px-6 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#0047ff] hover:text-white transition-colors shadow-sm cursor-pointer"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>Create Exam Blueprint</span>
                  </button>
                </div>
              </div>

              {/* Analytical Overview Strip (Editorial Data Bar) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 bg-surface-container-low border border-outline-variant divide-y md:divide-y-0 md:divide-x divide-outline-variant shadow-sm">
                <div className="p-6 flex flex-col justify-between bg-surface-container-low">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                    Total Blueprints
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-3xl font-bold text-on-surface">
                      {String(exams.length).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-[10px] text-[#0047ff] uppercase font-bold">
                      {classes.length} COHORTS
                    </span>
                  </div>
                </div>

                <div className="p-6 bg-surface-container-lowest flex flex-col justify-between">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                    Published Exams
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-3xl font-bold text-on-surface">
                      {String(exams.filter(e => e.status === "published").length).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-[10px] text-[#006f41] uppercase font-bold">
                      LIVE QUEUE
                    </span>
                  </div>
                </div>

                <div className="p-6 bg-surface-container-low flex flex-col justify-between">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                    Draft Blueprints
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-3xl font-bold text-on-surface">
                      {String(exams.filter(e => e.status === "draft").length).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-[10px] text-secondary uppercase font-bold">
                      IN DESIGN
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Workspace Layout */}
              <div className="flex flex-col gap-6">
                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-2">
                  {/* Status filter buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setExamFilter("all")}
                      className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border border-outline-variant ${examFilter === "all"
                        ? "bg-black text-white border-black"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                        }`}
                    >
                      All ({exams.length})
                    </button>
                    <button
                      onClick={() => setExamFilter("published")}
                      className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border border-outline-variant ${examFilter === "published"
                        ? "bg-[#0047ff] text-white border-[#0047ff]"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                        }`}
                    >
                      Published ({exams.filter(e => e.status === "published").length})
                    </button>
                    <button
                      onClick={() => setExamFilter("draft")}
                      className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border border-outline-variant ${examFilter === "draft"
                        ? "bg-black text-white border-black"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                        }`}
                    >
                      Drafts ({exams.filter(e => e.status === "draft").length})
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="flex items-center bg-surface-container-lowest px-4 py-2 border border-outline-variant shadow-sm min-w-[280px]">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-2">search</span>
                    <input
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      className="bg-transparent font-sans text-xs uppercase tracking-wider text-on-surface placeholder:text-secondary focus:outline-none w-full"
                      placeholder="FILTER BY COHORT OR TITLE..."
                      type="text"
                    />
                    {examSearch && (
                      <button
                        onClick={() => setExamSearch("")}
                        className="text-secondary hover:text-black font-sans text-[10px] font-bold uppercase cursor-pointer"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                </div>

                {/* Grid of Exam Blueprint Cards */}
                {(() => {
                  const filteredExams = exams.filter((e) => {
                    if (examFilter === "published" && e.status !== "published") return false;
                    if (examFilter === "draft" && e.status !== "draft") return false;
                    if (examSearch.trim()) {
                      const q = examSearch.toLowerCase().trim();
                      const matchTitle = e.title.toLowerCase().includes(q);
                      const matchClass = (e.class_name || "").toLowerCase().includes(q);
                      return matchTitle || matchClass;
                    }
                    return true;
                  });

                  if (loading) {
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-64 bg-surface-container-lowest border-2 border-outline-variant animate-pulse" />
                        ))}
                      </div>
                    );
                  }

                  if (filteredExams.length === 0) {
                    return (
                      <div className="p-12 bg-surface-container-lowest border-2 border-black text-center space-y-4">
                        <div className="font-serif text-3xl font-bold text-on-surface">
                          {examSearch ? "NO MATCHING BLUEPRINTS FOUND" : "NO EXAMS REGISTERED"}
                        </div>
                        <p className="font-sans text-xs text-secondary uppercase tracking-widest max-w-md mx-auto">
                          {examSearch
                            ? `No exam matched "${examSearch}". Try adjusting your search query.`
                            : "Initialize an exam blueprint to synthesize multi-format test questions and institutional rubrics."}
                        </p>
                        <button
                          onClick={() => {
                            if (examSearch) setExamSearch("");
                            else handleCreateExam();
                          }}
                          className="h-11 px-6 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest hover:bg-[#0047ff] transition-colors cursor-pointer"
                        >
                          {examSearch ? "CLEAR SEARCH" : "+ CREATE EXAM BLUEPRINT"}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredExams.map((exam) => {
                        const isPublished = exam.status === "published";
                        const isDraft = exam.status === "draft";
                        return (
                          <article
                            key={exam.id}
                            className="bg-surface-container-lowest shadow-[5px_5px_0px_#1b1c1c] border-2 border-[#1b1c1c] flex flex-col justify-between transition-none relative overflow-hidden group"
                          >
                            {/* Accent Top Stripe */}
                            <div
                              className={`h-1.5 w-full ${isPublished ? "bg-[#7afbb1]" : "bg-[#0047ff]"
                                }`}
                            />

                            <div className="p-6 flex flex-col flex-1">
                              {/* Header Row */}
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex flex-col min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    {isPublished ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#7afbb1]/30 border border-[#5cde97] text-[#005430] font-mono text-[10px] font-bold uppercase tracking-widest">
                                        <span className="w-1.5 h-1.5 bg-[#006f41] inline-block"></span>
                                        PUBLISHED
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-secondary-container text-on-secondary-fixed border border-outline-variant font-mono text-[10px] font-bold uppercase tracking-widest">
                                        <span className="w-1.5 h-1.5 bg-secondary inline-block"></span>
                                        {isDraft ? "DRAFT READY" : exam.status.toUpperCase()}
                                      </span>
                                    )}
                                    <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-bold truncate max-w-[160px]">
                                      {exam.class_name || "COHORT"}
                                    </span>
                                  </div>
                                  <h2 className="font-serif text-xl md:text-2xl font-bold text-on-surface leading-tight group-hover:text-[#0047ff] transition-colors line-clamp-2">
                                    {exam.title}
                                  </h2>
                                </div>

                                <button
                                  onClick={() => handleDeleteExam(exam.id)}
                                  className="text-on-surface-variant hover:text-error hover:bg-error-container/30 p-1.5 border border-transparent hover:border-error transition-colors cursor-pointer shrink-0"
                                  title="Archive Blueprint"
                                  type="button"
                                >
                                  <span className="material-symbols-outlined text-[20px]">delete_outline</span>
                                </button>
                              </div>

                              {/* Metric Grid in Sharp 3-Column Strip */}
                              <div className="grid grid-cols-3 gap-0 bg-surface-container-low my-3 text-center py-2 border border-outline-variant divide-x divide-outline-variant">
                                <div className="flex flex-col py-1">
                                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                                    MARKS
                                  </span>
                                  <span className="font-mono text-sm font-bold text-on-surface mt-0.5">
                                    {exam.total_marks} PTS
                                  </span>
                                </div>
                                <div className="flex flex-col py-1">
                                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                                    TIME
                                  </span>
                                  <span className="font-mono text-sm font-bold text-on-surface mt-0.5">
                                    {exam.duration_minutes} MIN
                                  </span>
                                </div>
                                <div className="flex flex-col py-1">
                                  <span className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                                    LEVEL
                                  </span>
                                  <span
                                    className={`font-mono text-sm font-bold mt-0.5 uppercase ${exam.difficulty === "hard"
                                      ? "text-error"
                                      : exam.difficulty === "easy"
                                        ? "text-[#006f41]"
                                        : "text-[#0047ff]"
                                      }`}
                                  >
                                    {exam.difficulty}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bottom Actions */}
                            <div className="p-5 pt-0 flex flex-col gap-2 bg-surface-container-lowest">
                              {isPublished ? (
                                <>
                                  <button
                                    onClick={() => router.push(`/teacher/exams/${exam.id}/paper`)}
                                    className="w-full py-2.5 bg-surface-container text-on-surface font-sans text-xs uppercase tracking-wider font-bold hover:bg-[#0047ff] hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer border border-outline-variant"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                                    <span>View Approved Paper</span>
                                  </button>
                                  <button
                                    onClick={() => router.push(`/teacher/exams/${exam.id}/results`)}
                                    className="w-full py-2 bg-surface-container-low text-on-surface-variant font-sans text-xs uppercase tracking-wider font-bold hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer border border-outline-variant"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">insights</span>
                                    <span>Monitor Attempts</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => router.push(`/teacher/exams/${exam.id}/blueprint`)}
                                    className="w-full py-2.5 bg-black text-white font-sans text-xs uppercase tracking-wider font-bold hover:bg-[#0047ff] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                                    <span>Edit Blueprint & Generate</span>
                                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                  </button>
                                  <button
                                    onClick={() => router.push(`/teacher/exams/${exam.id}/general`)}
                                    className="w-full py-2 bg-surface-container-low text-on-surface font-sans text-xs uppercase tracking-wider font-bold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2 cursor-pointer border border-outline-variant"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">settings</span>
                                    <span>General Configuration</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Results Tab (Stitch Redesign: Evaluation Suite & Verification Stream) ── */}
          {tab === "results" && (
            <div className="animate-fade-up">
              {/* Top Editorial Header & Operational Overview */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-outline-variant">
                <div className="flex flex-col">
                  <h1 className="font-serif text-4xl lg:text-5xl text-on-surface font-normal tracking-tight">
                    Exam Results
                  </h1>
                  <p className="font-sans text-sm md:text-base text-secondary mt-1 max-w-2xl">
                    Review student attempts, audit automatic scoring anomalies, and publish verified transcripts.
                  </p>
                </div>
              </div>

              {/* Filter Tab Bar & Realtime Selector */}
              <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pb-3 border-b border-outline-variant">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setResultsFilter("all")}
                    className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border ${resultsFilter === "all"
                      ? "bg-black text-white border-black"
                      : "bg-surface-container-low text-secondary hover:text-black hover:bg-surface-container border-outline-variant"
                      }`}
                  >
                    ALL EXAMS ({String(exams.length).padStart(2, "0")})
                  </button>
                  <button
                    onClick={() => setResultsFilter("published")}
                    className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border ${resultsFilter === "published"
                      ? "bg-[#0047ff] text-white border-[#0047ff]"
                      : "bg-surface-container-low text-secondary hover:text-black hover:bg-surface-container border-outline-variant"
                      }`}
                  >
                    PUBLISHED ({String(publishedExamsCount).padStart(2, "0")})
                  </button>
                  <button
                    onClick={() => setResultsFilter("unpublished")}
                    className={`px-4 py-2 font-sans text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer border ${resultsFilter === "unpublished"
                      ? "bg-black text-white border-black"
                      : "bg-surface-container-low text-secondary hover:text-black hover:bg-surface-container border-outline-variant"
                      }`}
                  >
                    UNPUBLISHED ({String(unpublishedExamsCount).padStart(2, "0")})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={resultsSearch}
                      onChange={(e) => setResultsSearch(e.target.value)}
                      placeholder="Filter exam title or code..."
                      className="bg-surface-container-lowest border border-outline-variant px-3 py-1.5 pr-8 font-sans text-xs text-on-surface focus:outline-none focus:border-[#0047ff] placeholder:text-secondary/60 w-52 sm:w-64"
                    />
                    <span className="material-symbols-outlined absolute right-2 top-2 text-[18px] text-secondary pointer-events-none">
                      search
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setResultsSort((prev) => (prev === "newest" ? "oldest" : prev === "oldest" ? "marks" : "newest"))
                    }
                    className="p-2 border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                    title={`Sort Order: ${resultsSort.toUpperCase()}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">swap_vert</span>
                  </button>
                </div>
              </div>

              {/* Primary Assessment Cards Grid */}
              {loading ? (
                <div className="py-20 text-center font-mono text-xs uppercase tracking-widest text-secondary">
                  Synchronizing Evaluation Indices...
                </div>
              ) : exams.length === 0 ? (
                <div className="mt-8 p-12 bg-surface-container-lowest border border-outline-variant text-center space-y-3">
                  <span className="material-symbols-outlined text-4xl text-secondary">bar_chart</span>
                  <h3 className="font-serif text-xl font-bold text-on-surface">No Evaluation Blueprints Found</h3>
                  <p className="font-sans text-xs text-secondary max-w-md mx-auto">
                    Create and publish examination blueprints from the Exams workspace to initiate live scoring and student evaluation matrices.
                  </p>
                  <button
                    onClick={() => setTab("exams")}
                    className="mt-2 px-5 py-2.5 bg-black text-white hover:bg-[#0047ff] font-sans text-xs uppercase tracking-wider font-bold cursor-pointer transition-colors"
                  >
                    GO TO EXAMS WORKSPACE
                  </button>
                </div>
              ) : filteredResultsExams.length === 0 ? (
                <div className="mt-8 p-10 bg-surface-container-lowest border border-outline-variant text-center space-y-2">
                  <p className="font-serif text-lg text-on-surface font-medium">No exams matched your filter criteria.</p>
                  <p className="font-sans text-xs text-secondary">Try adjusting your status tab or search query.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                  {filteredResultsExams.map((exam) => {
                    const examAttempts = allAttempts.filter((a) => a.exam_id === exam.id);
                    const isPublished = exam.status === "published";
                    return (
                      <div
                        key={exam.id}
                        className="bg-surface-container-lowest border border-on-surface p-6 flex flex-col justify-between shadow-[4px_4px_0px_#111111] transition-none relative group"
                      >
                        {/* Structural Top Accent Strip */}
                        <div
                          className={`absolute top-0 left-0 right-0 h-1 ${isPublished ? "bg-[#0047ff]" : "bg-[#005430]"
                            }`}
                        ></div>

                        <div>
                          {/* Meta Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-widest text-[#0047ff] font-bold block mb-1">
                                {exam.class_name || "COHORT SPEC"}
                              </span>
                              <h2 className="font-serif text-2xl font-normal text-on-surface tracking-tight group-hover:text-[#0047ff] transition-colors line-clamp-1">
                                {exam.title}
                              </h2>
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest font-mono shrink-0 ${isPublished
                                ? "bg-[#dde1ff] text-[#001257]"
                                : "bg-surface-container-high text-secondary"
                                }`}
                            >
                              {exam.status}
                            </span>
                          </div>

                          {/* Total Marks Highlight Module */}
                          <div className="mt-4 p-4 bg-surface-container-low border border-outline-variant flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="font-sans text-[10px] uppercase tracking-widest text-secondary font-medium">
                                TOTAL MARKS
                              </span>
                              <span className="font-sans text-[9px] text-secondary/80">
                                MAX ACCREDITED
                              </span>
                            </div>
                            <div className="font-serif text-2xl font-bold text-on-surface tracking-tight">
                              {exam.total_marks}
                            </div>
                          </div>

                          {/* Diagnostic Metrics Section */}
                          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-outline-variant font-sans text-xs">
                            <div className="flex flex-col">
                              <span className="font-sans text-[10px] uppercase tracking-wider text-secondary">
                                STUDENT ATTEMPTS
                              </span>
                              <span className="font-mono text-xs font-bold text-on-surface mt-0.5">
                                {isPublished
                                  ? attemptsLoading
                                    ? "SYNCING..."
                                    : `${examAttempts.length} ${examAttempts.length === 1 ? "SUBMISSION" : "SUBMISSIONS"
                                    }`
                                  : "0 SUBMISSIONS"}
                              </span>
                            </div>
                            <div className="flex flex-col border-l border-outline-variant pl-3">
                              <span className="font-sans text-[10px] uppercase tracking-wider text-secondary">
                                COMPLEXITY
                              </span>
                              <span className="font-mono text-xs font-bold text-on-surface mt-0.5 uppercase">
                                {exam.difficulty || "STANDARD"}
                              </span>
                            </div>
                          </div>

                          {/* Schedule Grid */}
                          <div className="mt-4 p-3 bg-surface-container-low border border-outline-variant grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-secondary font-medium">
                                START DATE
                              </span>
                              <span className="font-mono text-xs font-bold text-on-surface mt-0.5">
                                {formatExamDate(exam.start_time)}
                              </span>
                              {exam.start_time && (
                                <span className="font-mono text-[10px] text-secondary">
                                  {formatExamTime(exam.start_time)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col border-l border-outline-variant pl-3">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-secondary font-medium">
                                DUE DATE
                              </span>
                              <span className="font-mono text-xs font-bold text-[#0047ff] mt-0.5">
                                {formatExamDate(exam.end_time)}
                              </span>
                              {exam.end_time && (
                                <span className="font-mono text-[10px] text-secondary">
                                  {formatExamTime(exam.end_time)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Primary Action */}
                        <div className="mt-6 pt-4 border-t border-outline-variant">
                          <button
                            onClick={() => router.push(`/teacher/exams/${exam.id}/results`)}
                            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface-container-lowest text-on-surface border border-black font-sans text-xs uppercase tracking-wider font-bold hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_#111111] cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[18px] text-[#0047ff]">
                                bar_chart
                              </span>
                              <span>View Student Attempts</span>
                            </div>
                            <span className="text-lg">→</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Analytical Breakdown Panel: Recent Verification Logs */}
              <div className="mt-12 p-6 md:p-8 bg-surface-container-lowest border border-outline-variant">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-outline-variant gap-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="font-serif text-2xl text-on-surface font-bold tracking-tight">
                        Recent Student Attempts &amp; Verification Stream
                      </h3>
                      <p className="font-sans text-xs text-secondary mt-1">
                        Review verified candidate attempts, autograding accuracy logs, and audit trails.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 font-sans text-xs">
                    <button
                      onClick={handleExportAuditCSV}
                      className="text-[#0047ff] hover:underline uppercase tracking-wider font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Export Audit CSV</span>
                    </button>
                  </div>
                </div>

                {/* Tabular Monospace Records */}
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left font-sans text-xs">
                    <thead>
                      <tr className="font-mono text-[10px] uppercase tracking-widest text-secondary border-b border-outline-variant">
                        <th className="py-2.5 px-3">STUDENT IDENTIFIER</th>
                        <th className="py-2.5 px-3">TARGET EXAM</th>
                        <th className="py-2.5 px-3">TIMESTAMP (UTC)</th>
                        <th className="py-2.5 px-3">RAW ACCURACY</th>
                        <th className="py-2.5 px-3">SYSTEM GRADE</th>
                        <th className="py-2.5 px-3 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant font-sans">
                      {allAttempts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-secondary font-mono text-xs">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <span className="material-symbols-outlined text-3xl text-secondary">
                                dataset
                              </span>
                              <span>No student evaluation attempts logged yet.</span>
                              <span className="text-[11px] text-secondary/80 font-sans">
                                Published exams will stream real-time evaluations and audit logs into this ledger.
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        allAttempts.slice(0, 10).map((att) => {
                          const rawScore = (att.total_marks ?? 0) + (att.adjustment_marks ?? 0);
                          const maxScore = att.max_marks || 1;
                          const pct = Math.round((rawScore / maxScore) * 100);
                          const isCompleted = att.status === "completed" || att.status === "evaluated";
                          return (
                            <tr key={att.id} className="hover:bg-surface-container-low transition-none">
                              <td className="py-3 px-3 font-bold text-on-surface">
                                STU-{att.student_id}{" "}
                                <span className="font-normal text-secondary">
                                  ({att.student_email ? att.student_email.split("@")[0] : "Candidate"})
                                </span>
                              </td>
                              <td className="py-3 px-3 text-on-surface font-medium">
                                {att.exam_title}
                              </td>
                              <td className="py-3 px-3 text-secondary font-mono text-[11px]">
                                {att.completed_at
                                  ? new Date(att.completed_at).toISOString().replace("T", " ").slice(0, 19)
                                  : att.started_at
                                    ? new Date(att.started_at).toISOString().replace("T", " ").slice(0, 19)
                                    : "—"}
                              </td>
                              <td className="py-3 px-3 text-on-surface font-mono font-bold">
                                {rawScore.toFixed(1)} / {maxScore} PTS
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 font-bold text-[10px] font-mono ${pct >= 50
                                    ? "bg-[#7afbb1]/30 text-[#005430]"
                                    : "bg-[#dde1ff] text-[#001257]"
                                    }`}
                                >
                                  {isCompleted ? `VERIFIED (${pct}%)` : att.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => router.push(`/teacher/exams/${att.exam_id}/results`)}
                                  className="text-[#0047ff] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>REVIEW ATTEMPT</span>
                                  <span className="text-xs">↗</span>
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
          )}

          {/* ── Profile Tab ── */}
          {tab === "profile" && (
            <div className="animate-fade-up max-w-[840px]">
              {/* Editorial Accent Line */}
              <div className="w-12 h-1 bg-[#0047ff] mb-6"></div>

              {/* Header Section */}
              <header className="flex flex-col gap-3 mb-10">
                <h1 className="font-serif text-4xl lg:text-5xl text-on-surface tracking-tight font-normal">
                  Teacher Profile
                </h1>
                <p className="font-body-md text-base text-neutral-600 max-w-2xl leading-relaxed">
                  View your verified educator credentials, active cohort telemetry, and system-wide assessment administrative status.
                </p>
              </header>

              <div className="bg-surface-container-lowest border border-black/10 p-8 sm:p-10 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)] flex flex-col gap-8">
                {/* Identity Header */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 border-b border-black/10 pb-8">
                  <div className="w-20 h-20 bg-black text-white font-serif text-3xl font-bold flex items-center justify-center shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-serif text-3xl text-on-surface">{user.name}</span>
                    <span className="font-code-input text-sm text-neutral-600 mt-1">{user.email}</span>
                    <span className="inline-flex items-center self-start px-2 py-0.5 bg-black text-white font-label-caps text-[9px] font-bold tracking-[0.18em] uppercase mt-2">
                      EDUCATOR PORTAL
                    </span>
                  </div>
                </div>

                {/* Detailed Information Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-surface-container-low border border-black/10">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      EDUCATOR FULL NAME
                    </span>
                    <span className="font-serif text-lg text-on-surface font-medium">{user.name}</span>
                  </div>

                  <div className="p-4 bg-surface-container-low border border-black/10">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      REGISTERED EMAIL
                    </span>
                    <span className="font-code-input text-xs text-on-surface font-medium">{user.email}</span>
                  </div>

                  <div className="p-4 bg-surface-container-low border border-black/10">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      PORTAL ROLE
                    </span>
                    <span className="font-label-caps text-xs text-on-surface font-bold">TEACHER (AUTHENTICATED)</span>
                  </div>

                  <div className="p-4 bg-surface-container-low border border-black/10">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      ACCOUNT STATUS
                    </span>
                    <span className="font-label-caps text-xs text-[#0047ff] font-bold">ACTIVE &bull; VERIFIED</span>
                  </div>
                </div>

                {/* Academic Stat Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      ACTIVE COHORTS
                    </span>
                    <span className="font-serif text-3xl text-on-surface font-bold">
                      {classes.length}
                    </span>
                  </div>

                  <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      TOTAL STUDENTS
                    </span>
                    <span className="font-serif text-3xl text-on-surface font-bold">
                      {totalStudents}
                    </span>
                  </div>

                  <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      BLUEPRINTS
                    </span>
                    <span className="font-serif text-3xl text-on-surface font-bold">
                      {exams.length}
                    </span>
                  </div>

                  <div className="p-5 bg-surface-container-low border border-black/10 text-center">
                    <span className="font-label-caps text-[10px] text-neutral-500 uppercase tracking-widest block mb-1">
                      PENDING AUDITS
                    </span>
                    <span className={`font-serif text-3xl font-bold ${pendingRequests.length > 0 ? "text-[#0047ff]" : "text-on-surface"}`}>
                      {pendingRequests.length}
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
                    className="px-6 py-3.5 bg-black hover:!bg-[#0047ff] hover:!border-[#0047ff] text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold transition-all cursor-pointer"
                  >
                    Sign Out of Portal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Create Modal (Stitch Brutalist Cohort Registry Dispatch) ── */}
      {showCreate && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
        >
          <div className="animate-fade-up w-full max-w-xl bg-surface-container-lowest border-2 border-black p-6 md:p-8 shadow-[8px_8px_0_0_#000] relative space-y-6">
            <div className="flex items-start justify-between border-b border-outline-variant pb-4">
              <div>
                <span className="font-sans text-[10px] uppercase tracking-widest text-[#0047ff] font-bold block">
                  REGISTRY DISPATCH
                </span>
                <h3 className="font-serif text-2xl md:text-3xl text-on-surface mt-1 font-bold">
                  Initialize Cohort
                </h3>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-on-surface-variant hover:text-black transition-colors cursor-pointer"
                type="button"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                  COHORT TITLE / NAME *
                </label>
                <input
                  id="input-class-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Distributed Computing Systems"
                  required
                  className="w-full bg-surface-container-low px-4 py-3 text-on-surface font-sans text-sm border border-outline-variant focus:outline-none focus:border-black focus:bg-surface-container-lowest"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-sans text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                  DESCRIPTION / BLUEPRINT NOTES
                </label>
                <textarea
                  id="input-class-desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional — cohort syllabus focus, schedule, or evaluation criteria..."
                  rows={3}
                  className="w-full bg-surface-container-low px-4 py-3 text-on-surface font-sans text-sm border border-outline-variant focus:outline-none focus:border-black focus:bg-surface-container-lowest resize-y"
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 text-error text-xs font-bold uppercase tracking-wider">
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-5 py-3 bg-surface-container-high text-on-surface font-sans text-xs uppercase tracking-widest hover:bg-surface-container-highest transition-colors cursor-pointer font-bold"
                >
                  CANCEL
                </button>
                <button
                  id="btn-submit-create"
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className={`px-6 py-3 bg-[#0047ff] text-white font-sans text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${creating || !newName.trim()
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:bg-[#0035c5]"
                    }`}
                >
                  {creating ? "INITIALIZING..." : "INITIALIZE & GENERATE KEY"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Class Detail View ─────────────────────────────────────────────────────────

function ClassDetailView({
  cls, students, studentsLoading, pendingRequests, removingId, actionLoading,
  onBack, onRemoveStudent, onApprove, onReject, onDeleteClass,
  onNavigateToExams, onNavigateToResults,
}: {
  cls: ClassItem;
  students: EnrolledStudent[];
  studentsLoading: boolean;
  pendingRequests: JoinRequest[];
  removingId: number | null;
  actionLoading: Record<number, string>;
  onBack: () => void;
  onRemoveStudent: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDeleteClass: () => void;
  onNavigateToExams?: () => void;
  onNavigateToResults?: () => void;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [syllabusList, setSyllabusList] = useState<SyllabusItem[]>([]);
  const [syllabusLoading, setSyllabusLoading] = useState(true);
  const [showSyllabusUpload, setShowSyllabusUpload] = useState(false);

  const loadSyllabus = useCallback(async () => {
    setSyllabusLoading(true);
    try {
      const data = await fetchSyllabusList(cls.id);
      setSyllabusList(data || []);
    } catch (err: any) {
      console.warn("Failed to load syllabus list:", err?.message || err);
      setSyllabusList([]);
    } finally {
      setSyllabusLoading(false);
    }
  }, [cls.id]);

  useEffect(() => {
    loadSyllabus();
  }, [loadSyllabus]);

  const handleDeleteSyllabus = async (id: string) => {
    if (!confirm("Are you sure you want to delete this syllabus?")) return;
    try {
      await deleteSyllabus(id);
      loadSyllabus();
    } catch (err) {
      alert("Failed to delete syllabus");
    }
  };

  function copyCode() {
    navigator.clipboard.writeText(cls.join_code);
    setCopied("code");
    setTimeout(() => setCopied(null), 2500);
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/join/${cls.join_code}`);
    setCopied("link");
    setTimeout(() => setCopied(null), 2500);
  }

  const filteredStudents = students.filter(s =>
    s.student_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.student_email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="animate-fade-up max-w-7xl mx-auto w-full space-y-8">
      {/* Top Bar / Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-4 mt-1">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-black text-slate-900 font-mono text-xs uppercase tracking-wider shadow-[3px_3px_0px_#1b1c1c] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1b1c1c] transition-all cursor-pointer font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Back to My Classes
            </button>
            <h1 className="text-2xl lg:text-3xl font-serif text-slate-900 font-bold tracking-tight">
              {cls.name}
            </h1>
          </div>
          {cls.description && <p className="text-slate-600 text-sm mt-1">{cls.description}</p>}
        </div>

        <div className="flex items-center gap-4 self-start md:self-auto">
          <button
            onClick={onDeleteClass}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 border-2 border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[4px_4px_0px_#1b1c1c] hover:bg-red-600 hover:text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#1b1c1c] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">delete_forever</span>
            Delete Class
          </button>
        </div>
      </div>

      {/* Main 2-Column Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Primary Column (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-8">
          {/* Section: Students Roster */}
          <section className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-mono">
                  <span className="material-symbols-outlined text-[20px]">group</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-serif">Students</h2>
                <span className="px-2 py-0.5 bg-[#e2ecff] text-[#0047ff] border border-[#0047ff] font-mono text-xs font-bold">
                  {students.length} ENROLLED
                </span>
              </div>

              {/* Search / Filter input */}
              <div className="relative w-full sm:w-64">
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[18px] text-slate-400">search</span>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Filter roster..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-[#0047ff]"
                />
              </div>
            </div>

            {/* Student Table / List */}
            {studentsLoading ? (
              <div className="p-8 text-center">
                <div className="w-7 h-7 border-4 border-slate-200 border-t-[#0047ff] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 font-mono text-xs">Loading students…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-[2.5rem] mb-3">👤</div>
                <p className="text-slate-900 font-bold mb-1">No students yet</p>
                <p className="text-slate-500 text-sm">Share the class code below to invite students.</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                No students matching &quot;{studentSearch}&quot;
              </div>
            ) : (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-black text-slate-700 font-mono text-xs uppercase tracking-wider">
                      <th className="p-3">Student</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Joined Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans text-sm">
                    {filteredStudents.map((s) => (
                      <tr key={s.student_id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#0047ff] text-white flex items-center justify-center font-mono text-sm font-bold shadow-[2px_2px_0px_#1b1c1c] border border-black shrink-0">
                              {s.student_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">{s.student_name}</span>
                              <span className="font-mono text-xs text-slate-500">ID: #{s.student_id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-600">
                          {s.student_email}
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-900">
                          {new Date(s.joined_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            id={`btn-remove-${s.student_id}`}
                            onClick={() => onRemoveStudent(s.student_id)}
                            disabled={removingId === s.student_id}
                            className={`px-2.5 py-1 bg-white border border-red-600 text-red-600 hover:bg-red-600 hover:text-white font-mono text-xs uppercase font-bold transition-colors ${removingId === s.student_id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            {removingId === s.student_id ? "Removing…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-slate-500 font-mono text-xs uppercase">
              <span>SHOWING {filteredStudents.length} OF {students.length} ENROLLED SCHOLAR{students.length === 1 ? "" : "S"}</span>
            </div>
          </section>

          {/* Pending Requests Section (if any) */}
          {pendingRequests.length > 0 && (
            <section className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-mono">
                    <span className="material-symbols-outlined text-[20px]">person_add</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 font-serif">Pending Requests</h2>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-600 font-mono text-xs font-bold uppercase">
                    {pendingRequests.length} PENDING
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {pendingRequests.map(req => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    loadingState={actionLoading[req.id]}
                    onApprove={() => onApprove(req.id)}
                    onReject={() => onReject(req.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Section: Syllabus */}
          <section className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-mono">
                  <span className="material-symbols-outlined text-[20px]">menu_book</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-serif">Syllabus</h2>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 border border-black font-mono text-xs font-bold uppercase">
                  {syllabusList.length} FILES
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadSyllabus}
                  disabled={syllabusLoading}
                  className={`p-2 border-2 border-black bg-white hover:bg-slate-100 text-black shadow-[2px_2px_0px_#1b1c1c] flex items-center justify-center cursor-pointer ${syllabusLoading ? 'opacity-50' : ''}`}
                  title="Refresh file catalog"
                >
                  <span className={`material-symbols-outlined text-[20px] ${syllabusLoading ? 'animate-spin' : ''}`}>refresh</span>
                </button>
                <button
                  onClick={() => setShowSyllabusUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0047ff] text-white border-2 border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[4px_4px_0px_#1b1c1c] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_#1b1c1c] transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  + Upload Syllabus
                </button>
              </div>
            </div>

            {/* Syllabus Document Cards */}
            {syllabusLoading ? (
              <div className="p-8 text-center">
                <div className="w-7 h-7 border-4 border-slate-200 border-t-[#0047ff] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 font-mono text-xs">Loading syllabus…</p>
              </div>
            ) : syllabusList.length === 0 ? (
              <div className="p-10 flex flex-col items-center justify-center text-center">
                <div className="text-[3rem] mb-3">📚</div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">No syllabus yet</h3>
                <p className="text-slate-500 text-sm mb-4 max-w-sm">
                  Upload a syllabus to share course material with your students and calibrate exam questions.
                </p>
                <button
                  onClick={() => setShowSyllabusUpload(true)}
                  className="px-4 py-2 bg-white border-2 border-black font-mono text-xs uppercase font-bold shadow-[3px_3px_0px_#1b1c1c] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Upload Syllabus
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 mt-6">
                {syllabusList.map((s) => {
                  const isPdf = s.file_ref.toLowerCase().endsWith('.pdf');
                  return (
                    <div key={s.id} className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_#1b1c1c] flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-14 bg-red-100 border border-red-500 flex items-center justify-center shrink-0 shadow-[2px_2px_0px_#1b1c1c]">
                          <span className="material-symbols-outlined text-red-600 text-[28px]">picture_as_pdf</span>
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-base">{s.title}</span>
                            <span className={`px-2 py-0.5 font-mono text-xs border font-bold uppercase ${s.status === 'READY' ? 'bg-emerald-100 text-emerald-800 border-emerald-600' : s.status === 'FAILED' ? 'bg-red-100 text-red-800 border-red-600' : 'bg-blue-100 text-blue-800 border-blue-600'}`}>
                              {s.status === 'READY' ? 'Processed' : s.status === 'FAILED' ? 'Failed' : `Processing: ${s.stage?.replace('_', ' ') || 'Starting'}`}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-slate-600 mt-0.5 font-bold">{s.file_ref.split('/').pop()}</span>
                          <div className="flex items-center gap-2 mt-1 font-mono text-xs text-slate-500">
                            <span>Uploaded {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                            {s.error && <span className="text-red-500 truncate max-w-[200px]" title={s.error}>• {s.error}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        <button
                          onClick={() => viewSyllabus(s.id)}
                          disabled={!isPdf}
                          className={`px-3 py-1.5 bg-white border border-black text-black font-mono text-xs uppercase tracking-wider font-bold shadow-[2px_2px_0px_#1b1c1c] ${isPdf ? 'hover:bg-slate-100 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                        >
                          View PDF
                        </button>
                        <button
                          onClick={() => downloadSyllabus(s.id, s.title)}
                          className="px-3 py-1.5 bg-white border border-black text-black font-mono text-xs uppercase tracking-wider font-bold hover:bg-slate-100 shadow-[2px_2px_0px_#1b1c1c] cursor-pointer"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDeleteSyllabus(s.id)}
                          className="px-3 py-1.5 bg-white border border-red-600 text-red-600 font-mono text-xs uppercase tracking-wider font-bold hover:bg-red-600 hover:text-white shadow-[2px_2px_0px_#1b1c1c] transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section: Class Exams & Assessments */}
          <section className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-mono">
                  <span className="material-symbols-outlined text-[20px]">quiz</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-serif">Class Exams & Assessments</h2>
              </div>
              <span className="px-2 py-0.5 bg-[#e2ecff] text-[#0047ff] border border-[#0047ff] font-mono text-xs font-bold uppercase self-start sm:self-auto">
                QUICK ACTIONS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {/* Card 1: View / Create Exam Paper */}
              <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_#1b1c1c] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-[#0047ff] text-white font-mono text-xs font-bold uppercase tracking-wider">
                      EXAM BLUEPRINTS
                    </span>
                    <span className="material-symbols-outlined text-[#0047ff] text-[22px]">edit_document</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-3 font-serif">
                    View / Create Exam Paper
                  </h3>
                  <p className="text-slate-600 font-sans text-xs mt-2 leading-relaxed">
                    Draft test blueprints, generate questions with AI, and manage syllabus-aligned exam papers.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <button
                    onClick={onNavigateToExams}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0047ff] text-white border-2 border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[3px_3px_0px_#1b1c1c] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1b1c1c] transition-all cursor-pointer"
                  >
                    + Create / View Papers →
                  </button>
                </div>
              </div>

              {/* Card 2: View Class Exam Results */}
              <div className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_#1b1c1c] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-900 font-mono text-xs font-bold uppercase tracking-wider border border-black">
                      RESULTS & TELEMETRY
                    </span>
                    <span className="material-symbols-outlined text-slate-900 text-[22px]">insights</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-3 font-serif">
                    View Class Exam Results
                  </h3>
                  <p className="text-slate-600 font-sans text-xs mt-2 leading-relaxed">
                    Review candidate submissions, inspect auto-grading telemetry, adjust marks, and release verified scores.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <button
                    onClick={onNavigateToResults}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white border-2 border-black font-mono text-xs uppercase tracking-wider font-bold shadow-[3px_3px_0px_#1b1c1c] hover:bg-[#0047ff] hover:text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_#1b1c1c] transition-all cursor-pointer"
                  >
                    View Exam Results →
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Side Rail (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {/* Side Card 1: Class Metric Dossier */}
          <div className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="font-mono text-sm text-slate-900 uppercase tracking-wider font-bold">Class Dossier</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {/* Metric 1 */}
              <div className="p-4 bg-slate-50 border-2 border-black shadow-[3px_3px_0px_#1b1c1c]">
                <span className="block font-mono text-xs uppercase tracking-wider text-slate-500">STUDENTS</span>
                <span className="block text-2xl font-normal text-slate-900 mt-1 leading-none">{cls.student_count}</span>
                <span className="block font-sans text-xs text-emerald-700 mt-2 font-medium">Active enrollment</span>
              </div>
              {/* Metric 2 */}
              <div className="p-4 bg-slate-50 border-2 border-black shadow-[3px_3px_0px_#1b1c1c]">
                <span className="block font-mono text-xs uppercase tracking-wider text-slate-500">PENDING</span>
                <span className="block text-2xl font-normal text-slate-900 mt-1 leading-none">{pendingRequests.length}</span>
                <span className={`block font-sans text-xs mt-2 font-medium ${pendingRequests.length > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                  {pendingRequests.length > 0 ? "Requires review" : "No waitlist"}
                </span>
              </div>
            </div>
          </div>

          {/* Side Card 2: Join Code Hub */}
          <div className="bg-white border-2 border-black p-6 shadow-[5px_5px_0px_#1b1c1c]">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="font-mono text-sm text-slate-900 uppercase tracking-wider font-bold">Join Code</h3>
              <span className="px-2 py-0.5 bg-[#e2ecff] text-[#0047ff] border border-[#0047ff] font-mono text-xs font-bold uppercase">PIN ACCESS</span>
            </div>
            <div className="mt-4">
              {/* Code Banner Display */}
              <div className="p-4 bg-slate-100 border-2 border-black flex items-center justify-between shadow-[3px_3px_0px_#1b1c1c]">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#0047ff] text-[24px]">lock</span>
                  <span className="font-mono text-2xl tracking-widest text-slate-900 font-bold select-all">{cls.join_code}</span>
                </div>
              </div>

              {/* Copy Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  id={`detail-copy-code-${cls.id}`}
                  onClick={copyCode}
                  className="flex items-center justify-center gap-2 py-2.5 bg-white border-2 border-black text-slate-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-black hover:text-white shadow-[3px_3px_0px_#1b1c1c] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  Copy Code
                </button>
                <button
                  id={`detail-copy-link-${cls.id}`}
                  onClick={copyLink}
                  className="flex items-center justify-center gap-2 py-2.5 bg-white border-2 border-black text-slate-900 font-mono text-xs uppercase tracking-wider font-bold hover:bg-black hover:text-white shadow-[3px_3px_0px_#1b1c1c] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">link</span>
                  Copy Link
                </button>
              </div>

              {copied && (
                <p className="text-emerald-700 font-mono text-xs mt-2 text-center font-bold">
                  ✓ {copied === 'code' ? `Class Code ${cls.join_code} copied!` : 'Invite link copied to clipboard!'}
                </p>
              )}

              {/* Instructional Notice Callout */}
              <div className="mt-4 p-4 bg-[#e2ecff] text-slate-900 border border-[#0047ff] text-xs font-sans">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[#0047ff] text-[20px] shrink-0 mt-0.5">info</span>
                  <p className="leading-relaxed">
                    Share the code or invite link with students. Their requests will need your approval before cohort admission is granted.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SyllabusUploadModal
        isOpen={showSyllabusUpload}
        onClose={() => setShowSyllabusUpload(false)}
        onSuccess={loadSyllabus}
        classId={cls.id}
      />
    </div>
  );
}

// ── Shared Sub-components ─────────────────────────────────────────────────────

function ClassCard({ cls, delay, pendingCount, onManage, onDelete, onViewRequests }: {
  cls: ClassItem; delay: number; pendingCount: number;
  onManage: () => void; onDelete: () => void; onViewRequests: () => void;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  function copyCode() { navigator.clipboard.writeText(cls.join_code); setCopied("code"); setTimeout(() => setCopied(null), 2000); }
  function copyLink() { navigator.clipboard.writeText(`${window.location.origin}/join/${cls.join_code}`); setCopied("link"); setTimeout(() => setCopied(null), 2000); }

  return (
    <div className="animate-fade-up bg-white border border-slate-200 hover:border-[#4F46E5]/40 hover:shadow-md transition-all duration-200 rounded-xl p-6 relative overflow-hidden group"
      style={{ animationDelay: `${delay}s` }}>
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-[#4F46E5] to-[#4ec078] rounded-l-md" />
      <div className="pl-2 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-[1.05rem] font-bold text-slate-900 leading-tight flex-1 mr-2">{cls.name}</h3>
          <button onClick={onDelete} title="Delete" className="bg-transparent border-none text-slate-300 hover:text-red-500 cursor-pointer p-0.5 shrink-0 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
          </button>
        </div>

        {cls.description && <p className="text-slate-500 text-[0.84rem] mb-3 leading-relaxed line-clamp-2">{cls.description}</p>}

        <div className="mt-auto">
          {/* Code strip */}
          <div className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2.5 mb-3 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
            <span className="flex-1 font-mono text-[0.88rem] font-bold text-[#4F46E5] tracking-wider">{cls.join_code}</span>
            <button id={`btn-copy-code-${cls.id}`} onClick={copyCode} className={`border rounded-[5px] text-[0.68rem] font-semibold py-0.5 px-2 transition-colors cursor-pointer ${copied === "code" ? "bg-[#4F46E5]/10 border-[#4F46E5]/30 text-[#4F46E5]" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {copied === "code" ? "✓" : "Copy"}
            </button>
            <button id={`btn-copy-link-${cls.id}`} onClick={copyLink} className={`border rounded-[5px] text-[0.68rem] font-semibold py-0.5 px-2 transition-colors cursor-pointer ${copied === "link" ? "bg-[#4F46E5]/10 border-[#4F46E5]/30 text-[#4F46E5]" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {copied === "link" ? "✓" : "Link"}
            </button>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <span className="flex items-center gap-1 text-[0.8rem] text-slate-500">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              {cls.student_count} student{cls.student_count !== 1 ? "s" : ""}
            </span>
            {pendingCount > 0 && (
              <button onClick={onViewRequests} className="flex items-center gap-1 text-[0.78rem] text-amber-600 bg-amber-50 border border-amber-200 rounded-full py-0.5 px-2 cursor-pointer hover:bg-amber-100 transition-colors">
                ⏳ {pendingCount} pending
              </button>
            )}
          </div>

          <button id={`btn-manage-${cls.id}`} onClick={onManage}
            className="w-full py-2 rounded-md border border-[#4F46E5]/30 bg-[#4F46E5]/5 text-[#4F46E5] text-[0.85rem] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 hover:bg-[#4F46E5]/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
            Manage Class
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestRow({ req, loadingState, onApprove, onReject }: { req: JoinRequest; loadingState?: string; onApprove: () => void; onReject: () => void; }) {
  const statusColors = {
    pending: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", label: "PENDING AUDIT" },
    approved: { bg: "bg-[#7afbb1]/20", text: "text-[#005430]", border: "border-[#5cde97]", label: "ACTIVE / VERIFIED" },
    rejected: { bg: "bg-red-100", text: "text-error", border: "border-red-300", label: "REJECTED" },
  };
  const st = statusColors[req.status as keyof typeof statusColors] ?? statusColors.pending;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-surface-container-lowest border border-outline-variant hover:border-black transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-surface-container-highest text-on-surface border border-outline-variant flex items-center justify-center font-mono text-xs font-bold shrink-0">
          {req.student_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-on-surface text-sm uppercase tracking-wider truncate">
            {req.student_name}
          </span>
          <span className="font-mono text-xs text-on-surface-variant truncate">
            {req.student_email}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border ${st.border} ${st.bg} ${st.text} font-mono text-[10px] font-bold uppercase tracking-wider`}>
          <span className="w-1.5 h-1.5 bg-current"></span>
          {st.label}
        </span>
        {req.status === "pending" && (
          <div className="flex items-center gap-2">
            <button
              id={`btn-approve-${req.id}`}
              onClick={onApprove}
              disabled={!!loadingState}
              className={`px-3 py-1.5 bg-[#006f41] hover:bg-[#005430] text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors ${loadingState ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                }`}
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
              <span>{loadingState === "approving" ? "…" : "Approve"}</span>
            </button>
            <button
              id={`btn-reject-${req.id}`}
              onClick={onReject}
              disabled={!!loadingState}
              className={`px-3 py-1.5 border border-error bg-transparent text-error hover:bg-error hover:text-white font-sans text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors ${loadingState ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                }`}
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              <span>{loadingState === "rejecting" ? "…" : "Reject"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, badge, badgeColor, badgeBg }: { icon: React.ReactNode; title: string; badge: string; badgeColor: string; badgeBg: string; }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={badgeColor}>{icon}</span>
      <h2 className="text-[1rem] font-bold text-slate-900">{title}</h2>
      <span className={`ml-2 text-[0.7rem] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full border ${badgeColor} ${badgeBg}`}>
        {badge}
      </span>
    </div>
  );
}

function InfoTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-md border ${highlight ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
      <div className="text-[0.75rem] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-[1.25rem] font-bold ${highlight ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <label className="block text-[0.82rem] font-semibold text-slate-600 mb-2 uppercase tracking-widest">{label}</label>;
}