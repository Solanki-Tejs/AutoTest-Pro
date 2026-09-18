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
import { useRouter } from "next/navigation";

type Tab = "classes" | "requests" | "profile";

export default function TeacherDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("classes");

  // Classes & requests
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
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

  // Request action states
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});

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

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [cls, reqs] = await Promise.all([fetchMyClasses(token), fetchAllRequests(token)]);
      setClasses(cls);
      setRequests(reqs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  async function openClass(cls: ClassItem) {
    setSelectedClass(cls);
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
    setStudents([]);
  }

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

  function handleLogout() { logout(); router.push("/teacher/login"); }

  if (!user) return null;

  const pendingRequests = requests.filter(r => r.status === "pending");

  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Sidebar ── */}
      <aside className="w-[260px] min-h-screen bg-white border-r border-slate-200 flex flex-col py-6 px-4 fixed top-0 left-0 bottom-0 z-10">
        <div className="flex items-center gap-2.5 px-2 mb-10">
          <div className="w-8 h-8 relative flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="AutoTest Pro Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-[1.05rem] font-bold text-slate-900 tracking-tight">AutoTest Pro</span>
        </div>

        <div className="p-3 bg-slate-50 rounded-md border border-slate-200 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2563eb]/10 border-2 border-[#2563eb] flex items-center justify-center text-[1rem] text-[#2563eb] font-bold shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <div className="text-[0.88rem] font-semibold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">{user.name}</div>
            <div className="text-[0.72rem] text-[#2563eb] font-semibold uppercase tracking-widest">Teacher</div>
          </div>
        </div>

        <nav className="flex-1">
          {(["classes", "requests", "profile"] as Tab[]).map(t => {
            const active = tab === t;
            const labels: Record<Tab, string> = { classes: "My Classes", requests: "Join Requests", profile: "Profile" };
            const icons: Record<Tab, React.ReactNode> = {
              classes: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
              requests: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
              profile: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
            };
            return (
              <button key={t} id={`tab-${t}`} onClick={() => { setTab(t); if (t !== "classes") closeClass(); }}
                className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-md border-none text-[0.88rem] mb-1 transition-all duration-200 text-left cursor-pointer ${active ? "bg-[#2563eb]/10 text-[#2563eb] font-semibold" : "bg-transparent text-slate-500 font-normal hover:bg-slate-50 hover:text-slate-900"
                  }`}>
                {icons[t]}
                {labels[t]}
                {t === "requests" && pendingRequests.length > 0 && (
                  <span className="ml-auto bg-[#2563eb] text-white rounded-full text-[0.7rem] font-bold py-0.5 px-2">{pendingRequests.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <button id="btn-logout" onClick={handleLogout}
          className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-md border-none bg-transparent text-slate-500 text-[0.88rem] cursor-pointer transition-all duration-200 mt-2 hover:bg-slate-50 hover:text-slate-900">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Sign out
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="p-8 min-h-screen relative z-[1]" style={{ marginLeft: "260px" }}>

        {/* ── Classes Tab ── */}
        {tab === "classes" && !selectedClass && (
          <div className="animate-fade-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-1">My Classes</h1>
                <p className="text-slate-600 text-[0.9rem]">{classes.length} class{classes.length !== 1 ? "es" : ""}</p>
              </div>
              <button id="btn-create-class" onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[0.9rem] font-semibold cursor-pointer shadow-sm transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New Class
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 mb-6 text-[0.9rem]">
                {error} — <button onClick={loadData} className="bg-transparent border-none text-red-600 underline cursor-pointer">Retry</button>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
                {[1, 2, 3].map(i => <div key={i} className="h-[200px] bg-white rounded-xl border border-slate-200 animate-pulse shadow-sm" />)}
              </div>
            ) : classes.length === 0 ? (
              <EmptyState icon="📚" title="No classes yet" desc="Create your first class and share the code with students." action="Create a class" onAction={() => setShowCreate(true)} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
                {classes.map((cls, i) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    delay={i * 0.07}
                    pendingCount={requests.filter(r => r.class_id === cls.id && r.status === "pending").length}
                    onManage={() => openClass(cls)}
                    onDelete={() => handleDeleteClass(cls.id)}
                    onViewRequests={() => setTab("requests")}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Class Detail View ── */}
        {tab === "classes" && selectedClass && (
          <ClassDetailView
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
          />
        )}

        {/* ── Requests Tab ── */}
        {tab === "requests" && (
          <div className="animate-fade-up">
            <div className="mb-8">
              <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-1">Join Requests</h1>
              <p className="text-slate-600 text-[0.9rem]">{pendingRequests.length} pending</p>
            </div>

            {requests.length === 0 ? (
              <EmptyState icon="✅" title="No requests" desc="Student join requests will appear here for approval." />
            ) : (
              <div className="flex flex-col gap-6">
                {classes.map(cls => {
                  const classReqs = requests.filter(r => r.class_id === cls.id);
                  if (classReqs.length === 0) return null;
                  return (
                    <div key={cls.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-[#2563eb]" />
                        <h3 className="text-[1rem] font-bold text-slate-900">{cls.name}</h3>
                        <span className="text-[0.75rem] bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/30 rounded-full py-0.5 px-2">
                          {classReqs.filter(r => r.status === "pending").length} pending
                        </span>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {classReqs.map(req => (
                          <RequestRow key={req.id} req={req} loadingState={actionLoading[req.id]} onApprove={() => handleApprove(req.id)} onReject={() => handleReject(req.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Profile Tab ── */}
        {tab === "profile" && (
          <div className="animate-fade-up max-w-[500px]">
            <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-8">Profile</h1>
            <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="w-[72px] h-[72px] rounded-full bg-[#2563eb]/10 border-2 border-[#2563eb] flex items-center justify-center text-[1.75rem] text-[#2563eb] font-bold mb-5 font-[family-name:var(--font-geist-sans)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-[1.3rem] font-bold text-slate-900 tracking-tight mb-1">{user.name}</h2>
              <p className="text-slate-500 mb-3">{user.email}</p>
              <span className="inline-block text-[0.75rem] bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/30 rounded-full py-1 px-3 font-semibold uppercase tracking-widest">Teacher</span>
              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-md grid grid-cols-2 gap-4">
                <StatBox label="Classes" value={classes.length} />
                <StatBox label="Pending" value={pendingRequests.length} highlight={pendingRequests.length > 0} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="animate-fade-up w-full max-w-[460px] bg-white border border-slate-200 rounded-xl p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[1.3rem] font-bold text-slate-900">Create New Class</h2>
              <button onClick={() => setShowCreate(false)} className="bg-transparent border-none text-slate-400 hover:text-slate-600 cursor-pointer text-[1.3rem]">✕</button>
            </div>
            <form onSubmit={handleCreateClass}>
              <FieldLabel label="Class Name *" />
              <input id="input-class-name" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Physics — Grade 11" required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none mb-5 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10 transition-colors" />
              <FieldLabel label="Description" />
              <textarea id="input-class-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional — what's this class about?" rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none resize-y mb-6 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10 transition-colors" />
              {createError && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 mb-4 text-[0.88rem]">{createError}</div>}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-md border border-slate-300 bg-white text-slate-700 text-[0.9rem] font-medium cursor-pointer hover:bg-slate-50">Cancel</button>
                <button id="btn-submit-create" type="submit" disabled={creating || !newName.trim()}
                  className={`px-6 py-2.5 rounded-md bg-[#2563eb] text-white text-[0.9rem] font-semibold cursor-pointer ${creating || !newName.trim() ? "opacity-60 cursor-not-allowed" : "hover:bg-[#1d4ed8]"}`}>
                  {creating ? "Creating…" : "Create Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Class Detail View ─────────────────────────────────────────────────────────

function ClassDetailView({
  cls, students, studentsLoading, pendingRequests, removingId, actionLoading,
  onBack, onRemoveStudent, onApprove, onReject, onDeleteClass,
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
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  function copyCode() {
    navigator.clipboard.writeText(cls.join_code);
    setCopied("code"); setTimeout(() => setCopied(null), 2000);
  }
  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/join/${cls.join_code}`);
    setCopied("link"); setTimeout(() => setCopied(null), 2000);
  }

  const futureFeatures = [
    { icon: "📝", label: "Exams", desc: "Create and manage tests for this class" },
    { icon: "📚", label: "Syllabus", desc: "Upload and organise course material" },
    { icon: "📊", label: "Analytics", desc: "View student performance and progress" },
  ];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white text-slate-600 text-[0.85rem] cursor-pointer hover:bg-slate-50 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          All Classes
        </button>
        <div className="flex-1">
          <h1 className="text-[1.6rem] font-bold text-slate-900 leading-tight">{cls.name}</h1>
          {cls.description && <p className="text-slate-500 text-[0.88rem] mt-1">{cls.description}</p>}
        </div>
        <button onClick={onDeleteClass}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-red-200 bg-red-50 text-red-600 text-[0.82rem] font-semibold cursor-pointer hover:bg-red-100 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
          Delete Class
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left col — Students */}
        <div>
          {/* Students section */}
          <SectionHeader
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>}
            title="Students"
            badge={`${cls.student_count} enrolled`}
            badgeColor="text-[#2563eb]"
            badgeBg="bg-[#2563eb]/10 border-[#2563eb]/30"
          />

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6 shadow-sm">
            {studentsLoading ? (
              <div className="p-8 text-center">
                <div className="w-7 h-7 border-4 border-slate-200 border-t-[#2563eb] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500 text-[0.88rem]">Loading students…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-[2.5rem] mb-3">👤</div>
                <p className="text-slate-900 font-semibold mb-1">No students yet</p>
                <p className="text-slate-500 text-[0.85rem]">Share the class code below to invite students.</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    {["Student", "Email", "Joined", ""].map(h => (
                      <th key={h} className="p-3 px-4 text-left text-[0.75rem] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.student_id} className={`hover:bg-slate-50 transition-colors ${i < students.length - 1 ? "border-b border-slate-100" : ""}`}>
                      <td className="p-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#2563eb]/10 border border-[#2563eb]/30 flex items-center justify-center text-[0.85rem] font-bold text-[#2563eb] shrink-0 font-[family-name:var(--font-geist-sans)]">
                            {s.student_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-900 text-[0.9rem]">{s.student_name}</span>
                        </div>
                      </td>
                      <td className="p-3 px-4 text-slate-500 text-[0.84rem]">{s.student_email}</td>
                      <td className="p-3 px-4 text-slate-500 text-[0.8rem] whitespace-nowrap">
                        {new Date(s.joined_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="p-3 px-4 text-right">
                        <button
                          id={`btn-remove-${s.student_id}`}
                          onClick={() => onRemoveStudent(s.student_id)}
                          disabled={removingId === s.student_id}
                          title="Remove from class"
                          className={`px-3 py-1 rounded-md border border-red-200 bg-transparent text-red-600 text-[0.78rem] font-semibold hover:bg-red-50 transition-colors ${removingId === s.student_id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                          {removingId === s.student_id ? "…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending requests for this class */}
          {pendingRequests.length > 0 && (
            <>
              <SectionHeader
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                title="Pending Requests"
                badge={`${pendingRequests.length}`}
                badgeColor="text-amber-600"
                badgeBg="bg-amber-100 border-amber-200"
              />
              <div className="flex flex-col gap-2.5 mb-6">
                {pendingRequests.map(req => (
                  <RequestRow key={req.id} req={req} loadingState={actionLoading[req.id]} onApprove={() => onApprove(req.id)} onReject={() => onReject(req.id)} />
                ))}
              </div>
            </>
          )}

          {/* Coming soon features */}
          <SectionHeader
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
            title="Coming Soon"
            badge="In development"
            badgeColor="text-[#4ec078]"
            badgeBg="bg-[#4ec078]/10 border-[#4ec078]/30"
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {futureFeatures.map(f => (
              <div key={f.label} className="p-5 bg-white border-2 border-dashed border-slate-200 rounded-xl opacity-60">
                <div className="text-[1.6rem] mb-2">{f.icon}</div>
                <div className="font-bold text-slate-900 text-[0.95rem] mb-1">{f.label}</div>
                <div className="text-[0.8rem] text-slate-500">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right col — Class Info */}
        <div className="sticky top-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4 shadow-sm">
            <p className="text-[0.78rem] font-bold uppercase tracking-widest text-slate-400 mb-4">Class Info</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <InfoTile label="Students" value={String(cls.student_count)} />
              <InfoTile label="Pending" value={String(pendingRequests.length)} highlight={pendingRequests.length > 0} />
            </div>

            <p className="text-[0.78rem] font-bold uppercase tracking-widest text-slate-400 mb-2">Join Code</p>
            <div className="bg-slate-50 border border-slate-200 rounded-md py-2.5 px-3 flex items-center gap-2 mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-slate-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
              <span className="flex-1 font-mono text-[1rem] font-bold text-[#2563eb] tracking-widest">{cls.join_code}</span>
            </div>
            <div className="flex gap-2">
              <button id={`detail-copy-code-${cls.id}`} onClick={copyCode}
                className={`flex-1 py-2 px-1 rounded-md border text-[0.8rem] font-semibold transition-colors cursor-pointer ${copied === "code" ? "bg-[#2563eb]/10 border-[#2563eb]/30 text-[#2563eb]" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {copied === "code" ? "✓ Copied!" : "Copy Code"}
              </button>
              <button id={`detail-copy-link-${cls.id}`} onClick={copyLink}
                className={`flex-1 py-2 px-1 rounded-md border text-[0.8rem] font-semibold transition-colors cursor-pointer ${copied === "link" ? "bg-[#2563eb]/10 border-[#2563eb]/30 text-[#2563eb]" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {copied === "link" ? "✓ Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-md">
            <p className="text-[0.82rem] text-indigo-700/80 leading-relaxed">
              Share the code or invite link with students. Their requests will need your approval before they can join.
            </p>
          </div>
        </div>
      </div>
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
    <div className="animate-fade-up bg-white border border-slate-200 hover:border-[#2563eb]/40 hover:shadow-md transition-all duration-200 rounded-xl p-6 relative overflow-hidden group"
      style={{ animationDelay: `${delay}s` }}>
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-[#2563eb] to-[#4ec078] rounded-l-md" />
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
            <span className="flex-1 font-mono text-[0.88rem] font-bold text-[#2563eb] tracking-wider">{cls.join_code}</span>
            <button id={`btn-copy-code-${cls.id}`} onClick={copyCode} className={`border rounded-[5px] text-[0.68rem] font-semibold py-0.5 px-2 transition-colors cursor-pointer ${copied === "code" ? "bg-[#2563eb]/10 border-[#2563eb]/30 text-[#2563eb]" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {copied === "code" ? "✓" : "Copy"}
            </button>
            <button id={`btn-copy-link-${cls.id}`} onClick={copyLink} className={`border rounded-[5px] text-[0.68rem] font-semibold py-0.5 px-2 transition-colors cursor-pointer ${copied === "link" ? "bg-[#2563eb]/10 border-[#2563eb]/30 text-[#2563eb]" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
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
            className="w-full py-2 rounded-md border border-[#2563eb]/30 bg-[#2563eb]/5 text-[#2563eb] text-[0.85rem] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 hover:bg-[#2563eb]/10">
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
    pending: { bg: "bg-amber-50", text: "text-amber-600", label: "Pending" },
    approved: { bg: "bg-green-50", text: "text-green-600", label: "Approved" },
    rejected: { bg: "bg-red-50", text: "text-red-600", label: "Rejected" },
  };
  const st = statusColors[req.status as keyof typeof statusColors] ?? statusColors.pending;

  return (
    <div className="flex items-center gap-4 py-3 px-4 bg-white border border-slate-200 rounded-md shadow-sm">
      <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-[0.9rem] font-bold text-slate-500 font-[family-name:var(--font-geist-sans)] shrink-0">
        {req.student_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-900 text-[0.9rem] truncate">{req.student_name}</div>
        <div className="text-[0.78rem] text-slate-500 truncate">{req.student_email}</div>
      </div>
      <span className={`text-[0.75rem] ${st.bg} ${st.text} rounded-full py-0.5 px-2.5 font-semibold shrink-0`}>{st.label}</span>
      {req.status === "pending" && (
        <div className="flex gap-2 shrink-0">
          <button id={`btn-approve-${req.id}`} onClick={onApprove} disabled={!!loadingState}
            className={`py-1.5 px-3 rounded-md bg-green-600 text-white text-[0.8rem] font-semibold transition-colors ${loadingState ? "opacity-60 cursor-not-allowed" : "hover:bg-green-700 cursor-pointer"}`}>
            {loadingState === "approving" ? "…" : "Approve"}
          </button>
          <button id={`btn-reject-${req.id}`} onClick={onReject} disabled={!!loadingState}
            className={`py-1.5 px-3 rounded-md border border-red-200 bg-transparent text-red-600 text-[0.8rem] font-semibold transition-colors ${loadingState ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50 cursor-pointer"}`}>
            {loadingState === "rejecting" ? "…" : "Reject"}
          </button>
        </div>
      )}
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

function StatBox({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-[1.8rem] font-bold tracking-tight ${highlight ? "text-amber-500" : "text-[#2563eb]"}`}>{value}</div>
      <div className="text-[0.78rem] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function EmptyState({ icon, title, desc, action, onAction }: { icon: string; title: string; desc: string; action?: string; onAction?: () => void }) {
  return (
    <div className="text-center py-20 px-8 bg-white rounded-xl border border-dashed border-slate-300">
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-[1.3rem] font-bold text-slate-900 tracking-tight mb-2">{title}</h2>
      <p className="text-slate-600 text-[0.9rem] mb-6">{desc}</p>
      {action && onAction && <button onClick={onAction} className="px-6 py-2.5 rounded-md bg-[#2563eb] text-white text-[0.9rem] font-semibold hover:bg-[#1d4ed8] transition-colors cursor-pointer shadow-sm">{action}</button>}
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <label className="block text-[0.82rem] font-semibold text-slate-600 mb-2 uppercase tracking-widest">{label}</label>;
}
