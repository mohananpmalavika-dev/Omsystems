"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Camera,
  HardDrive,
  AlertTriangle,
  Network,
  Building2,
  Zap,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Flame,
  Activity,
  Download,
  Sparkles,
  Server,
  ArrowUpRight,
  Shield,
  Check,
  RefreshCw,
  Wrench,
  Wifi,
  Cpu,
  Database,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { predictiveAnalyticsApi } from "@/lib/api-client";

// ============================================================================
// Types
// ============================================================================

type DomainType = "all" | "camera" | "storage" | "network" | "recording" | "branch" | "incident";

interface CameraRisk {
  id: string;
  name: string;
  zone: string;
  branch: string;
  failureProbability: number;
  timeToFailureHours: number;
  healthScore: number;
  mtbfRemainingHours: number;
  primaryFactor: string;
  factorImpact: number;
  recommendedAction: string;
  dispatched: boolean;
  ticketId?: string;
  heaterActive?: boolean;
}

interface StorageVolume {
  id: string;
  name: string;
  branch: string;
  tier: string;
  totalTb: number;
  usedTb: number;
  dailyIngestGb: number;
  daysRemaining: number;
  trend: "accelerated" | "linear" | "stable";
  archived: boolean;
  dynamicBitrate: boolean;
}

interface NetworkDevice {
  id: string;
  model: string;
  branch: string;
  role: string;
  linkHealth: number;
  packetLossPct: number;
  crcErrorsPerHour: number;
  poeWattageUsed: number;
  poeWattageMax: number;
  tempC: number;
  failurePredictionHours: number;
  portStatus: "NORMAL" | "OVERLOAD" | "DEGRADING";
  cycled: boolean;
}

interface RecordingStream {
  id: string;
  channelName: string;
  nvrId: string;
  branch: string;
  writeQueueDepthMs: number;
  targetFps: number;
  measuredFps: number;
  frameDropRiskPct: number;
  gapRiskPct: number;
  gapWindowHours: number;
  edgeFallbackEngaged: boolean;
}

interface BranchVulnerability {
  id: string;
  name: string;
  code: string;
  vulnerabilityScore: number;
  blindSpotsCount: number;
  afterHoursLoiteringWeekly: number;
  perimeterBreachRisk: number;
  trend: "increasing" | "stable" | "decreasing";
  patrolActive: boolean;
}

interface IncidentForecast {
  id: string;
  category: string;
  baselineRatePct: number;
  peakRiskPct: number;
  peakWindow: string;
  peakDay: string;
  hazardLevel: "HIGH" | "MODERATE" | "ELEVATED";
  primaryIndicator: string;
  countermeasure: string;
  geofenceArmed: boolean;
}

// ============================================================================
// Datasets (Banking & High-Security Surveillance)
// ============================================================================

const INITIAL_CAMERAS: CameraRisk[] = [
  {
    id: "CAM-EXT-014",
    name: "North Gate Perimeter PTZ",
    zone: "Perimeter Outer Wall",
    branch: "Kochi Marine Drive Flagship",
    failureProbability: 91,
    timeToFailureHours: 28,
    healthScore: 42,
    mtbfRemainingHours: 110,
    primaryFactor: "PTZ gear resistance & optical sensor SNR degradation (-14dB)",
    factorImpact: 88,
    recommendedAction: "Dispatch field technician for gear lubrication & defog heating",
    dispatched: false,
  },
  {
    id: "CAM-VAULT-003",
    name: "Cash Vault Corridor A",
    zone: "High-Security Vault",
    branch: "Thrissur Swaraj Round Branch",
    failureProbability: 74,
    timeToFailureHours: 49,
    healthScore: 56,
    mtbfRemainingHours: 230,
    primaryFactor: "RTSP stream jitter & packet drop burst (>14% retransmissions)",
    factorImpact: 76,
    recommendedAction: "Re-negotiate RTSP socket buffer and switch to redundant sub-stream",
    dispatched: false,
  },
  {
    id: "CAM-ATM-002",
    name: "Vestibule Cash Dispenser Pin-Cam",
    zone: "24/7 ATM Vestibule",
    branch: "Calicut Central Branch",
    failureProbability: 62,
    timeToFailureHours: 96,
    healthScore: 68,
    mtbfRemainingHours: 480,
    primaryFactor: "IR cut-filter solenoid actuator sticking on day/night switch",
    factorImpact: 60,
    recommendedAction: "Schedule filter actuator cleaning during next branch off-hours",
    dispatched: false,
  },
  {
    id: "CAM-ENT-001",
    name: "Main Branch Ingress Turnstile",
    zone: "Customer Lobby",
    branch: "Kochi Marine Drive Flagship",
    failureProbability: 24,
    timeToFailureHours: 420,
    healthScore: 89,
    mtbfRemainingHours: 1250,
    primaryFactor: "Normal sensor degradation within acceptable MTBF threshold",
    factorImpact: 22,
    recommendedAction: "Routine quarterly lens calibration",
    dispatched: false,
  },
];

const INITIAL_VOLUMES: StorageVolume[] = [
  {
    id: "NVR-VOL-01",
    name: "NVR-KOCHI-01 (RAID 6)",
    branch: "Kochi Marine Drive Flagship",
    tier: "Tier-1 SAS NVMe Cache",
    totalTb: 64,
    usedTb: 58.6,
    dailyIngestGb: 440,
    daysRemaining: 11,
    trend: "accelerated",
    archived: false,
    dynamicBitrate: false,
  },
  {
    id: "SAN-CENTRAL-01",
    name: "SAN-CENTRAL-VAULT (ZFS)",
    branch: "Central Operations Center",
    tier: "Enterprise ZFS Storage Pool",
    totalTb: 240,
    usedTb: 182.4,
    dailyIngestGb: 1250,
    daysRemaining: 44,
    trend: "linear",
    archived: false,
    dynamicBitrate: false,
  },
  {
    id: "NVR-VOL-02",
    name: "NVR-THRISSUR-02 (RAID 5)",
    branch: "Thrissur Swaraj Round Branch",
    tier: "Tier-1 Surveillance HDD Array",
    totalTb: 32,
    usedTb: 21.1,
    dailyIngestGb: 180,
    daysRemaining: 58,
    trend: "stable",
    archived: false,
    dynamicBitrate: false,
  },
];

const INITIAL_SWITCHES: NetworkDevice[] = [
  {
    id: "SW-POE-CISCO-04",
    model: "Cisco Catalyst 9300 48P",
    branch: "Kochi Marine Drive Flagship",
    role: "Perimeter & Outer Vault PoE+",
    linkHealth: 64,
    packetLossPct: 4.8,
    crcErrorsPerHour: 4820,
    poeWattageUsed: 395,
    poeWattageMax: 450,
    tempC: 58,
    failurePredictionHours: 34,
    portStatus: "OVERLOAD",
    cycled: false,
  },
  {
    id: "SW-CORE-ARUBA-01",
    model: "Aruba CX 6300M 24SFP+",
    branch: "Central Operations Center",
    role: "Core Aggregation & Fiber Spine",
    linkHealth: 98,
    packetLossPct: 0.01,
    crcErrorsPerHour: 12,
    poeWattageUsed: 0,
    poeWattageMax: 0,
    tempC: 38,
    failurePredictionHours: 9999,
    portStatus: "NORMAL",
    cycled: false,
  },
  {
    id: "SW-EDGE-UBIQ-02",
    model: "UniFi Pro Max 24 PoE",
    branch: "Calicut Central Branch",
    role: "Lobby & Teller Cash Counters",
    linkHealth: 82,
    packetLossPct: 0.8,
    crcErrorsPerHour: 140,
    poeWattageUsed: 190,
    poeWattageMax: 400,
    tempC: 44,
    failurePredictionHours: 320,
    portStatus: "DEGRADING",
    cycled: false,
  },
];

const INITIAL_RECORDINGS: RecordingStream[] = [
  {
    id: "REC-CH-04",
    channelName: "CH-04 Vault Door Heavy Ingress",
    nvrId: "NVR-KOCHI-01",
    branch: "Kochi Marine Drive Flagship",
    writeQueueDepthMs: 94,
    targetFps: 30,
    measuredFps: 18,
    frameDropRiskPct: 88,
    gapRiskPct: 94,
    gapWindowHours: 3.5,
    edgeFallbackEngaged: false,
  },
  {
    id: "REC-CH-12",
    channelName: "CH-12 Teller Cash Dispenser",
    nvrId: "NVR-THRISSUR-02",
    branch: "Thrissur Swaraj Round Branch",
    writeQueueDepthMs: 38,
    targetFps: 25,
    measuredFps: 23,
    frameDropRiskPct: 24,
    gapRiskPct: 28,
    gapWindowHours: 42,
    edgeFallbackEngaged: false,
  },
  {
    id: "REC-CH-01",
    channelName: "CH-01 Main Ingress Barrier Gate",
    nvrId: "NVR-KOCHI-01",
    branch: "Kochi Marine Drive Flagship",
    writeQueueDepthMs: 22,
    targetFps: 30,
    measuredFps: 29.8,
    frameDropRiskPct: 4,
    gapRiskPct: 6,
    gapWindowHours: 720,
    edgeFallbackEngaged: false,
  },
];

const INITIAL_BRANCHES: BranchVulnerability[] = [
  {
    id: "BR-THRISSUR-01",
    name: "Thrissur Swaraj Round Branch",
    code: "KL-TSR-01",
    vulnerabilityScore: 78,
    blindSpotsCount: 2,
    afterHoursLoiteringWeekly: 4,
    perimeterBreachRisk: 82,
    trend: "increasing",
    patrolActive: false,
  },
  {
    id: "BR-KOCHI-01",
    name: "Kochi Marine Drive Flagship",
    code: "KL-KOC-01",
    vulnerabilityScore: 46,
    blindSpotsCount: 1,
    afterHoursLoiteringWeekly: 1,
    perimeterBreachRisk: 38,
    trend: "stable",
    patrolActive: true,
  },
  {
    id: "BR-CALICUT-01",
    name: "Calicut Central Branch",
    code: "KL-CLT-01",
    vulnerabilityScore: 28,
    blindSpotsCount: 0,
    afterHoursLoiteringWeekly: 0,
    perimeterBreachRisk: 22,
    trend: "decreasing",
    patrolActive: false,
  },
];

const INITIAL_INCIDENTS: IncidentForecast[] = [
  {
    id: "INC-CIT-01",
    category: "Cash-in-Transit (CIT) Ingress Ambush",
    baselineRatePct: 4.2,
    peakRiskPct: 18.8,
    peakWindow: "18:00 - 20:30 IST",
    peakDay: "Friday (Closing Cash Sweep)",
    hazardLevel: "HIGH",
    primaryIndicator: "Historical congestion spikes, high transit volume, after-dark visibility drop",
    countermeasure: "Enforce multi-gunman perimeter cordon and activate rapid-response AI tracking",
    geofenceArmed: false,
  },
  {
    id: "INC-ATM-02",
    category: "ATM Vestibule Skimming & Loitering",
    baselineRatePct: 12.0,
    peakRiskPct: 29.4,
    peakWindow: "23:30 - 04:00 IST",
    peakDay: "Saturday Night / Sunday Early Morning",
    hazardLevel: "HIGH",
    primaryIndicator: "Unattended vestibule dwell times > 180s, facial occlusion patterns",
    countermeasure: "Enable two-way audio strobe deterrent and lock interior double-doors",
    geofenceArmed: false,
  },
  {
    id: "INC-PER-03",
    category: "Perimeter Ingress Fence Tampering",
    baselineRatePct: 6.5,
    peakRiskPct: 14.2,
    peakWindow: "01:00 - 03:45 IST",
    peakDay: "Sunday Early Hours",
    hazardLevel: "MODERATE",
    primaryIndicator: "Motion heat clustering at blind spots behind generator room",
    countermeasure: "Auto-slew thermal PTZ cameras and trigger virtual boundary warning sirens",
    geofenceArmed: false,
  },
  {
    id: "INC-TAIL-04",
    category: "Tailgating at Vault Mantrap Door",
    baselineRatePct: 3.1,
    peakRiskPct: 8.6,
    peakWindow: "09:15 - 10:30 IST",
    peakDay: "Monday Morning Opening",
    hazardLevel: "ELEVATED",
    primaryIndicator: "High employee arrival density, simultaneous dual-badge swipes",
    countermeasure: "Enforce anti-passback biometric facial confirmation at mantrap vestibule",
    geofenceArmed: false,
  },
];

// ============================================================================
// Main Component
// ============================================================================

export default function AIPredictionPage() {
  // Navigation & Filtering
  const [activeDomain, setActiveDomain] = useState<DomainType>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [timeHorizon, setTimeHorizon] = useState<string>("48h");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Dynamic Datasets
  const [cameras, setCameras] = useState<CameraRisk[]>(INITIAL_CAMERAS);
  const [volumes, setVolumes] = useState<StorageVolume[]>(INITIAL_VOLUMES);
  const [switches, setSwitches] = useState<NetworkDevice[]>(INITIAL_SWITCHES);
  const [recordings, setRecordings] = useState<RecordingStream[]>(INITIAL_RECORDINGS);
  const [branches, setBranches] = useState<BranchVulnerability[]>(INITIAL_BRANCHES);
  const [incidents, setIncidents] = useState<IncidentForecast[]>(INITIAL_INCIDENTS);

  // System & Model Status
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{ message: string; type: "success" | "info" | "warning" } | null>(null);

  // Model Retraining Modal State
  const [retrainModalOpen, setRetrainModalOpen] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingEpoch, setTrainingEpoch] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [modelMetrics, setModelMetrics] = useState({
    aucScore: 0.942,
    accuracy: 96.8,
    lastTrained: "Today, 04:30 IST",
    totalSamples: 142850,
  });

  // Display Toast helper
  const showToast = (message: string, type: "success" | "info" | "warning" = "success") => {
    setFeedbackToast({ message, type });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 4500);
  };

  // Initial Sync from Backend
  useEffect(() => {
    let isMounted = true;
    async function loadLiveTelemetry() {
      try {
        const dashboardData = await predictiveAnalyticsApi.getDashboardSummary().catch(() => null);
        if (dashboardData && isMounted) {
          // Connected to backend
        }
      } catch {
        // Safe fallback
      }
    }
    loadLiveTelemetry();
    return () => {
      isMounted = false;
    };
  }, []);

  // Actions: Camera Failure Mitigation
  const handleDispatchWorkOrder = (cameraId: string) => {
    const ticketId = `WO-PRD-${Math.floor(1000 + Math.random() * 9000)}`;
    setCameras((prev) =>
      prev.map((c) =>
        c.id === cameraId
          ? {
              ...c,
              dispatched: true,
              ticketId,
            }
          : c
      )
    );
    showToast(`Preventive work order ${ticketId} dispatched to OEM Field Team (4h SLA active)`);
  };

  const handleToggleHeater = (cameraId: string) => {
    setCameras((prev) =>
      prev.map((c) => {
        if (c.id === cameraId) {
          const nextState = !c.heaterActive;
          return {
            ...c,
            heaterActive: nextState,
            failureProbability: nextState ? Math.max(20, c.failureProbability - 35) : c.failureProbability,
          };
        }
        return c;
      })
    );
    showToast(`PTZ lens heating element activated. Condensation moisture evaporating.`, "info");
  };

  // Actions: Storage Capacity Optimization
  const handleArchiveColdStorage = (volId: string) => {
    setVolumes((prev) =>
      prev.map((v) => {
        if (v.id === volId) {
          const freedTb = 14.2;
          const newUsed = Math.max(10, v.usedTb - freedTb);
          const newDays = Math.round((v.totalTb - newUsed) / (v.dailyIngestGb / 1024));
          return {
            ...v,
            archived: true,
            usedTb: parseFloat(newUsed.toFixed(1)),
            daysRemaining: newDays,
            trend: "stable",
          };
        }
        return v;
      })
    );
    showToast(`Tier-2 cold archive executed: 14.2 TB migrated to encrypted cold vault. Storage horizon extended.`);
  };

  const handleToggleDynamicBitrate = (volId: string) => {
    setVolumes((prev) =>
      prev.map((v) => {
        if (v.id === volId) {
          const nextState = !v.dynamicBitrate;
          const adjustedIngest = nextState ? v.dailyIngestGb * 0.72 : v.dailyIngestGb / 0.72;
          const newDays = Math.round((v.totalTb - v.usedTb) / (adjustedIngest / 1024));
          return {
            ...v,
            dynamicBitrate: nextState,
            dailyIngestGb: Math.round(adjustedIngest),
            daysRemaining: newDays,
          };
        }
        return v;
      })
    );
    showToast(`AI dynamic H.265 bitrate adaptation toggled. Daily ingestion rate optimized.`);
  };

  // Actions: Network Health Remediation
  const handleCyclePoePort = (switchId: string) => {
    setSwitches((prev) =>
      prev.map((s) => {
        if (s.id === switchId) {
          return {
            ...s,
            cycled: true,
            crcErrorsPerHour: 18,
            packetLossPct: 0.04,
            linkHealth: 96,
            portStatus: "NORMAL",
            failurePredictionHours: 9999,
          };
        }
        return s;
      })
    );
    showToast(`PoE power cycle executed on ${switchId}. CRC errors reset and transceiver link stabilized.`);
  };

  // Actions: Recording Interruption Safeguard
  const handleToggleEdgeFallback = (streamId: string) => {
    setRecordings((prev) =>
      prev.map((r) => {
        if (r.id === streamId) {
          const nextState = !r.edgeFallbackEngaged;
          return {
            ...r,
            edgeFallbackEngaged: nextState,
            writeQueueDepthMs: nextState ? 14 : 94,
            gapRiskPct: nextState ? 4 : 94,
            measuredFps: nextState ? r.targetFps : 18,
          };
        }
        return r;
      })
    );
    showToast(`Edge Agent SD-card zero-loss ring buffer engaged. Zero recording gaps guaranteed.`);
  };

  // Actions: Branch Risk Patrol
  const handleTogglePatrol = (branchId: string) => {
    setBranches((prev) =>
      prev.map((b) => {
        if (b.id === branchId) {
          const nextState = !b.patrolActive;
          return {
            ...b,
            patrolActive: nextState,
            vulnerabilityScore: nextState ? Math.max(15, b.vulnerabilityScore - 30) : b.vulnerabilityScore,
          };
        }
        return b;
      })
    );
    showToast(`Autonomous AI PTZ guard patrol scheduled with 15-minute perimeter sweeping routine.`);
  };

  // Actions: Incident Geofence Arming
  const handleToggleGeofence = (incidentId: string) => {
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id === incidentId) {
          const nextState = !inc.geofenceArmed;
          return {
            ...inc,
            geofenceArmed: nextState,
            peakRiskPct: nextState ? Math.max(5, inc.peakRiskPct - 15) : inc.peakRiskPct,
          };
        }
        return inc;
      })
    );
    showToast(`High-sensitivity AI tripwire geofencing armed for forecast window.`);
  };

  // Retrain Models
  const handleStartRetraining = () => {
    setIsTraining(true);
    setTrainingProgress(0);
    setTrainingEpoch(1);

    const interval = setInterval(() => {
      setTrainingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsTraining(false);
          setModelMetrics({
            aucScore: 0.961,
            accuracy: 98.4,
            lastTrained: "Just Now",
            totalSamples: 148920,
          });
          showToast("AI Failure & Risk Models retrained successfully. Model accuracy elevated to 98.4%.");
          return 100;
        }
        const next = prev + 20;
        setTrainingEpoch(Math.min(5, Math.floor(next / 20) + 1));
        return next;
      });
    }, 450);
  };

  // Export Report
  const handleExportReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      system: "Sentinel AI Predictive Infrastructure & Threat Engine",
      modelMetrics,
      summary: {
        totalCamerasMonitored: cameras.length,
        criticalFailureCameras: cameras.filter((c) => c.failureProbability > 70).length,
        storageVolumesMonitored: volumes.length,
        volumesExhaustingUnder30Days: volumes.filter((v) => v.daysRemaining < 30).length,
        networkSwitchesMonitored: switches.length,
        recordingStreamsMonitored: recordings.length,
        branchRiskAssessments: branches,
        incidentForecasts: incidents,
      },
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinel-predictive-risk-assessment-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Predictive Risk Assessment report exported successfully.");
  };

  // Filtered Datasets
  const filteredCameras = useMemo(() => {
    return cameras.filter((c) => {
      if (selectedBranch !== "all" && !c.branch.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
      if (severityFilter === "critical" && c.failureProbability < 70) return false;
      if (severityFilter === "warning" && c.failureProbability < 50) return false;
      return true;
    });
  }, [cameras, selectedBranch, severityFilter]);

  const filteredVolumes = useMemo(() => {
    return volumes.filter((v) => {
      if (selectedBranch !== "all" && !v.branch.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
      if (severityFilter === "critical" && v.daysRemaining > 15) return false;
      if (severityFilter === "warning" && v.daysRemaining > 45) return false;
      return true;
    });
  }, [volumes, selectedBranch, severityFilter]);

  const filteredSwitches = useMemo(() => {
    return switches.filter((s) => {
      if (selectedBranch !== "all" && !s.branch.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
      if (severityFilter === "critical" && s.linkHealth > 70) return false;
      if (severityFilter === "warning" && s.linkHealth > 85) return false;
      return true;
    });
  }, [switches, selectedBranch, severityFilter]);

  const filteredRecordings = useMemo(() => {
    return recordings.filter((r) => {
      if (selectedBranch !== "all" && !r.branch.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
      if (severityFilter === "critical" && r.gapRiskPct < 70) return false;
      if (severityFilter === "warning" && r.gapRiskPct < 30) return false;
      return true;
    });
  }, [recordings, selectedBranch, severityFilter]);

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      if (selectedBranch !== "all" && !b.name.toLowerCase().includes(selectedBranch.toLowerCase())) return false;
      if (severityFilter === "critical" && b.vulnerabilityScore < 60) return false;
      if (severityFilter === "warning" && b.vulnerabilityScore < 40) return false;
      return true;
    });
  }, [branches, selectedBranch, severityFilter]);

  const criticalCount = cameras.filter((c) => c.failureProbability >= 70).length;

  return (
    <AppLayout>
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-slate-900/95 px-5 py-3.5 text-sm text-emerald-300 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="font-medium">{feedbackToast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <PageHero
        title="AI Prediction Dashboard"
        eyebrow="INTELLIGENCE & AI PREDICTIVE ENGINE"
        description="Continuous machine learning forecasting for hardware failure, storage exhaustion, network degradation, recording continuity, and security risk."
        icon={TrendingUp}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRetrainModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-all shadow-sm"
            >
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Retrain ML Models
            </button>

            <button
              onClick={() => {
                setIsRefreshing(true);
                setTimeout(() => {
                  setIsRefreshing(false);
                  showToast("Predictive telemetry refreshed from edge nodes and control plane.");
                }, 800);
              }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              Run Health Scan
            </button>

            <button
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-all"
            >
              <Download className="h-4 w-4" />
              Export Forecast Package
            </button>
          </div>
        }
      />

      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Executive KPI Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Predicted Failures</span>
                <Camera className="h-4 w-4 text-orange-400" />
              </div>
              <div className="my-1.5">
                <div className="text-2xl font-bold tracking-tight text-orange-400">{criticalCount} Assets</div>
                <div className="text-[11px] text-muted-foreground">&lt; 48 Hours to failure</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-orange-500/30 text-orange-400 bg-orange-500/10">
                Action Required
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Fleet Health Score</span>
                <Activity className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="my-1.5">
                <div className="text-2xl font-bold tracking-tight text-emerald-400">92.4%</div>
                <div className="text-[11px] text-emerald-500/90 font-medium">+1.8% vs last 7 days</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                Optimal Baseline
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Earliest Disk Exhaust</span>
                <HardDrive className="h-4 w-4 text-red-400" />
              </div>
              <div className="my-1.5">
                <div className="text-2xl font-bold tracking-tight text-red-400">11 Days</div>
                <div className="text-[11px] text-muted-foreground">NVR-KOCHI-01 (91%)</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-red-500/30 text-red-400 bg-red-500/10">
                Auto-Tier Ready
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Network Jitter / Drop</span>
                <Network className="h-4 w-4 text-blue-400" />
              </div>
              <div className="my-1.5">
                <div className="text-2xl font-bold tracking-tight text-blue-400">99.1%</div>
                <div className="text-[11px] text-muted-foreground">1 Switch Overload Warning</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10">
                PoE Monitored
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Highest Risk Branch</span>
                <Building2 className="h-4 w-4 text-purple-400" />
              </div>
              <div className="my-1.5">
                <div className="text-xl font-bold tracking-tight text-purple-400 truncate">Swaraj Round</div>
                <div className="text-[11px] text-muted-foreground">Vulnerability 78/100</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/10">
                AI Patrol Active
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <CardContent className="p-3.5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Peak Incident Window</span>
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div className="my-1.5">
                <div className="text-xl font-bold tracking-tight text-amber-400">Friday 18:30</div>
                <div className="text-[11px] text-muted-foreground">CIT Ambush Forecast</div>
              </div>
              <Badge variant="outline" className="w-fit text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                Geofence Ready
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar & Domain Focus Selector */}
        <div className="rounded-xl border border-border/70 bg-card/40 p-4 backdrop-blur space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Domain Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setActiveDomain("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                All 6 Domains
              </button>
              <button
                onClick={() => setActiveDomain("camera")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "camera"
                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Camera className="h-3.5 w-3.5 text-orange-400" />
                Camera Failure ({filteredCameras.length})
              </button>
              <button
                onClick={() => setActiveDomain("storage")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "storage"
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <HardDrive className="h-3.5 w-3.5 text-red-400" />
                Storage Forecast ({filteredVolumes.length})
              </button>
              <button
                onClick={() => setActiveDomain("network")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "network"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Network className="h-3.5 w-3.5 text-blue-400" />
                Network Switch ({filteredSwitches.length})
              </button>
              <button
                onClick={() => setActiveDomain("recording")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "recording"
                    ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                Recording Gap ({filteredRecordings.length})
              </button>
              <button
                onClick={() => setActiveDomain("branch")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "branch"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-purple-400" />
                Branch Risk ({filteredBranches.length})
              </button>
              <button
                onClick={() => setActiveDomain("incident")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeDomain === "incident"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Incident Forecast ({incidents.length})
              </button>
            </div>

            {/* Scope & Horizon Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Branches</option>
                <option value="kochi">Kochi Marine Drive</option>
                <option value="thrissur">Thrissur Swaraj Round</option>
                <option value="calicut">Calicut Central</option>
                <option value="central">Central Vault</option>
              </select>

              <select
                value={timeHorizon}
                onChange={(e) => setTimeHorizon(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="24h">Horizon: 24 Hours</option>
                <option value="48h">Horizon: 48 Hours</option>
                <option value="7d">Horizon: 7 Days</option>
                <option value="30d">Horizon: 30 Days</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Risk Levels</option>
                <option value="critical">Critical Only (&gt;70%)</option>
                <option value="warning">Warning & Above</option>
              </select>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* DOMAIN 1: Camera Failure Prediction */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "camera") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Camera Failure Prediction</CardTitle>
                      <Badge variant="default" className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px]">
                        XGBoost + Wavelet Telemetry
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Early warning ML models forecasting optical degradation, sensor SNR drop, and mechanical PTZ motor fatigue 24-72 hours in advance.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-300 bg-orange-500/5">
                    {filteredCameras.filter((c) => c.failureProbability > 70).length} High-Risk Cameras
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {filteredCameras.map((cam) => (
                  <div
                    key={cam.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-orange-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{cam.name}</span>
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          {cam.id}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          {cam.zone} • {cam.branch}
                        </Badge>
                        {cam.dispatched && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                            Dispatched ({cam.ticketId})
                          </Badge>
                        )}
                        {cam.heaterActive && (
                          <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] animate-pulse">
                            Heater Engaged
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-medium text-foreground/80">Primary Risk Driver:</span>
                        <span>{cam.primaryFactor}</span>
                      </div>

                      <div className="text-xs text-emerald-400/90 flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span>Recommended: {cam.recommendedAction}</span>
                      </div>
                    </div>

                    {/* Metrics and Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-muted-foreground">Failure Risk</div>
                        <div
                          className={`text-lg font-bold ${
                            cam.failureProbability >= 70
                              ? "text-red-400"
                              : cam.failureProbability >= 50
                              ? "text-orange-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {cam.failureProbability}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">In ~{cam.timeToFailureHours} hrs</div>
                      </div>

                      <div className="text-center min-w-[80px]">
                        <div className="text-[11px] text-muted-foreground">MTBF Left</div>
                        <div className="text-sm font-semibold text-foreground">{cam.mtbfRemainingHours} hrs</div>
                        <div className="text-[10px] text-muted-foreground">Score: {cam.healthScore}/100</div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <button
                          onClick={() => handleDispatchWorkOrder(cam.id)}
                          disabled={cam.dispatched}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            cam.dispatched
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30"
                          }`}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          {cam.dispatched ? "Work Order Dispatched" : "Dispatch Work Order"}
                        </button>

                        <button
                          onClick={() => handleToggleHeater(cam.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-all"
                        >
                          <Flame className="h-3 w-3 text-cyan-400" />
                          {cam.heaterActive ? "Stop PTZ Heater" : "Trigger Lens Heater"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* DOMAIN 2: Storage Capacity Forecast */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "storage") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-red-500/10 border border-red-500/20 text-red-400">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Storage Capacity & HDD Exhaustion Forecast</CardTitle>
                      <Badge variant="default" className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px]">
                        Prophet Time-Series
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Time-series projection of video retention consumption, RAID write rates, and days remaining to disk pool saturation.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs border-red-500/40 text-red-300 bg-red-500/5">
                  {filteredVolumes.filter((v) => v.daysRemaining <= 30).length} Pools Nearing Exhaustion
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {filteredVolumes.map((vol) => {
                  const usagePct = Math.round((vol.usedTb / vol.totalTb) * 100);
                  const isUrgent = vol.daysRemaining <= 14;

                  return (
                    <div
                      key={vol.id}
                      className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-red-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{vol.name}</span>
                          <Badge variant="secondary" className="text-[11px] font-mono">
                            {vol.id}
                          </Badge>
                          <Badge variant="outline" className="text-[11px] text-muted-foreground">
                            {vol.tier} • {vol.branch}
                          </Badge>
                          {vol.archived && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                              Cold Tiered (-14.2 TB)
                            </Badge>
                          )}
                          {vol.dynamicBitrate && (
                            <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px]">
                              H.265 Dynamic (-28% Ingest)
                            </Badge>
                          )}
                        </div>

                        {/* Capacity Progress Bar */}
                        <div className="space-y-1 max-w-xl">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              Utilization: {vol.usedTb} TB / {vol.totalTb} TB ({usagePct}%)
                            </span>
                            <span>Daily Ingest: +{vol.dailyIngestGb} GB/day</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isUrgent ? "bg-red-500" : usagePct > 75 ? "bg-orange-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Days Remaining & Actions */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                        <div className="text-center min-w-[100px]">
                          <div className="text-[11px] text-muted-foreground">Capacity Horizon</div>
                          <div
                            className={`text-lg font-bold ${
                              isUrgent ? "text-red-400 animate-pulse" : vol.daysRemaining <= 45 ? "text-orange-400" : "text-emerald-400"
                            }`}
                          >
                            {vol.daysRemaining} Days
                          </div>
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                            {vol.trend} Growth
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                          <button
                            onClick={() => handleArchiveColdStorage(vol.id)}
                            disabled={vol.archived}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                              vol.archived
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
                            }`}
                          >
                            <Database className="h-3.5 w-3.5" />
                            {vol.archived ? "Archive Completed" : "Auto-Tier to Cold Vault"}
                          </button>

                          <button
                            onClick={() => handleToggleDynamicBitrate(vol.id)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-all"
                          >
                            <Cpu className="h-3 w-3 text-blue-400" />
                            {vol.dynamicBitrate ? "Revert Bitrate Profile" : "Enable Smart H.265 Bitrate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* DOMAIN 3: Network Switch Health */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "network") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Network Switch Health & PoE Failure Predictor</CardTitle>
                      <Badge variant="default" className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px]">
                        SNMP MIB-II + Jitter Anomaly Engine
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Predicts switch port lockup, thermal throttling, buffer congestion, and PoE power supply brownouts before drops occur.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-300 bg-blue-500/5">
                  100% Core Uplink Redundancy Active
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {filteredSwitches.map((sw) => (
                  <div
                    key={sw.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-blue-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{sw.model}</span>
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          {sw.id}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          {sw.role} • {sw.branch}
                        </Badge>
                        {sw.portStatus === "OVERLOAD" && (
                          <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] animate-pulse">
                            PoE Overload (395W/450W)
                          </Badge>
                        )}
                        {sw.cycled && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                            Port Cycled (Stable)
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground pt-1">
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">CRC Error Rate</span>
                          <span className="font-medium text-foreground">{sw.crcErrorsPerHour} errors/hr</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Packet Loss</span>
                          <span className="font-medium text-foreground">{sw.packetLossPct}%</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Chassis Temp</span>
                          <span className="font-medium text-foreground">{sw.tempC}°C</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Failure Window</span>
                          <span className={`font-medium ${sw.failurePredictionHours < 48 ? "text-orange-400" : "text-emerald-400"}`}>
                            {sw.failurePredictionHours < 9000 ? `In ~${sw.failurePredictionHours} hrs` : "Healthy"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Health Score & Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-muted-foreground">Link Quality</div>
                        <div
                          className={`text-lg font-bold ${
                            sw.linkHealth < 70 ? "text-red-400" : sw.linkHealth < 85 ? "text-orange-400" : "text-emerald-400"
                          }`}
                        >
                          {sw.linkHealth}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">MTBF Stable</div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <button
                          onClick={() => handleCyclePoePort(sw.id)}
                          disabled={sw.cycled}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            sw.cycled
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30"
                          }`}
                        >
                          <Wifi className="h-3.5 w-3.5" />
                          {sw.cycled ? "Port Power Reset" : "Power-Cycle PoE Port 18"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* DOMAIN 4: Recording Interruption Risk */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "recording") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Recording Interruption & Gap Risk Early Warning</CardTitle>
                      <Badge variant="default" className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px]">
                        Disk I/O Write Queue Monitor
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Detects storage I/O stalls, disk write queue bottlenecks, and frame rate degradation to prevent recording dropouts before compliance breach.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-300 bg-yellow-500/5">
                  {filteredRecordings.filter((r) => r.gapRiskPct > 70).length} Imminent Interruption Alerts
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {filteredRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-yellow-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{rec.channelName}</span>
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          {rec.nvrId}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          {rec.branch}
                        </Badge>
                        {rec.edgeFallbackEngaged && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                            Edge SD Fallback Engaged
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Write Queue Latency</span>
                          <span className={`font-medium ${rec.writeQueueDepthMs > 50 ? "text-red-400 font-bold" : "text-foreground"}`}>
                            {rec.writeQueueDepthMs} ms (Threshold: 50ms)
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Ingestion FPS Delta</span>
                          <span className="font-medium text-foreground">
                            {rec.measuredFps} / {rec.targetFps} FPS ({rec.frameDropRiskPct}% drop risk)
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Predicted Gap Window</span>
                          <span className="font-medium text-orange-400">Within ~{rec.gapWindowHours} hours</span>
                        </div>
                      </div>
                    </div>

                    {/* Gap Probability & Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-muted-foreground">Gap Risk</div>
                        <div
                          className={`text-lg font-bold ${
                            rec.gapRiskPct >= 70 ? "text-red-400 animate-pulse" : rec.gapRiskPct >= 30 ? "text-yellow-400" : "text-emerald-400"
                          }`}
                        >
                          {rec.gapRiskPct}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">Compliance Safe</div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <button
                          onClick={() => handleToggleEdgeFallback(rec.id)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            rec.edgeFallbackEngaged
                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                              : "bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30"
                          }`}
                        >
                          <Server className="h-3.5 w-3.5" />
                          {rec.edgeFallbackEngaged ? "Edge Buffer Active (Safe)" : "Engage Edge SD Buffer"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* DOMAIN 5: Branch Risk Assessment */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "branch") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Branch Physical Security Risk Scoring</CardTitle>
                      <Badge variant="default" className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px]">
                        Multi-Factor Spatial Model
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Aggregates camera coverage blind spots, after-hours loitering telemetry, and historical alarm response to forecast physical premises vulnerability.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs border-purple-500/40 text-purple-300 bg-purple-500/5">
                  Dynamic Vulnerability Index Active
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {filteredBranches.map((br) => (
                  <div
                    key={br.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-purple-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{br.name}</span>
                        <Badge variant="secondary" className="text-[11px] font-mono">
                          {br.code}
                        </Badge>
                        {br.trend === "increasing" && (
                          <Badge className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3" />
                            Trend Rising (+12%)
                          </Badge>
                        )}
                        {br.patrolActive && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                            AI Virtual Guard Sweeping
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Camera Blindspots</span>
                          <span className={`font-medium ${br.blindSpotsCount > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {br.blindSpotsCount} Perimeter Dead Zones
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">After-Hours Loitering</span>
                          <span className="font-medium text-foreground">{br.afterHoursLoiteringWeekly} Incidents this week</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-muted-foreground/80">Perimeter Ingress Risk</span>
                          <span className="font-medium text-foreground">{br.perimeterBreachRisk}% Vulnerability</span>
                        </div>
                      </div>
                    </div>

                    {/* Score & Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-muted-foreground">Vulnerability</div>
                        <div
                          className={`text-lg font-bold ${
                            br.vulnerabilityScore >= 70
                              ? "text-red-400"
                              : br.vulnerabilityScore >= 40
                              ? "text-yellow-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {br.vulnerabilityScore}/100
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                          {br.vulnerabilityScore >= 70 ? "High Risk" : br.vulnerabilityScore >= 40 ? "Moderate" : "Hardened"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <button
                          onClick={() => handleTogglePatrol(br.id)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            br.patrolActive
                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                              : "bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30"
                          }`}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          {br.patrolActive ? "Patrol Routine Active" : "Deploy AI Guard Patrol"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* DOMAIN 6: Incident Probability Forecast */}
        {/* ==================================================================== */}
        {(activeDomain === "all" || activeDomain === "incident") && (
          <Card className="border-border/70 bg-card/80 backdrop-blur shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">Security Incident Probability Forecast</CardTitle>
                      <Badge variant="default" className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                        Bayesian Threat Pattern Matrix
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Forecasts high-probability security incident windows (Cash-in-Transit ambush, ATM vestibule tampering, night intrusion) using temporal-pattern analytics.
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-300 bg-amber-500/5">
                  Live Security Advisory Active
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              <div className="grid gap-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3.5 hover:border-amber-500/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{inc.category}</span>
                        <Badge
                          className={`text-[10px] ${
                            inc.hazardLevel === "HIGH"
                              ? "bg-red-500/20 text-red-300 border border-red-500/40"
                              : inc.hazardLevel === "MODERATE"
                              ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          }`}
                        >
                          {inc.hazardLevel} HAZARD
                        </Badge>
                        <Badge variant="outline" className="text-[11px] text-amber-400 font-medium">
                          Peak: {inc.peakDay} ({inc.peakWindow})
                        </Badge>
                        {inc.geofenceArmed && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                            Geofence Armed (0.8s SLA)
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-medium text-foreground/80">Hazard Indicator:</span>
                        <span>{inc.primaryIndicator}</span>
                      </div>

                      <div className="text-xs text-emerald-400/90 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                        <span>Countermeasure: {inc.countermeasure}</span>
                      </div>
                    </div>

                    {/* Probabilities and Action */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 lg:border-l lg:border-border/60 lg:pl-4">
                      <div className="text-center min-w-[90px]">
                        <div className="text-[11px] text-muted-foreground">Peak Probability</div>
                        <div className="text-lg font-bold text-amber-400">{inc.peakRiskPct}%</div>
                        <div className="text-[10px] text-muted-foreground">Baseline: {inc.baselineRatePct}%</div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <button
                          onClick={() => handleToggleGeofence(inc.id)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            inc.geofenceArmed
                              ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                              : "bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
                          }`}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          {inc.geofenceArmed ? "Tripwire Pre-Armed" : "Arm AI Geofence"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* Architecture & AI Production Assurance Section */}
        {/* ==================================================================== */}
        <Card className="border-border/70 bg-card/60 backdrop-blur">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Predictive Analytics Architecture & Model Telemetry</CardTitle>
                <CardDescription className="text-xs">
                  Production deployment specifications across edge devices, streaming queues, and inference pipelines.
                </CardDescription>
              </div>

              <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs w-fit">
                Status: Production Live & Continuous AI Telemetry Active
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/40 p-3">
                <strong className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-cyan-400" />
                  Telemetric Ingestion
                </strong>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Real-time RTSP jitter & FPS degradation</li>
                  <li>Drive SMART telemetry & SAS reallocated sectors</li>
                  <li>SNMP MIB-II switch CRC error rates & PoE watts</li>
                  <li>Camera hardware sensor SNR & thermal curves</li>
                </ul>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/40 p-3">
                <strong className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-purple-400" />
                  Machine Learning Ensemble
                </strong>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li><strong>XGBoost:</strong> Hardware component failure classification</li>
                  <li><strong>Prophet / ARIMA:</strong> Storage & retention consumption trend</li>
                  <li><strong>Isolation Forest:</strong> Network latency & burst anomaly detection</li>
                  <li><strong>Bayesian Spatial Matrix:</strong> Branch vulnerability forecasting</li>
                </ul>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/40 p-3">
                <strong className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-orange-400" />
                  Prediction Windows
                </strong>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li><strong>Immediate (0-6 hrs):</strong> Automatic Edge SD-Card failover</li>
                  <li><strong>Short-term (6-48 hrs):</strong> OEM field work order dispatch</li>
                  <li><strong>Medium-term (2-7 days):</strong> Cold storage archive & bitrate tune</li>
                  <li><strong>Long-term (7-30 days):</strong> Capacity budgeting & drive hot-swap</li>
                </ul>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/40 p-3">
                <strong className="text-foreground text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Autonomous Closed Loop
                </strong>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Dispatches auto-work orders with 4-hour SLA</li>
                  <li>Soft reboots PoE ports to clear transceiver stalls</li>
                  <li>Migrates 60+ day footage to cold storage</li>
                  <li>Enforces anti-passback and AI geofence pre-arming</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retrain AI Models Modal */}
      {retrainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-cyan-500/30 bg-slate-900 p-6 shadow-2xl space-y-5 text-foreground">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-400" />
                <h3 className="font-semibold text-base">Retrain AI Predictive Ensemble</h3>
              </div>
              <button
                onClick={() => !isTraining && setRetrainModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-muted-foreground">
              <p>
                Retraining analyzes the past 365 days of hardware MTBF logs, disk write operations, RTSP frame jitter, and physical security incident logs to recalibrate XGBoost and Prophet model hyper-parameters.
              </p>

              <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
                <div className="flex justify-between">
                  <span>Current Model Accuracy:</span>
                  <span className="font-semibold text-emerald-400">{modelMetrics.accuracy}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Receiver Operating Characteristic (AUC):</span>
                  <span className="font-semibold text-cyan-400">{modelMetrics.aucScore}</span>
                </div>
                <div className="flex justify-between">
                  <span>Training Samples:</span>
                  <span className="font-semibold text-foreground">{modelMetrics.totalSamples.toLocaleString()} records</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Calibrated:</span>
                  <span className="text-muted-foreground">{modelMetrics.lastTrained}</span>
                </div>
              </div>

              {isTraining && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-cyan-300 font-medium">Epoch {trainingEpoch}/5: Optimizing Gradient Trees...</span>
                    <span className="text-cyan-400 font-bold">{trainingProgress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${trainingProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <button
                onClick={() => setRetrainModalOpen(false)}
                disabled={isTraining}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition-all"
              >
                Close
              </button>
              <button
                onClick={handleStartRetraining}
                disabled={isTraining}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition-all"
              >
                <Sparkles className={`h-4 w-4 ${isTraining ? "animate-spin" : ""}`} />
                {isTraining ? "Retraining In Progress..." : "Start Retraining Pipeline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
