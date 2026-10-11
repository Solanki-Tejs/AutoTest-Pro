"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import { registerUser, sendOtp } from "@/app/lib/auth";
import { toast } from "sonner";

export default function TeacherRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter a valid academic email address.");
      return;
    }
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
      await sendOtp(email.trim().toLowerCase(), "register");
      toast.success("Security verification code dispatched to your email!");
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to dispatch verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setResending(true);
    try {
      await sendOtp(email.trim().toLowerCase(), "register");
      toast.success("Fresh code sent to your email!");
    } catch (err: any) {
      toast.error(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  }

  async function handleCompleteRegistration(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      await registerUser(name.trim(), email.trim().toLowerCase(), password, "teacher", otp.trim());
      setSuccess(true);
      setTimeout(() => router.push("/teacher/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthCard role="teacher">
        <SuccessBanner
          message="System Access Granted"
          subtext="Educator account verified. Redirecting to login..."
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard role="teacher">
      <div className="animate-fade-up">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif text-3xl text-graphite mb-3">
            {step === "form" ? "Create Profile" : "Verify Email"}
          </h1>
          <p className="font-sans text-graphite/60 text-sm leading-relaxed max-w-sm">
            {step === "form"
              ? "Join the platform and build better assessments."
              : `Enter the 6-digit authorization code dispatched to ${email}.`}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 bg-red-50 border-l-2 border-red-500 mb-8 font-mono text-xs text-red-700">
            <span className="mt-0.5">ERR:</span>
            <span>{error}</span>
          </div>
        )}

        {step === "form" ? (
          <form onSubmit={handleSendCode} noValidate className="flex flex-col gap-6">
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

              {/* Password strength bar */}
              {password && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-grid flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className="flex-1 h-full transition-colors duration-300"
                        style={{
                          backgroundColor:
                            strength.score >= level ? strength.color : "transparent",
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-[0.65rem] uppercase tracking-wider text-graphite/50">
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
                placeholder="Re-enter password"
                className="w-full h-12 px-0 bg-transparent border-b border-grid text-graphite font-sans text-base outline-none transition-colors focus:border-teacher focus:ring-0 placeholder:text-graphite/30"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`animate-fade-up stagger-5 mt-4 w-full h-14 flex items-center justify-between px-6 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${
                loading
                  ? "bg-grid text-graphite/40 cursor-not-allowed"
                  : "bg-graphite text-white hover:bg-teacher hover:pl-8 cursor-pointer"
              }`}
            >
              <span>{loading ? "Sending Code…" : "Verify & Continue"}</span>
              {!loading && <ArrowIcon />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCompleteRegistration} noValidate className="flex flex-col gap-6">
            <div>
              <label htmlFor="teacher-reg-otp" className="block font-mono text-xs uppercase tracking-widest text-graphite/60 mb-3">
                6-Digit Authorization Code
              </label>
              <input
                id="teacher-reg-otp"
                type="text"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
                className="w-full h-14 bg-surface border-2 border-black text-center font-mono text-2xl tracking-[0.3em] font-bold outline-none focus:border-teacher"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="text-graphite/60 hover:text-graphite underline cursor-pointer"
              >
                ← Edit details
              </button>
              <button
                type="button"
                disabled={resending}
                onClick={handleResendCode}
                className="text-teacher hover:underline cursor-pointer disabled:opacity-50"
              >
                {resending ? "Sending..." : "Resend Code"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`mt-4 w-full h-14 flex items-center justify-between px-6 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${
                loading
                  ? "bg-grid text-graphite/40 cursor-not-allowed"
                  : "bg-graphite text-white hover:bg-teacher hover:pl-8 cursor-pointer"
              }`}
            >
              <span>{loading ? "Verifying…" : "Complete Registration"}</span>
              {!loading && <ArrowIcon />}
            </button>
          </form>
        )}

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
