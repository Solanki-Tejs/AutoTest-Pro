"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
  maxWidth = "max-w-[500px]"
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-graphite/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-up"
    >
      <div
        className={`w-full ${maxWidth} bg-surface border border-grid rounded-xl shadow-2xl overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="p-6 border-b border-grid flex items-start justify-between bg-paper/50">
          <div>
            {badge && (
              <span className="font-mono text-[0.7rem] uppercase tracking-widest text-graphite/60 bg-grid/60 px-2 py-0.5 rounded mb-2 inline-block">
                {badge}
              </span>
            )}
            <h2 className="font-serif text-2xl font-semibold text-graphite tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="font-sans text-xs text-graphite/60 mt-1 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-graphite/40 hover:text-graphite hover:bg-grid/50 transition-colors font-mono text-sm"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[80vh]">{children}</div>
      </div>
    </div>
  );
}
