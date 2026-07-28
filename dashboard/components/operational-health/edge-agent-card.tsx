/**
 * Edge Agent Health Card Component
 * Displays edge agent status and resource usage
 */

import { Server, Cpu, HardDrive, Activity, AlertCircle } from "lucide-react";
import { EdgeAgentHealth, getTimeAgo, formatUptime } from "@/lib/types/operational-health";

interface EdgeAgentCardProps {
  agent: EdgeAgentHealth;
  onViewDetails?: (agentId: string) => void;
}

export function EdgeAgentCard({ agent, onViewDetails }: EdgeAgentCardProps) {
  const getResourceColor = (usage: number | null) => {
    if (usage === null) return 'text-gray-500';
    if (usage >= 90) return 'text-red-600';
    if (usage >= 75) return 'text-amber-600';
    return 'text-green-600';
  };

  const getResourceBgColor = (usage: number | null) => {
    if (usage === null) return 'bg-gray-300';
    if (usage >= 90) return 'bg-red-100';
    if (usage >= 75) return 'bg-amber-100';
    return 'bg-green-100';
  };

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            agent.status === 'online' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <Server size={20} className={
              agent.status === 'online' ? 'text-green-600' : 'text-red-600'
            } />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">
              {agent.branchName || 'Edge Agent'}
            </h4>
            <p className="text-xs text-gray-500">
              {agent.branchCode} • v{agent.version}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          agent.status === 'online' 
            ? 'bg-green-100 text-green-700'
            : agent.status === 'warning'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {agent.status}
        </span>
      </div>

      {/* Resource Usage */}
      <div className="space-y-3 mb-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 flex items-center gap-1">
              <Cpu size={12} />
              CPU
            </span>
            <span className={`font-medium ${getResourceColor(agent.cpuUsage)}`}>
              {agent.cpuUsage === null ? '--' : `${agent.cpuUsage.toFixed(1)}%`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${getResourceBgColor(agent.cpuUsage)} transition-all`}
              style={{ width: `${Math.min(agent.cpuUsage ?? 0, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 flex items-center gap-1">
              <Activity size={12} />
              Memory
            </span>
            <span className={`font-medium ${getResourceColor(agent.memoryUsage)}`}>
              {agent.memoryUsage === null ? '--' : `${agent.memoryUsage.toFixed(1)}%`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${getResourceBgColor(agent.memoryUsage)} transition-all`}
              style={{ width: `${Math.min(agent.memoryUsage ?? 0, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 flex items-center gap-1">
              <HardDrive size={12} />
              Disk
            </span>
            <span className={`font-medium ${getResourceColor(agent.diskUsage)}`}>
              {agent.diskUsage === null ? '--' : `${agent.diskUsage.toFixed(1)}%`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${getResourceBgColor(agent.diskUsage)} transition-all`}
              style={{ width: `${Math.min(agent.diskUsage ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        {agent.connectedCameras !== undefined && (
          <div>
            <p className="text-gray-500 mb-0.5">Cameras</p>
            <p className="font-medium">{agent.connectedCameras}</p>
          </div>
        )}
        {agent.recordingCameras !== undefined && (
          <div>
            <p className="text-gray-500 mb-0.5">Recording</p>
            <p className="font-medium text-green-600">{agent.recordingCameras}</p>
          </div>
        )}
        <div>
          <p className="text-gray-500 mb-0.5">Uptime</p>
          <p className="font-medium">{formatUptime(agent.uptimeSeconds)}</p>
        </div>
        {agent.failedRecordingJobs !== undefined && agent.failedRecordingJobs > 0 && (
          <div>
            <p className="text-gray-500 mb-0.5">Failed Jobs</p>
            <p className="font-medium text-red-600">{agent.failedRecordingJobs}</p>
          </div>
        )}
      </div>

      {/* Warnings */}
      {((agent.cpuUsage ?? 0) >= 90 || (agent.memoryUsage ?? 0) >= 90 || (agent.diskUsage ?? 0) >= 90) && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <AlertCircle size={14} className="inline mr-1" />
          High resource usage detected
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t text-xs">
        <span className="text-gray-500">
          Heartbeat: {getTimeAgo(agent.lastHeartbeat)}
        </span>
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(agent.id)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Details →
          </button>
        )}
      </div>
    </div>
  );
}
