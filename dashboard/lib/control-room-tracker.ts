/**
 * Control Room Activity Tracker
 * Tracks branch and camera monitoring activities in the control room
 */

interface ControlRoomActivity {
  activityId: string;
  startTime: Date;
  monitoringType: 'single_branch' | 'branch_group' | 'multi_branch' | 'camera' | 'camera_group';
  branchNodeId?: string;
  branchGroupId?: string;
  branchGroupName?: string;
  cameraIds: string[];
  branchIds: string[];
  branchNames: string[];
  alertCount: number;
  incidentCount: number;
  cameraSwitchCount: number;
  playbackCount: number;
  snapshotCount: number;
  exportCount: number;
}

interface ControlRoomTrackerConfig {
  apiBaseUrl: string;
  sessionId: string;
  pageVisitId?: string;
  accessToken: string;
}

export class ControlRoomTracker {
  private config: ControlRoomTrackerConfig;
  private currentActivity: ControlRoomActivity | null = null;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(config: ControlRoomTrackerConfig) {
    this.config = config;
  }

  /**
   * Start monitoring a branch
   */
  async startBranchMonitoring(
    branchId: string,
    branchName: string,
    cameraIds: string[],
    monitoringMode: 'live' | 'review' | 'investigation' = 'live'
  ) {
    // End previous activity
    await this.endCurrentActivity();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/v1/activity/control-room/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          pageVisitId: this.config.pageVisitId,
          monitoringType: 'single_branch',
          branchNodeId: branchId,
          cameraIds,
          branchIds: [branchId],
          branchNames: [branchName],
          monitoringMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start branch monitoring');
      }

      const data = await response.json();
      
      this.currentActivity = {
        activityId: data.activityId,
        startTime: new Date(),
        monitoringType: 'single_branch',
        branchNodeId: branchId,
        cameraIds,
        branchIds: [branchId],
        branchNames: [branchName],
        alertCount: 0,
        incidentCount: 0,
        cameraSwitchCount: 0,
        playbackCount: 0,
        snapshotCount: 0,
        exportCount: 0,
      };

      // Start periodic updates
      this.startPeriodicUpdates();

      console.log('[ControlRoomTracker] Started monitoring branch:', branchName);
      return data.activityId;
    } catch (error) {
      console.error('Error starting branch monitoring:', error);
      return null;
    }
  }

  /**
   * Start monitoring a branch group
   */
  async startBranchGroupMonitoring(
    groupId: string,
    groupName: string,
    branchIds: string[],
    branchNames: string[],
    cameraIds: string[]
  ) {
    await this.endCurrentActivity();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/v1/activity/control-room/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          pageVisitId: this.config.pageVisitId,
          monitoringType: 'branch_group',
          branchGroupId: groupId,
          branchGroupName: groupName,
          cameraIds,
          branchIds,
          branchNames,
          monitoringMode: 'live',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start branch group monitoring');
      }

      const data = await response.json();
      
      this.currentActivity = {
        activityId: data.activityId,
        startTime: new Date(),
        monitoringType: 'branch_group',
        branchGroupId: groupId,
        branchGroupName: groupName,
        cameraIds,
        branchIds,
        branchNames,
        alertCount: 0,
        incidentCount: 0,
        cameraSwitchCount: 0,
        playbackCount: 0,
        snapshotCount: 0,
        exportCount: 0,
      };

      this.startPeriodicUpdates();

      console.log('[ControlRoomTracker] Started monitoring group:', groupName);
      return data.activityId;
    } catch (error) {
      console.error('Error starting branch group monitoring:', error);
      return null;
    }
  }


  /**
   * Increment alert count
   */
  incrementAlertCount() {
    if (this.currentActivity) {
      this.currentActivity.alertCount++;
    }
  }

  /**
   * Increment incident count
   */
  incrementIncidentCount() {
    if (this.currentActivity) {
      this.currentActivity.incidentCount++;
    }
  }

  /**
   * Increment camera switch count
   */
  incrementCameraSwitchCount() {
    if (this.currentActivity) {
      this.currentActivity.cameraSwitchCount++;
    }
  }

  /**
   * Increment playback count
   */
  incrementPlaybackCount() {
    if (this.currentActivity) {
      this.currentActivity.playbackCount++;
    }
  }

  /**
   * Increment snapshot count
   */
  incrementSnapshotCount() {
    if (this.currentActivity) {
      this.currentActivity.snapshotCount++;
    }
  }

  /**
   * Increment export count
   */
  incrementExportCount() {
    if (this.currentActivity) {
      this.currentActivity.exportCount++;
    }
  }

  /**
   * Update monitoring target (when switching branches)
   */
  async switchBranch(branchId: string, branchName: string, cameraIds: string[]) {
    // This will start a new activity
    await this.startBranchMonitoring(branchId, branchName, cameraIds);
  }

  /**
   * End current activity
   */
  async endCurrentActivity() {
    if (!this.currentActivity) return;

    this.stopPeriodicUpdates();

    try {
      const durationSeconds = Math.floor((new Date().getTime() - this.currentActivity.startTime.getTime()) / 1000);

      await fetch(`${this.config.apiBaseUrl}/v1/activity/control-room/${this.currentActivity.activityId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          activityId: this.currentActivity.activityId,
          durationSeconds,
          alertCount: this.currentActivity.alertCount,
          incidentCount: this.currentActivity.incidentCount,
          cameraSwitchCount: this.currentActivity.cameraSwitchCount,
          playbackCount: this.currentActivity.playbackCount,
          snapshotCount: this.currentActivity.snapshotCount,
          exportCount: this.currentActivity.exportCount,
        }),
      });

      console.log('[ControlRoomTracker] Ended monitoring activity:', durationSeconds, 'seconds');
    } catch (error) {
      console.error('Error ending control room activity:', error);
    } finally {
      this.currentActivity = null;
    }
  }

  /**
   * Get current activity info
   */
  getCurrentActivity() {
    return this.currentActivity;
  }

  /**
   * Private methods
   */
  private startPeriodicUpdates() {
    this.stopPeriodicUpdates();
    
    // Update every 30 seconds
    this.updateTimer = setInterval(() => {
      this.sendActivityUpdate();
    }, 30000);
  }

  private stopPeriodicUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private async sendActivityUpdate() {
    if (!this.currentActivity) return;

    try {
      await fetch(`${this.config.apiBaseUrl}/v1/activity/control-room/${this.currentActivity.activityId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          alertCount: this.currentActivity.alertCount,
          incidentCount: this.currentActivity.incidentCount,
          cameraSwitchCount: this.currentActivity.cameraSwitchCount,
        }),
      });
    } catch (error) {
      console.error('Error sending activity update:', error);
    }
  }

  /**
   * Update config (e.g., when token refreshes)
   */
  updateConfig(updates: Partial<ControlRoomTrackerConfig>) {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Cleanup
   */
  async destroy() {
    await this.endCurrentActivity();
    this.stopPeriodicUpdates();
  }
}

export type { ControlRoomActivity, ControlRoomTrackerConfig };
