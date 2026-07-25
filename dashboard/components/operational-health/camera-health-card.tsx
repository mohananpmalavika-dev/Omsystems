/**
 * Camera Health Card Component
 * Displays detailed camera health information
 */

import { Camera, Activity, AlertCircle, Wifi } from "lucide-react";
import { CameraHealth, getTimeAgo } from "@/lib/types/operational-health";
import { HealthStatusBadge } from "./health-status-badge";

interface CameraHealthCardProps {
  camera: CameraHealth;
  onViewDetails?: (cameraId: string) => void;
}

export function CameraHealthCard({ camera, onViewDetails }: CameraHealthCardProps) {
  const healthStatus = camera.healthScore >= 80 ? 'healthy' : 
                       camera.healthScore >= 50 ? 'warning' : 'critical';

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            camera.onlineStatus === 'online' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <Camera size={20} className={
              camera.onlineStatus === 'online' ? 'text-green-600' : 'text-red-600'
            } />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{camera.name}</h4>
            <p className="text-xs text-gray-500">{camera.branchName}</p>
          </div>
        </div>
        <HealthStatusBadge status={healthStatus} size="sm" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Status</p>
          <p className="text-sm font-medium flex items-center gap-1">
            <span className={camera.onlineStatus === 'online' ? 'text-green-600' : 'text-red-600'}>
              ●
            </span>
            {camera.onlineStatus}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Recording</p>
          <p className="text-sm font-medium flex items-center gap-1">
            {camera.recordingStatus === 'healthy' ? (
              <Activity size={14} className="text-green-600" />
            ) : (
              <AlertCircle size={14} className="text-red-600" />
            )}
            {camera.recordingStatus}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">FPS</p>
          <p className="text-sm font-medium">
            {camera.currentFps} / {camera.expectedFps}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Latency</p>
          <p className="text-sm font-medium">{camera.latencyMs}ms</p>
        </div>
      </div>

      {(camera.videoLoss || camera.tamperingDetected || camera.imageFrozen) && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle size={14} className="inline mr-1" />
          {camera.videoLoss && 'Video loss detected. '}
          {camera.tamperingDetected && 'Tampering detected. '}
          {camera.imageFrozen && 'Image frozen. '}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t">
        <span className="text-xs text-gray-500">
          <Wifi size={12} className="inline mr-1" />
          {getTimeAgo(camera.lastHeartbeat)}
        </span>
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(camera.id)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View details →
          </button>
        )}
      </div>
    </div>
  );
}
