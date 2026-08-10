/**
 * Commander API Hook
 * React hook for interacting with Security Commander API
 */

import { useState, useCallback } from 'react';
import type {
  Investigation,
  CommanderResponse,
} from '../../types';
import type { ApiResponse } from '../types/ui-types';

// API configuration
const API_BASE_URL = process.env.REACT_APP_COMMANDER_API_URL || 'http://localhost:3000/api/security-commander';

// API client hook
export function useCommanderApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Execute natural language query
  const executeQuery = useCallback(async (query: string): Promise<ApiResponse<CommanderResponse>> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: CommanderResponse = await response.json();
      return { data, loading: false };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return { error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, []);

  // Get investigation by ID
  const getInvestigation = useCallback(async (id: string): Promise<ApiResponse<Investigation>> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/investigations/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: Investigation = await response.json();
      return { data, loading: false };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return { error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, []);

  // List recent investigations
  const listInvestigations = useCallback(async (limit = 20): Promise<ApiResponse<Investigation[]>> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/investigations?limit=${limit}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: Investigation[] = await response.json();
      return { data, loading: false };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return { error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, []);

  // Check health status
  const checkHealth = useCallback(async (): Promise<ApiResponse<{
    database: boolean;
    llm: boolean;
    timestamp: string;
  }>> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { data, loading: false };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return { error: errorMessage, loading: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    executeQuery,
    getInvestigation,
    listInvestigations,
    checkHealth,
    loading,
    error,
  };
}
