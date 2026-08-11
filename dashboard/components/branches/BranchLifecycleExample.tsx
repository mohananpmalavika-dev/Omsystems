'use client';

/**
 * Example Usage of Branch Lifecycle Components
 * 
 * This file shows how to integrate lifecycle management into branch views
 */

import { BranchLifecycleActions, BranchStatusBadge } from './BranchLifecycleActions';
import type { Branch } from '@/lib/types';

/**
 * Example: Branch List Item with Lifecycle Status
 */
export function BranchListItem({ branch, onUpdate }: { branch: Branch; onUpdate?: (b: Branch) => void }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 hover:bg-gray-50">
      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-900">{branch.name}</h3>
        <p className="text-sm text-gray-500">
          {branch.cameraCount || 0} cameras · {branch.onlineCount || 0} online
        </p>
      </div>
      
      <BranchLifecycleActions branch={branch} onUpdate={onUpdate} />
    </div>
  );
}

/**
 * Example: Branch Detail Header with Full Lifecycle Controls
 */
export function BranchDetailHeader({ branch, onUpdate }: { branch: Branch; onUpdate?: (b: Branch) => void }) {
  return (
    <div className="bg-white shadow">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {branch.name}
            </h2>
            <div className="mt-2 flex items-center gap-4">
              <BranchStatusBadge branch={branch} />
              {branch.disabledAt && (
                <span className="text-sm text-gray-500">
                  Disabled {new Date(branch.disabledAt).toLocaleDateString()}
                </span>
              )}
              {branch.archivedAt && (
                <span className="text-sm text-gray-500">
                  Archived {new Date(branch.archivedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <BranchLifecycleActions branch={branch} onUpdate={onUpdate} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Example: Branch Table Row with Inline Status
 */
export function BranchTableRow({ branch, onUpdate }: { branch: Branch; onUpdate?: (b: Branch) => void }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {branch.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <BranchStatusBadge branch={branch} />
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {branch.cameraCount || 0}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {branch.onlineCount || 0}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <BranchLifecycleActions branch={branch} onUpdate={onUpdate} showActions={true} />
      </td>
    </tr>
  );
}
