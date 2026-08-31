"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  Clock,
  HardDrive,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import { EnhancedCameraGrid, type GridLayout } from "@/components/enhanced-camera-grid";
import type { Camera as CameraType } from "@/lib/types";
import {
  endControlRoomActivity,
  startControlRoomActivity,
  trackControlRoomCameraSwitch,
} from "@/lib/control-room-tracker";

interface ControlRoomStats {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  openIncidents: number;
  unacknowledgedAlerts: number;
  recordingCameras: number;
  storageUsagePercent: number;
  storageSummary: {
    totalCount: number;
    warningCount: number;
    smartIssueCount: number;
    raidIssueCount: number;
    writeProbeFailureCount: number;
  };
}

type DataSection = "cameras" | "health" | "alerts";
type DataMode = "live" | "partial" | "unavailable";
type UserTier = "basic" | "standard" | "premium" | "enterprise";

export const getMaxConcurrentStreams = (userTier: UserTier = "standard") => {
  const limits: Record<UserTier, number> = {
    basic: 16,
    standard: 32,
    premium: 64,
    enterprise: 144,
  };
  return limits[userTier];
};

const configuredTier = process.env.NEXT_PUBLIC_USER_TIER;
const controlRoomTier: UserTier = configuredTier === "basic" || configuredTier === "premium" ||
  configuredTier === "enterprise" || configuredTier === "standard"
  ? configuredTier
  : "standard";

export const CONTROL_ROOM_MAX_CONCURRENT_STREAMS = getMaxConcurrentStreams(controlRoomTier);

const DEFAULT_EMPTY_STATS: ControlRoomStats = {
  totalCameras: 0,
  onlineCameras: 0,
  offlineCameras: 0,
  openIncidents: 0,
  unacknowledgedAlerts: 0,
  recordingCameras: 0,
  storageUsagePercent: 0,
  storageSummary: {
    totalCount: 0,
    warningCount: 0,
    smartIssueCount: 0,
    raidIssueCount: 0,
    writeProbeFailureCount: 0,
  },
};

const getInitialLayout = (allCameras: CameraType[]): GridLayout => ({
  name: "Substream overview",
  gridSize: "4x4",
  positions: allCameras.slice(0, 16).map((camera, position) => ({
    position,
    cameraId: camera.id,
    stream: "sub" as const,
  })),
});

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return token ? { "x-sentinel-session": token } : {};
}

async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    headers: getAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(body?.message || body?.error || `Request failed (${response.status})`);
  }
  return response.json();
}

function parseCameras(body: unknown): CameraType[] {
  if (Array.isArray(body)) return body as CameraType[];
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  return Array.isArray(data) ? data as CameraType[] : [];
}

function parsePriorityCameraIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const responseBody = body as { data?: unknown; alerts?: unknown };
  const nestedData = responseBody.data && typeof responseBody.data === "object"
    ? (responseBody.data as { alerts?: unknown }).alerts
    : undefined;
  const alerts = Array.isArray(responseBody.data)
    ? responseBody.data
    : Array.isArray(nestedData)
      ? nestedData
      : Array.isArray(responseBody.alerts)
        ? responseBody.alerts
        : [];

  return Array.from(new Set(alerts
    .filter((alert): alert is { severity?: string; status?: string; cameraId?: string } =>
      Boolean(alert && typeof alert === "object"))
    .filter((alert) =>
      ["critical", "high", "p1", "p2"].includes(String(alert.severity).toLowerCase()) &&
      String(alert.status).toLowerCase() !== "resolved")
    .map((alert) => alert.cameraId)
    .filter((cameraId): cameraId is string => typeof cameraId === "string" && cameraId.length > 0)));
}

function parseStats(body: unknown): ControlRoomStats {
  const responseBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const data = responseBody.data && typeof responseBody.data === "object"
    ? responseBody.data as Record<string, unknown>
    : responseBody;
  const storageSummary = data.storageSummary && typeof data.storageSummary === "object"
    ? data.storageSummary as Record<string, unknown>
    : {};
  const storageSummaryLegacy = data.storage_summary && typeof data.storage_summary === "object"
    ? data.storage_summary as Record<string, unknown>
    : {};

  return {
    totalCameras: Number(data.totalCameras ?? data.total_cameras ?? 0),
    onlineCameras: Number(data.camerasOnline ?? data.cameras_online ?? 0),
    offlineCameras: Number(data.camerasOffline ?? data.cameras_offline ?? 0),
    openIncidents: Number(data.openIncidents ?? data.open_incidents ?? 0),
    unacknowledgedAlerts: Number(data.unacknowledgedAlerts ?? data.unacknowledged_alerts ?? 0),
    recordingCameras: Number(data.camerasRecording ?? data.cameras_recording ?? 0),
    storageUsagePercent: Number(data.storageUsagePercent ?? data.storage_usage_percent ?? 0),
    storageSummary: {
      totalCount: Number(storageSummary.totalCount ?? storageSummaryLegacy.total_count ?? 0),
      warningCount: Number(storageSummary.warningCount ?? storageSummaryLegacy.warning_count ?? 0),
      smartIssueCount: Number(storageSummary.smartIssueCount ?? storageSummaryLegacy.smart_issue_count ?? 0),
      raidIssueCount: Number(storageSummary.raidIssueCount ?? storageSummaryLegacy.raid_issue_count ?? 0),
      writeProbeFailureCount: Number(storageSummary.writeProbeFailureCount ?? storageSummaryLegacy.write_probe_failure_count ?? 0),
    },
  };
}

function formatFailedSections(sections: DataSection[]) {
  const labels: Record<DataSection, string> = {
    cameras: "camera inventory",
    health: "health summary",
    alerts: "priority alerts",
  };
  return sections.map((section) => labels[section]).join(", ");
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  return (
    <time className="header-time" dateTime={now.toISOString()}>
      <Clock size={16} aria-hidden="true" />
      {now.toLocaleString()}
    </time>
  );
}

export default function ControlRoomPage() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [priorityCameraIds, setPriorityCameraIds] = useState<string[]>([]);
  const [stats, setStats] = useState<ControlRoomStats>(DEFAULT_EMPTY_STATS);
  const [activeStreams, setActiveStreams] = useState(0);
  const [dataMode, setDataMode] = useState<DataMode>("live");
  const [failedSections, setFailedSections] = useState<DataSection[]>([]);
  const [cameraDataState, setCameraDataState] = useState<"pending" | "ready" | "error">("pending");
  const [healthDataReady, setHealthDataReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [monitoredCameraIds, setMonitoredCameraIds] = useState<string[]>([]);
  const monitoredCameraSignatureRef = useRef("");
  const monitoredCamerasRef = useRef<CameraType[]>([]);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  const initialLayout = useMemo(() => getInitialLayout(cameras), [cameras]);
  const monitoredCameras = useMemo(() => {
    const monitoredCameraSet = new Set(monitoredCameraIds);
    return cameras.filter((camera) => monitoredCameraSet.has(camera.id));
  }, [cameras, monitoredCameraIds]);
  const monitoringSignature = useMemo(() => monitoredCameras
    .map((camera) => `${camera.id}:${camera.branchId}:${camera.branchName ?? ""}`)
    .sort()
    .join("|"), [monitoredCameras]);
  const inventoryStats = useMemo(() => ({
    total: cameras.length,
    online: cameras.filter((camera) => camera.status !== "offline").length,
  }), [cameras]);
  const healthHasInventory = healthDataReady && (stats.totalCameras > 0 || cameras.length === 0);
  const displayedCameraTotal = healthHasInventory ? stats.totalCameras : inventoryStats.total;
  const displayedOnlineCameras = healthHasInventory ? stats.onlineCameras : inventoryStats.online;
  const storageIssueCount = stats.storageSummary.warningCount + stats.storageSummary.smartIssueCount +
    stats.storageSummary.raidIssueCount + stats.storageSummary.writeProbeFailureCount;

  useEffect(() => {
    monitoredCamerasRef.current = monitoredCameras;
  }, [monitoredCameras]);

  const loadData = useCallback(async (initial = false) => {
    const requestSequence = ++requestSequenceRef.current;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    if (initial) setLoading(true);
    else setRefreshing(true);

    try {
      const [cameraResult, statsResult, priorityResult] = await Promise.allSettled([
        requestJson("/api/control/v1/cameras?limit=500&action=live%3Aview", controller.signal),
        requestJson("/api/control/v1/operations/health/summary", controller.signal),
        requestJson("/api/control/v1/alerts/alert-center?limit=200", controller.signal),
      ]);
      if (requestSequence !== requestSequenceRef.current) return;

      const failed: DataSection[] = [];
      if (cameraResult.status === "fulfilled") {
        setCameras(parseCameras(cameraResult.value));
        setCameraDataState("ready");
      } else {
        failed.push("cameras");
        setCameraDataState("error");
      }

      if (statsResult.status === "fulfilled") {
        setStats(parseStats(statsResult.value));
        setHealthDataReady(true);
      } else {
        failed.push("health");
      }

      if (priorityResult.status === "fulfilled") {
        setPriorityCameraIds(parsePriorityCameraIds(priorityResult.value));
      } else {
        failed.push("alerts");
      }

      setFailedSections(failed);
      setDataMode(failed.length === 0 ? "live" : failed.length === 3 ? "unavailable" : "partial");
      if (failed.length < 3) setLastUpdatedAt(new Date());
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData(true);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadData();
    }, 30_000);
    return () => {
      window.clearInterval(refreshTimer);
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, [loadData]);

  const handleMonitoredCamerasChange = useCallback((cameraIds: string[]) => {
    const signature = cameraIds.join("|");
    if (monitoredCameraSignatureRef.current && monitoredCameraSignatureRef.current !== signature) {
      trackControlRoomCameraSwitch();
    }
    monitoredCameraSignatureRef.current = signature;
    setMonitoredCameraIds((current) => current.join("|") === signature ? current : cameraIds);
  }, []);

  useEffect(() => {
    if (loading || !monitoringSignature) return;

    const activityCameras = monitoredCamerasRef.current;
    const branchMap = new Map<string, string>();
    for (const camera of activityCameras) {
      if (camera.branchId) branchMap.set(camera.branchId, camera.branchName || camera.branchId);
    }
    const branchIds = [...branchMap.keys()];
    const branchNames = [...branchMap.values()];

    void startControlRoomActivity(
      branchIds.length === 1 ? "single_branch" : "multi_branch",
      branchIds.length === 1 ? branchIds[0] : undefined,
      undefined,
      undefined,
      activityCameras.map((camera) => camera.id),
      branchIds,
      branchNames,
      "live",
    ).catch(() => null);

    return () => {
      void endControlRoomActivity().catch(() => null);
    };
  }, [loading, monitoringSignature]);

  if (loading) {
    return (
      <div className="control-room-loading" role="status">
        <RefreshCw size={34} className="spin" />
        <p>Loading live video wall…</p>
        <style jsx>{`
          .control-room-loading { min-height: 70vh; display: grid; place-content: center; justify-items: center; gap: 12px; color: #475569; }
          .control-room-loading p { margin: 0; font-size: 14px; font-weight: 600; }
          .spin { animation: spin 0.9s linear infinite; color: #2563eb; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="control-room">
      <header className="control-room-header">
        <div className="header-title">
          <Video size={28} aria-hidden="true" />
          <div>
            <h1>Live Video Wall</h1>
            <p>Monitor authorized cameras across all branches</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`data-status ${dataMode}`}>
            <i />
            {dataMode === "live" ? "Live data" : dataMode === "partial" ? "Partially connected" : "Data unavailable"}
          </span>
          <HeaderClock />
          <button type="button" className="refresh-button" onClick={() => void loadData()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "spin" : ""} aria-hidden="true" />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      {failedSections.length > 0 && (
        <div className={`data-banner ${dataMode}`} role="status" aria-live="polite">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {dataMode === "unavailable"
              ? "Live operations services are unavailable. Last known data is kept on screen."
              : `Could not refresh ${formatFailedSections(failedSections)}. Other live data is still updating.`}
          </span>
          {lastUpdatedAt && <small>Last update {lastUpdatedAt.toLocaleTimeString()}</small>}
        </div>
      )}

      <section className="stats-bar" aria-label="Live monitoring summary">
        <div className="stat-card">
          <Camera size={21} className="stat-icon" aria-hidden="true" />
          <div><strong>{displayedOnlineCameras}/{displayedCameraTotal}</strong><span>Cameras online</span></div>
        </div>
        <div className="stat-card">
          <Play size={21} className="stat-icon green" aria-hidden="true" />
          <div><strong>{activeStreams}</strong><span>Wall streams</span></div>
        </div>
        <div className="stat-card">
          <Activity size={21} className="stat-icon purple" aria-hidden="true" />
          <div><strong>{stats.recordingCameras}</strong><span>Recording</span></div>
        </div>
        <div className="stat-card">
          <AlertTriangle size={21} className="stat-icon red" aria-hidden="true" />
          <div><strong>{stats.openIncidents}</strong><span>Open incidents</span></div>
        </div>
        <div className="stat-card">
          <Bell size={21} className="stat-icon amber" aria-hidden="true" />
          <div><strong>{stats.unacknowledgedAlerts}</strong><span>Unacknowledged</span></div>
        </div>
        <div className="stat-card">
          <HardDrive size={21} className="stat-icon blue" aria-hidden="true" />
          <div><strong>{stats.storageUsagePercent}%</strong><span>Storage used</span></div>
        </div>
      </section>

      {storageIssueCount > 0 && (
        <div className="storage-warning" role="status">
          <HardDrive size={16} aria-hidden="true" />
          <strong>{storageIssueCount} storage issue{storageIssueCount === 1 ? "" : "s"}</strong>
          <span>
            {stats.storageSummary.warningCount} warning · {stats.storageSummary.smartIssueCount} SMART · {stats.storageSummary.raidIssueCount} RAID · {stats.storageSummary.writeProbeFailureCount} write probe
          </span>
        </div>
      )}

      <section className="control-room-content" aria-label="Camera wall">
        {cameras.length > 0 ? (
          <EnhancedCameraGrid
            cameras={cameras}
            initialLayout={initialLayout}
            maxConcurrentStreams={CONTROL_ROOM_MAX_CONCURRENT_STREAMS}
            priorityCameraIds={priorityCameraIds}
            enableVirtualScrolling={false}
            enableGPUAcceleration
            onActiveStreamsChange={setActiveStreams}
            onMonitoredCamerasChange={handleMonitoredCamerasChange}
          />
        ) : cameraDataState === "error" ? (
          <div className="empty-control-room-card">
            <div className="empty-icon-wrap error"><AlertTriangle size={38} /></div>
            <h2>Camera inventory is unavailable</h2>
            <p>The wall could not load its authorized camera list. Check the control plane connection and try again.</p>
            <button type="button" className="primary-action" onClick={() => void loadData()} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? "spin" : ""} /> Try again
            </button>
          </div>
        ) : (
          <div className="empty-control-room-card">
            <div className="empty-icon-wrap"><Camera size={38} /></div>
            <h2>No authorized cameras</h2>
            <p>Onboard a branch and approve its discovered cameras to start live monitoring.</p>
            <Link href="/admin/branch-onboarding" className="primary-action">Onboard branch</Link>
          </div>
        )}
      </section>

      <style jsx>{`
        .control-room { min-height: 100vh; background: #f1f5f9; display: flex; flex-direction: column; color: #0f172a; }
        .control-room-header { padding: 18px 24px; color: white; background: linear-gradient(135deg, #172554, #1d4ed8); display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .header-title { display: flex; align-items: center; gap: 12px; min-width: 240px; }
        .header-title h1 { margin: 0; font-size: 24px; line-height: 1.2; }
        .header-title p { margin: 3px 0 0; color: #dbeafe; font-size: 13px; }
        .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
        .data-status, .header-time { display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; background: rgba(15,23,42,.24); font-size: 12px; font-weight: 650; white-space: nowrap; }
        .data-status i { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 3px rgba(74,222,128,.18); }
        .data-status.partial i { background: #fbbf24; box-shadow: 0 0 0 3px rgba(251,191,36,.2); }
        .data-status.unavailable i { background: #f87171; box-shadow: 0 0 0 3px rgba(248,113,113,.2); }
        .refresh-button, .primary-action { border: 0; border-radius: 8px; background: white; color: #1d4ed8; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
        .refresh-button:disabled, .primary-action:disabled { opacity: .65; cursor: wait; }
        .data-banner { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 16px; background: #fffbeb; border-bottom: 1px solid #fde68a; color: #92400e; font-size: 12px; }
        .data-banner.unavailable { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
        .data-banner small { margin-left: 6px; opacity: .8; }
        .stats-bar { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 10px; padding: 14px 24px; background: white; border-bottom: 1px solid #e2e8f0; }
        .stat-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 11px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
        .stat-card div { display: flex; min-width: 0; flex-direction: column; }
        .stat-card strong { font-size: 19px; line-height: 1.15; }
        .stat-card span { overflow: hidden; color: #64748b; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .stat-icon { flex: 0 0 auto; color: #475569; }
        .stat-icon.green { color: #059669; } .stat-icon.red { color: #dc2626; } .stat-icon.amber { color: #d97706; } .stat-icon.blue { color: #2563eb; } .stat-icon.purple { color: #7c3aed; }
        .storage-warning { margin: 12px 24px 0; padding: 9px 12px; display: flex; align-items: center; gap: 8px; border: 1px solid #fed7aa; border-radius: 8px; background: #fff7ed; color: #9a3412; font-size: 12px; }
        .storage-warning span { color: #7c2d12; }
        .control-room-content { flex: 1; min-height: 0; padding: 16px 24px 24px; }
        .empty-control-room-card { max-width: 520px; margin: 48px auto; padding: 46px 30px; display: flex; flex-direction: column; align-items: center; text-align: center; background: white; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
        .empty-icon-wrap { width: 68px; height: 68px; margin-bottom: 16px; display: grid; place-items: center; border-radius: 50%; background: #eff6ff; color: #2563eb; }
        .empty-icon-wrap.error { background: #fef2f2; color: #dc2626; }
        .empty-control-room-card h2 { margin: 0 0 8px; font-size: 20px; }
        .empty-control-room-card p { max-width: 430px; margin: 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.55; }
        .primary-action { min-height: 40px; padding: 0 18px; color: white; background: #2563eb; }
        .spin { animation: spin .9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1100px) { .stats-bar { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 720px) {
          .control-room-header { align-items: flex-start; padding: 15px 16px; flex-direction: column; }
          .header-actions { width: 100%; justify-content: flex-start; }
          .header-time { display: none; }
          .stats-bar { grid-template-columns: repeat(2, 1fr); padding: 12px 16px; }
          .data-banner { align-items: flex-start; justify-content: flex-start; flex-wrap: wrap; }
          .storage-warning { margin: 10px 16px 0; align-items: flex-start; flex-wrap: wrap; }
          .control-room-content { padding: 12px 16px 18px; }
        }
      `}</style>
    </div>
  );
}
