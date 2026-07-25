/**
 * Alert Action Modal Component
 * Modal for acknowledging, assigning, and resolving alerts
 */

"use client";

import { useState } from "react";
import { X, AlertTriangle, User, CheckCircle, Wrench } from "lucide-react";
import { OperationalAlert } from "@/lib/types/operational-health";

interface AlertActionModalProps {
  alert: OperationalAlert | null;
  action: 'acknowledge' | 'assign' | 'resolve' | 'work-order' | null;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export function AlertActionModal({ alert, action, onClose, onSubmit }: AlertActionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [assigneeId, setAssigneeId] = useState('');
  const [resolution, setResolution] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  if (!alert || !action) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let data: any = {};

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
          data = { assigneeId };
          break;
        case 'resolve':
          if (!resolution) {
            setError('Please provide a resolution');
            setLoading(false);
            return;
          }
          data = { resolution, notes };
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
                >
                  <option value="">Select a technician...</option>
                  {/* TODO: Fetch technicians from API */}
                  <option value="tech-1">John Smith - Senior Technician</option>
                  <option value="tech-2">Sarah Johnson - Network Specialist</option>
                  <option value="tech-3">Mike Chen - Hardware Engineer</option>
                </select>
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
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select resolution...</option>
                  <option value="fixed">Issue Fixed</option>
                  <option value="replaced">Component Replaced</option>
                  <option value="restarted">Service Restarted</option>
                  <option value="false_positive">False Positive</option>
                  <option value="workaround">Workaround Applied</option>
                  <option value="monitoring">Monitoring</option>
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
                >
                  <option value="">Assign later...</option>
                  <option value="tech-1">John Smith - Senior Technician</option>
                  <option value="tech-2">Sarah Johnson - Network Specialist</option>
                  <option value="tech-3">Mike Chen - Hardware Engineer</option>
                </select>
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
