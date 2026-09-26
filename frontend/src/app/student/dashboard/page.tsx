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
import { Exam, getStudentExams } from "@/app/lib/exams";
import { useRouter } from "next/navigation";

type Tab = "join" | "my-classes" | "profile";

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("join");
  const [selectedClass, setSelectedClass] = useState<Membership | null>(null);

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  // Join by code state
  const [codeInput, setCodeInput] = useState("");
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinResult, setJoinResult] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

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

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !codeInput.trim()) return;
    setPreviewLoading(true);
    setPreviewError("");
    setPreview(null);
    setJoinResult(null);
    try {
      const cls = await previewClassByCode(token, codeInput.trim());
      setPreview(cls);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Failed to look up code");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleJoin() {
    if (!token || !preview) return;
    setJoinLoading(true);
    setJoinResult(null);
    try {
      await requestToJoinByCode(token, codeInput.trim());
      setJoinResult({ msg: "Join request sent! Waiting for teacher approval.", type: "success" });
      setPreview(null);
      setCodeInput("");
      loadMemberships();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      const isInfo = msg.toLowerCase().includes("already");
      setJoinResult({ msg, type: isInfo ? "info" : "error" });
    } finally {
      setJoinLoading(false);
    }
  }

  function handleLogout() {
    logout();
    router.push("/student/login");
  }

  if (!user) return null;

  const approvedClasses = memberships.filter(m => m.status === "approved");
  const pendingClasses = memberships.filter(m => m.status === "pending");
  const rejectedClasses = memberships.filter(m => m.status === "rejected");

  // Check if already in the previewed class
  const alreadyInClass = preview
    ? memberships.find(m => m.class_id === preview.id)
    : undefined;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Sidebar ── */}
      <aside className="w-[260px] min-h-screen bg-white border-r border-slate-200 flex flex-col py-6 px-4 fixed top-0 left-0 bottom-0 z-10">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-10">
          <div className="w-8 h-8 relative flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="AutoTest Pro Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-[1.05rem] font-bold text-slate-900 tracking-tight">AutoTest Pro</span>
        </div>

        {/* User */}
        <div className="p-3 bg-slate-50 rounded-md border border-slate-200 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6c63ff]/10 border-2 border-[#6c63ff] flex items-center justify-center text-[1rem] text-[#6c63ff] font-bold shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <div className="text-[0.88rem] font-semibold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">{user.name}</div>
            <div className="text-[0.72rem] text-[#6c63ff] font-semibold uppercase tracking-widest">Student</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1">
          {(["join", "my-classes", "profile"] as Tab[]).map(t => {
            const active = tab === t;
            const labels: Record<Tab, string> = { join: "Join a Class", "my-classes": "My Classes", profile: "Profile" };
            const icons: Record<Tab, React.ReactNode> = {
              join: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>,
              "my-classes": <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>,
              profile: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
            };
            return (
              <button
                key={t}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-md border-none text-[0.88rem] mb-1 transition-all duration-200 text-left cursor-pointer ${
                  active ? "bg-[#6c63ff]/10 text-[#6c63ff] font-semibold" : "bg-transparent text-slate-500 font-normal hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {icons[t]}
                {labels[t]}
                {t === "my-classes" && approvedClasses.length > 0 && (
                  <span className="ml-auto bg-[#6c63ff] text-white rounded-full text-[0.7rem] font-bold py-0.5 px-2">{approvedClasses.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          id="btn-logout"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-md border-none bg-transparent text-slate-500 text-[0.88rem] cursor-pointer transition-all duration-200 mt-2 hover:bg-slate-50 hover:text-slate-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Sign out
        </button>
      </aside>

      {/* ── Main Content ── */}
      <div className="p-8 min-h-screen relative z-[1]" style={{ marginLeft: "260px" }}>

        {/* ── Join by Code Tab ── */}
        {tab === "join" && (
          <div className="animate-fade-up max-w-[520px]">
            <div className="mb-8">
              <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-1">Join a Class</h1>
              <p className="text-slate-600 text-[0.9rem]">Enter the class code your teacher shared with you.</p>
            </div>

            {/* Code input form */}
            <div className="p-8 bg-white border border-slate-200 rounded-xl mb-6 shadow-sm">
              <form onSubmit={handlePreview}>
                <label className="block text-[0.82rem] font-semibold text-slate-600 mb-2 uppercase tracking-widest">Class Code</label>
                <div className="flex gap-3">
                  <input
                    id="input-class-code"
                    type="text"
                    value={codeInput}
                    onChange={e => {
                      setCodeInput(e.target.value.toUpperCase());
                      setPreview(null);
                      setPreviewError("");
                      setJoinResult(null);
                    }}
                    placeholder="e.g. ABC12345"
                    maxLength={20}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-md text-slate-900 font-mono text-[1.05rem] font-bold tracking-[0.12em] outline-none uppercase transition-colors focus:border-[#6c63ff] focus:ring-[3px] focus:ring-[#6c63ff]/10"
                  />
                  <button
                    id="btn-lookup-code"
                    type="submit"
                    disabled={previewLoading || !codeInput.trim()}
                    className={`px-5 py-3 rounded-md border-none text-white text-[0.9rem] font-semibold transition-all duration-200 whitespace-nowrap ${
                      previewLoading || !codeInput.trim() ? "bg-[#6c63ff]/50 cursor-not-allowed" : "bg-[#6c63ff] hover:bg-[#5a52d5] cursor-pointer shadow-sm"
                    }`}
                  >
                    {previewLoading ? "Looking up…" : "Look up"}
                  </button>
                </div>

                {previewError && (
                  <div className="mt-3 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-md text-red-600 text-[0.85rem]">
                    {previewError}
                  </div>
                )}
              </form>

              {/* Join result message */}
              {joinResult && (
                <div className={`mt-4 px-4 py-3 border rounded-md text-[0.88rem] font-medium ${
                  joinResult.type === "success" ? "bg-green-50 border-green-200 text-green-700" :
                  joinResult.type === "info" ? "bg-indigo-50 border-indigo-200 text-indigo-700" :
                  "bg-red-50 border-red-200 text-red-600"
                }`}>
                  {joinResult.type === "success" && "✅ "}{joinResult.msg}
                </div>
              )}
            </div>

            {/* Class Preview Card */}
            {preview && (
              <div className="animate-fade-up p-6 bg-white border-[1.5px] border-[#6c63ff] rounded-xl relative overflow-hidden shadow-sm">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-[#6c63ff] to-[#4ec078] rounded-l-md" />
                <div className="pl-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[0.75rem] font-bold uppercase tracking-widest text-[#6c63ff]">Class Found</span>
                  </div>
                  <h2 className="text-[1.25rem] font-bold text-slate-900 tracking-tight mb-1">{preview.name}</h2>
                  <p className={`text-[0.85rem] text-slate-500 ${preview.description ? "mb-2" : "mb-4"}`}>by {preview.teacher_name}</p>
                  {preview.description && (
                    <p className="text-slate-600 text-[0.88rem] leading-relaxed mb-4">{preview.description}</p>
                  )}
                  <div className="flex items-center gap-2 mb-5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                    <span className="text-[0.8rem] text-slate-500">{preview.student_count} student{preview.student_count !== 1 ? "s" : ""} enrolled</span>
                  </div>

                  {alreadyInClass ? (
                    <div className={`py-2.5 px-4 border rounded-md text-[0.85rem] font-semibold text-center ${
                      alreadyInClass.status === "approved" ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}>
                      {alreadyInClass.status === "approved" ? "✅ You are already enrolled in this class" : "⏳ Your join request is pending approval"}
                    </div>
                  ) : (
                    <button
                      id="btn-confirm-join"
                      onClick={handleJoin}
                      disabled={joinLoading}
                      className={`w-full py-3 rounded-md border-none text-white text-[0.95rem] font-semibold transition-all duration-200 ${
                        joinLoading ? "bg-[#6c63ff]/60 cursor-not-allowed" : "bg-[#6c63ff] hover:bg-[#5a52d5] cursor-pointer shadow-sm"
                      }`}
                    >
                      {joinLoading ? "Sending request…" : "Request to Join"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Helper hint */}
            {!preview && !joinResult && (
              <div className="flex gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#4ec078]"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <p className="text-[0.85rem] text-slate-600 leading-relaxed">
                  Ask your teacher for the class code or use the invite link they shared. Codes are case-insensitive.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── My Classes Tab ── */}
        {tab === "my-classes" && selectedClass ? (
          <StudentClassDetailView m={selectedClass} onBack={() => setSelectedClass(null)} token={token!} />
        ) : tab === "my-classes" && (
          <div className="animate-fade-up">
            <div className="mb-8">
              <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-1">My Classes</h1>
              <p className="text-slate-600 text-[0.9rem]">{approvedClasses.length} active · {pendingClasses.length} pending</p>
            </div>

            {memLoading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                {[1, 2, 3].map(i => <div key={i} className="h-[160px] bg-white rounded-xl border border-slate-200 animate-pulse shadow-sm" />)}
              </div>
            ) : memberships.length === 0 ? (
              <div className="text-center py-20 px-8 bg-white rounded-xl border border-dashed border-slate-300">
                <div className="text-5xl mb-4">📖</div>
                <h2 className="text-[1.3rem] font-bold text-slate-900 tracking-tight mb-2">No classes yet</h2>
                <p className="text-slate-600 text-[0.9rem] mb-6">Enter a class code from your teacher to get started.</p>
                <button onClick={() => setTab("join")} className="px-6 py-2.5 rounded-md bg-[#6c63ff] text-white text-[0.9rem] font-semibold hover:bg-[#5a52d5] transition-colors cursor-pointer shadow-sm">Join a class</button>
              </div>
            ) : (
              <div>
                {approvedClasses.length > 0 && (
                  <>
                    <SectionLabel label="Enrolled" color="text-green-600" bg="bg-green-600" />
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5 mb-8">
                      {approvedClasses.map((m, i) => <MembershipCard key={m.id} m={m} delay={i * 0.07} onSelect={() => setSelectedClass(m)} />)}
                    </div>
                  </>
                )}
                {pendingClasses.length > 0 && (
                  <>
                    <SectionLabel label="Awaiting Approval" color="text-amber-600" bg="bg-amber-600" />
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5 mb-8">
                      {pendingClasses.map((m, i) => <MembershipCard key={m.id} m={m} delay={i * 0.07} />)}
                    </div>
                  </>
                )}
                {rejectedClasses.length > 0 && (
                  <>
                    <SectionLabel label="Declined" color="text-red-600" bg="bg-red-600" />
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                      {rejectedClasses.map((m, i) => <MembershipCard key={m.id} m={m} delay={i * 0.07} />)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Profile Tab ── */}
        {tab === "profile" && (
          <div className="animate-fade-up max-w-[500px]">
            <h1 className="text-[1.8rem] font-bold text-slate-900 tracking-tight mb-8">Profile</h1>
            <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="w-[72px] h-[72px] rounded-full bg-[#6c63ff]/10 border-2 border-[#6c63ff] flex items-center justify-center text-[1.75rem] text-[#6c63ff] font-bold mb-5 font-[family-name:var(--font-geist-sans)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-[1.3rem] font-bold text-slate-900 tracking-tight mb-1">{user.name}</h2>
              <p className="text-slate-500 mb-3">{user.email}</p>
              <span className="inline-block text-[0.75rem] bg-[#6c63ff]/10 text-[#6c63ff] border border-[#6c63ff]/30 rounded-full py-1 px-3 font-semibold uppercase tracking-widest">Student</span>
              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-md grid grid-cols-3 gap-4">
                <StatBlock label="Enrolled" value={approvedClasses.length} color="text-green-600" />
                <StatBlock label="Pending" value={pendingClasses.length} color="text-amber-600" />
                <StatBlock label="Declined" value={rejectedClasses.length} color="text-red-600" />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-1 h-[18px] rounded-full ${bg}`} />
      <span className={`text-[0.82rem] font-bold uppercase tracking-widest ${color}`}>{label}</span>
    </div>
  );
}

function MembershipCard({ m, delay, onSelect }: { m: Membership; delay: number; onSelect?: () => void }) {
  const isApproved = m.status === "approved";
  const isPending = m.status === "pending";
  const statusColors = {
    bg: isApproved ? "bg-green-600" : isPending ? "bg-amber-500" : "bg-red-500",
    badgeBg: isApproved ? "bg-green-50" : isPending ? "bg-amber-50" : "bg-red-50",
    badgeText: isApproved ? "text-green-700" : isPending ? "text-amber-700" : "text-red-700",
    badgeBorder: isApproved ? "border-green-200" : isPending ? "border-amber-200" : "border-red-200",
  };
  const statusLabel = isApproved ? "Enrolled" : isPending ? "Pending Approval" : "Declined";

  return (
    <div
      onClick={isApproved && onSelect ? onSelect : undefined}
      className={`animate-fade-up bg-white border border-slate-200 rounded-xl p-6 relative overflow-hidden shadow-sm transition-all duration-200 ${
        isApproved && onSelect ? "hover:shadow-md hover:border-green-300 cursor-pointer" : "hover:shadow-md"
      }`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className={`absolute top-0 left-0 bottom-0 w-1 ${statusColors.bg} rounded-l-md`} />
      <div className="pl-2">
        <h3 className="text-[1.05rem] font-bold text-slate-900 tracking-tight mb-1">{m.class_name}</h3>
        <p className="text-[0.8rem] text-slate-500 mb-3">by {m.teacher_name}</p>
        {m.class_description && (
          <p className="text-slate-600 text-[0.84rem] mb-3 leading-relaxed line-clamp-2">{m.class_description}</p>
        )}
        <span className={`text-[0.75rem] py-0.5 px-2.5 rounded-full font-semibold border ${statusColors.badgeBg} ${statusColors.badgeText} ${statusColors.badgeBorder}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-[1.8rem] font-bold tracking-tight ${color}`}>{value}</div>
      <div className="text-[0.75rem] text-slate-500 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StudentClassDetailView({ m, onBack, token }: { m: Membership; onBack: () => void; token: string }) {
  const [activeTab, setActiveTab] = useState<"syllabus" | "exams">("syllabus");
  const [syllabusList, setSyllabusList] = useState<SyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [examList, setExamList] = useState<Exam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);

  const loadSyllabus = useCallback(() => {
    setLoading(true);
    fetchSyllabusList(m.class_id)
      .then(setSyllabusList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [m.class_id]);

  const loadExams = useCallback(() => {
    setExamsLoading(true);
    getStudentExams(token, m.class_id)
      .then(setExamList)
      .catch(() => {})
      .finally(() => setExamsLoading(false));
  }, [token, m.class_id]);

  useEffect(() => {
    loadSyllabus();
    loadExams();
  }, [loadSyllabus, loadExams]);

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-green-500 to-green-400" />
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[2rem] font-bold text-slate-900 tracking-tight leading-tight mb-2">
              {m.class_name}
            </h1>
            <p className="text-slate-500 text-[1.1rem]">by {m.teacher_name}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("syllabus")}
          className={`py-3 px-1 font-bold text-[0.95rem] border-b-2 transition-colors ${
            activeTab === "syllabus" ? "border-green-500 text-green-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Syllabus
        </button>
        <button
          onClick={() => setActiveTab("exams")}
          className={`py-3 px-1 font-bold text-[0.95rem] border-b-2 transition-colors ${
            activeTab === "exams" ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Exams
        </button>
      </div>

      {activeTab === "syllabus" && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={loadSyllabus}
              disabled={loading}
              className={`p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Refresh Syllabus"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
              <div className="w-7 h-7 border-4 border-slate-200 border-t-green-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-[0.88rem]">Loading syllabus…</p>
            </div>
          ) : syllabusList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="text-[3rem] mb-3">📚</div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No syllabus yet</h3>
              <p className="text-slate-500 text-[0.85rem]">
                The teacher has not uploaded any syllabus material for this class yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {syllabusList.map((s) => {
                const isPdf = s.file_ref.toLowerCase().endsWith('.pdf');
                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 ${isPdf ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
                        {isPdf ? '📕' : '📄'}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-[0.95rem] mb-0.5">{s.title}</h4>
                        <p className="text-slate-500 text-[0.8rem] mb-1 font-mono">{s.file_ref.split('/').pop()}</p>
                        <p className="text-slate-400 text-[0.75rem]">
                          Uploaded {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {!isPdf && <p className="text-amber-600 text-[0.75rem] font-semibold mt-1">Unsupported file format</p>}
                        {s.status && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[0.7rem] px-2 py-0.5 rounded-full font-semibold ${s.status === 'READY' ? 'bg-green-100 text-green-700' : s.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                              {s.status === 'READY' ? 'Processed' : s.status === 'FAILED' ? 'Failed' : `Processing: ${s.stage?.replace('_', ' ') || 'Starting'}`}
                            </span>
                            {s.error && <span className="text-red-500 text-[0.75rem] max-w-[200px] truncate" title={s.error}>{s.error}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        onClick={() => viewSyllabus(s.id)}
                        disabled={!isPdf}
                        className={`px-3.5 py-1.5 rounded-md border text-[0.8rem] font-semibold transition-colors ${
                          isPdf 
                            ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300' 
                            : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        View PDF
                      </button>
                      <button
                        onClick={() => downloadSyllabus(s.id, s.title)}
                        className="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-[0.8rem] font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "exams" && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={loadExams}
              disabled={examsLoading}
              className={`p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${examsLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Refresh Exams"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={examsLoading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>

          {examsLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
              <div className="w-7 h-7 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-[0.88rem]">Loading exams…</p>
            </div>
          ) : examList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="text-[3rem] mb-3">📝</div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No exams available</h3>
              <p className="text-slate-500 text-[0.85rem]">
                There are no published exams for this class at the moment.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examList.map((exam) => {
                const now = new Date();
                const startTime = exam.start_time ? new Date(exam.start_time) : null;
                const endTime = exam.end_time ? new Date(exam.end_time) : null;
                
                let statusInfo = { label: "Available", color: "bg-blue-100 text-blue-700", actionText: "Take Exam", actionDisabled: true };
                
                if (startTime && endTime) {
                  if (now < startTime) {
                    statusInfo = { label: "Upcoming", color: "bg-indigo-100 text-indigo-700", actionText: "Starts soon", actionDisabled: true };
                  } else if (now > endTime) {
                    statusInfo = { label: "Ended", color: "bg-slate-100 text-slate-600", actionText: "Missed", actionDisabled: true };
                  } else {
                    statusInfo = { label: "Active", color: "bg-green-100 text-green-700", actionText: "Take Exam", actionDisabled: false }; // Action still disabled functionally for now
                  }
                }

                return (
                  <div key={exam.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-slate-900 text-lg line-clamp-2 pr-4">{exam.title}</h4>
                      <span className={`text-[0.7rem] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.85rem] text-slate-600 mb-4">
                      <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">Marks:</span> {exam.total_marks}</div>
                      <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">Duration:</span> {exam.duration_minutes} min</div>
                      <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">Level:</span> <span className="capitalize">{exam.difficulty}</span></div>
                    </div>
                    
                    {(startTime && endTime) && (
                      <div className="bg-slate-50 rounded-lg p-3 text-[0.8rem] text-slate-600 mb-5 border border-slate-100 flex-grow">
                        <div className="flex items-center gap-2 mb-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          <span className="font-medium text-slate-700">Window:</span>
                        </div>
                        <div className="pl-6 space-y-0.5">
                          <div><span className="text-slate-400">Opens:</span> {startTime.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                          <div><span className="text-slate-400">Closes:</span> {endTime.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                        </div>
                      </div>
                    )}
                    
                    <button 
                      disabled={true} 
                      className={`w-full py-2.5 rounded-lg font-bold text-[0.9rem] transition-colors mt-auto ${
                        statusInfo.actionDisabled === false // Currently always false as we haven't implemented it
                          ? "bg-[#2563eb] hover:bg-[#1d4ed8] text-white cursor-pointer"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                      }`}
                    >
                      {statusInfo.actionText} (Coming Soon)
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
