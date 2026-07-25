"use client";

import { useEffect, useState } from "react";
import { 
  AlertTriangle, 
  Filter, 
  RefreshCw, 
  Download,
  ChevronDown 
} from "lucide-react";
import { 
  OperationalAlert,
  AlertFilters,
  AlertSeverity,
  AlertStatus
} from "@/lib/types/operational-health";
import { 
  fetchOperationalAlerts,
  acknowledgeAlert,
  assignAlert,
  resolveAlert,
  createWorkOrderFromAlert
} from "@/lib/api/operational-health";
import { AlertCard } from "@/components/operational-health/alert-card";
import { AlertActionModal } from "@/components/operational-health/alert-action-modal";

type ActionType = 'acknowledge' | 'assign' | 'resolve' | 'work-order' | null;

export default function OperationalAlertsPage() {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<OperationalAlert | null>(null);
  const [modalAction, setModalAction] = useState<ActionType>(null);
  
  // Filters
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [status, setStatus] = useState<AlertStatus | ''>('active');
  const [component, setComponent] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const filters: AlertFilters = {
        limit: 100,
        offset: 0
      };
      
      if (severity) filters.severity = severity;
      if (status) filters.status = status;
      if (component) filters.component = component;
      
      const data = await fetchOperationalAlerts(filters);
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [severity, status, component]);

  const handleAcknowledge = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      setSelectedAlert(alert);
      setModalAction('acknowledge');
    }
  };

  const handleAssign = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      setSelectedAlert(alert);
      setModalAction('assign');
    }
  };

  const handleResolve = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      setSelectedAlert(alert);
      setModalAction('resolve');
    }
  };

  const handleCreateWorkOrder = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      setSelectedAlert(alert);
      setModalAction('work-order');
    }
  };

  const handleModalSubmit = async (data: any) => {
    if (!selectedAlert) return;

    try {
      switch (modalAction) {
        case 'acknowledge':
          await acknowledgeAlert(selectedAlert.id);
          break;
        case 'assign':
          await assignAlert(selectedAlert.id, { 
            assigneeId: data.assigneeId,
            assignedBy: 'current-user-id' // TODO: Get from auth context
          });
          break;
        case 'resolve':
          await resolveAlert(selectedAlert.id, {
            userId: 'current-user-id', // TODO: Get from auth context
            resolution: data.resolution,
            notes: data.notes
          });
          break;
        case 'work-order':
          await createWorkOrderFromAlert(selectedAlert.id, data);
          break;
      }
      
      // Refresh alerts
      await fetchAlerts();
      setSelectedAlert(null);
      setModalAction(null);
    } catch (error) {
      throw error;
    }
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const activeCount = alerts.filter(a => a.status === 'active').length;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Operational Alerts</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              {criticalCount} Critical
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              {warningCount} Warning
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
              {activeCount} Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2"
          >
            <Filter size={16} />
            Filters
            <ChevronDown size={14} className={showFilters ? 'rotate-180' : ''} />
          </button>
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="assigned">Assigned</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Component
              </label>
              <select
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All Components</option>
                <option value="camera">Camera</option>
                <option value="recording">Recording</option>
                <option value="storage">Storage</option>
                <option value="network">Network</option>
                <option value="ups">UPS</option>
                <option value="edge_agent">Edge Agent</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Alerts List */}
      {loading && alerts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-gray-400" size={32} />
            <p className="text-gray-500">Loading alerts...</p>
          </div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="card text-center py-12">
          <AlertTriangle size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 text-lg mb-2">No alerts found</p>
          <p className="text-sm text-gray-400">
            {severity || status || component
              ? 'Try adjusting your filters'
              : 'All systems are operating normally'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onAssign={handleAssign}
              onResolve={handleResolve}
              onCreateWorkOrder={handleCreateWorkOrder}
            />
          ))}
        </div>
      )}

      {/* Action Modal */}
      <AlertActionModal
        alert={selectedAlert}
        action={modalAction}
        onClose={() => {
          setSelectedAlert(null);
          setModalAction(null);
        }}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
