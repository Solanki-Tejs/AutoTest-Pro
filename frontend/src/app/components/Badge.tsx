import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "teacher" | "student" | "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
  className?: string;
}

export default function Badge({
  children,
  variant = "default",
  size = "sm",
  className = ""
}: BadgeProps) {
  const baseStyle = "font-mono font-medium inline-flex items-center tracking-widest uppercase rounded border";
  
  const sizeStyles = {
    sm: "text-[0.68rem] px-2 py-0.5",
    md: "text-[0.78rem] px-2.5 py-1"
  };

  const variantStyles = {
    default: "bg-grid/60 text-graphite border-grid",
    teacher: "bg-[#0044FF]/10 text-[#0044FF] border-[#0044FF]/20",
    student: "bg-[#FF3366]/10 text-[#FF3366] border-[#FF3366]/20",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    neutral: "bg-surface text-graphite/70 border-grid"
  };

  return (
    <span className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
