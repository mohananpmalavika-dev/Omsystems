/**
 * Security Device Hub - Device Detail Page
 * 
 * Detailed view of a single security device with health history, events, and command execution
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  Shield, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Settings,
  Terminal,
  ChevronLeft,
  RefreshCw,
  Power,
  Lock,
  Unlock,
  Bell,
  BellOff,
  RotateCw,
  Camera
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface SecurityDevice {
  id: string;
  deviceType: string;
  name: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  macAddress?: string;
  location?: string;
  branchId: string;
  branchName?: string;
  capabilities: string[];
  metadata?: Record<string, any>;
  health?: {
    status: 'online' | 'offline' | 'degraded';
    lastSeen?: string;
    uptime?: number;
    hasActiveAlarm?: boolean;
    alarmMessage?: string;
    metrics?: Record<string, number>;
  };
  installedAt?: string;
  lastMaintenanceAt?: string;
}

interface HealthSnapshot {
  timestamp: string;
  status: 'online' | 'offline' | 'degraded';
  metrics: Record<string, number>;
}

interface DeviceEvent {
  id: string;
  eventType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, any>;
  occurredAt: string;
}

interface DeviceCommand {
  command: string;
  label: string;
  icon: any;
  requiresMfa: boolean;
  requiresApproval: boolean;
  description: string;
  parameters?: Record<string, any>;
}

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<SecurityDevice | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthSnapshot[]>([]);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<DeviceCommand | null>(null);

  useEffect(() => {
    loadDeviceData();
    const interval = setInterval(loadDeviceData, 30000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const loadDeviceData = async () => {
    try {
      const [deviceRes, healthRes, eventsRes] = await Promise.all([
        fetch(`/api/security-devices/${deviceId}`),
        fetch(`/api/security-devices/${deviceId}/health?hours=24`),
        fetch(`/api/security-devices/${deviceId}/events?limit=50`)
      ]);

      if (deviceRes.ok) {
        const deviceData = await deviceRes.json();
        setDevice(deviceData.data);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealthHistory(healthData.data);
      }

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData.data);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load device data:', error);
      setLoading(false);
    }
  };

  const getAvailableCommands = (): DeviceCommand[] => {
    if (!device) return [];

    const commands: DeviceCommand[] = [];

    // Universal commands
    if (device.capabilities.includes('RESTART')) {
      commands.push({
        command: 'RESTART',
        label: 'Restart Device',
        icon: RotateCw,
        requiresMfa: false,
        requiresApproval: false,
        description: 'Restart the device'
      });
    }

    // Camera-specific commands
    if (device.deviceType === 'ip-camera') {
      if (device.capabilities.includes('SNAPSHOT')) {
        commands.push({
          command: 'SNAPSHOT',
          label: 'Take Snapshot',
          icon: Camera,
          requiresMfa: false,
          requiresApproval: false,
          description: 'Capture a snapshot from the camera'
        });
      }
    }

    // Access control commands
    if (device.deviceType === 'door' || device.deviceType === 'access-controller') {
      if (device.capabilities.includes('UNLOCK')) {
        commands.push({
          command: 'UNLOCK',
          label: 'Unlock Door',
          icon: Unlock,
          requiresMfa: true,
          requiresApproval: true,
          description: 'Unlock the door (requires MFA and approval)'
        });
      }
      if (device.capabilities.includes('LOCK')) {
        commands.push({
          command: 'LOCK',
          label: 'Lock Door',
          icon: Lock,
          requiresMfa: false,
          requiresApproval: false,
          description: 'Lock the door'
        });
      }
    }

    // Alarm commands
    if (device.deviceType === 'intrusion-panel' || device.deviceType === 'fire-panel') {
      if (device.capabilities.includes('ARM')) {
        commands.push({
          command: 'ARM',
          label: 'Arm System',
          icon: Bell,
          requiresMfa: false,
          requiresApproval: false,
          description: 'Arm the alarm system'
        });
      }
      if (device.capabilities.includes('DISARM')) {
        commands.push({
          command: 'DISARM',
          label: 'Disarm System',
          icon: BellOff,
          requiresMfa: true,
          requiresApproval: true,
          description: 'Disarm the alarm system (requires MFA and approval)'
        });
      }
    }

    return commands;
  };

  const executeCommand = async (command: DeviceCommand) => {
    setSelectedCommand(command);
    setShowCommandModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-50';
      case 'offline': return 'text-red-600 bg-red-50';
      case 'degraded': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info': return 'text-blue-600 bg-blue-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-orange-600 bg-orange-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-500">Loading device details...</div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Device Not Found</h2>
          <p className="text-gray-600 mb-6">The requested device could not be found.</p>
          <Link
            href="/security-devices"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Device Hub
          </Link>
        </div>
      </div>
    );
  }

  const availableCommands = getAvailableCommands();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/security-devices"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Device Hub
        </Link>
        
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{device.name}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(device.health?.status || 'offline')}`}>
                {device.health?.status?.toUpperCase() || 'OFFLINE'}
              </span>
              {device.health?.hasActiveAlarm && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  ALARM
                </span>
              )}
            </div>
            <p className="text-gray-600">
              {device.manufacturer} {device.model} • {device.deviceType}
            </p>
          </div>
          <button
            onClick={loadDeviceData}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Device Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-gray-600">Status</div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {device.health?.status || 'Unknown'}
          </div>
          {device.health?.lastSeen && (
            <div className="text-xs text-gray-500 mt-1">
              Last seen: {new Date(device.health.lastSeen).toLocaleString()}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-green-600" />
            <div className="text-sm text-gray-600">Uptime</div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatUptime(device.health?.uptime)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            <div className="text-sm text-gray-600">Location</div>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {device.location || 'Not specified'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {device.branchName || device.branchId}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="w-5 h-5 text-orange-600" />
            <div className="text-sm text-gray-600">Firmware</div>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {device.firmwareVersion || 'Unknown'}
          </div>
        </div>
      </div>

      {/* Device Commands */}
      {availableCommands.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="w-6 h-6 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Device Commands</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableCommands.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.command}
                  onClick={() => executeCommand(cmd)}
                  className="px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg flex items-center gap-3 transition-colors"
                >
                  <Icon className="w-5 h-5 text-gray-600" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-gray-900">{cmd.label}</div>
                    {(cmd.requiresMfa || cmd.requiresApproval) && (
                      <div className="text-xs text-yellow-600 flex items-center gap-1 mt-1">
                        <Shield className="w-3 h-3" />
                        Protected
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Technical Details */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Technical Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Device ID</span>
                <span className="font-mono text-sm text-gray-900">{device.id}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">IP Address</span>
                <span className="font-mono text-sm text-gray-900">{device.ipAddress || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">MAC Address</span>
                <span className="font-mono text-sm text-gray-900">{device.macAddress || 'N/A'}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Installed</span>
                <span className="text-sm text-gray-900">
                  {device.installedAt ? new Date(device.installedAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Last Maintenance</span>
                <span className="text-sm text-gray-900">
                  {device.lastMaintenanceAt ? new Date(device.lastMaintenanceAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Capabilities</span>
                <span className="text-sm text-gray-900">{device.capabilities.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Events</h2>
        {events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No events recorded
          </div>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityColor(event.severity)}`}>
                      {event.severity.toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{event.eventType}</span>
                  </div>
                  <p className="text-sm text-gray-600">{event.message}</p>
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap ml-4">
                  {new Date(event.occurredAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command Execution Modal */}
      {showCommandModal && selectedCommand && (
        <CommandExecutionModal
          device={device}
          command={selectedCommand}
          onClose={() => {
            setShowCommandModal(false);
            setSelectedCommand(null);
          }}
          onExecuted={loadDeviceData}
        />
      )}
    </div>
  );
}

// Command Execution Modal Component
function CommandExecutionModal({
  device,
  command,
  onClose,
  onExecuted,
}: {
  device: SecurityDevice;
  command: DeviceCommand;
  onClose: () => void;
  onExecuted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleExecute = async () => {
    if (command.requiresApproval && !reason.trim()) {
      setError('Reason is required for this command');
      return;
    }

    if (command.requiresMfa && !mfaToken.trim()) {
      setError('MFA token is required for this command');
      return;
    }

    setExecuting(true);
    setError(null);

    try {
      const response = await fetch(`/api/security-devices/${device.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.command,
          parameters: command.parameters,
          reason: reason.trim() || undefined,
          mfaToken: mfaToken.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'approval_required') {
          setSuccess(true);
          setError('Command submitted for approval');
        } else {
          throw new Error(data.message || 'Failed to execute command');
        }
      } else {
        setSuccess(true);
        setTimeout(() => {
          onExecuted();
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const Icon = command.icon;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">{command.label}</h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">{command.description}</p>

        {(command.requiresMfa || command.requiresApproval) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-yellow-800 text-sm">
              <Shield className="w-4 h-4" />
              <span className="font-semibold">Protected Command</span>
            </div>
            <ul className="mt-2 text-xs text-yellow-700 space-y-1 ml-6 list-disc">
              {command.requiresMfa && <li>Requires MFA verification</li>}
              {command.requiresApproval && <li>Requires supervisor approval</li>}
            </ul>
          </div>
        )}

        {command.requiresApproval && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reason (Required)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this command is needed..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={executing || success}
            />
          </div>
        )}

        {command.requiresMfa && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              MFA Token (Required)
            </label>
            <input
              type="text"
              value={mfaToken}
              onChange={(e) => setMfaToken(e.target.value)}
              placeholder="Enter 6-digit MFA code"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              maxLength={6}
              disabled={executing || success}
            />
          </div>
        )}

        {error && (
          <div className={`mb-4 p-3 rounded-lg ${success ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && !error && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <p className="text-sm">Command executed successfully!</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={executing}
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            disabled={executing || success}
          >
            {executing ? 'Executing...' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  );
}
