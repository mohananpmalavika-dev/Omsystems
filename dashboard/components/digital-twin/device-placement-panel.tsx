'use client';

/**
 * Device Placement Panel
 * Drag-and-drop device icons onto floor plan
 */

import { useState } from 'react';
import { Camera, Video, DoorOpen, AlertCircle, Thermometer, Zap, Shield, Plus } from 'lucide-react';

interface DevicePlacementPanelProps {
  floorId: string;
  floorImage: HTMLImageElement | null;
  onObjectCreated: () => void;
}

const deviceTypes = [
  { type: 'camera', label: 'Camera', icon: Camera, color: '#22c55e' },
  { type: 'dvr', label: 'DVR', icon: Video, color: '#3b82f6' },
  { type: 'nvr', label: 'NVR', icon: Video, color: '#3b82f6' },
  { type: 'door', label: 'Door', icon: DoorOpen, color: '#8b5cf6' },
  { type: 'panic_button', label: 'Panic Button', icon: AlertCircle, color: '#ef4444' },
  { type: 'fire_sensor', label: 'Fire Sensor', icon: Thermometer, color: '#f97316' },
  { type: 'motion_sensor', label: 'Motion Sensor', icon: Shield, color: '#eab308' },
  { type: 'ups', label: 'UPS', icon: Zap, color: '#10b981' },
];

export default function DevicePlacementPanel({
  floorId,
  floorImage,
  onObjectCreated,
}: DevicePlacementPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [objectName, setObjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateObject = async () => {
    if (!selectedType || !objectName) return;

    setCreating(true);
    try {
      // Create object at center of canvas
      const response = await fetch('/api/digital-twin/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorId,
          objectType: selectedType,
          name: objectName,
          positionX: 0.5,
          positionY: 0.5,
          rotation: 0,
          showStatus: true,
          showLabel: true,
        }),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setObjectName('');
        setSelectedType(null);
        onObjectCreated();
      } else {
        alert('Failed to create object');
      }
    } catch (error) {
      console.error('Failed to create object:', error);
      alert('Failed to create object');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="w-80 bg-white border-l overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Device Library</h3>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {expanded && (
            <div className="space-y-2">
              {deviceTypes.map((device) => {
                const Icon = device.icon;
                return (
                  <button
                    key={device.type}
                    onClick={() => {
                      setSelectedType(device.type);
                      setShowCreateModal(true);
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left"
                  >
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${device.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: device.color }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{device.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2 text-sm">Quick Guide</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Click a device to place it on the plan</li>
              <li>• Drag devices to reposition them</li>
              <li>• Click devices to view status</li>
              <li>• Shift+drag to pan the canvas</li>
              <li>• Scroll to zoom in/out</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Create Object Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Add {deviceTypes.find(d => d.type === selectedType)?.label}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device Name
                </label>
                <input
                  type="text"
                  value={objectName}
                  onChange={(e) => setObjectName(e.target.value)}
                  placeholder="e.g., Main Entrance Camera"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <p className="text-sm text-gray-600">
                The device will be placed at the center. You can drag it to the correct position after creation.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setObjectName('');
                  setSelectedType(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateObject}
                disabled={!objectName || creating}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
