/**
 * Network Drill-Down Modal
 * 
 * Detailed view of network connectivity:
 * - Primary/Secondary WAN status
 * - Gateway reachability
 * - VPN tunnel status
 * - Edge Agent connectivity
 * - Latency and packet loss metrics
 * - Recent outage history
 */

'use client';

import React from 'react';
import { BranchConnectivityStatus } from '@/types/branch-operational-snapshot';
import { 
  XMarkIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  SignalIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  ServerIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface NetworkDrillDownProps {
  branchId: string;
  network: BranchConnectivityStatus;
  onClose: () => void;
}

export function NetworkDrillDown({ branchId, network, onClose }: NetworkDrillDownProps) {
  const getStateColor = (state: string) => {
    switch (state) {
      case 'ONLINE':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'DEGRADED':
      case 'FAILOVER':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'OFFLINE':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-800';
    }
  };

  const getLatencyColor = (latency?: number) => {
    if (!latency) return 'text-gray-600';
    if (latency < 50) return 'text-green-600';
    if (latency < 100) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPacketLossColor = (loss?: number) => {
    if (!loss) return 'text-gray-600';
    if (loss < 1) return 'text-green-600';
    if (loss < 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} sec`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Network Connectivity Details
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Overall Status: <span className={`font-semibold ${getStateColor(network.state).split(' ')[0]}`}>
                {network.state}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Overall Metrics */}
          {(network.latencyMs !== undefined || network.packetLossPct !== undefined) && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Connection Quality
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {network.latencyMs !== undefined && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <SignalIcon className="h-5 w-5 text-gray-500" />
                      <div className="text-sm text-gray-600 dark:text-gray-400">Latency</div>
                    </div>
                    <div className={`text-2xl font-bold ${getLatencyColor(network.latencyMs)}`}>
                      {network.latencyMs} ms
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {network.latencyMs < 50 ? 'Excellent' : 
                       network.latencyMs < 100 ? 'Good' : 
                       network.latencyMs < 200 ? 'Fair' : 'Poor'}
                    </div>
                  </div>
                )}

                {network.packetLossPct !== undefined && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />
                      <div className="text-sm text-gray-600 dark:text-gray-400">Packet Loss</div>
                    </div>
                    <div className={`text-2xl font-bold ${getPacketLossColor(network.packetLossPct)}`}>
                      {network.packetLossPct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {network.packetLossPct < 1 ? 'Excellent' : 
                       network.packetLossPct < 5 ? 'Acceptable' : 'Poor'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WAN Links */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              WAN Connections
            </h3>
            <div className="space-y-3">
              {/* Primary WAN */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GlobeAltIcon className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Primary ISP
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${getStateColor(network.primaryWan.state)}`}>
                    {network.primaryWan.state}
                  </span>
                </div>

                {(network.primaryWan.latencyMs !== undefined || 
                  network.primaryWan.packetLossPct !== undefined ||
                  network.primaryWan.bandwidthMbps !== undefined) && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {network.primaryWan.latencyMs !== undefined && (
                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Latency</div>
                        <div className={`font-medium ${getLatencyColor(network.primaryWan.latencyMs)}`}>
                          {network.primaryWan.latencyMs} ms
                        </div>
                      </div>
                    )}

                    {network.primaryWan.packetLossPct !== undefined && (
                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Packet Loss</div>
                        <div className={`font-medium ${getPacketLossColor(network.primaryWan.packetLossPct)}`}>
                          {network.primaryWan.packetLossPct.toFixed(2)}%
                        </div>
                      </div>
                    )}

                    {network.primaryWan.bandwidthMbps !== undefined && (
                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Bandwidth</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {network.primaryWan.bandwidthMbps} Mbps
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {network.primaryWan.disconnectCount24h !== undefined && network.primaryWan.disconnectCount24h > 0 && (
                  <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                    {network.primaryWan.disconnectCount24h} disconnect(s) in last 24 hours
                  </div>
                )}
              </div>

              {/* Secondary WAN */}
              {network.secondaryWan && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GlobeAltIcon className="h-5 w-5 text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        Secondary ISP
                      </span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${getStateColor(network.secondaryWan.state)}`}>
                      {network.secondaryWan.state}
                    </span>
                  </div>

                  {network.state === 'FAILOVER' && (
                    <div className="flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-400">
                      <ExclamationTriangleIcon className="h-4 w-4" />
                      <span className="font-medium">Currently Active (Failover Mode)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Gateway */}
          {network.gateway && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Gateway
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ServerIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      {network.gateway.ipAddress && (
                        <div className="font-medium text-gray-900 dark:text-white">
                          {network.gateway.ipAddress}
                        </div>
                      )}
                      {network.gateway.lastSeenAt && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Last seen: {new Date(network.gateway.lastSeenAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                    network.gateway.reachable 
                      ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                      : 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  }`}>
                    {network.gateway.reachable ? 'REACHABLE' : 'UNREACHABLE'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* VPN Status */}
          {network.vpn && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                VPN Tunnel
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheckIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Site-to-Site VPN
                      </div>
                      {network.vpn.lastEstablishedAt && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Established: {new Date(network.vpn.lastEstablishedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                    network.vpn.connected 
                      ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                      : 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  }`}>
                    {network.vpn.connected ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Edge Agent */}
          {network.edgeAgent && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Edge Agent
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ServerIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Branch Edge Agent
                      </div>
                      {network.edgeAgent.version && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Version: {network.edgeAgent.version}
                        </div>
                      )}
                      {network.edgeAgent.lastHeartbeat && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          Last heartbeat: {new Date(network.edgeAgent.lastHeartbeat).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                    network.edgeAgent.connected 
                      ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                      : 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  }`}>
                    {network.edgeAgent.connected ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Last Outage */}
          {network.lastOutage && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-gray-500" />
                Last Network Outage
              </h3>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600 dark:text-gray-400 mb-1">Started</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {new Date(network.lastOutage.startedAt).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-600 dark:text-gray-400 mb-1">Ended</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {new Date(network.lastOutage.endedAt).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-600 dark:text-gray-400 mb-1">Duration</div>
                    <div className="font-medium text-yellow-600 dark:text-yellow-400">
                      {formatDuration(network.lastOutage.durationSeconds)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Health Status Summary */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
              Network Health Summary
            </h3>
            <div className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
              {network.state === 'ONLINE' && (
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4" />
                  <span>Network connectivity is healthy</span>
                </div>
              )}
              {network.state === 'FAILOVER' && (
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <span>Running on backup connection - monitor primary ISP</span>
                </div>
              )}
              {network.state === 'DEGRADED' && (
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <span>Network performance is degraded - check connection quality</span>
                </div>
              )}
              {network.state === 'OFFLINE' && (
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">No network connectivity - cannot access branch remotely</span>
                </div>
              )}
              {network.latencyMs && network.latencyMs > 100 && (
                <div>• High latency detected - may affect video streaming quality</div>
              )}
              {network.packetLossPct && network.packetLossPct > 1 && (
                <div>• Packet loss detected - video may be unstable</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between">
          <button
            onClick={() => {
              // Run network diagnostics
              console.log('Run network diagnostics for branch:', branchId);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Diagnostics
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
