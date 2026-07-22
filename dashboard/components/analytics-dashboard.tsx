"use client";

/**
 * Analytics Dashboard
 * Displays metrics, trends, heat maps, and operational intelligence
 */

import {
  Activity, BarChart3, Clock, Eye, Footprints, MapPin, TrendingDown,
  TrendingUp, Users, Calendar, Download, RefreshCw, AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { analyticsApi, cameraInventoryApi } from "@/lib/api-client";
import type { Branch, Camera } from "@/lib/types";

interface MetricsSummary {
  totalAlerts: number;
  criticalAlerts: number;
  resolvedAlerts: number;
  totalFootfall: number;
  averageDwellTime: number;
  activeRules: number;
}

interface FootfallData {
  bucket_at: string;
  entries: number;
  exits: number;
  total_crossings: number;
}

interface DwellTimeData {
  bucket_at: string;
  average_seconds: number;
  maximum_seconds: number;
  sample_count: number;
  zone_name?: string;
}

interface QueueData {
  bucket_at: string;
  average_count: number;
  maximum_count: number;
  zone_name?: string;
}

export function AnalyticsDashboard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [footfallData, setFootfallData] = useState<FootfallData[]>([]);
  const [dwellData, setDwellData] = useState<DwellTimeData[]>([]);
  const [queueData, setQueueData] = useState<QueueData[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        setBranches(data as Branch[]);
        if (data.length > 0) setSelectedBranch(data[0]!.id);
      })
      .catch((err) => setError(readable(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) return;
    void cameraInventoryApi.listByBranch(selectedBranch, "analytics:view")
      .then(({ data }) => {
        setCameras(data as Camera[]);
        if (data.length > 0) setSelectedCamera(data[0]!.id);
      })
      .catch((err) => setError(readable(err)));
  }, [selectedBranch]);

  useEffect(() => {
    if (!selectedBranch) return;
    loadDashboardData();
  }, [selectedBranch, timeRange]);

  useEffect(() => {
    if (!selectedCamera) return;
    loadCameraMetrics();
  }, [selectedCamera, timeRange]);

  const loadDashboardData = async () => {
    if (!selectedBranch) return;
    setLoading(true);
    setError(undefined);

    try {
      const { from, to } = getTimeRange(timeRange);
      const response = await fetch(
        `/api/v1/branches/${selectedBranch}/analytics/summary?from=${from}&to=${to}`,
      );
      if (!response.ok) throw new Error("Failed to load analytics summary");
      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(readable(err));
    } finally {
      setLoading(false);
    }
  };

  const loadCameraMetrics = async () => {
    if (!selectedCamera) return;
    setLoading(true);

    try {
      const { from, to } = getTimeRange(timeRange);

      const [footfallRes, dwellRes, queueRes] = await Promise.all([
        fetch(
          `/api/v1/cameras/${selectedCamera}/analytics/footfall?from=${from}&to=${to}&interval=hour`,
        ),
        fetch(
          `/api/v1/cameras/${selectedCamera}/analytics/dwell-time?from=${from}&to=${to}&interval=hour`,
        ),
        fetch(
          `/api/v1/cameras/${selectedCamera}/analytics/queue?from=${from}&to=${to}&interval=hour`,
        ),
      ]);

      if (footfallRes.ok) {
        const footfall = await footfallRes.json();
        setFootfallData(footfall.data || []);
      }

      if (dwellRes.ok) {
        const dwell = await dwellRes.json();
        setDwellData(dwell.data || []);
      }

      if (queueRes.ok) {
        const queue = await queueRes.json();
        setQueueData(queue.data || []);
      }
    } catch (err) {
      setError(readable(err));
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    // TODO: Implement CSV/PDF export
    alert("Export functionality coming soon");
  };

  return (
    <div className="analytics-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Analytics Dashboard</h1>
          <p>Operational intelligence and customer insights</p>
        </div>
        <div className="dashboard-controls">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            aria-label="Select branch"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            aria-label="Select time range"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button onClick={() => void loadDashboardData()} title="Refresh data">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => void exportReport()} title="Export report">
            <Download size={16} /> Export
          </button>
        </div>
      </header>

      {error && (
        <div className="dashboard-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="dashboard-loading">
          <RefreshCw size={24} className="spin" />
          Loading analytics...
        </div>
      ) : summary ? (
        <>
          <section className="metrics-grid">
            <MetricCard
              icon={<Activity />}
              label="Total Alerts"
              value={summary.totalAlerts}
              color="blue"
            />
            <MetricCard
              icon={<AlertTriangle />}
              label="Critical Alerts"
              value={summary.criticalAlerts}
              color="red"
            />
            <MetricCard
              icon={<Footprints />}
              label="Total Footfall"
              value={summary.totalFootfall}
              color="green"
            />
            <MetricCard
              icon={<Clock />}
              label="Avg Dwell Time"
              value={`${Math.round(summary.averageDwellTime)}s`}
              color="purple"
            />
            <MetricCard
              icon={<Eye />}
              label="Active Rules"
              value={summary.activeRules}
              color="indigo"
            />
            <MetricCard
              icon={<BarChart3 />}
              label="Resolved Alerts"
              value={summary.resolvedAlerts}
              color="teal"
            />
          </section>

          {selectedCamera && (
            <>
              <section className="camera-metrics">
                <h2>Camera Metrics: {cameras.find((c) => c.id === selectedCamera)?.name}</h2>
                
                {footfallData.length > 0 && (
                  <div className="metric-chart">
                    <h3>
                      <Footprints size={18} />
                      Footfall Analysis
                    </h3>
                    <div className="chart-container">
                      <SimpleBarChart
                        data={footfallData.map((d) => ({
                          label: formatTime(d.bucket_at),
                          entries: d.entries,
                          exits: d.exits,
                        }))}
                      />
                    </div>
                    <div className="chart-summary">
                      <span>
                        Total Entries: {footfallData.reduce((sum, d) => sum + d.entries, 0)}
                      </span>
                      <span>
                        Total Exits: {footfallData.reduce((sum, d) => sum + d.exits, 0)}
                      </span>
                    </div>
                  </div>
                )}

                {dwellData.length > 0 && (
                  <div className="metric-chart">
                    <h3>
                      <Clock size={18} />
                      Dwell Time Analysis
                    </h3>
                    <div className="chart-container">
                      <SimpleLineChart
                        data={dwellData.map((d) => ({
                          label: formatTime(d.bucket_at),
                          value: Number(d.average_seconds),
                        }))}
                        color="purple"
                      />
                    </div>
                    <div className="chart-summary">
                      <span>
                        Average: {Math.round(
                          dwellData.reduce((sum, d) => sum + Number(d.average_seconds), 0) /
                          dwellData.length
                        )}s
                      </span>
                      <span>
                        Maximum: {Math.max(...dwellData.map((d) => Number(d.maximum_seconds)))}s
                      </span>
                    </div>
                  </div>
                )}

                {queueData.length > 0 && (
                  <div className="metric-chart">
                    <h3>
                      <Users size={18} />
                      Queue Analysis
                    </h3>
                    <div className="chart-container">
                      <SimpleLineChart
                        data={queueData.map((d) => ({
                          label: formatTime(d.bucket_at),
                          value: Number(d.average_count),
                        }))}
                        color="orange"
                      />
                    </div>
                    <div className="chart-summary">
                      <span>
                        Average: {(
                          queueData.reduce((sum, d) => sum + Number(d.average_count), 0) /
                          queueData.length
                        ).toFixed(1)}
                      </span>
                      <span>
                        Maximum: {Math.max(...queueData.map((d) => d.maximum_count))}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className={`metric-card ${color}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}

function SimpleBarChart({
  data,
}: {
  data: Array<{ label: string; entries: number; exits: number }>;
}) {
  const maxValue = Math.max(
    ...data.flatMap((d) => [d.entries, d.exits]),
    1,
  );

  return (
    <div className="simple-bar-chart">
      {data.map((item, index) => (
        <div key={index} className="bar-group">
          <div className="bars">
            <div
              className="bar entries"
              style={{ height: `${(item.entries / maxValue) * 100}%` }}
              title={`Entries: ${item.entries}`}
            />
            <div
              className="bar exits"
              style={{ height: `${(item.exits / maxValue) * 100}%` }}
              title={`Exits: ${item.exits}`}
            />
          </div>
          <div className="bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function SimpleLineChart({
  data,
  color,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="simple-line-chart">
      <svg viewBox="0 0 400 200" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={`var(--${color})`}
          strokeWidth="2"
          points={data
            .map((item, index) => {
              const x = (index / (data.length - 1)) * 400;
              const y = 200 - (item.value / maxValue) * 180;
              return `${x},${y}`;
            })
            .join(" ")}
        />
        {data.map((item, index) => {
          const x = (index / (data.length - 1)) * 400;
          const y = 200 - (item.value / maxValue) * 180;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              fill={`var(--${color})`}
            />
          );
        })}
      </svg>
      <div className="chart-labels">
        {data.map((item, index) => (
          <span key={index}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}

function getTimeRange(range: string): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  switch (range) {
    case "24h":
      from.setHours(from.getHours() - 24);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function readable(error: unknown): string {
  return error instanceof Error ? error.message : "An error occurred";
}
