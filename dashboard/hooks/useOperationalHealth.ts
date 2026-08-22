/**
 * React Hooks for Operational Health
 * 
 * Production-ready hooks with proper error handling, loading states,
 * and automatic refresh capabilities.
 */

import { useState, useEffect, useCallback } from 'react';
import { operationalHealthAPI } from '../lib/api/operational-health.api';
import {
  BranchOperationalHealth,
  BranchMosaicItem,
  BranchHealthFilter,
  OperationalDashboardSummary,
} from '../types/operational-health.types';

/**
 * Hook for dashboard summary KPIs
 */
export function useDashboardSummary(refreshInterval?: number) {
  const [summary, setSummary] = useState<OperationalDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await operationalHealthAPI.getDashboardSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard summary');
      console.error('Dashboard summary error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();

    // Auto-refresh if interval specified
    if (refreshInterval && refreshInterval > 0) {
      const intervalId = setInterval(fetchSummary, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchSummary, refreshInterval]);

  return {
    summary,
    loading,
    error,
    refresh: fetchSummary,
  };
}

/**
 * Hook for branch health mosaic
 */
export function useBranchMosaic(filter?: BranchHealthFilter, refreshInterval?: number) {
  const [branches, setBranches] = useState<BranchMosaicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await operationalHealthAPI.getBranchMosaicItems(filter);
      setBranches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branch health');
      console.error('Branch mosaic error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBranches();

    // Auto-refresh if interval specified
    if (refreshInterval && refreshInterval > 0) {
      const intervalId = setInterval(fetchBranches, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchBranches, refreshInterval]);

  return {
    branches,
    loading,
    error,
    refresh: fetchBranches,
  };
}

/**
 * Hook for single branch health detail
 */
export function useBranchHealth(branchId: string | null, refreshInterval?: number) {
  const [health, setHealth] = useState<BranchOperationalHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!branchId) {
      setHealth(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await operationalHealthAPI.getBranchHealth(branchId);
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branch health');
      console.error('Branch health error:', err);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const refreshHealth = useCallback(async () => {
    if (!branchId) return;

    try {
      const data = await operationalHealthAPI.refreshBranchHealth(branchId);
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh branch health');
      console.error('Branch health refresh error:', err);
    }
  }, [branchId]);

  useEffect(() => {
    fetchHealth();

    // Auto-refresh if interval specified
    if (refreshInterval && refreshInterval > 0 && branchId) {
      const intervalId = setInterval(fetchHealth, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchHealth, refreshInterval, branchId]);

  return {
    health,
    loading,
    error,
    refresh: fetchHealth,
    forceRefresh: refreshHealth,
  };
}

/**
 * Hook for branch history
 */
export function useBranchHistory(
  branchId: string | null,
  options?: { startDate?: string; endDate?: string; limit?: number }
) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!branchId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await operationalHealthAPI.getBranchHistory(branchId, options);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branch history');
      console.error('Branch history error:', err);
    } finally {
      setLoading(false);
    }
  }, [branchId, options]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    loading,
    error,
    refresh: fetchHistory,
  };
}

/**
 * Hook for health change events
 */
export function useHealthChangeEvents(
  options?: { since?: string; limit?: number },
  refreshInterval?: number
) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await operationalHealthAPI.getHealthChangeEvents(options);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
      console.error('Events error:', err);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    fetchEvents();

    // Auto-refresh if interval specified
    if (refreshInterval && refreshInterval > 0) {
      const intervalId = setInterval(fetchEvents, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchEvents, refreshInterval]);

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
  };
}
