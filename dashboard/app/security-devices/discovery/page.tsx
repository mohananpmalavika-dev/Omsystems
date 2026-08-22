/**
 * Security Device Hub - Device Discovery Page
 * 
 * Network discovery job management and device enrollment workflow
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  Search, 
  Play, 
  CheckCircle, 
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  X,
  Network
} from 'lucide-react';
import Link from 'next/link';

interface DiscoveryJob {
  id: string;
  branchId: string;
  branchName?: string;
  networkRanges: string[];
  protocols: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  devicesFound: number;
  devicesEnrolled: number;
  startedAt: string;
  completedAt?: string;
  initiatedBy: string;
  error?: string;
}

interface DiscoveredDevice {
  id: string;
  jobId: string;
  ipAddress: string;
  macAddress?: string;
  manufacturer?: string;
  model?: string;
  deviceType?: string;
  protocol: string;
  confidence: number;
  capabilities: string[];
  metadata?: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  discoveredAt: string;
}

export default function DeviceDiscoveryPage() {
  const [jobs, setJobs] = useState<DiscoveryJob[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  useEffect(() => {
    loadDiscoveryData();
    const interval = setInterval(loadDiscoveryData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadDiscoveryData = async () => {
    try {
      const [jobsRes, devicesRes] = await Promise.all([
        fetch('/api/security-devices/discovery'),
        fetch('/api/security-devices/discovery/devices?status=pending')
      ]);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData.data || []);
      }

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDiscoveredDevices(devicesData.data || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load discovery data:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-5 h-5 text-gray-500" />;
      case 'running': return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-50';
      case 'running': return 'text-blue-600 bg-blue-50';
      case 'completed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600 bg-green-50';
    if (confidence >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  const handleApproveDevice = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/security-devices/discovery/devices/${deviceId}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        loadDiscoveryData();
      }
    } catch (error) {
      console.error('Failed to approve device:', error);
    }
  };

  const handleRejectDevice = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/security-devices/discovery/devices/${deviceId}/reject`, {
        method: 'POST',
      });

      if (response.ok) {
        loadDiscoveryData();
      }
    } catch (error) {
      console.error('Failed to reject device:', error);
    }
  };

  const runningJobs = jobs.filter(j => j.status === 'running').length;
  const pendingDevices = discoveredDevices.length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Network className="w-8 h-8 text-blue-600" />
              Device Discovery
            </h1>
            <p className="text-gray-600 mt-1">
              Scan network for security devices and enroll them into the system
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/security-devices"
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Overview
            </Link>
            <button
              onClick={() => setShowNewJobModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Discovery Job
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Play className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-gray-600">Active Jobs</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{runningJobs}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <div className="text-sm text-gray-600">Pending Review</div>
          </div>
          <div className="text-3xl font-bold text-yellow-600">{pendingDevices}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="text-sm text-gray-600">Total Jobs</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{jobs.length}</div>
        </div>
      </div>

      {/* Pending Devices */}
      {pendingDevices > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Pending Device Approvals ({pendingDevices})
            </h2>
            <button
              onClick={() => {/* TODO: Bulk approve */}}
              className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
            >
              Approve All High Confidence
            </button>
          </div>

          <div className="space-y-3">
            {discoveredDevices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-semibold text-gray-900">
                      {device.manufacturer} {device.model || device.deviceType || 'Unknown Device'}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getConfidenceColor(device.confidence)}`}>
                      {device.confidence}% Confidence
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                      {device.protocol.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="font-mono">{device.ipAddress}</div>
                    {device.macAddress && (
                      <div className="font-mono text-xs">{device.macAddress}</div>
                    )}
                    <div>{device.capabilities.length} capabilities</div>
                    <div className="text-gray-400">
                      Discovered {new Date(device.discoveredAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveDevice(device.id)}
                    className="px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectDevice(device.id)}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Jobs */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Discovery Jobs</h2>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading discovery jobs...
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Discovery Jobs</h3>
            <p className="text-gray-600 mb-6">
              Start a network scan to discover security devices
            </p>
            <button
              onClick={() => setShowNewJobModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Start Discovery
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Job Header */}
                <div
                  className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(job.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="font-semibold text-gray-900">
                          {job.branchName || job.branchId}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(job.status)}`}>
                          {job.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div>{job.networkRanges.join(', ')}</div>
                        <div>{job.protocols.join(', ').toUpperCase()}</div>
                        <div>{job.devicesFound} devices found</div>
                        {job.devicesEnrolled > 0 && (
                          <div className="text-green-600 font-semibold">
                            {job.devicesEnrolled} enrolled
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-500">
                      {new Date(job.startedAt).toLocaleString()}
                    </div>
                    {expandedJobId === job.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Job Details (Expanded) */}
                {expandedJobId === job.id && (
                  <div className="p-4 bg-white border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600 mb-1">Job ID</div>
                        <div className="font-mono text-gray-900">{job.id}</div>
                      </div>
                      <div>
                        <div className="text-gray-600 mb-1">Initiated By</div>
                        <div className="text-gray-900">{job.initiatedBy}</div>
                      </div>
                      <div>
                        <div className="text-gray-600 mb-1">Started At</div>
                        <div className="text-gray-900">{new Date(job.startedAt).toLocaleString()}</div>
                      </div>
                      {job.completedAt && (
                        <div>
                          <div className="text-gray-600 mb-1">Completed At</div>
                          <div className="text-gray-900">{new Date(job.completedAt).toLocaleString()}</div>
                        </div>
                      )}
                      {job.error && (
                        <div className="col-span-2">
                          <div className="text-red-600 mb-1">Error</div>
                          <div className="text-red-900 bg-red-50 p-2 rounded">{job.error}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Job Modal */}
      {showNewJobModal && (
        <NewDiscoveryJobModal
          onClose={() => setShowNewJobModal(false)}
          onCreated={loadDiscoveryData}
        />
      )}
    </div>
  );
}

// New Discovery Job Modal
function NewDiscoveryJobModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [branchId, setBranchId] = useState('');
  const [networkRanges, setNetworkRanges] = useState('192.168.1.0/24');
  const [protocols, setProtocols] = useState(['onvif', 'snmp', 'rest']);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!branchId || !networkRanges) {
      setError('Branch and network ranges are required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/security-devices/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          networkRanges: networkRanges.split(',').map(r => r.trim()),
          protocols,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to start discovery');
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Start Discovery Job</h3>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Branch ID
            </label>
            <input
              type="text"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder="e.g., branch-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Network Ranges (comma-separated)
            </label>
            <textarea
              value={networkRanges}
              onChange={(e) => setNetworkRanges(e.target.value)}
              placeholder="e.g., 192.168.1.0/24, 10.0.0.0/16"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Protocols
            </label>
            <div className="space-y-2">
              {['onvif', 'snmp', 'rest', 'mqtt'].map((protocol) => (
                <label key={protocol} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={protocols.includes(protocol)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setProtocols([...protocols, protocol]);
                      } else {
                        setProtocols(protocols.filter(p => p !== protocol));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{protocol.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            disabled={creating}
          >
            {creating ? 'Starting...' : 'Start Discovery'}
          </button>
        </div>
      </div>
    </div>
  );
}
