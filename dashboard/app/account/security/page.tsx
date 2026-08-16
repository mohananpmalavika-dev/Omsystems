"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Laptop,
  LogOut,
  Monitor,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi } from "@/lib/api-client";
import { logout, logoutAllSessions } from "@/lib/auth-manager";

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

export default function AccountSecurityPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [showSignoutModal, setShowSignoutModal] = useState(false);

  const currentUa = typeof navigator !== "undefined" ? navigator.userAgent : "";

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

  // Auto-dismiss success notification after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const timeA = new Date(a.lastActivityAt || a.createdAt).getTime();
      const timeB = new Date(b.lastActivityAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [sessions]);

  async function handleRevoke(session: Session) {
    if (revokingId) return;
    setRevokingId(session.id);
    setError("");
    setSuccess("");

    const isCurrentSession =
      currentUa &&
      session.userAgent === currentUa &&
      sessions.length > 0 &&
      sortedSessions[0]?.id === session.id;

    try {
      // Optimistic update
      setSessions((prev) => prev.filter((s) => s.id !== session.id));

      await authApi.revokeSession(session.id);

      if (isCurrentSession) {
        setSuccess("Current session revoked. Redirecting to login...");
        setTimeout(() => {
          void logout();
        }, 1200);
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
          eyebrow="ADMINISTRATION"
          title="Account & Security"
          description="Review active authentication sessions across your devices. Revoke unrecognized or inactive sessions to safeguard access."
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

        {/* Status Alerts */}
        {error && (
          <div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/40 p-4 text-red-800 dark:text-red-300 shadow-sm"
            role="alert"
          >
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="font-semibold block">Error</strong>
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
                Session Policy
              </span>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              30 Days
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Max lifetime with auto-refresh
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Security Posture
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              Protected
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              HttpOnly cookies & IP bind
            </p>
          </div>
        </div>

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
                  index === 0 &&
                  Boolean(currentUa && session.userAgent === currentUa);
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
