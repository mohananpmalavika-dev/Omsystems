/**
 * Monitor Configuration Form
 * 
 * UI for creating and configuring cash van monitors with:
 * - Zone selection (arrival, unloading, secure entry)
 * - Personnel rules (minimum count, guards, identity verification)
 * - Unloading rules (duration limits, escort requirements)
 * - Access control rules (correlation, authorized identity)
 * - Vehicle authorization (plates, regex patterns)
 * - Schedule rules (days, time windows, tolerance)
 */

import React, { useState, useEffect } from 'react';
import {
  Save,
  Plus,
  Trash2,
  MapPin,
  Users,
  Clock,
  Shield,
  Truck,
  Calendar,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface MonitorConfig {
  id?: string;
  tenantId: string;
  branchId: string;
  name: string;
  description?: string;
  enabled: boolean;
  
  // Zones
  arrivalZoneId: string;
  unloadingZoneId: string;
  secureEntryZoneId?: string;
  approvedRouteZones?: string[];
  
  // Rules
  personnelRules: {
    minimumPersonnel: number;
    minimumGuards: number;
    maximumPersonnel?: number;
    requireIdentityVerification: boolean;
    minimumIdentityConfidence: number;
  };
  
  unloadingRules: {
    maxDurationSeconds: number;
    minimumPersonnelNearby: number;
    maxEscortDistanceMeters: number;
    requireGuardEscort: boolean;
  };
  
  accessRules: {
    requireAccessCorrelation: boolean;
    accessCorrelationWindowMs: number;
    requireAuthorizedIdentity: boolean;
  };
  
  allowedVehicles: Array<{
    id: string;
    plate?: string;
    plateRegex?: string;
    providerId?: string;
    enabled: boolean;
  }>;
  
  scheduleRules: Array<{
    id: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    toleranceMinutes: number;
    enabled: boolean;
  }>;
}

interface Zone {
  id: string;
  name: string;
  cameraId: string;
}

// ============================================================================
// Main Component
// ============================================================================

export const MonitorConfigurationForm: React.FC<{
  monitorId?: string;
  onSave?: () => void;
  onCancel?: () => void;
}> = ({ monitorId, onSave, onCancel }) => {
  const [config, setConfig] = useState<MonitorConfig>({
    tenantId: 'default',
    branchId: 'default',
    name: '',
    enabled: true,
    arrivalZoneId: '',
    unloadingZoneId: '',
    personnelRules: {
      minimumPersonnel: 2,
      minimumGuards: 1,
      requireIdentityVerification: false,
      minimumIdentityConfidence: 0.75,
    },
    unloadingRules: {
      maxDurationSeconds: 720,
      minimumPersonnelNearby: 2,
      maxEscortDistanceMeters: 4,
      requireGuardEscort: true,
    },
    accessRules: {
      requireAccessCorrelation: true,
      accessCorrelationWindowMs: 10000,
      requireAuthorizedIdentity: true,
    },
    allowedVehicles: [],
    scheduleRules: [],
  });

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (monitorId) {
      loadMonitor();
    }
    loadZones();
  }, [monitorId]);

  const loadMonitor = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/v1/banking/monitors/${monitorId}`);
      const data = await response.json();
      if (data.success) {
        setConfig(data.data);
      }
    } catch (error) {
      console.error('Failed to load monitor:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadZones = async () => {
    // In production, load zones from API
    setZones([
      { id: 'zone_arrival', name: 'Arrival Zone', cameraId: 'cam_1' },
      { id: 'zone_unloading', name: 'Unloading Zone', cameraId: 'cam_2' },
      { id: 'zone_secure', name: 'Secure Entry', cameraId: 'cam_3' },
    ]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const url = monitorId
        ? `/v1/banking/monitors/${monitorId}`
        : '/v1/banking/monitors';
      
      const method = monitorId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        onSave?.();
      } else {
        alert(`Failed to save: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to save monitor:', error);
      alert('Failed to save monitor configuration');
    } finally {
      setSaving(false);
    }
  };

  const addVehicleRule = () => {
    setConfig({
      ...config,
      allowedVehicles: [
        ...config.allowedVehicles,
        {
          id: `vr_${Date.now()}`,
          enabled: true,
        },
      ],
    });
  };

  const removeVehicleRule = (id: string) => {
    setConfig({
      ...config,
      allowedVehicles: config.allowedVehicles.filter((v) => v.id !== id),
    });
  };

  const addScheduleRule = () => {
    setConfig({
      ...config,
      scheduleRules: [
        ...config.scheduleRules,
        {
          id: `sr_${Date.now()}`,
          daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
          startTime: '09:00',
          endTime: '17:00',
          toleranceMinutes: 15,
          enabled: true,
        },
      ],
    });
  };

  const removeScheduleRule = (id: string) => {
    setConfig({
      ...config,
      scheduleRules: config.scheduleRules.filter((s) => s.id !== id),
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">
          {monitorId ? 'Edit Monitor' : 'Create Monitor'}
        </h2>
        <p className="text-gray-600 mt-1">
          Configure cash van monitoring zones and rules
        </p>
      </div>

      <div className="p-6 space-y-8">
        {/* Basic Information */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Basic Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monitor Name *
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Main Branch Cash Van Monitor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={config.description || ''}
                onChange={(e) =>
                  setConfig({ ...config, description: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig({ ...config, enabled: e.target.checked })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Enabled
              </span>
            </label>
          </div>
        </div>

        {/* Zones */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Zone Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arrival Zone *
              </label>
              <select
                value={config.arrivalZoneId}
                onChange={(e) =>
                  setConfig({ ...config, arrivalZoneId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unloading Zone *
              </label>
              <select
                value={config.unloadingZoneId}
                onChange={(e) =>
                  setConfig({ ...config, unloadingZoneId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secure Entry Zone
              </label>
              <select
                value={config.secureEntryZoneId || ''}
                onChange={(e) =>
                  setConfig({ ...config, secureEntryZoneId: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Personnel Rules */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Personnel Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Personnel
              </label>
              <input
                type="number"
                value={config.personnelRules.minimumPersonnel}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    personnelRules: {
                      ...config.personnelRules,
                      minimumPersonnel: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Guards
              </label>
              <input
                type="number"
                value={config.personnelRules.minimumGuards}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    personnelRules: {
                      ...config.personnelRules,
                      minimumGuards: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.personnelRules.requireIdentityVerification}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    personnelRules: {
                      ...config.personnelRules,
                      requireIdentityVerification: e.target.checked,
                    },
                  })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Require Identity Verification
              </span>
            </label>
          </div>
        </div>

        {/* Unloading Rules */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Unloading Rules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Duration (seconds)
              </label>
              <input
                type="number"
                value={config.unloadingRules.maxDurationSeconds}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    unloadingRules: {
                      ...config.unloadingRules,
                      maxDurationSeconds: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Escort Distance (meters)
              </label>
              <input
                type="number"
                value={config.unloadingRules.maxEscortDistanceMeters}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    unloadingRules: {
                      ...config.unloadingRules,
                      maxEscortDistanceMeters: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.unloadingRules.requireGuardEscort}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    unloadingRules: {
                      ...config.unloadingRules,
                      requireGuardEscort: e.target.checked,
                    },
                  })
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Require Guard Escort
              </span>
            </label>
          </div>
        </div>

        {/* Allowed Vehicles */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Authorized Vehicles
            </h3>
            <button
              onClick={addVehicleRule}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Vehicle
            </button>
          </div>
          <div className="space-y-3">
            {config.allowedVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="p-4 border border-gray-200 rounded-lg flex items-center gap-4"
              >
                <input
                  type="text"
                  value={vehicle.plate || ''}
                  onChange={(e) => {
                    const updated = config.allowedVehicles.map((v) =>
                      v.id === vehicle.id ? { ...v, plate: e.target.value } : v
                    );
                    setConfig({ ...config, allowedVehicles: updated });
                  }}
                  placeholder="License plate"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <button
                  onClick={() => removeVehicleRule(vehicle.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {config.allowedVehicles.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                No vehicles configured. Add authorized vehicles above.
              </p>
            )}
          </div>
        </div>

        {/* Schedule Rules */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Schedule Rules
            </h3>
            <button
              onClick={addScheduleRule}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Schedule
            </button>
          </div>
          <div className="space-y-3">
            {config.scheduleRules.map((schedule) => (
              <div
                key={schedule.id}
                className="p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    Schedule
                  </span>
                  <button
                    onClick={() => removeScheduleRule(schedule.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => {
                      const updated = config.scheduleRules.map((s) =>
                        s.id === schedule.id
                          ? { ...s, startTime: e.target.value }
                          : s
                      );
                      setConfig({ ...config, scheduleRules: updated });
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => {
                      const updated = config.scheduleRules.map((s) =>
                        s.id === schedule.id
                          ? { ...s, endTime: e.target.value }
                          : s
                      );
                      setConfig({ ...config, scheduleRules: updated });
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            ))}
            {config.scheduleRules.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                No schedules configured. Add time windows above.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !config.name || !config.arrivalZoneId || !config.unloadingZoneId}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Monitor'}
        </button>
      </div>
    </div>
  );
};

export default MonitorConfigurationForm;
