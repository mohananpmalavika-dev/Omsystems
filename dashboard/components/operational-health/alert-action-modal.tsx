/**
 * Alert Action Modal Component
 * Modal for acknowledging, assigning, and resolving alerts
 */

"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle, User, CheckCircle, Wrench } from "lucide-react";
import { OperationalAlert } from "@/lib/types/operational-health";

interface AlertActionModalProps {
  alert: OperationalAlert | null;
  action: 'acknowledge' | 'assign' | 'resolve' | 'work-order' | null;
  onClose: () => void;
  onSubmit: (data: AlertActionSubmission) => Promise<void>;
}

export type AlertActionSubmission = {
  assigneeId?: string;
  note?: string;
  notes?: string;
  resolutionCode?: 'TRUE_POSITIVE_RESOLVED' | 'FALSE_POSITIVE' | 'DUPLICATE' | 'EXPECTED_ACTIVITY' | 'MAINTENANCE_SCHEDULED' | 'OTHER';
  comment?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
};

type Assignee = {
  id: string;
  displayName: string;
  role?: string;
};

export function AlertActionModal({ alert, action, onClose, onSubmit }: AlertActionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  
  // Form state
  const [assigneeId, setAssigneeId] = useState('');
  const [resolutionCode, setResolutionCode] = useState<AlertActionSubmission['resolutionCode']>();
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  useEffect(() => {
    setAssigneeId('');
    setResolutionCode(undefined);
    setNotes('');
    setError(null);
    if (!alert || (action !== 'assign' && action !== 'work-order')) return;

    let cancelled = false;
    setAssigneesLoading(true);
    setAssigneesError(null);
    void fetch('/api/control/v1/users?status=active&limit=100', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Assignee directory is unavailable');
        const payload = await response.json() as { data?: unknown };
        if (!Array.isArray(payload.data)) throw new Error('Invalid assignee directory response');
        const users = payload.data.flatMap((candidate): Assignee[] => {
          if (!candidate || typeof candidate !== 'object') return [];
          const user = candidate as Record<string, unknown>;
          if (typeof user.id !== 'string' || typeof user.displayName !== 'string') return [];
          return [{
            id: user.id,
            displayName: user.displayName,
            ...(typeof user.role === 'string' ? { role: user.role } : {}),
          }];
        });
        if (!cancelled) setAssignees(users);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setAssignees([]);
          setAssigneesError(reason instanceof Error ? reason.message : 'Assignee directory is unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setAssigneesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [alert, action]);

  if (!alert || !action) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let data: AlertActionSubmission = {};

      switch (action) {
        case 'acknowledge':
          data = {};
          break;
        case 'assign':
          if (!assigneeId) {
            setError('Please select an assignee');
            setLoading(false);
            return;
          }
          data = { assigneeId, ...(notes.trim() ? { note: notes.trim() } : {}) };
          break;
        case 'resolve':
          if (!resolutionCode) {
            setError('Please provide a resolution');
            setLoading(false);
            return;
          }
          if (resolutionCode === 'OTHER' && !notes.trim()) {
            setError('Resolution notes are required for Other');
            setLoading(false);
            return;
          }
          data = { resolutionCode, ...(notes.trim() ? { comment: notes.trim() } : {}) };
          break;
        case 'work-order':
          data = { priority, assigneeId: assigneeId || undefined, notes };
          break;
      }

      await onSubmit(data);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete action');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (action) {
      case 'acknowledge': return 'Acknowledge Alert';
      case 'assign': return 'Assign Alert';
      case 'resolve': return 'Resolve Alert';
      case 'work-order': return 'Create Work Order';
      default: return 'Alert Action';
    }
  };

  const getIcon = () => {
    switch (action) {
      case 'acknowledge': return <CheckCircle size={20} className="text-blue-600" />;
      case 'assign': return <User size={20} className="text-purple-600" />;
      case 'resolve': return <CheckCircle size={20} className="text-green-600" />;
      case 'work-order': return <Wrench size={20} className="text-amber-600" />;
      default: return <AlertTriangle size={20} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h2 className="text-lg font-semibold">{getTitle()}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Alert Info */}
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="font-medium text-gray-900 mb-1">{alert.title}</h3>
          <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
              alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {alert.severity}
            </span>
            <span className="text-gray-500">{alert.componentType}</span>
            {alert.branchName && (
              <>
                <span className="text-gray-400">•</span>
                <span className="text-gray-500">{alert.branchName}</span>
              </>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {action === 'acknowledge' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Acknowledging this alert will mark it as seen and update its status.
                You can assign it to a technician or resolve it afterwards.
              </p>
              {alert.recommendedAction && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm font-medium text-blue-900 mb-1">Recommended Action:</p>
                  <p className="text-sm text-blue-700">{alert.recommendedAction}</p>
                </div>
              )}
            </div>
          )}

          {action === 'assign' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Technician *
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={assigneesLoading || Boolean(assigneesError)}
                >
                  <option value="">{assigneesLoading ? 'Loading assignees...' : 'Select an assignee...'}</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.displayName}{assignee.role ? ` — ${assignee.role.replaceAll('_', ' ')}` : ''}
                    </option>
                  ))}
                </select>
                {assigneesError && <p className="mt-2 text-sm text-red-700">{assigneesError}</p>}
                {!assigneesLoading && !assigneesError && assignees.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500">No active assignees are available in your scope.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Note</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Optional context for the assignee"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {alert.recommendedAction && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm font-medium text-blue-900 mb-1">Recommended Action:</p>
                  <p className="text-sm text-blue-700">{alert.recommendedAction}</p>
                </div>
              )}
            </div>
          )}

          {action === 'resolve' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution *
                </label>
                <select
                  value={resolutionCode ?? ''}
                  onChange={(e) => setResolutionCode(e.target.value as AlertActionSubmission['resolutionCode'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select resolution...</option>
                  <option value="TRUE_POSITIVE_RESOLVED">Issue verified and resolved</option>
                  <option value="FALSE_POSITIVE">False positive</option>
                  <option value="DUPLICATE">Duplicate alert</option>
                  <option value="EXPECTED_ACTIVITY">Expected activity</option>
                  <option value="MAINTENANCE_SCHEDULED">Maintenance scheduled</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe what was done to resolve this alert..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {action === 'work-order' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Technician (Optional)
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={assigneesLoading || Boolean(assigneesError)}
                >
                  <option value="">{assigneesLoading ? 'Loading assignees...' : 'Assign later...'}</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.displayName}{assignee.role ? ` — ${assignee.role.replaceAll('_', ' ')}` : ''}
                    </option>
                  ))}
                </select>
                {assigneesError && <p className="mt-2 text-sm text-red-700">{assigneesError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Order Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add any additional notes or instructions for the technician..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Processing...' : getTitle()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
