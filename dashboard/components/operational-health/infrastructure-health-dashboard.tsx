"use client";

/**
 * Infrastructure Health Dashboard
 * Executive dashboard displaying infrastructure monitoring across all branches
 * 
 * Widgets:
 * 1. Infrastructure Health Score - 7-domain donut chart
 * 2. Active Infrastructure Incidents - Critical alerts with RCA
 * 3. Root Cause Breakdown - 30-day pattern analysis
 * 4. Predicted Failures - Maintenance scheduling
 * 5. Infrastructure Path Visualization - Camera dependencies
 */

import { useState, useEffect } from "react";
import { Activity, AlertTriangle, Server, Zap, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { InfrastructureHealthScoreWidget } from "./infrastructure-health-score-widget";
import { ActiveInfrastructureIncidentsWidget } from "./active-infrastructure-incidents-widget";
import { RootCauseBreakdownWidget } from "./root-cause-breakdown-widget";
import { PredictedFailuresWidget } from "./predicted-failures-widget";
import { InfrastructurePathVisualization } from "./infrastructure-path-visualization";

interface Branch {
  id: string;
  name: string;
  code: string;
}

export function InfrastructureHealthDashboard() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/branches");
      if (!response.ok) throw new Error("Failed to load branches");
      
      const { data } = await response.json();
      setBranches(data);
      
      if (data.length > 0) {
        setSelectedBranch(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <h1 className="sr-only">Operational health</h1>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Server className="text-blue-600" size={32} />
            Infrastructure Monitoring
          </h1>
          <p className="text-gray-600 mt-1">
            Real-time infrastructure health across all branches
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Branch Selector */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Branches</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top Row: Health Score + Active Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Widget 1: Infrastructure Health Score */}
        <InfrastructureHealthScoreWidget 
          branchId={selectedBranch}
          refreshKey={refreshKey}
        />

        {/* Widget 2: Active Infrastructure Incidents */}
        <ActiveInfrastructureIncidentsWidget 
          branchId={selectedBranch}
          refreshKey={refreshKey}
        />
      </div>

      {/* Middle Row: Root Cause Breakdown + Predicted Failures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Widget 3: Root Cause Breakdown */}
        <RootCauseBreakdownWidget 
          branchId={selectedBranch}
          refreshKey={refreshKey}
        />

        {/* Widget 4: Predicted Failures */}
        <PredictedFailuresWidget 
          branchId={selectedBranch}
          refreshKey={refreshKey}
        />
      </div>

      {/* Bottom Row: Infrastructure Path Visualization */}
      <InfrastructurePathVisualization 
        branchId={selectedBranch}
        refreshKey={refreshKey}
      />
    </div>
  );
}
