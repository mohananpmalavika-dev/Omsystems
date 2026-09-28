/**
 * Live Storage Telemetry Widget
 * 
 * Displays real-time storage health for both Memory Card (MicroSD) and Hard Disk (HDD)
 * separately with SMART metrics, capacity, temperature, and failure predictions.
 * 
 * Malayalam: Memory Card um Hard Disk um separate ayi kaanikkunnu with real-time metrics
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Cpu,
  Database,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Activity,
  TrendingUp,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface StorageDevice {
  id: string;
  deviceId: string;
  name: string;
  model: string;
  type: 'MicroSD' | 'HDD' | 'SSD';
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  smartStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' | 'FAILED' | 'MISSING' | 'DEGRADED' | 'FAILURE_PREDICTED';
  temperature: number | null;
  reallocatedSectors: number;
  pendingSectors: number;
  powerOnHours: number | null;
  estimatedDaysRemaining: number | null;
  dailyGrowthGb: number | null;
  branchId?: string;
  branchName?: string;
  cameraId?: string;
  cameraName?: string;
  observedAt: string;
}

interface LiveStorageTelemetryResponse {
  success: boolean;
  memoryCards: StorageDevice[];
  hardDisks: StorageDevice[];
  summary: {
    totalMemoryCards: number;
    healthyMemoryCards: number;
    warningMemoryCards: number;
    criticalMemoryCards: number;
    totalHardDisks: number;
    healthyHardDisks: number;
    warningHardDisks: number;
    criticalHardDisks: number;
  };
  observedAt: string;
}

interface StorageOverviewPayload {
  success: boolean;
  storageDevices?: Record<string, unknown>[];
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMemoryCard(disk: Record<string, unknown>) {
  const identity = [disk.id, disk.deviceId, disk.devicePath, disk.name, disk.model, disk.mediaType]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return /(?:sdcard|sd-card|micro\s*sd|\bsd\b)/.test(identity);
}

function normalizeStorageDevice(disk: Record<string, unknown>): StorageDevice {
  const deviceId = String(disk.deviceId || disk.id || '');
  const model = String(disk.model || disk.name || disk.devicePath || 'Storage device');
  const capacityBytes = numberValue(disk.capacityBytes ?? disk.totalBytes);
  const usedBytes = numberValue(disk.usedBytes);
  const availableBytes = numberValue(disk.availableBytes ?? disk.freeBytes)
    || (capacityBytes > 0 ? Math.max(0, capacityBytes - usedBytes) : 0);
  const usagePercent = numberValue(disk.usagePercent)
    || (capacityBytes > 0 ? (usedBytes / capacityBytes) * 100 : 0);
  const memoryCard = isMemoryCard(disk);

  return {
    id: String(disk.id || deviceId),
    deviceId,
    name: String(disk.name || disk.devicePath || model),
    model,
    type: memoryCard ? 'MicroSD' : (disk.mediaType === 'SSD' ? 'SSD' : 'HDD'),
    capacityBytes,
    usedBytes,
    availableBytes,
    usagePercent,
    smartStatus: String(disk.smartStatus || disk.healthStatus || disk.operationalStatus || 'UNKNOWN').toUpperCase() as StorageDevice['smartStatus'],
    temperature: optionalNumber(disk.temperature ?? disk.temperatureC),
    reallocatedSectors: numberValue(disk.reallocatedSectors),
    pendingSectors: numberValue(disk.pendingSectors),
    powerOnHours: optionalNumber(disk.powerOnHours),
    estimatedDaysRemaining: optionalNumber(disk.estimatedDaysRemaining ?? disk.daysRemaining),
    dailyGrowthGb: optionalNumber(disk.dailyGrowthGb ?? disk.dailyIngestGb),
    branchId: typeof disk.branchId === 'string' ? disk.branchId : undefined,
    branchName: typeof disk.branchName === 'string' ? disk.branchName : undefined,
    cameraId: typeof disk.cameraId === 'string' ? disk.cameraId : undefined,
    cameraName: typeof disk.cameraName === 'string' ? disk.cameraName : undefined,
    observedAt: typeof disk.observedAt === 'string' ? disk.observedAt : new Date().toISOString(),
  };
}

export function LiveStorageTelemetryWidget() {
  const [data, setData] = useState<LiveStorageTelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'memory-card' | 'hard-disk'>('memory-card');

  const loadStorageTelemetry = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use the same authenticated inventory response as the Storage page.
      // Previously this panel queried a separate route, so new camera
      // volumes could be present in the tier summary but absent here.
      const response = await fetch('/api/operations/storage', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch storage telemetry: ${response.statusText}`);
      }

      const payload = await response.json() as StorageOverviewPayload;
      if (!payload.success) throw new Error('Storage inventory is unavailable');

      // Separate MicroSD and HDD
      const memoryCards: StorageDevice[] = [];
      const hardDisks: StorageDevice[] = [];

      for (const disk of payload.storageDevices ?? []) {
        const device = normalizeStorageDevice(disk);
        if (device.type === 'MicroSD') {
          memoryCards.push(device);
        } else {
          hardDisks.push(device);
        }
      }

      const summary = {
        totalMemoryCards: memoryCards.length,
        healthyMemoryCards: memoryCards.filter(d => d.smartStatus === 'HEALTHY').length,
        warningMemoryCards: memoryCards.filter(d => d.smartStatus === 'WARNING').length,
        criticalMemoryCards: memoryCards.filter(d => d.smartStatus === 'CRITICAL').length,
        totalHardDisks: hardDisks.length,
        healthyHardDisks: hardDisks.filter(d => d.smartStatus === 'HEALTHY').length,
        warningHardDisks: hardDisks.filter(d => d.smartStatus === 'WARNING').length,
        criticalHardDisks: hardDisks.filter(d => d.smartStatus === 'CRITICAL').length,
      };

      setData({
        success: true,
        memoryCards,
        hardDisks,
        summary,
        observedAt: new Date().toISOString(),
      });

    } catch (err) {
      console.error('Failed to load storage telemetry:', err);
      setError(err instanceof Error ? err.message : 'Failed to load storage telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStorageTelemetry();
    const interval = setInterval(loadStorageTelemetry, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return 'Unavailable';
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
    return `${bytes} B`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'WARNING':
      case 'DEGRADED':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'CRITICAL':
      case 'FAILED':
      case 'FAILURE_PREDICTED':
      case 'MISSING':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-600';
    if (percent >= 75) return 'bg-amber-600';
    return 'bg-emerald-600';
  };

  const getTempColor = (temp: number) => {
    if (temp >= 60) return 'text-red-400';
    if (temp >= 50) return 'text-amber-400';
    return 'text-emerald-400';
  };

  if (loading && !data) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-center gap-3 py-12">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-slate-400">Loading storage telemetry...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-red-400 font-semibold">Storage Telemetry Error</h3>
            <p className="text-sm text-red-300/70 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const displayDevices = selectedTab === 'memory-card' ? data.memoryCards : data.hardDisks;
  const summary = selectedTab === 'memory-card' 
    ? {
        total: data.summary.totalMemoryCards,
        healthy: data.summary.healthyMemoryCards,
        warning: data.summary.warningMemoryCards,
        critical: data.summary.criticalMemoryCards,
      }
    : {
        total: data.summary.totalHardDisks,
        healthy: data.summary.healthyHardDisks,
        warning: data.summary.warningHardDisks,
        critical: data.summary.criticalHardDisks,
      };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Live Storage Telemetry</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time MicroSD Memory Card and SATA Hard Disk monitoring
              </p>
            </div>
          </div>
          <button
            onClick={loadStorageTelemetry}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Refresh storage telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setSelectedTab('memory-card')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              selectedTab === 'memory-card'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Memory Card ({data.summary.totalMemoryCards})
          </button>
          <button
            onClick={() => setSelectedTab('hard-disk')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              selectedTab === 'hard-disk'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Hard Disk ({data.summary.totalHardDisks})
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Total</div>
            <div className="text-xl font-bold text-white">{summary.total}</div>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-3">
            <div className="text-xs text-emerald-400 mb-1">Healthy</div>
            <div className="text-xl font-bold text-emerald-400">{summary.healthy}</div>
          </div>
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3">
            <div className="text-xs text-amber-400 mb-1">Warning</div>
            <div className="text-xl font-bold text-amber-400">{summary.warning}</div>
          </div>
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3">
            <div className="text-xs text-red-400 mb-1">Critical</div>
            <div className="text-xl font-bold text-red-400">{summary.critical}</div>
          </div>
        </div>
      </div>

      {/* Storage Device List */}
      <div className="divide-y divide-slate-800">
        {displayDevices.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Database className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-sm">
              No {selectedTab === 'memory-card' ? 'Memory Cards' : 'Hard Disks'} detected.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Storage telemetry will appear here once devices are provisioned.
            </p>
          </div>
        ) : (
          displayDevices.map((device) => (
            <div
              key={device.id}
              className="p-5 hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  {device.type === 'MicroSD' ? (
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                      <Cpu className="w-5 h-5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <HardDrive className="w-5 h-5 text-blue-400" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">{device.name}</h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{device.model}</p>
                    {device.cameraName && (
                      <p className="text-xs text-slate-500 mt-1">
                        Camera: {device.cameraName}
                      </p>
                    )}
                    {device.branchName && (
                      <p className="text-xs text-slate-500">
                        Branch: {device.branchName}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(device.smartStatus)}`}
                >
                  {device.smartStatus}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Capacity */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-2">Capacity</div>
                  <div className="text-sm font-bold text-white">
                    {formatBytes(device.capacityBytes)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Used: {device.capacityBytes > 0 && device.usedBytes === 0 ? '0 B' : formatBytes(device.usedBytes)}
                  </div>
                  {device.capacityBytes > 0 && <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                    <div
                      className={`h-1.5 rounded-full transition-all ${getUsageColor(device.usagePercent)}`}
                      style={{ width: `${Math.min(100, device.usagePercent)}%` }}
                    />
                  </div>}
                  <div className="text-xs text-slate-400 mt-1">
                    {device.capacityBytes > 0 ? `${device.usagePercent.toFixed(1)}% used` : 'Usage unavailable'}
                  </div>
                </div>

                {/* Temperature */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    Temperature
                  </div>
                  <div className={`text-xl font-bold ${device.temperature == null ? 'text-slate-400' : getTempColor(device.temperature)}`}>
                    {device.temperature == null ? 'Unavailable' : `${device.temperature}°C`}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {device.temperature == null ? 'No temperature reading' : device.temperature < 45 ? 'Normal' : device.temperature < 55 ? 'Elevated' : 'High'}
                  </div>
                </div>

                {/* Retention */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Days Remaining
                  </div>
                  <div className={`text-xl font-bold ${
                    device.estimatedDaysRemaining != null && device.estimatedDaysRemaining < 7 ? 'text-red-400' :
                    device.estimatedDaysRemaining != null && device.estimatedDaysRemaining < 30 ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>
                    {device.estimatedDaysRemaining == null ? 'Unavailable' : device.estimatedDaysRemaining > 365 ? '365+' : device.estimatedDaysRemaining}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {device.dailyGrowthGb == null ? 'Growth unavailable' : `${device.dailyGrowthGb.toFixed(1)} GB/day`}
                  </div>
                </div>

                {/* SMART Health */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    SMART Health
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Reallocated:</span>
                      <span className={device.reallocatedSectors > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                        {device.reallocatedSectors}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Pending:</span>
                      <span className={device.pendingSectors > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {device.pendingSectors}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Power-On:</span>
                      <span className="text-slate-300">
                        {device.powerOnHours == null ? 'Unavailable' : `${Math.floor(device.powerOnHours / 24 / 365)}y`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning Messages */}
              {['CRITICAL', 'WARNING', 'FAILED', 'FAILURE_PREDICTED', 'DEGRADED'].includes(device.smartStatus) && (
                <div className={`mt-3 p-3 rounded-lg border ${
                  device.smartStatus === 'CRITICAL' 
                    ? 'bg-red-950/30 border-red-500/30' 
                    : 'bg-amber-950/30 border-amber-500/30'
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                      device.smartStatus === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'
                    }`} />
                    <div className="text-xs">
                      {device.smartStatus === 'CRITICAL' && (
                        <p className="text-red-300 font-semibold">
                          Critical: Inspect or replace this device immediately.
                        </p>
                      )}
                      {device.smartStatus !== 'CRITICAL' && (
                        <p className="text-amber-300 font-semibold">
                          Warning: Monitor closely. Consider replacement planning.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-slate-950/50 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Last updated: {new Date(data.observedAt).toLocaleString()}</span>
          <span>Auto-refresh every 30 seconds</span>
        </div>
      </div>
    </div>
  );
}
