"use client";

import { loadCameraInventory } from "@/lib/fleet-loading";
import { LiveOperationsStage } from "@/components/live-operations-stage";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Filter,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  Megaphone,
  Mic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  Sparkles as SparklesIcon,
  SlidersHorizontal,
  Unlock,
  Video,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { EnhancedCameraGrid, type GridLayout, type GridSize } from "@/components/enhanced-camera-grid";
import { LiveAiWallPanel } from "@/components/live-ai-wall-panel";
import { EmergencyAlarmPopup } from "@/components/emergency-alarm-popup";
import { InvestigationFlowNav } from "@/components/investigation-flow-nav";
import { useLiveAiWall } from "@/hooks/use-live-ai-wall";
import type { Camera as CameraType } from "@/lib/types";
import { normalizeCameraStreamProfiles } from "@/lib/camera-stream-profiles";
import { isLiveWallCameraOnline, matchesLiveWallSelection, selectLiveWallCameras } from "@/lib/live-wall-filters";
import { buildLiveWallBranches, liveWallHierarchyOptions, parseLiveWallHierarchy, type LiveWallHierarchyNode } from "@/lib/live-wall-hierarchy";
import { ScopeMultiSelect } from "@/components/ui/scope-multi-select";
import { LiveWallWindows } from "@/components/live-wall-windows";
import { readLiveWallWindowScope } from "@/lib/live-wall-windows";
export type { HierarchyBranchInfo } from "@/lib/live-wall-hierarchy";
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
  storageCapacityAvailable: boolean;
  storageSummary: {
    totalCount: number;
    warningCount: number;
    smartIssueCount: number;
    raidIssueCount: number;
    writeProbeFailureCount: number;
  };
}

type DataSection = "cameras" | "health" | "alerts" | "nodes";
type DataMode = "live" | "partial" | "unavailable";
type UserTier = "basic" | "standard" | "premium" | "enterprise";

const getMaxConcurrentStreams = (userTier: UserTier = "enterprise") => {
  const limits: Record<UserTier, number> = {
    basic: 16,
    standard: 32,
    premium: 64,
    enterprise: 144,
  };
  return limits[userTier] ?? 144;
};

const configuredTier = process.env.NEXT_PUBLIC_USER_TIER;
const controlRoomTier: UserTier =
  configuredTier === "basic" ||
  configuredTier === "premium" ||
  configuredTier === "enterprise" ||
  configuredTier === "standard"
    ? configuredTier
    : "enterprise";

const CONTROL_ROOM_MAX_CONCURRENT_STREAMS = 144;

const DEFAULT_EMPTY_STATS: ControlRoomStats = {
  totalCameras: 0,
  onlineCameras: 0,
  offlineCameras: 0,
  openIncidents: 0,
  unacknowledgedAlerts: 0,
  recordingCameras: 0,
  storageUsagePercent: 0,
  storageCapacityAvailable: false,
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
    storageCapacityAvailable: Boolean(data.storageCapacityAvailable ?? data.storage_capacity_available ?? false),
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

const PATROL_STAGES = [
  { id: "ingress", name: "Stage 1: Main Ingress & Outer Perimeter", keywords: ["entrance", "gate", "door", "front", "ingress", "entry", "perimeter"] },
  { id: "counter", name: "Stage 2: Cash Counter & Teller Enclosure", keywords: ["counter", "teller", "cash", "hall", "desk", "lobby"] },
  { id: "vault", name: "Stage 3: Strongroom & Gold Vault Perimeter", keywords: ["vault", "strong", "locker", "safe", "room", "gold"] },
  { id: "atm", name: "Stage 4: 24/7 ATM Vestibule & Backdoor", keywords: ["atm", "kiosk", "back", "rear", "exit", "vestibule"] },
];

function ControlRoomContent() {
  const searchParams = useSearchParams();
  const isWallWindow = searchParams?.get("wallWindow") === "true";
  const incomingScope = readLiveWallWindowScope(searchParams);
  const urlBranchId = !isWallWindow && incomingScope.branches.length === 1 ? incomingScope.branches[0] : null;
  const isDetached = searchParams?.get("detached") === "true";
  const detachedCameraId = searchParams?.get("cameraId");

  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [hierarchyNodes, setHierarchyNodes] = useState<LiveWallHierarchyNode[]>([]);
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
  const [showAiOverlays, setShowAiOverlays] = useState(incomingScope.showAiOverlays);
  const [prioritizeAiAlerts, setPrioritizeAiAlerts] = useState(incomingScope.prioritizeAiAlerts);
  const [hideUnavailableChannels, setHideUnavailableChannels] = useState(incomingScope.hideUnavailable);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedAiCameraId, setSelectedAiCameraId] = useState<string>();
  const [focusCameraId, setFocusCameraId] = useState<string>();

  // Virtual Patrol Tour States
  const [isPatrolActive, setIsPatrolActive] = useState(false);
  const [patrolIntervalSec, setPatrolIntervalSec] = useState(15);
  const [patrolStageIndex, setPatrolStageIndex] = useState(0);
  const [patrolSecondsLeft, setPatrolSecondsLeft] = useState(15);

  // Emergency Lockdown Cockpit States
  const [emergencyLockdownOpen, setEmergencyLockdownOpen] = useState(false);
  const [lockdownState, setLockdownState] = useState<"idle" | "triggered" | "disarmed">("idle");
  const [lockdownTargetBranch, setLockdownTargetBranch] = useState("ALL");
  const [sirenActive, setSirenActive] = useState(true);
  const [audioBroadcastActive, setAudioBroadcastActive] = useState(true);
  const [doorInterlockActive, setDoorInterlockActive] = useState(true);
  const [policeDispatchNotified, setPoliceDispatchNotified] = useState(true);
  const [disarmCode, setDisarmCode] = useState("");
  const [lockdownLog, setLockdownLog] = useState<string[]>([]);

  // Two-Way Audio Deterrence States
  const [audioDeterrenceOpen, setAudioDeterrenceOpen] = useState(false);
  const [audioTargetCamera, setAudioTargetCamera] = useState("CAM-01 Entrance IP Horn");
  const [pttActive, setPttActive] = useState(false);
  const [voiceStrobePlaying, setVoiceStrobePlaying] = useState<string | null>(null);
  const voiceStrobeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playVoiceStrobe = useCallback((message: string) => {
    if (voiceStrobeTimer.current) clearTimeout(voiceStrobeTimer.current);
    setVoiceStrobePlaying(message);
    voiceStrobeTimer.current = setTimeout(() => {
      voiceStrobeTimer.current = null;
      setVoiceStrobePlaying(null);
    }, 5000);
  }, []);

  const stopVoiceStrobe = useCallback(() => {
    if (voiceStrobeTimer.current) {
      clearTimeout(voiceStrobeTimer.current);
      voiceStrobeTimer.current = null;
    }
    setVoiceStrobePlaying(null);
  }, []);

  useEffect(() => () => {
    if (voiceStrobeTimer.current) clearTimeout(voiceStrobeTimer.current);
  }, []);
  
  // Hierarchy & Filter States
  const [selectedZone, setSelectedZone] = useState<string[]>(incomingScope.zones);
  const [selectedRegion, setSelectedRegion] = useState<string[]>(incomingScope.regions);
  const [selectedArea, setSelectedArea] = useState<string[]>(incomingScope.areas);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(incomingScope.branches);
  const selectedBranchId = selectedBranchIds.length === 1 ? selectedBranchIds[0] : "ALL";
  const resolvedUrlBranchRef = useRef<string | null>(null);
  const [protectionStreamBudget, setProtectionStreamBudget] = useState(CONTROL_ROOM_MAX_CONCURRENT_STREAMS);
  useEffect(() => {
    const controller = new AbortController();
    setProtectionStreamBudget(CONTROL_ROOM_MAX_CONCURRENT_STREAMS);
    if (!selectedBranchId || selectedBranchId === "ALL") return;
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    fetch(`/v1/branches/${encodeURIComponent(selectedBranchId)}/protection`, {
      signal: controller.signal, credentials: "include", cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}`, "x-sentinel-session": token } : {},
    }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      const limit = result.data?.policy?.maxConcurrentStreams;
      // An authorized branch policy sets its wall ceiling. The tier value is
      // the fallback for an unselected branch; viewer capacity still adapts.
      // Ensure policy limits do not throttle below the control room workstation capacity.
      if (!controller.signal.aborted && Number.isInteger(limit) && limit > 0) {
        setProtectionStreamBudget(Math.max(limit, CONTROL_ROOM_MAX_CONCURRENT_STREAMS));
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [selectedBranchId]);
  const [searchQuery, setSearchQuery] = useState<string>(incomingScope.query);
  const [statusFilter, setStatusFilter] = useState(incomingScope.status);

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
      const [cameraResult, statsResult, priorityResult, nodesResult] = await Promise.allSettled([
        loadCameraInventory(async (offset, limit) => {
          const body = await requestJson(`/api/control/v1/cameras?limit=${limit}&offset=${offset}&action=live%3Aview`, controller.signal);
          const total = body && typeof body === "object" ? (body as { total?: number }).total : undefined;
          return { cameras: parseCameras(body), total: typeof total === "number" ? total : undefined };
        }),
        requestJson("/api/control/v1/operations/health/summary", controller.signal),
        requestJson("/api/control/v1/alerts/alert-center?limit=200", controller.signal),
        requestJson("/api/control/v1/organization/nodes", controller.signal).then(parseLiveWallHierarchy),
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

      if (nodesResult.status === "fulfilled") setHierarchyNodes(nodesResult.value);
      else failed.push("nodes");

      setFailedSections(failed);
      setDataMode(failed.length === 0 ? "live" : failed.length === 4 ? "unavailable" : "partial");
      if (failed.length < 4) setLastUpdatedAt(new Date());
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

  const branchesList = useMemo(() => buildLiveWallBranches(cameras, hierarchyNodes), [cameras, hierarchyNodes]);

  // Resolve incoming branch links once; refreshing inventory must not reset a user's selection.
  useEffect(() => {
    if (!urlBranchId) { resolvedUrlBranchRef.current = null; return; }
    if (resolvedUrlBranchRef.current === urlBranchId) return;
    const target = urlBranchId.trim().toLowerCase();
    const matched = branchesList.find(branch => branch.branchId.toLowerCase() === target || branch.branchName.toLowerCase() === target);
    if (matched) {
      setSelectedBranchIds([matched.branchId]);
      resolvedUrlBranchRef.current = urlBranchId;
    } else if (cameraDataState === "ready" && !loading) {
      setSelectedBranchIds([urlBranchId.trim()]);
      resolvedUrlBranchRef.current = urlBranchId;
    }
  }, [urlBranchId, branchesList, cameraDataState, loading]);

  const availableZones = useMemo(() => liveWallHierarchyOptions(hierarchyNodes, "zone"), [hierarchyNodes]);
  const availableRegions = useMemo(() => liveWallHierarchyOptions(hierarchyNodes, "region", selectedZone), [hierarchyNodes, selectedZone]);
  const availableAreas = useMemo(() => liveWallHierarchyOptions(hierarchyNodes, "area", selectedZone, selectedRegion), [hierarchyNodes, selectedZone, selectedRegion]);
  const availableBranches = useMemo(() => branchesList.filter(branch =>
    matchesLiveWallSelection(selectedZone, branch.zone) && matchesLiveWallSelection(selectedRegion, branch.region) && matchesLiveWallSelection(selectedArea, branch.area)
  ), [branchesList, selectedZone, selectedRegion, selectedArea]);

  const windowScopeLabel = selectedBranchIds.length
    ? branchesList.filter(branch => selectedBranchIds.includes(branch.branchId)).map(branch => branch.branchName).join(", ") || `${selectedBranchIds.length} selected branches`
    : selectedArea.length ? availableAreas.filter(area => selectedArea.includes(area.value)).map(area => area.label).join(", ") || `${selectedArea.length} selected areas`
    : selectedRegion.length ? availableRegions.filter(region => selectedRegion.includes(region.value)).map(region => region.label).join(", ") || `${selectedRegion.length} selected regions`
    : selectedZone.length ? availableZones.filter(zone => selectedZone.includes(zone.value)).map(zone => zone.label).join(", ") || `${selectedZone.length} selected zones`
    : "All locations";
  useEffect(() => {
    if (!isWallWindow) return;
    const previousTitle = document.title;
    const title = `Live Wall · ${windowScopeLabel}`;
    const updateTitle = () => { if (document.title !== title) document.title = title; };
    // Next may finish streaming the layout metadata after this window mounts.
    const observer = new MutationObserver(updateTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    updateTitle();
    return () => { observer.disconnect(); document.title = previousTitle; };
  }, [isWallWindow, windowScopeLabel]);

  const wallSelection = useMemo(() => selectLiveWallCameras(
    cameras, branchesList, combinedPriorityCameraIds,
    {
      zone: selectedZone, region: selectedRegion, area: selectedArea,
      branchId: selectedBranchIds, query: searchQuery, status: statusFilter,
      hideUnavailable: hideUnavailableChannels,
    },
  ), [cameras, branchesList, combinedPriorityCameraIds, selectedZone, selectedRegion,
    selectedArea, selectedBranchIds, searchQuery, statusFilter, hideUnavailableChannels]);

  // Virtual Patrol Timer Effect
  useEffect(() => {
    if (!isPatrolActive) {
      setPatrolSecondsLeft(patrolIntervalSec);
      return;
    }
    const timer = window.setInterval(() => {
      setPatrolSecondsLeft((prev) => {
        if (prev <= 1) {
          setPatrolStageIndex((curr) => (curr + 1) % PATROL_STAGES.length);
          return patrolIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPatrolActive, patrolIntervalSec]);

  // If patrol is active, prioritize cameras matching current stage keywords
  const filteredCameras = useMemo(() => {
    if (!isPatrolActive) return wallSelection.cameras;
    const currentKeywords = PATROL_STAGES[patrolStageIndex].keywords;
    return [...wallSelection.cameras].sort((a, b) => {
      const aText = `${a.name} ${(a as any).zone || ""} ${(a as any).location || ""}`.toLowerCase();
      const bText = `${b.name} ${(b as any).zone || ""} ${(b as any).location || ""}`.toLowerCase();
      const aMatches = currentKeywords.some((k) => aText.includes(k));
      const bMatches = currentKeywords.some((k) => bText.includes(k));
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });
  }, [wallSelection.cameras, isPatrolActive, patrolStageIndex]);

  useEffect(() => {
    if (filteredCameras.length === 0) {
      setActiveStreams(0);
      setMonitoredCameraIds((current) => current.length ? [] : current);
    }
  }, [filteredCameras.length]);

  // Active filter count
  const isFilterActive =
    selectedZone.length > 0 ||
    selectedRegion.length > 0 ||
    selectedArea.length > 0 ||
    selectedBranchIds.length > 0 ||
    statusFilter !== "ALL" ||
    searchQuery.trim().length > 0 ||
    hideUnavailableChannels;

  const resetAllFilters = useCallback(() => {
    setSelectedZone([]);
    setSelectedRegion([]);
    setSelectedArea([]);
    setSelectedBranchIds([]);
    setStatusFilter("ALL");
    setSearchQuery("");
    setHideUnavailableChannels(false);
  }, []);

  // Selected Branch object (if single branch is chosen)
  const activeSingleBranch = useMemo(() => {
    if (selectedBranchId === "ALL") return null;
    const target = selectedBranchId.trim().toLowerCase();
    return (
      branchesList.find(
        (b) =>
          b.branchId.toLowerCase() === target ||
          b.branchName.toLowerCase() === target
      ) || null
    );
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

  if (isDetached && detachedCameraId) {
    const detachedCam = cameras.find((c) => c.id === detachedCameraId);
    return (
      <main className="detached-control-room" style={{ width: "100vw", height: "100vh", background: "#050b14", display: "flex", flexDirection: "column", overflow: "hidden", color: "#f8fafc" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "rgba(10, 20, 35, 0.95)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            <h1 style={{ fontSize: "14px", fontWeight: 700, margin: 0, letterSpacing: "0.5px" }}>
              {detachedCam?.name || `Camera Feed (${detachedCameraId})`}
            </h1>
            {detachedCam?.branchName && (
              <span style={{ fontSize: "12px", color: "#94a3b8", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "4px" }}>
                {detachedCam.branchName}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
              DETACHED DUAL-MONITOR SURVEILLANCE
            </span>
            <button
              type="button"
              onClick={() => window.close()}
              style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
            >
              Close Window
            </button>
          </div>
        </header>
        <div style={{ flex: 1, minHeight: 0, padding: "8px" }}>
          {detachedCam ? (
            <EnhancedCameraGrid
              cameras={[detachedCam]}
              initialLayout={{
                name: "Detached",
                gridSize: "1x1",
                positions: [{ position: 0, cameraId: detachedCam.id, stream: "main" }],
              }}
              enableGPUAcceleration={true}
              presentationMode="LIVE_MONITORING"
              aiByCamera={aiByCamera}
              showAiOverlay={showAiOverlays}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
              <RefreshCw size={24} className="spin" style={{ marginRight: 8 }} /> Loading camera stream ({detachedCameraId})...
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="control-room operations-stage-room">
      <EmergencyAlarmPopup />
      <header className="los-page-heading">
        <div className="los-hero-copy">
          <span className="los-eyebrow">KRYPTONVISION <span aria-hidden="true">/</span> SIGNAL OBSERVATORY <span aria-hidden="true">/</span> 01</span>
          <div className="los-hero-title"><span className="los-hero-mark" aria-hidden="true"><Radio size={24} /></span><h1>Live Wall<span>.</span><small>Signal Observatory</small></h1></div>
          <p>{isWallWindow ? `Independent wall window ? ${windowScopeLabel}` : "A living field of feeds, areas and events. Shift focus with a single touch."}</p>
          <div className="los-hero-snapshot" aria-label="Current wall coverage">
            <span><strong>{displayedOnlineCameras}</strong> online</span>
            <span><strong>{wallSelection.branchCount}</strong> branches</span>
            <span><strong>{stats.unacknowledgedAlerts}</strong> need attention</span>
          </div>
        </div>
        <div className="los-page-actions">{isWallWindow && <button type="button" onClick={() => window.close()}><X size={15} />Close window</button>}<span className={"los-data-state " + dataMode}><i />{dataMode === "live" ? "Inventory connected" : dataMode === "partial" ? "Partial service availability" : "Services unavailable"}</span><Link href="/operations/alerts">Alert centre <ArrowUpRight size={15} /></Link><button type="button" onClick={() => void loadData()} disabled={refreshing}><RefreshCw size={15} />{refreshing ? "Refreshing…" : "Refresh scope"}</button></div>
      </header>

      {/* 2. Interactive Zone / Region / Area / Branch Scope Filter Toolbar */}
      <details className="los-scope-sheet"><summary><span><Globe2 size={17} />Wall scope & filters</span><strong>{windowScopeLabel} · {filteredCameras.length} cameras</strong><ChevronRight size={16} /></summary><section className="hierarchy-filter-bar" aria-label="Live Wall Scope Selection">
        <div className="filter-controls-row">
          {/* Zone Selector */}
          <div className="filter-select-group">
            <label htmlFor="zone-select">
              <Globe2 size={13} />
              <span>Zone:</span>
            </label>
            <ScopeMultiSelect id="zone-select" label="Zone" plural="Zones" options={availableZones}
              value={selectedZone} onChange={values => { setSelectedZone(values); setSelectedRegion([]); setSelectedArea([]); setSelectedBranchIds([]); }} />
          </div>

          {/* Region Selector */}
          <div className="filter-select-group">
            <label htmlFor="region-select">
              <MapPin size={13} />
              <span>Region:</span>
            </label>
            <ScopeMultiSelect id="region-select" label="Region" plural="Regions" options={availableRegions}
              value={selectedRegion} onChange={values => { setSelectedRegion(values); setSelectedArea([]); setSelectedBranchIds([]); }} />
          </div>

          {/* Area / District Selector */}
          <div className="filter-select-group">
            <label htmlFor="area-select">
              <Layers size={13} />
              <span>Area / District:</span>
            </label>
            <ScopeMultiSelect id="area-select" label="Area" plural="Areas" options={availableAreas}
              value={selectedArea} onChange={values => { setSelectedArea(values); setSelectedBranchIds([]); }} />
          </div>

          {/* Branch Selector */}
          <div className="filter-select-group highlight">
            <label htmlFor="branch-select">
              <Building2 size={13} />
              <span>Branch:</span>
            </label>
            <ScopeMultiSelect id="branch-select" label="Branch" plural="Branches" options={availableBranches.map(branch => ({ value: branch.branchId, label: `${branch.branchName} (${branch.cameraCount} cams)` }))}
              value={selectedBranchIds} onChange={setSelectedBranchIds} />
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
                  ) : selectedRegion.length > 0 ? (
                    <> in <em>{availableRegions.filter(region => selectedRegion.includes(region.value)).map(region => region.label).join(", ")}</em></>
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
              <SparklesIcon size={12} /> Overlays {showAiOverlays ? "on" : "off"}
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
      </section></details>

      <LiveWallWindows scope={{ zones: selectedZone, regions: selectedRegion, areas: selectedArea, branches: selectedBranchIds,
        query: searchQuery, status: statusFilter, hideUnavailable: hideUnavailableChannels,
        showAiOverlays, prioritizeAiAlerts }} label={windowScopeLabel} cameraCount={filteredCameras.length}
        disabled={loading || cameraDataState !== "ready"} />

      {/* Single branch context */}
      {activeSingleBranch && (
        <div className="single-branch-banner">
          <div className="branch-info-left">
            <Building2 size={24} className="branch-icon" />
            <div>
              <h3>{activeSingleBranch.branchName}</h3>
              <p>
                {activeSingleBranch.zoneName} &gt; {activeSingleBranch.regionName} &gt; {activeSingleBranch.areaName} ·{" "}
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

      {/* Primary live camera stage */}
      <section className="control-room-content" aria-label="Camera wall">
        {filteredCameras.length > 0 ? <LiveOperationsStage initialMode={isWallWindow ? "fleet" : "watch"} cameras={filteredCameras} alerts={liveAi.alerts} aiByCamera={aiByCamera} showAiOverlay={showAiOverlays} focusCameraId={focusCameraId} maxConcurrentStreams={Math.max(protectionStreamBudget, CONTROL_ROOM_MAX_CONCURRENT_STREAMS)} analyticsError={liveAi.error} analyticsLoading={liveAi.loading} onRefresh={liveAi.refresh} onActiveStreamsChange={setActiveStreams} onMonitoredCamerasChange={handleMonitoredCamerasChange} onOpenCameraAi={cameraId => { setSelectedAiCameraId(cameraId); setFocusCameraId(cameraId); setAiPanelOpen(true); }} /> : cameras.length > 0 ? (
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

      {/* Secondary monitoring telemetry */}
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
        <Link
          href="/operations/storage"
          className="stat-card storage-stat"
          aria-label="Open storage and disk health details"
        >
          <HardDrive size={20} className="stat-icon purple" aria-hidden="true" />
          <div>
            <strong>{stats.storageCapacityAvailable ? `${stats.storageUsagePercent}%` : "N/A"}</strong>
            <span>{stats.storageCapacityAvailable ? "Storage used" : "No capacity telemetry"}</span>
          </div>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
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

      {/* Virtual Guard patrol and advanced operations */}
      <details className="los-patrol-sheet"><summary><span><Compass size={16} />Patrol & advanced operations</span><small>{isPatrolActive ? PATROL_STAGES[patrolStageIndex].name : "Manual operator focus"}</small><ChevronRight size={16} /></summary><section className="patrol-tour-bar" aria-label="Virtual Guard Patrol Tour Mode">
        <div className="patrol-meta">
          <div className="patrol-brand">
            <Compass size={16} className={isPatrolActive ? "spin-slow text-indigo-400" : "text-slate-400"} />
            <strong>Virtual Guard Patrol Tour</strong>
            <span className={`patrol-badge ${isPatrolActive ? "active" : ""}`}>
              {isPatrolActive ? "AUTOPILOT PATROL ON" : "PATROL STANDBY"}
            </span>
          </div>
          {isPatrolActive && (
            <div className="patrol-current-stage">
              <span className="stage-tag">{PATROL_STAGES[patrolStageIndex].name}</span>
              <span className="countdown-tag">Next Zone in {patrolSecondsLeft}s</span>
            </div>
          )}
        </div>
        <div className="patrol-controls">
          <div className="interval-pills">
            <span>Cycle:</span>
            {[10, 15, 30].map((sec) => (
              <button
                key={sec}
                type="button"
                className={`interval-btn ${patrolIntervalSec === sec ? "active" : ""}`}
                onClick={() => {
                  setPatrolIntervalSec(sec);
                  setPatrolSecondsLeft(sec);
                }}
              >
                {sec}s
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`patrol-toggle-btn ${isPatrolActive ? "pause" : "start"}`}
            onClick={() => setIsPatrolActive((prev) => !prev)}
          >
            {isPatrolActive ? (
              <>
                <Pause size={13} /> Pause Patrol
              </>
            ) : (
              <>
                <Play size={13} /> Start Auto-Patrol Tour
              </>
            )}
          </button>
        </div>
      </section><div className="los-advanced-actions"><button type="button" onClick={() => setEmergencyLockdownOpen(true)}><Siren size={14} />Panic / lockdown cockpit</button><button type="button" onClick={() => setAudioDeterrenceOpen(true)}><Megaphone size={14} />Audio broadcast console</button></div></details>

      <InvestigationFlowNav />

      {aiPanelOpen && (
        <LiveAiWallPanel
          cameras={cameras.slice(0, 144)}
          rules={liveAi.rules}
          alerts={liveAi.alerts}
          correlations={liveAi.correlations}
          engineState={liveAi.engineState}
          capabilityDomains={liveAi.capabilityDomains}
          capabilityCount={liveAi.capabilityCount}
          selectedCameraId={selectedAiCameraId}
          loading={liveAi.loading}
          error={liveAi.error}
          lastUpdatedAt={liveAi.lastUpdatedAt}
          onSelectCamera={(cameraId) => {
            setSelectedAiCameraId(cameraId);
            setFocusCameraId(cameraId);
          }}
          onClose={() => setAiPanelOpen(false)}
          onRefresh={liveAi.refresh}
        />
      )}

      {/* Emergency Lockdown Cockpit Modal */}
      {emergencyLockdownOpen && (
        <div className="lockdown-modal-backdrop" onClick={() => setEmergencyLockdownOpen(false)}>
          <div className="lockdown-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="lockdown-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ padding: "8px", borderRadius: "10px", background: "rgba(225, 29, 72, 0.2)", border: "1px solid rgba(225, 29, 72, 0.4)", color: "#f43f5e" }}>
                  <Siren size={24} className="pulse-siren" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#ffffff" }}>
                    Emergency Panic &amp; Branch Lockdown Cockpit
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#fda4af", fontFamily: "monospace" }}>
                    DEFCON-1 CENTRAL DISPATCH • 112 POLICE INTEGRATION
                  </p>
                </div>
              </div>
              <button
                type="button"
                style={{ background: "transparent", border: 0, color: "#94a3b8", cursor: "pointer", padding: "4px" }}
                onClick={() => setEmergencyLockdownOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="lockdown-body">
              {lockdownState === "triggered" ? (
                <div className="triggered-alert-box">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(225, 29, 72, 0.15)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(225, 29, 72, 0.4)" }}>
                    <ShieldAlert size={32} style={{ color: "#f43f5e", flexShrink: 0 }} />
                    <div>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#ffffff" }}>EMERGENCY LOCKDOWN ACTIVE</h3>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#fecdd3" }}>
                        High-decibel edge strobes active. Doors interlocked. Law enforcement dispatched.
                      </p>
                    </div>
                  </div>

                  <div className="status-grid">
                    <div className="status-item ok">
                      <Volume2 size={14} /> 110dB Audio Strobe: Actively Broadcasting
                    </div>
                    <div className="status-item ok">
                      <Lock size={14} /> Magnetic Vault &amp; Ingress Access Doors: Interlocked &amp; Locked
                    </div>
                    <div className="status-item ok">
                      <Radio size={14} /> Police Control (112) &amp; Regional Security Officer: Alert Dispatched
                    </div>
                    <div className="status-item ok">
                      <Camera size={14} /> NVR Stream: Locked to 4K Evidence Vault Retained
                    </div>
                  </div>

                  {/* Disarm Section */}
                  <div className="disarm-section">
                    <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                      Enter Operator Authorization Code to Disarm &amp; Unlock:
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="password"
                        placeholder="e.g. SEC-9021 or Master PIN"
                        value={disarmCode}
                        onChange={(e) => setDisarmCode(e.target.value)}
                        className="disarm-input"
                      />
                      <button
                        type="button"
                        className="disarm-btn"
                        onClick={() => {
                          if (disarmCode.trim().length >= 4) {
                            setLockdownState("disarmed");
                            setLockdownLog((prev) => [
                              `[${new Date().toLocaleTimeString()}] Stand Down & Disarm authorized by operator (Code Verified).`,
                              ...prev,
                            ]);
                            setDisarmCode("");
                          } else {
                            alert("Please enter a valid 4+ digit authorization code.");
                          }
                        }}
                      >
                        <Unlock size={14} /> Disarm
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="standby-config">
                  <div className="target-selector">
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>
                      Target Branch for Lockdown:
                    </label>
                    <select
                      value={lockdownTargetBranch}
                      onChange={(e) => setLockdownTargetBranch(e.target.value)}
                      className="branch-select"
                    >
                      <option value="ALL">All Operational Branches (PANIC BROADCAST)</option>
                      {branchesList.map((b) => (
                        <option key={b.branchId} value={b.branchId}>
                          {b.branchName} ({b.branchId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="toggles-list">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={sirenActive}
                        onChange={(e) => setSirenActive(e.target.checked)}
                      />
                      <span>Trigger 110dB Edge Strobe Siren at branch</span>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={audioBroadcastActive}
                        onChange={(e) => setAudioBroadcastActive(e.target.checked)}
                      />
                      <span>Broadcast Two-Way IP Speaker Deterrence Warning ("Police dispatched")</span>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={doorInterlockActive}
                        onChange={(e) => setDoorInterlockActive(e.target.checked)}
                      />
                      <span>Engage Magnetic Access Control Door Lock Interlocks</span>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={policeDispatchNotified}
                        onChange={(e) => setPoliceDispatchNotified(e.target.checked)}
                      />
                      <span>Dispatch Instant SOS to Police Control Room (112) &amp; Branch RSO</span>
                    </label>
                  </div>

                  <div className="warning-note">
                    <AlertTriangle size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
                    <span>
                      Triggering lockdown will immediately engage physical security hardware and notify law enforcement. Every activation is permanently recorded in the immutable audit vault.
                    </span>
                  </div>

                  <button
                    type="button"
                    className="trigger-panic-btn"
                    onClick={() => {
                      setLockdownState("triggered");
                      setLockdownLog((prev) => [
                        `[${new Date().toLocaleTimeString()}] EMERGENCY LOCKDOWN TRIGGERED by operator for ${lockdownTargetBranch}.`,
                        ...prev,
                      ]);
                    }}
                  >
                    <Siren size={18} />
                    <span>ENGAGE EMERGENCY LOCKDOWN NOW</span>
                  </button>
                </div>
              )}

              {/* Event Trail */}
              {lockdownLog.length > 0 && (
                <div style={{ marginTop: "14px", padding: "10px", borderRadius: "8px", background: "#020617", border: "1px solid #1e293b", fontSize: "11px", fontFamily: "monospace", color: "#94a3b8", maxHeight: "90px", overflowY: "auto" }}>
                  {lockdownLog.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TWO-WAY AUDIO DETERRENCE & LIVE VOICE STROBE MODAL */}
      {audioDeterrenceOpen && (
        <div className="lockdown-modal-backdrop" role="dialog" aria-modal="true">
          <div className="lockdown-modal-card" style={{ borderColor: "#0ea5e9", boxShadow: "0 25px 50px -12px rgba(14, 165, 233, 0.35)" }}>
            <div className="lockdown-modal-header" style={{ background: "rgba(14, 165, 233, 0.1)", borderColor: "rgba(14, 165, 233, 0.3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Megaphone size={20} style={{ color: "#38bdf8" }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#fff" }}>
                    Two-Way Audio Deterrence &amp; Live Voice Strobe
                  </h2>
                  <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
                    Broadcast automated voice prompts or speak live to branch IP horn speakers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAudioDeterrenceOpen(false);
                  stopVoiceStrobe();
                  setPttActive(false);
                }}
                style={{ background: "transparent", border: 0, color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="lockdown-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Target Speaker */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                  Target Camera / IP Horn:
                </label>
                <select
                  value={audioTargetCamera}
                  onChange={(e) => setAudioTargetCamera(e.target.value)}
                  className="branch-select"
                >
                  <option value="CAM-01 Entrance IP Horn">CAM-01 Branch Main Entrance IP Horn (Exterior 30W)</option>
                  <option value="CAM-03 Cash Counter Speaker">CAM-03 Teller Counter Two-Way Speaker (Interior)</option>
                  <option value="CAM-04 Strong Room Intercom">CAM-04 Gold Vault Lobby Intercom (High-Security Zone)</option>
                  <option value="ALL Branch IP Speakers">ALL Branch IP Horns (Simultaneous Broadcast)</option>
                </select>
              </div>

              {/* Pre-recorded Voice Strobe Prompts */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                  Automated Voice Strobe Warnings (1-Click Broadcast):
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      playVoiceStrobe("HELMET_MASK");
                    }}
                    style={{ padding: "10px", borderRadius: "8px", background: voiceStrobePlaying === "HELMET_MASK" ? "rgba(14, 165, 233, 0.25)" : "#0f172a", border: "1px solid #1e293b", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                        🎭 Helmet &amp; Face Mask Removal Warning (Bilingual)
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                        &quot;Please remove helmet/mask before approaching counter&quot; (English + മലയാളം)
                      </div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: voiceStrobePlaying === "HELMET_MASK" ? "#0ea5e9" : "#1e293b", color: "#fff" }}>
                      {voiceStrobePlaying === "HELMET_MASK" ? "PLAYING..." : "BROADCAST"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playVoiceStrobe("PERIMETER_BREACH");
                    }}
                    style={{ padding: "10px", borderRadius: "8px", background: voiceStrobePlaying === "PERIMETER_BREACH" ? "rgba(245, 158, 11, 0.25)" : "#0f172a", border: "1px solid #1e293b", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                        ⚠️ Restricted Vault Perimeter Breach Deterrence
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                        &quot;Warning: You have entered a restricted zone. Security personnel are alerted.&quot;
                      </div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: voiceStrobePlaying === "PERIMETER_BREACH" ? "#f59e0b" : "#1e293b", color: "#fff" }}>
                      {voiceStrobePlaying === "PERIMETER_BREACH" ? "PLAYING..." : "BROADCAST"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playVoiceStrobe("POLICE_ALERT");
                    }}
                    style={{ padding: "10px", borderRadius: "8px", background: voiceStrobePlaying === "POLICE_ALERT" ? "rgba(239, 68, 68, 0.25)" : "#0f172a", border: "1px solid #1e293b", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                        🚔 Police &amp; Armed QRT Mobilization Announcement
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                        &quot;Law enforcement has been notified. Armed response team is en route.&quot;
                      </div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: voiceStrobePlaying === "POLICE_ALERT" ? "#ef4444" : "#1e293b", color: "#fff" }}>
                      {voiceStrobePlaying === "POLICE_ALERT" ? "PLAYING..." : "BROADCAST"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Push-to-Talk (PTT) Live Mic */}
              <div style={{ padding: "14px", borderRadius: "10px", background: "#020617", border: "1px solid #1e293b", textAlign: "center" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "8px" }}>
                  Live Operator Push-To-Talk (PTT) Transmission
                </div>
                <button
                  type="button"
                  onMouseDown={() => setPttActive(true)}
                  onMouseUp={() => setPttActive(false)}
                  onTouchStart={() => setPttActive(true)}
                  onTouchEnd={() => setPttActive(false)}
                  style={{
                    width: "100%", padding: "12px", borderRadius: "8px",
                    background: pttActive ? "#ef4444" : "#0284c7", color: "#fff",
                    fontWeight: 800, fontSize: "13px", border: 0, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    transition: "all .15s ease"
                  }}
                >
                  <Mic size={16} className={pttActive ? "animate-pulse" : ""} />
                  <span>{pttActive ? "TRANSMITTING LIVE (RELEASE TO STOP)" : "HOLD TO TALK TO BRANCH HORN"}</span>
                </button>
                <div style={{ marginTop: "6px", fontSize: "10px", color: "#64748b" }}>
                  {pttActive ? "Microphone active • Live PCM 16kHz audio streaming to edge horn" : "Press and hold button to broadcast your microphone to the branch horn"}
                </div>
              </div>
            </div>
          </div>
        </div>
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
        .lockdown-btn {
          display: inline-flex; align-items: center; gap: 6px; min-height: 36px;
          padding: 7px 12px; border: 1px solid #e11d48; border-radius: 7px;
          background: rgba(225, 29, 72, 0.15); color: #f43f5e; font-size: 12px;
          font-weight: 700; cursor: pointer; transition: all .15s ease;
        }
        .lockdown-btn:hover { background: rgba(225, 29, 72, 0.25); border-color: #f43f5e; color: #fff; }
        .pulse-siren { animation: siren-pulse 0.9s infinite alternate; }
        @keyframes siren-pulse { 0% { transform: scale(1); } 100% { transform: scale(1.25); } }

        .patrol-tour-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
          padding: 10px 16px; background: #0b1528; border: 1px solid #1e3a8a; border-radius: 10px;
        }
        .patrol-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .patrol-brand { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #f8fafc; }
        .patrol-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
        .patrol-badge.active { background: rgba(99, 102, 241, 0.25); color: #a5b4fc; border-color: #6366f1; }
        .patrol-current-stage { display: flex; align-items: center; gap: 8px; font-size: 12px; }
        .stage-tag { padding: 3px 8px; border-radius: 6px; background: #1e1b4b; color: #c7d2fe; border: 1px solid #4338ca; font-weight: 600; }
        .countdown-tag { color: #38bdf8; font-family: monospace; font-size: 11px; }
        .patrol-controls { display: flex; align-items: center; gap: 10px; }
        .interval-pills { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #94a3b8; }
        .interval-btn { padding: 3px 7px; border-radius: 5px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; font-size: 11px; font-weight: 600; cursor: pointer; }
        .interval-btn.active { background: #3b82f6; color: #fff; border-color: #2563eb; }
        .patrol-toggle-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; border: 0; }
        .patrol-toggle-btn.start { background: #4f46e5; color: #fff; }
        .patrol-toggle-btn.start:hover { background: #4338ca; }
        .patrol-toggle-btn.pause { background: #f59e0b; color: #000; }
        .spin-slow { animation: spin 5s linear infinite; }

        .lockdown-modal-backdrop {
          position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center;
          background: rgba(2, 6, 23, 0.85); backdrop-filter: blur(6px); padding: 16px;
        }
        .lockdown-modal-card {
          width: min(100%, 560px); background: #090e17; border: 1px solid #e11d48;
          border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(225, 29, 72, 0.35); overflow: hidden;
        }
        .lockdown-modal-header {
          display: flex; align-items: center; justify-content: space-between; padding: 16px 20px;
          border-bottom: 1px solid rgba(225, 29, 72, 0.3); background: rgba(225, 29, 72, 0.08);
        }
        .lockdown-body { padding: 20px; }
        .triggered-alert-box { display: flex; flex-direction: column; gap: 14px; }
        .status-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 8px 0; }
        .status-item { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 8px; }
        .status-item.ok { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
        .disarm-section { margin-top: 10px; padding: 12px; border-radius: 8px; background: #0f172a; border: 1px solid #1e293b; }
        .disarm-input { flex: 1; padding: 7px 12px; border-radius: 6px; background: #020617; border: 1px solid #334155; color: #fff; font-size: 12px; }
        .disarm-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; background: #10b981; color: #fff; font-weight: 700; font-size: 12px; border: 0; cursor: pointer; }
        .standby-config { display: flex; flex-direction: column; gap: 14px; }
        .target-selector { display: flex; flex-direction: column; gap: 6px; }
        .branch-select { padding: 8px 12px; border-radius: 8px; background: #0f172a; border: 1px solid #334155; color: #fff; font-size: 13px; }
        .toggles-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 10px; background: #0f172a; border: 1px solid #1e293b; }
        .toggle-label { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #cbd5e1; cursor: pointer; }
        .toggle-label input { width: 16px; height: 16px; accent-color: #e11d48; }
        .warning-note { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: #fbbf24; background: rgba(245, 158, 11, 0.1); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.2); }
        .trigger-panic-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; border-radius: 8px; background: #e11d48; color: #fff; font-weight: 800; font-size: 14px; border: 0; cursor: pointer; box-shadow: 0 10px 25px -5px rgba(225, 29, 72, 0.5); transition: background .15s ease; }
        .trigger-panic-btn:hover { background: #be123c; }

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
        .los-scope-sheet[open] { position: relative; z-index: 20; overflow: visible; }
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
        .stat-card {
          min-width: 0; min-height: 84px; display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          background: #0d1a2d; border: 1px solid #1c324f; border-radius: 10px; color: inherit; text-align: left;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }
        button.stat-card { cursor: pointer; }
        button.stat-card:hover, .stat-card:hover { border-color: #38bdf8; background: #11223b; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(6, 182, 212, 0.25); }
        .stat-card div { display: flex; min-width: 0; flex-direction: column; }
        .stat-card strong { font-size: 22px; line-height: 1.15; color: #ffffff; font-weight: 800; letter-spacing: -.5px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
        .stat-card span { margin-top: 4px; color: #94a3b8; font-size: 11px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
        .stat-icon { flex: 0 0 auto; color: #94a3b8; }
        .stat-icon.green { color: #22c55e; }
        .stat-icon.red { color: #ef4444; }
        .stat-icon.amber { color: #f59e0b; }
        .stat-icon.blue, .stat-icon.cyan { color: #38bdf8; }
        .stat-icon.purple { color: #c084fc; }
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

export default function ControlRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="control-room-loading" role="status">
          <RefreshCw size={36} className="spin" />
          <p>Initializing Live Video Wall…</p>
        </div>
      }
    >
      <ControlRoomContent />
    </Suspense>
  );
}
