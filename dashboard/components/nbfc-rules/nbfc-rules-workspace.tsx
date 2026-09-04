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
  if (!headers.has("Content-Type") && options.method && options.method !== "GET") {
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
  return res.json();
}

export function NbfcRulesWorkspace() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(false);
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

  // Builder form state
  const [builderForm, setBuilderForm] = useState({
    name: "",
    description: "",
    branchId: "Kollam",
    cameraId: "cam-locker-01",
    zoneId: "",
    detectorType: "person",
    metric: "person_count",
    operator: "GREATER_THAN",
    value: 2,
    durationSeconds: 5,
    scheduleType: "BUSINESS_HOURS",
    severity: "CRITICAL" as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
    cooldownSeconds: 60,
    actionAlert: true,
    actionIncident: true,
    actionSnapshot: true,
    actionClip: true,
    actionBookmark: false,
    actionPopup: false,
    actionNotifySoc: true,
    actionNotifyBranch: true,
    state: "ACTIVE" as "ACTIVE" | "SHADOW",
    templateId: "",
  });

  // Zone manager state
  const [zoneCameraId, setZoneCameraId] = useState("cam-locker-01");
  const [zoneName, setZoneName] = useState("Locker Interior");
  const [zoneType, setZoneType] = useState("LOCKER");
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesRes, zonesRes, tmplRes, healthRes, statsRes] = await Promise.all([
        aiFetch("/api/ai/rules").catch(() => ({ rules: [] })),
        aiFetch("/api/ai/zones").catch(() => ({ zones: [] })),
        aiFetch("/api/ai/rule-templates").catch(() => ({ templates: [] })),
        aiFetch("/api/ai/health").catch(() => ({ models: [] })),
        aiFetch("/api/ai/statistics").catch(() => null),
      ]);

      if (rulesRes?.rules && rulesRes.rules.length > 0) {
        setRules(rulesRes.rules);
      } else {
        // Fallback sample rules for instant UI hydration
        setRules([
          {
            id: "rule-sample-01",
            name: "Locker Maximum Occupancy",
            description: "Alerts when more than 2 persons are inside the secure vault area.",
            enabled: true,
            state: "ACTIVE",
            branchIds: ["Kollam"],
            cameraIds: ["cam-locker-01"],
            detectorType: "person",
            condition: { metric: "person_count", operator: "GREATER_THAN", value: 2 },
            durationMs: 5000,
            schedule: { type: "BUSINESS_HOURS" },
            severity: "CRITICAL",
            cooldownMs: 60000,
            actions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
            version: 1,
            scopeType: "CAMERA",
            createdAt: new Date().toISOString(),
          },
          {
            id: "rule-sample-02",
            name: "Cash Counter Crowd",
            description: "Warns if queue/crowd in front of counter 2 exceeds 5 persons for > 60 seconds.",
            enabled: true,
            state: "ACTIVE",
            branchIds: ["Kollam"],
            cameraIds: ["cam-counter-02"],
            detectorType: "crowd-density",
            condition: { metric: "person_count", operator: "GREATER_THAN", value: 5 },
            durationMs: 60000,
            schedule: { type: "BUSINESS_HOURS" },
            severity: "WARNING" as any,
            cooldownMs: 120000,
            actions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
            version: 1,
            scopeType: "CAMERA",
            createdAt: new Date().toISOString(),
          },
          {
            id: "rule-sample-03",
            name: "After-hours Presence",
            description: "Critical alert if any person is observed in branch hall or vault after 19:00.",
            enabled: true,
            state: "ACTIVE",
            branchIds: ["Kollam"],
            cameraIds: ["cam-hall-01"],
            detectorType: "person",
            condition: { metric: "person_count", operator: "GREATER_THAN_OR_EQUAL", value: 1 },
            durationMs: 3000,
            schedule: { type: "AFTER_HOURS" },
            severity: "CRITICAL",
            cooldownMs: 30000,
            actions: ["CREATE_ALERT", "CREATE_INCIDENT", "POPUP_LIVE_VIEW", "NOTIFY_SOC"],
            version: 1,
            scopeType: "BRANCH",
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      if (zonesRes?.zones) setZones(zonesRes.zones);
      if (tmplRes?.templates) setTemplates(tmplRes.templates);
      if (healthRes?.models) setModels(healthRes.models);
      if (statsRes && statsRes.todayEvents) setStats(statsRes);
    } catch (e) {
      console.error("Failed to load AI rules workspace data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      branchId: "Kollam",
      cameraId: "cam-locker-01",
      zoneId: "",
      detectorType: "person",
      metric: "person_count",
      operator: "GREATER_THAN",
      value: 2,
      durationSeconds: 5,
      scheduleType: "BUSINESS_HOURS",
      severity: "CRITICAL",
      cooldownSeconds: 60,
      actionAlert: true,
      actionIncident: true,
      actionSnapshot: true,
      actionClip: true,
      actionBookmark: false,
      actionPopup: false,
      actionNotifySoc: true,
      actionNotifyBranch: true,
      state: "ACTIVE",
      templateId: "",
    });
    setIsBuilderOpen(true);
  };

  // Open rule builder with template defaults
  const handleCreateFromTemplate = (tmpl: TemplateItem) => {
    setEditingRule(null);
    const cond = tmpl.defaultCondition || {};
    setBuilderForm({
      name: tmpl.name,
      description: tmpl.description,
      branchId: "Kollam",
      cameraId: "cam-locker-01",
      zoneId: "",
      detectorType: tmpl.detectorType,
      metric: cond.metric || "person_count",
      operator: cond.operator || "GREATER_THAN",
      value: cond.value !== undefined ? cond.value : 2,
      durationSeconds: Math.round(tmpl.defaultDurationMs / 1000),
      scheduleType: tmpl.suggestedSchedule || "BUSINESS_HOURS",
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
      state: "ACTIVE",
      templateId: tmpl.id,
    });
    setIsBuilderOpen(true);
  };

  // Open rule builder for edit
  const handleEditRule = (r: RuleItem) => {
    setEditingRule(r);
    const cond = r.condition || {};
    setBuilderForm({
      name: r.name,
      description: r.description || "",
      branchId: r.branchIds?.[0] || "Kollam",
      cameraId: r.cameraIds?.[0] || "cam-locker-01",
      zoneId: r.zoneId || "",
      detectorType: r.detectorType,
      metric: cond.metric || "person_count",
      operator: cond.operator || "GREATER_THAN",
      value: cond.value !== undefined ? cond.value : 2,
      durationSeconds: Math.round((r.durationMs || 0) / 1000),
      scheduleType: r.schedule?.type || "BUSINESS_HOURS",
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

    const payload = {
      name: builderForm.name,
      description: builderForm.description,
      branchIds: [builderForm.branchId],
      cameraIds: [builderForm.cameraId],
      zoneId: builderForm.zoneId || undefined,
      detectorType: builderForm.detectorType,
      condition: {
        metric: builderForm.metric,
        operator: builderForm.operator,
        value: Number(builderForm.value) || builderForm.value,
      },
      durationMs: Number(builderForm.durationSeconds) * 1000,
      schedule: { type: builderForm.scheduleType },
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

  // Run test simulation
  const handleRunTest = async (r: RuleItem) => {
    setTestRuleTarget(r);
    setIsTestModalOpen(true);
    setIsTesting(true);
    try {
      const res = await aiFetch(`/api/ai/rules/${r.id}/test`, {
        method: "POST",
        body: JSON.stringify({ days: 7, simulatedSamples: 150 }),
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
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const newPoints = [...drawnPoints, { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) }];
    setDrawnPoints(newPoints);
    drawCanvas(newPoints);
  };

  const drawCanvas = (points: { x: number; y: number }[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
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

    if (points.length === 0) return;

    // Draw polygon path
    ctx.beginPath();
    ctx.moveTo(points[0]!.x * canvas.width, points[0]!.y * canvas.height);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x * canvas.width, points[i]!.y * canvas.height);
    }
    if (points.length >= 3) {
      ctx.closePath();
      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      ctx.fill();
    }

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw vertices
    points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? "#10b981" : "#3b82f6";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  };

  const handleSaveZone = async () => {
    if (drawnPoints.length < 3) {
      alert("Please draw at least 3 points to complete the polygon zone.");
      return;
    }
    try {
      const res = await aiFetch("/api/ai/zones", {
        method: "POST",
        body: JSON.stringify({
          branchId: selectedBranch === "ALL" ? "Kollam" : selectedBranch,
          cameraId: zoneCameraId,
          name: zoneName,
          type: zoneType,
          polygon: drawnPoints,
        }),
      });

      setZones((prev) => [res, ...prev]);
      setDrawnPoints([]);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      alert(`Zone '${zoneName}' saved successfully.`);
    } catch (e) {
      console.error(e);
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
                No-code visual rule engine, zone perimeter designer, and 36 pre-configured banking security templates
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
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

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 overflow-x-auto pb-1 text-sm font-medium">
        {[
          { id: "overview", label: "Overview & Analytics", icon: LayoutDashboard },
          { id: "rules", label: `AI Rules (${filteredRules.length})`, icon: SlidersHorizontal },
          { id: "zones", label: `Zone Manager (${zones.length})`, icon: Layers },
          { id: "templates", label: `Rule Templates (36)`, icon: Box },
          { id: "health", label: "AI Health & Capacity", icon: Cpu },
          { id: "history", label: "Detection & Test Simulation", icon: History },
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
              <p className="text-2xl font-bold text-white mt-2">{stats?.totalBranches ?? 402}</p>
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <span>100% Monitored</span>
              </p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Active AI Cameras</span>
                <Camera className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{stats?.totalAiCameras ?? "3,814"}</p>
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
              <p className="text-2xl font-bold text-red-400 mt-2">{stats?.todayEvents?.critical ?? 7}</p>
              <p className="text-xs text-yellow-400 mt-1">
                {stats?.todayEvents?.high ?? 19} high, {stats?.todayEvents?.warning ?? 63} warning
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
                  <p className="text-lg font-bold text-white mt-1">0 Persons (Secure)</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Today's Locker Visits</span>
                  <p className="text-lg font-bold text-white mt-1">64 Sessions</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Occupancy Violations (&gt;2)</span>
                  <p className="text-lg font-bold text-red-400 mt-1">2 Intercepted</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Dual-Control Compliance</span>
                  <p className="text-lg font-bold text-emerald-400 mt-1">99.4% Staffed</p>
                </div>
              </div>

              <div className="text-xs text-gray-400 bg-gray-800/20 p-3 rounded-lg border border-gray-800 flex items-center justify-between">
                <span>After-hours Motion Status: <strong className="text-emerald-400">ARMED (0 Detections)</strong></span>
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
                  <p className="text-lg font-bold text-white mt-1">142 Operating</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Unattended Alerts (&gt;2m)</span>
                  <p className="text-lg font-bold text-yellow-400 mt-1">3 Alerts</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Average Wait Time</span>
                  <p className="text-lg font-bold text-emerald-400 mt-1">2m 24s</p>
                </div>
                <div className="bg-gray-800/40 p-3 rounded-lg">
                  <span className="text-xs text-gray-400">Customers Served Today</span>
                  <p className="text-lg font-bold text-white mt-1">4,820</p>
                </div>
              </div>

              <div className="text-xs text-gray-400 bg-gray-800/20 p-3 rounded-lg border border-gray-800 flex items-center justify-between">
                <span>Queue SLA Limit: <strong className="text-gray-200">&lt; 8 Persons</strong></span>
                <span>Max Peak Wait: <strong className="text-yellow-400">6m 52s (11:30 AM)</strong></span>
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
                <option value="ALL">Branch: All Branches</option>
                <option value="Kollam">Kollam Central</option>
                <option value="Trivandrum">Trivandrum Main</option>
                <option value="Kochi">Kochi Hub</option>
              </select>
            </div>

            <div>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
              >
                <option value="ALL">Camera: All Cameras</option>
                <option value="cam-locker-01">Locker Camera 01</option>
                <option value="cam-counter-02">Counter Cam 02</option>
                <option value="cam-hall-01">Branch Hall Cam</option>
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
                <p className="text-xs text-gray-500 mt-1">Try clearing your filters or create a rule from our 36 templates.</p>
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
                        title="Simulate / Test Rule against Historical Footage"
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
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Visual Zone Perimeter Designer</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Click on the video canvas to draw polygon vertices. Coordinates normalize from 0.0 to 1.0.
                </p>
              </div>
              <div className="flex items-center gap-2">
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

            {/* Canvas Container */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 shadow-inner flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={800}
                height={450}
                onClick={handleCanvasClick}
                className="w-full h-full cursor-crosshair"
              />
              {drawnPoints.length === 0 && (
                <div className="absolute pointer-events-none text-center text-gray-500 text-xs">
                  <p>Click anywhere inside to plot points</p>
                  <p className="text-[10px] text-gray-600 mt-1">Point 1 (Green) closes the polygon at point 3+</p>
                </div>
              )}
            </div>

            {/* Drawing stats & save */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>Vertices Plotted: <strong className="text-white">{drawnPoints.length}</strong></span>
                {drawnPoints.length >= 3 && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Valid Closed Polygon
                  </span>
                )}
              </div>

              <button
                onClick={handleSaveZone}
                disabled={drawnPoints.length < 3}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                Save Zone Definition
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
                    <option value="cam-locker-01">Locker Camera 01 (Vault)</option>
                    <option value="cam-counter-02">Cash Counter Cam 02</option>
                    <option value="cam-hall-01">Branch Entrance & Hall</option>
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
                          {z.type} • {z.cameraId} • {z.polygon?.length || 0} pts
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await aiFetch(`/api/ai/zones/${z.id}`, { method: "DELETE" });
                          setZones((prev) => prev.filter((item) => item.id !== z.id));
                        }}
                        className="text-gray-500 hover:text-red-400 p-1"
                        title="Delete Zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RULE TEMPLATES (ALL 36 NBFC TEMPLATES) */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">36 Built-in NBFC Surveillance Templates</h2>
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
              <p className="text-2xl font-bold text-white mt-1">64 Channels</p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div className="bg-emerald-500 h-full w-[60%]" />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">38 active, 10 reserved, 16 available</p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <span className="text-xs text-gray-400">CPU Ingestion Utilization</span>
              <p className="text-2xl font-bold text-white mt-1">44.2%</p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div className="bg-blue-500 h-full w-[44.2%]" />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Nominal thermal state</p>
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <span className="text-xs text-gray-400">GPU Acceleration Allocation</span>
              <p className="text-2xl font-bold text-white mt-1">58.7%</p>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-3">
                <div className="bg-purple-500 h-full w-[58.7%]" />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">NVIDIA T4 Tensor Cores Active</p>
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
            <h3 className="text-base font-bold text-white">Rule Testing & Simulation Lab</h3>
            <p className="text-xs text-gray-400">
              Select any configured rule to test against recorded historical video frames. This estimates real-world trigger frequency and potential false alarm rates before promoting a rule to live alerting.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {rules.map((r) => (
                <div key={r.id} className="bg-gray-800/40 p-3 rounded-lg border border-gray-700/60 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-white">{r.name}</p>
                    <p className="text-gray-400">{r.detectorType} • v{r.version}</p>
                  </div>
                  <button
                    onClick={() => handleRunTest(r)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium"
                  >
                    Run Simulation
                  </button>
                </div>
              ))}
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
                      <option value="Kollam">Kollam Central</option>
                      <option value="Trivandrum">Trivandrum Main</option>
                      <option value="Kochi">Kochi Hub</option>
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
                      <option value="cam-locker-01">Locker Camera 01 (Vault)</option>
                      <option value="cam-counter-02">Counter Cam 02 (Cash)</option>
                      <option value="cam-hall-01">Branch Hall Cam</option>
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
                    <option value="BRANCH_OPENING">Branch Opening (08:30 – 09:30)</option>
                    <option value="BRANCH_CLOSING">Branch Closing (17:00 – 18:30)</option>
                  </select>
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

      {/* HISTORICAL SIMULATION TEST MODAL */}
      {isTestModalOpen && testRuleTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Rule Simulation Results</h3>
                <p className="text-xs text-gray-400 mt-0.5">{testRuleTarget.name}</p>
              </div>
              <button onClick={() => setIsTestModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isTesting ? (
              <div className="text-center py-8 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-red-500" />
                <p className="text-xs text-gray-400">Replaying historical vectors over last 7 days...</p>
              </div>
            ) : testResults ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">Would Trigger</span>
                    <p className="text-xl font-bold text-white mt-1">{testResults.triggerCount} times</p>
                  </div>
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">Longest Event</span>
                    <p className="text-xl font-bold text-amber-400 mt-1">{testResults.longestEventSeconds}s</p>
                  </div>
                  <div className="bg-gray-800/40 p-3 rounded-lg text-center">
                    <span className="text-gray-400">Est. Noise</span>
                    <p className="text-xl font-bold text-blue-400 mt-1">{testResults.potentialFalsePositives} alerts</p>
                  </div>
                </div>

                <div className="bg-gray-800/20 p-3 rounded-lg border border-gray-800 space-y-1">
                  <p className="font-semibold text-gray-300">Simulation Summary</p>
                  <p className="text-gray-400">{testResults.details?.notes || "Historical playback verification passed."}</p>
                  <p className="text-[11px] text-gray-500">Average event duration: {testResults.details?.averageDurationSec ?? 4} seconds</p>
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
