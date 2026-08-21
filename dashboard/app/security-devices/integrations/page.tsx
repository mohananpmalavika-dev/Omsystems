/**
 * Security Device Hub - Integrations Page
 * 
 * Manage device integrations, adapters, and connectivity settings
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Activity,
  Shield
} from 'lucide-react';
import Link from 'next/link';

interface DeviceIntegration {
  id: string;
  name: string;
  integr ationType: string;
  protocol: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  deviceCount: number;
  lastSync?: string;
  config: {
    host?: string;
    port?: number;
    username?: string;
    apiKey?: string;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
  createdAt: string;
}

interface AdapterStatus {
  adapterType: string;
  protocol: string;
  enabled: boolean;
  deviceCount: number;
  activeConnections: number;
  errorCount: number;
  lastActivity?: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<DeviceIntegration[]>([]);
  const [adapters, setAdapters] = useState<AdapterStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewIntegrationModal, setShowNewIntegrationModal] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadIntegrationData();
    const interval = setInterval(loadIntegrationData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadIntegrationData = async () => {
    try {
      // TODO: Replace with actual API calls
      const mockIntegrations: DeviceIntegration[] = [
        {
          id: 'int-001',
          name: 'HikVision CCTV System',
          integrationType: 'cctv',
          protocol: 'onvif',
          connectionStatus: 'connected',
          deviceCount: 245,
          lastSync: new Date(Date.now() - 300000).toISOString(),
          config: {
            host: '192.168.1.100',
            port: 80,
            username: 'admin',
            apiKey: '••••••••••••',
          },
          createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        },
        {
          id: 'int-002',
          name: 'Honeywell Access Control',
          integrationType: 'access-control',
          protocol: 'rest',
          connectionStatus: 'connected',
          deviceCount: 400,
          lastSync: new Date(Date.now() - 600000).toISOString(),
          config: {
            host: '192.168.1.101',
            port: 443,
            apiKey: '••••••••••••',
          },
          createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
        },
        {
          id: 'int-003',
          name: 'Bosch Fire Panel',
          integrationType: 'fire-safety',
          protocol: 'rest',
          connectionStatus: 'error',
          deviceCount: 0,
          config: {
            host: '192.168.1.102',
            port: 443,
          },
          createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
        },
      ];

      const mockAdapters: AdapterStatus[] = [
        {
          adapterType: 'ONVIF',
          protocol: 'onvif',
          enabled: true,
          deviceCount: 8240,
          activeConnections: 8102,
          errorCount: 138,
          lastActivity: new Date().toISOString(),
        },
        {
          adapterType: 'SNMP',
          protocol: 'snmp',
          enabled: true,
          deviceCount: 800,
          activeConnections: 773,
          errorCount: 27,
          lastActivity: new Date().toISOString(),
        },
        {
          adapterType: 'REST API',
          protocol: 'rest',
          enabled: true,
          deviceCount: 1620,
          activeConnections: 1610,
          errorCount: 10,
          lastActivity: new Date().toISOString(),
        },
        {
          adapterType: 'MQTT',
          protocol: 'mqtt',
          enabled: true,
          deviceCount: 2182,
          activeConnections: 2180,
          errorCount: 2,
          lastActivity: new Date().toISOString(),
        },
      ];

      setIntegrations(mockIntegrations);
      setAdapters(mockAdapters);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load integration data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-50';
      case 'disconnected': return 'text-gray-600 bg-gray-50';
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'disconnected': return <XCircle className="w-5 h-5 text-gray-600" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const toggleShowSecret = (integrationId: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [integrationId]: !prev[integrationId],
    }));
  };

  const testConnection = async (integrationId: string) => {
    try {
      const response = await fetch(`/api/security-devices/integrations/${integrationId}/test`, {
        method: 'POST',
      });

      if (response.ok) {
        loadIntegrationData();
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
    }
  };

  const deleteIntegration = async (integrationId: string) => {
    if (!confirm('Are you sure you want to delete this integration?')) return;

    try {
      const response = await fetch(`/api/security-devices/integrations/${integrationId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadIntegrationData();
      }
    } catch (error) {
      console.error('Failed to delete integration:', error);
    }
  };

  const connectedIntegrations = integrations.filter(i => i.connectionStatus === 'connected').length;
  const totalDevices = integrations.reduce((sum, i) => sum + i.deviceCount, 0);
  const errorIntegrations = integrations.filter(i => i.connectionStatus === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-600" />
              Integrations & Adapters
            </h1>
            <p className="text-gray-600 mt-1">
              Manage device integrations and adapter connectivity
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
              onClick={() => setShowNewIntegrationModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Integration
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div className="text-sm text-gray-600">Connected</div>
          </div>
          <div className="text-3xl font-bold text-green-600">{connectedIntegrations}</div>
          <div className="text-xs text-gray-500 mt-1">of {integrations.length} integrations</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-gray-600">Total Devices</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalDevices.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <div className="text-sm text-gray-600">Active Adapters</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {adapters.filter(a => a.enabled).length}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div className="text-sm text-gray-600">Errors</div>
          </div>
          <div className="text-3xl font-bold text-red-600">{errorIntegrations}</div>
        </div>
      </div>

      {/* Adapter Status */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adapter Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {adapters.map((adapter) => (
            <div
              key={adapter.protocol}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-gray-900">{adapter.adapterType}</div>
                <div className={`w-3 h-3 rounded-full ${adapter.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Devices</span>
                  <span className="font-semibold text-gray-900">{adapter.deviceCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active</span>
                  <span className="font-semibold text-green-600">{adapter.activeConnections}</span>
                </div>
                {adapter.errorCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Errors</span>
                    <span className="font-semibold text-red-600">{adapter.errorCount}</span>
                  </div>
                )}
              </div>

              {adapter.lastActivity && (
                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                  Last activity: {new Date(adapter.lastActivity).toLocaleTimeString()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Device Integrations</h2>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading integrations...
          </div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-12">
            <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Integrations</h3>
            <p className="text-gray-600 mb-6">
              Add device integrations to start connecting security systems
            </p>
            <button
              onClick={() => setShowNewIntegrationModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Integration
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {integration.name}
                      </h3>
                      {getStatusIcon(integration.connectionStatus)}
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(integration.connectionStatus)}`}>
                        {integration.connectionStatus.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700">
                        {integration.protocol.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div>{integration.integrationType.replace('-', ' ')}</div>
                      <div>{integration.deviceCount} devices</div>
                      {integration.lastSync && (
                        <div>
                          Last sync: {new Date(integration.lastSync).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testConnection(integration.id)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Test Connection"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {/* TODO: Edit integration */}}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteIntegration(integration.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Configuration */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(integration.config).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <div className="flex items-center gap-2">
                          {(key === 'password' || key === 'apiKey') ? (
                            <>
                              <span className="font-mono text-gray-900">
                                {showSecrets[integration.id] ? value : '••••••••'}
                              </span>
                              <button
                                onClick={() => toggleShowSecret(integration.id)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {showSecrets[integration.id] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </>
                          ) : (
                            <span className="font-mono text-gray-900">{value}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Integration Modal */}
      {showNewIntegrationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">New Integration</h3>
            <p className="text-gray-600 mb-6">
              Integration configuration UI coming soon. Use device discovery to automatically detect and add devices.
            </p>
            <button
              onClick={() => setShowNewIntegrationModal(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
