"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import { previewClassByCode, requestToJoinByCode, ClassPreview, fetchMyMemberships, Membership } from "@/app/lib/classes";
import Link from "next/link";

export default function JoinByLinkPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string ?? "").toUpperCase();

  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  const user = typeof window !== "undefined" ? getStoredUser() : null;
  const token = typeof window !== "undefined" ? getStoredToken() : null;

  useEffect(() => {
    if (!code) return;
    if (!token || !user) {
      // Not logged in — redirect to student login, then come back
      router.push(`/student/login?redirect=/join/${code}`);
      return;
    }
    if (user.role !== "student") {
      setError("Only students can join classes via a code link.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [cls, mems] = await Promise.all([
          previewClassByCode(token!, code),
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
  }, [code, token, user, router]);

  const alreadyIn = preview ? memberships.find(m => m.class_id === preview.id) : undefined;

  async function handleJoin() {
    if (!token || !preview) return;
    setJoining(true);
    try {
      await requestToJoinByCode(token, code);
      setDone(true);
      setDoneMsg("Request sent! Your teacher will review and approve it.");
      setPreview(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setDoneMsg(msg);
      setDone(true);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">

      <div className="animate-fade-up w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-8 h-8 relative flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="AutoTest Pro Logo" className="w-full h-full object-contain" />
          </div>
          <span className="text-[1.15rem] font-bold text-slate-900 tracking-tight">AutoTest Pro</span>
        </div>

        <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
          {loading && (
            <div className="text-center py-8">
              <div className="w-9 h-9 border-4 border-slate-200 border-t-[#6c63ff] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-[0.9rem]">Looking up class…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-4">
              <div className="text-[2.5rem] mb-4">🔒</div>
              <h2 className="text-[1.2rem] font-bold text-slate-900 mb-2 tracking-tight">Invalid Link</h2>
              <p className="text-slate-500 text-[0.9rem] mb-6">{error}</p>
              <Link href="/student/dashboard" className="inline-block py-2.5 px-5 rounded-md bg-[#6c63ff] text-white no-underline text-[0.9rem] font-semibold hover:bg-[#5a52d5] transition-colors shadow-sm">Go to Dashboard</Link>
            </div>
          )}

          {done && (
            <div className="text-center py-4">
              <div className="text-[2.5rem] mb-4">✅</div>
              <h2 className="text-[1.2rem] font-bold text-slate-900 mb-2 tracking-tight">Done!</h2>
              <p className="text-slate-500 text-[0.9rem] mb-6">{doneMsg}</p>
              <Link href="/student/dashboard" className="inline-block py-2.5 px-5 rounded-md bg-[#6c63ff] text-white no-underline text-[0.9rem] font-semibold hover:bg-[#5a52d5] transition-colors shadow-sm">Go to My Classes</Link>
            </div>
          )}

          {preview && !done && (
            <>
              <p className="text-[0.78rem] font-bold tracking-widest uppercase text-[#6c63ff] mb-3">Class Invite</p>
              <h2 className="text-[1.4rem] font-bold text-slate-900 mb-1 tracking-tight">{preview.name}</h2>
              <p className={`text-slate-500 text-[0.88rem] ${preview.description ? "mb-2" : "mb-5"}`}>by {preview.teacher_name}</p>
              {preview.description && (
                <p className="text-slate-600 text-[0.88rem] leading-relaxed mb-5">{preview.description}</p>
              )}
              <div className="flex items-center gap-2 mb-6 py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-md">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                <span className="text-[0.82rem] text-slate-500">{preview.student_count} student{preview.student_count !== 1 ? "s" : ""} enrolled</span>
                <span className="ml-auto font-mono text-[0.82rem] text-[#6c63ff] font-bold tracking-widest">{code}</span>
              </div>

              {alreadyIn ? (
                <div className={`p-3 rounded-md text-[0.88rem] font-semibold text-center mb-4 border ${alreadyIn.status === "approved" ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  {alreadyIn.status === "approved" ? "✅ Already enrolled" : "⏳ Request already pending"}
                </div>
              ) : (
                <button
                  id="btn-join-link"
                  onClick={handleJoin}
                  disabled={joining}
                  className={`w-full py-3 rounded-md border-none text-white text-[0.95rem] font-semibold mb-3 transition-all duration-200 ${joining ? "bg-[#6c63ff]/60 cursor-not-allowed" : "bg-[#6c63ff] hover:bg-[#5a52d5] cursor-pointer shadow-sm"}`}
                >
                  {joining ? "Sending request…" : "Request to Join"}
                </button>
              )}

              <Link href="/student/dashboard" className="block text-center text-[0.85rem] text-slate-500 hover:text-slate-700 no-underline transition-colors mt-4">← Back to Dashboard</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
