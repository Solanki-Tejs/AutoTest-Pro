"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/app/lib/auth";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  AppNotification,
} from "@/app/lib/notifications";
import { toast } from "sonner";

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case "result":
      return "verified";
    case "exam":
      return "assignment";
    case "class":
      return "school";
    case "syllabus":
      return "menu_book";
    case "paper":
      return "description";
    case "answer":
      return "key";
    case "submission":
      return "task_alt";
    default:
      return "notifications";
  }
}

export function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // First note: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Second note: A5 (880.00 Hz) - higher harmonic chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.1);
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.32, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch {
    // Autoplay policy or browser restricted
  }
}

export default function NotificationBell({ role = "teacher" }: { role?: "teacher" | "student" }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const accentColor = role === "teacher" ? "#0047ff" : "#ff1d58";

  const loadNotifications = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const data = await fetchNotifications(token);
      const items: AppNotification[] = Array.isArray(data) ? data : [];
      setNotifications(items);

      if (initialLoadDoneRef.current) {
        // Detect newly arrived unread notifications
        const newlyArrived = items.filter(
          (n) => !n.is_read && !knownIdsRef.current.has(n.id)
        );

        if (newlyArrived.length > 0) {
          playNotificationSound();
          newlyArrived.forEach((notif) => {
            const linkUrl = notif.link;
            toast(notif.title || "New Notification", {
              description: notif.message,
              action: linkUrl
                ? {
                    label: "View",
                    onClick: () => {
                      markNotificationRead(token, notif.id).catch(() => {});
                      router.push(linkUrl);
                    },
                  }
                : undefined,
              duration: 8000,
            });
          });
        }
      } else {
        // First load: trigger pop-up if an unread notification was issued in the last 20 seconds
        const recentUnread = items.filter((n) => {
          if (n.is_read) return false;
          const created = new Date(n.created_at).getTime();
          return !isNaN(created) && Math.abs(Date.now() - created) < 20000;
        });

        if (recentUnread.length > 0) {
          playNotificationSound();
          recentUnread.forEach((notif) => {
            const linkUrl = notif.link;
            toast(notif.title || "New Notification", {
              description: notif.message,
              action: linkUrl
                ? {
                    label: "View",
                    onClick: () => {
                      markNotificationRead(token, notif.id).catch(() => {});
                      router.push(linkUrl);
                    },
                  }
                : undefined,
              duration: 8000,
            });
          });
        }
      }

      initialLoadDoneRef.current = true;
      knownIdsRef.current = new Set(items.map((n) => n.id));
    } catch {
      // silently fail in background
    }
  }, [router]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 8000); // 8-second poll for responsive notification popups
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleItemClick = async (notif: AppNotification) => {
    const token = getStoredToken();
    if (!notif.is_read && token) {
      try {
        await markNotificationRead(token, notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch {
        // continue navigation regardless
      }
    }
    setIsOpen(false);
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    const token = getStoredToken();
    if (!token || unreadCount === 0) return;
    setLoading(true);
    try {
      await markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read");
    } catch (err: any) {
      toast.error(err.message || "Failed to mark notifications");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        className="w-10 h-10 border border-outline-variant bg-surface-container-lowest hover:border-black flex items-center justify-center transition-colors cursor-pointer relative"
        title="Notifications"
        type="button"
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-[20px] text-on-surface">
          notifications
        </span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-white font-mono text-[10px] font-bold flex items-center justify-center border border-black shadow-[1px_1px_0px_#000]"
            style={{ backgroundColor: accentColor }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 bg-surface-container-lowest border-2 border-black shadow-[6px_6px_0px_#111111] z-50 animate-fade-up overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface">
                NOTIFICATIONS
              </span>
              {unreadCount > 0 && (
                <span
                  className="px-1.5 py-0.5 text-white font-mono text-[10px] font-bold uppercase tracking-widest"
                  style={{ backgroundColor: accentColor }}
                >
                  {unreadCount} NEW
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="font-mono text-[11px] text-secondary hover:text-black uppercase tracking-wider font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-outline-variant">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-secondary">
                <span className="material-symbols-outlined text-3xl opacity-40 mb-2 block">
                  notifications_paused
                </span>
                <p className="font-mono text-xs uppercase tracking-wider">No notifications yet</p>
                <p className="text-[11px] text-neutral-400 mt-1">Updates regarding exams, classes, and results appear here.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3.5 hover:bg-surface-container transition-colors cursor-pointer flex items-start gap-3 text-left ${
                    !n.is_read ? "bg-surface-container-lowest" : "bg-neutral-50/50 opacity-80"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-none border border-black flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: !n.is_read ? accentColor : "#e5e2e1",
                      color: !n.is_read ? "#ffffff" : "#5f5e5e",
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {getNotificationIcon(n.notification_type)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-mono text-xs font-bold text-on-surface truncate">
                        {n.title}
                      </span>
                      <span className="font-mono text-[10px] text-secondary whitespace-nowrap">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="font-sans text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                  </div>

                  {!n.is_read && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0 self-center"
                      style={{ backgroundColor: accentColor }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
