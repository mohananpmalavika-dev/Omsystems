"use client";

import { useState, useEffect } from "react";
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Flame,
  RefreshCw,
} from "lucide-react";

interface CrowdMetrics {
  totalOccupancy: number;
  peakOccupancy: number;
  averageDensity: number;
  densityLevel: "empty" | "sparse" | "normal" | "crowded" | "overcrowded" | "dangerous";
  trend: "increasing" | "stable" | "decreasing";
  changeRate: number; // persons per minute
  timestamp: string;
}

interface CrowdZone {
  zoneId: string;
  zoneName: string;
  personCount: number;
  densityPerSqm: number;
  densityLevel: string;
  occupancyPercentage: number;
  trend: string;
  isBottleneck: boolean;
}

interface CrowdMonitorProps {
  branchId?: string;
  refreshInterval?: number; // milliseconds
  compact?: boolean;
}

export function CrowdMonitor({ 
  branchId, 
  refreshInterval = 5000,
  compact = false 
}: CrowdMonitorProps) {
  const [metrics, setMetrics] = useState<CrowdMetrics>({
    totalOccupancy: 0,
    peakOccupancy: 0,
    averageDensity: 0,
    densityLevel: "empty",
    trend: "stable",
    changeRate: 0,
    timestamp: new Date().toISOString(),
  });
  const [zones, setZones] = useState<CrowdZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchCrowdData = async () => {
    setLoading(true);
    try {
      // Placeholder - will be replaced with actual API call
      // const response = await fetch(`/api/behavioral/crowd-analysis${branchId ? `?branchId=${branchId}` : ''}`);
      // const data = await response.json();
      
      // Mock data for demonstration
      setMetrics({
        totalOccupancy: Math.floor(Math.random() * 100),
        peakOccupancy: Math.floor(Math.random() * 150),
        averageDensity: Math.random() * 2,
        densityLevel: ["empty", "sparse", "normal", "crowded"][Math.floor(Math.random() * 4)] as any,
        trend: ["increasing", "stable", "decreasing"][Math.floor(Math.random() * 3)] as any,
        changeRate: (Math.random() - 0.5) * 10,
        timestamp: new Date().toISOString(),
      });
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch crowd data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrowdData();
    const interval = setInterval(fetchCrowdData, refreshInterval);
    return () => clearInterval(interval);
  }, [branchId, refreshInterval]);

  const getDensityBadge = (level: string) => {
    switch (level) {
      case "dangerous":
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-950/80 text-red-400 border border-red-800 animate-pulse flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            DANGEROUS
          </span>
        );
      case "overcrowded":
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-950/80 text-orange-400 border border-orange-800 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" />
            OVERCROWDED
          </span>
        );
      case "crowded":
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950/80 text-amber-400 border border-amber-800 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            CROWDED
          </span>
        );
      case "normal":
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            NORMAL
          </span>
        );
      case "sparse":
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-950/80 text-blue-400 border border-blue-800">
            SPARSE
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
            EMPTY
          </span>
        );
    }
  };

  const getTrendIcon = () => {
    switch (metrics.trend) {
      case "increasing":
        return <TrendingUp className="w-4 h-4 text-amber-400" />;
      case "decreasing":
        return <TrendingDown className="w-4 h-4 text-blue-400" />;
      default:
        return <Activity className="w-4 h-4 text-zinc-400" />;
    }
  };

  if (compact) {
    return (
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Crowd Monitor</h3>
          </div>
          <button
            onClick={fetchCrowdData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-zinc-500 block mb-1">Current Occupancy</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{metrics.totalOccupancy}</span>
              <span className="text-xs text-zinc-400">persons</span>
            </div>
          </div>

          <div>
            <span className="text-xs text-zinc-500 block mb-1">Density Level</span>
            <div className="mt-1">
              {getDensityBadge(metrics.densityLevel)}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            {getTrendIcon()}
            <span className="capitalize">{metrics.trend}</span>
          </div>
          <span className="text-zinc-500">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Real-Time Crowd Monitor</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchCrowdData}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Current Status Banner */}
      <div className={`p-4 rounded-xl border ${
        metrics.densityLevel === "dangerous" || metrics.densityLevel === "overcrowded"
          ? "bg-red-950/20 border-red-800/60"
          : metrics.densityLevel === "crowded"
          ? "bg-amber-950/20 border-amber-800/60"
          : "bg-emerald-950/20 border-emerald-800/60"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getTrendIcon()}
            <div>
              <h4 className="text-sm font-semibold text-white capitalize">
                {metrics.trend} Crowd Density
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                Change rate: {metrics.changeRate > 0 ? "+" : ""}{metrics.changeRate.toFixed(1)} persons/min
              </p>
            </div>
          </div>
          {getDensityBadge(metrics.densityLevel)}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-800/40 border border-zinc-800 p-4 rounded-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Total Occupancy</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{metrics.totalOccupancy}</span>
            <span className="text-xs text-zinc-400">persons</span>
          </div>
        </div>

        <div className="bg-zinc-800/40 border border-zinc-800 p-4 rounded-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Peak Today</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{metrics.peakOccupancy}</span>
            <span className="text-xs text-zinc-400">persons</span>
          </div>
        </div>

        <div className="bg-zinc-800/40 border border-zinc-800 p-4 rounded-lg">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-medium mb-2">
            <span>Avg Density</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">{metrics.averageDensity.toFixed(1)}</span>
            <span className="text-xs text-zinc-400">p/m²</span>
          </div>
        </div>
      </div>

      {/* Density Gauge */}
      <div>
        <div className="flex justify-between text-xs text-zinc-400 mb-2">
          <span>Current Density Level</span>
          <span className="font-medium text-white capitalize">{metrics.densityLevel}</span>
        </div>
        <div className="relative w-full bg-zinc-800 h-4 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${
              metrics.densityLevel === "dangerous"
                ? "bg-red-500"
                : metrics.densityLevel === "overcrowded"
                ? "bg-orange-500"
                : metrics.densityLevel === "crowded"
                ? "bg-amber-500"
                : metrics.densityLevel === "normal"
                ? "bg-emerald-500"
                : metrics.densityLevel === "sparse"
                ? "bg-blue-500"
                : "bg-zinc-600"
            }`}
            style={{
              width: `${
                metrics.densityLevel === "dangerous" ? 100 :
                metrics.densityLevel === "overcrowded" ? 85 :
                metrics.densityLevel === "crowded" ? 65 :
                metrics.densityLevel === "normal" ? 45 :
                metrics.densityLevel === "sparse" ? 25 : 10
              }%`,
            }}
          />
          {/* Level markers */}
          <div className="absolute inset-0 flex justify-between px-1">
            {[0, 25, 50, 75, 100].map((mark) => (
              <div key={mark} className="w-px h-full bg-zinc-700" />
            ))}
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>Empty</span>
          <span>Sparse</span>
          <span>Normal</span>
          <span>Crowded</span>
          <span>Critical</span>
        </div>
      </div>

      {/* Alert Messages */}
      {(metrics.densityLevel === "dangerous" || metrics.densityLevel === "overcrowded") && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5 animate-pulse" />
          <div>
            <p className="font-semibold mb-1">Critical Crowd Density Alert</p>
            <p className="text-red-200/80">
              Immediate crowd management action required. Consider activating overflow zones or implementing entry controls.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
