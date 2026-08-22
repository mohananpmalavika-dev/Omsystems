/**
 * Branch Recovery Dashboard Component
 * Comprehensive view for managing offline Edge Agents and Cameras
 */

import { useState, useEffect } from "react";
import { Server, Camera, AlertTriangle, RefreshCw } from "lucide-react";
import { EdgeAgentCard } from "./edge-agent-card";
import { OfflineCamerasPanel } from "./offline-cameras-panel";
import { fetchEdgeAgentsHealth } from "@/lib/api/operational-health";
import { EdgeAgentHealth } from "@/lib/types/operational-health";

interface BranchRecoveryDashboardProps {
  branchId: string;
  branchName: string;
}

export function BranchRecoveryDashboard({
  branchId,
  branchName,
}: BranchRecoveryDashboardProps) {
  const [edgeAgents, setEdgeAgents] = useState<EdgeAgentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadEdgeAgents = async () => {
    try {
      setError(null);
      const agents = await fetchEdgeAgentsHealth({ branchId });
      setEdgeAgents(agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load edge agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEdgeAgents();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadEdgeAgents, 30000);
    return () => clearInterval(interval);
  }, [branchId, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const offlineAgents = edgeAgents.filter(agent => agent.status === 'offline');
  const onlineAgents = edgeAgents.filter(agent => agent.status === 'online');
  const offlineAgentId = offlineAgents.length > 0 ? offlineAgents[0].id : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Branch Recovery</h2>
            <p className="text-sm text-slate-500 mt-1">
              {branchName} • Offline device management
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh Status
          </button>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Server size={18} className="text-slate-600" />
              <span className="text-xs font-semibold text-slate-600">Total Agents</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{edgeAgents.length}</p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Server size={18} className="text-green-600" />
              <span className="text-xs font-semibold text-green-600">Online</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{onlineAgents.length}</p>
          </div>
          
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Server size={18} className="text-red-600" />
              <span className="text-xs font-semibold text-red-600">Offline</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{offlineAgents.length}</p>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Camera size={18} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-600">Offline Cameras</span>
            </div>
            <p className="text-2xl font-bold text-amber-900">
              {edgeAgents.reduce((sum, agent) => sum + ((agent.connectedCameras || 0) - (agent.recordingCameras || 0)), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Error Loading Data</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Offline Edge Agents */}
      {offlineAgents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" />
            <h3 className="text-lg font-bold text-slate-900">
              Offline Edge Agents ({offlineAgents.length})
            </h3>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {offlineAgents.map((agent) => (
              <EdgeAgentCard
                key={agent.id}
                agent={agent}
                onReconnectSuccess={handleRefresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* Online Edge Agents */}
      {onlineAgents.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Server size={20} className="text-green-600" />
            Online Edge Agents ({onlineAgents.length})
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {onlineAgents.map((agent) => (
              <EdgeAgentCard
                key={agent.id}
                agent={agent}
              />
            ))}
          </div>
        </div>
      )}

      {/* Offline Cameras */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Camera size={20} className="text-red-600" />
          Offline Cameras
        </h3>
        
        <OfflineCamerasPanel
          branchId={branchId}
          edgeAgentId={offlineAgentId}
          autoRefresh={true}
        />
      </div>

      {/* Loading State */}
      {loading && edgeAgents.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-slate-400" size={32} />
          <p className="text-sm text-slate-500">Loading recovery dashboard...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && edgeAgents.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Server className="mx-auto mb-4 text-slate-300" size={48} />
          <p className="text-sm font-semibold text-slate-900">No Edge Agents Found</p>
          <p className="text-xs text-slate-500 mt-1">
            This branch doesn't have any Edge Agents configured yet.
          </p>
        </div>
      )}
    </div>
  );
}
