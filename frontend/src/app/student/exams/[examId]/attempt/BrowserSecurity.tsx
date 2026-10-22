"use client";

import { useEffect, useState, useCallback } from "react";
import { getStoredToken } from "@/app/lib/auth";
import { API_BASE_URL } from "@/app/lib/apiConfig";
import { toast } from "sonner";

interface BrowserSecurityProps {
  examId: string;
  attemptId: string;
}

export default function BrowserSecurity({ examId, attemptId }: BrowserSecurityProps) {
  const [settings, setSettings] = useState<{
    require_fullscreen: boolean;
    detect_tab_switch: boolean;
    prevent_right_click: boolean;
    prevent_copy_paste: boolean;
    block_shortcuts: boolean;
    disable_text_selection: boolean;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = getStoredToken();
        const res = await fetch(`${API_BASE_URL}/settings`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        } else {
          setSettings(null);
        }
      } catch (err) {
        setSettings(null);
      }
    };
    fetchSettings();
  }, []);

  const reportViolation = useCallback(async (type: string, description: string) => {
    try {
      const token = getStoredToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/student/exams/${examId}/attempts/${attemptId}/proctoring/violation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ type, description })
      });
      console.warn(`Violation reported: ${type}`);
    } catch (err) {
      console.error("Failed to report violation", err);
    }
  }, [examId, attemptId]);

  // Handle Fullscreen
  useEffect(() => {
    if (!settings?.require_fullscreen || !isStarted) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        reportViolation("FULLSCREEN_EXIT", "Student exited fullscreen mode.");
        toast.error("Warning: You must remain in fullscreen mode during the exam.");
      } else {
        setIsFullscreen(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [settings, isStarted, reportViolation]);

  // Handle Visibility/Focus and Shortcuts
  useEffect(() => {
    if (!settings || !isStarted) return;

    const handleVisibilityChange = () => {
      if (settings.detect_tab_switch && document.hidden) {
        reportViolation("TAB_SWITCH", "Student switched tabs or minimized browser.");
        toast.error("Warning: Tab switch detected. Integrity violation recorded.");
      }
    };

    const handleBlur = () => {
      if (settings.detect_tab_switch) {
        reportViolation("WINDOW_BLUR", "Browser window lost focus.");
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (settings.prevent_right_click) {
        e.preventDefault();
      }
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      if (settings.prevent_copy_paste) {
        e.preventDefault();
        reportViolation("COPY_PASTE_ATTEMPT", `Attempted to ${e.type} content.`);
        toast.error("Clipboard operations are prohibited during this exam.");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings.block_shortcuts) return;
      // Prevent Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+P, F12, Ctrl+Shift+I
      if (
        (e.ctrlKey && ['c', 'v', 'x', 'a', 'p'].includes(e.key.toLowerCase())) ||
        (e.metaKey && ['c', 'v', 'x', 'a', 'p'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        reportViolation("KEYBOARD_SHORTCUT", `Attempted to use blocked shortcut: ${e.key}`);
        toast.error(`Shortcut blocked: ${e.key}`);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("cut", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("cut", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings, isStarted, reportViolation]);

  // Exit fullscreen when component unmounts (exam ends or submitted)
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.error("Error exiting fullscreen:", err));
      }
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
      setIsStarted(true);
    } catch (err) {
      console.error("Error attempting to enable full-screen mode:", err);
      toast.error("Failed to enter fullscreen mode. Please grant fullscreen permissions.");
    }
  };

  if (settings === null) return null; // loading settings or failed

  // If enabled but not started or not in fullscreen, show themed brutalist security overlay
  if (settings.require_fullscreen && (!isStarted || !isFullscreen)) {
    const isInterrupted = isStarted && !isFullscreen;

    return (
      <div className="fixed inset-0 bg-[#0c0d12]/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-on-surface">
        <div className="bg-surface-container-lowest border-2 border-black p-8 md:p-10 max-w-lg w-full shadow-[8px_8px_0px_#111111] relative text-left animate-fade-up">
          {/* Top Label Tag */}
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-0.5 bg-black text-white font-mono text-[10px] font-bold tracking-widest uppercase">
              {isInterrupted ? "SECURITY INFRACTION" : "SECURITY PROTOCOL"}
            </span>
            <span className="font-mono text-xs text-brand-crimson font-bold uppercase tracking-wider">
              {isInterrupted ? "FULLSCREEN INTERRUPTED" : "SECURE TESTING ENVIRONMENT"}
            </span>
          </div>

          <h2 className="font-serif text-2xl md:text-3xl font-bold text-on-surface tracking-tight mb-2">
            {isInterrupted ? "Fullscreen Exit Detected" : "Exam Security Environment"}
          </h2>

          <p className="font-sans text-xs text-secondary leading-relaxed mb-6">
            {isInterrupted
              ? "You have exited exclusive fullscreen mode. This anomaly has been timestamped and filed to your evaluation ledger. Return to fullscreen immediately to continue:"
              : "This exam requires a secure testing environment. Once you start:"}
          </p>

          {/* Enforced Rules List */}
          <div className="space-y-2.5 mb-8">
            <div className="flex items-start gap-3 p-3 bg-surface border border-black/15 font-sans text-xs text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-brand-crimson shrink-0 mt-0.5">
                fullscreen
              </span>
              <div>
                <span className="font-bold block mb-0.5">Browser Fullscreen Mode</span>
                <span className="text-secondary text-[11px] leading-tight block">
                  Your browser will enter fullscreen mode.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-surface border border-black/15 font-sans text-xs text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-brand-crimson shrink-0 mt-0.5">
                tab_unselected
              </span>
              <div>
                <span className="font-bold block mb-0.5">Focus Isolation</span>
                <span className="text-secondary text-[11px] leading-tight block">
                  Do not switch tabs or minimize the window.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-surface border border-black/15 font-sans text-xs text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-brand-crimson shrink-0 mt-0.5">
                policy
              </span>
              <div>
                <span className="font-bold block mb-0.5">Authoritative Audit Trail</span>
                <span className="text-secondary text-[11px] leading-tight block">
                  All violations will be recorded and reported to your instructor.
                </span>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={enterFullscreen}
            className="w-full py-4 bg-brand-crimson hover:bg-black text-white font-mono text-xs uppercase tracking-widest font-bold transition-all border-2 border-black shadow-[4px_4px_0px_#111111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{isInterrupted ? "Return to Fullscreen & Resume" : "Enter Fullscreen & Start"}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>

          {/* Footnote */}
          <div className="mt-4 pt-3 border-t border-black/10 text-center">
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-semibold block">
              AUTOTEST PRO // ACTIVE CANDIDATE PROCTORING
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If fullscreen is not required but we haven't officially "started" the tracking
  if (!settings.require_fullscreen && !isStarted) {
    setIsStarted(true);
  }

  // Inject user-select: none globally when running
  if (settings.disable_text_selection && isStarted) {
    return (
      <style dangerouslySetInnerHTML={{ __html: `
        body {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        input, textarea {
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          user-select: text;
        }
      `}} />
    );
  }

  return null;
}
