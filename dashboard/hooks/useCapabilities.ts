/**
 * Authoritative useCapabilities Hook for Sentinel Grid Dashboard
 * 
 * Fetches and manages platform capability truth from the backend.
 * Provides helper functions to check maturity, runtime health, and usability.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { platformCapabilitiesApi } from '@/lib/api-client';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
  type PlatformCapability,
  type CapabilitySummary,
} from '@/types/platform-capabilities';

export interface UseCapabilitiesReturn {
  /** All capabilities indexed by ID */
  capabilities: Record<string, PlatformCapability>;

  /** Full array of capabilities */
  capabilityList: PlatformCapability[];

  /** Summary statistics */
  summary: CapabilitySummary | null;

  /** Get capability definition by ID */
  getCapability: (id: string) => PlatformCapability | undefined;

  /** Check if capability is marked PRODUCTION maturity */
  isProduction: (id: string) => boolean;

  /** Check if capability is marked BETA maturity */
  isBeta: (id: string) => boolean;

  /** Check if capability is marked EXPERIMENTAL maturity */
  isExperimental: (id: string) => boolean;

  /** Check if capability is implemented (not NOT_IMPLEMENTED) */
  isImplemented: (id: string) => boolean;

  /** Check if capability runtime state is HEALTHY */
  isRuntimeHealthy: (id: string) => boolean;

  /** Check if capability can be actively used by the user */
  canUse: (id: string) => boolean;

  /** Alias for canUse for backward compatibility */
  isAvailable: (id: string) => boolean;

  /** Loading state */
  loading: boolean;

  /** Error message if fetch fails */
  error: string | null;

  /** Manually refresh capabilities from backend */
  refresh: () => Promise<void>;
}

export function useCapabilities(): UseCapabilitiesReturn {
  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapability>>({});
  const [capabilityList, setCapabilityList] = useState<PlatformCapability[]>([]);
  const [summary, setSummary] = useState<CapabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await platformCapabilitiesApi.list();

      if (response && Array.isArray(response.capabilities)) {
        const indexed: Record<string, PlatformCapability> = {};
        for (const cap of response.capabilities) {
          indexed[cap.id] = cap;
        }
        setCapabilities(indexed);
        setCapabilityList(response.capabilities);
        if (response.summary) {
          setSummary(response.summary);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch platform capabilities';
      setError(message);
      console.error('[useCapabilities] Error fetching capabilities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getCapability = useCallback(
    (id: string): PlatformCapability | undefined => {
      return capabilities[id];
    },
    [capabilities]
  );

  const isProduction = useCallback(
    (id: string): boolean => {
      return capabilities[id]?.maturity === CapabilityMaturity.PRODUCTION;
    },
    [capabilities]
  );

  const isBeta = useCallback(
    (id: string): boolean => {
      return capabilities[id]?.maturity === CapabilityMaturity.BETA;
    },
    [capabilities]
  );

  const isExperimental = useCallback(
    (id: string): boolean => {
      return capabilities[id]?.maturity === CapabilityMaturity.EXPERIMENTAL;
    },
    [capabilities]
  );

  const isImplemented = useCallback(
    (id: string): boolean => {
      const cap = capabilities[id];
      return Boolean(cap && cap.maturity !== CapabilityMaturity.NOT_IMPLEMENTED);
    },
    [capabilities]
  );

  const isRuntimeHealthy = useCallback(
    (id: string): boolean => {
      return capabilities[id]?.runtime.state === CapabilityRuntimeState.HEALTHY;
    },
    [capabilities]
  );

  const canUse = useCallback(
    (id: string): boolean => {
      const capability = capabilities[id];
      if (!capability) return false;

      // NOT_IMPLEMENTED features can never be used
      if (capability.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
        return false;
      }

      // Must be healthy or degraded (with warning)
      const state = capability.runtime.state;
      return state === CapabilityRuntimeState.HEALTHY || state === CapabilityRuntimeState.DEGRADED;
    },
    [capabilities]
  );

  return {
    capabilities,
    capabilityList,
    summary,
    getCapability,
    isProduction,
    isBeta,
    isExperimental,
    isImplemented,
    isRuntimeHealthy,
    canUse,
    isAvailable: canUse,
    loading,
    error,
    refresh,
  };
}

/**
 * Convenience hook for a single platform capability
 */
export function useCapability(id: string) {
  const { getCapability, canUse, isProduction, isBeta, isExperimental, isImplemented, isRuntimeHealthy, loading, error } =
    useCapabilities();

  const capability = useMemo(() => getCapability(id), [getCapability, id]);

  return {
    capability,
    usable: canUse(id),
    isProduction: isProduction(id),
    isBeta: isBeta(id),
    isExperimental: isExperimental(id),
    isImplemented: isImplemented(id),
    isHealthy: isRuntimeHealthy(id),
    loading,
    error,
  };
}
