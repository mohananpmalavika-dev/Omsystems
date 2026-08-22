/**
 * Operational Health API Client
 * 
 * Production-ready API client for branch operational health dashboard.
 * Uses native fetch with proper error handling and type safety.
 */

import {
  BranchOperationalHealth,
  BranchMosaicItem,
  BranchHealthFilter,
  OperationalDashboardSummary,
} from '../../types/operational-health.types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

/**
 * API client for operational health endpoints
 */
export class OperationalHealthAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get dashboard summary KPIs
   */
  async getDashboardSummary(): Promise<OperationalDashboardSummary> {
    const response = await fetch(`${this.baseUrl}/operational-health/dashboard`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard summary: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get branch health mosaic items (optimized for 400+ branches)
   */
  async getBranchMosaicItems(filter?: BranchHealthFilter): Promise<BranchMosaicItem[]> {
    const params = this.buildFilterParams(filter);
    const url = `${this.baseUrl}/operational-health/branches?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch branch mosaic: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data.branches;
  }

  /**
   * Get complete health for a single branch
   */
  async getBranchHealth(branchId: string): Promise<BranchOperationalHealth> {
    const response = await fetch(
      `${this.baseUrl}/operational-health/branches/${branchId}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch branch health: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Refresh health for a specific branch
   */
  async refreshBranchHealth(branchId: string): Promise<BranchOperationalHealth> {
    const response = await fetch(
      `${this.baseUrl}/operational-health/branches/${branchId}/refresh`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to refresh branch health: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Refresh health for all branches (admin only)
   */
  async refreshAllBranches(): Promise<{ jobId: string; message: string }> {
    const response = await fetch(
      `${this.baseUrl}/operational-health/refresh-all`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to refresh all branches: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Get health state transition history for a branch
   */
  async getBranchHistory(
    branchId: string,
    options?: { startDate?: string; endDate?: string; limit?: number }
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    if (options?.limit) params.append('limit', options.limit.toString());

    const url = `${this.baseUrl}/operational-health/branches/${branchId}/history?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch branch history: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data.history;
  }

  /**
   * Get recent health change events
   */
  async getHealthChangeEvents(options?: { since?: string; limit?: number }): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.since) params.append('since', options.since);
    if (options?.limit) params.append('limit', options.limit.toString());

    const url = `${this.baseUrl}/operational-health/events?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data.events;
  }

  /**
   * Get operational health statistics
   */
  async getHealthStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/operational-health/stats`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch health stats: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Build URL query parameters from filter object
   */
  private buildFilterParams(filter?: BranchHealthFilter): string {
    if (!filter) return '';

    const params = new URLSearchParams();

    if (filter.states) {
      filter.states.forEach(state => params.append('states', state));
    }

    if (filter.internetStates) {
      filter.internetStates.forEach(state => params.append('internetStates', state));
    }

    if (filter.recorderStates) {
      filter.recorderStates.forEach(state => params.append('recorderStates', state));
    }

    if (filter.storageStates) {
      filter.storageStates.forEach(state => params.append('storageStates', state));
    }

    if (filter.retentionViolation) {
      params.append('retentionViolation', 'true');
    }

    if (filter.recordingProblem) {
      params.append('recordingProblem', 'true');
    }

    if (filter.cameraOffline) {
      params.append('cameraOffline', 'true');
    }

    if (filter.p1Only) {
      params.append('p1Only', 'true');
    }

    if (filter.regionIds) {
      filter.regionIds.forEach(id => params.append('regionIds', id));
    }

    if (filter.reasonCodes) {
      filter.reasonCodes.forEach(code => params.append('reasonCodes', code));
    }

    if (filter.search) {
      params.append('search', filter.search);
    }

    return params.toString();
  }
}

// Singleton instance
export const operationalHealthAPI = new OperationalHealthAPI();
