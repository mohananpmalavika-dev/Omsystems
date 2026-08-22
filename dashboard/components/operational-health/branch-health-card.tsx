/**
 * Branch Health Card Component
 * Displays branch health summary
 */

import { Building2, Camera, AlertTriangle, Server } from "lucide-react";
import { BranchHealth, getTimeAgo } from "@/lib/types/operational-health";
import { HealthStatusBadge } from "./health-status-badge";
import { HealthScoreRing } from "./health-score-ring";

interface BranchHealthCardProps {
  branch: BranchHealth;
  onViewDetails?: (branchId: string) => void;
}

export function BranchHealthCard({ branch, onViewDetails }: BranchHealthCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
            <Building2 size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{branch.name}</h4>
            <p className="text-xs text-gray-500">{branch.code} • {branch.region}</p>
          </div>
        </div>
        <HealthStatusBadge status={branch.healthStatus} size="sm" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <HealthScoreRing score={branch.healthScore ?? 0} size={70} strokeWidth={6} />
        
        <div className="flex-1 ml-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1">
              <Camera size={14} />
              Cameras
            </span>
            <span className="font-medium">
              {branch.onlineCameras}/{branch.totalCameras}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Recording</span>
            <span className="font-medium text-green-600">
              {branch.recordingCameras}
            </span>
          </div>
          {branch.criticalAlerts > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 flex items-center gap-1">
                <AlertTriangle size={14} />
                Alerts
              </span>
              <span className="font-medium text-red-600">
                {branch.criticalAlerts}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t text-xs">
        <div className="flex items-center gap-2">
          <Server size={12} className={
            branch.edgeAgentStatus === 'online' ? 'text-green-600' : 'text-red-600'
          } />
          <span className="text-gray-500">
            Agent {branch.edgeAgentStatus}
          </span>
        </div>
        <span className="text-gray-400">
          {getTimeAgo(branch.lastHealthCheck)}
        </span>
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(branch.id)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Details →
          </button>
        )}
      </div>
    </div>
  );
}
