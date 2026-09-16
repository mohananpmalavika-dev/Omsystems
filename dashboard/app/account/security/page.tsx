"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi } from "@/lib/api-client";
import { logout, logoutAllSessions } from "@/lib/auth-manager";
import { useUserAlertPreferences } from "@/services/user-alert-preferences";

type Session = Awaited<ReturnType<typeof authApi.listSessions>>["data"][number];

function parseUserAgent(ua?: string): {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  label: string;
} {
  if (!ua) {
    return {
      browser: "Unknown Browser",
      os: "Unknown OS",
      deviceType: "desktop",
      label: "Unknown Device",
    };
  }

  // Detect Device Type
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    deviceType = "tablet";
  } else if (
    /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(
      ua,
    )
  ) {
    deviceType = "mobile";
  }

  // Detect OS
  let os = "Unknown OS";
  if (/Windows NT 10.0/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6.3/i.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6.2/i.test(ua)) os = "Windows 8";
  else if (/Windows NT 6.1/i.test(ua)) os = "Windows 7";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Detect Browser
  let browser = "Web Browser";
  const edgeMatch = ua.match(/Edg(?:e|A|iOS)?\/([0-9.]+)/i);
  const chromeMatch = ua.match(/Chrome\/([0-9.]+)/i);
  const safariMatch = ua.match(/Version\/([0-9.]+).*Safari/i);
  const firefoxMatch = ua.match(/Firefox\/([0-9.]+)/i);
  const operaMatch = ua.match(/(?:OPR|Opera)\/([0-9.]+)/i);

  if (edgeMatch) {
    const major = edgeMatch[1]?.split(".")[0];
    browser = `Microsoft Edge ${major || ""}`.trim();
  } else if (operaMatch) {
    const major = operaMatch[1]?.split(".")[0];
    browser = `Opera ${major || ""}`.trim();
  } else if (chromeMatch) {
    const major = chromeMatch[1]?.split(".")[0];
    browser = `Chrome ${major || ""}`.trim();
  } else if (safariMatch) {
    const major = safariMatch[1]?.split(".")[0];
    browser = `Safari ${major || ""}`.trim();
  } else if (firefoxMatch) {
    const major = firefoxMatch[1]?.split(".")[0];
    browser = `Firefox ${major || ""}`.trim();
  }

  return {
    browser,
    os,
    deviceType,
    label: `${browser} on ${os}`,
  };
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return "Active just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function evaluatePasswordStrength(password: string): {
  score: number;
  label: string;
  colorClass: string;
  hasMinLength: boolean;
  hasCase: boolean;
  hasNumberOrSymbol: boolean;
} {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasCase = hasUpper && hasLower;
  const hasNumberOrSymbol = /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasCase) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;

  score = Math.min(4, Math.max(0, score));

  if (!password) {
    return {
      score: 0,
      label: "None",
      colorClass: "bg-slate-200 dark:bg-slate-700",
      hasMinLength,
      hasCase,
      hasNumberOrSymbol,
    };
  }
  if (score <= 1) {
    return {
      score: 1,
      label: "Weak",
      colorClass: "bg-red-500",
      hasMinLength,
      hasCase,
      hasNumberOrSymbol,
    };
  }
  if (score === 2) {
    return {
      score: 2,
      label: "Fair",
      colorClass: "bg-amber-500",
      hasMinLength,
      hasCase,
      hasNumberOrSymbol,
    };
  }
  if (score === 3) {
    return {
      score: 3,
      label: "Good",
      colorClass: "bg-blue-500",
      hasMinLength,
      hasCase,
      hasNumberOrSymbol,
    };
  }
  return {
    score: 4,
    label: "Strong",
    colorClass: "bg-emerald-500",
    hasMinLength,
    hasCase,
    hasNumberOrSymbol,
  };
}

export default function AccountSecurityPage() {
  const { alertPopupEnabled, alertToastEnabled, setAlertPopupEnabled, setAlertToastEnabled } = useUserAlertPreferences();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [showSignoutModal, setShowSignoutModal] = useState(false);

  // Current logged in user state
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const currentUa = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // Password strength evaluation
  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authApi.listSessions();
      setSessions(res.data || []);
      setError("");
    } catch (e) {
      console.error("Failed to load sessions:", e);
      setError(e instanceof Error ? e.message : "Unable to load active sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Load current user details
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}

    authApi
      .getCurrentUser()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          try {
            sessionStorage.setItem("user", JSON.stringify(user));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Auto-dismiss success notification after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      const timeA = new Date(a.lastActivityAt || a.createdAt).getTime();
      const timeB = new Date(b.lastActivityAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [sessions]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword.trim()) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation password do not match.");
      return;
    }

    setChangingPassword(true);

    try {
      const userId = currentUser?.id || "me";
      await authApi.changePassword(userId, currentPassword, newPassword);

      setPasswordSuccess(
        "Password changed successfully! All existing device sessions have been revoked for your security. Redirecting to login...",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Update cached user to clear mustChangePassword
      if (currentUser) {
        const updated = { ...currentUser, mustChangePassword: false };
        setCurrentUser(updated);
        try {
          sessionStorage.setItem("user", JSON.stringify(updated));
          localStorage.setItem("user", JSON.stringify(updated));
        } catch {}
      }

      // Smooth sign-out and redirect to login after 1.8s
      setTimeout(() => {
        void logout();
      }, 1800);
    } catch (err: any) {
      console.error("Password change failed:", err);
      const serverErr =
        err?.response?.data?.error ||
        err?.details?.error ||
        err?.message ||
        "";
      if (
        serverErr === "invalid_current_password" ||
        serverErr.includes("invalid_current_password")
      ) {
        setPasswordError("The current password you entered is incorrect. Please try again.");
      } else if (
        serverErr === "password_too_short" ||
        serverErr.includes("at least 8")
      ) {
        setPasswordError("New password must be at least 8 characters long.");
      } else if (
        serverErr === "forbidden" ||
        serverErr.includes("forbidden")
      ) {
        setPasswordError("You do not have permission to change this password.");
      } else {
        setPasswordError(
          err?.response?.data?.message ||
            err?.details?.message ||
            err?.message ||
            "Failed to change password. Please verify your details and try again.",
        );
      }
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRevoke(session: Session) {
    if (revokingId) return;
    setRevokingId(session.id);
    setError("");
    setSuccess("");

    const isCurrentSession =
      Boolean(session.isCurrent) ||
      Boolean(
        currentUa &&
        session.userAgent === currentUa &&
        sessions.length > 0 &&
        sortedSessions[0]?.id === session.id,
      );

    try {
      // Optimistic update
      setSessions((prev) => prev.filter((s) => s.id !== session.id));

      const resRevoke = await authApi.revokeSession(session.id);
      const serverCurrent = Boolean((resRevoke as any)?.isCurrentSession);

      if (isCurrentSession || serverCurrent) {
        setSuccess("Current session revoked. Redirecting to login...");
        setTimeout(() => {
          void logout();
        }, 800);
        return;
      }

      setSuccess("Session revoked successfully.");
      // Refresh to confirm backend state
      const res = await authApi.listSessions();
      setSessions(res.data || []);
    } catch (e) {
      console.error("Error revoking session:", e);
      setError(
        e instanceof Error
          ? `Revocation failed: ${e.message}`
          : "Failed to revoke session. Please try again.",
      );
      // Restore previous state by reloading
      void load();
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogoutAll() {
    setLoggingOutAll(true);
    setError("");
    setShowSignoutModal(false);
    try {
      await logoutAllSessions();
    } catch (e) {
      console.error("Error logging out all sessions:", e);
      setError(
        e instanceof Error
          ? e.message
          : "Failed to revoke all sessions. Please try again.",
      );
      setLoggingOutAll(false);
    }
  }

  function getDeviceIcon(deviceType: "desktop" | "mobile" | "tablet") {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-5 w-5 text-indigo-500" />;
      case "tablet":
        return <Tablet className="h-5 w-5 text-purple-500" />;
      default:
        return <Laptop className="h-5 w-5 text-blue-500" />;
    }
  }

  return (
    <AppLayout>
      <main className="account-security-page space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHero
          eyebrow="ACCOUNT SETTINGS"
          title="Account & Security"
          description="Update your password credentials, safeguard your account, and manage active authentication sessions across your devices."
          icon={ShieldCheck}
          actions={
            <button
              id="refresh-sessions-btn"
              className="btn-secondary flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh sessions"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin text-blue-600" : "text-slate-600 dark:text-slate-300"}
              />
              <span>Refresh</span>
            </button>
          }
        />

        {/* Global Status Alerts */}
        {error && (
          <div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-300 shadow-sm"
            role="alert"
          >
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="font-semibold block">Security Error</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-4 text-emerald-800 dark:text-emerald-300 shadow-sm transition-all"
            role="alert"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{success}</div>
          </div>
        )}

        {/* Security Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Sessions
              </span>
              <Shield className="h-4 w-4 text-blue-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {sessions.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Authorized device sessions
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Password Policy
              </span>
              <KeyRound className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {currentUser?.mustChangePassword ? "Change Required" : "Enforced"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Min 8 chars, mixed complexity
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Security Posture
              </span>
              {currentUser?.mustChangePassword ? (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              )}
            </div>
            <p
              className={`mt-2 text-2xl font-bold ${
                currentUser?.mustChangePassword
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {currentUser?.mustChangePassword ? "Action Needed" : "Protected"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {currentUser?.mustChangePassword
                ? "Temporary password in use"
                : "HttpOnly cookies & IP bind"}
            </p>
          </div>
        </div>

        {/* Change Password Card */}
        <section
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
          aria-label="Change account password"
        >
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Change Password
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update your credentials. For your protection, all active sessions across other devices will be invalidated.
                </p>
              </div>
            </div>

            {currentUser?.mustChangePassword && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 animate-pulse">
                <AlertTriangle size={13} />
                Password Change Required
              </span>
            )}
          </div>

          <div className="p-6">
            {/* Forced Password Change Notice */}
            {currentUser?.mustChangePassword && (
              <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 p-4 text-amber-900 dark:text-amber-200 text-sm flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block">Action Required: Set Permanent Password</strong>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                    Your account is currently flagged to require a password update before accessing full platform operations. Please enter your temporary password below and choose a permanent password.
                  </p>
                </div>
              </div>
            )}

            {/* Password Form Feedback */}
            {passwordError && (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-300 shadow-sm"
                role="alert"
              >
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <strong className="font-semibold block">Cannot Update Password</strong>
                  <p>{passwordError}</p>
                </div>
              </div>
            )}

            {passwordSuccess && (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-4 text-emerald-800 dark:text-emerald-300 shadow-sm"
                role="alert"
              >
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-sm font-medium">{passwordSuccess}</div>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-5 max-w-2xl">
              {/* Current Password Field */}
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Current Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    name="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {/* New Password Field */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {newPassword.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Password Strength:</span>
                      <span
                        className={`font-semibold ${
                          strength.score <= 1
                            ? "text-red-600 dark:text-red-400"
                            : strength.score === 2
                            ? "text-amber-600 dark:text-amber-400"
                            : strength.score === 3
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {strength.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.score >= 1 ? strength.colorClass : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.score >= 2 ? strength.colorClass : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.score >= 3 ? strength.colorClass : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${
                          strength.score >= 4 ? strength.colorClass : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                    </div>

                    {/* Requirements Checklist */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                      <div
                        className={`flex items-center gap-1.5 ${
                          strength.hasMinLength
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {strength.hasMinLength ? <Check size={13} /> : <X size={13} />}
                        <span>At least 8 characters</span>
                      </div>
                      <div
                        className={`flex items-center gap-1.5 ${
                          strength.hasCase
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {strength.hasCase ? <Check size={13} /> : <X size={13} />}
                        <span>Upper & lowercase</span>
                      </div>
                      <div
                        className={`flex items-center gap-1.5 ${
                          strength.hasNumberOrSymbol
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {strength.hasNumberOrSymbol ? <Check size={13} /> : <X size={13} />}
                        <span>Number or symbol</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password Field */}
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {/* Match Indicator */}
                {confirmPassword.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    {passwordsMatch ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <Check size={14} /> Passwords match
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <AlertTriangle size={14} /> Passwords do not match yet
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  id="update-password-btn"
                  disabled={changingPassword || (confirmPassword.length > 0 && !passwordsMatch)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      <span>Update Password</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordError(null);
                  }}
                  disabled={changingPassword || (!currentPassword && !newPassword && !confirmPassword)}
                  className="px-4 py-2.5 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Alert & Notification Preferences Card */}
        <section
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
          aria-label="Alert and notification preferences"
        >
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Alert & Notification Preferences
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure how security incidents alert you. These settings are tied to your personal account.
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
              <CheckCircle2 size={13} />
              Account Synced
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Setting 1: Incident Modal Popup */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Emergency Alert Modal Popup
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${alertPopupEnabled ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-slate-200 dark:bg-slate-800 text-slate-500"}`}>
                    {alertPopupEnabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                  Automatically display a fullscreen incident triage modal when critical (P1/P2) alerts are detected. When disabled, alerts remain accessible in your dashboard queue without interrupting your workflow.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={alertPopupEnabled}
                onClick={() => setAlertPopupEnabled(!alertPopupEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${alertPopupEnabled ? "bg-amber-600" : "bg-slate-300 dark:bg-slate-700"}`}
                title={alertPopupEnabled ? "Disable emergency modal popups" : "Enable emergency modal popups"}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${alertPopupEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Setting 2: Corner Toast Notifications */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Corner Toast Notification Banners
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${alertToastEnabled ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-slate-200 dark:bg-slate-800 text-slate-500"}`}>
                    {alertToastEnabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                  Show floating notification cards in the bottom-right corner of your screen when operational and AI alerts are raised.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={alertToastEnabled}
                onClick={() => setAlertToastEnabled(!alertToastEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${alertToastEnabled ? "bg-amber-600" : "bg-slate-300 dark:bg-slate-700"}`}
                title={alertToastEnabled ? "Disable toast notifications" : "Enable toast notifications"}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${alertToastEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Active Sessions List Card */}
        <section
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
          aria-label="Active account sessions"
        >
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Active Devices & Sessions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each session represents a signed-in browser or device client.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && sessions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                <p className="text-sm">Loading active sessions...</p>
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-10 w-10 mx-auto text-emerald-500 mb-2 opacity-70" />
                <p className="text-base font-medium text-slate-700 dark:text-slate-300">
                  No active sessions found
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Log in to manage and view your active device sessions.
                </p>
              </div>
            ) : (
              sortedSessions.map((session, index) => {
                const uaInfo = parseUserAgent(session.userAgent);
                const isCurrent =
                  Boolean(session.isCurrent) ||
                  (index === 0 &&
                    Boolean(currentUa && session.userAgent === currentUa));
                const isRevoking = revokingId === session.id;
                const isExpanded = expandedSessionId === session.id;

                return (
                  <article
                    key={session.id}
                    className="p-5 sm:p-6 transition hover:bg-slate-50/75 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Device Icon and Info */}
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                          {getDeviceIcon(uaInfo.deviceType)}
                        </div>

                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {uaInfo.label}
                            </strong>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Current device
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                              <Globe size={11} className="text-slate-400" />
                              {session.ipAddress || "Unknown IP"}
                            </span>
                            <span>•</span>
                            <span title={new Date(session.lastActivityAt || session.createdAt).toLocaleString()}>
                              Last active {formatRelativeTime(session.lastActivityAt || session.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          onClick={() =>
                            setExpandedSessionId(
                              isExpanded ? null : session.id,
                            )
                          }
                          aria-label={isExpanded ? "Hide technical details" : "Show technical details"}
                        >
                          <span>{isExpanded ? "Less" : "Details"}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        <button
                          type="button"
                          id={`revoke-session-${session.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/60 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          onClick={() => void handleRevoke(session)}
                          disabled={isRevoking || loggingOutAll}
                          aria-label={`Revoke session for ${uaInfo.label}`}
                        >
                          {isRevoking ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>Revoking...</span>
                            </>
                          ) : (
                            <>
                              <Trash2 size={13} />
                              <span>Revoke</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Technical Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs space-y-1.5 bg-slate-50/70 dark:bg-slate-950/40 p-3 rounded-lg font-mono">
                        <div className="flex flex-wrap gap-2 text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-500">Session ID:</span>
                          <span className="select-all text-slate-800 dark:text-slate-200">{session.id}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-500">Created:</span>
                          <span>{new Date(session.createdAt || session.lastActivityAt).toLocaleString()}</span>
                        </div>
                        {session.expiresAt && (
                          <div className="flex flex-wrap gap-2 text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-slate-500">Expires:</span>
                            <span>{new Date(session.expiresAt).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 text-slate-600 dark:text-slate-400 break-all">
                          <span className="font-semibold text-slate-500">User Agent:</span>
                          <span className="text-[11px] text-slate-700 dark:text-slate-300">
                            {session.userAgent || "None provided"}
                          </span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Sign Out Everywhere Section */}
        <section
          className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          aria-label="Global session termination"
        >
          <div className="flex items-start gap-3.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">
                Sign out everywhere
              </strong>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Immediately revoke every active session across all devices, including this browser.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="signout-all-sessions-btn"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-800/80 border border-amber-300 dark:border-amber-700 transition shrink-0 disabled:opacity-50"
            onClick={() => setShowSignoutModal(true)}
            disabled={loggingOutAll}
          >
            {loggingOutAll ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Signing out all...</span>
              </>
            ) : (
              <>
                <LogOut size={15} />
                <span>Sign out all sessions</span>
              </>
            )}
          </button>
        </section>

        {/* Confirmation Modal */}
        {showSignoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Sign out from all devices?
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This will immediately invalidate all active sessions across all computers, tablets, and phones. You will need to log back in on this device.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  onClick={() => setShowSignoutModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition"
                  onClick={() => void handleLogoutAll()}
                >
                  Confirm Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
