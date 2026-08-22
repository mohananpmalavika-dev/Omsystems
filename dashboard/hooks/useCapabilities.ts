/**
 * useCapabilities Hook
 * 
 * React hook for checking feature availability before rendering UI components.
 * 
 * Usage:
 * ```tsx
 * const { isAvailable, capabilities } = useCapabilities();
 * 
 * // Hide unavailable features
 * {isAvailable('analytics.export.pdf') && (
 *   <button onClick={exportPDF}>Export PDF</button>
 * )}
 * 
 * // Show availability status
 * {capabilities['video.timeline']?.state === 'UNAVAILABLE' && (
 *   <div>Timeline feature coming in next release</div>
 * )}
 * ```
 */

import { useState, useEffect, useCallback } from 'react';

export type CapabilityState = 
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'DISABLED';

export interface CapabilityInfo {
  id: string;
  name: string;
  state: CapabilityState;
  reason?: string;
  since?: string;
  dependencies?: string[];
}

interface CapabilitiesResponse {
  success: boolean;
  capabilities: CapabilityInfo[];
  timestamp: string;
}

interface UseCapabilitiesReturn {
  /** All capabilities indexed by ID */
  capabilities: Record<string, CapabilityInfo>;
  
  /** Check if a capability is available */
  isAvailable: (id: string) => boolean;
  
  /** Check if capability is partially available */
  isPartial: (id: string) => boolean;
  
  /** Check if capability is unavailable */
  isUnavailable: (id: string) => boolean;
  
  /** Get capability info */
  getCapability: (id: string) => CapabilityInfo | undefined;
  
  /** Loading state */
  loading: boolean;
  
  /** Error state */
  error: string | null;
  
  /** Refresh capabilities */
  refresh: () => Promise<void>;
}

/**
 * Fetch capabilities from backend
 */
async function fetchCapabilities(): Promise<CapabilitiesResponse> {
  const response = await fetch('/api/capabilities', {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * useCapabilities Hook
 * 
 * Fetches and caches capability availability information from backend.
 */
export function useCapabilities(): UseCapabilitiesReturn {
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetchCapabilities();
      
      // Index capabilities by ID
      const indexed: Record<string, CapabilityInfo> = {};
      for (const capability of response.capabilities) {
        indexed[capability.id] = capability;
      }
      
      setCapabilities(indexed);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch capabilities:', err);
      
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  // Helper functions
  const isAvailable = useCallback((id: string): boolean => {
    return capabilities[id]?.state === 'AVAILABLE';
  }, [capabilities]);
  
  const isPartial = useCallback((id: string): boolean => {
    return capabilities[id]?.state === 'PARTIAL';
  }, [capabilities]);
  
  const isUnavailable = useCallback((id: string): boolean => {
    const state = capabilities[id]?.state;
    return state === 'UNAVAILABLE' || state === 'DISABLED' || state === undefined;
  }, [capabilities]);
  
  const getCapability = useCallback((id: string): CapabilityInfo | undefined => {
    return capabilities[id];
  }, [capabilities]);
  
  return {
    capabilities,
    isAvailable,
    isPartial,
    isUnavailable,
    getCapability,
    loading,
    error,
    refresh
  };
}

/**
 * useCapability Hook
 * 
 * Check a single capability (simplified version).
 * 
 * Usage:
 * ```tsx
 * const { available, partial, info } = useCapability('analytics.export.pdf');
 * 
 * if (!available && !partial) {
 *   return null; // Hide feature
 * }
 * ```
 */
export function useCapability(id: string) {
  const { capabilities, isAvailable, isPartial, isUnavailable, loading, error } = useCapabilities();
  
  return {
    available: isAvailable(id),
    partial: isPartial(id),
    unavailable: isUnavailable(id),
    info: capabilities[id],
    loading,
    error
  };
}
