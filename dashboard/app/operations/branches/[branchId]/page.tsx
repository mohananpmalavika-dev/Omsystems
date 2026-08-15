/**
 * Branch Command Center Page
 * 
 * Complete operational workspace for a single branch showing:
 * - Overall health and "why is this branch critical"
 * - Internet, Gateway, Recorder, Storage, Cameras, Recording, Retention, Alerts
 * - Live camera wall with operational state badges
 * - Recent operational events timeline
 * - Deep-dive modals for storage, network, retention
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BranchCommandCenter } from '@/components/branch-command-center/branch-command-center';
import { BranchOperationalSnapshot } from '@/types/branch-operational-snapshot';

export default function BranchCommandCenterPage() {
  const params = useParams<{ branchId?: string }>();
  const searchParams = useSearchParams();
  const branchId = params?.branchId ?? '';

  const [snapshot, setSnapshot] = useState<BranchOperationalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // URL state
  const search = searchParams ?? new URLSearchParams();
  const focusedCamera = search.get('camera');
  const filter = search.get('filter');
  const tab = search.get('tab');

  useEffect(() => {
    if (!branchId) {
      setError('Branch ID is missing.');
      setLoading(false);
      return;
    }

    fetchSnapshot();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSnapshot(false);
    }, 30_000);

    return () => clearInterval(interval);
  }, [branchId]);

  const fetchSnapshot = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      const response = await fetch(
        `/api/v1/branches/${branchId}/operational-snapshot`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch branch snapshot');
      }

      const result = await response.json();
      
      if (result.success) {
        setSnapshot(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to load branch data');
      }
    } catch (err) {
      console.error('Error fetching branch snapshot:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchSnapshot(true);
  };

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading branch operations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Failed to Load Branch
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => fetchSnapshot()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!branchId) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Missing Branch Route
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            This branch page could not resolve a valid branch ID.
          </p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <BranchCommandCenter
      snapshot={snapshot}
      onRefresh={handleRefresh}
      focusedCamera={focusedCamera || undefined}
      initialFilter={filter || undefined}
      initialTab={tab || undefined}
    />
  );
}
