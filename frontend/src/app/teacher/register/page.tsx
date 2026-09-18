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
          message="System Access Granted"
          subtext="Redirecting to authorization gateway..."
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard role="teacher">
      <div className="animate-fade-up">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-3xl text-graphite mb-4">
            Create Profile
          </h1>
          <p className="font-sans text-graphite/60 text-sm leading-relaxed max-w-sm">
            Join the platform and build better assessments.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 bg-red-50 border-l-2 border-red-500 mb-8 font-mono text-xs text-red-700">
            <span className="mt-0.5">ERR:</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          {/* Full Name */}
          <div className="animate-fade-up stagger-1">
            <label htmlFor="teacher-reg-name" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-2">
              Full name
            </label>
            <input
              id="teacher-reg-name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
              className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-teacher focus:ring-0 placeholder:text-graphite/30"
            />
          </div>

          {/* Email */}
          <div className="animate-fade-up stagger-2">
            <label htmlFor="teacher-reg-email" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-2">
              Email address
            </label>
            <input
              id="teacher-reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-teacher focus:ring-0 placeholder:text-graphite/30"
            />
          </div>

          {/* Password */}
          <div className="animate-fade-up stagger-3">
            <label htmlFor="teacher-reg-password" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="teacher-reg-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-teacher focus:ring-0 placeholder:text-graphite/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-graphite/40 hover:text-graphite transition-colors flex items-center p-2 bg-transparent border-none cursor-pointer"
              >
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {/* Strength meter */}
            {password && (
              <div className="mt-3">
                <div className="flex gap-1 mb-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 h-1 transition-colors duration-300" style={{
                      backgroundColor: i < strength.score ? strength.color : "var(--color-grid)"
                    }} />
                  ))}
                </div>
                <span className="font-mono text-[0.65rem] uppercase tracking-widest" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="animate-fade-up stagger-4">
            <label htmlFor="teacher-reg-confirm" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-2">
              Confirm password
            </label>
            <input
              id="teacher-reg-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`w-full h-12 px-0 bg-transparent border-b text-graphite font-sans text-base outline-none transition-colors focus:ring-0 placeholder:text-graphite/30 ${confirm && confirm !== password
                  ? "border-red-500 focus:border-red-600"
                  : "border-grid focus:border-teacher"
                }`}
            />
            {confirm && confirm !== password && (
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-red-500 mt-2">Mismatch detected</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`animate-fade-up stagger-5 mt-8 w-full h-14 flex items-center justify-between px-6 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${
              loading 
                ? "bg-grid text-graphite/40 cursor-not-allowed" 
                : "bg-graphite text-white hover:bg-teacher hover:pl-8 cursor-pointer"
            }`}
          >
            <span>{loading ? "Registering…" : "Register"}</span>
            {!loading && <ArrowIcon />}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px bg-grid" />
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-graphite/40">or</span>
          <div className="flex-1 h-px bg-grid" />
        </div>

        {/* Sign in link */}
        <Link 
          href="/teacher/login" 
          className="flex items-center justify-center h-14 border border-grid font-mono text-xs uppercase tracking-widest text-graphite hover:bg-teacher/5 hover:border-teacher hover:text-teacher transition-colors no-underline"
        >
          Access existing account
        </Link>
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

function EyeOn() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOff() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}
function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
}

function SuccessBanner({ message, subtext }: { message: string; subtext: string }) {
  return (
    <div className="animate-fade-up flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 border border-teacher flex items-center justify-center mb-6 text-teacher">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2 className="font-serif text-3xl text-graphite mb-2">{message}</h2>
      <p className="font-sans text-graphite/70 text-sm">{subtext}</p>
    </div>
  );
}
