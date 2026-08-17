"use client";

import React, { useEffect, useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";

interface Device {
  id: string;
  deviceId: string;
  tenant: string;
  region: string;
  branch: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  ipAddress?: string;
  healthStatus: string;
  lifecycleState: string;
  capabilities?: string[];
}

interface DeviceSelectorProps {
  branchId?: string;
  value: Device | null;
  onChange: (device: Device | null) => void;
  className?: string;
}

export function DeviceSelector({ branchId, value, onChange, className }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) {
      setDevices([]);
      return;
    }

    setLoading(true);
    setError(null);
    
    deviceManagementApi.listDevices(branchId, { limit: 100 })
      .then(res => setDevices(res.data || []))
      .catch(err => setError(err.message || 'Failed to load devices'))
      .finally(() => setLoading(false));
  }, [branchId]);

  const filteredDevices = devices.filter(d =>
    d.deviceId.toLowerCase().includes(filter.toLowerCase()) ||
    (d.ipAddress && d.ipAddress.includes(filter)) ||
    d.manufacturer.toLowerCase().includes(filter.toLowerCase()) ||
    d.model.toLowerCase().includes(filter.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800';
      case 'offline': return 'bg-red-100 text-red-800';
      case 'degraded': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!branchId) {
    return (
      <div className={`p-4 border border-gray-200 rounded-lg bg-gray-50 ${className || ''}`}>
        <p className="text-sm text-gray-600">Please select a branch first</p>
      </div>
    );
  }

  return (
    <div className={`device-selector ${className || ''}`}>
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search devices by ID, IP, manufacturer, or model..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading devices...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {!loading && !error && filteredDevices.length === 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-sm text-gray-600">
            {filter ? 'No devices match your search' : 'No devices found in this branch'}
          </p>
        </div>
      )}

      {!loading && !error && filteredDevices.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredDevices.map((device) => (
            <div
              key={device.id}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                value?.id === device.id
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
              onClick={() => onChange(device)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{device.deviceId}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(device.healthStatus)}`}>
                      {device.healthStatus}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {device.manufacturer} {device.model}
                    {device.ipAddress && <span className="ml-2">• {device.ipAddress}</span>}
                  </div>
                  {device.serialNumber && (
                    <div className="text-xs text-gray-500 mt-1">
                      SN: {device.serialNumber}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {device.deviceType}
                </div>
              </div>
              {device.capabilities && device.capabilities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {device.capabilities.slice(0, 3).map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {cap}
                    </span>
                  ))}
                  {device.capabilities.length > 3 && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                      +{device.capabilities.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
