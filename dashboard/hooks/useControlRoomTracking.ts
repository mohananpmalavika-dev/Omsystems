/**
 * React hook for control room activity tracking
 */

import { useEffect, useRef, useCallback } from 'react';
import { ControlRoomTracker } from '../lib/control-room-tracker';

interface UseControlRoomTrackingOptions {
  apiBaseUrl: string;
  sessionId: string;
  pageVisitId?: string;
  accessToken: string;
  enabled?: boolean;
}

export function useControlRoomTracking(options: UseControlRoomTrackingOptions) {
  const {
    apiBaseUrl,
    sessionId,
    pageVisitId,
    accessToken,
    enabled = true,
  } = options;

  const trackerRef = useRef<ControlRoomTracker | null>(null);

  // Initialize tracker
  useEffect(() => {
    if (!enabled) return;

    trackerRef.current = new ControlRoomTracker({
      apiBaseUrl,
      sessionId,
      pageVisitId,
      accessToken,
    });

    return () => {
      if (trackerRef.current) {
        trackerRef.current.destroy();
      }
    };
  }, [apiBaseUrl, sessionId, pageVisitId, accessToken, enabled]);

  // Update config when accessToken changes
  useEffect(() => {
    if (trackerRef.current && accessToken) {
      trackerRef.current.updateConfig({ accessToken });
    }
  }, [accessToken]);

  const startBranchMonitoring = useCallback(
    async (branchId: string, branchName: string, cameraIds: string[], mode?: 'live' | 'review' | 'investigation') => {
      if (!trackerRef.current) return null;
      return await trackerRef.current.startBranchMonitoring(branchId, branchName, cameraIds, mode);
    },
    []
  );

  const startBranchGroupMonitoring = useCallback(
    async (groupId: string, groupName: string, branchIds: string[], branchNames: string[], cameraIds: string[]) => {
      if (!trackerRef.current) return null;
      return await trackerRef.current.startBranchGroupMonitoring(groupId, groupName, branchIds, branchNames, cameraIds);
    },
    []
  );

  const switchBranch = useCallback(
    async (branchId: string, branchName: string, cameraIds: string[]) => {
      if (!trackerRef.current) return;
      await trackerRef.current.switchBranch(branchId, branchName, cameraIds);
    },
    []
  );

  const endCurrentActivity = useCallback(async () => {
    if (!trackerRef.current) return;
    await trackerRef.current.endCurrentActivity();
  }, []);

  const incrementAlertCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementAlertCount();
  }, []);

  const incrementIncidentCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementIncidentCount();
  }, []);

  const incrementCameraSwitchCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementCameraSwitchCount();
  }, []);

  const incrementPlaybackCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementPlaybackCount();
  }, []);

  const incrementSnapshotCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementSnapshotCount();
  }, []);

  const incrementExportCount = useCallback(() => {
    if (!trackerRef.current) return;
    trackerRef.current.incrementExportCount();
  }, []);

  const getCurrentActivity = useCallback(() => {
    if (!trackerRef.current) return null;
    return trackerRef.current.getCurrentActivity();
  }, []);

  return {
    startBranchMonitoring,
    startBranchGroupMonitoring,
    switchBranch,
    endCurrentActivity,
    incrementAlertCount,
    incrementIncidentCount,
    incrementCameraSwitchCount,
    incrementPlaybackCount,
    incrementSnapshotCount,
    incrementExportCount,
    getCurrentActivity,
  };
}
