"use client";

/**
 * Infrastructure Health Score Widget
 * Displays overall health score with 7-domain breakdown in donut chart
 */

import { useState, useEffect } from "react";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

interface DomainScore {
  name: string;
  score: number | null;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  weight: number;
  color: string;
}

interface HealthData {
  branchId: string;
  branchName: string;
  overallScore: number | null;
  overallStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  evidenceCoveragePercent: number;
  domains: {
    power: DomainScore;
    network: DomainScore;
    compute: DomainScore;
    storage: DomainScore;
    cooling: DomainScore;
    security: DomainScore;
    surveillance: DomainScore;
  };
  criticalIssues: number;
  warningIssues: number;
  predictedFailures: number;
  lastUpdated: string;
}

interface InfrastructureHealthScoreWidgetProps {
  branchId?: string;
  refreshKey: number;
}

export function InfrastructureHealthScoreWidget({ 
  branchId,
  refreshKey 
}: InfrastructureHealthScoreWidgetProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (branchId) {
      loadHealthScore();
    } else {
      loadTenantSummary();
    }
  }, [branchId, refreshKey]);

  const getHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["x-sentinel-session"] = token;
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  const loadHealthScore = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const response = await fetch(`/api/control/v1/infrastructure/health/${branchId}`, {
        cache: "no-store",
        credentials: "include",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to load health score");
      
      const { data } = await response.json();
      setHealth(transformHealthData(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health score");
    } finally {
      setLoading(false);
    }
  };

  const loadTenantSummary = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const response = await fetch("/api/control/v1/infrastructure/health/tenant/summary", {
        cache: "no-store",
        credentials: "include",
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to load tenant summary");
      
      const { data } = await response.json();
      setHealth(transformTenantSummary(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenant summary");
    } finally {
      setLoading(false);
    }
  };

  const transformHealthData = (data: any): HealthData => {
    return {
      branchId: data.branchId,
      branchName: data.branchName,
      overallScore: data.overallScore,
      overallStatus: data.overallStatus,
      evidenceCoveragePercent: data.evidenceCoveragePercent ?? 0,
      domains: {
        power: {
          name: "Power",
          score: data.domains.power.score,
          status: data.domains.power.status,
          weight: 20,
          color: "#3b82f6" // blue
        },
        network: {
          name: "Network",
          score: data.domains.network.score,
          status: data.domains.network.status,
          weight: 25,
          color: "#10b981" // green
        },
        compute: {
          name: "Compute",
          score: data.domains.compute.score,
          status: data.domains.compute.status,
          weight: 15,
          color: "#8b5cf6" // purple
        },
        storage: {
          name: "Storage",
          score: data.domains.storage.score,
          status: data.domains.storage.status,
          weight: 15,
          color: "#f59e0b" // amber
        },
        cooling: {
          name: "Cooling",
          score: data.domains.cooling.score,
          status: data.domains.cooling.status,
          weight: 10,
          color: "#06b6d4" // cyan
        },
        security: {
          name: "Security",
          score: data.domains.security.score,
          status: data.domains.security.status,
          weight: 10,
          color: "#ef4444" // red
        },
        surveillance: {
          name: "Surveillance",
          score: data.domains.surveillance.score,
          status: data.domains.surveillance.status,
          weight: 5,
          color: "#6366f1" // indigo
        }
      },
      criticalIssues: data.criticalIssues,
      warningIssues: data.warningIssues,
      predictedFailures: data.predictedFailures,
      lastUpdated: data.lastUpdated
    };
  };

  const transformTenantSummary = (data: any): HealthData => {
    return {
      branchId: "",
      branchName: "All Branches",
      overallScore: data.averageScore,
      overallStatus: statusForScore(data.averageScore),
      evidenceCoveragePercent: data.evidenceCoveragePercent ?? 0,
      domains: {
        power: {
          name: "Power",
          score: data.domainAverages.power,
          status: statusForScore(data.domainAverages.power),
          weight: 20,
          color: "#3b82f6"
        },
        network: {
          name: "Network",
          score: data.domainAverages.network,
          status: statusForScore(data.domainAverages.network),
          weight: 25,
          color: "#10b981"
        },
        compute: {
          name: "Compute",
          score: data.domainAverages.compute,
          status: statusForScore(data.domainAverages.compute),
          weight: 15,
          color: "#8b5cf6"
        },
        storage: {
          name: "Storage",
          score: data.domainAverages.storage,
          status: statusForScore(data.domainAverages.storage),
          weight: 15,
          color: "#f59e0b"
        },
        cooling: {
          name: "Cooling",
          score: data.domainAverages.cooling,
          status: statusForScore(data.domainAverages.cooling),
          weight: 10,
          color: "#06b6d4"
        },
        security: {
          name: "Security",
          score: data.domainAverages.security,
          status: statusForScore(data.domainAverages.security),
          weight: 10,
          color: "#ef4444"
        },
        surveillance: {
          name: "Surveillance",
          score: data.domainAverages.surveillance,
          status: statusForScore(data.domainAverages.surveillance),
          weight: 5,
          color: "#6366f1"
        }
      },
      criticalIssues: data.totalCriticalAlerts,
      warningIssues: data.totalWarningAlerts,
      predictedFailures: data.predictedFailuresCount,
      lastUpdated: data.lastUpdated
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-amber-600 bg-amber-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return '#64748b';
    if (score >= 90) return '#10b981'; // green
    if (score >= 70) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity size={20} className="text-blue-600" />
            Infrastructure Health Score
          </CardTitle>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(health.overallStatus)}`}>
            {health.overallStatus.toUpperCase()}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          {/* Donut Chart */}
          <div className="relative">
            <DonutChart 
              domains={Object.values(health.domains)}
              size={200}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span 
                className="text-4xl font-bold"
                style={{ color: getScoreColor(health.overallScore) }}
              >
                {health.overallScore === null ? "N/A" : Math.round(health.overallScore)}
              </span>
              <span className="text-sm text-gray-500">Overall</span>
            </div>
          </div>

          {/* Domain Breakdown */}
          <div className="flex-1 space-y-2">
            {Object.values(health.domains).map(domain => (
              <div key={domain.name} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: domain.color }}
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-gray-700">{domain.name}</span>
                  <span className="text-sm font-medium" style={{ color: getScoreColor(domain.score) }}>
                    {domain.score === null ? "N/A" : domain.score}
                  </span>
                </div>
                <span className="text-xs text-gray-400 w-12 text-right">
                  {domain.weight}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{health.criticalIssues}</div>
            <div className="text-xs text-gray-500">Critical Issues</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{health.warningIssues}</div>
            <div className="text-xs text-gray-500">Warnings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{health.predictedFailures}</div>
            <div className="text-xs text-gray-500">Predicted Failures</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center">
          Evidence coverage: {Math.round(health.evidenceCoveragePercent)}% · Last updated: {new Date(health.lastUpdated).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

// Donut Chart Component
interface DonutChartProps {
  domains: DomainScore[];
  size: number;
}

function DonutChart({ domains, size }: DonutChartProps) {
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Sort by weight to ensure proper rendering
  const sortedDomains = [...domains].sort((a, b) => b.weight - a.weight);
  
  let accumulatedPercentage = 0;
  
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
        fill="none"
      />
      
      {/* Domain segments */}
      {sortedDomains.map((domain) => {
        const percentage = domain.weight / 100;
        const segmentLength = circumference * percentage;
        const offset = circumference - accumulatedPercentage * circumference - segmentLength;
        
        accumulatedPercentage += percentage;
        
        return (
          <circle
            key={domain.name}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={domain.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            opacity={domain.score === null ? 0.12 : Math.max(0.2, domain.score / 100)}
          />
        );
      })}
    </svg>
  );
}

function statusForScore(score: number | null | undefined): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unknown";
  return score >= 90 ? "healthy" : score >= 70 ? "warning" : "critical";
}
