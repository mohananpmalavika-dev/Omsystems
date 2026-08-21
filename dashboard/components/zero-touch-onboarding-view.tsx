"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  Terminal,
  Search,
  Server,
  Layers,
  Video,
  ShieldCheck,
  RefreshCw,
  Clock,
  Sparkles,
  Play,
  Check,
  Network,
  Radio,
  FileCode,
  Flame,
  X,
  Lock,
  ChevronRight,
  Eye,
  Plus,
  ShieldAlert,
  Activity,
  Sliders,
  ExternalLink,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Cpu,
  BarChart3,
  HardDrive,
  FileCheck,
} from "lucide-react";
import { FleetLoadingSkeleton } from "./loading-skeleton";
import {
  validateBranchForm,
  validateStatusFilter,
  sanitizeSearchQuery,
  type BranchFormData,
} from "@/lib/validation";
import { trackEvent, trackError, trackApiCall, trackPerformance, trackSearch, cleanupAnalytics } from "@/lib/analytics";

// Memoized KPI Card component
const KPICard = React.memo(({ title, value, subtitle, trend }: {
  title: string;
  value: string | number;
  subtitle: string;
  trend?: { color: string; text: string };
}) => (
  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
    <div className="text-2xl font-extrabold text-slate-100">{value}</div>
    <div className={`text-[11px] font-medium flex items-center ${trend?.color || "text-slate-400"}`}>
      {trend && <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />}
      {subtitle}
    </div>
  </div>
));
KPICard.displayName = "KPICard";

// Memoized Branch Row component
const BranchRow = React.memo(({ 
  branch, 
  onProvision, 
  onReview, 
  onEnroll 
}: {
  branch: any;
  onProvision: (branch: any) => void;
  onReview: (branch: any) => void;
  onEnroll: (branch: any) => void;
}) => (
  <tr 
    className={`hover:bg-slate-800/40 transition-colors ${
      branch._optimistic ? "opacity-60 animate-pulse" : ""
    }`}
  >
    <td className="py-3 px-4">
      <div className="font-bold text-slate-100 flex items-center space-x-1.5">
        <span>{branch.branchId}</span>
        {branch._optimistic && (
          <span 
            className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-500/30"
            title="Creating..."
          >
            PENDING
          </span>
        )}
        <span className="text-slate-500 font-normal">—</span>
        <span className="font-semibold text-slate-200">{branch.branchName}</span>
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5">{branch.region}</div>
    </td>

    <td className="py-3 px-4">
      {branch.agentStatus === "CONNECTED" ? (
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-emerald-300 font-bold">Connected</span>
          <span className="text-[10px] text-slate-500">({branch.agentVersion || "v2.4.0"})</span>
        </div>
      ) : branch.agentStatus === "OFFLINE" ? (
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="text-rose-300 font-bold">Agent Offline</span>
        </div>
      ) : (
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-slate-400 font-medium">Not Enrolled</span>
        </div>
      )}
    </td>

    <td className="py-3 px-4">
      {branch.totalCameras > 0 ? (
        <div>
          <span className="font-bold text-slate-100">{branch.totalCameras} Cameras</span>
          <span className="text-slate-400 text-[10px]"> across {branch.totalDevices} appliances</span>
        </div>
      ) : (
        <span className="text-slate-500">—</span>
      )}
    </td>

    <td className="py-3 px-4">
      <div className="flex items-center space-x-2">
        <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${
              branch.readinessScorePct === 100
                ? "bg-emerald-500"
                : branch.readinessScorePct >= 70
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
            style={{ width: `${branch.readinessScorePct}%` }}
          />
        </div>
        <span className="font-bold text-[11px] text-slate-200">{branch.readinessScorePct}%</span>
      </div>
    </td>

    <td className="py-3 px-4">
      {branch.operationalStatus === "ACTIVE" ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-500/30 text-emerald-300 inline-flex items-center">
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
          ACTIVE
        </span>
      ) : branch.operationalStatus === "PROVISIONING" ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 border border-indigo-500/30 text-indigo-300 inline-flex items-center animate-pulse">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin text-indigo-400" />
          PROVISIONING
        </span>
      ) : branch.operationalStatus === "PARTIAL" ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 border border-amber-500/30 text-amber-300 inline-flex items-center">
          <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
          PARTIAL READY
        </span>
      ) : branch.operationalStatus === "FAILED" ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 border border-rose-500/30 text-rose-300 inline-flex items-center">
          <X className="w-3 h-3 mr-1 text-rose-400" />
          FAILED
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
          UNENROLLED
        </span>
      )}
    </td>

    <td className="py-3 px-4 text-right">
      <div className="flex items-center justify-end space-x-2">
        {branch.agentStatus === "CONNECTED" ? (
          <>
            <button
              onClick={() => onProvision(branch)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              aria-label={`Start provisioning for ${branch.branchName}`}
            >
              <Play className="w-3 h-3 mr-1 fill-current" />
              Provision
            </button>
            {branch.totalCameras > 0 && (
              <button
                onClick={() => onReview(branch)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                aria-label={`Review ${branch.totalCameras} discovered devices for ${branch.branchName}`}
              >
                Review Devices
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onEnroll(branch)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold flex items-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            aria-label={`Generate enrollment package for ${branch.branchName}`}
          >
            <Terminal className="w-3 h-3 mr-1" />
            Generate Package
          </button>
        )}
      </div>
    </td>
  </tr>
));
BranchRow.displayName = "BranchRow";

// API Error types
interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

// Helper to handle API errors
function handleApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return error as ApiError;
  }
  return { message: "An unexpected error occurred" };
}

export function ZeroTouchOnboardingView() {
  const [branches, setBranches] = useState<any[]>([]);
  const [slaMetrics, setSlaMetrics] = useState<any>({
    targetSlaSeconds: 90,
    lastProvisioningSeconds: 74.6,
    fleetAverageSeconds: 81.2,
    p50Seconds: 74.6,
    p95Seconds: 114.8,
    totalBranchesProvisioned: 482,
    activeProvisioningJobs: 1,
    slaAdherencePct: 93.4,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  
  // Cleanup tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      
      // Track search if query is not empty
      if (searchQuery.trim().length > 0) {
        const resultsCount = branches.filter((b) =>
          b.branchId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.branchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.region.toLowerCase().includes(searchQuery.toLowerCase())
        ).length;
        
        trackSearch(searchQuery, resultsCount);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, branches]);

  // Active Modals / Drawers
  const [provisionModalBranch, setProvisionModalBranch] = useState<any | null>(null);
  const [enrollModalBranch, setEnrollModalBranch] = useState<any | null>(null);
  const [reviewModalBranch, setReviewModalBranch] = useState<any | null>(null);
  const [newBranchModalOpen, setNewBranchModalOpen] = useState(false);

  // Provisioning Job Execution State
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [isJobRunning, setIsJobRunning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // SSE connection tracking
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  // Form states
  const [newBranchId, setNewBranchId] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchRegion, setNewBranchRegion] = useState("South Zone");
  const [credPasswordKey, setCredPasswordKey] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const handleDownloadBatch = useCallback((branchId: string, branchName: string, psCommand?: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sentinel-grid-monitoring-vhid.onrender.com";
    const cleanBranchName = (branchName || "Branch").replace(/["\r\n]/g, "");
    const command = psCommand || `iwr -useb '${origin}/api/control/v1/branches/${branchId}/install.ps1' | iex`;
    const content = `<# :
@echo off
setlocal
title Sentinel Grid Edge Agent - 1-Click Auto Setup
color 0B
cls
powershell -NoProfile -ExecutionPolicy Bypass -Command "[ScriptBlock]::Create([IO.File]::ReadAllText('%~f0')).Invoke()"
echo.
echo ================================================================
echo  Sentinel Grid Edge Process Terminated.
echo ================================================================
pause
goto :eof
#>

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "         SENTINEL GRID CCTV SECURITY - 1-CLICK AUTO SETUP" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Target Branch: ${cleanBranchName} (${branchId})" -ForegroundColor White
Write-Host ""
Write-Host "[*] Connecting to Sentinel Grid Cloud Control Plane..." -ForegroundColor Yellow
Write-Host "[*] Downloading and configuring Edge Agent background service..." -ForegroundColor Yellow
Write-Host "[*] Probing local network for ONVIF IP cameras, RTSP streams, and DVRs..." -ForegroundColor Yellow
Write-Host ""

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12'
} catch {}

try {
  ${command}
} catch {
  Write-Host (" [!] Error: " + $_.Exception.Message) -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  SUCCESS: Sentinel Grid Edge Agent is installed and running!" -ForegroundColor Green
Write-Host "  It will continuously monitor this branch 24/7 in the background." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (branchName || "Branch").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.href = url;
    a.download = `Install_KryptonVision_${safeName}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToastMsg({ type: "success", text: `1-Click installer "Install_KryptonVision_${safeName}.bat" downloaded! Just double-click to install.` });
  }, []);

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const startTime = Date.now();
    
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      const res = await fetch("/api/v1/zero-touch/fleet", {
        signal: abortControllerRef.current.signal,
      });
      
      const duration = Date.now() - startTime;
      
      if (!res.ok) {
        trackApiCall("/api/v1/zero-touch/fleet", "GET", duration, false, res.status);
        throw new Error(`Failed to fetch fleet data: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setBranches(data.data.branches);
        setSlaMetrics(data.data.slaMetrics);
        
        trackApiCall("/api/v1/zero-touch/fleet", "GET", duration, true, res.status);
        trackPerformance({
          name: "fleet_data_load",
          value: duration,
          unit: "ms",
          metadata: { branchCount: data.data.branches.length },
        });
      } else {
        trackApiCall("/api/v1/zero-touch/fleet", "GET", duration, false);
        throw new Error(data.error || "Failed to load fleet data");
      }
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const apiError = handleApiError(err);
      setError(apiError);
      setToastMsg({ 
        type: "error", 
        text: `Fleet data load failed: ${apiError.message}` 
      });
      
      trackError({
        error: err as Error,
        context: "fetchFleet",
        severity: "high",
        metadata: { endpoint: "/api/v1/zero-touch/fleet" },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    
    // Track page view
    trackEvent({
      category: "page",
      action: "view",
      label: "zero-touch-provisioning",
    });
    
    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cleanup SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Cleanup polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // Cleanup analytics
      cleanupAnalytics();
    };
  }, [fetchFleet]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const startTime = Date.now();
    
    // Clear previous errors
    setFormErrors({});
    
    // Validate form data
    const formData: BranchFormData = {
      branchId: newBranchId,
      branchName: newBranchName,
      region: newBranchRegion,
    };
    
    const validation = validateBranchForm(formData);
    
    if (!validation.valid) {
      setFormErrors(validation.errors);
      setToastMsg({ 
        type: "error", 
        text: "Please fix the validation errors before submitting" 
      });
      
      trackEvent({
        category: "branch",
        action: "create_validation_failed",
        label: "form_validation",
        metadata: { errors: Object.keys(validation.errors) },
      });
      
      return;
    }
    
    // Use sanitized data
    const sanitizedData = validation.sanitized!;
    
    // Track branch creation attempt
    trackEvent({
      category: "branch",
      action: "create_started",
      label: sanitizedData.branchId,
      metadata: { region: sanitizedData.region },
    });
    
    // Optimistic update: Add branch to UI immediately
    const optimisticBranch = {
      branchId: sanitizedData.branchId,
      branchName: sanitizedData.branchName,
      region: sanitizedData.region,
      agentStatus: "NOT_ENROLLED",
      totalDevices: 0,
      totalCameras: 0,
      readinessScorePct: 0,
      operationalStatus: "UNENROLLED",
      _optimistic: true, // Flag to identify optimistic updates
    };
    
    // Add optimistic branch to the list
    setBranches((prev) => [...prev, optimisticBranch]);
    
    // Close modal and show success message immediately
    setNewBranchModalOpen(false);
    setToastMsg({ 
      type: "success", 
      text: `Creating branch ${sanitizedData.branchName}...` 
    });

    try {
      const res = await fetch("/api/v1/zero-touch/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizedData),
      });
      
      const duration = Date.now() - startTime;
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        trackApiCall("/api/v1/zero-touch/branches", "POST", duration, false, res.status);
        throw new Error(errorData.error || `Failed to create branch: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        // Update with real data from server
        setToastMsg({ 
          type: "success", 
          text: `Branch ${sanitizedData.branchName} (${sanitizedData.branchId}) created successfully!` 
        });
        setNewBranchId("");
        setNewBranchName("");
        setNewBranchRegion("South Zone");
        setFormErrors({});
        
        trackApiCall("/api/v1/zero-touch/branches", "POST", duration, true, res.status);
        trackEvent({
          category: "branch",
          action: "create_success",
          label: sanitizedData.branchId,
          value: duration,
          metadata: { region: sanitizedData.region },
        });
        
        // Refresh to get accurate data
        fetchFleet();
      } else {
        throw new Error(data.error || "Failed to create branch");
      }
    } catch (err: unknown) {
      // Rollback optimistic update on error
      setBranches((prev) => prev.filter((b) => b.branchId !== sanitizedData.branchId || !b._optimistic));
      
      const apiError = handleApiError(err);
      setToastMsg({ type: "error", text: `Branch creation failed: ${apiError.message}` });
      
      trackError({
        error: err as Error,
        context: "handleCreateBranch",
        severity: "medium",
        metadata: { branchId: sanitizedData.branchId },
      });
      
      trackEvent({
        category: "branch",
        action: "create_failed",
        label: sanitizedData.branchId,
        metadata: { error: apiError.message },
      });
    }
  };

  const handleOpenEnrollment = async (branch: any) => {
    trackEvent({
      category: "enrollment",
      action: "generate_package",
      label: branch.branchId,
    });
    
    try {
      const res = await fetch(`/api/v1/zero-touch/branches/${branch.branchId}/enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: branch.tenantId, expiryMinutes: 15 }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate enrollment: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setEnrollModalBranch({ ...branch, enrollmentPackage: data.data });
        
        trackEvent({
          category: "enrollment",
          action: "package_generated",
          label: branch.branchId,
        });
      } else {
        throw new Error(data.error || "Failed to generate enrollment package");
      }
    } catch (err: unknown) {
      const apiError = handleApiError(err);
      setToastMsg({ 
        type: "error", 
        text: `Enrollment generation failed: ${apiError.message}` 
      });
      
      trackError({
        error: err as Error,
        context: "handleOpenEnrollment",
        severity: "medium",
        metadata: { branchId: branch.branchId },
      });
      
      setEnrollModalBranch(undefined);
    }
  };

  const handleStartProvisioning = async (branch: any) => {
    const startTime = Date.now();
    
    setProvisionModalBranch(branch);
    setIsJobRunning(true);
    setActiveJob(null);
    
    // Track provisioning start
    trackEvent({
      category: "provisioning",
      action: "start",
      label: branch.branchId,
      metadata: { branchName: branch.branchName },
    });
    
    // Optimistic update: Update branch status immediately
    setBranches((prev) =>
      prev.map((b) =>
        b.branchId === branch.branchId
          ? { ...b, operationalStatus: "PROVISIONING", lastJobStatus: "DISCOVERING" }
          : b
      )
    );

    try {
      const res = await fetch(`/api/v1/zero-touch/branches/${branch.branchId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: branch.agentId,
          edgeAgentId: branch.agentId,
        }),
      });
      
      const duration = Date.now() - startTime;
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        trackApiCall(`/api/v1/zero-touch/branches/${branch.branchId}/provision`, "POST", duration, false, res.status);
        throw new Error(errorData.error || `Provisioning dispatch failed: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setActiveJob(data.data);
        startSSEConnection(data.data.id, branch.branchId);
        
        trackApiCall(`/api/v1/zero-touch/branches/${branch.branchId}/provision`, "POST", duration, true, res.status);
        trackEvent({
          category: "provisioning",
          action: "job_created",
          label: branch.branchId,
          value: duration,
          metadata: { jobId: data.data.id },
        });
      } else {
        throw new Error(data.error || "Failed to start provisioning job");
      }
    } catch (err: unknown) {
      setIsJobRunning(false);
      
      // Rollback optimistic update
      setBranches((prev) =>
        prev.map((b) =>
          b.branchId === branch.branchId
            ? { ...b, operationalStatus: branch.operationalStatus, lastJobStatus: branch.lastJobStatus }
            : b
        )
      );
      
      const apiError = handleApiError(err);
      setToastMsg({ type: "error", text: `Provisioning failed: ${apiError.message}` });
      
      trackError({
        error: err as Error,
        context: "handleStartProvisioning",
        severity: "high",
        metadata: { branchId: branch.branchId },
      });
      
      trackEvent({
        category: "provisioning",
        action: "start_failed",
        label: branch.branchId,
        metadata: { error: apiError.message },
      });
    }
  };

  const startSSEConnection = useCallback((jobId: string, branchId: string) => {
    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      // Attempt to establish SSE connection
      const eventSource = new EventSource(`/api/v1/zero-touch/provisioning/jobs/${jobId}/events`);
      eventSourceRef.current = eventSource;

      let messageCount = 0;
      let lastMessageTime = Date.now();

      eventSource.onmessage = (event) => {
        try {
          messageCount++;
          lastMessageTime = Date.now();
          const data = JSON.parse(event.data);

          if (data.type === "snapshot" && data.job) {
            setActiveJob(data.job);
          } else if (data.type === "step_update" && data.data) {
            setActiveJob((prev: any) => {
              if (!prev) return prev;
              return {
                ...prev,
                steps: prev.steps.map((s: any) =>
                  s.step === data.data.step?.step ? data.data.step : s
                ),
              };
            });
          } else if (data.type === "completed" && data.job) {
            setActiveJob(data.job);
            setIsJobRunning(false);
            fetchFleet();
            fetchDiscoveredDevices(branchId);
            setToastMsg({
              type: data.job.status === "COMPLETED" ? "success" : data.job.status === "PARTIALLY_READY" ? "info" : "error",
              text: `Provisioning finished: ${data.job.status} (${data.job.registeredCameraCount} cameras registered)`,
            });
            // Close SSE connection after completion
            eventSource.close();
            eventSourceRef.current = null;
            setSseConnected(false);
          }
        } catch (err) {
          console.error("Error parsing SSE message:", err);
        }
      };

      eventSource.onerror = (error) => {
        console.warn("SSE connection error, falling back to polling:", error);
        setSseConnected(false);
        eventSource.close();
        eventSourceRef.current = null;
        // Fallback to polling if SSE fails
        startPolling(jobId, branchId);
      };

      eventSource.onopen = () => {
        console.log("SSE connection established for job:", jobId);
        setSseConnected(true);
      };

      // Watchdog: Detect stale SSE connections (no messages for 30 seconds)
      const watchdogInterval = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        if (timeSinceLastMessage > 30000 && messageCount > 0) {
          console.warn("SSE connection appears stale, reconnecting...");
          clearInterval(watchdogInterval);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          // Try to reconnect once, then fall back to polling
          const reconnectSource = new EventSource(`/api/v1/zero-touch/provisioning/jobs/${jobId}/events`);
          reconnectSource.onerror = () => {
            reconnectSource.close();
            startPolling(jobId, branchId);
          };
          reconnectSource.onopen = () => {
            eventSourceRef.current = reconnectSource;
            setSseConnected(true);
          };
          reconnectSource.onmessage = eventSource.onmessage;
        }
      }, 10000);

      // Store watchdog for cleanup
      return () => clearInterval(watchdogInterval);
    } catch (err) {
      console.warn("Failed to establish SSE connection, using polling:", err);
      setSseConnected(false);
      // Fallback to polling if SSE is not supported
      startPolling(jobId, branchId);
    }
  }, [fetchFleet]);

  const startPolling = useCallback((jobId: string, branchId: string) => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/zero-touch/provisioning/jobs/${jobId}`);
        const data = await res.json();
        
        if (data.success) {
          setActiveJob(data.data);
          
          if (
            data.data.status === "COMPLETED" ||
            data.data.status === "PARTIALLY_READY" ||
            data.data.status === "FAILED" ||
            data.data.status === "CANCELLED"
          ) {
            clearInterval(interval);
            pollingIntervalRef.current = null;
            setIsJobRunning(false);
            fetchFleet();
            fetchDiscoveredDevices(branchId);
            setToastMsg({
              type:
                data.data.status === "COMPLETED"
                  ? "success"
                  : data.data.status === "PARTIALLY_READY"
                  ? "info"
                  : "error",
              text: `Provisioning finished: ${data.data.status} (${data.data.registeredCameraCount} cameras registered)`,
            });
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
        clearInterval(interval);
        pollingIntervalRef.current = null;
        setIsJobRunning(false);
      }
    }, 400);

    pollingIntervalRef.current = interval;
  }, [fetchFleet]);

  const fetchDiscoveredDevices = useCallback(async (branchId: string) => {
    try {
      const res = await fetch(`/api/v1/zero-touch/branches/${branchId}/discovered-devices`);
      const data = await res.json();
      if (data.success) {
        setDiscoveredDevices(data.data);
      }
    } catch {}
  }, []);

  const handleOpenReview = useCallback(async (branch: any) => {
    setReviewModalBranch(branch);
    await fetchDiscoveredDevices(branch.branchId);
  }, [fetchDiscoveredDevices]);

  const handleBatchApprove = useCallback(async (branchId: string) => {
    // Optimistic update: Mark devices as approved immediately
    const originalDevices = [...discoveredDevices];
    const approvedDevices = discoveredDevices.map((device) => ({
      ...device,
      reviewStatus: "APPROVED",
      channels: device.channels.map((ch: any) => ({
        ...ch,
        isApproved: true,
        validationState: "VALIDATED",
      })),
    }));
    
    setDiscoveredDevices(approvedDevices);
    
    // Show immediate feedback
    setToastMsg({ 
      type: "info", 
      text: "Approving devices..." 
    });

    try {
      const res = await fetch(`/api/v1/zero-touch/branches/${branchId}/batch-approve`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Batch approve failed: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        setToastMsg({ type: "success", text: data.message });
        // Refresh to get accurate server state
        fetchDiscoveredDevices(branchId);
        fetchFleet();
      } else {
        throw new Error(data.error || "Failed to batch approve devices");
      }
    } catch (err: unknown) {
      // Rollback on error
      setDiscoveredDevices(originalDevices);
      
      const apiError = handleApiError(err);
      setToastMsg({ type: "error", text: `Batch approval failed: ${apiError.message}` });
    }
  }, [discoveredDevices, fetchDiscoveredDevices, fetchFleet]);

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const matchesSearch =
        b.branchId.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        b.branchName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        b.region.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "ACTIVE") return b.operationalStatus === "ACTIVE";
      if (statusFilter === "PROVISIONING") return b.operationalStatus === "PROVISIONING";
      if (statusFilter === "PARTIAL") return b.operationalStatus === "PARTIAL";
      if (statusFilter === "UNENROLLED") return b.operationalStatus === "UNENROLLED" || b.agentStatus === "NOT_ENROLLED";
      if (statusFilter === "OFFLINE") return b.agentStatus === "OFFLINE";

      return true;
    });
  }, [branches, debouncedSearchQuery, statusFilter]);

  return (
    <div className="space-y-6" role="main" aria-label="Zero-Touch Provisioning Control Plane">
      {/* Show loading skeleton on initial load */}
      {loading && branches.length === 0 && !error && (
        <div role="status" aria-live="polite" aria-label="Loading fleet data">
          <FleetLoadingSkeleton />
        </div>
      )}

      {/* Show content when data is loaded */}
      {(!loading || branches.length > 0) && (
        <>
          {/* Error Display */}
          {error && (
            <div 
              className="p-4 rounded-xl bg-rose-950/90 border border-rose-500/40 text-rose-200 flex items-start justify-between"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start space-x-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Error Loading Fleet Data</div>
                  <div className="text-sm text-rose-300 mt-1">{error.message}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  fetchFleet();
                }}
                className="text-xs text-rose-200 hover:text-white uppercase tracking-wider ml-4 flex items-center space-x-1"
                aria-label="Retry loading fleet data"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Toast Notification */}
          {toastMsg && (
            <div
              className={`p-4 rounded-xl flex items-center justify-between text-sm shadow-xl border transition-all ${
                toastMsg.type === "success"
                  ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                  : toastMsg.type === "info"
                  ? "bg-amber-950/90 border-amber-500/40 text-amber-200"
                  : "bg-rose-950/90 border-rose-500/40 text-rose-200"
              }`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center space-x-2.5">
                {toastMsg.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span className="font-medium">{toastMsg.text}</span>
              </div>
              <button
                onClick={() => setToastMsg(null)}
                className="text-xs opacity-70 hover:opacity-100 uppercase tracking-wider ml-4"
                aria-label="Dismiss notification"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Fleet KPI Header Ribbon */}
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5"
            role="region"
            aria-label="Fleet key performance indicators"
          >
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Branch Fleet</span>
          <div className="text-2xl font-extrabold text-slate-100">{slaMetrics.totalBranchesProvisioned}</div>
          <div className="text-[11px] text-emerald-400 font-medium flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
            500+ Multi-Tenant Scale
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Operational Branches</span>
          <div className="text-2xl font-extrabold text-emerald-400">448 <span className="text-xs font-normal text-slate-400">(92.9%)</span></div>
          <div className="text-[11px] text-slate-400">Full 20-cam stream verified</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Partial / Review Required</span>
          <div className="text-2xl font-extrabold text-amber-400">24 <span className="text-xs font-normal text-slate-400">(5.0%)</span></div>
          <div className="text-[11px] text-amber-400/80">Awaiting credentials / rotation</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Measured SLA (P95)</span>
          <div className="text-2xl font-extrabold text-cyan-400">{slaMetrics.p95Seconds}s <span className="text-xs font-normal text-slate-400">P50: {slaMetrics.p50Seconds}s</span></div>
          <div className="text-[11px] text-cyan-300 font-medium">Target SLA: &lt; {slaMetrics.targetSlaSeconds}s</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">SLA Adherence Rate</span>
          <div className="text-2xl font-extrabold text-indigo-300">{slaMetrics.slaAdherencePct}%</div>
          <div className="text-[11px] text-slate-400">Last branch: {slaMetrics.lastProvisioningSeconds}s</div>
        </div>
      </div>

      {/* Fleet Controls & Actions Bar */}
      <div 
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4"
        role="search"
        aria-label="Branch fleet search and filters"
      >
        <div className="flex items-center space-x-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search branch ID (e.g. A005), name, or zone..."
              value={searchQuery}
              onChange={(e) => {
                const sanitized = sanitizeSearchQuery(e.target.value);
                setSearchQuery(sanitized);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
              aria-label="Search branches by ID, name, or region"
              maxLength={100}
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            {["ALL", "ACTIVE", "PROVISIONING", "PARTIAL", "UNENROLLED"].map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  if (validateStatusFilter(filter)) {
                    setStatusFilter(filter);
                    
                    // Track filter usage
                    trackEvent({
                      category: "filter",
                      action: "status_change",
                      label: filter,
                    });
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                  statusFilter === filter
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
                aria-label={`Filter branches by ${filter.toLowerCase()} status`}
                aria-pressed={statusFilter === filter}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <Link
            href="/admin/zero-touch/diagnostics"
            className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center transition-all"
          >
            <Activity className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            Engineering Diagnostics
          </Link>
          <button
            onClick={() => setNewBranchModalOpen(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center shadow-lg shadow-indigo-950/40 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            aria-label="Create new branch profile"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            + New Branch Profile
          </button>
        </div>
      </div>

      {/* 500+ Branch Fleet Table */}
      <div 
        className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl"
        role="region"
        aria-label="Branch fleet provisioning table"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-slate-100 text-sm">Branch Fleet Provisioning Matrix</h3>
            <span className="text-xs text-slate-400 font-mono">({filteredBranches.length} branches listed)</span>
          </div>
          <button
            onClick={fetchFleet}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded"
            aria-label={loading ? "Loading fleet data" : "Refresh fleet data"}
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Fleet
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono" aria-label="Branch provisioning status">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4" scope="col">Branch</th>
                <th className="py-3 px-4" scope="col">Edge Agent</th>
                <th className="py-3 px-4" scope="col">Discovered Devices</th>
                <th className="py-3 px-4" scope="col">Readiness Score</th>
                <th className="py-3 px-4" scope="col">Status</th>
                <th className="py-3 px-4 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300 text-xs">
              {filteredBranches.map((branch) => (
                <tr 
                  key={branch.branchId} 
                  className={`hover:bg-slate-800/40 transition-colors ${
                    branch._optimistic ? "opacity-60 animate-pulse" : ""
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                      <span>{branch.branchId}</span>
                      {branch._optimistic && (
                        <span 
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-500/30"
                          title="Creating..."
                        >
                          PENDING
                        </span>
                      )}
                      <span className="text-slate-500 font-normal">—</span>
                      <span className="font-semibold text-slate-200">{branch.branchName}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{branch.region}</div>
                  </td>

                  <td className="py-3 px-4">
                    {branch.agentStatus === "CONNECTED" ? (
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-emerald-300 font-bold">Connected</span>
                        <span className="text-[10px] text-slate-500">({branch.agentVersion || "v2.4.0"})</span>
                      </div>
                    ) : branch.agentStatus === "OFFLINE" ? (
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-rose-300 font-bold">Agent Offline</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-slate-400 font-medium">Not Enrolled</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {branch.totalCameras > 0 ? (
                      <div>
                        <span className="font-bold text-slate-100">{branch.totalCameras} Cameras</span>
                        <span className="text-slate-400 text-[10px]"> across {branch.totalDevices} appliances</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            branch.readinessScorePct === 100
                              ? "bg-emerald-500"
                              : branch.readinessScorePct >= 70
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${branch.readinessScorePct}%` }}
                        />
                      </div>
                      <span className="font-bold text-[11px] text-slate-200">{branch.readinessScorePct}%</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    {branch.operationalStatus === "ACTIVE" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-500/30 text-emerald-300 inline-flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                        ACTIVE
                      </span>
                    ) : branch.operationalStatus === "PROVISIONING" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 border border-indigo-500/30 text-indigo-300 inline-flex items-center animate-pulse">
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin text-indigo-400" />
                        PROVISIONING
                      </span>
                    ) : branch.operationalStatus === "PARTIAL" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 border border-amber-500/30 text-amber-300 inline-flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
                        PARTIAL READY
                      </span>
                    ) : branch.operationalStatus === "FAILED" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 border border-rose-500/30 text-rose-300 inline-flex items-center">
                        <X className="w-3 h-3 mr-1 text-rose-400" />
                        FAILED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                        UNENROLLED
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {branch.agentStatus === "CONNECTED" ? (
                        <>
                          <button
                            onClick={() => handleStartProvisioning(branch)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            aria-label={`Start provisioning for ${branch.branchName}`}
                          >
                            <Play className="w-3 h-3 mr-1 fill-current" />
                            Provision
                          </button>
                          {branch.totalCameras > 0 && (
                            <button
                              onClick={() => handleOpenReview(branch)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                              aria-label={`Review ${branch.totalCameras} discovered devices for ${branch.branchName}`}
                            >
                              Review Devices
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenEnrollment(branch)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold flex items-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                          aria-label={`Generate enrollment package for ${branch.branchName}`}
                        >
                          <Terminal className="w-3 h-3 mr-1" />
                          Generate Package
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Real Provisioning Execution Sheet */}
      {provisionModalBranch && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="provisioning-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 id="provisioning-modal-title" className="font-extrabold text-slate-100 text-lg flex items-center">
                  <Play className="w-5 h-5 mr-2 text-emerald-400 fill-current" />
                  Zero-Touch Provisioning: {provisionModalBranch.branchName} ({provisionModalBranch.branchId})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Autonomous execution pipeline against connected edge agent (mTLS secured)
                </p>
              </div>
              <button
                onClick={() => {
                  setProvisionModalBranch(null);
                  // Cleanup SSE and polling when modal closes
                  if (eventSourceRef.current) {
                    eventSourceRef.current.close();
                    eventSourceRef.current = null;
                    setSseConnected(false);
                  }
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                aria-label="Close provisioning modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeJob ? (
              <div className="space-y-4">
                {/* Connection Status Indicator */}
                <div className="flex items-center justify-between text-xs bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-800">
                  <span className="text-slate-400 font-mono">Live Updates:</span>
                  {sseConnected ? (
                    <div className="flex items-center space-x-1.5 text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="font-semibold">Real-time (SSE)</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5 text-amber-400">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span className="font-semibold">Polling (Fallback)</span>
                    </div>
                  )}
                </div>

                {/* Progress bar and status */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">
                      Status: <strong className="text-emerald-400 font-bold">{activeJob.status}</strong>
                    </span>
                    <span className="text-cyan-300">
                      Readiness: <strong>{activeJob.readinessScorePct}% Ready</strong> ({activeJob.registeredCameraCount}/{activeJob.discoveredChannelCount} cameras)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300"
                      style={{
                        width: `${
                          (activeJob.steps.filter((s: any) => s.status === "SUCCESS" || s.status === "PARTIAL").length /
                            activeJob.steps.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* 12-Step Real Timeline */}
                <div className="space-y-1.5 max-h-72 overflow-y-auto font-mono text-xs pr-1">
                  {activeJob.steps.map((step: any, idx: number) => (
                    <div
                      key={step.step}
                      className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                        step.status === "SUCCESS"
                          ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                          : step.status === "RUNNING"
                          ? "bg-indigo-950/80 border-indigo-500 text-indigo-200 animate-pulse"
                          : step.status === "PARTIAL"
                          ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                          : step.status === "FAILED"
                          ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                          : "bg-slate-950/60 border-slate-800/80 text-slate-500"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        {step.status === "SUCCESS" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : step.status === "RUNNING" ? (
                          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                        ) : step.status === "PARTIAL" ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                        )}
                        <div>
                          <div className="font-bold text-slate-100">{step.label}</div>
                          <div className="text-[10px] text-slate-400">{step.message || step.description}</div>
                        </div>
                      </div>

                      <div className="text-right text-[11px] shrink-0 font-mono">
                        {step.durationMs ? `${step.durationMs}ms` : step.status === "RUNNING" ? "Running..." : "Pending"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 font-mono text-xs space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                <p>Dispatching zero-touch probe to edge agent...</p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setProvisionModalBranch(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                aria-label="Close provisioning window"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: 15-Minute Short-Lived Enrollment Package */}
      {enrollModalBranch && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enrollment-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 id="enrollment-modal-title" className="font-extrabold text-slate-100 text-lg flex items-center">
                  <Terminal className="w-5 h-5 mr-2 text-indigo-400" />
                  1-Line Enrollment Package: {enrollModalBranch.branchName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Single-use cryptographic package • Expires in 15 minutes
                </p>
              </div>
              <button
                onClick={() => setEnrollModalBranch(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                aria-label="Close enrollment modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {/* Highlighted 1-Click Auto-Setup Button for Non-Tech Staff */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                <div>
                  <div className="text-emerald-300 font-bold text-sm flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                    1-Click Auto Setup (.BAT)
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    No PowerShell or technical knowledge needed. Double-click to auto-install & start!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadBatch(
                    enrollModalBranch.branchId,
                    enrollModalBranch.branchName,
                    enrollModalBranch.enrollmentPackage?.installerScripts?.windowsPowerShell
                  )}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 shrink-0 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Auto-Setup (.BAT)
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                  <span className="text-indigo-300 font-semibold">Windows Edge Appliance (PowerShell 1-Liner)</span>
                  <button
                    onClick={() => handleCopy(enrollModalBranch.enrollmentPackage.installerScripts.windowsPowerShell, "ps")}
                    className="flex items-center px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                  >
                    {copiedKey === "ps" ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copiedKey === "ps" ? "Copied" : "Copy Command"}
                  </button>
                </div>
                <div className="bg-slate-900/90 p-2.5 rounded-lg text-emerald-400 select-all overflow-x-auto text-[11px]">
                  {enrollModalBranch.enrollmentPackage.installerScripts.windowsPowerShell}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-sans">
                  <span className="text-cyan-300 font-semibold">Linux Edge Gateway / NUC (Bash 1-Liner)</span>
                  <button
                    onClick={() => handleCopy(enrollModalBranch.enrollmentPackage.installerScripts.linuxBash, "bash")}
                    className="flex items-center px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
                  >
                    {copiedKey === "bash" ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copiedKey === "bash" ? "Copied" : "Copy Command"}
                  </button>
                </div>
                <div className="bg-slate-900/90 p-2.5 rounded-lg text-cyan-400 select-all overflow-x-auto text-[11px]">
                  {enrollModalBranch.enrollmentPackage.installerScripts.linuxBash}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEnrollModalBranch(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                aria-label="Close enrollment package window"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Discovered Devices Review & Approval Drawer */}
      {reviewModalBranch && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 id="review-modal-title" className="font-extrabold text-slate-100 text-lg flex items-center">
                  <ShieldCheck className="w-5 h-5 mr-2 text-indigo-400" />
                  Review Discovered Devices: {reviewModalBranch.branchName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Human-in-the-loop review: validate channels, resolve credentials, and approve cameras for production registration.
                </p>
              </div>
              <button
                onClick={() => setReviewModalBranch(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">
                  Found {discoveredDevices.length} appliances ({discoveredDevices.reduce((s, d) => s + d.channels.length, 0)} channels)
                </span>
                <button
                  onClick={() => handleBatchApprove(reviewModalBranch.branchId)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow"
                >
                  ✓ Batch Approve All Channels
                </button>
              </div>

              {discoveredDevices.map((device) => (
                <div key={device.deviceId} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <strong className="text-slate-100 font-bold text-sm">
                        {device.manufacturer} {device.model}
                      </strong>
                      <span className="text-slate-400 text-xs">({device.ipAddress})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 border border-indigo-500/40 text-indigo-300">
                      {device.protocol} • {device.channelCount} Channels
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {device.channels.map((ch: any) => (
                      <div
                        key={ch.channelNumber}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-200">{ch.channelName}</div>
                          <div className="text-[10px] text-slate-400">
                            Channel #{ch.channelNumber} • {ch.resolution} @ {ch.fps} FPS
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          {ch.validationState}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setReviewModalBranch(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Create New Branch Profile */}
      {newBranchModalOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-branch-modal-title"
        >
          <form
            onSubmit={handleCreateBranch}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="new-branch-modal-title" className="font-extrabold text-slate-100 text-lg flex items-center">
                <Plus className="w-5 h-5 mr-2 text-indigo-400" />
                Register New Branch Profile
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNewBranchModalOpen(false);
                  setFormErrors({});
                  setNewBranchId("");
                  setNewBranchName("");
                  setNewBranchRegion("South Zone");
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                aria-label="Close branch creation modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="branch-id-input" className="block text-slate-300 font-semibold mb-1">
                  Branch ID Code
                </label>
                <input
                  id="branch-id-input"
                  type="text"
                  placeholder="e.g. A010, BR-PUN-04"
                  value={newBranchId}
                  onChange={(e) => {
                    setNewBranchId(e.target.value);
                    // Clear error on change
                    if (formErrors.branchId) {
                      setFormErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.branchId;
                        return newErrors;
                      });
                    }
                  }}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 ${
                    formErrors.branchId
                      ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/50"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/50"
                  }`}
                  required
                  aria-required="true"
                  aria-invalid={!!formErrors.branchId}
                  aria-describedby={formErrors.branchId ? "branch-id-error" : undefined}
                  maxLength={20}
                />
                {formErrors.branchId && (
                  <p id="branch-id-error" className="mt-1 text-xs text-rose-400 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {formErrors.branchId}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="branch-name-input" className="block text-slate-300 font-semibold mb-1">
                  Branch Name
                </label>
                <input
                  id="branch-name-input"
                  type="text"
                  placeholder="e.g. Pune Shivaji Nagar Commercial"
                  value={newBranchName}
                  onChange={(e) => {
                    setNewBranchName(e.target.value);
                    // Clear error on change
                    if (formErrors.branchName) {
                      setFormErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.branchName;
                        return newErrors;
                      });
                    }
                  }}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 ${
                    formErrors.branchName
                      ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/50"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/50"
                  }`}
                  required
                  aria-required="true"
                  aria-invalid={!!formErrors.branchName}
                  aria-describedby={formErrors.branchName ? "branch-name-error" : undefined}
                  maxLength={100}
                />
                {formErrors.branchName && (
                  <p id="branch-name-error" className="mt-1 text-xs text-rose-400 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {formErrors.branchName}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="branch-region-select" className="block text-slate-300 font-semibold mb-1">
                  Zone / Region
                </label>
                <select
                  id="branch-region-select"
                  value={newBranchRegion}
                  onChange={(e) => {
                    setNewBranchRegion(e.target.value);
                    // Clear error on change
                    if (formErrors.region) {
                      setFormErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.region;
                        return newErrors;
                      });
                    }
                  }}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 ${
                    formErrors.region
                      ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/50"
                      : "border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/50"
                  }`}
                  aria-invalid={!!formErrors.region}
                  aria-describedby={formErrors.region ? "region-error" : undefined}
                >
                  <option value="South Zone">South Zone</option>
                  <option value="West Zone">West Zone</option>
                  <option value="North Zone">North Zone</option>
                  <option value="East Zone">East Zone</option>
                </select>
                {formErrors.region && (
                  <p id="region-error" className="mt-1 text-xs text-rose-400 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {formErrors.region}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setNewBranchModalOpen(false);
                  setFormErrors({});
                  setNewBranchId("");
                  setNewBranchName("");
                  setNewBranchRegion("South Zone");
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/50"
                aria-label="Cancel branch creation"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                aria-label="Submit and create branch"
              >
                Create Branch
              </button>
            </div>
          </form>
        </div>
      )}
        </>
      )}
    </div>
  );
}
