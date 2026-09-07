/**
 * Alert Card Component
 * Displays operational alert with action buttons
 */

import { AlertTriangle, Clock, User, CheckCircle, Wrench } from "lucide-react";
import { OperationalAlert, getTimeAgo } from "@/lib/types/operational-health";

interface AlertCardProps {
  alert: OperationalAlert;
  onAcknowledge?: (alertId: string) => void;
  onAssign?: (alertId: string) => void;
  onResolve?: (alertId: string) => void;
  onCreateWorkOrder?: (alertId: string) => void;
  compact?: boolean;
}

export function AlertCard({ 
  alert, 
  onAcknowledge, 
  onAssign, 
  onResolve,
  onCreateWorkOrder,
  compact = false 
}: AlertCardProps) {
  const getSeverityColor = () => {
    switch (alert.severity) {
      case 'critical': return 'bg-red-50 border-red-200';
      case 'warning': return 'bg-amber-50 border-amber-200';
      case 'info': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getSeverityBadge = () => {
    const colors = {
      critical: 'bg-red-100 text-red-700',
      warning: 'bg-amber-100 text-amber-700',
      info: 'bg-blue-100 text-blue-700'
    };
    return colors[alert.severity];
  };

  const getStatusBadge = () => {
    const colors = {
      active: 'bg-gray-100 text-gray-700',
      acknowledged: 'bg-blue-100 text-blue-700',
      assigned: 'bg-purple-100 text-purple-700',
      resolved: 'bg-green-100 text-green-700',
      suppressed: 'bg-gray-100 text-gray-500',
      reopened: 'bg-amber-100 text-amber-700',
      closed: 'bg-gray-100 text-gray-500'
    };
    return colors[alert.status];
  };

  return (
    <div className={`border rounded-lg p-4 ${getSeverityColor()}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle 
            size={20} 
            className={`flex-shrink-0 mt-0.5 ${
              alert.severity === 'critical' ? 'text-red-600' :
              alert.severity === 'warning' ? 'text-amber-600' :
              'text-blue-600'
            }`}
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 mb-1">{alert.title}</h4>
            {!compact && (
              <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${getSeverityBadge()}`}>
                {alert.severity}
              </span>
              <span className={`px-2 py-0.5 rounded-full font-medium ${getStatusBadge()}`}>
                {alert.status}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                {alert.componentType}
              </span>
            </div>
          </div>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {getTimeAgo(alert.detectedAt)}
        </span>
      </div>

      {/* Details */}
      {!compact && (
        <div className="space-y-2 mb-3 text-sm">
          {alert.branchName && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 min-w-[80px]">Branch:</span>
              <span className="font-medium">{alert.branchName} ({alert.branchCode})</span>
            </div>
          )}
          {alert.impact && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 min-w-[80px]">Impact:</span>
              <span>{alert.impact}</span>
            </div>
          )}
          {alert.recommendedAction && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 min-w-[80px]">Action:</span>
              <span className="font-medium">{alert.recommendedAction}</span>
            </div>
          )}
          {alert.slaDeadline && (
            <div className="flex items-start gap-2">
              <span className="text-gray-500 min-w-[80px]">SLA:</span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {getTimeAgo(alert.slaDeadline)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Assignment/Resolution Info */}
      {(alert.acknowledgedByName || alert.assignedToName || alert.resolvedByName) && (
        <div className="space-y-1 mb-3 text-xs text-gray-600">
          {alert.acknowledgedByName && (
            <div className="flex items-center gap-2">
              <CheckCircle size={12} />
              <span>Acknowledged by {alert.acknowledgedByName} • {getTimeAgo(alert.acknowledgedAt!)}</span>
            </div>
          )}
          {alert.assignedToName && (
            <div className="flex items-center gap-2">
              <User size={12} />
              <span>Assigned to {alert.assignedToName} • {getTimeAgo(alert.assignedAt!)}</span>
            </div>
          )}
          {alert.resolvedByName && (
            <div className="flex items-center gap-2">
              <CheckCircle size={12} className="text-green-600" />
              <span>Resolved by {alert.resolvedByName} • {getTimeAgo(alert.resolvedAt!)}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {(alert.status === 'active' || alert.status === 'reopened') && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-current/10">
          {onAcknowledge && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="btn-sm btn-secondary flex items-center gap-1"
            >
              <CheckCircle size={14} />
              Acknowledge
            </button>
          )}
          {onAssign && (
            <button
              onClick={() => onAssign(alert.id)}
              className="btn-sm btn-secondary flex items-center gap-1"
            >
              <User size={14} />
              Assign
            </button>
          )}
          {onResolve && (
            <button
              onClick={() => onResolve(alert.id)}
              className="btn-sm btn-secondary flex items-center gap-1"
            >
              <CheckCircle size={14} />
              Resolve
            </button>
          )}
          {onCreateWorkOrder && !alert.workOrderId && (
            <button
              onClick={() => onCreateWorkOrder(alert.id)}
              className="btn-sm btn-primary flex items-center gap-1"
            >
              <Wrench size={14} />
              Create Work Order
            </button>
          )}
          {alert.workOrderId && (
            <a
              href={`/maintenance/workorders/${alert.workOrderId}`}
              className="btn-sm btn-secondary flex items-center gap-1"
            >
              <Wrench size={14} />
              View Work Order
            </a>
          )}
        </div>
      )}

      {(alert.status === 'acknowledged' || alert.status === 'assigned') && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-current/10">
          {onResolve && (
            <button
              onClick={() => onResolve(alert.id)}
              className="btn-sm btn-primary flex items-center gap-1"
            >
              <CheckCircle size={14} />
              Resolve
            </button>
          )}
          {onCreateWorkOrder && !alert.workOrderId && (
            <button
              onClick={() => onCreateWorkOrder(alert.id)}
              className="btn-sm btn-secondary flex items-center gap-1"
            >
              <Wrench size={14} />
              Create Work Order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
