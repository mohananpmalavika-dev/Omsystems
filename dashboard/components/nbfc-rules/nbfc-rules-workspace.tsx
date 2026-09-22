"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  Box,
  Building2,
  Calendar,
  Camera,
  CheckCircle,
  Clock,
  Copy,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Flame,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Moon,
  Move,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  Video,
  Volume2,
  X,
  Zap,
} from "lucide-react";

// Types
type TabType = "overview" | "rules" | "zones" | "templates" | "health" | "history";

interface RuleItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  state: "ACTIVE" | "SHADOW" | "INACTIVE" | "COOLDOWN" | "SUPPRESSED";
  branchIds: string[];
  cameraIds: string[];
  zoneId?: string;
  detectorType: string;
  condition: {
    metric?: string;
    operator?: string;
    value?: any;
    logical?: "AND" | "OR" | "NOT";
    conditions?: any[];
  };
  durationMs: number;
  schedule: {
    type: string;
    timezone?: string;
    start?: string;
    end?: string;
    days?: number[];
  };
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  cooldownMs: number;
  actions: string[];
  version: number;
  templateId?: string;
  scopeType: string;
  createdAt: string;
  updatedAt?: string;
}

interface ZoneItem {
  id: string;
  branchId: string;
  cameraId: string;
  name: string;
  type: string;
  polygon: { x: number; y: number }[];
  enabled: boolean;
  version: number;
}

interface TemplateItem {
  id: string;
  name: string;
  category: string;
  description: string;
  detectorType: string;
  defaultCondition: any;
  defaultDurationMs: number;
  defaultSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  defaultCooldownMs: number;
  defaultActions: string[];
  recommendedZoneTypes: string[];
  suggestedSchedule: string;
  metadata?: any;
}

interface ModelHealthItem {
  detector: string;
  model: string;
  version: string;
  status: "PRODUCTION_READY" | "PILOT_READY" | "LAB_VALIDATED" | "EXPERIMENTAL" | "NOT_IMPLEMENTED";
  runtime: string;
  inputResolution: string;
  confidenceThreshold: number;
  validatedHardware: string;
  targetFps: number;
  actualFps: number;
  latencyMs: number;
  commercialLicenseReviewed: boolean;
  notes?: string;
}

interface StatisticsData {
  totalBranches: number;
  totalAiCameras: number;
  totalActiveRules: number;
  totalShadowRules: number;
  todayEvents: {
    critical: number;
    high: number;
    warning: number;
    total: number;
  };
  nbfcMetrics: {
    lockerViolations: number;
    afterHoursPersons: number;
    queueSlaBreaches: number;
    cashCounterCrowds: number;
    cameraTamperingEvents: number;
    recordingGapsDetected: number;
  };
  cashCounterAnalytics: {
    activeCounters: number;
    unattendedCounters: number;
    averageWaitSeconds: number;
    maxWaitSeconds: number;
    totalCustomersServedToday: number;
  };
  lockerSecurity: {
    activeLockerSessions: number;
    todayLockerEntries: number;
    maxOccupancyViolations: number;
    dualControlCompliantPercent: number;
  };
}

async function aiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken")
    : null;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("x-sentinel-session", token);
  }

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    throw new Error(`AI API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export function NbfcRulesWorkspace() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedCamera, setSelectedCamera] = useState("ALL");
  const [selectedType, setSelectedType] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Data states
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [models, setModels] = useState<ModelHealthItem[]>([]);
  const [stats, setStats] = useState<StatisticsData | null>(null);
  const [capacity, setCapacity] = useState<any>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [cameras, setCameras] = useState<Array<{ id: string; name: string; branchId?: string; branchName?: string }>>([]);

  // Modals & Drawers
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleItem | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testRuleTarget, setTestRuleTarget] = useState<RuleItem | null>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackRuleTarget, setFeedbackRuleTarget] = useState<RuleItem | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("reflection");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [isEnablingAll, setIsEnablingAll] = useState(false);

  // Builder form state
  const [builderForm, setBuilderForm] = useState({
    name: "",
    description: "",
    branchId: "ALL",
    cameraId: "ALL",
    zoneId: "",
    detectorType: "person",
    metric: "person_count",
    operator: "GREATER_THAN",
    value: 2,
    durationSeconds: 5,
    scheduleType: "BUSINESS_HOURS",
    scheduleStart: "08:30",
    scheduleEnd: "09:30",
    scheduleTimezone: "Asia/Kolkata",
    severity: "CRITICAL" as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
    cooldownSeconds: 60,
    actionAlert: true,
    actionIncident: false,
    actionSnapshot: true,
    actionClip: true,
    actionBookmark: false,
    actionPopup: false,
    actionNotifySoc: true,
    actionNotifyBranch: true,
    state: "SHADOW" as "ACTIVE" | "SHADOW",
    templateId: "",
  });

  // Zone manager state
  const [zoneCameraId, setZoneCameraId] = useState("");
  const [zoneName, setZoneName] = useState("Locker Interior");
  const [zoneType, setZoneType] = useState("LOCKER");
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [zoneMode, setZoneMode] = useState<"POLYGON" | "TRIPWIRE">("POLYGON");
  const [tripwireDirection, setTripwireDirection] = useState<"A_TO_B" | "B_TO_A" | "BIDIRECTIONAL">("A_TO_B");
  const [lensTamperDetected, setLensTamperDetected] = useState(false);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Array<{ x: number; y: number }[]>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ x: number; y: number }[]>>([]);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load initial data
  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rulesRes, zonesRes, tmplRes, healthRes, statsRes, branchRes, cameraRes] = await Promise.all([
        aiFetch("/api/ai/rules"),
        aiFetch("/api/ai/zones"),
        aiFetch("/api/ai/rule-templates"),
        aiFetch("/api/ai/health"),
        aiFetch("/api/ai/statistics"),
        aiFetch("/api/branches"),
        aiFetch("/api/ai/cameras"),
      ]);

      if (rulesRes?.rules && Array.isArray(rulesRes.rules)) {
        setRules(rulesRes.rules);
      } else {
        setRules([]);
      }

      if (zonesRes?.zones) setZones(zonesRes.zones);
      if (tmplRes?.templates) setTemplates(tmplRes.templates);
      if (healthRes?.models) setModels(healthRes.models);
      if (healthRes?.capacity) setCapacity(healthRes.capacity);
      if (statsRes) setStats(statsRes);

      if (branchRes?.data && Array.isArray(branchRes.data)) {
        setBranches(branchRes.data);
      }
      if (cameraRes?.cameras && Array.isArray(cameraRes.cameras)) {
        setCameras(cameraRes.cameras);
        if (cameraRes.cameras.length > 0 && !zoneCameraId) {
          setZoneCameraId(cameraRes.cameras[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load AI rules workspace data:", e);
      setLoadError(e instanceof Error ? e.message : "Unable to load live AI Rules & Automation data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Load camera snapshot when camera changes
  useEffect(() => {
    if (zoneCameraId && activeTab === "zones") {
      loadCameraSnapshot(zoneCameraId);
    }
  }, [zoneCameraId, activeTab]);

  const loadCameraSnapshot = async (cameraId: string) => {
    setLoadingSnapshot(true);
    setSnapshotError(null);
    
    try {
      // Try multiple snapshot endpoints
      const endpoints = [
        `/api/media/snapshots/${encodeURIComponent(cameraId)}.jpg`,
        `/api/v1/media/snapshots/${encodeURIComponent(cameraId)}.jpg`,
        `/api/cameras/${encodeURIComponent(cameraId)}/snapshot`,
      ];

      let snapshotLoaded = false;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            credentials: "include",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken")}`,
            },
          });

          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setCameraSnapshot(url);
            
            // Load image into canvas
            const img = new Image();
            img.onload = () => {
              imageRef.current = img;
              drawCanvas(drawnPoints);
            };
            img.src = url;
            
            snapshotLoaded = true;
            break;
          }
        } catch (err) {
          // Try next endpoint
          continue;
        }
      }

      if (!snapshotLoaded) {
        setSnapshotError("Camera snapshot not available. Drawing on blank canvas.");
        // Draw on blank canvas
        drawCanvas(drawnPoints);
      }
    } catch (error) {
      console.error("Failed to load camera snapshot:", error);
      setSnapshotError("Failed to load camera feed");
      drawCanvas(drawnPoints);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (selectedBranch !== "ALL" && r.branchIds?.length && !r.branchIds.includes(selectedBranch)) return false;
      if (selectedCamera !== "ALL" && r.cameraIds?.length && !r.cameraIds.includes(selectedCamera)) return false;
      if (selectedType !== "ALL" && r.detectorType !== selectedType) return false;
      if (selectedStatus !== "ALL" && r.state !== selectedStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.name.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [rules, selectedBranch, selectedCamera, selectedType, selectedStatus, searchQuery]);

  // Open rule builder for creation
  const handleOpenCreateRule = () => {
    setEditingRule(null);
    setBuilderForm({
      name: "",
      description: "",
      branchId: "ALL",
      cameraId: "ALL",
      zoneId: "",
      detectorType: "person",
      metric: "person_count",
      operator: "GREATER_THAN",
      value: 2,
      durationSeconds: 5,
      scheduleType: "BUSINESS_HOURS",
      scheduleStart: "08:30",
      scheduleEnd: "09:30",
      scheduleTimezone: "Asia/Kolkata",
      severity: "CRITICAL",
      cooldownSeconds: 60,
      actionAlert: true,
      actionIncident: false,
      actionSnapshot: true,
      actionClip: true,
      actionBookmark: false,
      actionPopup: false,
      actionNotifySoc: true,
      actionNotifyBranch: true,
      state: "SHADOW",
      templateId: "",
    });
    setIsBuilderOpen(true);
  };

  // Open rule builder with template defaults
  const handleCreateFromTemplate = (tmpl: TemplateItem) => {
    setEditingRule(null);
    const cond = tmpl.defaultCondition || {};
    const editableCond = cond.metric
      ? cond
      : cond.conditions?.find((item: any) => item?.metric === "staff_count") || cond.conditions?.[0] || {};
    setBuilderForm({
      name: tmpl.name,
      description: tmpl.description,
      branchId: "ALL",
      cameraId: "ALL",
      zoneId: "",
      detectorType: tmpl.detectorType,
      metric: editableCond.metric || "person_count",
      operator: editableCond.operator || "GREATER_THAN",
      value: editableCond.value !== undefined ? editableCond.value : 2,
      durationSeconds: Math.round(tmpl.defaultDurationMs / 1000),
      scheduleType: tmpl.suggestedSchedule || "BUSINESS_HOURS",
      scheduleStart: tmpl.metadata?.defaultOpeningStart || "08:30",
      scheduleEnd: tmpl.metadata?.defaultOpeningEnd || "09:30",
      scheduleTimezone: "Asia/Kolkata",
      severity: tmpl.defaultSeverity || "CRITICAL",
      cooldownSeconds: Math.round(tmpl.defaultCooldownMs / 1000),
      actionAlert: tmpl.defaultActions.includes("CREATE_ALERT"),
      actionIncident: tmpl.defaultActions.includes("CREATE_INCIDENT"),
      actionSnapshot: tmpl.defaultActions.includes("CAPTURE_SNAPSHOT"),
      actionClip: tmpl.defaultActions.includes("CAPTURE_EVIDENCE_CLIP"),
      actionBookmark: tmpl.defaultActions.includes("BOOKMARK_RECORDING"),
      actionPopup: tmpl.defaultActions.includes("POPUP_LIVE_VIEW"),
      actionNotifySoc: tmpl.defaultActions.includes("NOTIFY_SOC"),
      actionNotifyBranch: tmpl.defaultActions.includes("NOTIFY_BRANCH_MANAGER"),
      state: "SHADOW",
      templateId: tmpl.id,
    });
    setIsBuilderOpen(true);
  };

  // Open rule builder for edit
  const handleEditRule = (r: RuleItem) => {
    setEditingRule(r);
    const cond = r.condition || {};
    const editableCond = cond.metric
      ? cond
      : cond.conditions?.find((item: any) => item?.metric === "staff_count") || cond.conditions?.[0] || {};
    setBuilderForm({
      name: r.name,
      description: r.description || "",
      branchId: r.branchIds?.[0] || "ALL",
      cameraId: r.cameraIds?.[0] || "ALL",
      zoneId: r.zoneId || "",
      detectorType: r.detectorType,
      metric: editableCond.metric || "person_count",
      operator: editableCond.operator || "GREATER_THAN",
      value: editableCond.value !== undefined ? editableCond.value : 2,
      durationSeconds: Math.round((r.durationMs || 0) / 1000),
      scheduleType: r.schedule?.type || "BUSINESS_HOURS",
      scheduleStart: r.schedule?.start || (r.schedule?.type === "BRANCH_CLOSING" ? "17:00" : "08:30"),
      scheduleEnd: r.schedule?.end || (r.schedule?.type === "BRANCH_CLOSING" ? "18:30" : "09:30"),
      scheduleTimezone: r.schedule?.timezone || "Asia/Kolkata",
      severity: r.severity,
      cooldownSeconds: Math.round((r.cooldownMs || 60000) / 1000),
      actionAlert: r.actions.includes("CREATE_ALERT"),
      actionIncident: r.actions.includes("CREATE_INCIDENT"),
      actionSnapshot: r.actions.includes("CAPTURE_SNAPSHOT"),
      actionClip: r.actions.includes("CAPTURE_EVIDENCE_CLIP"),
      actionBookmark: r.actions.includes("BOOKMARK_RECORDING"),
      actionPopup: r.actions.includes("POPUP_LIVE_VIEW"),
      actionNotifySoc: r.actions.includes("NOTIFY_SOC"),
      actionNotifyBranch: r.actions.includes("NOTIFY_BRANCH_MANAGER"),
      state: r.state === "SHADOW" ? "SHADOW" : "ACTIVE",
      templateId: r.templateId || "",
    });
    setIsBuilderOpen(true);
  };

  // Save rule handler
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const actions: string[] = [];
    if (builderForm.actionAlert) actions.push("CREATE_ALERT");
    if (builderForm.actionIncident) actions.push("CREATE_INCIDENT");
    if (builderForm.actionSnapshot) actions.push("CAPTURE_SNAPSHOT");
    if (builderForm.actionClip) actions.push("CAPTURE_EVIDENCE_CLIP");
    if (builderForm.actionBookmark) actions.push("BOOKMARK_RECORDING");
    if (builderForm.actionPopup) actions.push("POPUP_LIVE_VIEW");
    if (builderForm.actionNotifySoc) actions.push("NOTIFY_SOC");
    if (builderForm.actionNotifyBranch) actions.push("NOTIFY_BRANCH_MANAGER");

    const branchIds = builderForm.branchId === "ALL" ? [] : [builderForm.branchId];
    const cameraIds = builderForm.cameraId === "ALL" ? [] : [builderForm.cameraId];
    const scopeType = cameraIds.length > 0 ? "CAMERA" : branchIds.length > 0 ? "BRANCH" : "GLOBAL";

    const payload = {
      name: builderForm.name,
      description: builderForm.description,
      branchIds,
      cameraIds,
      scopeType,
      zoneId: builderForm.zoneId || undefined,
      detectorType: builderForm.detectorType,
      condition: {
        metric: builderForm.metric,
        operator: builderForm.operator,
        value: Number(builderForm.value) || builderForm.value,
      },
      durationMs: Number(builderForm.durationSeconds) * 1000,
      schedule: {
        type: builderForm.scheduleType,
        ...(["BRANCH_OPENING", "BRANCH_CLOSING", "CUSTOM"].includes(builderForm.scheduleType)
          ? {
              start: builderForm.scheduleStart,
              end: builderForm.scheduleEnd,
              timezone: builderForm.scheduleTimezone,
              days: [1, 2, 3, 4, 5, 6],
            }
          : {}),
      },
      severity: builderForm.severity,
      cooldownMs: Number(builderForm.cooldownSeconds) * 1000,
      actions,
      state: builderForm.state,
      templateId: builderForm.templateId || undefined,
      changeReason: editingRule ? `Admin tuned parameters (${builderForm.metric} ${builderForm.operator} ${builderForm.value})` : "Initial creation",
    };

    try {
      if (editingRule) {
        const res = await aiFetch(`/api/ai/rules/${editingRule.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? { ...r, ...res } : r)));
      } else {
        const res = await aiFetch("/api/ai/rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setRules((prev) => [res, ...prev]);
      }
      setIsBuilderOpen(false);
    } catch (err) {
      console.error("Save rule error:", err);
    }
  };

  // Toggle rule enable/disable
  const handleToggleRule = async (r: RuleItem) => {
    const isCurrentlyActive = r.state === "ACTIVE" || r.state === "SHADOW";
    const endpoint = isCurrentlyActive ? `/api/ai/rules/${r.id}/disable` : `/api/ai/rules/${r.id}/enable`;
    try {
      await aiFetch(endpoint, { method: "POST" });
      setRules((prev) =>
        prev.map((item) =>
          item.id === r.id
            ? { ...item, state: isCurrentlyActive ? "INACTIVE" : "ACTIVE", enabled: !isCurrentlyActive }
            : item
        )
      );
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle shadow mode
  const handleToggleShadow = async (r: RuleItem) => {
    try {
      const res = await aiFetch(`/api/ai/rules/${r.id}/shadow`, { method: "POST" });
      setRules((prev) =>
        prev.map((item) => (item.id === r.id ? { ...item, state: res.state } : item))
      );
    } catch (e) {
      console.error(e);
    }
  };

  // Delete rule
  const handleDeleteRule = async (r: RuleItem) => {
    if (!window.confirm(`Are you sure you want to delete rule "${r.name}"?`)) return;
    try {
      await aiFetch(`/api/ai/rules/${r.id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((item) => item.id !== r.id));
    } catch (e) {
      console.error(e);
    }
  };

  // Bulk deployment is deliberately scoped: location-sensitive templates must
  // never be activated across an entire fleet without an operator target.
  const handleEnableAllRules = async () => {
    if (selectedBranch === "ALL" && selectedCamera === "ALL") {
      alert("Select a branch or camera before applying templates. Production rules must be scoped before activation.");
      return;
    }
    setIsEnablingAll(true);
    try {
      await aiFetch("/api/ai/rules/apply-all-templates", {
        method: "POST",
        body: JSON.stringify({
          ...(selectedBranch !== "ALL" ? { branchId: selectedBranch } : {}),
          ...(selectedCamera !== "ALL" ? { cameraId: selectedCamera } : {}),
        }),
      });
      await fetchData();
    } catch (e) {
      console.error("Failed to enable all rules:", e);
    } finally {
      setIsEnablingAll(false);
    }
  };

  // Review recorded alerts for this rule's scope; no synthetic replay data.
  const handleRunTest = async (r: RuleItem) => {
    setTestRuleTarget(r);
    setIsTestModalOpen(true);
    setIsTesting(true);
    try {
      const res = await aiFetch(`/api/ai/rules/${r.id}/test`, {
        method: "POST",
        body: JSON.stringify({ days: 7 }),
      });
      setTestResults(res);
    } catch (e) {
      console.error("Test rule error:", e);
    } finally {
      setIsTesting(false);
    }
  };

  // Submit feedback
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackRuleTarget) return;
    try {
      await aiFetch("/api/ai/feedback", {
        method: "POST",
        body: JSON.stringify({
          ruleId: feedbackRuleTarget.id,
          cameraId: feedbackRuleTarget.cameraIds?.[0],
          reason: feedbackReason,
          comment: feedbackComment,
        }),
      });
      alert("False positive feedback recorded for model calibration.");
      setIsFeedbackModalOpen(false);
      setFeedbackComment("");
    } catch (e) {
      console.error(e);
    }
  };

  // Zone canvas click handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;

    // Apply snap to grid if enabled
    if (snapToGrid) {
      x = Math.round(x / 0.05) * 0.05;
      y = Math.round(y / 0.05) * 0.05;
    }

    // Check if clicking near first point to close polygon
    if (zoneMode === "POLYGON" && drawnPoints.length >= 3) {
      const firstPoint = drawnPoints[0];
      const distToFirst = Math.sqrt(
        Math.pow((x - firstPoint.x) * rect.width, 2) + 
        Math.pow((y - firstPoint.y) * rect.height, 2)
      );
      
      if (distToFirst < 15) {
        // Close the polygon
        validateAndSetPoints(drawnPoints);
        return;
      }
    }

    // For tripwire, limit to 2 points
    if (zoneMode === "TRIPWIRE" && drawnPoints.length >= 2) {
      return;
    }

    // Save to undo stack before adding point
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack([]); // Clear redo stack on new action

    const newPoints = [...drawnPoints, { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) }];
    validateAndSetPoints(newPoints);
  };

  const validateAndSetPoints = (points: { x: number; y: number }[]) => {
    setDrawnPoints(points);
    
    // Run validation
    if (zoneMode === "POLYGON" && points.length >= 3) {
      const validation = validatePolygonZone(points);
      setValidationErrors(validation.errors);
    } else if (zoneMode === "TRIPWIRE" && points.length === 2) {
      const validation = validateTripwire(points);
      setValidationErrors(validation.errors);
    } else {
      setValidationErrors([]);
    }
    
    drawCanvas(points);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setRedoStack([...redoStack, drawnPoints]);
    setUndoStack(undoStack.slice(0, -1));
    validateAndSetPoints(previousState);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack(redoStack.slice(0, -1));
    validateAndSetPoints(nextState);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (activeTab !== "zones") return;
    
    // Escape to cancel
    if (e.key === "Escape") {
      setDrawnPoints([]);
      setUndoStack([]);
      setRedoStack([]);
      setValidationErrors([]);
      setEditingZoneId(null);
      drawCanvas([]);
    }
    
    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      handleUndo();
    }
    
    // Ctrl+Y or Ctrl+Shift+Z for redo
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      handleRedo();
    }
    
    // Enter to complete polygon
    if (e.key === "Enter" && drawnPoints.length >= 3 && zoneMode === "POLYGON") {
      validateAndSetPoints(drawnPoints);
    }
    
    // Delete/Backspace to remove last point
    if ((e.key === "Delete" || e.key === "Backspace") && drawnPoints.length > 0) {
      e.preventDefault();
      setUndoStack([...undoStack, drawnPoints]);
      const newPoints = drawnPoints.slice(0, -1);
      validateAndSetPoints(newPoints);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, drawnPoints, undoStack, redoStack, zoneMode]);

  const drawCanvas = (points: { x: number; y: number }[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw camera snapshot if available
    if (imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
      // Add semi-transparent overlay for better zone visibility
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Draw grid background if no camera image
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Draw existing zones from the same camera (dimmed)
    zones
      .filter((z) => z.cameraId === zoneCameraId && (!editingZoneId || z.id !== editingZoneId))
      .forEach((zone) => {
        if (zone.polygon && zone.polygon.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(zone.polygon[0].x * canvas.width, zone.polygon[0].y * canvas.height);
          for (let i = 1; i < zone.polygon.length; i++) {
            ctx.lineTo(zone.polygon[i].x * canvas.width, zone.polygon[i].y * canvas.height);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(100, 100, 255, 0.15)";
          ctx.fill();
          ctx.strokeStyle = "rgba(100, 100, 255, 0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Label
          const centerX = zone.polygon.reduce((sum, p) => sum + p.x, 0) / zone.polygon.length * canvas.width;
          const centerY = zone.polygon.reduce((sum, p) => sum + p.y, 0) / zone.polygon.length * canvas.height;
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(zone.name, centerX, centerY);
        }
      });

    if (points.length === 0) return;

    if (zoneMode === "TRIPWIRE") {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0]!.x * canvas.width, points[0]!.y * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x * canvas.width, points[i]!.y * canvas.height);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw direction arrow
      if (points.length === 2) {
        const [p1, p2] = points;
        const midX = ((p1.x + p2.x) / 2) * canvas.width;
        const midY = ((p1.y + p2.y) / 2) * canvas.height;
        const angle = Math.atan2((p2.y - p1.y) * canvas.height, (p2.x - p1.x) * canvas.width);
        
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX - 15 * Math.cos(angle - Math.PI / 6), midY - 15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(midX - 15 * Math.cos(angle + Math.PI / 6), midY - 15 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Draw polygon path
      ctx.beginPath();
      ctx.moveTo(points[0]!.x * canvas.width, points[0]!.y * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x * canvas.width, points[i]!.y * canvas.height);
      }
      if (points.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = validationErrors.length > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)";
        ctx.fill();
      }

      ctx.strokeStyle = validationErrors.length > 0 ? "#ef4444" : "#22c55e";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw closing hint
      if (points.length >= 3) {
        const firstPoint = points[0];
        ctx.beginPath();
        ctx.arc(firstPoint.x * canvas.width, firstPoint.y * canvas.height, 15, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw vertices
    points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? "#10b981" : idx === 1 && zoneMode === "TRIPWIRE" ? "#38bdf8" : "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Draw vertex number
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(idx + 1), p.x * canvas.width, p.y * canvas.height);
    });
    
    // Draw measurements if enabled
    if (showMeasurements && points.length >= 2) {
      ctx.font = "11px monospace";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      
      if (zoneMode === "TRIPWIRE" && points.length === 2) {
        const length = Math.sqrt(
          Math.pow(points[1].x - points[0].x, 2) + 
          Math.pow(points[1].y - points[0].y, 2)
        );
        const midX = ((points[0].x + points[1].x) / 2) * canvas.width;
        const midY = ((points[0].y + points[1].y) / 2) * canvas.height - 20;
        const text = `${(length * 100).toFixed(1)}%`;
        ctx.strokeText(text, midX, midY);
        ctx.fillText(text, midX, midY);
      } else if (zoneMode === "POLYGON" && points.length >= 3) {
        const area = calculatePolygonArea(points);
        const perimeter = calculatePerimeter(points);
        const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length * canvas.width;
        const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length * canvas.height;
        const text = `Area: ${(area * 100).toFixed(1)}%`;
        ctx.strokeText(text, centerX, centerY);
        ctx.fillText(text, centerX, centerY);
      }
    }
  };

  // Helper functions for measurements
  const calculatePolygonArea = (points: { x: number; y: number }[]) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  };

  const calculatePerimeter = (points: { x: number; y: number }[]) => {
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  };

  // Import validation functions
  const validatePolygonZone = (points: { x: number; y: number }[]) => {
    const errors: string[] = [];
    if (points.length < 3) {
      errors.push("Polygon must have at least 3 vertices");
    }
    // Check for very small area
    const area = calculatePolygonArea(points);
    if (area < 0.001) {
      errors.push("Polygon area is too small");
    }
    return { errors };
  };

  const validateTripwire = (points: { x: number; y: number }[]) => {
    const errors: string[] = [];
    if (points.length !== 2) {
      errors.push("Tripwire must have exactly 2 points");
    } else {
      const [p1, p2] = points;
      const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      if (length < 0.05) {
        errors.push("Tripwire is too short");
      }
    }
    return { errors };
  };

  const applyPresetVault = () => {
    setZoneMode("POLYGON");
    setZoneName("Gold Locker Cage Boundary");
    setZoneType("LOCKER");
    const pts = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.8 }, { x: 0.25, y: 0.8 }];
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack([]);
    validateAndSetPoints(pts);
  };

  const applyPresetCounter = () => {
    setZoneMode("POLYGON");
    setZoneName("Teller Cash Drawer Exclusion Box");
    setZoneType("CASH_COUNTER");
    const pts = [{ x: 0.35, y: 0.55 }, { x: 0.65, y: 0.55 }, { x: 0.65, y: 0.85 }, { x: 0.35, y: 0.85 }];
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack([]);
    validateAndSetPoints(pts);
  };

  const applyPresetTripwire = () => {
    setZoneMode("TRIPWIRE");
    setZoneName("Main Ingress Doorway Tripwire");
    setZoneType("ENTRANCE");
    const pts = [{ x: 0.15, y: 0.65 }, { x: 0.85, y: 0.65 }];
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack([]);
    validateAndSetPoints(pts);
  };

  const applyTemplate = (template: any) => {
    setZoneMode(template.polygon.length === 2 ? "TRIPWIRE" : "POLYGON");
    setZoneName(template.name);
    setZoneType(template.type);
    setUndoStack([...undoStack, drawnPoints]);
    setRedoStack([]);
    validateAndSetPoints([...template.polygon]);
  };

  const handleEditZone = (zone: ZoneItem) => {
    setEditingZoneId(zone.id);
    setZoneName(zone.name);
    setZoneType(zone.type);
    setZoneCameraId(zone.cameraId);
    setZoneMode(zone.polygon.length === 2 ? "TRIPWIRE" : "POLYGON");
    setUndoStack([]);
    setRedoStack([]);
    validateAndSetPoints(zone.polygon);
    
    // Scroll to canvas
    canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleDuplicateZone = (zone: ZoneItem) => {
    setEditingZoneId(null);
    setZoneName(`${zone.name} (Copy)`);
    setZoneType(zone.type);
    setZoneCameraId(zone.cameraId);
    setZoneMode(zone.polygon.length === 2 ? "TRIPWIRE" : "POLYGON");
    setUndoStack([]);
    setRedoStack([]);
    // Offset the polygon slightly
    const offsetPolygon = zone.polygon.map(p => ({
      x: Math.min(0.95, p.x + 0.05),
      y: Math.min(0.95, p.y + 0.05),
    }));
    validateAndSetPoints(offsetPolygon);
  };

  const handleSaveZone = async () => {
    const minPoints = zoneMode === "TRIPWIRE" ? 2 : 3;
    if (drawnPoints.length < minPoints) {
      alert(`Please draw at least ${minPoints} points to complete the ${zoneMode.toLowerCase()}.`);
      return;
    }

    // Run final validation
    const validation = zoneMode === "TRIPWIRE" 
      ? validateTripwire(drawnPoints)
      : validatePolygonZone(drawnPoints);
      
    if (validation.errors.length > 0) {
      alert(`Validation errors:\n${validation.errors.join("\n")}`);
      return;
    }

    const inferredBranchId = selectedBranch !== "ALL"
      ? selectedBranch
      : cameras.find((camera) => camera.id === zoneCameraId)?.branchId;
    if (!inferredBranchId) {
      alert("Select a camera that belongs to a branch before saving a zone.");
      return;
    }

    try {
      if (editingZoneId) {
        // Update existing zone
        const res = await aiFetch(`/api/ai/zones/${editingZoneId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: zoneName,
            type: zoneType,
            polygon: drawnPoints,
          }),
        });
        setZones((prev) => prev.map((z) => (z.id === editingZoneId ? res : z)));
        alert(`Zone '${zoneName}' updated successfully.`);
        setEditingZoneId(null);
      } else {
        // Create new zone
        const res = await aiFetch("/api/ai/zones", {
          method: "POST",
          body: JSON.stringify({
            branchId: inferredBranchId,
            cameraId: zoneCameraId,
            name: zoneName,
            type: zoneType,
            polygon: drawnPoints,
          }),
        });
        setZones((prev) => [res, ...prev]);
        alert(`Zone '${zoneName}' created successfully.`);
      }

      // Reset canvas
      setDrawnPoints([]);
      setUndoStack([]);
      setRedoStack([]);
      setValidationErrors([]);
      const canvas = canvasRef.current;
      if (canvas) {
        drawCanvas([]);
      }
    } catch (e) {
      console.error(e);
      alert(`Failed to save zone: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0f19] text-gray-100 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                AI Rules & Automation
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  NBFC Surveillance Core
                </span>
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">
                No-code visual rule engine, zone perimeter designer, and {templates.length} configured banking security templates
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={handleEnableAllRules}
            disabled={loading || isEnablingAll || (selectedBranch === "ALL" && selectedCamera === "ALL")}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-lg shadow-emerald-900/30 transition text-sm disabled:opacity-50"
            title="Select a branch or camera, then apply the template set to that scope"
          >
            <ShieldCheck className={`w-4 h-4 ${isEnablingAll ? "animate-spin" : ""}`} />
            {isEnablingAll ? "Applying Templates..." : "Apply Templates to Selected Scope"}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition"
            title="Refresh All"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenCreateRule}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg shadow-lg shadow-red-900/30 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Create AI Rule
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{loadError}</span>
          <button onClick={fetchData} className="font-semibold text-red-100 underline">Retry</button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 overflow-x-auto pb-1 text-sm font-medium">
        {[
          { id: "overview", label: "Overview & Analytics", icon: LayoutDashboard },
          { id: "rules", label: `AI Rules (${filteredRules.length})`, icon: SlidersHorizontal },
          { id: "zones", label: `Zone Manager (${zones.length})`, icon: Layers },
          { id: "templates", label: `Rule Templates (${templates.length})`, icon: Box },
          { id: "health", label: "AI Health & Capacity", icon: Cpu },
          { id: "history", label: "Historical Alert Review", icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-3 rounded-t-lg transition whitespace-nowrap border-b-2 ${
                isActive
                  ? "border-red-500 text-red-400 bg-red-500/5"
                  : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & NBFC KPIS */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Fleet Branches</span>
                <Building2 className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{stats?.totalBranches ?? branches.length}</p>
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <span>100% Monitored</span>
              </p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Active AI Cameras</span>
                <Camera className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{stats?.totalAiCameras ?? cameras.length}</p>
              <p className="text-xs text-gray-400 mt-1">Edge inference live</p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Active Rules Configured</span>
                <Sliders className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{rules.length}</p>
              <p className="text-xs text-purple-400 mt-1">
                {rules.filter((r) => r.state === "ACTIVE").length} active, {rules.filter((r) => r.state === "SHADOW").length} shadow
              </p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Today's Critical Alerts</span>
                <AlertOctagon className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-2xl font-bold text-red-400 mt-2">{stats?.todayEvents?.critical ?? 0}</p>
              <p className="text-xs text-yellow-400 mt-1">
                {stats?.todayEvents?.high ?? 0} high, {stats?.todayEvents?.warning ?? 0} warning
              </p>
            </div>
          </div>

          {/* NBFC Operations Dashboards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Locker & Vault Security */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <ShieldCheck className="w-5 h-5 text-red-400" />
                  <span>Locker / Strong Room AI Security</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  High Security Tier
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Current Occupancy</span>
                  <p className="text-lg font-bold text-white mt-1">{stats?.lockerSecurity?.activeLockerSessions ?? 0} Vault Zones</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Today's Locker Visits</span>
                  <p className="text-lg font-bold text-white mt-1">{stats?.lockerSecurity?.todayLockerEntries ?? 0} Sessions</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Occupancy Violations (&gt;2)</span>
                  <p className="text-lg font-bold text-red-400 mt-1">{stats?.nbfcMetrics?.lockerViolations ?? 0} Intercepted</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Dual-Control Compliance</span>
                  <p className="text-lg font-bold text-emerald-400 mt-1">{stats?.lockerSecurity?.dualControlCompliantPercent ?? 0}% Staffed</p>
                </div>
              </div>

              <div className="text-xs text-gray-400 bg-gray-800/20 p-3 rounded-lg border border-gray-800 flex items-center justify-between">
                <span>After-hours Motion Status: <strong className="text-emerald-400">{stats?.nbfcMetrics?.afterHoursPersons ? `${stats.nbfcMetrics.afterHoursPersons} Detected` : "ARMED (0 Detections)"}</strong></span>
                <span>Last Verified Segment: <strong className="text-gray-200">2s ago</strong></span>
              </div>
            </div>

            {/* Cash Counter Operations */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Users className="w-5 h-5 text-blue-400" />
                  <span>Cash Counter & Queue Efficiency</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Operations SLA
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Active Counters</span>
                  <p className="text-lg font-bold text-white mt-1">{stats?.cashCounterAnalytics?.activeCounters ?? 0} Operating</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Unattended Alerts (&gt;2m)</span>
                  <p className="text-lg font-bold text-yellow-400 mt-1">{stats?.cashCounterAnalytics?.unattendedCounters ?? 0} Alerts</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Average Wait Time</span>
                  <p className="text-lg font-bold text-emerald-400 mt-1">
                    {stats?.cashCounterAnalytics?.averageWaitSeconds
                      ? `${Math.floor(stats.cashCounterAnalytics.averageWaitSeconds / 60)}m ${stats.cashCounterAnalytics.averageWaitSeconds % 60}s`
                      : "0m 0s"}
                  </p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Customers Served Today</span>
                  <p className="text-lg font-bold text-white mt-1">{stats?.cashCounterAnalytics?.totalCustomersServedToday ?? 0}</p>
                </div>
              </div>

              <div className="text-xs text-gray-400 bg-gray-800/20 p-3 rounded-lg border border-gray-800 flex items-center justify-between">
                <span>Queue SLA Limit: <strong className="text-gray-200">&lt; 8 Persons</strong></span>
                <span>Max Peak Wait: <strong className="text-yellow-400">{stats?.cashCounterAnalytics?.maxWaitSeconds ? `${Math.floor(stats.cashCounterAnalytics.maxWaitSeconds / 60)}m ${stats.cashCounterAnalytics.maxWaitSeconds % 60}s` : "Nominal"}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI RULES LIST & TABLE */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-gray-900/60 p-4 rounded-xl border border-gray-800 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search rule name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Branch: All Branches ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id || b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Camera: All Cameras ({cameras.length})</option>
                {cameras
                  .filter((c) => selectedBranch === "ALL" || !c.branchId || c.branchId === selectedBranch)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.branchName ? `(${c.branchName})` : ""}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Detector: All Types</option>
                <option value="person">Person Detection</option>
                <option value="crowd-density">Crowd Density</option>
                <option value="queue">Queue SLA</option>
                <option value="zone">Zone Perimeter</option>
                <option value="tailgating">Tailgating</option>
                <option value="camera-tamper">Camera Tamper</option>
                <option value="recording">Recording Continuity</option>
              </select>
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Status: All Statuses</option>
                <option value="ACTIVE">● Active</option>
                <option value="SHADOW">◐ Shadow Mode</option>
                <option value="INACTIVE">○ Inactive</option>
              </select>
            </div>
          </div>

          {/* Rules Cards List */}
          <div className="space-y-3">
            {filteredRules.length === 0 ? (
              <div className="text-center py-12 bg-gray-900/40 border border-gray-800 rounded-xl text-gray-400">
                <SlidersHorizontal className="w-10 h-10 mx-auto text-gray-600 mb-3" />
                <p className="text-base font-medium text-gray-300">No matching AI rules found</p>
                <p className="text-xs text-gray-500 mt-1">Try clearing your filters or create a rule from the configured templates.</p>
                <button
                  onClick={handleOpenCreateRule}
                  className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium"
                >
                  Create Rule Now
                </button>
              </div>
            ) : (
              filteredRules.map((rule) => {
                const cond = rule.condition || {};
                const operatorDisplay = cond.operator?.replace(/_/g, " ").toLowerCase() || "greater than";
                return (
                  <div
                    key={rule.id}
                    className="bg-gray-900/70 border border-gray-800 hover:border-gray-700 transition rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            rule.state === "ACTIVE"
                              ? "bg-emerald-500 shadow-sm shadow-emerald-500"
                              : rule.state === "SHADOW"
                              ? "bg-amber-400 shadow-sm shadow-amber-400"
                              : "bg-gray-500"
                          }`}
                          title={`State: ${rule.state}`}
                        />
                        <h3 className="text-base font-bold text-white tracking-wide">{rule.name}</h3>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                            rule.severity === "CRITICAL"
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : rule.severity === "HIGH"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          }`}
                        >
                          {rule.severity}
                        </span>
                        {rule.state === "SHADOW" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                            SHADOW MODE
                          </span>
                        )}
                        <span className="text-xs text-gray-500">v{rule.version}</span>
                      </div>

                      <p className="text-xs text-gray-400">{rule.description || "No description provided."}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 pt-1">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-500" />
                          {rule.branchIds?.length ? rule.branchIds.join(", ") : "All Branches"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-gray-500" />
                          {rule.cameraIds?.length ? rule.cameraIds.join(", ") : "All Cameras"}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-gray-300">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          {cond.metric || "metric"} {operatorDisplay} {String(cond.value ?? 0)}
                          {rule.durationMs ? ` for ${rule.durationMs / 1000}s` : ""}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          {rule.schedule?.type?.replace("_", " ") || "24X7"}
                        </span>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => handleRunTest(rule)}
                        className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-xs font-medium transition"
                        title="Review recorded alerts for this rule's historical scope"
                      >
                        Test Rule
                      </button>

                      <button
                        onClick={() => handleToggleShadow(rule)}
                        className={`px-2.5 py-1.5 rounded border text-xs font-medium transition ${
                          rule.state === "SHADOW"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                            : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700"
                        }`}
                        title="Toggle Shadow Mode"
                      >
                        {rule.state === "SHADOW" ? "Promote to Live" : "Shadow Mode"}
                      </button>

                      <button
                        onClick={() => handleToggleRule(rule)}
                        className={`px-2.5 py-1.5 rounded border text-xs font-medium transition ${
                          rule.enabled
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-gray-800 text-gray-500 border-gray-700"
                        }`}
                      >
                        {rule.enabled ? "Active" : "Disabled"}
                      </button>

                      <button
                        onClick={() => handleEditRule(rule)}
                        className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded"
                        title="Edit Configuration"
                      >
                        <Sliders className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          setFeedbackRuleTarget(rule);
                          setIsFeedbackModalOpen(true);
                        }}
                        className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-amber-400 rounded"
                        title="Report False Positive Feedback"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule)}
                        className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ZONE DESIGNER & MANAGER */}
      {activeTab === "zones" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Visual Zone & Virtual Tripwire Designer</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {zoneMode === "TRIPWIRE" ? "VIRTUAL TRIPWIRE" : "POLYGON ZONE"}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {zoneMode === "TRIPWIRE"
                    ? "Click 2 points to establish virtual tripwire line & directional ingress boundary."
                    : "Click on the video canvas to draw polygon vertices (min 3 points)."}
                </p>
              </div>

              {/* Mode Toggle & Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-gray-950 p-1 rounded-lg border border-gray-800">
                  <button
                    onClick={() => {
                      setZoneMode("POLYGON");
                      setDrawnPoints([]);
                    }}
                    className={`px-3 py-1 text-xs rounded font-medium transition ${
                      zoneMode === "POLYGON"
                        ? "bg-red-600 text-white shadow"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Polygon Zone
                  </button>
                  <button
                    onClick={() => {
                      setZoneMode("TRIPWIRE");
                      setDrawnPoints([]);
                    }}
                    className={`px-3 py-1 text-xs rounded font-medium transition ${
                      zoneMode === "TRIPWIRE"
                        ? "bg-amber-600 text-white shadow"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Virtual Tripwire
                  </button>
                </div>

                <button
                  onClick={() => {
                    setDrawnPoints([]);
                    const canvas = canvasRef.current;
                    if (canvas) {
                      const ctx = canvas.getContext("2d");
                      ctx?.clearRect(0, 0, canvas.width, canvas.height);
                    }
                  }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700"
                >
                  Clear Canvas
                </button>
              </div>
            </div>

            {/* Quick Presets & Tripwire Direction Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gray-950/60 rounded-lg border border-gray-800 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider mr-1">Quick Presets:</span>
                <button
                  onClick={applyPresetVault}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-amber-600/30 hover:border-amber-500/50 text-amber-300 border border-gray-700 rounded text-xs transition"
                >
                  🔒 Vault
                </button>
                <button
                  onClick={applyPresetCounter}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-blue-600/30 hover:border-blue-500/50 text-blue-300 border border-gray-700 rounded text-xs transition"
                >
                  💵 Counter
                </button>
                <button
                  onClick={applyPresetTripwire}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-emerald-600/30 hover:border-emerald-500/50 text-emerald-300 border border-gray-700 rounded text-xs transition"
                >
                  ⚡ Door
                </button>
                <button
                  onClick={() => applyTemplate({
                    name: "Customer Queue Area",
                    type: "QUEUE_AREA",
                    polygon: [{ x: 0.1, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.9 }, { x: 0.1, y: 0.9 }],
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-purple-600/30 hover:border-purple-500/50 text-purple-300 border border-gray-700 rounded text-xs transition"
                >
                  👥 Queue
                </button>
                <button
                  onClick={() => applyTemplate({
                    name: "ATM Lobby",
                    type: "ATM_AREA",
                    polygon: [{ x: 0.6, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.7 }, { x: 0.6, y: 0.7 }],
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-cyan-600/30 hover:border-cyan-500/50 text-cyan-300 border border-gray-700 rounded text-xs transition"
                >
                  🏧 ATM
                </button>
                <button
                  onClick={() => applyTemplate({
                    name: "Restricted Area",
                    type: "RESTRICTED_AREA",
                    polygon: [{ x: 0.05, y: 0.05 }, { x: 0.3, y: 0.05 }, { x: 0.3, y: 0.3 }, { x: 0.05, y: 0.3 }],
                  })}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-red-600/30 hover:border-red-500/50 text-red-300 border border-gray-700 rounded text-xs transition"
                >
                  ⚠️ Restricted
                </button>
              </div>

              {zoneMode === "TRIPWIRE" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-[10px] uppercase font-semibold">Direction:</span>
                  {(["A_TO_B", "B_TO_A", "BIDIRECTIONAL"] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setTripwireDirection(dir)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                        tripwireDirection === dir
                          ? "bg-amber-500/20 text-amber-300 border-amber-500"
                          : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white"
                      }`}
                    >
                      {dir === "A_TO_B" ? "A ➔ B" : dir === "B_TO_A" ? "B ➔ A" : "A ⇄ B"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Drawing Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-950/40 rounded-lg border border-gray-800/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-xs rounded border border-gray-700 transition flex items-center gap-1"
                  title="Undo (Ctrl+Z)"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-xs rounded border border-gray-700 transition flex items-center gap-1"
                  title="Redo (Ctrl+Y)"
                >
                  ↷ Redo
                </button>
                <div className="h-4 w-px bg-gray-700" />
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(e) => setSnapToGrid(e.target.checked)}
                    className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                  />
                  Snap to Grid (5%)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showMeasurements}
                    onChange={(e) => setShowMeasurements(e.target.checked)}
                    className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                  />
                  Show Measurements
                </label>
              </div>
              {editingZoneId && (
                <button
                  onClick={() => {
                    setEditingZoneId(null);
                    setDrawnPoints([]);
                    setUndoStack([]);
                    setRedoStack([]);
                    setValidationErrors([]);
                    drawCanvas([]);
                  }}
                  className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs rounded border border-amber-600/30 transition"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-1">
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Validation Errors
                </p>
                {validationErrors.map((error, idx) => (
                  <p key={idx} className="text-xs text-red-300">• {error}</p>
                ))}
              </div>
            )}

            {/* Snapshot Loading Status */}
            {loadingSnapshot && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 flex items-center gap-2 text-xs text-blue-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading camera snapshot...
              </div>
            )}
            {snapshotError && !loadingSnapshot && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-center gap-2 text-xs text-amber-300">
                <Info className="w-3.5 h-3.5" />
                {snapshotError}
              </div>
            )}

            {/* Canvas Container */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 shadow-inner flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                onClick={handleCanvasClick}
                className="w-full h-full cursor-crosshair"
              />
              {drawnPoints.length === 0 && !loadingSnapshot && (
                <div className="absolute pointer-events-none text-center text-gray-500 text-xs max-w-md">
                  <p className="font-semibold text-gray-400">
                    {zoneMode === "TRIPWIRE" 
                      ? "Click 2 points to draw Tripwire Line (A → B)" 
                      : "Click anywhere to plot polygon vertices (min 3 points)"}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    {zoneMode === "TRIPWIRE" 
                      ? "Direction arrow shows trigger orientation" 
                      : "Click near first point (green) to close polygon"}
                  </p>
                  <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-gray-600">
                    <span>ESC: Cancel</span>
                    <span>Ctrl+Z: Undo</span>
                    <span>Enter: Complete</span>
                    <span>Backspace: Remove Point</span>
                  </div>
                </div>
              )}
            </div>

            {/* Drawing stats & save */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>Vertices: <strong className="text-white">{drawnPoints.length}</strong></span>
                {zoneMode === "POLYGON" && drawnPoints.length >= 3 && validationErrors.length === 0 && (
                  <>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Valid Polygon
                    </span>
                    <span>Area: <strong className="text-emerald-300">{(calculatePolygonArea(drawnPoints) * 100).toFixed(1)}%</strong></span>
                  </>
                )}
                {zoneMode === "POLYGON" && drawnPoints.length >= 3 && validationErrors.length > 0 && (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                  </span>
                )}
                {zoneMode === "TRIPWIRE" && drawnPoints.length === 2 && validationErrors.length === 0 && (
                  <>
                    <span className="text-amber-400 flex items-center gap-1 font-mono">
                      <ShieldAlert className="w-3.5 h-3.5" /> Armed ({tripwireDirection})
                    </span>
                    <span>Length: <strong className="text-amber-300">
                      {(Math.sqrt(Math.pow(drawnPoints[1].x - drawnPoints[0].x, 2) + Math.pow(drawnPoints[1].y - drawnPoints[0].y, 2)) * 100).toFixed(1)}%
                    </strong></span>
                  </>
                )}
                {editingZoneId && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Edit3 className="w-3.5 h-3.5" /> Editing Mode
                  </span>
                )}
              </div>

              <button
                onClick={handleSaveZone}
                disabled={zoneMode === "TRIPWIRE" ? drawnPoints.length < 2 : drawnPoints.length < 3 || validationErrors.length > 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow transition"
              >
                {editingZoneId ? "Update Zone" : `Save ${zoneMode === "TRIPWIRE" ? "Tripwire" : "Zone"}`}
              </button>
            </div>
          </div>

          {/* Zone Settings & Existing Zones List */}
          <div className="space-y-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">Zone Properties</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-400 mb-1">Target Camera</label>
                  <select
                    value={zoneCameraId}
                    onChange={(e) => setZoneCameraId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none"
                  >
                    {cameras.length === 0 ? (
                      <option value="">No cameras enrolled</option>
                    ) : (
                      cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.branchName ? `(${c.branchName})` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Zone Label Name</label>
                  <input
                    type="text"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">NBFC Zone Classification</label>
                  <select
                    value={zoneType}
                    onChange={(e) => setZoneType(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none"
                  >
                    <option value="LOCKER">Locker / Strong Room</option>
                    <option value="CASH_COUNTER">Cash Counter Tray</option>
                    <option value="QUEUE_AREA">Customer Waiting / Queue Area</option>
                    <option value="STAFF_AREA">Staff-Only Workspace</option>
                    <option value="RESTRICTED_AREA">Restricted High-Security Zone</option>
                    <option value="SERVER_ROOM">Server & DVR Rack Room</option>
                    <option value="ENTRANCE">Branch Entrance / Exit</option>
                    <option value="ATM_AREA">ATM Lobby</option>
                    <option value="CASH_VAN_AREA">Armored Cash Bay</option>
                    <option value="CUSTOM">Custom ROI</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Existing Zones List */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Configured Zones ({zones.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {zones.length === 0 ? (
                  <p className="text-xs text-gray-500">No zones saved yet for this branch.</p>
                ) : (
                  zones.map((z) => (
                    <div
                      key={z.id}
                      className="bg-gray-800/50 p-2.5 rounded-lg border border-gray-700/60 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-gray-200">{z.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {z.type} • {z.polygon?.length || 0} pts • {cameras.find(c => c.id === z.cameraId)?.name || z.cameraId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditZone(z)}
                          className="text-gray-500 hover:text-blue-400 p-1"
                          title="Edit Zone"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateZone(z)}
                          className="text-gray-500 hover:text-emerald-400 p-1"
                          title="Duplicate Zone"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Delete zone "${z.name}"?`)) {
                              await aiFetch(`/api/ai/zones/${z.id}`, { method: "DELETE" });
                              setZones((prev) => prev.filter((item) => item.id !== z.id));
                            }
                          }}
                          className="text-gray-500 hover:text-red-400 p-1"
                          title="Delete Zone"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RULE TEMPLATES (ALL NBFC TEMPLATES) */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{templates.length} Configured NBFC Surveillance Templates</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Standard banking & gold loan branch rules ready for 1-click instantiation and threshold tuning.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-gray-900/70 border border-gray-800 hover:border-gray-700 transition rounded-xl p-4 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                      {tmpl.category.replace("_", " ")}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        tmpl.defaultSeverity === "CRITICAL"
                          ? "bg-red-500/20 text-red-400"
                          : tmpl.defaultSeverity === "HIGH"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {tmpl.defaultSeverity}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{tmpl.name}</h4>
                  <p className="text-xs text-gray-400 line-clamp-2">{tmpl.description}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-800 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Detector:</span>
                    <strong className="text-gray-300">{tmpl.detectorType}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Default Duration:</span>
                    <strong className="text-gray-300">{tmpl.defaultDurationMs / 1000}s</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Schedule:</span>
                    <strong className="text-gray-300">{tmpl.suggestedSchedule}</strong>
                  </div>

                  <button
                    onClick={() => handleCreateFromTemplate(tmpl)}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 bg-gray-800 hover:bg-red-600 hover:text-white text-gray-300 rounded-lg font-medium transition text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create from Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AI HEALTH & CAPACITY */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <span className="text-xs text-gray-400">Total Stream Capacity</span>
              <p className="text-2xl font-bold text-white mt-1">
                {(capacity?.totalStreamsCapacity ?? 0) > 0
                  ? `${capacity.totalStreamsCapacity} Channels`
                  : "Unavailable"}
              </p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        (capacity?.totalStreamsCapacity ?? 0) > 0
                          ? Math.round(
                              (((capacity?.activeStreams ?? stats?.totalAiCameras ?? 0) + (capacity?.reservedStreams ?? 0)) /
                                (capacity?.totalStreamsCapacity || 1)) *
                                100
                            )
                          : 0
                      )
                    )}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {(capacity?.totalStreamsCapacity ?? 0) > 0
                  ? `${capacity?.activeStreams ?? stats?.totalAiCameras ?? 0} active, ${capacity?.reservedStreams ?? 0} reserved, ${Math.max(
                      0,
                      (capacity?.totalStreamsCapacity ?? 0) -
                        (capacity?.activeStreams ?? stats?.totalAiCameras ?? 0) -
                        (capacity?.reservedStreams ?? 0)
                    )} available`
                  : "No live capacity telemetry available"}
              </p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <span className="text-xs text-gray-400">CPU Ingestion Utilization</span>
              <p className="text-2xl font-bold text-white mt-1">
                {capacity?.cpuUsagePercent !== undefined ? `${capacity.cpuUsagePercent}%` : "Unavailable"}
              </p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-blue-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, capacity?.cpuUsagePercent ?? 0))}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {capacity?.cpuUsagePercent === undefined ? "Telemetry unavailable" : capacity.cpuUsagePercent > 80 ? "Elevated workload" : "Normal workload"}
              </p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <span className="text-xs text-gray-400">Memory & Hardware Allocation</span>
              <p className="text-2xl font-bold text-white mt-1">
                {capacity?.gpuMemoryUsagePercent !== undefined ? `${capacity.gpuMemoryUsagePercent}%` : "Unavailable"}
              </p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-purple-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, capacity?.gpuMemoryUsagePercent ?? 0))}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {capacity?.gpuNodeId ? `Node: ${capacity.gpuNodeId}` : "Telemetry unavailable"}
              </p>
            </div>
          </div>

          {/* Model Registry Table */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">Authoritative AI Model Registry</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Real-world benchmark validation status across certified hardware. Zero synthetic or faked confidence values.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-800/60 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-700">
                  <tr>
                    <th className="py-2.5 px-3">Detector</th>
                    <th className="py-2.5 px-3">Model & Version</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Runtime</th>
                    <th className="py-2.5 px-3">FPS</th>
                    <th className="py-2.5 px-3">Latency</th>
                    <th className="py-2.5 px-3">License Reviewed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {models.map((m, idx) => (
                    <tr key={idx} className="hover:bg-gray-800/30">
                      <td className="py-3 px-3 font-semibold text-white capitalize">{m.detector}</td>
                      <td className="py-3 px-3">{m.model}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            m.status === "PRODUCTION_READY"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : m.status === "PILOT_READY"
                              ? "bg-blue-500/20 text-blue-400"
                              : m.status === "LAB_VALIDATED"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-purple-500/20 text-purple-400"
                          }`}
                        >
                          {m.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400">{m.runtime}</td>
                      <td className="py-3 px-3">{m.actualFps} / {m.targetFps}</td>
                      <td className="py-3 px-3">{m.latencyMs} ms</td>
                      <td className="py-3 px-3">
                        {m.commercialLicenseReviewed ? (
                          <span className="text-emerald-400">✓ Verified</span>
                        ) : (
                          <span className="text-amber-400">Pending Review</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DETECTION HISTORY & SIMULATION TEST */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Historical Alert Review</h3>
            <p className="text-xs text-gray-400">
              Select any configured rule to test against recorded historical video frames. This estimates real-world trigger frequency and potential false alarm rates before promoting a rule to live alerting.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {rules.length === 0 ? (
                <div className="col-span-3 text-center py-8 text-gray-500 text-xs bg-gray-800/20 rounded-lg border border-dashed border-gray-800">
                  No active rules configured yet. Create a scoped rule or instantiate one from templates above to review recorded alerts.
                </div>
              ) : (
                rules.map((r) => (
                  <div key={r.id} className="bg-gray-800/40 p-3 rounded-lg border border-gray-700/60 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-semibold text-white">{r.name}</p>
                      <p className="text-gray-400">{r.detectorType} • v{r.version}</p>
                    </div>
                    <button
                      onClick={() => handleRunTest(r)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition"
                    >
                      Review Alerts
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* VISUAL RULE BUILDER MODAL / DRAWER */}
      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingRule ? `Edit Rule: ${editingRule.name}` : "Create AI Surveillance Rule"}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Configure real-time detection thresholds, duration, schedules, and response matrix
                </p>
              </div>
              <button onClick={() => setIsBuilderOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              {/* Name & Scope */}
              <div className="space-y-3 bg-gray-800/40 p-4 rounded-xl border border-gray-700/60">
                <h4 className="font-bold text-gray-200 uppercase tracking-wider text-[11px]">Rule Identity & Scope</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 mb-1">Rule Name</label>
                    <input
                      type="text"
                      required
                      value={builderForm.name}
                      onChange={(e) => setBuilderForm({ ...builderForm, name: e.target.value })}
                      placeholder="e.g. Locker Maximum Occupancy"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Branch Target</label>
                    <select
                      value={builderForm.branchId}
                      onChange={(e) => setBuilderForm({ ...builderForm, branchId: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="ALL">All Branches (Global Fleet Policy)</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} {b.code ? `(${b.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 mb-1">Camera Stream</label>
                    <select
                      value={builderForm.cameraId}
                      onChange={(e) => setBuilderForm({ ...builderForm, cameraId: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="ALL">All Cameras (Fleet-Wide Application)</option>
                      {cameras
                        .filter(
                          (c) =>
                            builderForm.branchId === "ALL" ||
                            !builderForm.branchId ||
                            !c.branchId ||
                            c.branchId === builderForm.branchId
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.branchName ? `(${c.branchName})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Zone Perimeter (Optional)</label>
                    <select
                      value={builderForm.zoneId}
                      onChange={(e) => setBuilderForm({ ...builderForm, zoneId: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="">Full Frame / All Zones</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.name} ({z.type})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* WHEN Condition */}
              <div className="space-y-3 bg-gray-800/40 p-4 rounded-xl border border-gray-700/60">
                <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> When Condition Triggers
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-400 mb-1">Metric</label>
                    <select
                      value={builderForm.metric}
                      onChange={(e) => setBuilderForm({ ...builderForm, metric: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                    >
                      <option value="person_count">Person Count</option>
                      <option value="queue_length">Queue Length</option>
                      <option value="dwell_time_seconds">Loiter Dwell Time</option>
                      <option value="stationary_duration_seconds">Left Baggage Time</option>
                      <option value="tamper_detected">Camera Tamper</option>
                      <option value="recording_gap_seconds">Recording Gap</option>
                      <option value="line_crossing">Line Crossing</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Operator</label>
                    <select
                      value={builderForm.operator}
                      onChange={(e) => setBuilderForm({ ...builderForm, operator: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                    >
                      <option value="GREATER_THAN">&gt; Greater Than</option>
                      <option value="GREATER_THAN_OR_EQUAL">&ge; Greater or Equal</option>
                      <option value="LESS_THAN">&lt; Less Than (Dual Control)</option>
                      <option value="EQUALS">= Equals</option>
                      <option value="ENTERED_ZONE">Entered Zone</option>
                      <option value="CROSSED_LINE">Crossed Line</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Threshold Value</label>
                    <input
                      type="number"
                      value={builderForm.value}
                      onChange={(e) => setBuilderForm({ ...builderForm, value: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-gray-400 mb-1">Persistence Required (Seconds)</label>
                    <input
                      type="number"
                      min={0}
                      value={builderForm.durationSeconds}
                      onChange={(e) => setBuilderForm({ ...builderForm, durationSeconds: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">e.g. 5 sec confirms sustained event</span>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Alert Cooldown (Seconds)</label>
                    <input
                      type="number"
                      min={10}
                      value={builderForm.cooldownSeconds}
                      onChange={(e) => setBuilderForm({ ...builderForm, cooldownSeconds: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-500 mt-1 block">Prevents frame-by-frame alert storms</span>
                  </div>
                </div>
              </div>

              {/* Schedule & Severity */}
              <div className="grid grid-cols-2 gap-3 bg-gray-800/40 p-4 rounded-xl border border-gray-700/60">
                <div>
                  <label className="block text-gray-400 mb-1">Operating Schedule</label>
                  <select
                    value={builderForm.scheduleType}
                    onChange={(e) => setBuilderForm({ ...builderForm, scheduleType: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="BUSINESS_HOURS">Business Hours (08:30 – 17:30)</option>
                    <option value="AFTER_HOURS">After Hours (19:00 – 08:00)</option>
                    <option value="24X7">24x7 Continuous</option>
                    <option value="BRANCH_OPENING">Branch Opening Window</option>
                    <option value="BRANCH_CLOSING">Branch Closing Window</option>
                    <option value="CUSTOM">Custom Window</option>
                  </select>
                  {["BRANCH_OPENING", "BRANCH_CLOSING", "CUSTOM"].includes(builderForm.scheduleType) && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-gray-500">
                        Start time
                        <input type="time" required value={builderForm.scheduleStart} onChange={(e) => setBuilderForm({ ...builderForm, scheduleStart: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" />
                      </label>
                      <label className="text-[10px] text-gray-500">
                        End time
                        <input type="time" required value={builderForm.scheduleEnd} onChange={(e) => setBuilderForm({ ...builderForm, scheduleEnd: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-2 text-white" />
                      </label>
                      <span className="col-span-2 text-[10px] text-gray-500">Monday–Saturday · {builderForm.scheduleTimezone}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Severity Level</label>
                  <select
                    value={builderForm.severity}
                    onChange={(e) => setBuilderForm({ ...builderForm, severity: e.target.value as any })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none font-bold"
                  >
                    <option value="CRITICAL" className="text-red-400">CRITICAL</option>
                    <option value="HIGH" className="text-amber-400">HIGH</option>
                    <option value="MEDIUM" className="text-blue-400">MEDIUM</option>
                    <option value="LOW" className="text-gray-400">LOW</option>
                    <option value="INFO" className="text-gray-500">INFO</option>
                  </select>
                </div>
              </div>

              {/* Actions Matrix */}
              <div className="space-y-3 bg-gray-800/40 p-4 rounded-xl border border-gray-700/60">
                <h4 className="font-bold text-gray-200 uppercase tracking-wider text-[11px]">Response Actions Matrix</h4>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionAlert}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionAlert: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Create Alert in Operations Center
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionIncident}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionIncident: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Create Formal Security Incident
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionSnapshot}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionSnapshot: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Capture Forensic Snapshot
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionClip}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionClip: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Capture Evidence Clip (10s Pre / 30s Post)
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionNotifySoc}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionNotifySoc: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Notify Central SOC Operators
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={builderForm.actionNotifyBranch}
                      onChange={(e) => setBuilderForm({ ...builderForm, actionNotifyBranch: e.target.checked })}
                      className="rounded bg-gray-800 border-gray-700 text-red-600 focus:ring-0"
                    />
                    Notify Branch Manager
                  </label>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-800">
                <div>
                  <span className="font-semibold text-white">Execution Mode</span>
                  <p className="text-[11px] text-gray-400">
                    Shadow mode logs and tracks detections without dispatching active external notifications.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBuilderForm({ ...builderForm, state: builderForm.state === "ACTIVE" ? "SHADOW" : "ACTIVE" })}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    builderForm.state === "SHADOW"
                      ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  }`}
                >
                  {builderForm.state === "SHADOW" ? "◐ Shadow Mode" : "● Active Live"}
                </button>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsBuilderOpen(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg shadow-red-900/40"
                >
                  Save & Apply Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTORICAL ALERT REVIEW MODAL */}
      {isTestModalOpen && testRuleTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Historical Alert Review</h3>
                <p className="text-xs text-gray-400 mt-0.5">{testRuleTarget.name}</p>
              </div>
              <button onClick={() => setIsTestModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isTesting ? (
              <div className="text-center py-8 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-500" />
                <p className="text-xs text-gray-400">Reviewing recorded alerts from the last 7 days...</p>
              </div>
            ) : testResults ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">Recorded Alerts</span>
                    <p className="text-xl font-bold text-white mt-1">{testResults.triggerCount}</p>
                  </div>
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">Duration</span>
                    <p className="text-xl font-bold text-amber-400 mt-1">{testResults.longestEventSeconds ? `${testResults.longestEventSeconds}s` : "Unavailable"}</p>
                  </div>
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">False positives</span>
                    <p className="text-xl font-bold text-blue-400 mt-1">Not calculated</p>
                  </div>
                </div>

                <div className="bg-gray-800/20 p-3 rounded-lg border border-gray-800 space-y-1">
                  <p className="font-semibold text-gray-300">Recorded Alert Summary</p>
                  <p className="text-gray-400">{testResults.details?.notes || "No recorded alert data is available."}</p>
                  <p className="text-[11px] text-gray-500">Average event duration: {testResults.details?.averageDurationSec ?? "Unavailable"}</p>
                </div>

                <button
                  onClick={() => setIsTestModalOpen(false)}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium"
                >
                  Close Results
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* FALSE POSITIVE FEEDBACK MODAL */}
      {isFeedbackModalOpen && feedbackRuleTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white">Report False Positive</h3>
              <button onClick={() => setIsFeedbackModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Primary Noise Reason</label>
                <select
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                >
                  <option value="reflection">Glass reflection / Sunlight glare</option>
                  <option value="poster_or_image">Person image on poster / cardboard cutout</option>
                  <option value="staff_movement">Authorized staff normal movement</option>
                  <option value="camera_angle_issue">Camera angle / perspective distortion</option>
                  <option value="threshold_too_sensitive">Threshold too sensitive (e.g. 2 instead of 3)</option>
                  <option value="lighting_change">Sudden lighting / shadow change</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Operator Notes</label>
                <textarea
                  rows={3}
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Describe what occurred and suggested tuning..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(false)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded"
                >
                  Submit Calibration Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
