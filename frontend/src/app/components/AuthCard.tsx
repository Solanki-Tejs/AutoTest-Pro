"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";

export type AuthRole = "teacher" | "student";

interface AuthCardProps {
  role: AuthRole;
  children: ReactNode;
}

const ROLE_CONFIG = {
  teacher: {
    label: "Educator Portal",
    tagline: "Design tests that inspire\nlearning and measure growth.",
    illustration: <TeacherIllustration />,
  },
  student: {
    label: "Student Portal",
    tagline: "Tackle every test with\nconfidence and clarity.",
    illustration: <StudentIllustration />,
  },
} as const;

export default function AuthCard({ role, children }: AuthCardProps) {
  const cfg = ROLE_CONFIG[role];

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch relative overflow-hidden">
      {/* Left panel — brand / illustration */}
      <div className="hidden md:flex flex-col justify-between flex-[1_1_42%] min-w-0 p-10 relative z-10 border-r border-slate-200 bg-white shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)]">
        {/* Logo */}
        <Link href="/" className="inline-flex items-center gap-3 no-underline">
          <div className="w-9 h-9 relative flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="AutoTest Pro Logo"
              width={36}
              height={36}
              className="object-contain"
            />
          </div>
          <span className="text-[1.15rem] font-bold text-slate-900 tracking-tight">
            AutoTest Pro
          </span>
        </Link>

        {/* Centre content */}
        <div className="text-center mt-12 mb-12">
          {/* Role badge */}
          <span className="inline-block text-[0.72rem] font-semibold tracking-widest uppercase text-[#22579b] border border-[#22579b] rounded-full px-3.5 py-1 mb-8">
            {cfg.label}
          </span>

          {/* Illustration */}
          <div className="mb-8">{cfg.illustration}</div>

          {/* Tagline */}
          <h2 className="text-[clamp(1.4rem,2.8vw,2rem)] font-bold text-slate-900 tracking-tight leading-snug whitespace-pre-line">
            {cfg.tagline}
          </h2>

          {/* Decorative dots */}
          <div className="flex justify-center gap-2 mt-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === 1 ? "w-5 bg-[#22579b]" : "w-2 bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="flex gap-8 justify-center">
          {[
            { value: "10K+", label: "Tests created" },
            { value: "50K+", label: "Students served" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-[1.3rem] font-bold text-slate-900">{value}</p>
              <p className="text-[0.78rem] text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-[1_1_58%] min-w-0 flex items-center justify-center p-10 relative z-10">
        <div className="w-full max-w-[440px]">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Illustrations ────────────────────────────────────────────────────────────

function TeacherIllustration() {
  return (
    <svg viewBox="0 0 280 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px] mx-auto block drop-shadow-sm">
      {/* Whiteboard */}
      <rect x="30" y="20" width="200" height="130" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="42" y="32" width="176" height="106" rx="4" fill="#f8fafc" />
      {/* Board content lines */}
      <line x1="58" y1="55" x2="160" y2="55" stroke="#22579b" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="58" y1="72" x2="140" y2="72" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="89" x2="150" y2="89" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      {/* Checkmark */}
      <circle cx="180" cy="80" r="20" fill="rgba(78, 192, 120, 0.15)" stroke="#4ec078" strokeWidth="1.5" />
      <path d="M170 80l7 7 13-14" stroke="#4ec078" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Stand */}
      <line x1="130" y1="150" x2="100" y2="180" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <line x1="130" y1="150" x2="160" y2="180" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      {/* Teacher figure (simplified) */}
      <circle cx="225" cy="90" r="14" fill="#ffffff" stroke="#22579b" strokeWidth="1.5" />
      <path d="M211 130c0-11 6-20 14-20s14 9 14 20" stroke="#22579b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function StudentIllustration() {
  return (
    <svg viewBox="0 0 280 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px] mx-auto block drop-shadow-sm">
      {/* Desk */}
      <rect x="40" y="140" width="200" height="8" rx="4" fill="#cbd5e1" />
      {/* Laptop */}
      <rect x="80" y="80" width="120" height="76" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="88" y="88" width="104" height="60" rx="3" fill="#f8fafc" />
      {/* Screen content */}
      <rect x="96" y="96" width="60" height="5" rx="2.5" fill="#22579b" opacity="0.8" />
      <rect x="96" y="107" width="88" height="3" rx="1.5" fill="#94a3b8" />
      <rect x="96" y="115" width="72" height="3" rx="1.5" fill="#94a3b8" />
      <rect x="96" y="123" width="80" height="3" rx="1.5" fill="#94a3b8" />
      {/* Checkmark on screen */}
      <circle cx="164" cy="111" r="12" fill="rgba(78, 192, 120, 0.15)" stroke="#4ec078" strokeWidth="1.5" />
      <path d="M158 111l4 4 8-8" stroke="#4ec078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Laptop base */}
      <path d="M72 156h136l-8 0H80l-8 0z" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      {/* Student figure */}
      <circle cx="200" cy="105" r="14" fill="#ffffff" stroke="#22579b" strokeWidth="1.5" />
      {/* Graduation cap */}
      <rect x="191" y="91" width="18" height="5" rx="2" fill="#22579b" />
      <polygon points="200,86 207,91 193,91" fill="#22579b" />
      {/* Body */}
      <path d="M186 140c0-11 6-20 14-20s14 9 14 20" stroke="#22579b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
