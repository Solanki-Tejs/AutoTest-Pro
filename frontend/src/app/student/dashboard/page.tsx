"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredUser, logout, UserResponse } from "@/app/lib/auth";
import { useRouter } from "next/navigation";

export default function StudentDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || u.role !== "student") {
      router.push("/student/login");
    } else {
      setUser(u);
    }
  }, [router]);

  function handleLogout() {
    logout();
    router.push("/student/login");
  }

  if (!user) return null;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div aria-hidden style={{ position: "fixed", top: "10%", left: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none" }} />

      <div className="animate-fade-up" style={{ textAlign: "center", maxWidth: 500 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: "2rem" }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, var(--student) 0%, var(--accent) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          </div>
          <span className="font-display" style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>AutoTest Pro</span>
        </div>

        <div style={{ padding: "2.5rem", background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-xl)", marginBottom: "1.5rem" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--student-dim)", border: "2px solid var(--student)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", fontSize: "1.5rem", color: "var(--student)", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--student)", marginBottom: "0.5rem" }}>Student Portal</p>
          <h1 className="font-display" style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>Welcome, {user.name.split(" ")[0]}!</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.3rem" }}>{user.email}</p>
          <span style={{ fontSize: "0.75rem", background: "var(--student-dim)", color: "var(--student)", border: "1px solid var(--student)", borderRadius: 999, padding: "2px 10px" }}>Student</span>

          <div style={{ marginTop: "2rem", padding: "1.25rem", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border)" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
              📚 Your dashboard is coming soon. Test attempts, scores, and progress tracking will be available here.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/" style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "1.5px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem", transition: "all 0.2s" }}>← Home</Link>
          <button onClick={handleLogout} style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", background: "var(--student)", border: "none", color: "white", fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
