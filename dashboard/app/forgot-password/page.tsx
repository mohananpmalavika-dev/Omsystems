"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  RefreshCw,
  Lock,
  Sparkles,
} from "lucide-react";
import { authApi } from "@/lib/api-client";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { OrgBrandingProvider, useOrgBranding } from "@/components/ui/org-branding-provider";

export default function ForgotPasswordPage() {
  return (
    <ThemeProvider>
      <OrgBrandingProvider>
        <ForgotPasswordInner />
      </OrgBrandingProvider>
    </ThemeProvider>
  );
}

function ForgotPasswordInner() {
  const router = useRouter();
  const { branding } = useOrgBranding();

  // Multi-step states: 1 = Email, 2 = OTP, 3 = New Password, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [email, setEmail] = useState<string>("");
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);

  // OTP inputs (6 digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset Token & Passwords
  const [resetToken, setResetToken] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // Status & Feedback
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Resend Countdown Timer (60s)
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Auto-redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState<number>(5);

  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    let timer: any;
    if (step === 4 && redirectCountdown > 0) {
      timer = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
    } else if (step === 4 && redirectCountdown === 0) {
      router.push("/login");
    }
    return () => clearTimeout(timer);
  }, [step, redirectCountdown, router]);

  // Step 1: Submit Email for OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await authApi.requestPasswordResetOtp(email.trim(), tenantSlug.trim() || undefined);
      if (res.success) {
        setMaskedEmail(res.maskedEmail || email);
        if (res.previewOtp) {
          setPreviewOtp(res.previewOtp);
        }
        setStep(2);
        setResendCooldown(60);
        setInfo(res.message);
      } else {
        setError(res.message || "Failed to send verification code. Please check your email.");
      }
    } catch (err: any) {
      setError(err.message || "No registered account found with that email address.");
    } finally {
      setBusy(false);
    }
  };

  // Step 2: Handle OTP input typing and pasting
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste of 6 digits
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newArr = [...otpDigits];
      digits.forEach((d, i) => {
        if (i < 6) newArr[i] = d;
      });
      setOtpDigits(newArr);
      const nextIdx = Math.min(5, digits.length);
      otpInputRefs.current[nextIdx]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, "");
    const newArr = [...otpDigits];
    newArr[index] = digit;
    setOtpDigits(newArr);

    // Auto-advance to next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join("");
    if (fullOtp.length !== 6) {
      setError("Please enter all 6 digits of the verification code.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await authApi.verifyPasswordResetOtp(email.trim(), fullOtp);
      if (res.success && res.resetToken) {
        setResetToken(res.resetToken);
        setStep(3);
        setInfo(res.message);
      } else {
        setError(res.message || "Invalid verification code.");
      }
    } catch (err: any) {
      setError(err.message || "Invalid verification code. Please check and try again.");
    } finally {
      setBusy(false);
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await authApi.resetPasswordWithOtp(email.trim(), resetToken, newPassword);
      if (res.success) {
        setStep(4);
      } else {
        setError(res.message || "Failed to update password.");
      }
    } catch (err: any) {
      setError(err.message || "Password reset failed. The session may have expired.");
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await authApi.requestPasswordResetOtp(email.trim(), tenantSlug.trim() || undefined);
      if (res.success) {
        if (res.previewOtp) setPreviewOtp(res.previewOtp);
        setResendCooldown(60);
        setInfo(`A fresh verification code has been sent to ${maskedEmail}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setBusy(false);
    }
  };

  // Password Requirements Validation
  const hasMinLength = newPassword.length >= 8;
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Header & Brand */}
        <div className="login-header">
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: "4px" }}>
            <ThemeSwitcher />
          </div>
          <div className="login-brand">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.orgName || "Organization Logo"} className="login-org-logo" />
            ) : (
              <ShieldCheck size={32} className="brand-icon" />
            )}
            <h1>{branding.orgName || "Sentinel Grid"}</h1>
          </div>

          <p className="login-subtitle">
            {step === 1 && "Reset your password via Email OTP verification"}
            {step === 2 && "Enter the 6-digit code sent to your email"}
            {step === 3 && "Create a secure new password for your account"}
            {step === 4 && "Password reset successfully!"}
          </p>
        </div>

        {/* Alerts & Feedback */}
        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {info && step !== 4 && (
          <div className="login-info" role="status">
            <CheckCircle2 size={16} />
            <span>{info}</span>
          </div>
        )}

        {/* STEP 1: Enter Email */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="password-input-wrapper">
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="login-input"
                  style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  disabled={busy}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="tenantSlug">
                Organization Code <span className="optional-label">(optional)</span>
              </label>
              <input
                type="text"
                id="tenantSlug"
                name="tenantSlug"
                className="login-input"
                style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="Leave blank if not applicable"
                disabled={busy}
              />
            </div>

            <button type="submit" className="login-button" disabled={busy || !email}>
              {busy ? "Sending Verification Code..." : "Send Verification Code"}
            </button>

            <div className="login-help" style={{ marginTop: "1rem" }}>
              <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: Enter 6-digit OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="login-form">
            <div style={{ textAlign: "center", marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
                We sent a 6-digit verification code to:
              </p>
              <p style={{ fontSize: "0.95rem", fontWeight: "600", color: "#0f172a", marginTop: "2px" }}>
                {maskedEmail}
              </p>
            </div>

            {/* Dev Preview Hint */}
            {previewOtp && (
              <div
                style={{
                  padding: "0.6rem 0.8rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(14, 165, 233, 0.1)",
                  border: "1px solid rgba(14, 165, 233, 0.3)",
                  color: "#0284c7",
                  fontSize: "0.8rem",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Sparkles size={14} />
                  <span>Dev Preview OTP: <strong>{previewOtp}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const digits = previewOtp.split("");
                    setOtpDigits(digits);
                  }}
                  style={{
                    fontSize: "0.75rem",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    cursor: "pointer",
                    fontWeight: "600",
                  }}
                >
                  Auto-fill
                </button>
              </div>
            )}

            {/* 6 Digit Inputs */}
            <div className="form-group">
              <label style={{ textAlign: "center", display: "block" }}>Enter Verification Code</label>
              <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    disabled={busy}
                    autoFocus={idx === 0}
                    style={{
                      width: "44px",
                      height: "52px",
                      textAlign: "center",
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      borderRadius: "0.5rem",
                      border: "1.5px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      color: "#0f172a",
                      caretColor: "#0284c7",
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={busy || otpDigits.join("").length !== 6}
            >
              {busy ? "Verifying..." : "Verify Code & Proceed"}
            </button>

            {/* Resend Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", fontSize: "0.85rem" }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <ArrowLeft size={14} /> Change Email
              </button>

              {resendCooldown > 0 ? (
                <span style={{ color: "#94a3b8" }}>Resend code in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={busy}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    cursor: "pointer",
                    fontWeight: "600",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <RefreshCw size={14} /> Resend Code
                </button>
              )}
            </div>
          </form>
        )}

        {/* STEP 3: Set New Password */}
        {step === 3 && (
          <form onSubmit={handleResetPassword} className="login-form">
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="newPassword"
                  name="newPassword"
                  className="login-input"
                  style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  disabled={busy}
                  autoFocus
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  className="login-input"
                  style={{ color: "#0f172a", backgroundColor: "#ffffff", caretColor: "#0f172a" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Confirm new password"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Password Requirements List */}
            <div
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "0.8rem",
              }}
            >
              <p style={{ fontWeight: "600", color: "#475569", marginBottom: "0.35rem" }}>
                Password Security Checklist:
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <li style={{ color: hasMinLength ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{hasMinLength ? "✓" : "○"}</span> At least 8 characters
                </li>
                <li style={{ color: hasUpperCase ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{hasUpperCase ? "✓" : "○"}</span> Contains uppercase letter (A-Z)
                </li>
                <li style={{ color: hasLowerCase ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{hasLowerCase ? "✓" : "○"}</span> Contains lowercase letter (a-z)
                </li>
                <li style={{ color: hasNumber ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{hasNumber ? "✓" : "○"}</span> Contains number (0-9)
                </li>
                <li style={{ color: passwordsMatch ? "#16a34a" : "#64748b", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{passwordsMatch ? "✓" : "○"}</span> Passwords match
                </li>
              </ul>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={busy || !hasMinLength || !passwordsMatch}
            >
              {busy ? "Updating Password..." : "Update Password & Finish"}
            </button>
          </form>
        )}

        {/* STEP 4: Success Screen */}
        {step === 4 && (
          <div style={{ textAlign: "center", padding: "1.5rem 0.5rem" }} className="space-y-4">
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "2px solid #22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem auto",
                color: "#16a34a",
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#0f172a" }}>
              Password Reset Complete
            </h2>

            <p style={{ fontSize: "0.875rem", color: "#64748b", maxWidth: "320px", margin: "0 auto" }}>
              Your account password has been successfully updated. You can now sign in using your new credentials.
            </p>

            <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              Redirecting to sign in page in <strong>{redirectCountdown}</strong> seconds...
            </p>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="login-button"
              style={{ marginTop: "1rem" }}
            >
              Sign In Now
            </button>
          </div>
        )}

        <footer className="login-footer">
          <p>&copy; 2026 OM Systems. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
