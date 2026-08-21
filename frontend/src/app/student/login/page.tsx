"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import { loginUser } from "@/app/lib/auth";

export default function StudentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandColor = "#6c63ff";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(email.trim().toLowerCase(), password);
      router.push("/student/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard role="student">
      <div className="animate-fade-up">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.78rem] font-semibold tracking-widest uppercase text-[#6c63ff] mb-2.5">
            Student Portal
          </p>
          <h1 className="text-[1.9rem] font-bold text-slate-900 tracking-tight mb-1.5">
            Welcome back
          </h1>
          <p className="text-slate-600 text-[0.92rem]">
            Sign in to access your tests and track your progress.
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 px-4 py-3.5 bg-red-50 border border-red-200 rounded-md mb-6">
            <svg width="18" height="18" className="mt-px shrink-0" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[0.88rem] text-red-600">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4.5">
          {/* Email */}
          <div>
            <label htmlFor="student-login-email" className="block text-[0.83rem] font-medium text-slate-600 mb-1.5">Email address</label>
            <input
              id="student-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full h-12 px-4 bg-white border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-[#6c63ff] focus:ring-[3px] focus:ring-[#6c63ff]/10"
            />
          </div>

          {/* Password */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="student-login-password" className="block text-[0.83rem] font-medium text-slate-600">Password</label>
              <Link href="#" className="text-[0.8rem] text-[#6c63ff] no-underline hover:underline">Forgot password?</Link>
            </div>
            <div className="relative">
              <input
                id="student-login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 px-4 pr-12 bg-white border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-[#6c63ff] focus:ring-[3px] focus:ring-[#6c63ff]/10"
              />
              <button type="button" id="student-login-toggle-password" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center p-0 bg-transparent border-none cursor-pointer" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button id="student-login-submit" type="submit" disabled={loading} className={`mt-4 w-full h-12 flex items-center justify-center gap-2 rounded-md text-white text-[0.97rem] font-semibold transition-all duration-200 ${
              loading 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-[#6c63ff] hover:bg-[#5a52d5] cursor-pointer shadow-sm"
            }`}>
            {loading ? <><Spinner color="currentColor" /> Signing in…</> : <>Sign in<ArrowIcon /></>}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[0.8rem] text-slate-400">Don&apos;t have an account?</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Register link */}
        <Link href="/student/register" id="student-login-register-link" className="flex items-center justify-center gap-2 h-12 rounded-md border border-slate-200 text-slate-600 text-[0.92rem] font-medium transition-all duration-200 hover:border-[#6c63ff] hover:text-[#6c63ff] hover:bg-slate-50 no-underline">
          Create student account
        </Link>

        {/* Switch role */}
        <p className="text-center mt-5 text-[0.82rem] text-slate-400">
          Are you a teacher?{" "}
          <Link href="/teacher/login" className="text-[#6c63ff] font-medium no-underline hover:underline">Teacher login →</Link>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Shared micro-components & styles ────────────────────────────────────────

function Spinner({ color }: { color?: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color || "white"} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z" opacity="0.25" /><path d="M12 2a10 10 0 0110 10" /></svg>;
}
function EyeOn() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOff() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}
function ArrowIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
}
