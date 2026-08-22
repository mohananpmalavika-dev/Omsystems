'use client';

/**
 * Branch Lifecycle Actions Component
 * 
 * Displays lifecycle status badge and available actions for a branch
 */

import { useState } from 'react';
import type { Branch } from '@/lib/types';
import {
  getLifecycleStatusLabel,
  getLifecycleStatusColor,
  getAvailableActions,
} from '@/lib/branch-lifecycle';
import { BranchLifecycleDialog } from './BranchLifecycleDialog';

interface BranchLifecycleActionsProps {
  branch: Branch;
  onUpdate?: (updatedBranch: Branch) => void;
  showActions?: boolean;
}

export function BranchLifecycleActions({
  branch,
  onUpdate,
  showActions = true,
}: BranchLifecycleActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'disable' | 'reactivate' | 'archive' | null>(null);

  const availableActions = getAvailableActions(branch.lifecycleStatus);
  const statusLabel = getLifecycleStatusLabel(branch.lifecycleStatus);
  const statusColor = getLifecycleStatusColor(branch.lifecycleStatus);

  const handleActionClick = (action: 'disable' | 'reactivate' | 'archive') => {
    setSelectedAction(action);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedAction(null);
  };

  const handleSuccess = (updatedBranch: Branch) => {
    if (onUpdate) {
      onUpdate(updatedBranch);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Status Badge */}
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
        {statusLabel}
      </span>

      {/* Action Buttons */}
      {showActions && availableActions.length > 0 && (
        <div className="flex items-center gap-2">
          {availableActions.map((action) => (
            <button
              key={action.action}
              onClick={() => handleActionClick(action.action)}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title={action.description}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Lifecycle Dialog */}
      {selectedAction && (
        <BranchLifecycleDialog
          branch={branch}
          action={selectedAction}
          isOpen={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

/**
 * Compact status badge only (no actions)
 */
export function BranchStatusBadge({ branch }: { branch: Branch }) {
  return <BranchLifecycleActions branch={branch} showActions={false} />;
}
