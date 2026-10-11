"use client";

import { useState } from "react";
import Modal from "./Modal";
import { sendOtp, forgotPassword } from "@/app/lib/auth";
import { toast } from "sonner";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  defaultEmail = "",
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState(defaultEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your account email address.");
      return;
    }
    setLoading(true);
    try {
      await sendOtp(email.trim().toLowerCase(), "forgot_password");
      toast.success("Verification code dispatched to your email address!");
      setStep("otp");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
      toast.success("Password reset successfully! You can now log in.");
      onClose();
      setStep("email");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    onClose();
    setTimeout(() => {
      setStep("email");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Reset Account Password"
      subtitle={
        step === "email"
          ? "Receive a 6-digit email authorization code to restore access."
          : `Enter the 6-digit security code sent to ${email}.`
      }
      badge="SECURITY PROTOCOL"
    >
      <div className="p-6">
        {step === "email" ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <div>
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-secondary block mb-2">
                ACCOUNT EMAIL ADDRESS
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@institution.edu"
                className="w-full bg-surface border border-outline-variant p-3 font-sans text-sm focus:border-black outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-secondary hover:text-black transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-[#0047ff] hover:bg-black text-white font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {loading && <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>}
                <span>Send Security Code</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <div>
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-secondary block mb-2">
                6-DIGIT VERIFICATION CODE
              </label>
              <input
                type="text"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
                className="w-full bg-surface border border-outline-variant p-3 font-mono text-xl tracking-[0.3em] text-center font-bold focus:border-black outline-none"
              />
            </div>

            <div>
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-secondary block mb-2">
                NEW SECURE PASSWORD
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
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-secondary block mb-2">
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

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-xs font-mono text-secondary hover:text-black uppercase tracking-wider underline cursor-pointer"
              >
                ← Back
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-secondary hover:text-black transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[#0047ff] hover:bg-black text-white font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {loading && <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>}
                  <span>Update Password</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
