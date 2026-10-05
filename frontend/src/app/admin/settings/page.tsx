"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, getStoredToken } from "@/app/lib/auth";
import Link from "next/link";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    require_fullscreen: true,
    detect_tab_switch: true,
    prevent_right_click: true,
    prevent_copy_paste: true,
    block_shortcuts: true,
    disable_text_selection: true
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = getStoredToken();
    const u = getStoredUser();
    if (!t || !u || u.role !== "admin") {
      router.push("/student/login"); // Redirect to login if not admin
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const loadSettings = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/settings", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        } else {
          setError("Failed to load settings");
        }
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("Settings saved successfully!");
      } else {
        alert("Failed to save settings");
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-[family-name:var(--font-geist-sans)]">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => { localStorage.clear(); router.push("/"); }}
            className="text-slate-500 hover:text-slate-700 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Global Settings</h2>

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-200">{error}</div>}

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="space-y-6">
            <ToggleRow
              title="Require Fullscreen"
              description="Forces the student to enter fullscreen mode. Exiting will be recorded as a violation."
              checked={settings.require_fullscreen}
              onChange={(v) => setSettings({ ...settings, require_fullscreen: v })}
            />
            <ToggleRow
              title="Detect Tab Switching"
              description="Records a violation if the student switches tabs, minimizes the window, or clicks on another monitor."
              checked={settings.detect_tab_switch}
              onChange={(v) => setSettings({ ...settings, detect_tab_switch: v })}
            />
            <ToggleRow
              title="Prevent Right-Click"
              description="Disables the context menu so students cannot right-click on the exam page."
              checked={settings.prevent_right_click}
              onChange={(v) => setSettings({ ...settings, prevent_right_click: v })}
            />
            <ToggleRow
              title="Prevent Copy & Paste"
              description="Disables copying questions or pasting answers from the clipboard."
              checked={settings.prevent_copy_paste}
              onChange={(v) => setSettings({ ...settings, prevent_copy_paste: v })}
            />
            <ToggleRow
              title="Block Keyboard Shortcuts"
              description="Blocks shortcuts like Ctrl+C, Ctrl+V, Ctrl+P, and F12 (Developer Tools)."
              checked={settings.block_shortcuts}
              onChange={(v) => setSettings({ ...settings, block_shortcuts: v })}
            />
            <ToggleRow
              title="Disable Text Selection"
              description="Prevents students from highlighting or selecting text on the exam page (except in input boxes)."
              checked={settings.disable_text_selection}
              onChange={(v) => setSettings({ ...settings, disable_text_selection: v })}
            />
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string, description: string, checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 max-w-xl">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer mt-1">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>
  );
}
