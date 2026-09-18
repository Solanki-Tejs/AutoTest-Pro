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
    tagline: "Design tests that inspire learning and measure growth.",
    color: "var(--color-teacher)",
    id: "01"
  },
  student: {
    label: "Student Portal",
    tagline: "Tackle every test with confidence and clarity.",
    color: "var(--color-student)",
    id: "02"
  },
} as const;

export default function AuthCard({ role, children }: AuthCardProps) {
  const cfg = ROLE_CONFIG[role];

  return (
    <div className="min-h-screen bg-paper flex flex-col md:flex-row relative overflow-hidden font-sans">

      {/* Left panel — brand / aesthetic */}
      <div
        className="flex-1 md:flex-[0_0_40%] p-8 lg:p-12 relative z-10 border-b md:border-b-0 md:border-r border-grid flex flex-col justify-between"
        style={{ backgroundColor: cfg.color, color: "white" }}
      >
        <div className="absolute inset-0 bubble-bg pointer-events-none opacity-20" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 no-underline text-white">
            <div className="w-8 h-8 relative flex items-center justify-center bg-white/10 rounded-sm">
              <Image
                src="/logo.png"
                alt="AutoTest Pro Logo"
                width={60}
                height={60}
                className="object-contain"
              />
            </div>
            <span className="font-mono text-sm font-semibold tracking-widest uppercase">
              AutoTest Pro
            </span>
          </Link>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center items-center w-full">
          <div className="w-full max-w-[85%] sm:max-w-md pl-4 lg:pl-8">
            <span className="font-mono text-xs tracking-widest uppercase opacity-60 mb-5 block">
              {cfg.label}
            </span>
            <h2 className="font-serif text-[clamp(2rem,3.5vw,3rem)] leading-[1.05] tracking-tight mb-2">
              {cfg.tagline}
            </h2>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16 relative z-10 bg-surface">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </div>
    </div>
  );
}
