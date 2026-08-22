/**
 * Notification Delivery History
 * Timeline view of notification deliveries with status tracking
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Mail, 
  MessageSquare, 
  Phone, 
  Monitor,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

interface NotificationDelivery {
  id: string;
  channel: string;
  recipientDisplayName: string;
  recipientDestinationMasked: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'ACKNOWLEDGED';
  attemptNumber: number;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  createdAt: string;
}

interface EscalationStatus {
  hasEscalation: boolean;
  status?: string;
  currentStep?: number;
  totalSteps?: number;
  nextEscalationAt?: string;
}

interface NotificationDeliveryHistoryProps {
  incidentId: string;
}

const CHANNEL_ICONS = {
  dashboard: <Monitor className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />,
  voice: <Phone className="w-4 h-4" />,
};

const STATUS_CONFIG = {
  SENT: { color: 'blue', icon: <Clock className="w-4 h-4" />, label: 'Sent' },
  DELIVERED: { color: 'green', icon: <CheckCircle className="w-4 h-4" />, label: 'Delivered' },
  FAILED: { color: 'red', icon: <XCircle className="w-4 h-4" />, label: 'Failed' },
  ACKNOWLEDGED: { color: 'purple', icon: <CheckCircle className="w-4 h-4" />, label: 'Acknowledged' },
};

export function NotificationDeliveryHistory({ incidentId }: NotificationDeliveryHistoryProps) {
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [escalation, setEscalation] = useState<EscalationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeliveries();
    loadEscalationStatus();
  }, [incidentId]);

  const loadDeliveries = async () => {
    try {
      const response = await fetch(`/v1/incidents/${incidentId}/notifications`);
      const data = await response.json();
      setDeliveries(data.data || []);
    } catch (error) {
      console.error('Failed to load deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEscalationStatus = async () => {
    try {
      const response = await fetch(`/v1/incidents/${incidentId}/escalation`);
      const data = await response.json();
      setEscalation(data.data);
    } catch (error) {
      console.error('Failed to load escalation status:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false,
    });
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusColor = (status: string) => {
    return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.color || 'gray';
  };

  const stats = {
    total: deliveries.length,
    delivered: deliveries.filter(d => d.status === 'DELIVERED' || d.status === 'ACKNOWLEDGED').length,
    failed: deliveries.filter(d => d.status === 'FAILED').length,
    avgLatency: deliveries
      .filter(d => d.latencyMs)
      .reduce((sum, d) => sum + (d.latencyMs || 0), 0) / 
      deliveries.filter(d => d.latencyMs).length || 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Sent</div>
          <div className="text-2xl font-semibold text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Delivered</div>
          <div className="text-2xl font-semibold text-green-600">
            {stats.delivered}
            {stats.total > 0 && (
              <span className="text-sm text-gray-500 ml-2">
                ({Math.round((stats.delivered / stats.total) * 100)}%)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Failed</div>
          <div className="text-2xl font-semibold text-red-600">
            {stats.failed}
            {stats.total > 0 && (
              <span className="text-sm text-gray-500 ml-2">
                ({Math.round((stats.failed / stats.total) * 100)}%)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Avg Latency</div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats.avgLatency > 0 ? formatLatency(stats.avgLatency) : 'N/A'}
          </div>
        </div>
      </div>

      {/* Escalation Status */}
      {escalation?.hasEscalation && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Escalation Status</h3>
                <p className="text-sm text-gray-600">
                  {escalation.status === 'ACTIVE' && (
                    <>
                      Step {escalation.currentStep! + 1} of {escalation.totalSteps}
                      {escalation.nextEscalationAt && (
                        <> • Next at {formatTimestamp(escalation.nextEscalationAt)}</>
                      )}
                    </>
                  )}
                  {escalation.status === 'ACKNOWLEDGED' && 'Escalation stopped (acknowledged)'}
                  {escalation.status === 'COMPLETED' && 'All escalation steps completed'}
                  {escalation.status === 'CANCELLED' && 'Escalation cancelled'}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              escalation.status === 'ACTIVE' ? 'bg-orange-100 text-orange-800' :
              escalation.status === 'ACKNOWLEDGED' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {escalation.status}
            </span>
          </div>
        </div>
      )}

      {/* Delivery Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Delivery Timeline</h3>
          <p className="text-sm text-gray-600 mt-1">
            Chronological history of notification attempts and deliveries
          </p>
        </div>

        <div className="p-6">
          {deliveries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery, index) => {
                const statusConfig = STATUS_CONFIG[delivery.status];
                const channelIcon = CHANNEL_ICONS[delivery.channel as keyof typeof CHANNEL_ICONS];

                return (
                  <div key={delivery.id} className="flex gap-4">
                    {/* Timeline Line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full bg-${statusConfig.color}-100 flex items-center justify-center`}>
                        {channelIcon}
                      </div>
                      {index < deliveries.length - 1 && (
                        <div className="w-0.5 flex-1 bg-gray-200 mt-2" />
                      )}
                    </div>

                    {/* Delivery Details */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 capitalize">
                              {delivery.channel}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium bg-${statusConfig.color}-100 text-${statusConfig.color}-800`}>
                              {statusConfig.label}
                            </span>
                            {delivery.attemptNumber > 1 && (
                              <span className="text-xs text-gray-500">
                                Attempt #{delivery.attemptNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            To: {delivery.recipientDisplayName} ({delivery.recipientDestinationMasked})
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {formatTimestamp(delivery.createdAt)}
                          </div>
                          {delivery.latencyMs && (
                            <div className="text-xs text-gray-500 mt-1">
                              {formatLatency(delivery.latencyMs)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Details */}
                      {delivery.status === 'DELIVERED' && delivery.deliveredAt && (
                        <div className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Delivered at {formatTimestamp(delivery.deliveredAt)}
                        </div>
                      )}

                      {delivery.status === 'ACKNOWLEDGED' && delivery.acknowledgedAt && (
                        <div className="text-xs text-purple-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Acknowledged at {formatTimestamp(delivery.acknowledgedAt)}
                          {delivery.acknowledgedBy && (
                            <span className="text-gray-600">by {delivery.acknowledgedBy}</span>
                          )}
                        </div>
                      )}

                      {delivery.status === 'FAILED' && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                          <div className="text-xs font-medium text-red-800 mb-1">
                            Error: {delivery.errorCode || 'Unknown'}
                          </div>
                          {delivery.errorMessage && (
                            <div className="text-xs text-red-700">
                              {delivery.errorMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
