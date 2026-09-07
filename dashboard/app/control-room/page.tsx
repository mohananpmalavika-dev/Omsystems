"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Layers,
  MapPin,
  Maximize2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  SlidersHorizontal,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { EnhancedCameraGrid, type GridLayout, type GridSize } from "@/components/enhanced-camera-grid";
import { LiveAiWallPanel } from "@/components/live-ai-wall-panel";
import { useLiveAiWall } from "@/hooks/use-live-ai-wall";
import type { Camera as CameraType } from "@/lib/types";
import { normalizeCameraStreamProfiles } from "@/lib/camera-stream-profiles";
import { isLiveWallCameraOnline, selectLiveWallCameras } from "@/lib/live-wall-filters";
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

export interface HierarchyBranchInfo {
  branchId: string;
  branchName: string;
  zone: string;
  region: string;
  area: string;
  cameraCount: number;
  onlineCount: number;
}

type DataSection = "cameras" | "health" | "alerts" | "nodes";
type DataMode = "live" | "partial" | "unavailable";
type UserTier = "basic" | "standard" | "premium" | "enterprise";

const getMaxConcurrentStreams = (userTier: UserTier = "standard") => {
  const limits: Record<UserTier, number> = {
    basic: 16,
    standard: 32,
    premium: 64,
    enterprise: 144,
  };
  return limits[userTier];
};

const configuredTier = process.env.NEXT_PUBLIC_USER_TIER;
const controlRoomTier: UserTier =
  configuredTier === "basic" ||
  configuredTier === "premium" ||
  configuredTier === "enterprise" ||
  configuredTier === "standard"
    ? configuredTier
    : "standard";

const CONTROL_ROOM_MAX_CONCURRENT_STREAMS = getMaxConcurrentStreams(controlRoomTier);

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
    const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    throw new Error(body?.message || body?.error || `Request failed (${response.status})`);
  }
  return response.json();
}

function parseCameras(body: unknown): CameraType[] {
  if (Array.isArray(body)) {
    return body.map((camera) => normalizeCameraStreamProfiles(camera as CameraType & { profiles?: unknown }));
  }
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  const data = obj.data ?? obj.cameras ?? (obj.result as any)?.cameras;
  return Array.isArray(data)
    ? data.map((camera) => normalizeCameraStreamProfiles(camera as CameraType & { profiles?: unknown }))
    : [];
}

function parsePriorityCameraIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const responseBody = body as { data?: unknown; alerts?: unknown };
  const nestedData =
    responseBody.data && typeof responseBody.data === "object"
      ? (responseBody.data as { alerts?: unknown }).alerts
      : undefined;
  const alerts = Array.isArray(responseBody.data)
    ? responseBody.data
    : Array.isArray(nestedData)
    ? nestedData
    : Array.isArray(responseBody.alerts)
    ? responseBody.alerts
    : [];

  return Array.from(
    new Set(
      alerts
        .filter((alert): alert is { severity?: string; status?: string; cameraId?: string } =>
          Boolean(alert && typeof alert === "object")
        )
        .filter(
          (alert) =>
            ["critical", "high", "p1", "p2"].includes(String(alert.severity).toLowerCase()) &&
            String(alert.status).toLowerCase() !== "resolved"
        )
        .map((alert) => alert.cameraId)
        .filter((cameraId): cameraId is string => typeof cameraId === "string" && cameraId.length > 0)
    )
  );
}

function parseStats(body: unknown): ControlRoomStats {
  const responseBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data =
    responseBody.data && typeof responseBody.data === "object"
      ? (responseBody.data as Record<string, unknown>)
      : responseBody;
  const storageSummary =
    data.storageSummary && typeof data.storageSummary === "object"
      ? (data.storageSummary as Record<string, unknown>)
      : {};
  const storageSummaryLegacy =
    data.storage_summary && typeof data.storage_summary === "object"
      ? (data.storage_summary as Record<string, unknown>)
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
      writeProbeFailureCount: Number(
        storageSummary.writeProbeFailureCount ?? storageSummaryLegacy.write_probe_failure_count ?? 0
      ),
    },
  };
}

function formatFailedSections(sections: DataSection[]) {
  const labels: Record<DataSection, string> = {
    cameras: "camera inventory",
    health: "health summary",
    alerts: "priority alerts",
    nodes: "organization hierarchy",
  };
  return sections.map((section) => labels[section]).join(", ");
}

/** Inferred Geo-Hierarchy heuristic helper for clean grouping */
function inferHierarchy(branchName: string, cameraName: string = ""): { zone: string; region: string; area: string } {
  const combined = `${branchName} ${cameraName}`.toLowerCase();

  // Zone Detection
  let zone = "South Zone";
  if (combined.includes("north") || combined.includes("delhi") || combined.includes("punjab") || combined.includes("haryana") || combined.includes("up") || combined.includes("noida")) {
    zone = "North Zone";
  } else if (combined.includes("west") || combined.includes("mumbai") || combined.includes("pune") || combined.includes("gujarat") || combined.includes("maharashtra") || combined.includes("goa")) {
    zone = "West Zone";
  } else if (combined.includes("east") || combined.includes("kolkata") || combined.includes("bengal") || combined.includes("bihar") || combined.includes("assam") || combined.includes("odisha")) {
    zone = "East Zone";
  } else if (combined.includes("central") || combined.includes("mp") || combined.includes("bhopal") || combined.includes("indore")) {
    zone = "Central Zone";
  }

  // Region Detection
  let region = "Kerala";
  if (combined.includes("kerala") || combined.includes("kochi") || combined.includes("ernakulam") || combined.includes("trivandrum") || combined.includes("calicut") || combined.includes("thrissur") || combined.includes("kannur") || combined.includes("kollam") || combined.includes("palakkad") || combined.includes("alappuzha") || combined.includes("kottayam") || combined.includes("krypton")) {
    region = "Kerala";
  } else if (combined.includes("karnataka") || combined.includes("bangalore") || combined.includes("bengaluru") || combined.includes("mysore") || combined.includes("mangalore") || combined.includes("hubli")) {
    region = "Karnataka";
  } else if (combined.includes("tamil") || combined.includes("chennai") || combined.includes("coimbatore") || combined.includes("madurai") || combined.includes("salem") || combined.includes("trichy")) {
    region = "Tamil Nadu";
  } else if (combined.includes("telangana") || combined.includes("hyderabad") || combined.includes("secunderabad") || combined.includes("warangal")) {
    region = "Telangana";
  } else if (combined.includes("andhra") || combined.includes("vizag") || combined.includes("vijayawada") || combined.includes("guntur")) {
    region = "Andhra Pradesh";
  } else if (combined.includes("maharashtra") || combined.includes("mumbai") || combined.includes("pune") || combined.includes("nagpur") || combined.includes("nashik")) {
    region = "Maharashtra";
  } else if (combined.includes("delhi") || combined.includes("ncr") || combined.includes("gurgaon") || combined.includes("noida")) {
    region = "Delhi NCR";
  } else {
    region = "General Region";
  }

  // Area / District Detection
  let area = "Main Area";
  if (combined.includes("ernakulam") || combined.includes("kochi") || combined.includes("edapally") || combined.includes("aluva") || combined.includes("kakkanad") || combined.includes("mg road") || combined.includes("marine drive") || combined.includes("krypton")) {
    area = "Ernakulam / Kochi";
  } else if (combined.includes("trivandrum") || combined.includes("thiruvananthapuram") || combined.includes("technopark") || combined.includes("kazhakoottam")) {
    area = "Trivandrum Metro";
  } else if (combined.includes("calicut") || combined.includes("kozhikode")) {
    area = "Kozhikode Area";
  } else if (combined.includes("thrissur") || combined.includes("round")) {
    area = "Thrissur Area";
  } else if (combined.includes("bangalore") || combined.includes("bengaluru") || combined.includes("indiranagar") || combined.includes("whitefield") || combined.includes("koramangala") || combined.includes("electronic city") || combined.includes("mg road blr")) {
    area = "Bangalore Central";
  } else if (combined.includes("chennai") || combined.includes("t-nagar") || combined.includes("anna nagar") || combined.includes("velachery") || combined.includes("omr")) {
    area = "Chennai Metro";
  } else if (combined.includes("mumbai") || combined.includes("andheri") || combined.includes("bandra") || combined.includes("bkc") || combined.includes("thane") || combined.includes("navi mumbai")) {
    area = "Mumbai Metro";
  } else {
    area = `${region} Central Area`;
  }

  return { zone, region, area };
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  return (
    <time className="header-time" dateTime={now.toISOString()}>
      <Clock size={15} aria-hidden="true" />
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
  const [showAiOverlays, setShowAiOverlays] = useState(true);
  const [prioritizeAiAlerts, setPrioritizeAiAlerts] = useState(false);
  const [hideUnavailableChannels, setHideUnavailableChannels] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedAiCameraId, setSelectedAiCameraId] = useState<string>();
  
  // Hierarchy & Filter States
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL");
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "OFFLINE" | "ALERT">("ALL");

  const monitoredCameraSignatureRef = useRef("");
  const monitoredCamerasRef = useRef<CameraType[]>([]);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  // Direct Hard Navigation helper
  const navigateHard = useCallback((href: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(href);
    }
  }, []);

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

  const liveAi = useLiveAiWall(cameras, true);
  const combinedPriorityCameraIds = useMemo(
    () => [...new Set([...priorityCameraIds, ...liveAi.priorityCameraIds])],
    [liveAi.priorityCameraIds, priorityCameraIds],
  );
  const aiByCamera = useMemo(() => {
    const result = new Map();
    for (const camera of cameras) {
      result.set(camera.id, {
        rules: liveAi.rulesByCamera.get(camera.id) ?? [],
        alerts: liveAi.alertsByCamera.get(camera.id) ?? [],
      });
    }
    return result;
  }, [cameras, liveAi.alertsByCamera, liveAi.rulesByCamera]);

  // Extract all Branches with Hierarchy
  const branchesList = useMemo<HierarchyBranchInfo[]>(() => {
    const branchMap = new Map<string, HierarchyBranchInfo>();
    for (const camera of cameras) {
      const bId = camera.branchId || "default-branch";
      const bName = camera.branchName || `Branch ${bId}`;
      const { zone, region, area } = inferHierarchy(bName, camera.name);

      if (!branchMap.has(bId)) {
        branchMap.set(bId, {
          branchId: bId,
          branchName: bName,
          zone,
          region,
          area,
          cameraCount: 0,
          onlineCount: 0,
        });
      }
      const item = branchMap.get(bId)!;
      item.cameraCount += 1;
      if (isLiveWallCameraOnline(camera)) {
        item.onlineCount += 1;
      }
    }
    return Array.from(branchMap.values()).sort((a, b) => a.branchName.localeCompare(b.branchName));
  }, [cameras]);

  // Available Zones
  const availableZones = useMemo(() => {
    const set = new Set<string>();
    branchesList.forEach((b) => set.add(b.zone));
    return Array.from(set).sort();
  }, [branchesList]);

  // Available Regions (filtered by Zone)
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    branchesList.forEach((b) => {
      if (selectedZone === "ALL" || b.zone === selectedZone) {
        set.add(b.region);
      }
    });
    return Array.from(set).sort();
  }, [branchesList, selectedZone]);

  // Available Areas (filtered by Zone and Region)
  const availableAreas = useMemo(() => {
    const set = new Set<string>();
    branchesList.forEach((b) => {
      if (
        (selectedZone === "ALL" || b.zone === selectedZone) &&
        (selectedRegion === "ALL" || b.region === selectedRegion)
      ) {
        set.add(b.area);
      }
    });
    return Array.from(set).sort();
  }, [branchesList, selectedZone, selectedRegion]);

  // Available Branches (filtered by Zone, Region, and Area)
  const availableBranches = useMemo(() => {
    return branchesList.filter((b) => {
      if (selectedZone !== "ALL" && b.zone !== selectedZone) return false;
      if (selectedRegion !== "ALL" && b.region !== selectedRegion) return false;
      if (selectedArea !== "ALL" && b.area !== selectedArea) return false;
      return true;
    });
  }, [branchesList, selectedZone, selectedRegion, selectedArea]);

  const wallSelection = useMemo(() => selectLiveWallCameras(
    cameras, branchesList, combinedPriorityCameraIds,
    {
      zone: selectedZone, region: selectedRegion, area: selectedArea,
      branchId: selectedBranchId, query: searchQuery, status: statusFilter,
      hideUnavailable: hideUnavailableChannels,
    },
  ), [cameras, branchesList, combinedPriorityCameraIds, selectedZone, selectedRegion,
    selectedArea, selectedBranchId, searchQuery, statusFilter, hideUnavailableChannels]);
  const filteredCameras = wallSelection.cameras;

  useEffect(() => {
    if (filteredCameras.length === 0) {
      setActiveStreams(0);
      setMonitoredCameraIds((current) => current.length ? [] : current);
    }
  }, [filteredCameras.length]);

  // Active filter count
  const isFilterActive =
    selectedZone !== "ALL" ||
    selectedRegion !== "ALL" ||
    selectedArea !== "ALL" ||
    selectedBranchId !== "ALL" ||
    statusFilter !== "ALL" ||
    searchQuery.trim().length > 0 ||
    hideUnavailableChannels;

  const resetAllFilters = useCallback(() => {
    setSelectedZone("ALL");
    setSelectedRegion("ALL");
    setSelectedArea("ALL");
    setSelectedBranchId("ALL");
    setStatusFilter("ALL");
    setSearchQuery("");
    setHideUnavailableChannels(false);
  }, []);

  // Selected Branch object (if single branch is chosen)
  const activeSingleBranch = useMemo(() => {
    if (selectedBranchId === "ALL") return null;
    return branchesList.find((b) => b.branchId === selectedBranchId) || null;
  }, [selectedBranchId, branchesList]);

  // Initial layout for filtered cameras
  const initialLayout = useMemo<GridLayout>(() => {
    let size: GridSize;
    if (filteredCameras.length <= 1) size = "1x1";
    else if (filteredCameras.length <= 4) size = "2x2";
    else if (filteredCameras.length <= 9) size = "3x3";
    else if (filteredCameras.length <= 16) size = "4x4";
    else if (filteredCameras.length <= 25) size = "5x5";
    else if (filteredCameras.length <= 36) size = "6x6";
    else if (filteredCameras.length <= 49) size = "7x7";
    else if (filteredCameras.length <= 64) size = "8x8";
    else if (filteredCameras.length <= 81) size = "9x9";
    else if (filteredCameras.length <= 100) size = "10x10";
    else if (filteredCameras.length <= 121) size = "11x11";
    else size = "12x12";

    const positionLimit = Number(size.split("x")[0]) ** 2;

    return {
      name: "Video Wall",
      gridSize: size,
      positions: filteredCameras.slice(0, positionLimit).map((camera, position) => ({
        position,
        cameraId: camera.id,
        stream: "sub" as const,
      })),
    };
  }, [filteredCameras]);

  const monitoredCameras = useMemo(() => {
    const monitoredCameraSet = new Set(monitoredCameraIds);
    return filteredCameras.filter((camera) => monitoredCameraSet.has(camera.id));
  }, [filteredCameras, monitoredCameraIds]);

  const monitoringSignature = useMemo(
    () =>
      monitoredCameras
        .map((camera) => `${camera.id}:${camera.branchId}:${camera.branchName ?? ""}`)
        .sort()
        .join("|"),
    [monitoredCameras]
  );

  const inventoryStats = useMemo(
    () => ({
      total: filteredCameras.length,
      online: filteredCameras.filter(isLiveWallCameraOnline).length,
    }),
    [filteredCameras]
  );

  const healthHasInventory = healthDataReady && (stats.totalCameras > 0 || cameras.length === 0);
  const displayedCameraTotal = isFilterActive ? filteredCameras.length : healthHasInventory ? stats.totalCameras : inventoryStats.total;
  const displayedOnlineCameras = isFilterActive ? inventoryStats.online : healthHasInventory ? stats.onlineCameras : inventoryStats.online;
  const storageIssueCount =
    stats.storageSummary.warningCount +
    stats.storageSummary.smartIssueCount +
    stats.storageSummary.raidIssueCount +
    stats.storageSummary.writeProbeFailureCount;

  useEffect(() => {
    monitoredCamerasRef.current = monitoredCameras;
  }, [monitoredCameras]);

  const handleMonitoredCamerasChange = useCallback((cameraIds: string[]) => {
    const signature = cameraIds.join("|");
    if (monitoredCameraSignatureRef.current && monitoredCameraSignatureRef.current !== signature) {
      trackControlRoomCameraSwitch();
    }
    monitoredCameraSignatureRef.current = signature;
    setMonitoredCameraIds((current) => (current.join("|") === signature ? current : cameraIds));
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
      "live"
    ).catch(() => null);

    return () => {
      void endControlRoomActivity().catch(() => null);
    };
  }, [loading, monitoringSignature]);

  if (loading) {
    return (
      <div className="control-room-loading" role="status">
        <RefreshCw size={36} className="spin" />
        <p>Initializing Live Video Wall &amp; Cameras…</p>
        <style jsx>{`
          .control-room-loading {
            min-height: 75vh;
            display: grid;
            place-content: center;
            justify-items: center;
            gap: 14px;
            color: var(--muted);
          }
          .control-room-loading p {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
          }
          .spin {
            animation: spin 0.9s linear infinite;
            color: #2563eb;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="control-room">
      <header className="control-room-nav-hub">
        <div className="wall-heading">
          <span className="brand-pill"><Video size={22} aria-hidden="true" /></span>
          <div>
            <h1>Live video wall</h1>
            <p>Monitor cameras and detections across your branches.</p>
          </div>
        </div>
        <nav className="nav-hub-left" aria-label="Quick operations navigation">
          <a href="/" className="nav-link" title="Open Overview Dashboard">
            <LayoutDashboard size={14} />
            <span>Overview</span>
          </a>
          <a href="/operations/branches" className="nav-link" title="Manage Branches">
            <Building2 size={14} />
            <span>Branches</span>
          </a>
          <a href="/operations/alerts" className="nav-link" title="View Alert Center">
            <Bell size={14} />
            <span>Alerts</span>
          </a>
          <a href="/analytics" className="nav-link" title="View AI Analytics">
            <Activity size={14} />
            <span>Analytics</span>
          </a>
          <a href="/maintenance/health" className="nav-link" title="System Health">
            <HardDrive size={14} />
            <span>Maintenance</span>
          </a>
          <a href="/admin/organization" className="nav-link" title="Organization Structure">
            <Layers size={14} />
            <span>Organization</span>
          </a>
        </nav>
        <div className="nav-hub-right">
          <span className={`data-status ${dataMode}`}>
            <i />
            {dataMode === "live" ? "System Live" : dataMode === "partial" ? "Partial Sync" : "Offline Mode"}
          </span>
          <span className="wall-clock"><HeaderClock /></span>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void loadData()}
            disabled={refreshing}
            title="Refresh Camera Feeds"
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>{refreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {/* 2. Interactive Zone / Region / Area / Branch Scope Filter Toolbar */}
      <section className="hierarchy-filter-bar" aria-label="Live Wall Scope Selection">
        <div className="filter-controls-row">
          {/* Zone Selector */}
          <div className="filter-select-group">
            <label htmlFor="zone-select">
              <Globe2 size={13} />
              <span>Zone:</span>
            </label>
            <select
              id="zone-select"
              value={selectedZone}
              onChange={(e) => {
                setSelectedZone(e.target.value);
                setSelectedRegion("ALL");
                setSelectedArea("ALL");
                setSelectedBranchId("ALL");
              }}
            >
              <option value="ALL">All Zones ({availableZones.length})</option>
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {/* Region Selector */}
          <div className="filter-select-group">
            <label htmlFor="region-select">
              <MapPin size={13} />
              <span>Region:</span>
            </label>
            <select
              id="region-select"
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedArea("ALL");
                setSelectedBranchId("ALL");
              }}
            >
              <option value="ALL">All Regions ({availableRegions.length})</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Area / District Selector */}
          <div className="filter-select-group">
            <label htmlFor="area-select">
              <Layers size={13} />
              <span>Area / District:</span>
            </label>
            <select
              id="area-select"
              value={selectedArea}
              onChange={(e) => {
                setSelectedArea(e.target.value);
                setSelectedBranchId("ALL");
              }}
            >
              <option value="ALL">All Areas ({availableAreas.length})</option>
              {availableAreas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Selector */}
          <div className="filter-select-group highlight">
            <label htmlFor="branch-select">
              <Building2 size={13} />
              <span>Branch:</span>
            </label>
            <select
              id="branch-select"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
            >
              <option value="ALL">All Branches ({availableBranches.length})</option>
              {availableBranches.map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.branchName} ({b.cameraCount} cams)
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="filter-search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              aria-label="Search cameras by name, IP address, or channel"
              placeholder="Search camera, IP, channel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Quick Chips and Active Status */}
        <div className="filter-meta-row">
          <div className="status-chips">
            <button
              type="button"
              className={`chip ${statusFilter === "ALL" ? "active" : ""}`}
              aria-pressed={statusFilter === "ALL"}
              onClick={() => setStatusFilter("ALL")}
            >
              All Feeds ({wallSelection.counts.total})
            </button>
            <button
              type="button"
              className={`chip green ${statusFilter === "ONLINE" ? "active" : ""}`}
              aria-pressed={statusFilter === "ONLINE"}
              onClick={() => setStatusFilter("ONLINE")}
            >
              <span className="dot green" />
              Online ({wallSelection.counts.online})
            </button>
            <button
              type="button"
              className={`chip red ${statusFilter === "OFFLINE" ? "active" : ""}`}
              aria-pressed={statusFilter === "OFFLINE"}
              onClick={() => setStatusFilter("OFFLINE")}
            >
              <span className="dot red" />
              Offline ({wallSelection.counts.offline})
            </button>
            <button
              type="button"
              className={`chip amber ${statusFilter === "ALERT" ? "active" : ""}`}
              aria-pressed={statusFilter === "ALERT"}
              onClick={() => setStatusFilter("ALERT")}
            >
              <span className="dot amber" />
              Alerts ({wallSelection.counts.alerts})
            </button>
          </div>

          <div className="filter-summary">
            {isFilterActive ? (
              <div className="active-pill">
                <Filter size={12} />
                <span>
                  Showing <strong>{filteredCameras.length}</strong> of {cameras.length} cameras
                  {activeSingleBranch ? (
                    <> in <em>{activeSingleBranch.branchName}</em></>
                  ) : selectedRegion !== "ALL" ? (
                    <> in <em>{selectedRegion}</em></>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="reset-btn"
                  onClick={resetAllFilters}
                  title="Reset all filters"
                >
                  <X size={12} /> Reset
                </button>
              </div>
            ) : (
              <span className="all-pill">
                Showing all <strong>{cameras.length}</strong> cameras across {branchesList.length} branches
              </span>
            )}
          </div>
          <div className="ai-wall-controls" aria-label="Live AI controls">
            <span className={`ai-engine-chip ${liveAi.engineState}`} title={liveAi.error ?? (liveAi.telemetryIsStale ? "Live analytics telemetry is stale" : "Live analytics engine status")}>
              <BrainCircuit size={12} /><i /> AI {liveAi.engineState}
            </span>
            <button
              type="button"
              className={showAiOverlays ? "active" : ""}
              onClick={() => setShowAiOverlays((current) => !current)}
              aria-pressed={showAiOverlays}
            >
              <Sparkles size={12} /> Overlays {showAiOverlays ? "on" : "off"}
            </button>
            <button
              type="button"
              className={prioritizeAiAlerts ? "active" : ""}
              onClick={() => setPrioritizeAiAlerts((current) => !current)}
              aria-pressed={prioritizeAiAlerts}
            >
              <Activity size={12} /> AI priority {prioritizeAiAlerts ? "on" : "off"}
            </button>
            <button
              type="button"
              className={hideUnavailableChannels ? "active" : ""}
              onClick={() => setHideUnavailableChannels((current) => !current)}
              aria-pressed={hideUnavailableChannels}
              title="Hide camera channels that are offline or unavailable"
            >
              <Video size={12} /> Unavailable {hideUnavailableChannels ? "hidden" : "shown"}
            </button>
            <button type="button" className="open-ai-panel" onClick={() => setAiPanelOpen(true)}>
              {liveAi.summary.open} detection{liveAi.summary.open === 1 ? "" : "s"} <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* 3. Single Branch Hero Banner (if a single branch is selected) */}
      {activeSingleBranch && (
        <div className="single-branch-banner">
          <div className="branch-info-left">
            <Building2 size={24} className="branch-icon" />
            <div>
              <h3>{activeSingleBranch.branchName}</h3>
              <p>
                {activeSingleBranch.zone} &gt; {activeSingleBranch.region} &gt; {activeSingleBranch.area} ·{" "}
                <strong>{activeSingleBranch.onlineCount}/{activeSingleBranch.cameraCount}</strong> Online
              </p>
            </div>
          </div>
          <div className="branch-actions-right">
            <a
              href={`/operations/branches/${encodeURIComponent(activeSingleBranch.branchId)}`}
              className="branch-manage-btn"
            >
              Branch Diagnostics &amp; Controls &rarr;
            </a>
          </div>
        </div>
      )}

      {/* System Warning Banners */}
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

      {/* 4. Monitoring Stats Bar */}
      <section className="stats-bar" aria-label="Live monitoring summary">
        <div className="stat-card">
          <Camera size={20} className="stat-icon" aria-hidden="true" />
          <div>
            <strong>
              {displayedOnlineCameras}/{displayedCameraTotal}
            </strong>
            <span>{isFilterActive ? "Filtered online" : "Cameras online"}</span>
          </div>
        </div>
        <div className="stat-card">
          <Play size={20} className="stat-icon green" aria-hidden="true" />
          <div>
            <strong>{activeStreams}</strong>
            <span>Active streams</span>
          </div>
        </div>
        <div className="stat-card">
          <Building2 size={20} className="stat-icon blue" aria-hidden="true" />
          <div>
            <strong>{wallSelection.branchCount}</strong>
            <span>Branches in view</span>
          </div>
        </div>
        <div className="stat-card">
          <AlertTriangle size={20} className="stat-icon red" aria-hidden="true" />
          <div>
            <strong>{stats.openIncidents}</strong>
            <span>Open incidents</span>
          </div>
        </div>
        <div className="stat-card">
          <Bell size={20} className="stat-icon amber" aria-hidden="true" />
          <div>
            <strong>{stats.unacknowledgedAlerts}</strong>
            <span>Unacknowledged</span>
          </div>
        </div>
        <div className="stat-card">
          <HardDrive size={20} className="stat-icon purple" aria-hidden="true" />
          <div>
            <strong>{stats.storageUsagePercent}%</strong>
            <span>Storage used</span>
          </div>
        </div>
        <button type="button" className="stat-card ai-stat" onClick={() => setAiPanelOpen(true)}>
          <BrainCircuit size={20} className="stat-icon cyan" aria-hidden="true" />
          <div>
            <strong>{liveAi.rules.filter((rule) => rule.enabled).length}</strong>
            <span>AI rules · {liveAi.summary.open} open</span>
          </div>
        </button>
      </section>

      {storageIssueCount > 0 && (
        <div className="storage-warning" role="status">
          <HardDrive size={15} aria-hidden="true" />
          <strong>
            {storageIssueCount} storage issue{storageIssueCount === 1 ? "" : "s"}
          </strong>
          <span>
            {stats.storageSummary.warningCount} warning · {stats.storageSummary.smartIssueCount} SMART ·{" "}
            {stats.storageSummary.raidIssueCount} RAID · {stats.storageSummary.writeProbeFailureCount} write probe
          </span>
        </div>
      )}

      {/* 5. Main Camera Video Wall Grid */}
      <section className="control-room-content" aria-label="Camera wall">
        {filteredCameras.length > 0 ? (
          <EnhancedCameraGrid
            key={`grid-${filteredCameras.map((camera) => camera.id).join("|")}`}
            cameras={filteredCameras}
            initialLayout={initialLayout}
            maxConcurrentStreams={CONTROL_ROOM_MAX_CONCURRENT_STREAMS}
            priorityCameraIds={prioritizeAiAlerts ? combinedPriorityCameraIds : priorityCameraIds}
            adaptiveLayout={prioritizeAiAlerts}
            enableVirtualScrolling={false}
            enableGPUAcceleration
            aiByCamera={aiByCamera}
            showAiOverlay={showAiOverlays}
            onOpenCameraAi={(cameraId) => {
              setSelectedAiCameraId(cameraId);
              setAiPanelOpen(true);
            }}
            onActiveStreamsChange={setActiveStreams}
            onMonitoredCamerasChange={handleMonitoredCamerasChange}
          />
        ) : cameras.length > 0 ? (
          <div className="empty-control-room-card">
            <div className="empty-icon-wrap">
              <Filter size={36} />
            </div>
            <h2>No cameras match current filter</h2>
            <p>
              No cameras match the selected location, status, search, or availability filters.
            </p>
            <button type="button" className="primary-action" onClick={resetAllFilters}>
              Clear All Filters
            </button>
          </div>
        ) : cameraDataState === "error" ? (
          <div className="empty-control-room-card">
            <div className="empty-icon-wrap error">
              <AlertTriangle size={36} />
            </div>
            <h2>Camera inventory is unavailable</h2>
            <p>The wall could not load its authorized camera list. Check the control plane connection and try again.</p>
            <button type="button" className="primary-action" onClick={() => void loadData()} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Try again
            </button>
          </div>
        ) : (
          <div className="empty-control-room-card">
            <div className="empty-icon-wrap">
              <Video size={36} />
            </div>
            <h2>No cameras available</h2>
            <p>No authorized cameras were found for this control room session.</p>
          </div>
        )}
      </section>

      {aiPanelOpen && (
        <LiveAiWallPanel
          cameras={cameras.slice(0, 144)}
          rules={liveAi.rules}
          alerts={liveAi.alerts}
          engineState={liveAi.engineState}
          capabilityDomains={liveAi.capabilityDomains}
          capabilityCount={liveAi.capabilityCount}
          selectedCameraId={selectedAiCameraId}
          loading={liveAi.loading}
          error={liveAi.error}
          lastUpdatedAt={liveAi.lastUpdatedAt}
          onSelectCamera={setSelectedAiCameraId}
          onClose={() => setAiPanelOpen(false)}
          onRefresh={liveAi.refresh}
        />
      )}

      <style jsx>{`
        .control-room {
          width: min(100%, 1680px); min-width: 0; min-height: calc(100dvh - 80px);
          margin-inline: auto; padding: 24px; display: flex; flex-direction: column;
          gap: 16px; color: var(--ink); background: var(--canvas);
        }
        .control-room-nav-hub {
          display: grid; grid-template-columns: minmax(0, 1fr) auto;
          align-items: center; gap: 16px 24px;
        }
        .wall-heading { display: flex; align-items: center; min-width: 0; gap: 12px; }
        .wall-heading h1 {
          margin: 0; color: var(--ink); font-size: clamp(23px, 2.2vw, 28px);
          font-weight: 750; line-height: 1.2; letter-spacing: -.7px;
        }
        .wall-heading p { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
        .brand-pill {
          display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
          width: 46px; height: 46px; border: 1px solid var(--line); border-radius: 12px;
          color: var(--blue-dark); background: var(--blue-soft);
        }
        .nav-hub-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; grid-column: 1 / -1; grid-row: 2; }
        .nav-link, .refresh-btn {
          display: inline-flex; align-items: center; gap: 6px; min-height: 36px;
          padding: 7px 11px; border: 1px solid var(--line); border-radius: 7px;
          background: var(--surface); color: var(--muted); font-size: 12px;
          font-weight: 600; text-decoration: none; cursor: pointer;
          transition: background .15s ease, border-color .15s ease;
        }
        .refresh-btn { color: var(--blue-dark); }
        .nav-link:hover, .refresh-btn:hover:not(:disabled) { color: var(--blue-dark); background: var(--blue-soft); border-color: var(--blue); }
        .refresh-btn:disabled { opacity: .6; cursor: wait; }
        .nav-hub-right { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; grid-column: 2; grid-row: 1; justify-content: flex-end; }
        .data-status, .wall-clock {
          display: inline-flex; align-items: center; gap: 7px; min-height: 36px;
          padding: 7px 10px; border: 1px solid var(--line); border-radius: 7px;
          background: var(--surface); font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap;
        }
        .data-status i { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
        .data-status.partial i { background: #f59e0b; }
        .data-status.unavailable i { background: #ef4444; }
        .hierarchy-filter-bar {
          display: flex; flex-direction: column; gap: 14px; padding: 16px;
          background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        }
        .filter-controls-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(200px, 1.4fr); align-items: end; gap: 10px; }
        .filter-select-group { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
        .filter-select-group label { display: flex; align-items: center; gap: 4px; min-height: 18px; font-size: 12px; font-weight: 600; color: var(--muted); }
        .filter-select-group.highlight label { color: var(--blue-dark); }
        .filter-select-group select {
          width: 100%; min-width: 0; min-height: 40px; padding: 8px 10px;
          background: var(--surface-soft); border: 1px solid var(--line); border-radius: 8px;
          color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .filter-select-group select option { background: var(--surface); color: var(--ink); }
        .filter-search-box {
          display: flex; align-items: center; min-width: 0; min-height: 40px; padding: 0 10px;
          background: var(--surface-soft); border: 1px solid var(--line); border-radius: 8px;
        }
        .filter-search-box .search-icon { color: var(--muted); margin-right: 6px; }
        .filter-search-box input { width: 100%; min-width: 0; background: transparent; border: 0; color: var(--ink); font-size: 13px; padding: 8px 0; outline: none; }
        .filter-search-box input::placeholder { color: var(--muted); }
        .clear-search-btn { display: grid; place-items: center; min-width: 30px; min-height: 30px; background: transparent; border: 0; color: var(--muted); cursor: pointer; }
        .filter-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid var(--line); }
        .status-chips, .ai-wall-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .chip, .ai-wall-controls button, .ai-engine-chip {
          display: inline-flex; align-items: center; gap: 6px; min-height: 34px;
          padding: 6px 10px; border-radius: 7px; background: var(--surface-soft);
          border: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 600;
        }
        .chip, .ai-wall-controls button { cursor: pointer; }
        .chip:hover, .chip.active, .ai-wall-controls button:hover, .ai-wall-controls button.active, .ai-wall-controls .open-ai-panel { color: var(--blue-dark); border-color: var(--blue); background: var(--blue-soft); }
        .ai-engine-chip { text-transform: capitalize; }
        .dot, .ai-engine-chip i { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #64748b; }
        .dot.green, .ai-engine-chip.online i { background: #22c55e; }
        .dot.red, .ai-engine-chip.offline i, .ai-engine-chip.unavailable i { background: #ef4444; }
        .dot.amber, .ai-engine-chip.degraded i { background: #f59e0b; }
        .filter-summary { display: flex; min-width: 0; align-items: center; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
        .active-pill { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 7px; color: var(--blue-dark); background: var(--blue-soft); font-size: 12px; }
        .active-pill strong, .all-pill strong { color: var(--ink); font-weight: 700; }
        .active-pill em { font-style: normal; font-weight: 700; }
        .all-pill { color: var(--muted); font-size: 12px; }
        .reset-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 3px; min-height: 30px; padding: 4px 7px; border: 1px solid var(--line); border-radius: 4px; color: var(--blue-dark); background: var(--surface); font-size: 12px; cursor: pointer; }
        .reset-btn:hover { background: var(--blue-soft); }
        .single-branch-banner { padding: 12px 16px; background: var(--blue-soft); border: 1px solid var(--line); border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .branch-info-left { display: flex; align-items: center; gap: 12px; min-width: 0; overflow-wrap: anywhere; }
        .branch-icon { color: var(--blue-dark); flex-shrink: 0; }
        .branch-info-left h3 { margin: 0; font-size: 17px; color: var(--ink); }
        .branch-info-left p { margin: 3px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
        .branch-manage-btn { display: inline-flex; align-items: center; padding: 8px 12px; background: var(--surface); color: var(--blue-dark); border: 1px solid var(--line); border-radius: 6px; font-size: 12px; font-weight: 700; text-decoration: none; }
        .branch-manage-btn:hover { background: var(--surface-soft); }
        .data-banner { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; background: #78350f; border: 1px solid #92400e; border-radius: 8px; color: #fde68a; font-size: 12px; }
        .data-banner.unavailable { background: #7f1d1d; border-color: #991b1b; color: #fecaca; }
        .data-banner small { opacity: .85; }
        .stats-bar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
        .stat-card { min-width: 0; min-height: 84px; display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 9px; color: inherit; text-align: left; }
        button.stat-card { cursor: pointer; }
        button.stat-card:hover { border-color: var(--blue); background: var(--blue-soft); }
        .stat-card div { display: flex; min-width: 0; flex-direction: column; }
        .stat-card strong { font-size: 22px; line-height: 1.15; color: var(--ink); font-weight: 750; }
        .stat-card span { margin-top: 4px; color: var(--muted); font-size: 12px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
        .stat-icon { flex: 0 0 auto; color: var(--muted); }
        .stat-icon.green { color: #22c55e; }
        .stat-icon.red { color: #ef4444; }
        .stat-icon.amber { color: #f59e0b; }
        .stat-icon.blue, .stat-icon.cyan { color: #0891b2; }
        .stat-icon.purple { color: #a855f7; }
        .storage-warning { padding: 10px 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border: 1px solid #7c2d12; border-radius: 8px; background: #451a03; color: #fed7aa; font-size: 12px; }
        .control-room-content { flex: 1; min-width: 0; min-height: 0; padding: 12px; border: 1px solid #27354a; border-radius: 12px; background: #0b1424; color: #f8fafc; color-scheme: dark; }
        .empty-control-room-card { max-width: 480px; margin: 32px auto; padding: 32px 20px; display: flex; flex-direction: column; align-items: center; text-align: center; background: #131d2e; border: 1px solid #27354a; border-radius: 12px; }
        .empty-icon-wrap { width: 64px; height: 64px; margin-bottom: 14px; display: grid; place-items: center; border-radius: 50%; background: #1e3a8a; color: #60a5fa; }
        .empty-icon-wrap.error { background: #450a0a; color: #f87171; }
        .empty-control-room-card h2 { margin: 0 0 8px; font-size: 18px; color: #f8fafc; }
        .empty-control-room-card p { max-width: 380px; margin: 0 0 18px; color: #94a3b8; font-size: 13px; line-height: 1.5; }
        .primary-action { min-height: 38px; padding: 0 18px; color: white; background: #2563eb; border: 0; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .primary-action:hover { background: #1d4ed8; }
        .control-room :is(button, a, select):focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
        .filter-search-box:focus-within { outline: 2px solid var(--blue); outline-offset: 2px; }
        .spin { animation: spin .9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1200px) {
          .stats-bar { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .filter-controls-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .filter-search-box { grid-column: 1 / -1; }
          .wall-clock { display: none; }
        }
        @media (max-width: 768px) {
          .control-room { padding: 16px 12px 24px; gap: 12px; }
          .control-room-nav-hub { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .nav-hub-right { grid-column: 1; grid-row: 2; justify-content: flex-start; }
          .nav-hub-left { grid-row: 3; }
          .nav-link { flex: 1 1 auto; justify-content: center; }
          .hierarchy-filter-bar { padding: 12px; }
          .filter-controls-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .stats-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ai-stat { grid-column: 1 / -1; }
          .chip, .ai-wall-controls button { min-height: 38px; }
          .control-room-content { padding: 8px; }
          .single-branch-banner { padding: 12px; }
        }
      `}</style>
    </div>
  );
}
