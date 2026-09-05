"use client";

import {
  BellRing,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  Radio,
  Siren,
  Volume2,
  VolumeX,
  X,
  Maximize2,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSessionResponse } from "@/lib/types";
import { startLiveFromBrowser } from "@/lib/live-client";
import {
  activeDashboardQueue,
  dashboardEvidenceUrl,
  evidenceAvailable,
  hasManagedEvidence,
  popupQueue,
  terminalAlertStatus,
  type AlertEvidenceCaptureStatus,
  type CommandAlert,
} from "@/lib/alert-command-center";
import { HlsPlayer } from "@/components/hls-player";
import { alertAudioService } from "@/services/alert-audio/alert-audio.service";
import type { AlertAudioStatus, AlertSeverity } from "@/services/alert-audio/alert-audio.types";
import { CriticalAudioWarningBanner } from "@/components/alerts/critical-audio-warning-banner";
import { AlertAudioActivationModal } from "@/components/alerts/alert-audio-activation-modal";
import { IncidentImageModal } from "@/components/incident-image-modal";

type EvidenceMode = "live" | "snapshot" | "clip";

export function GlobalAlertCenter() {
  const pathname = usePathname();
  const enabledForRoute = pathname !== "/login";
  const [alerts, setAlerts] = useState<CommandAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [manualAlertId, setManualAlertId] = useState<string>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AlertAudioStatus>(alertAudioService.getAudioStatus());
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [session, setSession] = useState<LiveSessionResponse>();
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("live");
  const [evidenceStatus, setEvidenceStatus] = useState<AlertEvidenceCaptureStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notificationAlert, setNotificationAlert] = useState<CommandAlert>();
  const alertsRef = useRef<CommandAlert[]>([]);
  const hasLoadedAlerts = useRef(false);
  const notificationTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return alertAudioService.onStatusChange(setAudioStatus);
  }, []);

  const load = useCallback(async () => {
    if (!enabledForRoute) return;
    try {
      const response = await fetch("/api/control/v1/alerts/command-center?limit=200", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;
      const body = await response.json();
      const nextAlerts = (body.data ?? []) as CommandAlert[];
      if (hasLoadedAlerts.current) {
        const previousIds = new Set(alertsRef.current.map((alert) => alert.id));
        const newAlert = nextAlerts.find((alert) => !previousIds.has(alert.id));
        if (newAlert) {
          if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
          setNotificationAlert(newAlert);
          notificationTimer.current = window.setTimeout(() => setNotificationAlert(undefined), 8_000);
        }
      }
      hasLoadedAlerts.current = true;
      alertsRef.current = nextAlerts;
      setAlerts(nextAlerts);
    } catch {
      // SSE reconnect and polling fallback
    }
  }, [enabledForRoute]);

  useEffect(() => {
    if (!enabledForRoute) return;
    void load();

    const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true });

    // On created — fetch enriched single alert and insert
    events.addEventListener("alert.created", async (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        const alertId = payload.alertId as string;
        if (!alertId) return;
        const response = await fetch(`/api/control/v1/alerts/command-center/${encodeURIComponent(alertId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const body = await response.json();
        const next = (body.data ?? []) as CommandAlert[];
        if (next.length === 0) return;
        const newAlert = next[0];
        if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
        setNotificationAlert(newAlert);
        notificationTimer.current = window.setTimeout(() => setNotificationAlert(undefined), 8_000);
        alertsRef.current = [newAlert, ...alertsRef.current.filter((alert) => alert.id !== newAlert.id)];
        setAlerts((prev) => {
          const present = prev.find((a) => a.id === newAlert.id);
          if (present) return prev.map((a) => (a.id === newAlert.id ? newAlert : a));
          return [newAlert, ...prev];
        });

        // Trigger centralized alert audio
        void alertAudioService.playAlert({
          alertId: newAlert.id,
          severity: (newAlert.severity ?? "P3") as AlertSeverity,
          title: newAlert.title,
          branchName: newAlert.branchName,
          cameraName: newAlert.cameraName,
          detectionType: newAlert.detectionType,
        });
      } catch { }
    });

    // On updated — fetch and replace
    events.addEventListener("alert.updated", async (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        const alertId = payload.alertId as string;
        if (!alertId) return;
        const response = await fetch(`/api/control/v1/alerts/command-center/${encodeURIComponent(alertId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const body = await response.json();
        const updated = (body.data ?? [])[0] as CommandAlert | undefined;
        if (!updated) return;
        setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

        if (updated.status === "acknowledged" || updated.status === "resolved") {
          alertAudioService.stopAlert(updated.id);
        }
      } catch { }
    });

    // Fallback periodic reconciliation every 45 seconds
    const timer = window.setInterval(load, 45_000);
    return () => {
      events.close();
      window.clearInterval(timer);
      if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    };
  }, [enabledForRoute, load]);

  const dashboardQueue = useMemo(() => activeDashboardQueue(alerts), [alerts]);
  const urgentQueue = useMemo(() => popupQueue(alerts, dismissed), [alerts, dismissed]);
  const current = dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0];

  const activeP1Count = useMemo(() => {
    return alerts.filter((a) => a.severity === "P1" && !terminalAlertStatus(a.status)).length;
  }, [alerts]);

  useEffect(() => {
    if (!current) return;
    void alertAudioService.playAlert({
      alertId: current.id,
      severity: (current.severity ?? "P3") as AlertSeverity,
      title: current.title,
      branchName: current.branchName,
      cameraName: current.cameraName,
      detectionType: current.detectionType,
    });
  }, [current?.id]);

  useEffect(() => {
    setSession(undefined);
    setEvidenceStatus(undefined);
    setError(undefined);
    setShowImageModal(false);
    setEvidenceMode("live");
  }, [current?.id]);

  const startLive = useCallback(async (alert: CommandAlert) => {
    if (alert.cameraStatus === "offline") {
      setError("Camera is offline. Review the captured evidence.");
      setEvidenceMode(
        evidenceAvailable(alert, "snapshot", evidenceStatus)
          ? "snapshot"
          : evidenceAvailable(alert, "clip", evidenceStatus)
          ? "clip"
          : "live"
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const body = await startLiveFromBrowser(alert.cameraId, "sub");
      setSession(body);
    } catch {
      setError("Live video could not start. Captured evidence will be shown as soon as it is ready.");
      if (evidenceAvailable(alert, "snapshot", evidenceStatus)) setEvidenceMode("snapshot");
      else if (evidenceAvailable(alert, "clip", evidenceStatus)) setEvidenceMode("clip");
    } finally {
      setBusy(false);
    }
  }, [evidenceStatus]);

  useEffect(() => {
    if (current && evidenceMode === "live" && !session && !busy && !error) void startLive(current);
  }, [busy, current, evidenceMode, error, session, startLive]);

  const act = async (alert: CommandAlert, action: "acknowledge" | "escalate") => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/control/v1/analytics/alerts/${alert.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: alert.version,
          notes:
            action === "acknowledge"
              ? "Acknowledged from global HO alert popup"
              : "Escalated from global HO alert popup",
        }),
      });
      if (response.status === 409) {
        setError("This alert was updated by another operator. The queue has been refreshed.");
      } else if (!response.ok) {
        throw new Error("alert_action_failed");
      }

      // Stop repeating audio alarm immediately on successful ACK
      if (action === "acknowledge") {
        alertAudioService.stopAlert(alert.id);
      }

      setManualAlertId(undefined);
      setDismissed((items) => new Set(items).add(alert.id));
      await load();
    } catch {
      setError(`Unable to ${action} this alert. Check your permission and connection.`);
    } finally {
      setBusy(false);
    }
  };

  const dismissCurrent = () => {
    if (!current) return;
    alertAudioService.stopAlert(current.id);
    setManualAlertId(undefined);
    setDismissed((items) => new Set(items).add(current.id));
  };

  if (!enabledForRoute) return null;

  return (
    <>
      {/* Top Floating Alert Banner / Warning (Only when active P1 alerts exist) */}
      {activeP1Count > 0 && (
        <div className="fixed top-24 right-4 z-40 space-y-2 max-w-lg w-full pointer-events-none">
          <div className="pointer-events-auto">
            <CriticalAudioWarningBanner activeP1Count={activeP1Count} />
          </div>
        </div>
      )}

      {notificationAlert && (
        <div className="fixed bottom-5 right-5 z-[60] w-[calc(100vw-2rem)] max-w-[380px]">
          <button
            type="button"
            onClick={() => {
              setManualAlertId(notificationAlert.id);
              setDismissed((items) => {
                const next = new Set(items);
                next.delete(notificationAlert.id);
                return next;
              });
              setNotificationAlert(undefined);
            }}
            className={`w-full rounded-xl border p-4 text-left shadow-2xl backdrop-blur-md transition hover:-translate-y-0.5 ${
              notificationAlert.severity === "P1"
                ? "border-rose-400/60 bg-rose-950/95"
                : "border-amber-400/50 bg-slate-950/95"
            }`}
          >
            <span className="flex items-start gap-3">
              <span className={notificationAlert.severity === "P1" ? "text-rose-300" : "text-amber-300"}>
                <AlertTriangle className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                  AI Alert <Priority value={notificationAlert.severity} />
                </span>
                <span className="mt-1 block truncate text-sm font-semibold text-white">{notificationAlert.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-400">
                  {notificationAlert.branchName || notificationAlert.branchId} • {notificationAlert.cameraName || notificationAlert.cameraId}
                </span>
              </span>
              <span
                role="button"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation();
                  setNotificationAlert(undefined);
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Main Popup Modal */}
      {current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans">
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    current.severity === "P1"
                      ? "bg-rose-500/20 border-rose-500/30 text-rose-400 animate-pulse"
                      : "bg-amber-500/20 border-amber-500/30 text-amber-400"
                  }`}
                >
                  <Siren className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>{current.title}</span>
                    <Priority value={current.severity} />
                  </h3>
                  <p className="text-xs text-slate-400">
                    {current.branchName || current.branchId} • {current.cameraName || current.cameraId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Sla alert={current} />
                <button
                  onClick={dismissCurrent}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Live Video / Snapshot / Clip Player Display */}
              <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-slate-800 flex items-center justify-center">
                {evidenceMode === "snapshot" ? (
                  <div
                    className="relative w-full h-full flex items-center justify-center bg-black cursor-pointer group select-none"
                    onClick={() => setShowImageModal(true)}
                    title="Click to enlarge snapshot image"
                  >
                    <img
                      src={`/api/control/v1/alerts/${current.id}/evidence/snapshot`}
                      alt={current.title}
                      className="max-h-full max-w-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-all flex items-center justify-center pointer-events-none">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/90 text-slate-100 text-xs px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-2 shadow-2xl backdrop-blur-md">
                        <Maximize2 className="h-4 w-4 text-sky-400" />
                        <span className="font-semibold">Click to open full image</span>
                      </span>
                    </div>
                  </div>
                ) : session?.hls?.url ? (
                  <HlsPlayer
                    url={session.hls.url}
                    bearerToken={session.hls.bearerToken ?? ""}
                    cameraName={current.cameraName || current.cameraId}
                  />
                ) : (
                  <div className="text-center p-4">
                    <Radio className="h-8 w-8 text-slate-600 animate-pulse mx-auto mb-2" />
                    <span className="text-xs font-mono text-slate-400">Connecting to secure edge media gateway…</span>
                    <div className="mt-3">
                      <button
                        onClick={() => setEvidenceMode("snapshot")}
                        className="text-xs px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium inline-flex items-center gap-1.5 shadow transition-colors"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Open Incident Snapshot</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Evidence Mode Switcher Bar */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 p-1 rounded-lg bg-black/80 backdrop-blur border border-slate-700 text-xs font-mono z-10">
                  <button
                    onClick={() => setEvidenceMode("live")}
                    className={`px-2.5 py-1 rounded ${
                      evidenceMode === "live" ? "bg-sky-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Live Video
                  </button>
                  <button
                    onClick={() => setEvidenceMode("snapshot")}
                    className={`px-2.5 py-1 rounded ${
                      evidenceMode === "snapshot"
                        ? "bg-sky-600 text-white font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Snapshot
                  </button>
                  <button
                    onClick={() => setEvidenceMode("clip")}
                    className={`px-2.5 py-1 rounded ${
                      evidenceMode === "clip" ? "bg-sky-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    20s Clip
                  </button>
                </div>

                {evidenceMode === "snapshot" && (
                  <button
                    onClick={() => setShowImageModal(true)}
                    className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-xs font-mono text-slate-300 hover:text-white border border-slate-700 z-10"
                    title="Open in full-screen modal"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Enlarge</span>
                  </button>
                )}
              </div>

              {/* Error Callout if any */}
              {error && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
                  {error}
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950/80">
              <div className="text-xs text-slate-400 font-mono">
                Triggered at: {new Date(current.firstDetectedAt || current.createdAt).toLocaleTimeString()}
              </div>

              <div className="flex items-center gap-3">
                <button
                  disabled={busy}
                  onClick={() => act(current, "escalate")}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-amber-600/60 bg-amber-950/40 hover:bg-amber-900 text-amber-200 transition-colors disabled:opacity-50"
                >
                  Escalate Incident
                </button>

                <button
                  disabled={busy}
                  onClick={() => act(current, "acknowledge")}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Acknowledge & Stop Alarm</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Room Audio Activation Modal */}
      <AlertAudioActivationModal
        isOpen={showActivationModal}
        onClose={() => setShowActivationModal(false)}
      />

      {/* Incident Snapshot Image Modal */}
      {current && (
        <IncidentImageModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          imageUrl={`/api/control/v1/alerts/${current.id}/evidence/snapshot`}
          title={current.title}
          cameraName={current.cameraName || current.cameraId}
          branchName={current.branchName || current.branchId}
          timestamp={current.firstDetectedAt || current.createdAt}
          severity={current.severity}
          confidence={current.confidence}
        />
      )}
    </>
  );
}

function Priority({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-bold font-mono ${
        value === "P1"
          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
          : value === "P2"
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          : "bg-sky-500/20 text-sky-400 border border-sky-500/30"
      }`}
    >
      {value}
    </span>
  );
}

function Sla({ alert }: { alert: CommandAlert }) {
  if (!alert.slaDueAt || terminalAlertStatus(alert.status)) return null;
  const seconds = Math.floor((Date.parse(alert.slaDueAt) - Date.now()) / 1_000);
  return (
    <span
      className={`flex items-center gap-1 text-xs font-mono font-semibold ${
        seconds < 0 ? "text-rose-400 animate-pulse" : "text-slate-400"
      }`}
    >
      <Clock3 size={13} />
      {seconds < 0 ? "SLA Overdue" : `${Math.ceil(seconds / 60)}m SLA`}
    </span>
  );
}
