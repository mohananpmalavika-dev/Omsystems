/**
 * Control Room Activity Tracker
 * Tracks control room monitoring sessions and activities
 * Last updated: 2026-08-09
 */

let currentControlRoomActivityId: string | null = null;
let controlRoomStartPromise: Promise<string | null> | null = null;
let activityMetrics = {
  alertCount: 0,
  incidentCount: 0,
  cameraSwitchCount: 0,
  playbackCount: 0,
  snapshotCount: 0,
  exportCount: 0,
};

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || '/api/control';
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('activityAccessToken') || 
         localStorage.getItem('accessToken') || 
         null;
}

function activityHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers['x-sentinel-session'] = token;
  return headers;
}

/**
 * Start control room monitoring activity
 */
export async function startControlRoomActivity(
  monitoringType: 'single_branch' | 'branch_group' | 'multi_branch' | 'camera' | 'camera_group',
  branchNodeId?: string,
  branchGroupId?: string,
  branchGroupName?: string,
  cameraIds: string[] = [],
  branchIds: string[] = [],
  branchNames: string[] = [],
  monitoringMode: 'live' | 'review' | 'investigation' | 'alert_response' = 'live'
): Promise<string | null> {
  if (currentControlRoomActivityId) return currentControlRoomActivityId;
  if (controlRoomStartPromise) return controlRoomStartPromise;

  const sessionId = sessionStorage.getItem('activitySessionId');
  const pageVisitId = sessionStorage.getItem('currentPageVisitId');
  
  if (!sessionId) {
    console.warn('[ControlRoomTracker] No active session, skipping control room tracking');
    return null;
  }
  
  controlRoomStartPromise = (async () => { try {
    const response = await fetch(`${getApiBase()}/v1/activity/control-room/start`, {
      method: 'POST',
      headers: activityHeaders(true),
      credentials: 'include',
      body: JSON.stringify({
        sessionId,
        pageVisitId: pageVisitId || null,
        monitoringType,
        branchNodeId: branchNodeId || null,
        branchGroupId: branchGroupId || null,
        branchGroupName: branchGroupName || null,
        cameraIds,
        branchIds,
        branchNames,
        monitoringMode,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[ControlRoomTracker] Failed to start control room activity:', {
        status: response.status,
        error: errorData
      });
      return null;
    }
    
    const data = await response.json();
    currentControlRoomActivityId = data.activityId;
    
    // Reset metrics
    activityMetrics = {
      alertCount: 0,
      incidentCount: 0,
      cameraSwitchCount: 0,
      playbackCount: 0,
      snapshotCount: 0,
      exportCount: 0,
    };
    
    console.log('[ControlRoomTracker] Control room activity started:', data.activityId);
    
    return data.activityId;
  } catch (error) {
    console.error('[ControlRoomTracker] Error starting control room activity:', error);
    return null;
  } finally {
    controlRoomStartPromise = null;
  } })();

  return controlRoomStartPromise;
}

/**
 * End control room monitoring activity
 */
export async function endControlRoomActivity(): Promise<void> {
  if (!currentControlRoomActivityId) return;
  
  try {
    // Calculate duration
    const activityId = currentControlRoomActivityId;
    const durationSeconds = 0; // Will be calculated on server based on start time
    
    await fetch(`${getApiBase()}/v1/activity/control-room/${activityId}/end`, {
      method: 'PUT',
      headers: activityHeaders(true),
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        durationSeconds,
        alertCount: activityMetrics.alertCount,
        incidentCount: activityMetrics.incidentCount,
        cameraSwitchCount: activityMetrics.cameraSwitchCount,
        playbackCount: activityMetrics.playbackCount,
        snapshotCount: activityMetrics.snapshotCount,
        exportCount: activityMetrics.exportCount,
      }),
    });
    
    console.log('[ControlRoomTracker] Control room activity ended:', activityId);
  } catch (error) {
    console.error('[ControlRoomTracker] Error ending control room activity:', error);
  } finally {
    currentControlRoomActivityId = null;
    activityMetrics = {
      alertCount: 0,
      incidentCount: 0,
      cameraSwitchCount: 0,
      playbackCount: 0,
      snapshotCount: 0,
      exportCount: 0,
    };
  }
}

/**
 * Update control room activity metrics incrementally
 */
async function updateControlRoomMetrics(
  alertCount?: number,
  incidentCount?: number,
  cameraSwitchCount?: number
): Promise<void> {
  if (!currentControlRoomActivityId) return;
  
  try {
    await fetch(`${getApiBase()}/v1/activity/control-room/${currentControlRoomActivityId}`, {
      method: 'PATCH',
      headers: activityHeaders(true),
      credentials: 'include',
      body: JSON.stringify({
        alertCount,
        incidentCount,
        cameraSwitchCount,
      }),
    });
  } catch (error) {
    console.error('[ControlRoomTracker] Error updating control room metrics:', error);
  }
}

/**
 * Track alert handled in control room
 */
export function trackControlRoomAlert(): void {
  activityMetrics.alertCount++;
  
  // Update server every 5 alerts to reduce API calls
  if (activityMetrics.alertCount % 5 === 0) {
    updateControlRoomMetrics(activityMetrics.alertCount, undefined, undefined);
  }
}

/**
 * Track incident created in control room
 */
export function trackControlRoomIncident(): void {
  activityMetrics.incidentCount++;
  updateControlRoomMetrics(undefined, activityMetrics.incidentCount, undefined);
}

/**
 * Track camera switch in control room
 */
export function trackControlRoomCameraSwitch(): void {
  activityMetrics.cameraSwitchCount++;
  
  // Update server every 10 switches to reduce API calls
  if (activityMetrics.cameraSwitchCount % 10 === 0) {
    updateControlRoomMetrics(undefined, undefined, activityMetrics.cameraSwitchCount);
  }
}

/**
 * Track playback initiated in control room
 */
export function trackControlRoomPlayback(): void {
  activityMetrics.playbackCount++;
}

/**
 * Track snapshot taken in control room
 */
export function trackControlRoomSnapshot(): void {
  activityMetrics.snapshotCount++;
}

/**
 * Track export initiated in control room
 */
export function trackControlRoomExport(): void {
  activityMetrics.exportCount++;
}

/**
 * Get current control room activity ID
 */
export function getCurrentControlRoomActivityId(): string | null {
  return currentControlRoomActivityId;
}

/**
 * Check if control room activity is active
 */
export function isControlRoomActivityActive(): boolean {
  return currentControlRoomActivityId !== null;
}

/**
 * Backwards-compatible object API used by the control-room React hook.
 * The functional tracker above remains the implementation so both call styles
 * share the same active activity and counters.
 */
export class ControlRoomTracker {
  constructor(config: {
    apiBaseUrl: string;
    sessionId: string;
    pageVisitId?: string;
    accessToken: string;
  }) {
    this.updateConfig(config);
  }

  updateConfig(config: Partial<{
    apiBaseUrl: string;
    sessionId: string;
    pageVisitId?: string;
    accessToken: string;
  }>): void {
    if (typeof window === 'undefined') return;
    if (config.sessionId) sessionStorage.setItem('activitySessionId', config.sessionId);
    if (config.pageVisitId) sessionStorage.setItem('currentPageVisitId', config.pageVisitId);
    if (config.accessToken) sessionStorage.setItem('activityAccessToken', config.accessToken);
  }

  startBranchMonitoring(
    branchId: string,
    _branchName: string,
    cameraIds: string[],
    mode: 'live' | 'review' | 'investigation' = 'live',
  ): Promise<string | null> {
    return startControlRoomActivity('single_branch', branchId, undefined, undefined, cameraIds, [branchId], [], mode);
  }

  startBranchGroupMonitoring(
    groupId: string,
    groupName: string,
    branchIds: string[],
    branchNames: string[],
    cameraIds: string[],
  ): Promise<string | null> {
    return startControlRoomActivity('branch_group', undefined, groupId, groupName, cameraIds, branchIds, branchNames);
  }

  async switchBranch(branchId: string, branchName: string, cameraIds: string[]): Promise<void> {
    await endControlRoomActivity();
    await this.startBranchMonitoring(branchId, branchName, cameraIds);
  }

  endCurrentActivity(): Promise<void> {
    return endControlRoomActivity();
  }

  incrementAlertCount(): void { trackControlRoomAlert(); }
  incrementIncidentCount(): void { trackControlRoomIncident(); }
  incrementCameraSwitchCount(): void { trackControlRoomCameraSwitch(); }
  incrementPlaybackCount(): void { trackControlRoomPlayback(); }
  incrementSnapshotCount(): void { trackControlRoomSnapshot(); }
  incrementExportCount(): void { trackControlRoomExport(); }

  getCurrentActivity(): string | null {
    return getCurrentControlRoomActivityId();
  }

  destroy(): void {
    void endControlRoomActivity();
  }
}
