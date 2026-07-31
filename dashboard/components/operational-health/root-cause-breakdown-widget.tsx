"use client";

/**
 * Root Cause Breakdown Widget
 * 30-day pattern analysis showing distribution of root causes
 */

import { useState, useEffect } from "react";
import { PieChart, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

interface RootCauseStat {
  rootCauseType: string;
  incidentCount: number;
  avgConfidence: number;
  affectedCameras: string[];
}

interface RootCauseBreakdownWidgetProps {
  branchId?: string;
  refreshKey: number;
}

export function RootCauseBreakdownWidget({ 
  branchId,
  refreshKey 
}: RootCauseBreakdownWidgetProps) {
  const [stats, setStats] = useState<RootCauseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (branchId) {
      loadBranchStats();
    }
  }, [branchId, refreshKey]);

  const loadBranchStats = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      const response = await fetch(`/api/v1/infrastructure/rca/branch/${branchId}/statistics?days=30`);
      if (!response.ok) throw new Error("Failed to load statistics");
      
      const { data } = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const getRootCauseLabel = (type: string) => {
    const labels: Record<string, string> = {
      'switch_port': 'Switch Port',
      'switch_device': 'Switch Device',
      'ups_power': 'UPS Power',
      'firewall': 'Firewall',
      'network_link': 'Network Link',
      'unknown': 'Unknown'
    };
    return labels[type] || type;
  };

  const getRootCauseColor = (type: string) => {
    const colors: Record<string, string> = {
      'switch_port': '#3b82f6', // blue
      'switch_device': '#8b5cf6', // purple
      'ups_power': '#ef4444', // red
      'firewall': '#f59e0b', // amber
      'network_link': '#10b981', // green
      'unknown': '#6b7280' // gray
    };
    return colors[type] || '#6b7280';
  };

  const totalIncidents = stats.reduce((sum, stat) => sum + stat.incidentCount, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Root Cause Breakdown</CardTitle>
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
          <CardTitle>Root Cause Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!branchId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart size={20} className="text-blue-600" />
            Root Cause Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Select a branch to view root cause analysis</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PieChart size={20} className="text-blue-600" />
            Root Cause Breakdown
          </CardTitle>
          <span className="text-sm text-gray-500">Last 30 days</span>
        </div>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>No incidents in the last 30 days</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pie Chart */}
            <div className="flex items-center justify-center">
              <PieChartVisualization stats={stats} size={180} />
            </div>

            {/* Legend and Details */}
            <div className="space-y-3">
              {stats.map(stat => {
                const percentage = (stat.incidentCount / totalIncidents) * 100;
                return (
                  <div key={stat.rootCauseType}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getRootCauseColor(stat.rootCauseType) }}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {getRootCauseLabel(stat.rootCauseType)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          {stat.incidentCount} incidents
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: getRootCauseColor(stat.rootCauseType)
                        }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{stat.affectedCameras.length} cameras affected</span>
                      <span>{Math.round(stat.avgConfidence * 100)}% avg confidence</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="pt-4 border-t">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{totalIncidents}</div>
                <div className="text-sm text-gray-500">Total Incidents (30 days)</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Pie Chart Visualization
interface PieChartVisualizationProps {
  stats: RootCauseStat[];
  size: number;
}

function PieChartVisualization({ stats, size }: PieChartVisualizationProps) {
  const total = stats.reduce((sum, stat) => sum + stat.incidentCount, 0);
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 10;

  let currentAngle = -90; // Start at top

  return (
    <svg width={size} height={size}>
      {stats.map(stat => {
        const percentage = stat.incidentCount / total;
        const angleSize = percentage * 360;
        const endAngle = currentAngle + angleSize;

        // Calculate arc path
        const startAngleRad = (currentAngle * Math.PI) / 180;
        const endAngleRad = (endAngle * Math.PI) / 180;

        const x1 = centerX + radius * Math.cos(startAngleRad);
        const y1 = centerY + radius * Math.sin(startAngleRad);
        const x2 = centerX + radius * Math.cos(endAngleRad);
        const y2 = centerY + radius * Math.sin(endAngleRad);

        const largeArcFlag = angleSize > 180 ? 1 : 0;

        const pathData = [
          `M ${centerX} ${centerY}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
          'Z'
        ].join(' ');

        const color = getRootCauseColor(stat.rootCauseType);
        currentAngle = endAngle;

        return (
          <path
            key={stat.rootCauseType}
            d={pathData}
            fill={color}
            opacity={0.8}
            stroke="white"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

function getRootCauseColor(type: string) {
  const colors: Record<string, string> = {
    'switch_port': '#3b82f6',
    'switch_device': '#8b5cf6',
    'ups_power': '#ef4444',
    'firewall': '#f59e0b',
    'network_link': '#10b981',
    'unknown': '#6b7280'
  };
  return colors[type] || '#6b7280';
}
