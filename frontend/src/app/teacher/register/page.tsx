"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import { registerUser } from "@/app/lib/auth";

export default function TeacherRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const brandColor = "#2563eb";
  const strength = getPasswordStrength(password);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await registerUser(name.trim(), email.trim().toLowerCase(), password, "teacher");
      setSuccess(true);
      setTimeout(() => router.push("/teacher/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthCard role="teacher">
        <SuccessBanner
          message="Account created successfully!"
          subtext="Redirecting you to sign in…"
          color={brandColor}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard role="teacher">
      <div className="animate-fade-up">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.78rem] font-semibold tracking-widest uppercase text-[#2563eb] mb-2.5">
            Teacher Portal
          </p>
          <h1 className="text-[1.9rem] font-bold text-slate-900 tracking-tight mb-1.5">
            Create your account
          </h1>
          <p className="text-slate-600 text-[0.92rem]">
            Join AutoTest Pro and start building better assessments.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 px-4 py-3.5 bg-red-50 border border-red-200 rounded-md mb-6">
            <svg width="18" height="18" className="mt-px shrink-0" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[0.88rem] text-red-600">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4.5">
          {/* Full Name */}
          <div className="animate-fade-up stagger-1">
            <label htmlFor="teacher-reg-name" className="block text-[0.83rem] font-medium text-slate-600 mb-1.5">Full name</label>
            <input
              id="teacher-reg-name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
              className="w-full h-12 px-4 bg-white border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10"
            />
          </div>

          {/* Email */}
          <div className="animate-fade-up stagger-2 mt-4">
            <label htmlFor="teacher-reg-email" className="block text-[0.83rem] font-medium text-slate-600 mb-1.5">Email address</label>
            <input
              id="teacher-reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              className="w-full h-12 px-4 bg-white border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10"
            />
          </div>

          {/* Password */}
          <div className="animate-fade-up stagger-3 mt-4">
            <label htmlFor="teacher-reg-password" className="block text-[0.83rem] font-medium text-slate-600 mb-1.5">Password</label>
            <div className="relative">
              <input
                id="teacher-reg-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full h-12 px-4 pr-12 bg-white border border-slate-200 rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10"
              />
              <button type="button" id="teacher-reg-toggle-password" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center p-0 bg-transparent border-none cursor-pointer" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {/* Strength meter */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 h-1 rounded-full transition-colors duration-300" style={{
                      backgroundColor: i < strength.score ? strength.color : "#e2e8f0"
                    }} />
                  ))}
                </div>
                <span className="text-xs" style={{ color: strength.color }}>{strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="animate-fade-up stagger-4 mt-4">
            <label htmlFor="teacher-reg-confirm" className="block text-[0.83rem] font-medium text-slate-600 mb-1.5">Confirm password</label>
            <input
              id="teacher-reg-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`w-full h-12 px-4 bg-white border rounded-md text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:ring-[3px] ${
                confirm && confirm !== password 
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500/10" 
                  : "border-slate-200 focus:border-[#2563eb] focus:ring-[#2563eb]/10"
              }`}
            />
            {confirm && confirm !== password && (
              <p className="text-[0.78rem] text-red-500 mt-1.5">Passwords don&apos;t match.</p>
            )}
          </div>

          {/* Submit */}
          <button
            id="teacher-reg-submit"
            type="submit"
            disabled={loading}
            className={`animate-fade-up stagger-5 mt-4 w-full h-12 flex items-center justify-center gap-2 rounded-md text-white text-[0.97rem] font-semibold transition-all duration-200 ${
              loading 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-[#2563eb] hover:bg-[#1d4ed8] cursor-pointer shadow-sm"
            }`}
          >
            {loading ? (
              <><Spinner color="currentColor" /> Creating account…</>
            ) : (
              <>Create teacher account<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></>
            )}
          </button>
        </form>

        {/* Sign in link */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[0.8rem] text-slate-400">Already have an account?</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <Link href="/teacher/login" id="teacher-reg-login-link" className="flex items-center justify-center gap-2 h-12 rounded-md border border-slate-200 text-slate-600 text-[0.92rem] font-medium transition-all duration-200 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-slate-50 no-underline">
          Sign in to existing account
        </Link>

        <p className="text-center mt-5 text-[0.82rem] text-slate-400">
          Not a teacher?{" "}
          <Link href="/student/register" className="text-[#2563eb] font-medium no-underline hover:underline">
            Student sign-up →
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Password strength helper ─────────────────────────────────────────────────

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Too weak", color: "#EF4444" },
    { label: "Weak", color: "#F59E0B" },
    { label: "Fair", color: "#F59E0B" },
    { label: "Good", color: "#10B981" },
    { label: "Strong", color: "#10B981" },
  ];
  return { score, ...map[score] };
}

// ─── Shared styles ────────────────────────────────────────────────────────────

function Spinner({ color }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color || "white"} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
      <path d="M12 2a10 10 0 110 20A10 10 0 0112 2z" opacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  );
}

function EyeOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SuccessBanner({ message, subtext, color }: { message: string; subtext: string; color: string }) {
  return (
    <div className="animate-fade-up text-center p-8">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{
        backgroundColor: `${color}15`, border: `2px solid ${color}`
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{message}</h2>
      <p className="text-slate-600 text-[0.92rem]">{subtext}</p>
    </div>
  );
}
