/**
 * Reconnect Cameras Modal Component
 * Allows bulk reconnection of offline cameras for a branch or edge agent
 */

import { useState } from "react";
import { X, Camera, RefreshCw, AlertCircle, CheckCircle2, Power } from "lucide-react";
import { bringCamerasOnline } from "@/lib/api/operational-health";

interface ReconnectCamerasModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId?: string;
  branchName?: string;
  edgeAgentId?: string;
  offlineCameraCount?: number;
  onSuccess?: () => void;
}

export function ReconnectCamerasModal({
  isOpen,
  onClose,
  branchId,
  branchName,
  edgeAgentId,
  offlineCameraCount = 0,
  onSuccess,
}: ReconnectCamerasModalProps) {
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<{
    camerasAffected: number;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleReconnect = async () => {
    setReconnecting(true);
    setError(null);
    setSuccess(false);

    try {
      const params: { branchId?: string; edgeAgentId?: string } = {};
      
      if (edgeAgentId) {
        params.edgeAgentId = edgeAgentId;
      } else if (branchId) {
        params.branchId = branchId;
      }

      const reconnectResult = await bringCamerasOnline(params);
      setResult(reconnectResult);
      setSuccess(true);

      // Auto-close after success
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconnect cameras');
    } finally {
      setReconnecting(false);
    }
  };

  const handleClose = () => {
    if (!reconnecting) {
      setError(null);
      setSuccess(false);
      setResult(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Camera size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reconnect Cameras</h2>
              <p className="text-xs text-slate-500">
                {branchName || 'Offline cameras'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={reconnecting}
            className="p-1 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {!success && !error && (
            <>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Bulk Camera Recovery
                    </p>
                    <p className="text-xs text-blue-700">
                      This will attempt to restore connectivity for all offline cameras
                      {branchName ? ` in ${branchName}` : ''}.
                      {offlineCameraCount > 0 && ` Approximately ${offlineCameraCount} camera${offlineCameraCount !== 1 ? 's' : ''} will be affected.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p>Sends recovery commands to offline cameras</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p>Attempts to restore RTSP stream connections</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p>Re-enables recording and AI detection</p>
                </div>
              </div>
            </>
          )}

          {success && result && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={24} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-900 mb-1">
                    Reconnection Initiated
                  </p>
                  <p className="text-xs text-green-700">
                    {result.message}
                  </p>
                  <p className="text-xs text-green-600 mt-2">
                    Recovery commands sent to {result.camerasAffected} camera{result.camerasAffected !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle size={24} className="text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-900 mb-1">
                    Reconnection Failed
                  </p>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={reconnecting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {reconnecting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Reconnecting...
                </>
              ) : (
                <>
                  <Power size={16} />
                  Reconnect Cameras
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
