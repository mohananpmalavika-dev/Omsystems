/**
 * Branch Lifecycle Utilities
 * 
 * Helper functions and constants for branch lifecycle management
 */

import type { BranchLifecycleStatus, BranchLifecycleImpact } from './types';

/**
 * Get user-friendly display label for lifecycle status
 */
export function getLifecycleStatusLabel(status: BranchLifecycleStatus | undefined): string {
  if (!status || status === 'ACTIVE') return 'Active';
  if (status === 'DISABLED') return 'Disabled';
  if (status === 'ARCHIVED') return 'Archived';
  return 'Unknown';
}

/**
 * Get color class for lifecycle status badge
 */
export function getLifecycleStatusColor(status: BranchLifecycleStatus | undefined): string {
  if (!status || status === 'ACTIVE') return 'bg-green-100 text-green-800';
  if (status === 'DISABLED') return 'bg-yellow-100 text-yellow-800';
  if (status === 'ARCHIVED') return 'bg-gray-100 text-gray-800';
  return 'bg-gray-100 text-gray-600';
}

/**
 * Get available lifecycle actions for current status
 */
export function getAvailableActions(status: BranchLifecycleStatus | undefined): Array<{
  action: 'disable' | 'reactivate' | 'archive';
  label: string;
  description: string;
}> {
  const currentStatus = status || 'ACTIVE';
  
  if (currentStatus === 'ACTIVE') {
    return [
      {
        action: 'disable',
        label: 'Disable Branch',
        description: 'Temporarily stop monitoring this branch. History will be preserved.',
      },
    ];
  }
  
  if (currentStatus === 'DISABLED') {
    return [
      {
        action: 'reactivate',
        label: 'Reactivate Branch',
        description: 'Resume monitoring operations for this branch.',
      },
      {
        action: 'archive',
        label: 'Archive Branch',
        description: 'Permanently remove from operations. History will be retained.',
      },
    ];
  }
  
  // ARCHIVED - no actions available (terminal state)
  return [];
}

/**
 * Check if branch can be modified based on lifecycle status
 */
export function canModifyBranch(status: BranchLifecycleStatus | undefined): boolean {
  return !status || status === 'ACTIVE' || status === 'DISABLED';
}

/**
 * Check if branch can receive new monitoring operations
 */
export function canMonitorBranch(status: BranchLifecycleStatus | undefined): boolean {
  return !status || status === 'ACTIVE';
}

/**
 * Format lifecycle transition description for UI
 */
export function formatTransitionDescription(
  action: 'disable' | 'reactivate' | 'archive',
  impact: BranchLifecycleImpact
): {
  title: string;
  consequences: string[];
  warnings: string[];
  blockers: string[];
} {
  const consequences: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  
  if (action === 'disable') {
    if (impact.impact.cameras > 0) {
      consequences.push(`${impact.impact.cameras} camera(s) will stop being monitored`);
    }
    if (impact.impact.recorders > 0) {
      consequences.push(`${impact.impact.recorders} recorder(s) will stop being polled`);
    }
    if (impact.impact.scheduledJobs > 0) {
      consequences.push(`${impact.impact.scheduledJobs} scheduled job(s) will be suspended`);
    }
    consequences.push('Historical recordings, incidents and audit logs will remain available');
    
    if (impact.impact.activeAlerts > 0) {
      warnings.push(`${impact.impact.activeAlerts} active alert(s) will be suppressed`);
    }
  }
  
  if (action === 'reactivate') {
    consequences.push('Monitoring operations will resume');
    if (impact.impact.cameras > 0) {
      consequences.push(`${impact.impact.cameras} camera(s) will be monitored again`);
    }
    if (impact.impact.recorders > 0) {
      consequences.push(`${impact.impact.recorders} recorder(s) will be polled again`);
    }
  }
  
  if (action === 'archive') {
    consequences.push('Branch will be removed from operational views');
    consequences.push('Cannot receive new devices or monitoring jobs');
    consequences.push('Historical evidence will be retained according to retention policy');
    
    if (impact.impact.cameras > 0) {
      warnings.push(`${impact.impact.cameras} camera(s) will be affected`);
    }
  }
  
  // Add blockers from impact analysis
  for (const blocker of impact.blockers) {
    blockers.push(blocker.message);
  }
  
  // Add warnings from impact analysis
  for (const warning of impact.warnings) {
    warnings.push(warning.message);
  }
  
  const titles = {
    disable: `Disable ${impact.branchName}?`,
    reactivate: `Reactivate ${impact.branchName}?`,
    archive: `Archive ${impact.branchName}?`,
  };
  
  return {
    title: titles[action],
    consequences,
    warnings,
    blockers,
  };
}

/**
 * API client for branch lifecycle operations
 */
export class BranchLifecycleClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = '/api/admin/system/branches') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Get lifecycle impact analysis
   */
  async getImpact(
    branchId: string,
    targetStatus: BranchLifecycleStatus
  ): Promise<BranchLifecycleImpact> {
    const response = await fetch(
      `${this.baseUrl}/${branchId}/lifecycle-impact?targetStatus=${targetStatus}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch impact' }));
      throw new Error(error.message || 'Failed to fetch lifecycle impact');
    }
    
    const result = await response.json();
    return result.data || result;
  }
  
  /**
   * Disable a branch
   */
  async disable(branchId: string, reason: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/${branchId}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to disable branch' }));
      throw new Error(error.message || 'Failed to disable branch');
    }
    
    return response.json();
  }
  
  /**
   * Reactivate a branch
   */
  async reactivate(branchId: string, reason: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/${branchId}/reactivate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to reactivate branch' }));
      throw new Error(error.message || 'Failed to reactivate branch');
    }
    
    return response.json();
  }
  
  /**
   * Archive a branch
   */
  async archive(branchId: string, reason: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/${branchId}/archive`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to archive branch' }));
      throw new Error(error.message || 'Failed to archive branch');
    }
    
    return response.json();
  }
}

// Export singleton instance
export const branchLifecycleClient = new BranchLifecycleClient();
