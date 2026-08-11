"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "@/app/components/AuthCard";
import { loginUser } from "@/app/lib/auth";

export default function TeacherLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const color = "var(--teacher)";
  const colorDim = "var(--teacher-dim)";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(email.trim().toLowerCase(), password);
      router.push("/teacher/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard role="teacher">
      <div className="animate-fade-up">
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <p
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: color,
              marginBottom: "0.6rem",
            }}
          >
            Teacher Portal
          </p>
          <h1
            className="font-display"
            style={{ fontSize: "1.9rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.025em", marginBottom: "0.4rem" }}
          >
            Welcome back
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Sign in to manage your tests and track students.
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "0.85rem 1rem",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.5rem",
            }}
          >
            <svg width="18" height="18" style={{ marginTop: 1, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: "0.88rem", color: "#EF4444" }}>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {/* Email */}
          <div>
            <label htmlFor="teacher-login-email" style={labelStyle}>Email address</label>
            <input
              id="teacher-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              style={inputStyle(color)}
              onFocus={(e) => applyInputFocus(e, color)}
              onBlur={(e) => applyInputBlur(e)}
            />
          </div>

          {/* Password */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
              <label htmlFor="teacher-login-password" style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
              <Link href="#" style={{ fontSize: "0.8rem", color: color, textDecoration: "none" }}>
                Forgot password?
              </Link>
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="teacher-login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle(color), paddingRight: "3rem" }}
                onFocus={(e) => applyInputFocus(e, color)}
                onBlur={(e) => applyInputBlur(e)}
              />
              <button
                type="button"
                id="teacher-login-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                style={eyeButtonStyle}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            id="teacher-login-submit"
            type="submit"
            disabled={loading}
            style={submitButtonStyle(color, loading)}
          >
            {loading ? (
              <>
                <Spinner color="white" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1.5rem 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>Don&apos;t have an account?</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Register link */}
        <Link
          href="/teacher/register"
          id="teacher-login-register-link"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            height: "48px",
            borderRadius: "var(--radius-md)",
            border: `1.5px solid var(--border)`,
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontSize: "0.92rem",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = color;
            (e.currentTarget as HTMLAnchorElement).style.color = color;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)";
          }}
        >
          Create teacher account
        </Link>

        {/* Switch role */}
        <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.82rem", color: "var(--text-faint)" }}>
          Not a teacher?{" "}
          <Link href="/student/login" style={{ color: "var(--student)", textDecoration: "none", fontWeight: 500 }}>
            Student login →
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.83rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: "0.45rem",
};

function inputStyle(accentColor: string): React.CSSProperties {
  return {
    width: "100%",
    height: "48px",
    padding: "0 1rem",
    background: "var(--bg-surface)",
    border: "1.5px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    fontFamily: "inherit",
    // data attr trick for dynamic color — instead we use JS handlers
    ["--focus-color" as string]: accentColor,
  };
}

function applyInputFocus(e: React.FocusEvent<HTMLInputElement>, color: string) {
  e.currentTarget.style.borderColor = color;
  e.currentTarget.style.boxShadow = `0 0 0 3px ${color}22`;
}

function applyInputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--border)";
  e.currentTarget.style.boxShadow = "none";
}

function submitButtonStyle(color: string, loading: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    height: "50px",
    borderRadius: "var(--radius-md)",
    background: loading ? "var(--bg-surface)" : color,
    border: "none",
    color: "white",
    fontSize: "0.97rem",
    fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    transition: "all 0.2s",
    fontFamily: "inherit",
    marginTop: "0.25rem",
  };
}

const eyeButtonStyle: React.CSSProperties = {
  position: "absolute",
  right: "1rem",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-muted)",
  display: "flex",
  alignItems: "center",
  padding: 0,
};

function Spinner({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
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
