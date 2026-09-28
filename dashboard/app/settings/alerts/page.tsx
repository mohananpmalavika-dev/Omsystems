"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout, getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { defaultRoleWorkspace } from "@/lib/role-workspaces";
import {
  authApi,
  cameraInventoryApi,
  alertSuppressionApi,
  type SuppressionConfig,
} from "@/lib/api-client";
import type { Branch } from "@/lib/types";
import {
  Bell,
  BellOff,
  Building2,
  Camera as CameraIcon,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  Layers,
} from "lucide-react";

// Canonical detection types supported across the vision analytics pipeline
const DETECTION_TYPES = [
  { id: "INTRUSION", label: "Intrusion Detection", icon: "🚨", severity: "critical" },
  { id: "FIRE", label: "Fire Detection", icon: "🔥", severity: "critical" },
  { id: "SMOKE", label: "Smoke Detection", icon: "💨", severity: "critical" },
  { id: "CAMERA_TAMPER", label: "Camera Tamper", icon: "📵", severity: "high" },
  { id: "VAULT_ACCESS", label: "Vault Access", icon: "🔐", severity: "critical" },
  { id: "LOITERING", label: "Loitering", icon: "🧍", severity: "medium" },
  { id: "CROWD_GATHERING", label: "Crowd Gathering", icon: "👥", severity: "medium" },
  { id: "BLACKLIST_PERSON", label: "Watchlist Person", icon: "🎯", severity: "critical" },
  { id: "VEHICLE_ANPR", label: "ANPR / Vehicle", icon: "🚗", severity: "medium" },
  { id: "VIOLENCE", label: "Violence Detection", icon: "⚠️", severity: "critical" },
  { id: "CAMERA_OBSTRUCTION", label: "Camera Obstruction", icon: "🚫", severity: "high" },
  { id: "ATM_VANDALISM", label: "ATM Vandalism", icon: "🏧", severity: "critical" },
  { id: "WEAPON_DETECTED", label: "Weapon Detection", icon: "🔫", severity: "critical" },
  { id: "CASH_VAN_MONITORING", label: "Cash Van Monitoring", icon: "💰", severity: "high" },
  { id: "QUEUE_ANOMALY", label: "Queue Anomaly", icon: "🔔", severity: "low" },
  { id: "CAMERA_HEALTH_FAULT", label: "Camera Health Fault", icon: "📷", severity: "medium" },
] as const;

type DetectionTypeId = (typeof DETECTION_TYPES)[number]["id"];

interface CameraItem {
  id: string;
  name: string;
  model?: string;
  ipAddress?: string;
  location?: string;
  status?: string;
}

function severityColor(s: string) {
  switch (s) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "medium": return "text-amber-400";
    default: return "text-slate-400";
  }
}

// ─────────────────────────────────────────────────────────────
// Toggle Switch Component
// ─────────────────────────────────────────────────────────────
function ToggleSwitch({
  active,
  onToggle,
  loading,
  disabled,
  id,
  size = "md",
}: {
  active: boolean;
  onToggle: () => void;
  loading?: boolean;
  disabled?: boolean;
  id: string;
  size?: "sm" | "md";
}) {
  const isSm = size === "sm";
  return (
    <button
      id={id}
      type="button"
      onClick={onToggle}
      disabled={disabled || loading}
      aria-pressed={active}
      className={`
        relative inline-flex flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900
        ${isSm ? "h-5 w-9" : "h-6 w-11"}
        ${active ? "bg-emerald-600" : "bg-slate-700"}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <span className="sr-only">{active ? "Active" : "Suppressed"}</span>
      <span
        className={`
          pointer-events-none inline-block transform rounded-full bg-white shadow ring-0
          transition duration-200 ease-in-out flex items-center justify-center
          ${isSm ? "h-4 w-4" : "h-5 w-5"}
          ${active ? (isSm ? "translate-x-4" : "translate-x-5") : "translate-x-0"}
        `}
      >
        {loading && (
          <Loader2 className={`${isSm ? "h-2.5 w-2.5" : "h-3 w-3"} text-slate-500 animate-spin`} />
        )}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────
function StatusBadge({
  suppressed,
  inheritedFrom,
}: {
  suppressed: boolean;
  inheritedFrom?: "camera" | "branch" | "global" | null;
}) {
  if (suppressed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-950/70 border border-red-800/60 text-red-300">
        <BellOff className="h-3 w-3" /> Suppressed
        {inheritedFrom && inheritedFrom !== "camera" && (
          <span className="text-[10px] text-red-400/80">({inheritedFrom})</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/70 border border-emerald-800/60 text-emerald-300">
      <Bell className="h-3 w-3" /> Active
      {inheritedFrom && inheritedFrom !== "camera" && (
        <span className="text-[10px] text-emerald-400/80">({inheritedFrom})</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Resolution helper: Most-specific rule wins
// Camera > Branch > Global
// Detection-type > All (null)
// ─────────────────────────────────────────────────────────────
function resolveEffectiveState(
  configs: SuppressionConfig[],
  branchId: string | null,
  cameraId: string | null,
  detectionType: string | null
): { active: boolean; inheritedFrom: "camera" | "branch" | "global" | null; exactMatch: boolean } {
  // 1. Camera specific detection type
  if (cameraId && detectionType) {
    const exact = configs.find(
      (c) => c.branchId === branchId && c.cameraId === cameraId && c.detectionType === detectionType
    );
    if (exact) return { active: !exact.suppressed, inheritedFrom: "camera", exactMatch: true };

    const cameraAll = configs.find(
      (c) => c.branchId === branchId && c.cameraId === cameraId && c.detectionType === null
    );
    if (cameraAll) return { active: !cameraAll.suppressed, inheritedFrom: "camera", exactMatch: false };
  }

  // 2. Camera all-types
  if (cameraId && !detectionType) {
    const cameraAll = configs.find(
      (c) => c.branchId === branchId && c.cameraId === cameraId && c.detectionType === null
    );
    if (cameraAll) return { active: !cameraAll.suppressed, inheritedFrom: "camera", exactMatch: true };
  }

  // 3. Branch specific detection type
  if (branchId && detectionType) {
    const branchExact = configs.find(
      (c) => c.branchId === branchId && c.cameraId === null && c.detectionType === detectionType
    );
    if (branchExact) return { active: !branchExact.suppressed, inheritedFrom: "branch", exactMatch: true };

    const branchAll = configs.find(
      (c) => c.branchId === branchId && c.cameraId === null && c.detectionType === null
    );
    if (branchAll) return { active: !branchAll.suppressed, inheritedFrom: "branch", exactMatch: false };
  }

  // 4. Branch all-types
  if (branchId && !detectionType && !cameraId) {
    const branchAll = configs.find(
      (c) => c.branchId === branchId && c.cameraId === null && c.detectionType === null
    );
    if (branchAll) return { active: !branchAll.suppressed, inheritedFrom: "branch", exactMatch: true };
  }

  // 5. Global specific detection type
  if (detectionType) {
    const globalExact = configs.find(
      (c) => c.branchId === null && c.cameraId === null && c.detectionType === detectionType
    );
    if (globalExact) return { active: !globalExact.suppressed, inheritedFrom: "global", exactMatch: true };
  }

  // 6. Global all-types
  const globalAll = configs.find(
    (c) => c.branchId === null && c.cameraId === null && c.detectionType === null
  );
  if (globalAll) return { active: !globalAll.suppressed, inheritedFrom: "global", exactMatch: !branchId && !cameraId && !detectionType };

  // Default: active (no suppression configured anywhere)
  return { active: true, inheritedFrom: null, exactMatch: false };
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────
export default function AlertSuppressionPage() {
  const [user, setUser] = useState<MenuAccessUser | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchCameras, setBranchCameras] = useState<Record<string, CameraItem[]>>({});
  const [loadingCameras, setLoadingCameras] = useState<Record<string, boolean>>({});
  const [configs, setConfigs] = useState<SuppressionConfig[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingToggles, setLoadingToggles] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // UI state
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});
  const [expandedCameras, setExpandedCameras] = useState<Record<string, boolean>>({});
  const [showBranchCameras, setShowBranchCameras] = useState<Record<string, boolean>>({});
  const [filterText, setFilterText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [meData, branchData, configData] = await Promise.all([
        authApi.getCurrentUser().catch(() => null),
        cameraInventoryApi.listBranches().catch(() => ({ data: [] })),
        alertSuppressionApi.list().catch(() => ({ data: [] as SuppressionConfig[], success: false, count: 0 })),
      ]);
      setUser((meData as any)?.user ?? meData ?? null);
      setBranches((branchData as any).data ?? []);
      setConfigs((configData as any).data ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load suppression configuration");
    } finally {
      setLoadingPage(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load cameras for a specific branch on demand
  const loadBranchCameras = useCallback(async (branchId: string) => {
    if (branchCameras[branchId] || loadingCameras[branchId]) return;
    setLoadingCameras((p) => ({ ...p, [branchId]: true }));
    try {
      const res = await cameraInventoryApi.listByBranch(branchId);
      setBranchCameras((p) => ({ ...p, [branchId]: res.data ?? [] }));
    } catch (err) {
      console.warn("Failed to load cameras for branch", branchId, err);
      setBranchCameras((p) => ({ ...p, [branchId]: [] }));
    } finally {
      setLoadingCameras((p) => ({ ...p, [branchId]: false }));
    }
  }, [branchCameras, loadingCameras]);

  // ─── Toggle a specific detection type at a scope ───
  const toggleDetectionType = useCallback(
    async (
      branchId: string | null,
      cameraId: string | null,
      detectionType: string | null,
      currentlyActive: boolean,
      label?: string
    ) => {
      const key = `${branchId ?? "G"}-${cameraId ?? "C"}-${detectionType ?? "ALL"}`;
      setLoadingToggles((p) => ({ ...p, [key]: true }));
      try {
        const result = await alertSuppressionApi.toggle({
          branchId,
          cameraId,
          detectionType,
          suppressed: currentlyActive, // Toggling: if active -> suppress (mute)
          label,
        });
        if (result.success) {
          setConfigs((prev) => {
            const filtered = prev.filter(
              (c) => !(c.branchId === branchId && c.cameraId === cameraId && c.detectionType === detectionType)
            );
            return [...filtered, result.data];
          });
          showToast(currentlyActive ? `${label ?? "Alert"} muted` : `${label ?? "Alert"} activated`);
        }
      } catch (err: any) {
        showToast(err?.message ?? "Failed to update suppression", "error");
      } finally {
        setLoadingToggles((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    },
    []
  );

  // ─── Bulk toggle all detection types for a scope ───
  const bulkToggle = useCallback(
    async (
      branchId: string | null,
      cameraId: string | null,
      suppressed: boolean,
      scopeLabel?: string
    ) => {
      const key = `bulk-${branchId ?? "G"}-${cameraId ?? "C"}`;
      setLoadingToggles((p) => ({ ...p, [key]: true }));
      try {
        const result = await alertSuppressionApi.bulkToggle({ branchId, cameraId, suppressed });
        if (result.success) {
          setConfigs((prev) => {
            const filtered = prev.filter(
              (c) => !(c.branchId === branchId && c.cameraId === cameraId && c.detectionType === null)
            );
            return [...filtered, result.data];
          });
          showToast(
            suppressed
              ? `All alerts muted for ${scopeLabel ?? "selected scope"}`
              : `All alerts activated for ${scopeLabel ?? "selected scope"}`
          );
        }
      } catch (err: any) {
        showToast(err?.message ?? "Failed to update alert state", "error");
      } finally {
        setLoadingToggles((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    },
    []
  );

  const visibleNav = useMemo(() => (user ? getVisibleNavigation(user) : []), [user]);
  const workspace = useMemo(() => (user ? defaultRoleWorkspace(user.role) : "/"), [user]);

  const filteredDetectionTypes = useMemo(
    () => DETECTION_TYPES.filter((dt) => dt.label.toLowerCase().includes(filterText.toLowerCase())),
    [filterText]
  );

  const filteredBranches = useMemo(
    () =>
      branches.filter((b) => {
        if (!filterText) return true;
        const lower = filterText.toLowerCase();
        if (b.name?.toLowerCase().includes(lower)) return true;
        const code = (b as any).code;
        if (typeof code === "string" && code.toLowerCase().includes(lower)) return true;
        const cameras = branchCameras[b.id] ?? [];
        return cameras.some((c) => (c.name || c.model || "").toLowerCase().includes(lower));
      }),
    [branches, filterText, branchCameras]
  );

  if (loadingPage) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading alert configuration…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
          <p className="text-slate-300">{error}</p>
          <button
            onClick={() => { setError(null); setLoadingPage(true); loadData(); }}
            className="px-4 py-2 text-sm bg-slate-800 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const globalResolved = resolveEffectiveState(configs, null, null, null);
  const globalBulkKey = `bulk-G-C`;

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border transition-all ${
              toast.type === "success"
                ? "bg-emerald-950 text-emerald-200 border-emerald-700"
                : "bg-red-950 text-red-200 border-red-700"
            }`}
          >
            {toast.type === "success" ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
            {toast.message}
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <ShieldAlert className="h-6 w-6 text-amber-400" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Alert Controls & Toggles</h1>
              </div>
              <p className="text-slate-400 text-sm ml-12">
                Activate or deactivate alerts globally, per branch, or per individual camera with one-click toggles.
                Suppressed alerts are silently discarded with zero false alarms.
              </p>
            </div>
            <button
              id="refresh-suppression-btn"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm transition-colors disabled:opacity-50 self-start sm:self-auto"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Search / Filter */}
          <div className="relative">
            <input
              id="alert-suppression-search"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search by branch name, camera name, or alert type…"
              className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* GLOBAL SECTION: Master & Per-Detection-Type Controls    */}
          {/* ═════════════════════════════════════════════════════════ */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <Globe className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold">Global Organisation Controls</h2>
                  <p className="text-slate-400 text-xs">Master switch across all branches and all cameras</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge suppressed={!globalResolved.active} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium">All Alerts</span>
                  <ToggleSwitch
                    id="toggle-global-all"
                    active={globalResolved.active}
                    loading={loadingToggles[globalBulkKey]}
                    onToggle={() => bulkToggle(null, null, globalResolved.active, "Entire Organisation")}
                  />
                </div>
              </div>
            </div>

            {/* Global per-detection-type rows */}
            <div className="divide-y divide-slate-800/40">
              {filteredDetectionTypes.map((dt) => {
                const resolved = resolveEffectiveState(configs, null, null, dt.id);
                const key = `G-C-${dt.id}`;
                return (
                  <div
                    key={dt.id}
                    className="px-5 py-3 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base w-7 text-center">{dt.icon}</span>
                      <div>
                        <span className="text-sm font-medium text-slate-200">{dt.label}</span>
                        <span className={`ml-2 text-xs font-mono uppercase ${severityColor(dt.severity)}`}>
                          {dt.severity}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge suppressed={!resolved.active} />
                      <ToggleSwitch
                        id={`toggle-global-${dt.id}`}
                        active={resolved.active}
                        loading={loadingToggles[key]}
                        onToggle={() =>
                          toggleDetectionType(null, null, dt.id, resolved.active, `${dt.label} (Global)`)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ═════════════════════════════════════════════════════════ */}
          {/* BRANCH & CAMERA SECTIONS                                 */}
          {/* ═════════════════════════════════════════════════════════ */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-semibold text-slate-200">Branch & Camera Overrides</h2>
              <span className="text-xs text-slate-400">
                {filteredBranches.length} {filteredBranches.length === 1 ? "branch" : "branches"}
              </span>
            </div>

            {filteredBranches.length === 0 && (
              <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/30 text-center">
                <p className="text-slate-400 text-sm">No branches match your search criteria.</p>
              </div>
            )}

            {filteredBranches.map((branch) => {
              const branchBulkResolved = resolveEffectiveState(configs, branch.id, null, null);
              const branchBulkKey = `bulk-${branch.id}-C`;
              const isExpanded = expandedBranches[branch.id] ?? false;
              const areCamerasOpen = showBranchCameras[branch.id] ?? false;
              const cameras = branchCameras[branch.id] ?? [];
              const isLoadingCams = loadingCameras[branch.id] ?? false;

              return (
                <section
                  key={branch.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm overflow-hidden"
                >
                  {/* Branch Header Row */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/60">
                    <button
                      id={`expand-branch-${branch.id}`}
                      className="flex items-center gap-3 flex-1 text-left focus:outline-none"
                      onClick={() => {
                        const next = !isExpanded;
                        setExpandedBranches((p) => ({ ...p, [branch.id]: next }));
                        if (next && !branchCameras[branch.id]) {
                          loadBranchCameras(branch.id);
                        }
                      }}
                    >
                      <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Building2 className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold text-base">{branch.name}</h3>
                          {(branch as any).code && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                              {(branch as any).code}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs">
                          {isExpanded ? "Click to collapse" : "Click to expand detection types and cameras"}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400 ml-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 ml-2" />
                      )}
                    </button>

                    {/* Branch Master Toggle */}
                    <div className="flex items-center gap-3 pl-4">
                      <StatusBadge
                        suppressed={!branchBulkResolved.active}
                        inheritedFrom={branchBulkResolved.inheritedFrom}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300 font-medium hidden sm:inline">
                          All Branch Alerts
                        </span>
                        <ToggleSwitch
                          id={`toggle-branch-all-${branch.id}`}
                          active={branchBulkResolved.active}
                          loading={loadingToggles[branchBulkKey]}
                          onToggle={() =>
                            bulkToggle(branch.id, null, branchBulkResolved.active, branch.name)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Collapsible: Detection types & Cameras for this branch */}
                  {isExpanded && (
                    <div className="p-4 space-y-6">
                      {/* 1. Branch Detection-Type Overrides */}
                      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ShieldOff className="h-4 w-4 text-amber-400" />
                          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Branch-Wide Detection Type Controls ({branch.name})
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {filteredDetectionTypes.map((dt) => {
                            const resolved = resolveEffectiveState(configs, branch.id, null, dt.id);
                            const key = `${branch.id}-C-${dt.id}`;
                            return (
                              <div
                                key={dt.id}
                                className="px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 truncate mr-2">
                                  <span className="text-sm">{dt.icon}</span>
                                  <span className="text-xs font-medium text-slate-200 truncate">
                                    {dt.label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <StatusBadge
                                    suppressed={!resolved.active}
                                    inheritedFrom={resolved.inheritedFrom}
                                  />
                                  <ToggleSwitch
                                    id={`toggle-${branch.id}-${dt.id}`}
                                    active={resolved.active}
                                    size="sm"
                                    loading={loadingToggles[key]}
                                    onToggle={() =>
                                      toggleDetectionType(
                                        branch.id,
                                        null,
                                        dt.id,
                                        resolved.active,
                                        `${dt.label} — ${branch.name}`
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Camera-Specific Controls */}
                      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              const next = !areCamerasOpen;
                              setShowBranchCameras((p) => ({ ...p, [branch.id]: next }));
                              if (next && !branchCameras[branch.id]) {
                                loadBranchCameras(branch.id);
                              }
                            }}
                            className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider hover:text-white transition-colors"
                          >
                            <CameraIcon className="h-4 w-4 text-emerald-400" />
                            <span>
                              Cameras in {branch.name} ({cameras.length > 0 ? cameras.length : "…"})
                            </span>
                            {areCamerasOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                            )}
                          </button>

                          {!areCamerasOpen && (
                            <button
                              onClick={() => {
                                setShowBranchCameras((p) => ({ ...p, [branch.id]: true }));
                                loadBranchCameras(branch.id);
                              }}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                              Configure Individual Cameras →
                            </button>
                          )}
                        </div>

                        {areCamerasOpen && (
                          <div className="space-y-3 pt-2">
                            {isLoadingCams && (
                              <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                                <span>Loading cameras for {branch.name}…</span>
                              </div>
                            )}

                            {!isLoadingCams && cameras.length === 0 && (
                              <p className="text-slate-500 text-xs py-2">
                                No cameras configured for this branch.
                              </p>
                            )}

                            {cameras.map((camera) => {
                              const camBulkResolved = resolveEffectiveState(
                                configs,
                                branch.id,
                                camera.id,
                                null
                              );
                              const camBulkKey = `bulk-${branch.id}-${camera.id}`;
                              const isCamExpanded = expandedCameras[camera.id] ?? false;

                              return (
                                <div
                                  key={camera.id}
                                  className="rounded-lg border border-slate-800 bg-slate-900/70 overflow-hidden"
                                >
                                  {/* Camera Row Header */}
                                  <div className="px-4 py-3 flex items-center justify-between bg-slate-900/90 border-b border-slate-800/60">
                                    <button
                                      type="button"
                                      className="flex items-center gap-2.5 flex-1 text-left focus:outline-none"
                                      onClick={() =>
                                        setExpandedCameras((p) => ({ ...p, [camera.id]: !isCamExpanded }))
                                      }
                                    >
                                      <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                        <CameraIcon className="h-3.5 w-3.5 text-emerald-400" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-slate-200">
                                            {camera.name || camera.model || camera.id}
                                          </span>
                                          {camera.ipAddress && (
                                            <span className="text-[10px] font-mono text-slate-500">
                                              {camera.ipAddress}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[11px] text-slate-400">
                                          {isCamExpanded ? "Hide alert types" : "Configure alert types for this camera"}
                                        </span>
                                      </div>
                                      {isCamExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 ml-1" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5 text-slate-500 ml-1" />
                                      )}
                                    </button>

                                    {/* Camera Master Toggle */}
                                    <div className="flex items-center gap-3">
                                      <StatusBadge
                                        suppressed={!camBulkResolved.active}
                                        inheritedFrom={camBulkResolved.inheritedFrom}
                                      />
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                                          All Alerts
                                        </span>
                                        <ToggleSwitch
                                          id={`toggle-camera-all-${camera.id}`}
                                          active={camBulkResolved.active}
                                          size="sm"
                                          loading={loadingToggles[camBulkKey]}
                                          onToggle={() =>
                                            bulkToggle(
                                              branch.id,
                                              camera.id,
                                              camBulkResolved.active,
                                              camera.name || camera.id
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Camera Detection-Type Specific Toggles */}
                                  {isCamExpanded && (
                                    <div className="p-3 bg-slate-950/60 divide-y divide-slate-800/40">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
                                        {filteredDetectionTypes.map((dt) => {
                                          const resolved = resolveEffectiveState(
                                            configs,
                                            branch.id,
                                            camera.id,
                                            dt.id
                                          );
                                          const key = `${branch.id}-${camera.id}-${dt.id}`;
                                          return (
                                            <div
                                              key={dt.id}
                                              className="px-3 py-2 rounded-md bg-slate-900/50 border border-slate-800/40 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
                                            >
                                              <div className="flex items-center gap-2 truncate mr-2">
                                                <span className="text-xs">{dt.icon}</span>
                                                <span className="text-[11px] text-slate-300 truncate">
                                                  {dt.label}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <StatusBadge
                                                  suppressed={!resolved.active}
                                                  inheritedFrom={resolved.inheritedFrom}
                                                />
                                                <ToggleSwitch
                                                  id={`toggle-cam-${camera.id}-${dt.id}`}
                                                  active={resolved.active}
                                                  size="sm"
                                                  loading={loadingToggles[key]}
                                                  onToggle={() =>
                                                    toggleDetectionType(
                                                      branch.id,
                                                      camera.id,
                                                      dt.id,
                                                      resolved.active,
                                                      `${dt.label} — ${camera.name || camera.id}`
                                                    )
                                                  }
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Footer Guide */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="font-semibold text-slate-300">Hierarchy Precedence:</span>
              <span>Camera Override &gt; Branch Override &gt; Global Organisation</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>Active (Fires normally)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
                <span>Suppressed (Muted)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Real-time persistence</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
