/**
 * Camera Health Card Component
 * Displays detailed camera health information with quality metrics
 */

import { Camera, Activity, AlertCircle, Wifi, TrendingDown, TrendingUp, Signal, RefreshCw } from "lucide-react";
import { CameraHealth, getTimeAgo } from "@/lib/types/operational-health";
import { HealthStatusBadge } from "./health-status-badge";

interface CameraHealthCardProps {
  camera: CameraHealth;
  onViewDetails?: (cameraId: string) => void;
  showQualityMetrics?: boolean;
  showRecoveryStatus?: boolean;
  onTriggerRecovery?: (cameraId: string) => void;
}

export function CameraHealthCard({ 
  camera, 
  onViewDetails,
  showQualityMetrics = true,
  showRecoveryStatus = false,
  onTriggerRecovery 
}: CameraHealthCardProps) {
  const healthStatus = camera.healthScore >= 80 ? 'healthy' : 
                       camera.healthScore >= 50 ? 'warning' : 'critical';

  // Calculate quality indicators
  const fpsQuality = camera.currentFps >= camera.expectedFps * 0.9 ? 'good' :
                     camera.currentFps >= camera.expectedFps * 0.7 ? 'warning' : 'poor';
  
  const latencyQuality = camera.latencyMs <= 100 ? 'good' :
                         camera.latencyMs <= 200 ? 'warning' : 'poor';

  const hasQualityIssues = camera.videoLoss || 
                           camera.tamperingDetected || 
                           camera.imageFrozen ||
                           fpsQuality === 'poor' ||
                           latencyQuality === 'poor';

  const isOfflineOrDegraded = camera.onlineStatus === 'offline' || 
                              camera.onlineStatus === 'degraded';

  return (
    <div className="card hover:shadow-md transition-shadow relative overflow-hidden">
      {/* Quality indicator stripe */}
      {hasQualityIssues && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500" />
      )}

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            camera.onlineStatus === 'online' ? 'bg-green-100' : 
            camera.onlineStatus === 'offline' ? 'bg-red-100' :
            camera.onlineStatus === 'warning' ? 'bg-yellow-100' :
            'bg-orange-100'
          }`}>
            <Camera size={20} className={
              camera.onlineStatus === 'online' ? 'text-green-600' : 
              camera.onlineStatus === 'offline' ? 'text-red-600' :
              camera.onlineStatus === 'warning' ? 'text-yellow-600' :
              'text-orange-600'
            } />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{camera.name}</h4>
            <p className="text-xs text-gray-500 truncate">{camera.branchName}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <HealthStatusBadge status={healthStatus} size="sm" />
          {camera.healthScore > 0 && (
            <span className="text-xs text-gray-500">{camera.healthScore}/100</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Status</p>
          <p className="text-sm font-medium flex items-center gap-1">
            <span className={
              camera.onlineStatus === 'online' ? 'text-green-600' : 
              camera.onlineStatus === 'offline' ? 'text-red-600' :
              camera.onlineStatus === 'warning' ? 'text-yellow-600' :
              'text-orange-600'
            }>
              ●
            </span>
            <span className="capitalize">{camera.onlineStatus}</span>
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
        
        {showQualityMetrics && (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-1">FPS</p>
              <div className="flex items-center gap-1">
                <p className={`text-sm font-medium ${
                  fpsQuality === 'good' ? 'text-green-600' :
                  fpsQuality === 'warning' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {camera.currentFps?.toFixed(1) || '--'}
                </p>
                <span className="text-xs text-gray-400">/ {camera.expectedFps}</span>
                {fpsQuality === 'good' ? (
                  <TrendingUp size={12} className="text-green-600" />
                ) : fpsQuality === 'poor' ? (
                  <TrendingDown size={12} className="text-red-600" />
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Latency</p>
              <div className="flex items-center gap-1">
                <p className={`text-sm font-medium ${
                  latencyQuality === 'good' ? 'text-green-600' :
                  latencyQuality === 'warning' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {camera.latencyMs || '--'}ms
                </p>
                <Signal size={12} className={
                  latencyQuality === 'good' ? 'text-green-600' :
                  latencyQuality === 'warning' ? 'text-yellow-600' :
                  'text-red-600'
                } />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Alert Messages */}
      {(camera.videoLoss || camera.tamperingDetected || camera.imageFrozen) && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 space-y-0.5">
              {camera.videoLoss && <div>• Video loss detected</div>}
              {camera.tamperingDetected && <div>• Tampering detected</div>}
              {camera.imageFrozen && <div>• Image frozen</div>}
            </div>
          </div>
        </div>
      )}

      {/* Recovery Status */}
      {showRecoveryStatus && isOfflineOrDegraded && (
        <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-orange-600" />
              <span className="text-xs text-orange-700">Recovery available</span>
            </div>
            {onTriggerRecovery && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTriggerRecovery(camera.id);
                }}
                className="text-xs px-2 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
              >
                Recover
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Wifi size={12} className={camera.onlineStatus === 'online' ? 'text-green-600' : 'text-gray-400'} />
          {getTimeAgo(camera.lastHeartbeat)}
        </span>
        {onViewDetails && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onViewDetails(camera.id);
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View details →
          </button>
        )}
      </div>
    </div>
  );
}
