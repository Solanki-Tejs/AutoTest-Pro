"use client";

import Link from "next/link";
import { useState } from "react";

export default function LandingPage() {
  const [hovered, setHovered] = useState<"teacher" | "student" | null>(null);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: "2rem",
      }}
    >
      {/* Background orbs */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-15%",
          left: "5%",
          width: "520px",
          height: "520px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "orb-pulse 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "5%",
          width: "480px",
          height: "480px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "orb-pulse 10s ease-in-out infinite reverse",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div className="animate-fade-up" style={{ textAlign: "center", marginBottom: "3.5rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6C63FF 0%, #2563EB 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </div>
          <span
            className="font-display"
            style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            AutoTest Pro
          </span>
        </div>
        <h1
          className="font-display animate-fade-up stagger-1"
          style={{
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: "0.75rem",
          }}
        >
          Smart assessments,<br />
          <span
            style={{
              background: "linear-gradient(90deg, #6C63FF, #2563EB, #7C3AED)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            built for everyone.
          </span>
        </h1>
        <p
          className="animate-fade-up stagger-2"
          style={{ color: "var(--text-muted)", fontSize: "1.1rem", maxWidth: "480px", margin: "0 auto" }}
        >
          Choose your role to get started with AutoTest Pro.
        </p>
      </div>

      {/* Role cards */}
      <div
        className="animate-fade-up stagger-3"
        style={{
          display: "flex",
          gap: "1.5rem",
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
          maxWidth: "780px",
        }}
      >
        {/* Teacher Card */}
        <RoleCard
          role="teacher"
          hovered={hovered}
          setHovered={setHovered}
          href="/teacher/login"
          title="I'm a Teacher"
          description="Create and manage tests, track student performance, and build assessments effortlessly."
          icon={
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
          color="var(--teacher)"
          colorDim="var(--teacher-dim)"
          colorGlow="var(--teacher-glow)"
          badge="Educator"
        />

        {/* Student Card */}
        <RoleCard
          role="student"
          hovered={hovered}
          setHovered={setHovered}
          href="/student/login"
          title="I'm a Student"
          description="Take tests, review your results, and track your academic progress in one place."
          icon={
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          }
          color="var(--student)"
          colorDim="var(--student-dim)"
          colorGlow="var(--student-glow)"
          badge="Learner"
        />
      </div>

      {/* Footer */}
      <p
        className="animate-fade-up stagger-5"
        style={{ marginTop: "3rem", color: "var(--text-faint)", fontSize: "0.8rem" }}
      >
        © {new Date().getFullYear()} AutoTest Pro. All rights reserved.
      </p>
    </main>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────

interface RoleCardProps {
  role: "teacher" | "student";
  hovered: "teacher" | "student" | null;
  setHovered: (v: "teacher" | "student" | null) => void;
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  colorDim: string;
  colorGlow: string;
  badge: string;
}

function RoleCard({
  role, hovered, setHovered, href, title, description, icon, color, colorDim, colorGlow, badge,
}: RoleCardProps) {
  const isHovered = hovered === role;

  return (
    <Link
      href={href}
      id={`role-card-${role}`}
      onMouseEnter={() => setHovered(role)}
      onMouseLeave={() => setHovered(null)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "1.2rem",
        padding: "2rem",
        background: isHovered ? colorDim : "var(--bg-card)",
        border: `1.5px solid ${isHovered ? color : "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        textDecoration: "none",
        flex: "1 1 300px",
        maxWidth: "360px",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)",
        transform: isHovered ? "translateY(-6px)" : "translateY(0)",
        boxShadow: isHovered ? `0 20px 60px ${colorGlow}` : "var(--shadow-card)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow overlay */}
      {isHovered && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 30% 20%, ${colorGlow} 0%, transparent 60%)`,
            pointerEvents: "none",
            opacity: 0.4,
          }}
        />
      )}

      {/* Badge */}
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isHovered ? color : "var(--text-muted)",
          border: `1px solid ${isHovered ? color : "var(--border)"}`,
          borderRadius: 999,
          padding: "2px 10px",
          transition: "all 0.3s ease",
        }}
      >
        {badge}
      </span>

      {/* Icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-md)",
          background: isHovered ? color : "var(--bg-surface)",
          border: `1.5px solid ${isHovered ? color : "var(--border)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isHovered ? "white" : "var(--text-muted)",
          transition: "all 0.3s ease",
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div>
        <p
          className="font-display"
          style={{
            fontSize: "1.3rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "0.5rem",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </p>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          {description}
        </p>
      </div>

      {/* Arrow */}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: isHovered ? color : "var(--text-faint)",
          fontSize: "0.9rem",
          fontWeight: 600,
          transition: "all 0.3s ease",
          transform: isHovered ? "translateX(4px)" : "translateX(0)",
        }}
      >
        Sign in
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
