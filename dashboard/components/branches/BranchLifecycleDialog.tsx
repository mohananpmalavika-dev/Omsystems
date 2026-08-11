'use client';

/**
 * Branch Lifecycle Action Dialog
 * 
 * Comprehensive dialog for branch lifecycle operations with impact preview
 * Shows consequences, warnings, and blockers before executing transitions
 */

import { useState, useEffect } from 'react';
import type { Branch, BranchLifecycleStatus, BranchLifecycleImpact } from '@/lib/types';
import {
  branchLifecycleClient,
  formatTransitionDescription,
  getLifecycleStatusLabel,
} from '@/lib/branch-lifecycle';

interface BranchLifecycleDialogProps {
  branch: Branch;
  action: 'disable' | 'reactivate' | 'archive';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedBranch: Branch) => void;
}

export function BranchLifecycleDialog({
  branch,
  action,
  isOpen,
  onClose,
  onSuccess,
}: BranchLifecycleDialogProps) {
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<BranchLifecycleImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine target status based on action
  const targetStatus: BranchLifecycleStatus =
    action === 'disable' ? 'DISABLED' :
    action === 'reactivate' ? 'ACTIVE' :
    'ARCHIVED';

  // Fetch impact analysis when dialog opens
  useEffect(() => {
    if (isOpen && branch.id) {
      setLoading(true);
      setError(null);
      
      branchLifecycleClient
        .getImpact(branch.id, targetStatus)
        .then(setImpact)
        .catch((err) => {
          console.error('Failed to fetch impact:', err);
          setError('Failed to load impact analysis. Please try again.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, branch.id, targetStatus]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setImpact(null);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      setError('Please provide a reason for this action');
      return;
    }
    
    if (!impact?.allowed) {
      setError('This action is blocked. Please resolve the issues listed above.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let result;
      
      if (action === 'disable') {
        result = await branchLifecycleClient.disable(branch.id, reason.trim());
      } else if (action === 'reactivate') {
        result = await branchLifecycleClient.reactivate(branch.id, reason.trim());
      } else {
        result = await branchLifecycleClient.archive(branch.id, reason.trim());
      }

      // Call success callback with updated branch data
      if (onSuccess && result?.data) {
        onSuccess(result.data);
      }

      // Close dialog on success
      onClose();
    } catch (err) {
      console.error(`Failed to ${action} branch:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${action} branch`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const description = impact
    ? formatTransitionDescription(action, impact)
    : null;

  const actionLabels = {
    disable: { verb: 'Disable', gerund: 'Disabling', color: 'yellow' },
    reactivate: { verb: 'Reactivate', gerund: 'Reactivating', color: 'green' },
    archive: { verb: 'Archive', gerund: 'Archiving', color: 'red' },
  };

  const { verb, gerund, color } = actionLabels[action];
  const buttonColor = color === 'red' ? 'bg-red-600 hover:bg-red-700' :
                      color === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-700' :
                      'bg-green-600 hover:bg-green-700';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {description?.title || `${verb} Branch`}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Current status: <span className="font-medium">{getLifecycleStatusLabel(branch.lifecycleStatus)}</span>
            {' → '}
            New status: <span className="font-medium">{getLifecycleStatusLabel(targetStatus)}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Loading state */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-sm text-gray-600">Analyzing impact...</p>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Impact preview */}
            {!loading && description && (
              <>
                {/* Blockers - prevent action */}
                {description.blockers.length > 0 && (
                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-red-800">
                          Action Blocked
                        </h3>
                        <div className="mt-2 text-sm text-red-700">
                          <ul className="list-disc pl-5 space-y-1">
                            {description.blockers.map((blocker, idx) => (
                              <li key={idx}>{blocker}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warnings - informational */}
                {description.warnings.length > 0 && (
                  <div className="rounded-md bg-yellow-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-yellow-800">
                          Warnings
                        </h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <ul className="list-disc pl-5 space-y-1">
                            {description.warnings.map((warning, idx) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Consequences - what will happen */}
                {description.consequences.length > 0 && (
                  <div className="rounded-md bg-blue-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-medium text-blue-800">
                          What will happen
                        </h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <ul className="list-disc pl-5 space-y-1">
                            {description.consequences.map((consequence, idx) => (
                              <li key={idx}>{consequence}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reason input */}
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="reason"
                      name="reason"
                      rows={3}
                      required
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      placeholder={`Explain why you are ${action === 'disable' ? 'disabling' : action === 'reactivate' ? 'reactivating' : 'archiving'} this branch...`}
                      disabled={submitting}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {reason.length}/500 characters
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || !impact?.allowed || !reason.trim()}
              className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${buttonColor} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {gerund}...
                </>
              ) : (
                verb
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
