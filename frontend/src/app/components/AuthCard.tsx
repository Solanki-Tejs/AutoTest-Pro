"use client";

import Link from "next/link";
import { ReactNode } from "react";

export type AuthRole = "teacher" | "student";

interface AuthCardProps {
  role: AuthRole;
  children: ReactNode;
}

const ROLE_CONFIG = {
  teacher: {
    color: "var(--teacher)",
    colorDim: "var(--teacher-dim)",
    colorGlow: "var(--teacher-glow)",
    label: "Educator Portal",
    tagline: "Design tests that inspire\nlearning and measure growth.",
    illustration: <TeacherIllustration />,
  },
  student: {
    color: "var(--student)",
    colorDim: "var(--student-dim)",
    colorGlow: "var(--student-glow)",
    label: "Student Portal",
    tagline: "Tackle every test with\nconfidence and clarity.",
    illustration: <StudentIllustration />,
  },
} as const;

export default function AuthCard({ role, children }: AuthCardProps) {
  const cfg = ROLE_CONFIG[role];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "stretch",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient background orb */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "10%",
          left: "20%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cfg.colorGlow} 0%, transparent 65%)`,
          filter: "blur(80px)",
          animation: "orb-pulse 9s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Left panel — brand / illustration */}
      <div
        style={{
          flex: "1 1 42%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "2.5rem",
          position: "relative",
          zIndex: 1,
          borderRight: "1px solid var(--border)",
        }}
        className="left-panel"
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: `linear-gradient(135deg, ${cfg.color} 0%, var(--accent) 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <span
            className="font-display"
            style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.025em" }}
          >
            AutoTest Pro
          </span>
        </Link>

        {/* Centre content */}
        <div style={{ textAlign: "center" }}>
          {/* Role badge */}
          <span
            style={{
              display: "inline-block",
              fontSize: "0.72rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: cfg.color,
              border: `1px solid ${cfg.color}`,
              borderRadius: 999,
              padding: "4px 14px",
              marginBottom: "2rem",
            }}
          >
            {cfg.label}
          </span>

          {/* Illustration */}
          <div style={{ marginBottom: "2rem" }}>{cfg.illustration}</div>

          {/* Tagline */}
          <h2
            className="font-display"
            style={{
              fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.025em",
              lineHeight: 1.3,
              whiteSpace: "pre-line",
            }}
          >
            {cfg.tagline}
          </h2>

          {/* Decorative dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: "1.5rem" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: i === 1 ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === 1 ? cfg.color : "var(--border-hover)",
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div style={{ display: "flex", gap: "2rem", justifyContent: "center" }}>
          {[
            { value: "10K+", label: "Tests created" },
            { value: "50K+", label: "Students served" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <p
                className="font-display"
                style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)" }}
              >
                {value}
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div
        style={{
          flex: "1 1 58%",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2.5rem",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
          }}
        >
          {children}
        </div>
      </div>

      {/* Mobile responsive style */}
      <style>{`
        @media (max-width: 768px) {
          .left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Illustrations ────────────────────────────────────────────────────────────

function TeacherIllustration() {
  return (
    <svg viewBox="0 0 280 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 280, margin: "0 auto", display: "block" }}>
      {/* Whiteboard */}
      <rect x="30" y="20" width="200" height="130" rx="8" fill="#0E1020" stroke="#1E2140" strokeWidth="2" />
      <rect x="42" y="32" width="176" height="106" rx="4" fill="#131629" />
      {/* Board content lines */}
      <line x1="58" y1="55" x2="160" y2="55" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="58" y1="72" x2="140" y2="72" stroke="#3D4168" strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="89" x2="150" y2="89" stroke="#3D4168" strokeWidth="2" strokeLinecap="round" />
      {/* Checkmark */}
      <circle cx="180" cy="80" r="20" fill="rgba(37,99,235,0.15)" stroke="#2563EB" strokeWidth="1.5" />
      <path d="M170 80l7 7 13-14" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Stand */}
      <line x1="130" y1="150" x2="100" y2="180" stroke="#1E2140" strokeWidth="3" strokeLinecap="round" />
      <line x1="130" y1="150" x2="160" y2="180" stroke="#1E2140" strokeWidth="3" strokeLinecap="round" />
      {/* Teacher figure (simplified) */}
      <circle cx="225" cy="90" r="14" fill="#131629" stroke="#2563EB" strokeWidth="1.5" />
      <path d="M211 130c0-11 6-20 14-20s14 9 14 20" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function StudentIllustration() {
  return (
    <svg viewBox="0 0 280 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 280, margin: "0 auto", display: "block" }}>
      {/* Desk */}
      <rect x="40" y="140" width="200" height="8" rx="4" fill="#1E2140" />
      {/* Laptop */}
      <rect x="80" y="80" width="120" height="76" rx="6" fill="#0E1020" stroke="#1E2140" strokeWidth="2" />
      <rect x="88" y="88" width="104" height="60" rx="3" fill="#131629" />
      {/* Screen content */}
      <rect x="96" y="96" width="60" height="5" rx="2.5" fill="#7C3AED" opacity="0.8" />
      <rect x="96" y="107" width="88" height="3" rx="1.5" fill="#3D4168" />
      <rect x="96" y="115" width="72" height="3" rx="1.5" fill="#3D4168" />
      <rect x="96" y="123" width="80" height="3" rx="1.5" fill="#3D4168" />
      {/* Checkmark on screen */}
      <circle cx="164" cy="111" r="12" fill="rgba(124,58,237,0.15)" stroke="#7C3AED" strokeWidth="1.5" />
      <path d="M158 111l4 4 8-8" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Laptop base */}
      <path d="M72 156h136l-8 0H80l-8 0z" stroke="#1E2140" strokeWidth="1.5" strokeLinecap="round" />
      {/* Student figure */}
      <circle cx="200" cy="105" r="14" fill="#131629" stroke="#7C3AED" strokeWidth="1.5" />
      {/* Graduation cap */}
      <rect x="191" y="91" width="18" height="5" rx="2" fill="#7C3AED" />
      <polygon points="200,86 207,91 193,91" fill="#7C3AED" />
      {/* Body */}
      <path d="M186 140c0-11 6-20 14-20s14 9 14 20" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
