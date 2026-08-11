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

  const color = "var(--teacher)";

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
          color={color}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard role="teacher">
      <div className="animate-fade-up">
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: "0.6rem" }}>
            Teacher Portal
          </p>
          <h1 className="font-display" style={{ fontSize: "1.9rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.025em", marginBottom: "0.4rem" }}>
            Create your account
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Join AutoTest Pro and start building better assessments.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" style={errorBoxStyle}>
            <svg width="18" height="18" style={{ marginTop: 1, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: "0.88rem", color: "#EF4444" }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {/* Full Name */}
          <div className="animate-fade-up stagger-1">
            <label htmlFor="teacher-reg-name" style={labelStyle}>Full name</label>
            <input
              id="teacher-reg-name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Jane Smith"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Email */}
          <div className="animate-fade-up stagger-2">
            <label htmlFor="teacher-reg-email" style={labelStyle}>Email address</label>
            <input
              id="teacher-reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {/* Password */}
          <div className="animate-fade-up stagger-3">
            <label htmlFor="teacher-reg-password" style={labelStyle}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="teacher-reg-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                style={{ ...inputStyle, paddingRight: "3rem" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button type="button" id="teacher-reg-toggle-password" onClick={() => setShowPassword(!showPassword)} style={eyeButtonStyle} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
            {/* Strength meter */}
            {password && (
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i < strength.score ? strength.color : "var(--border)",
                      transition: "background 0.3s",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: "0.75rem", color: strength.color }}>{strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="animate-fade-up stagger-4">
            <label htmlFor="teacher-reg-confirm" style={labelStyle}>Confirm password</label>
            <input
              id="teacher-reg-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              style={{
                ...inputStyle,
                borderColor: confirm && confirm !== password ? "var(--error)" : "var(--border)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`; }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = confirm && confirm !== password ? "var(--error)" : "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            {confirm && confirm !== password && (
              <p style={{ fontSize: "0.78rem", color: "var(--error)", marginTop: "0.3rem" }}>Passwords don&apos;t match.</p>
            )}
          </div>

          {/* Submit */}
          <button
            id="teacher-reg-submit"
            type="submit"
            disabled={loading}
            className="animate-fade-up stagger-5"
            style={submitBtn(color, loading)}
          >
            {loading ? (
              <><Spinner /> Creating account…</>
            ) : (
              <>Create teacher account<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></>
            )}
          </button>
        </form>

        {/* Sign in link */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1.5rem 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>Already have an account?</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <Link href="/teacher/login" id="teacher-reg-login-link" style={outlineLink(color)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = color; (e.currentTarget as HTMLAnchorElement).style.color = color; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)"; }}
        >
          Sign in to existing account
        </Link>

        <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.82rem", color: "var(--text-faint)" }}>
          Not a teacher?{" "}
          <Link href="/student/register" style={{ color: "var(--student)", textDecoration: "none", fontWeight: 500 }}>
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

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.83rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.45rem",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: "48px", padding: "0 1rem",
  background: "var(--bg-surface)", border: "1.5px solid var(--border)",
  borderRadius: "var(--radius-md)", color: "var(--text-primary)",
  fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", fontFamily: "inherit",
};
const eyeButtonStyle: React.CSSProperties = {
  position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", padding: 0,
};
const errorBoxStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: "10px",
  padding: "0.85rem 1rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "var(--radius-md)", marginBottom: "1.5rem",
};
function submitBtn(color: string, loading: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    height: "50px", borderRadius: "var(--radius-md)", background: loading ? "var(--bg-surface)" : color,
    border: "none", color: "white", fontSize: "0.97rem", fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "all 0.2s", fontFamily: "inherit", marginTop: "0.25rem",
  };
}
function outlineLink(color: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    height: "48px", borderRadius: "var(--radius-md)", border: "1.5px solid var(--border)",
    color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.92rem", fontWeight: 500, transition: "all 0.2s",
    ["--hover-color" as string]: color,
  };
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
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
    <div className="animate-fade-up" style={{ textAlign: "center", padding: "2rem" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: `${color}22`, border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 1.5rem",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2 className="font-display" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>{message}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>{subtext}</p>
    </div>
  );
}
