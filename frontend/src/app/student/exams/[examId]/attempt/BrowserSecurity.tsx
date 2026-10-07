"use client";

import { useEffect, useState, useCallback } from "react";
import { getStoredToken } from "@/app/lib/auth";

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
        const res = await fetch("http://localhost:8000/api/settings", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        } else {
          setSettings(null); // Will skip security if fail
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

      await fetch(`http://localhost:8000/api/student/exams/${examId}/attempts/${attemptId}/proctoring/violation`, {
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
        alert("Warning: You must remain in fullscreen mode during the exam.");
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
      alert("Failed to enter fullscreen mode. Please try again.");
    }
  };

  if (settings === null) return null; // loading settings or failed

  // If enabled but not started or not in fullscreen, show overlay (if fullscreen is required)
  if (settings.require_fullscreen && (!isStarted || !isFullscreen)) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-lg border border-slate-700 shadow-2xl">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold mb-4">Exam Security Environment</h2>
          <p className="text-slate-300 mb-6 leading-relaxed">
            This exam requires a secure testing environment. Once you start:
            <br/><br/>
            • Your browser will enter fullscreen mode.<br/>
            • Do not switch tabs or minimize the window.<br/>
            • All violations will be recorded and reported to your instructor.
          </p>
          <button
            onClick={enterFullscreen}
            className="w-full py-4 bg-[#6c63ff] hover:bg-[#5a52d5] text-white font-bold rounded-xl transition-colors text-lg shadow-lg"
          >
            Enter Fullscreen & Start
          </button>
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
