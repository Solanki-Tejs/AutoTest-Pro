"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function LandingPage() {
  const [hovered, setHovered] = useState<"teacher" | "student" | null>(null);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden p-8 bg-slate-50">
      {/* Logo */}
      <div className="animate-fade-up text-center mb-14">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-10 h-10 relative flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="AutoTest Pro Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">
            AutoTest Pro
          </span>
        </div>
        <h1 className="animate-fade-up stagger-1 text-[clamp(2rem,5vw,3.25rem)] font-bold text-slate-900 tracking-tight leading-tight mb-3">
          Smart assessments,<br />
          <span className="text-[#22579b]">
            built for everyone.
          </span>
        </h1>
        <p className="animate-fade-up stagger-2 text-slate-600 text-lg max-w-[480px] mx-auto">
          Choose your role to get started with AutoTest Pro.
        </p>
      </div>

      {/* Role cards */}
      <div className="animate-fade-up stagger-3 flex gap-6 flex-wrap justify-center w-full max-w-[780px]">
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
          badge="Learner"
        />
      </div>

      {/* Footer */}
      <p className="animate-fade-up stagger-5 mt-12 text-slate-500 text-sm">
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
  badge: string;
}

function RoleCard({
  role, hovered, setHovered, href, title, description, icon, badge,
}: RoleCardProps) {
  const isHovered = hovered === role;
  
  // Use distinct colors based on the role
  const brandColor = role === "teacher" ? "#2563eb" : "#6c63ff";

  return (
    <Link
      href={href}
      id={`role-card-${role}`}
      onMouseEnter={() => setHovered(role)}
      onMouseLeave={() => setHovered(null)}
      className="flex flex-col items-start gap-4 p-8 bg-white border border-slate-200 rounded-xl no-underline flex-1 min-w-[300px] max-w-[360px] cursor-pointer transition-colors duration-300 shadow-sm hover:bg-slate-50"
      style={{
        borderColor: isHovered ? brandColor : undefined,
      }}
    >
      {/* Badge */}
      <span
        className="text-xs font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full border transition-colors duration-300 inline-block"
        style={{
          color: isHovered ? brandColor : "var(--color-slate-500)",
          borderColor: isHovered ? brandColor : "var(--color-slate-200)",
        }}
      >
        {badge}
      </span>

      {/* Icon */}
      <div
        className="w-16 h-16 rounded-lg border flex items-center justify-center transition-colors duration-300"
        style={{
          backgroundColor: isHovered ? brandColor : "var(--color-slate-50)",
          borderColor: isHovered ? brandColor : "var(--color-slate-200)",
          color: isHovered ? "white" : "var(--color-slate-500)",
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-2 transition-colors duration-300"
            style={{ color: isHovered ? brandColor : undefined }}>
          {title}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {description}
        </p>
      </div>

      {/* Arrow */}
      <div
        className="mt-auto flex items-center gap-1.5 text-sm font-semibold transition-all duration-300"
        style={{
          color: isHovered ? brandColor : "var(--color-slate-500)",
        }}
      >
        Sign in
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: isHovered ? "translateX(4px)" : "translateX(0)" }}
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
