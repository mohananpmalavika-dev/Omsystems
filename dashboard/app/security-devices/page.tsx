/**
 * Security Device Hub - Main Overview Page
 * 
 * Unified dashboard for all physical security devices across the organization.
 * Shows real-time device health, branch security posture, and active alerts.
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Shield, 
  Camera, 
  Lock, 
  Bell, 
  Flame, 
  AlertTriangle,
  Zap,
  Activity,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  Settings
} from 'lucide-react';
import Link from 'next/link';

interface DeviceStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  degradedDevices: number;
  alarmDevices: number;
  branches: number;
}

interface DeviceTypeBreakdown {
  type: string;
  count: number;
  online: number;
  offline: number;
  icon: any;
}

export default function SecurityDeviceHubPage() {
  const searchParams = useSearchParams();
  const selectedCategory = searchParams?.get('category') || 'all';
  const [stats, setStats] = useState<DeviceStats>({
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    degradedDevices: 0,
    alarmDevices: 0,
    branches: 0,
  });

  const [deviceBreakdown, setDeviceBreakdown] = useState<DeviceTypeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const categoryTerms: Record<string, string[]> = {
    video: ['camera', 'nvr', 'dvr'],
    'access-control': ['access', 'door'],
    intrusion: ['alarm', 'intrusion', 'motion', 'glass'],
    emergency: ['panic', 'emergency', 'duress'],
    'fire-safety': ['fire', 'smoke', 'heat'],
    'vault-cash': ['vault', 'safe', 'cash', 'teller'],
    atm: ['atm'],
    'power-environment': ['ups', 'power', 'temperature', 'humidity', 'water'],
  };

  const visibleDeviceTypes = categoryTerms[selectedCategory];

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // TODO: Replace with actual API calls
      const response = await fetch('/api/security-devices/overview');
      const data = await response.json();

      setStats(data.stats);
      setDeviceBreakdown(data.breakdown);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load device data:', error);
      
      // Mock data for development
      setStats({
        totalDevices: 12842,
        onlineDevices: 12410,
        offlineDevices: 96,
        degradedDevices: 312,
        alarmDevices: 7,
        branches: 400,
      });

      setDeviceBreakdown([
        { type: 'Cameras', count: 8240, online: 8102, offline: 138, icon: Camera },
        { type: 'NVR/DVR', count: 400, online: 394, offline: 6, icon: Activity },
        { type: 'Access Controllers', count: 400, online: 398, offline: 2, icon: Lock },
        { type: 'Doors', count: 1620, online: 1612, offline: 8, icon: Lock },
        { type: 'Alarm Panels', count: 400, online: 388, offline: 12, icon: Bell },
        { type: 'Fire Panels', count: 400, online: 396, offline: 4, icon: Flame },
        { type: 'UPS', count: 400, online: 385, offline: 15, icon: Zap },
        { type: 'Panic Buttons', count: 1200, online: 1198, offline: 2, icon: AlertTriangle },
        { type: 'ATM', count: 400, online: 392, offline: 8, icon: Activity },
      ]);

      setLoading(false);
    }
  };

  const getHealthColor = (online: number, total: number) => {
    const percentage = (online / total) * 100;
    if (percentage >= 95) return 'text-green-600 bg-green-50';
    if (percentage >= 85) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getHealthPercentage = (online: number, total: number) => {
    return ((online / total) * 100).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              Security Device Hub
            </h1>
            <p className="text-gray-600 mt-1">
              Unified monitoring and control for all physical security devices
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadDashboardData}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <Link
              href="/security-devices/settings"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Total Devices */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">{stats.branches} Branches</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalDevices.toLocaleString()}</div>
          <div className="text-sm text-gray-600 mt-1">Total Devices</div>
        </div>

        {/* Online Devices */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <TrendingUp className="w-4 h-4" />
              <span>
                {((stats.onlineDevices / stats.totalDevices) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="text-3xl font-bold text-green-600">{stats.onlineDevices.toLocaleString()}</div>
          <div className="text-sm text-gray-600 mt-1">Online Devices</div>
        </div>

        {/* Degraded Devices */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex items-center gap-1 text-yellow-600 text-sm">
              <TrendingDown className="w-4 h-4" />
              <span>
                {((stats.degradedDevices / stats.totalDevices) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="text-3xl font-bold text-yellow-600">{stats.degradedDevices.toLocaleString()}</div>
          <div className="text-sm text-gray-600 mt-1">Degraded Devices</div>
        </div>

        {/* Offline Devices */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-red-600" />
            </div>
            {stats.alarmDevices > 0 && (
              <div className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                {stats.alarmDevices} Alarms
              </div>
            )}
          </div>
          <div className="text-3xl font-bold text-red-600">{stats.offlineDevices.toLocaleString()}</div>
          <div className="text-sm text-gray-600 mt-1">Offline Devices</div>
        </div>
      </div>

      {/* Device Type Breakdown */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Device Breakdown by Type</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search device types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deviceBreakdown
            .filter((device) =>
              device.type.toLowerCase().includes(searchQuery.toLowerCase()) &&
              (!visibleDeviceTypes || visibleDeviceTypes.some((term) =>
                device.type.toLowerCase().includes(term)
              ))
            )
            .map((device) => {
              const Icon = device.icon;
              const healthPercentage = getHealthPercentage(device.online, device.count);
              const healthColor = getHealthColor(device.online, device.count);

              return (
                <Link
                  key={device.type}
                  href={`/security-devices/${device.type.toLowerCase().replace(/\s+/g, '-')}`}
                  className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${healthColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{device.type}</div>
                        <div className="text-sm text-gray-600">{device.count} devices</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-gray-600">{device.online}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        <span className="text-gray-600">{device.offline}</span>
                      </div>
                    </div>
                    <div className={`font-semibold ${healthColor.split(' ')[0]}`}>
                      {healthPercentage}%
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${healthColor.split(' ')[0].replace('text-', 'bg-')}`}
                      style={{ width: `${healthPercentage}%` }}
                    />
                  </div>
                </Link>
              );
            })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/security-devices/discovery"
          className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Device Discovery</h3>
          <p className="text-sm text-gray-600">
            Scan your network to discover new security devices and add them to the system
          </p>
        </Link>

        <Link
          href="/security-devices/branch-posture"
          className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
        >
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Branch Security Posture</h3>
          <p className="text-sm text-gray-600">
            View comprehensive security status for each branch location
          </p>
        </Link>

        <Link
          href="/security-devices/integrations"
          className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
        >
          <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Integrations</h3>
          <p className="text-sm text-gray-600">
            Manage device integrations, adapters, and connectivity settings
          </p>
        </Link>
      </div>
    </div>
  );
}
