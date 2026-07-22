/**
 * Phase 6: Firmware & Software Update Management
 * Handle firmware/software updates with approval workflow, rollback capability, and deployment tracking
 */

import type { ControlPlaneStore } from "../control-plane-store.js";

export interface FirmwareVersion {
  id: string;
  deviceType: string; // camera, recorder, switch, ups
  manufacturer: string;
  versionNumber: string;
  releaseDate: Date;
  description: string;
  improvements: string[];
  bugFixes: string[];
  knownIssues?: string[];
  checksum: string;
  downloadUrl: string;
  fileSize: number;
  supportedModels: string[];
}

export interface DeploymentPlan {
  id: string;
  firmwareVersionId: string;
  targetDevices: string[];
  deploymentStrategy: "immediate" | "staged" | "scheduled";
  rolloutPercentage?: number;
  scheduledTime?: Date;
  approvalStatus: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvalDate?: Date;
  status: "pending" | "in-progress" | "completed" | "failed" | "rolled-back";
  createdAt: Date;
  completedAt?: Date;
}

export interface DeviceUpdate {
  id: string;
  deploymentPlanId: string;
  deviceId: string;
  previousVersion: string;
  targetVersion: string;
  updateStatus:
    | "pending"
    | "downloading"
    | "installing"
    | "completed"
    | "failed"
    | "rolled-back";
  progress: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  rollbackAvailable: boolean;
  rollbackToVersion?: string;
}

export interface CompatibilityCheck {
  deviceId: string;
  deviceModel: string;
  currentVersion: string;
  targetVersion: string;
  isCompatible: boolean;
  compatibilityIssues: string[];
  prerequisites: string[];
  recommendedActions: string[];
}

export interface UpdateApprovalRequest {
  id: string;
  deploymentPlanId: string;
  requiredApprovers: string[];
  currentApprovals: Map<string, { approvedBy: string; date: Date }>;
  requiredApprovalCount: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: Date;
  deadlineAt: Date;
}

export class FirmwareUpdateManager {
  private store: ControlPlaneStore;
  private availableVersions: Map<string, FirmwareVersion[]> = new Map();
  private deploymentPlans: Map<string, DeploymentPlan> = new Map();
  private deviceUpdates: Map<string, DeviceUpdate> = new Map();
  private approvalRequests: Map<string, UpdateApprovalRequest> = new Map();
  private compatibilityDatabase: Map<string, CompatibilityCheck[]> = new Map();
  private updateHistory: Array<{
    deviceId: string;
    previousVersion: string;
    newVersion: string;
    timestamp: Date;
    status: string;
  }> = [];

  constructor(store: ControlPlaneStore) {
    this.store = store;
    this.initializeCompatibilityDatabase();
  }

  /**
   * Initialize compatibility database with known device models
   */
  private initializeCompatibilityDatabase(): void {
    const compatibilityRules = new Map<string, Map<string, CompatibilityCheck[]>>([
      [
        "camera",
        new Map([
          [
            "Hikvision DS-2CD2143G2-I",
            [
              {
                deviceId: "cam_001",
                deviceModel: "Hikvision DS-2CD2143G2-I",
                currentVersion: "1.0.0",
                targetVersion: "1.2.1",
                isCompatible: true,
                compatibilityIssues: [],
                prerequisites: ["Firmware upgrade tool v2.0+"],
                recommendedActions: [
                  "Backup current configuration before upgrade",
                  "Perform upgrade during low-traffic hours",
                ],
              },
            ],
          ],
        ]),
      ],
    ]);
  }

  /**
   * Register available firmware version
   */
  registerFirmwareVersion(version: FirmwareVersion): void {
    const key = `${version.deviceType}:${version.manufacturer}`;
    const versions = this.availableVersions.get(key) || [];
    versions.push(version);
    // Sort by release date descending
    versions.sort((a, b) => b.releaseDate.getTime() - a.releaseDate.getTime());
    this.availableVersions.set(key, versions);
  }

  /**
   * Get available versions for a device type
   */
  getAvailableVersions(
    deviceType: string,
    manufacturer?: string
  ): FirmwareVersion[] {
    const key = manufacturer
      ? `${deviceType}:${manufacturer}`
      : deviceType;
    return this.availableVersions.get(key) || [];
  }

  /**
   * Check firmware compatibility for a device
   */
  checkCompatibility(
    deviceId: string,
    deviceModel: string,
    currentVersion: string,
    targetVersion: string
  ): CompatibilityCheck {
    const check: CompatibilityCheck = {
      deviceId,
      deviceModel,
      currentVersion,
      targetVersion,
      isCompatible: this.validateCompatibility(deviceModel, currentVersion, targetVersion),
      compatibilityIssues: this.getCompatibilityIssues(deviceModel, targetVersion),
      prerequisites: this.getPrerequisites(deviceModel, targetVersion),
      recommendedActions: this.getRecommendedActions(deviceModel, currentVersion, targetVersion),
    };

    const key = `${deviceId}:${currentVersion}:${targetVersion}`;
    this.compatibilityDatabase.set(key, [check]);

    return check;
  }

  /**
   * Validate compatibility between versions
   */
  private validateCompatibility(
    deviceModel: string,
    currentVersion: string,
    targetVersion: string
  ): boolean {
    // Simulate compatibility check
    // In real implementation, would check against a database
    const currentMajor = parseInt(currentVersion.split(".")[0]);
    const targetMajor = parseInt(targetVersion.split(".")[0]);

    // Can't downgrade major versions
    if (targetMajor < currentMajor) {
      return false;
    }

    // Check for known incompatibilities
    const incompatiblePairs = [
      { from: "1.0.0", to: "3.0.0" }, // Major version skip
    ];

    return !incompatiblePairs.some(
      (pair) => pair.from === currentVersion && pair.to === targetVersion
    );
  }

  /**
   * Get compatibility issues for target version
   */
  private getCompatibilityIssues(deviceModel: string, targetVersion: string): string[] {
    // Simulate getting issues from database
    return [];
  }

  /**
   * Get prerequisites for update
   */
  private getPrerequisites(deviceModel: string, targetVersion: string): string[] {
    return [
      "Device must be connected to network",
      "Configuration must be backed up",
      "Device must have sufficient storage for update",
      "Power supply must be stable",
    ];
  }

  /**
   * Get recommended actions
   */
  private getRecommendedActions(
    deviceModel: string,
    currentVersion: string,
    targetVersion: string
  ): string[] {
    return [
      "Back up current configuration before starting update",
      "Schedule update during maintenance window (low traffic hours)",
      "Test on non-production device first if available",
      "Have rollback plan ready",
      "Notify users about potential downtime",
    ];
  }

  /**
   * Create deployment plan for firmware update
   */
  createDeploymentPlan(
    firmwareVersionId: string,
    targetDevices: string[],
    strategy: "immediate" | "staged" | "scheduled" = "staged",
    scheduleTime?: Date
  ): DeploymentPlan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const plan: DeploymentPlan = {
      id: planId,
      firmwareVersionId,
      targetDevices,
      deploymentStrategy: strategy,
      rolloutPercentage: strategy === "staged" ? 20 : undefined,
      scheduledTime: strategy === "scheduled" ? scheduleTime : undefined,
      approvalStatus: "pending",
      status: "pending",
      createdAt: new Date(),
    };

    this.deploymentPlans.set(planId, plan);

    // Create approval request
    this.createApprovalRequest(planId);

    return plan;
  }

  /**
   * Create approval request for deployment
   */
  private createApprovalRequest(deploymentPlanId: string): UpdateApprovalRequest {
    const requestId = `approval_${Date.now()}`;
    const request: UpdateApprovalRequest = {
      id: requestId,
      deploymentPlanId,
      requiredApprovers: ["admin", "maintenance_manager"],
      currentApprovals: new Map(),
      requiredApprovalCount: 2,
      status: "pending",
      createdAt: new Date(),
      deadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    };

    this.approvalRequests.set(requestId, request);
    return request;
  }

  /**
   * Approve deployment plan
   */
  approvePlan(deploymentPlanId: string, approvedBy: string): boolean {
    const approvalRequest = Array.from(this.approvalRequests.values()).find(
      (r) => r.deploymentPlanId === deploymentPlanId
    );

    if (!approvalRequest) {
      return false;
    }

    approvalRequest.currentApprovals.set(approvedBy, {
      approvedBy,
      date: new Date(),
    });

    if (approvalRequest.currentApprovals.size >= approvalRequest.requiredApprovalCount) {
      approvalRequest.status = "approved";

      const plan = this.deploymentPlans.get(deploymentPlanId);
      if (plan) {
        plan.approvalStatus = "approved";
        plan.approvedBy = approvedBy;
        plan.approvalDate = new Date();
      }

      return true;
    }

    return false;
  }

  /**
   * Reject deployment plan
   */
  rejectPlan(deploymentPlanId: string, reason: string, rejectedBy: string): void {
    const plan = this.deploymentPlans.get(deploymentPlanId);
    if (plan) {
      plan.approvalStatus = "rejected";
    }

    const approvalRequest = Array.from(this.approvalRequests.values()).find(
      (r) => r.deploymentPlanId === deploymentPlanId
    );
    if (approvalRequest) {
      approvalRequest.status = "rejected";
      approvalRequest.rejectionReason = reason;
    }
  }

  /**
   * Start deployment
   */
  startDeployment(deploymentPlanId: string): boolean {
    const plan = this.deploymentPlans.get(deploymentPlanId);
    if (!plan || plan.approvalStatus !== "approved") {
      return false;
    }

    plan.status = "in-progress";

    // Create device updates for all target devices
    plan.targetDevices.forEach((deviceId) => {
      this.createDeviceUpdate(deploymentPlanId, deviceId);
    });

    return true;
  }

  /**
   * Create device update record
   */
  private createDeviceUpdate(deploymentPlanId: string, deviceId: string): DeviceUpdate {
    const updateId = `update_${Date.now()}_${deviceId}`;

    const update: DeviceUpdate = {
      id: updateId,
      deploymentPlanId,
      deviceId,
      previousVersion: "1.0.0", // In real impl, get from device
      targetVersion: "1.2.1",
      updateStatus: "pending",
      progress: 0,
      rollbackAvailable: true,
      rollbackToVersion: "1.0.0",
    };

    this.deviceUpdates.set(updateId, update);
    return update;
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentPlanId: string): {
    overall: string;
    totalDevices: number;
    completed: number;
    failed: number;
    inProgress: number;
    pending: number;
    devices: DeviceUpdate[];
  } {
    const plan = this.deploymentPlans.get(deploymentPlanId);
    if (!plan) {
      return {
        overall: "not_found",
        totalDevices: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        pending: 0,
        devices: [],
      };
    }

    const devices = Array.from(this.deviceUpdates.values()).filter(
      (u) => u.deploymentPlanId === deploymentPlanId
    );

    const status = {
      overall: plan.status,
      totalDevices: devices.length,
      completed: devices.filter((d) => d.updateStatus === "completed").length,
      failed: devices.filter((d) => d.updateStatus === "failed").length,
      inProgress: devices.filter((d) => d.updateStatus === "downloading" || d.updateStatus === "installing").length,
      pending: devices.filter((d) => d.updateStatus === "pending").length,
      devices,
    };

    // Update plan status based on device statuses
    if (status.completed === status.totalDevices) {
      plan.status = "completed";
      plan.completedAt = new Date();
    } else if (status.failed > 0 && status.failed === status.totalDevices) {
      plan.status = "failed";
    }

    return status;
  }

  /**
   * Simulate device update progress
   */
  updateDeviceProgress(
    updateId: string,
    progress: number,
    status: DeviceUpdate["updateStatus"]
  ): void {
    const update = this.deviceUpdates.get(updateId);
    if (update) {
      update.progress = Math.min(100, progress);
      update.updateStatus = status;

      if (status === "completed") {
        update.completedAt = new Date();
        this.recordUpdateHistory(update);
      } else if (status === "failed") {
        update.completedAt = new Date();
      } else if ((status === "downloading" || status === "installing") && !update.startedAt) {
        update.startedAt = new Date();
      }
    }
  }

  /**
   * Record update in history
   */
  private recordUpdateHistory(update: DeviceUpdate): void {
    this.updateHistory.push({
      deviceId: update.deviceId,
      previousVersion: update.previousVersion,
      newVersion: update.targetVersion,
      timestamp: new Date(),
      status: "completed",
    });
  }

  /**
   * Rollback device to previous version
   */
  rollbackDevice(updateId: string): boolean {
    const update = this.deviceUpdates.get(updateId);
    if (!update || !update.rollbackAvailable) {
      return false;
    }

    update.updateStatus = "rolled-back";
    update.completedAt = new Date();

    this.updateHistory.push({
      deviceId: update.deviceId,
      previousVersion: update.targetVersion,
      newVersion: update.rollbackToVersion || update.previousVersion,
      timestamp: new Date(),
      status: "rolled-back",
    });

    return true;
  }

  /**
   * Get update history for device
   */
  getDeviceUpdateHistory(deviceId: string): typeof this.updateHistory {
    return this.updateHistory.filter((h) => h.deviceId === deviceId);
  }

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): UpdateApprovalRequest[] {
    return Array.from(this.approvalRequests.values()).filter(
      (r) => r.status === "pending"
    );
  }

  /**
   * Generate deployment report
   */
  getDeploymentReport(deploymentPlanId: string): {
    plan: DeploymentPlan | undefined;
    status: ReturnType<typeof this.getDeploymentStatus>;
    successRate: number;
    rollbacks: number;
    errors: string[];
  } {
    const plan = this.deploymentPlans.get(deploymentPlanId);
    const status = this.getDeploymentStatus(deploymentPlanId);

    const rollbacks = status.devices.filter((d) => d.updateStatus === "rolled-back").length;
    const errors = status.devices
      .filter((d) => d.updateStatus === "failed" && d.errorMessage)
      .map((d) => `${d.deviceId}: ${d.errorMessage}`);

    const successRate =
      status.totalDevices > 0 ? (status.completed / status.totalDevices) * 100 : 0;

    return {
      plan,
      status,
      successRate,
      rollbacks,
      errors,
    };
  }
}

// Export singleton instance
let firmwareManager: FirmwareUpdateManager | null = null;

export function initializeFirmwareManager(
  store: ControlPlaneStore
): FirmwareUpdateManager {
  if (!firmwareManager) {
    firmwareManager = new FirmwareUpdateManager(store);
  }
  return firmwareManager;
}

export function getFirmwareManager(): FirmwareUpdateManager {
  if (!firmwareManager) {
    throw new Error(
      "Firmware manager not initialized. Call initializeFirmwareManager first."
    );
  }
  return firmwareManager;
}
