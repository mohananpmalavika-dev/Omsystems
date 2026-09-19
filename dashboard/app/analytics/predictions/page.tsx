"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Building2, Camera, CheckCircle2, Database,
  Download, HardDrive, Network, RefreshCw, Server, ShieldAlert, TrendingUp, Wrench, Zap,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { predictiveAnalyticsApi } from "@/lib/api-client";

type Domain = "all" | "camera" | "storage" | "network" | "recording" | "branch" | "incident";
type Quality = "verified" | "estimated" | "unsupported" | "unavailable" | null;

interface CameraRisk {
  id: string; name: string; zone: string; branch: string; failureProbability: number;
  timeToFailureHours: number | null; healthScore: number | null; mtbfRemainingHours: number | null;
  primaryFactor: string; factorImpact: number | null; recommendedAction: string;
  dispatched: boolean; ticketId?: string; observedAt: string | null; dataQuality: Quality;
}
interface StorageVolume {
  id: string; name: string; branch: string; tier: string; totalTb: number | null;
  usedTb: number | null; dailyIngestGb: number | null; daysRemaining: number | null;
  trend: "accelerated" | "linear" | "unknown"; smartStatus: string | null;
  observedAt: string; dataQuality: Quality;
}
interface NetworkDevice {
  id: string; model: string; branch: string; role: string; linkHealth: number | null;
  packetLossPct: number | null; crcErrorsPerHour: number | null; poeWattageUsed: number | null;
  poeWattageMax: number | null; tempC: number | null; failurePredictionHours: number | null;
  portStatus: string; observedAt: string; dataQuality: Quality;
}
interface RecordingStream {
  id: string; channelName: string; nvrId: string; branch: string; writeQueueDepthMs: number | null;
  targetFps: number | null; measuredFps: number | null; frameDropRiskPct: number | null;
  gapRiskPct: number | null; gapWindowHours: number | null; edgeFallbackEngaged: boolean | null;
  observedAt: string; dataQuality: Quality;
}
interface BranchRisk {
  id: string; name: string; code: string; vulnerabilityScore: number; target: string;
  confidence: string; dataQuality: number; primaryRiskDriver: string; recommendedAction: string | null;
  trend: string; horizonHours: number; generatedAt: string; expiresAt: string;
}
interface IncidentForecast {
  id: string; category: string; baselineRatePct: number | null; peakRiskPct: number;
  peakWindow: string | null; peakDay: string | null; hazardLevel: "HIGH" | "MODERATE" | "ELEVATED";
  primaryIndicator: string; countermeasure: string; branch: string; detectedAt: string | null;
}
interface Kpis {
  predictedFailuresCount: number; fleetHealthScore: number | null; healthScoreDelta: string | null;
  earliestDiskExhaustDays: number | null; earliestDiskExhaustAsset: string | null; earliestDiskUsagePct: number | null;
  networkHealthPct: number | null; networkWarningCount: number; highestRiskBranch: string | null;
  highestRiskBranchScore: number | null; peakIncidentWindow: string | null; peakIncidentCategory: string | null;
}
interface ModelMetrics {
  name: string; version: string; type: string; accuracy: number | null; aucScore: number | null;
  totalSamples: number | null; lastTrained: string | null;
}
interface DashboardData {
  generatedAt: string; horizonHours: number;
  freshness: { latestTelemetryAt: string | null; telemetryRecords: number; activePredictions: number; predictiveAlerts: number };
  kpis: Kpis; cameras: CameraRisk[]; volumes: StorageVolume[]; switches: NetworkDevice[];
  recordings: RecordingStream[]; branches: BranchRisk[]; incidents: IncidentForecast[];
  modelMetrics: ModelMetrics | null; totalAssetsMonitored: number; openWorkOrdersCount: number;
}

const EMPTY_KPIS: Kpis = {
  predictedFailuresCount: 0, fleetHealthScore: null, healthScoreDelta: null,
  earliestDiskExhaustDays: null, earliestDiskExhaustAsset: null, earliestDiskUsagePct: null,
  networkHealthPct: null, networkWarningCount: 0, highestRiskBranch: null,
  highestRiskBranchScore: null, peakIncidentWindow: null, peakIncidentCategory: null,
};

const HORIZONS: Record<string, number> = { "24h": 24, "48h": 48, "7d": 168, "30d": 720 };
const showNumber = (value: number | null, suffix = "") => value === null ? "Unavailable" : `${value.toLocaleString()}${suffix}`;
const showTime = (value: string | null) => value ? new Date(value).toLocaleString() : "No telemetry received";

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-background/30 p-8 text-center text-sm text-muted-foreground">
      No live {label} is available for the selected scope and horizon.
    </div>
  );
}

function QualityBadge({ value }: { value: Quality | number }) {
  const text = typeof value === "number" ? `${Math.round(value * 100)}% data quality` : value ?? "quality unknown";
  return <Badge variant="outline" className="text-[10px] capitalize">{text}</Badge>;
}

export default function AIPredictionPage() {
  const [activeDomain, setActiveDomain] = useState<Domain>("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [timeHorizon, setTimeHorizon] = useState("48h");
  const [severity, setSeverity] = useState("all");
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);

  const loadLiveData = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const response = await predictiveAnalyticsApi.getDashboardSummary(HORIZONS[timeHorizon] ?? 48);
      setData(response as DashboardData);
    } catch (error) {
      setData(null);
      setLoadError(error instanceof Error ? error.message : "Failed to load predictive telemetry");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [timeHorizon]);

  useEffect(() => { void loadLiveData(); }, [loadLiveData]);

  const notify = (message: string, error = false) => {
    setNotice({ message, error });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const dispatchWorkOrder = async (cameraId: string) => {
    setActionId(cameraId);
    try {
      const result = await predictiveAnalyticsApi.executeAction({ action: "dispatch_work_order", targetId: cameraId });
      notify(result.alreadyOpen ? `Work order ${result.ticketId} is already open.` : `Work order ${result.ticketId} created.`);
      await loadLiveData();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Work order creation failed", true);
    } finally { setActionId(null); }
  };

  const exportReport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `predictive-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  const branches = useMemo(() => Array.from(new Set([
    ...(data?.cameras.map((item) => item.branch) ?? []), ...(data?.volumes.map((item) => item.branch) ?? []),
    ...(data?.switches.map((item) => item.branch) ?? []), ...(data?.recordings.map((item) => item.branch) ?? []),
    ...(data?.branches.map((item) => item.name) ?? []), ...(data?.incidents.map((item) => item.branch) ?? []),
  ])).sort(), [data]);
  const inBranch = (branch: string) => selectedBranch === "all" || branch === selectedBranch;
  const cameras = (data?.cameras ?? []).filter((item) => inBranch(item.branch) && (severity === "all" || severity === "critical" && item.failureProbability >= 70 || severity === "warning" && item.failureProbability >= 40));
  const volumes = (data?.volumes ?? []).filter((item) => inBranch(item.branch) && (severity === "all" || severity === "critical" && item.daysRemaining !== null && item.daysRemaining <= 15 || severity === "warning" && item.daysRemaining !== null && item.daysRemaining <= 45));
  const switches = (data?.switches ?? []).filter((item) => inBranch(item.branch) && (severity === "all" || severity === "critical" && item.linkHealth !== null && item.linkHealth < 70 || severity === "warning" && item.linkHealth !== null && item.linkHealth < 85));
  const recordings = (data?.recordings ?? []).filter((item) => inBranch(item.branch) && (severity === "all" || severity === "critical" && item.gapRiskPct !== null && item.gapRiskPct >= 70 || severity === "warning" && item.gapRiskPct !== null && item.gapRiskPct >= 30));
  const branchRisks = (data?.branches ?? []).filter((item) => inBranch(item.name) && (severity === "all" || severity === "critical" && item.vulnerabilityScore >= 70 || severity === "warning" && item.vulnerabilityScore >= 40));
  const incidents = (data?.incidents ?? []).filter((item) => inBranch(item.branch) && (severity === "all" || severity === "critical" && item.peakRiskPct >= 70 || severity === "warning" && item.peakRiskPct >= 40));
  const kpis = data?.kpis ?? EMPTY_KPIS;

  return (
    <AppLayout>
      {notice && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-2xl ${notice.error ? "border-red-500/40 bg-red-950 text-red-200" : "border-emerald-500/40 bg-slate-900 text-emerald-300"}`}>
          {notice.error ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{notice.message}
        </div>
      )}
      <PageHero
        title="AI Prediction Dashboard"
        eyebrow="LIVE PREDICTIVE OPERATIONS"
        description="Tenant-scoped predictions and operational telemetry with explicit freshness and data-quality status."
        icon={TrendingUp}
        actions={<div className="flex gap-2">
          <button onClick={() => void loadLiveData()} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />Refresh live data
          </button>
          <button onClick={exportReport} disabled={!data} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold disabled:opacity-50">
            <Download className="h-4 w-4" />Export current data
          </button>
        </div>}
      />

      <div className="container mx-auto space-y-6 p-4 sm:p-6">
        {loadError && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{loadError}. No cached or fabricated values are shown.</span>
            <button onClick={() => void loadLiveData()} className="rounded bg-red-500/20 px-3 py-1">Retry</button>
          </div>
        )}
        {isLoading && !data && <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Loading live prediction data…</div>}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/50 p-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Live API</Badge>
              <span>Latest telemetry: {showTime(data.freshness.latestTelemetryAt)}</span><span>•</span>
              <span>{data.freshness.telemetryRecords} telemetry records</span><span>•</span>
              <span>{data.freshness.activePredictions} active predictions</span><span>•</span>
              <span>{data.freshness.predictiveAlerts} predictive alerts</span><span>•</span>
              <span>Generated {showTime(data.generatedAt)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[
                ["Predicted failures", `${kpis.predictedFailuresCount}`, `Within ${data.horizonHours} hours`, Camera, "text-orange-400"],
                ["Fleet health", showNumber(kpis.fleetHealthScore, "%"), kpis.healthScoreDelta ?? "Observed inputs only", Activity, "text-emerald-400"],
                ["Disk exhaustion", kpis.earliestDiskExhaustDays === null ? "Unavailable" : `${kpis.earliestDiskExhaustDays} days`, kpis.earliestDiskExhaustAsset ?? "No capacity forecast", HardDrive, "text-red-400"],
                ["Network health", showNumber(kpis.networkHealthPct, "%"), `${kpis.networkWarningCount} degraded links`, Network, "text-blue-400"],
                ["Highest branch risk", kpis.highestRiskBranch ?? "Unavailable", showNumber(kpis.highestRiskBranchScore, "/100"), Building2, "text-purple-400"],
                ["Peak incident window", kpis.peakIncidentWindow ?? "Unavailable", kpis.peakIncidentCategory ?? "No incident forecast", Zap, "text-amber-400"],
              ].map(([label, value, detail, Icon, color]) => (
                <Card key={String(label)} className="border-border/60 bg-card/60">
                  <CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{String(label)}</span><Icon className={`h-4 w-4 ${color}`} /></div>
                    <div className={`mt-3 truncate text-xl font-bold ${color}`}>{String(value)}</div><div className="mt-1 truncate text-[11px] text-muted-foreground">{String(detail)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-xl border border-border/70 bg-card/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "camera", "storage", "network", "recording", "branch", "incident"] as Domain[]).map((domain) => (
                  <button key={domain} onClick={() => setActiveDomain(domain)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${activeDomain === domain ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}>{domain}</button>
                ))}
                <div className="ml-auto flex flex-wrap gap-2">
                  <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs"><option value="all">All branches</option>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select>
                  <select value={timeHorizon} onChange={(event) => setTimeHorizon(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs"><option value="24h">24 hours</option><option value="48h">48 hours</option><option value="7d">7 days</option><option value="30d">30 days</option></select>
                  <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-xs"><option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning+</option></select>
                </div>
              </div>
            </div>

            {(activeDomain === "all" || activeDomain === "camera") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Camera className="h-5 w-5 text-orange-400" />Camera failure predictions ({cameras.length})</CardTitle><CardDescription>Persisted predictive alerts linked to cameras in the live inventory.</CardDescription></CardHeader><CardContent className="space-y-3">{cameras.length === 0 ? <EmptyState label="camera failure prediction" /> : cameras.map((item) => <div key={item.id} className="flex flex-col justify-between gap-4 rounded-lg border border-border/60 p-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong><Badge variant="outline">{item.branch}</Badge><QualityBadge value={item.dataQuality} /></div><p className="mt-2 text-xs text-muted-foreground">{item.primaryFactor}</p><p className="mt-1 text-xs text-emerald-400">{item.recommendedAction}</p><p className="mt-2 text-[11px] text-muted-foreground">Observed {showTime(item.observedAt)}</p></div><div className="flex items-center gap-4"><div className="text-right"><div className="text-xl font-bold text-orange-400">{item.failureProbability}%</div><div className="text-xs text-muted-foreground">{item.timeToFailureHours === null ? "Failure time unavailable" : `~${item.timeToFailureHours} hours`}</div></div><button disabled={item.dispatched || actionId === item.id} onClick={() => void dispatchWorkOrder(item.id)} className="inline-flex items-center gap-2 rounded-lg bg-orange-500/20 px-3 py-2 text-xs font-semibold text-orange-300 disabled:opacity-60"><Wrench className="h-4 w-4" />{item.dispatched ? item.ticketId ?? "Work order open" : actionId === item.id ? "Creating…" : "Create work order"}</button></div></div>)}</CardContent></Card>}

            {(activeDomain === "all" || activeDomain === "storage") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-5 w-5 text-red-400" />Storage capacity telemetry ({volumes.length})</CardTitle><CardDescription>Capacity and growth fields reported by disk telemetry. Unreported values stay unavailable.</CardDescription></CardHeader><CardContent className="space-y-3">{volumes.length === 0 ? <EmptyState label="storage telemetry" /> : volumes.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border border-border/60 p-4 md:grid-cols-6"><div className="md:col-span-2"><strong>{item.name}</strong><div className="text-xs text-muted-foreground">{item.branch} · {item.tier}</div></div><div><span className="text-xs text-muted-foreground">Capacity</span><div>{showNumber(item.usedTb, " TB")} / {showNumber(item.totalTb, " TB")}</div></div><div><span className="text-xs text-muted-foreground">Daily ingest</span><div>{showNumber(item.dailyIngestGb, " GB")}</div></div><div><span className="text-xs text-muted-foreground">Days remaining</span><div>{showNumber(item.daysRemaining)}</div></div><div><QualityBadge value={item.dataQuality} /><div className="mt-1 text-[10px] text-muted-foreground">{showTime(item.observedAt)}</div></div></div>)}</CardContent></Card>}

            {(activeDomain === "all" || activeDomain === "network") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Network className="h-5 w-5 text-blue-400" />Network health telemetry ({switches.length})</CardTitle><CardDescription>SNMP, system, and vendor-reported link measurements.</CardDescription></CardHeader><CardContent className="space-y-3">{switches.length === 0 ? <EmptyState label="network telemetry" /> : switches.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border border-border/60 p-4 md:grid-cols-6"><div className="md:col-span-2"><strong>{item.model}</strong><div className="text-xs text-muted-foreground">{item.branch} · {item.role}</div></div><div><span className="text-xs text-muted-foreground">Health</span><div>{showNumber(item.linkHealth, "%")}</div></div><div><span className="text-xs text-muted-foreground">Packet loss</span><div>{showNumber(item.packetLossPct, "%")}</div></div><div><span className="text-xs text-muted-foreground">Temperature</span><div>{showNumber(item.tempC, "°C")}</div></div><div><QualityBadge value={item.dataQuality} /><div className="mt-1 text-[10px] text-muted-foreground">{showTime(item.observedAt)}</div></div></div>)}</CardContent></Card>}

            {(activeDomain === "all" || activeDomain === "recording") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Server className="h-5 w-5 text-yellow-400" />Recording continuity telemetry ({recordings.length})</CardTitle><CardDescription>Recorder-channel and archive evidence reported by edge probes.</CardDescription></CardHeader><CardContent className="space-y-3">{recordings.length === 0 ? <EmptyState label="recording continuity telemetry" /> : recordings.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border border-border/60 p-4 md:grid-cols-6"><div className="md:col-span-2"><strong>{item.channelName}</strong><div className="text-xs text-muted-foreground">{item.branch} · {item.nvrId}</div></div><div><span className="text-xs text-muted-foreground">Measured FPS</span><div>{showNumber(item.measuredFps)} / {showNumber(item.targetFps)}</div></div><div><span className="text-xs text-muted-foreground">Gap risk</span><div>{showNumber(item.gapRiskPct, "%")}</div></div><div><span className="text-xs text-muted-foreground">Write queue</span><div>{showNumber(item.writeQueueDepthMs, " ms")}</div></div><div><QualityBadge value={item.dataQuality} /><div className="mt-1 text-[10px] text-muted-foreground">{showTime(item.observedAt)}</div></div></div>)}</CardContent></Card>}

            {(activeDomain === "all" || activeDomain === "branch") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-5 w-5 text-purple-400" />Branch risk predictions ({branchRisks.length})</CardTitle><CardDescription>Latest persisted prediction nearest the selected horizon.</CardDescription></CardHeader><CardContent className="space-y-3">{branchRisks.length === 0 ? <EmptyState label="branch prediction" /> : branchRisks.map((item) => <div key={item.id} className="flex flex-col justify-between gap-4 rounded-lg border border-border/60 p-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong><Badge variant="outline">{item.target.replaceAll("_", " ")}</Badge><QualityBadge value={item.dataQuality} /></div><p className="mt-2 text-xs text-muted-foreground">Primary driver: {item.primaryRiskDriver}</p>{item.recommendedAction && <p className="mt-1 text-xs text-emerald-400">{item.recommendedAction}</p>}<p className="mt-2 text-[11px] text-muted-foreground">Generated {showTime(item.generatedAt)} · expires {showTime(item.expiresAt)}</p></div><div className="text-right"><div className="text-2xl font-bold text-purple-400">{item.vulnerabilityScore}/100</div><div className="text-xs text-muted-foreground">{item.confidence} confidence · {item.horizonHours}h</div></div></div>)}</CardContent></Card>}

            {(activeDomain === "all" || activeDomain === "incident") && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5 text-amber-400" />Security incident forecasts ({incidents.length})</CardTitle><CardDescription>Persisted predictive alerts classified as security or incident risk.</CardDescription></CardHeader><CardContent className="space-y-3">{incidents.length === 0 ? <EmptyState label="security incident forecast" /> : incidents.map((item) => <div key={item.id} className="flex flex-col justify-between gap-4 rounded-lg border border-border/60 p-4 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.category}</strong><Badge variant="outline">{item.hazardLevel}</Badge><Badge variant="outline">{item.branch}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{item.primaryIndicator}</p><p className="mt-1 text-xs text-emerald-400">{item.countermeasure}</p><p className="mt-2 text-[11px] text-muted-foreground">Detected {showTime(item.detectedAt)}</p></div><div className="text-right"><div className="text-2xl font-bold text-amber-400">{item.peakRiskPct}%</div><div className="text-xs text-muted-foreground">{item.peakDay ?? "Day unavailable"} · {item.peakWindow ?? "Window unavailable"}</div></div></div>)}</CardContent></Card>}

            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="h-5 w-5 text-cyan-400" />Prediction provenance</CardTitle><CardDescription>Model metadata is shown only when an active model record exists.</CardDescription></CardHeader><CardContent className="grid gap-4 text-sm md:grid-cols-4"><div><span className="text-xs text-muted-foreground">Model</span><div>{data.modelMetrics ? `${data.modelMetrics.name} ${data.modelMetrics.version}` : "Unavailable"}</div></div><div><span className="text-xs text-muted-foreground">Evaluated accuracy</span><div>{showNumber(data.modelMetrics?.accuracy ?? null, "%")}</div></div><div><span className="text-xs text-muted-foreground">Evaluated outcomes</span><div>{showNumber(data.modelMetrics?.totalSamples ?? null)}</div></div><div><span className="text-xs text-muted-foreground">Last deployed</span><div>{showTime(data.modelMetrics?.lastTrained ?? null)}</div></div></CardContent></Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
