/**
 * Offline Cameras Panel Component
 * Displays offline cameras with bulk reconnection actions
 */

import { useState, useEffect } from "react";
import { Camera, AlertTriangle, RefreshCw, Power, CheckCircle2 } from "lucide-react";
import { CameraHealth } from "@/lib/types/operational-health";
import { fetchCamerasHealth } from "@/lib/api/operational-health";
import { ReconnectCamerasModal } from "./reconnect-cameras-modal";
import { reconnectCamera } from "@/lib/api/operational-health";

interface OfflineCamerasPanelProps {
  branchId?: string;
  edgeAgentId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function OfflineCamerasPanel({
  branchId,
  edgeAgentId,
  autoRefresh = true,
  refreshInterval = 30000,
}: OfflineCamerasPanelProps) {
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [reconnectingCamera, setReconnectingCamera] = useState<string | null>(null);

  const loadCameras = async () => {
    try {
      setError(null);
      const filters: any = { status: 'offline', limit: 100, offset: 0 };
      
      if (branchId) {
        filters.branchId = branchId;
      }

      const result = await fetchCamerasHealth(filters);
      setCameras(result.cameras || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cameras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCameras();

    if (autoRefresh) {
      const interval = setInterval(loadCameras, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [branchId, edgeAgentId, autoRefresh, refreshInterval]);

  const handleSelectAll = () => {
    if (selectedCameras.size === cameras.length) {
      setSelectedCameras(new Set());
    } else {
      setSelectedCameras(new Set(cameras.map(c => c.id)));
    }
  };

  const handleSelectCamera = (cameraId: string) => {
    const newSelected = new Set(selectedCameras);
    if (newSelected.has(cameraId)) {
      newSelected.delete(cameraId);
    } else {
      newSelected.add(cameraId);
    }
    setSelectedCameras(newSelected);
  };

  const handleReconnectSingle = async (cameraId: string) => {
    setReconnectingCamera(cameraId);
    try {
      await reconnectCamera(cameraId);
      // Refresh the list after a short delay
      setTimeout(() => {
        loadCameras();
      }, 2000);
    } catch (err) {
      console.error('Failed to reconnect camera:', err);
    } finally {
      setReconnectingCamera(null);
    }
  };

  const handleBulkReconnectSuccess = () => {
    setSelectedCameras(new Set());
    setShowBulkModal(false);
    // Refresh the list after a short delay
    setTimeout(() => {
      loadCameras();
    }, 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <RefreshCw className="animate-spin mx-auto mb-3 text-slate-400" size={24} />
        <p className="text-sm text-slate-500">Loading offline cameras...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-3 text-red-600">
          <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Failed to load cameras</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-green-500" size={32} />
        <p className="text-sm font-semibold text-slate-900">All Cameras Online</p>
        <p className="text-xs text-slate-500 mt-1">No offline cameras detected</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Camera size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-900">
                  Offline Cameras ({cameras.length})
                </h3>
                <p className="text-xs text-red-700">
                  Cameras requiring attention
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadCameras}
                className="p-2 hover:bg-red-100 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw size={16} className="text-red-700" />
              </button>
              {selectedCameras.size > 0 && (
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 flex items-center gap-1"
                >
                  <Power size={14} />
                  Reconnect ({selectedCameras.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {cameras.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCameras.size === cameras.length}
                onChange={handleSelectAll}
                className="rounded border-slate-300"
              />
              Select all cameras
            </label>
            <button
              onClick={() => setShowBulkModal(true)}
              disabled={cameras.length === 0}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Power size={14} />
              Reconnect All
            </button>
          </div>
        )}

        {/* Camera List */}
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {cameras.map((camera) => (
            <div
              key={camera.id}
              className="px-6 py-3 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedCameras.has(camera.id)}
                  onChange={() => handleSelectCamera(camera.id)}
                  className="rounded border-slate-300"
                />
                
                <Camera size={16} className="text-slate-400" />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {camera.name}
                    </p>
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                      Offline
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {camera.branchName} • {camera.ipAddress || 'IP not available'}
                    {camera.lastHeartbeat && ` • Last seen: ${new Date(camera.lastHeartbeat).toLocaleString()}`}
                  </p>
                </div>

                <button
                  onClick={() => handleReconnectSingle(camera.id)}
                  disabled={reconnectingCamera === camera.id}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {reconnectingCamera === camera.id ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <Power size={12} />
                      Reconnect
                    </>
                  )}
                </button>
              </div>

              {camera.recoveryStatus === 'pending' && (
                <div className="mt-2 ml-8 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  <RefreshCw size={10} className="inline mr-1 animate-spin" />
                  Recovery in progress...
                </div>
              )}

              {camera.recoveryStatus === 'failed' && (
                <div className="mt-2 ml-8 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                  <AlertTriangle size={10} className="inline mr-1" />
                  Recovery failed - manual intervention may be required
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bulk Reconnect Modal */}
      <ReconnectCamerasModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        branchId={branchId}
        edgeAgentId={edgeAgentId}
        offlineCameraCount={selectedCameras.size > 0 ? selectedCameras.size : cameras.length}
        onSuccess={handleBulkReconnectSuccess}
      />
    </>
  );
}
