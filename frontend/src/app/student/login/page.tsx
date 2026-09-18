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
        <div className="mb-12">
          <h1 className="font-serif text-3xl text-graphite mb-4">
            System Access
          </h1>
          <p className="font-sans text-graphite/60 text-sm leading-relaxed max-w-sm">
            Enter your credentials to access the student portal.
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 bg-red-50 border-l-2 border-red-500 mb-8 font-mono text-xs text-red-700">
            <span className="mt-0.5">ERR:</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          {/* Email */}
          <div>
            <label htmlFor="student-login-email" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-2">
              Email address
            </label>
            <input
              id="student-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-student focus:ring-0 placeholder:text-graphite/30"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <label htmlFor="student-login-password" className="block font-mono text-xs uppercase tracking-widest text-graphite/60">
                Password
              </label>
              <Link href="#" className="font-mono text-[0.65rem] uppercase tracking-widest text-student no-underline hover:underline">
                Forgot?
              </Link>
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
                className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-student focus:ring-0 placeholder:text-graphite/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-graphite/40 hover:text-graphite transition-colors flex items-center p-2 bg-transparent border-none cursor-pointer"
              >
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`mt-8 w-full h-14 flex items-center justify-between px-6 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${
              loading
                ? "bg-grid text-graphite/40 cursor-not-allowed"
                : "bg-graphite text-white hover:bg-student hover:pl-8 cursor-pointer"
            }`}
          >
            <span>{loading ? "Authenticating…" : "Authenticate"}</span>
            {!loading && <ArrowIcon />}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px bg-grid" />
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-graphite/40">or</span>
          <div className="flex-1 h-px bg-grid" />
        </div>

        {/* Register link */}
        <Link
          href="/student/register"
          className="flex items-center justify-center h-14 border border-grid font-mono text-xs uppercase tracking-widest text-graphite hover:bg-student/5 hover:border-student hover:text-student transition-colors no-underline"
        >
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}

// ─── Shared micro-components & styles ────────────────────────────────────────

function EyeOn() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOff() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}
function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
}
