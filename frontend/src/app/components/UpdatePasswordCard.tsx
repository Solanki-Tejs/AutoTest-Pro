"use client";

import { useState } from "react";
import { sendOtp, updatePassword, getStoredToken } from "@/app/lib/auth";
import { toast } from "sonner";

export default function UpdatePasswordCard({ userEmail }: { userEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!userEmail) return;
    setSendingOtp(true);
    try {
      await sendOtp(userEmail.toLowerCase(), "update_password");
      setOtpSent(true);
      toast.success("Security verification code dispatched to your email address!");
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch verification code.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) {
      toast.error("Session expired. Please log in again.");
      return;
    }
    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
        otp: otp.trim(),
        email: userEmail,
      });
      toast.success("Account password successfully updated!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpSent(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-black/10 p-6 sm:p-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#0047ff] font-bold block">
            CREDENTIAL SECURITY
          </span>
          <h3 className="font-serif text-xl sm:text-2xl text-on-surface font-bold mt-1">
            Update Account Password
          </h3>
        </div>
        <span className="material-symbols-outlined text-2xl text-neutral-400">shield</span>
      </div>

      <form onSubmit={handleUpdate} className="space-y-4 max-w-lg">
        <div>
          <label className="font-mono text-xs uppercase tracking-wider text-neutral-500 font-bold block mb-1.5">
            CURRENT PASSWORD
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-surface border border-outline-variant p-3 font-sans text-sm focus:border-black outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-xs uppercase tracking-wider text-neutral-500 font-bold block mb-1.5">
              NEW PASSWORD
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface border border-outline-variant p-3 font-sans text-sm focus:border-black outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-xs uppercase tracking-wider text-neutral-500 font-bold block mb-1.5">
              CONFIRM NEW PASSWORD
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface border border-outline-variant p-3 font-sans text-sm focus:border-black outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="font-mono text-xs uppercase tracking-wider text-neutral-500 font-bold">
              EMAIL AUTHORIZATION OTP
            </label>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sendingOtp}
              className="font-mono text-xs text-[#0047ff] hover:underline uppercase tracking-wider font-bold cursor-pointer disabled:opacity-50"
            >
              {sendingOtp ? "Sending..." : otpSent ? "Resend OTP Code" : "Send OTP Code"}
            </button>
          </div>
          <input
            type="text"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={otpSent ? "Enter 6-digit OTP" : "Click 'Send OTP Code' first"}
            className="w-full bg-surface border border-outline-variant p-3 font-mono text-base tracking-[0.2em] font-bold focus:border-black outline-none"
          />
          {otpSent && (
            <p className="font-mono text-[11px] text-neutral-500 mt-1">
              Code dispatched to <strong>{userEmail}</strong>. Valid for 10 minutes.
            </p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-black hover:bg-[#0047ff] text-white font-mono text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>}
            <span>Save New Password</span>
          </button>
        </div>
      </form>
    </div>
  );
}
