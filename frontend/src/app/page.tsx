"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function LandingPage() {
  const [hovered, setHovered] = useState<"teacher" | "student" | null>(null);

  return (
    <main className="min-h-screen flex flex-col bg-paper relative overflow-hidden">
      {/* Top Border / Nav Bar placeholder */}
      <div className="h-16 border-b border-grid flex items-center justify-between px-8 bg-surface">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="AutoTest Pro Logo"
            width={24}
            height={24}
            className="object-contain"
          />
          <span className="font-mono text-sm tracking-wider uppercase text-graphite font-semibold">
            AutoTest Pro
          </span>
        </div>
        <div className="font-mono text-xs text-graphite/60 uppercase tracking-widest hidden sm:block">
          Assessment Platform
        </div>
      </div>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-16 text-center border-b border-grid">
        <h1 className="animate-fade-up font-serif text-[clamp(2.5rem,8vw,5.5rem)] leading-[1.05] tracking-tight text-graphite max-w-4xl mx-auto mb-6">
          The standard for <br /> smart assessments.
        </h1>
        <p className="animate-fade-up stagger-1 text-graphite/70 text-lg sm:text-xl max-w-2xl mx-auto font-sans">
          A definitive platform for educators to build rigorous tests and students to prove their knowledge. Select your role to begin.
        </p>
      </div>

      {/* Split Grid for Roles */}
      <div className="flex flex-col md:flex-row w-full flex-1">
        {/* Teacher Quadrant */}
        <RoleQuadrant
          role="teacher"
          hovered={hovered}
          setHovered={setHovered}
          href="/teacher/login"
          title="Educator Portal"
          description="Design assessments, manage classes, and analyze performance data with precision."
          number="01."
          brandColor="var(--color-teacher)"
          isLeft={true}
        />

        {/* Student Quadrant */}
        <RoleQuadrant
          role="student"
          hovered={hovered}
          setHovered={setHovered}
          href="/student/login"
          title="Student Portal"
          description="Access assignments, submit answers, and track your academic progress over time."
          number="02."
          brandColor="var(--color-student)"
          isLeft={false}
        />
      </div>

      {/* Footer bar */}
      <div className="h-12 border-t border-grid flex items-center justify-between px-8 bg-surface text-xs font-mono uppercase tracking-widest text-graphite/50">
        <span>© {new Date().getFullYear()}</span>
        <span>ID: AT-PRO-SYS</span>
      </div>
    </main>
  );
}

// ─── Role Quadrant ────────────────────────────────────────────────────────────

interface RoleQuadrantProps {
  role: "teacher" | "student";
  hovered: "teacher" | "student" | null;
  setHovered: (v: "teacher" | "student" | null) => void;
  href: string;
  title: string;
  description: string;
  number: string;
  brandColor: string;
  isLeft: boolean;
}

function RoleQuadrant({
  role, hovered, setHovered, href, title, description, number, brandColor, isLeft
}: RoleQuadrantProps) {
  const isHovered = hovered === role;

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(role)}
      onMouseLeave={() => setHovered(null)}
      className={`relative flex-1 flex flex-col p-8 lg:p-12 min-h-[320px] transition-colors duration-500 hover-trigger border-b md:border-b-0 ${isLeft ? "md:border-r border-grid" : ""
        }`}
      style={{
        backgroundColor: isHovered ? brandColor : "var(--color-surface)",
        color: isHovered ? "white" : "var(--color-graphite)"
      }}
    >
      {/* Background Bubble Effect */}
      <div className="absolute inset-0 bubble-bg pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Number identifier */}
        <span className="font-mono text-sm tracking-widest mb-12 block" style={{ opacity: isHovered ? 0.9 : 0.4 }}>
          {number}
        </span>

        <div className="mt-auto">
          <h2 className="font-serif text-4xl mb-3 transition-colors">
            {title}
          </h2>
          <p className="font-sans text-base max-w-sm transition-colors leading-relaxed" style={{ color: isHovered ? "rgba(255,255,255,0.9)" : "var(--color-graphite)" }}>
            {description}
          </p>

          <div className="mt-8 flex items-center gap-3 font-mono text-sm tracking-widest uppercase transition-all duration-300"
            style={{ transform: isHovered ? "translateX(8px)" : "translateX(0)" }}>
            Authenticate
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
