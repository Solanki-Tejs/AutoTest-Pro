"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { previewClassByCode, requestToJoinByCode, ClassPreview, fetchMyMemberships, Membership } from "@/app/lib/classes";
import NotificationBell from "@/app/components/NotificationBell";
import Link from "next/link";
import { toast } from "sonner";

export default function JoinByLinkPage() {
  const params = useParams();
  const router = useRouter();
  const rawCode = (params?.code as string ?? "").toUpperCase();

  const [code, setCode] = useState(rawCode);
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);

  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const token = typeof window !== "undefined" ? getStoredToken() : null;

  useEffect(() => {
    if (!rawCode) return;
    if (!token || !user) {
      router.push(`/student/login?redirect=/join/${rawCode}`);
      return;
    }
    if (user.role !== "student") {
      setError("Only students can join classes via a code link.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const cleanCode = rawCode.replace(/-/g, "");
        const [cls, mems] = await Promise.all([
          previewClassByCode(token!, cleanCode),
          fetchMyMemberships(token!),
        ]);
        setPreview(cls);
        setMemberships(mems);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Invalid class code");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [rawCode, token, user, router]);

  const alreadyIn = preview ? memberships.find(m => m.class_id === preview.id) : undefined;
  const approvedClasses = memberships.filter(m => m.status === "approved");

  async function handleJoin() {
    if (!token || !preview) return;
    setJoining(true);
    try {
      const cleanTarget = (code || rawCode).replace(/-/g, "");
      await requestToJoinByCode(token, cleanTarget);
      setDone(true);
      toast.success("Enrollment request submitted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
      setError(msg);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen">
      {/* ── Fixed Left Sidebar (Stitch Design) ── */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-lowest border-r border-black/10 z-50 flex flex-col justify-between p-6">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-3 px-1 py-1">
            <img src="/logo_bg_removed.png" alt="AutoTest Pro Logo" className="w-9 h-9 object-contain shrink-0" />
            <div className="flex flex-col">
              <span className="font-label-caps text-xs tracking-[0.2em] font-bold text-brand-dark uppercase">AutoTest Pro</span>
              <span className="font-label-caps text-[10px] tracking-[0.16em] text-neutral-500 uppercase">Student Portal</span>
            </div>
          </div>

          <div className="p-3 bg-surface-container-low border border-black/10 flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-dark text-white flex items-center justify-center font-serif text-sm font-semibold">
              {user?.name?.charAt(0).toUpperCase() || "S"}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-label-caps text-xs font-bold text-brand-dark truncate tracking-wider uppercase">
                {user?.name || "Student"}
              </span>
              <span className="inline-flex items-center self-start px-1.5 py-0.5 bg-black text-white font-label-caps text-[9px] font-bold tracking-[0.18em] uppercase mt-1">
                STUDENT
              </span>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            <Link
              href="/student/dashboard"
              className="flex items-center justify-between px-3.5 py-3 transition-all bg-brand-dark text-white font-label-caps text-xs tracking-wider uppercase"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-brand-crimson">add_box</span>
                <span className="font-medium">Join a Class</span>
              </div>
              <span className="w-1.5 h-1.5 bg-brand-crimson"></span>
            </Link>

            <Link
              href="/student/dashboard"
              className="flex items-center justify-between px-3.5 py-3 text-neutral-600 hover:bg-neutral-100 hover:text-black transition-all border border-transparent font-label-caps text-xs tracking-wider uppercase"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px]">school</span>
                <span className="font-medium">My Classes</span>
              </div>
            </Link>

            <Link
              href="/student/dashboard"
              className="flex items-center justify-between px-3.5 py-3 text-neutral-600 hover:bg-neutral-100 hover:text-black transition-all border border-transparent font-label-caps text-xs tracking-wider uppercase"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px]">person</span>
                <span className="font-medium">Profile</span>
              </div>
            </Link>
          </nav>
        </div>

        <div className="pt-4 border-t border-black/10">
          <Link
            href="/student/login"
            className="flex items-center gap-3 px-3.5 py-2.5 text-neutral-600 hover:text-brand-crimson hover:bg-neutral-100 transition-all font-label-caps text-xs tracking-wider uppercase"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span className="font-medium">Sign Out</span>
          </Link>
        </div>
      </aside>

      {/* ── Fixed Top Header ── */}
      <header className="fixed top-0 left-64 right-0 h-16 bg-surface/90 backdrop-blur-md border-b border-black/10 z-40 flex items-center justify-end px-10 gap-3">
        <NotificationBell role="student" />
        <div className="w-9 h-9 bg-brand-dark flex items-center justify-center text-white font-serif text-sm font-semibold">
          {user?.name?.charAt(0).toUpperCase() || "S"}
        </div>
      </header>

      {/* ── Main Content Offset ── */}
      <div className="pl-64">
        <main className="w-full pt-16 bg-surface min-h-screen px-10 py-10">
          <div className="max-w-[1240px] mx-auto w-full">
            <div className="flex flex-col w-full">
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
                    Invite Link
                  </span>
                </div>
                <h1 className="font-serif text-4xl lg:text-5xl text-brand-dark tracking-tight font-normal">
                  Join a Class
                </h1>
                <p className="font-body-md text-base text-neutral-600 max-w-2xl leading-relaxed">
                  You are joining a course via direct invitation link. Confirm the course details below to submit your enrollment request.
                </p>
              </header>

              {/* Two-Column Balanced Workspace */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <section className="lg:col-span-7 flex flex-col gap-6">
                  <div className="bg-surface-container-lowest border border-black/10 p-8 sm:p-10 flex flex-col gap-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between border-b border-black/10 pb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-dark flex items-center justify-center text-brand-crimson">
                          <span className="material-symbols-outlined text-[22px]">vpn_key</span>
                        </div>
                        <div>
                          <span className="font-label-caps text-[11px] text-neutral-500 uppercase tracking-[0.18em] block">
                            Direct Key
                          </span>
                          <span className="font-serif text-2xl text-brand-dark font-normal">
                            Invitation Code: {rawCode}
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 border border-brand-crimson text-brand-crimson font-label-caps text-[10px] uppercase font-bold tracking-[0.16em]">
                        LINK
                      </span>
                    </div>

                    {loading && (
                      <div className="p-8 text-center font-label-caps text-xs text-neutral-500">
                        LOOKING UP INVITATION DETAILS...
                      </div>
                    )}

                    {error && (
                      <div className="border border-brand-crimson bg-neutral-50 p-6 text-center">
                        <h3 className="font-serif text-xl text-brand-dark mb-2">Invalid Invite Link</h3>
                        <p className="font-body-md text-xs text-neutral-600 mb-6">{error}</p>
                        <Link
                          href="/student/dashboard"
                          className="inline-block bg-brand-dark text-white font-label-caps text-xs tracking-wider uppercase font-bold py-3 px-6 hover:bg-brand-crimson transition-colors"
                        >
                          Return to Dashboard
                        </Link>
                      </div>
                    )}

                    {done && (
                      <div className="border border-black bg-neutral-50 p-8 text-center">
                        <span className="material-symbols-outlined text-brand-crimson text-[36px] mb-2">check_circle</span>
                        <h3 className="font-serif text-2xl text-brand-dark mb-2">Enrollment Request Submitted</h3>
                        <p className="font-body-md text-xs text-neutral-600 mb-6">
                          Your request has been sent to your instructor for approval.
                        </p>
                        <Link
                          href="/student/dashboard"
                          className="inline-block bg-brand-dark text-white font-label-caps text-xs tracking-wider uppercase font-bold py-3 px-6 hover:bg-brand-crimson transition-colors"
                        >
                          Go to My Classes →
                        </Link>
                      </div>
                    )}

                    {preview && !done && (
                      <div className="flex flex-col gap-6">
                        <div className="border border-brand-crimson bg-neutral-50 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-brand-crimson text-white flex items-center justify-center font-serif text-lg font-bold">
                                {preview.name.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h3 className="font-serif text-2xl text-brand-dark leading-tight">{preview.name}</h3>
                                <span className="font-label-caps text-xs text-neutral-600 tracking-wider">
                                  Instructor: Prof. {preview.teacher_name}
                                </span>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 bg-brand-dark text-white font-label-caps text-[10px] uppercase font-bold tracking-[0.18em]">
                              FOUND
                            </span>
                          </div>

                          {preview.description && (
                            <p className="font-body-md text-xs text-neutral-600 leading-relaxed mb-4">
                              {preview.description}
                            </p>
                          )}

                          <span className="font-label-caps text-xs text-neutral-500">
                            {preview.student_count} Students Currently Enrolled
                          </span>
                        </div>

                        {alreadyIn ? (
                          <div className="w-full bg-neutral-100 text-brand-dark font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-6 border border-black/20 text-center">
                            {alreadyIn.status === "approved" ? "✓ ALREADY ENROLLED IN CLASS" : "⏳ REQUEST PENDING APPROVAL"}
                          </div>
                        ) : (
                          <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="w-full bg-brand-dark text-white font-label-caps text-xs tracking-[0.2em] uppercase font-bold py-4 px-6 border border-brand-dark hover:bg-brand-crimson hover:border-brand-crimson transition-all flex items-center justify-center gap-3 cursor-pointer"
                          >
                            <span>{joining ? "ENROLLING..." : "CONFIRM & ENROLL IN CLASS"}</span>
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                          </button>
                        )}

                        <div className="flex justify-center">
                          <Link
                            href="/student/dashboard"
                            className="font-label-caps text-xs text-neutral-500 hover:text-black uppercase tracking-wider"
                          >
                            ← Return to Student Portal
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <aside className="lg:col-span-5 flex flex-col gap-6">
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
                        <div key={cls.id} className="bg-surface-container-low border border-black/10 p-4 flex flex-col gap-3">
                          <h4 className="font-serif text-lg text-brand-dark">{cls.class_name}</h4>
                          <span className="font-label-caps text-xs text-neutral-500">Prof. {cls.teacher_name}</span>
                        </div>
                      ))
                    )}
                  </div>

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
                          <span>Are class codes case-sensitive?</span>
                          <span className="material-symbols-outlined text-[18px] text-neutral-600 transition-transform group-open:rotate-180">
                            expand_more
                          </span>
                        </summary>
                        <div className="px-3.5 pb-3.5 font-body-md text-xs text-neutral-600 leading-relaxed border-t border-black/5 pt-2 mt-1">
                          No. Codes are normalized automatically by our system.
                        </div>
                      </details>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
