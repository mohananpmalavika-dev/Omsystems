'use client';

/**
 * Device Status Overlay
 * Shows device details, live stream, and controls
 */

import { useState } from 'react';
import { X, Video, Settings, Trash2, Activity, AlertTriangle } from 'lucide-react';

interface DeviceStatusOverlayProps {
  object: {
    id: string;
    name: string;
    objectType: string;
    currentStatus?: {
      status: string;
      statusColor: string;
      isOnline: boolean;
      isRecording?: boolean;
      deviceInfo?: any;
    };
  };
  onClose: () => void;
}

export default function DeviceStatusOverlay({ object, onClose }: DeviceStatusOverlayProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'stream' | 'settings'>('status');

  const getStatusText = () => {
    if (!object.currentStatus) return 'No Status';
    const { status, isOnline, isRecording } = object.currentStatus;
    
    if (!isOnline) return 'Offline';
    if (object.objectType === 'camera') {
      return isRecording ? 'Recording' : 'Online (Not Recording)';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusIcon = () => {
    if (!object.currentStatus?.isOnline) {
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
    return <Activity className="w-5 h-5 text-green-500" />;
  };

  return (
    <div className="w-96 bg-white border-l flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-lg">{object.name}</h3>
            <p className="text-sm text-gray-600 capitalize">
              {object.objectType.replace('_', ' ')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-900">{getStatusText()}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === 'status'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Status
        </button>
        {object.objectType === 'camera' && (
          <button
            onClick={() => setActiveTab('stream')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'stream'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Video className="w-4 h-4 inline mr-1" />
            Stream
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === 'settings'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Settings className="w-4 h-4 inline mr-1" />
          Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'status' && (
          <div className="space-y-4">
            {object.currentStatus?.deviceInfo && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700">Connection</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {object.currentStatus.isOnline ? '✓ Connected' : '✗ Disconnected'}
                  </p>
                </div>

                {object.objectType === 'camera' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Recording</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {object.currentStatus.isRecording ? '● Active' : '○ Inactive'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">Resolution</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {object.currentStatus.deviceInfo.resolution || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">Frame Rate</label>
                      <p className="text-sm text-gray-900 mt-1">
                        {object.currentStatus.deviceInfo.fps || 'N/A'} fps
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700">Last Update</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {new Date().toLocaleString()}
                  </p>
                </div>
              </>
            )}

            {!object.currentStatus && (
              <div className="text-center py-8 text-gray-600">
                <p>No device binding configured</p>
                <button className="mt-3 text-blue-600 hover:text-blue-700 text-sm">
                  Link Device
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'stream' && object.objectType === 'camera' && (
          <div>
            <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
              <Video className="w-12 h-12 text-gray-600" />
              <p className="text-gray-400 ml-3">Live stream placeholder</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                View Playback
              </button>
              <button className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                Take Snapshot
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Display Name
              </label>
              <input
                type="text"
                defaultValue={object.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-gray-700">Show status indicator</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-sm text-gray-700">Show device label</span>
              </label>
            </div>

            <div className="pt-4 border-t">
              <button className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" />
                Remove Device
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
