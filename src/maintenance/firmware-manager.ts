/**
 * Firmware Management Service
 * Handles firmware updates, version tracking, approval workflows, and rollbacks
 */

import { v4 as uuidv4 } from 'uuid';
import type { ControlPlaneStore } from '../control-plane-store.js';

export interface FirmwareVersion {
  id: string;
  tenantId: string;
  assetCategory: 'camera' | 'recorder' | 'storage' | 'network' | 'other';
  vendor: string;
  model: string;
  version: string;
  releaseDate: Date;
  fileUrl: string;
  fileHash: string;
  fileSize: number;
  releaseNotes: string;
  criticality: 'critical' | 'important' | 'recommended' | 'optional';
  compatibility: string[];
  status: 'draft' | 'testing' | 'approved' | 'deprecated' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface FirmwareCatalogEntry extends FirmwareVersion {
  checksum?: string;
  signature?: string;
  knownIssues?: string[];
  minimumPrerequisiteVersion?: string;
  rollbackCapability?: boolean;
  source?: 'manual' | 'vendor-feed' | 'uploaded-package';
  packageType?: 'full-image' | 'delta' | 'patch';
}

export interface FirmwareUpdate {
  id: string;
  tenantId: string;
  firmwareVersionId: string;
  targetAssets: string[];
  scheduledAt?: Date;
  status: 'scheduled' | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'rollback';
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
  rollbackVersionId?: string;
  createdBy: string;
  createdAt: Date;
}

export interface AssetFirmwareUpdate {
  id: string;
  firmwareUpdateId: string;
  assetId: string;
  previousVersion?: string;
  targetVersion: string;
  status: 'pending' | 'downloading' | 'installing' | 'verifying' | 'completed' | 'failed' | 'rolled-back';
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  verificationStatus?: 'passed' | 'failed';
}

export interface FirmwareApprovalRequest {
  id: string;
  tenantId: string;
  firmwareVersionId: string;
  requestedBy: string;
  requestedAt: Date;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export type FirmwareClassification =
  | 'current'
  | 'update-available'
  | 'security-update-required'
  | 'critically-vulnerable'
  | 'unsupported'
  | 'unknown'
  | 'custom-vendor-modified'
  | 'upgrade-blocked';

export interface AssetFirmwareInventoryRecord {
  id: string;
  tenantId: string;
  assetId: string;
  assetType: FirmwareVersion['assetCategory'];
  deviceName?: string;
  currentVersion: string;
  latestApprovedVersion?: string;
  firmwareReleaseDate?: string;
  upgradeAvailable: boolean;
  securityStatus: 'current' | 'update-required' | 'critical' | 'unsupported' | 'unknown' | 'custom' | 'blocked';
  endOfSupportState: 'supported' | 'limited' | 'unsupported' | 'unknown';
  lastFirmwareCheck: string;
  lastUpgrade?: string;
  rollbackVersion?: string;
  classification: FirmwareClassification;
  releaseNotes?: string;
  minimumPrerequisiteVersion?: string;
  knownIssues?: string[];
  rollbackCapability?: boolean;
  vendor?: string;
  model?: string;
  createdAt: string;
}

export interface FirmwareUpgradeSafetyContext {
  modelConfirmed: boolean;
  exactVersionConfirmed: boolean;
  powerConfirmed: boolean;
  upsConfirmed: boolean;
  networkStable: boolean;
  backupCompleted: boolean;
  redundancyVerified: boolean;
  activeIncidentsPresent: boolean;
  alertsSuspended: boolean;
  maintenanceWindowApproved: boolean;
  rollbackPlanned: boolean;
  packageVerified: boolean;
  compatibilityVerified: boolean;
}

export interface FirmwareUpgradePlan {
  id: string;
  tenantId: string;
  firmwareVersionId: string;
  targetAssets: string[];
  strategy: 'single-device' | 'test-group' | 'canary-rollout' | 'branch-by-branch' | 'region-by-region' | 'scheduled-fleet-rollout' | 'emergency-security-rollout';
  requestedBy: string;
  status: 'planned' | 'blocked' | 'approved' | 'in-progress' | 'completed' | 'rolled-back';
  safetyChecks: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
  };
  createdAt: Date;
}

export class FirmwareManager {
  private store: ControlPlaneStore;
  private logger: any;
  private catalog = new Map<string, FirmwareCatalogEntry>();
  private approvals = new Map<string, FirmwareApprovalRequest>();
  private updates = new Map<string, FirmwareUpdate>();
  private deploymentPlans = new Map<string, {
    id: string;
    firmwareVersionId: string;
    targetDevices: string[];
    strategy: string;
    scheduleTime?: Date;
    status: 'planned' | 'approved' | 'in-progress' | 'completed' | 'failed';
    approvedBy?: string;
    createdAt: Date;
  }>();
  private upgradePlans = new Map<string, FirmwareUpgradePlan>();
  private assetInventory = new Map<string, AssetFirmwareInventoryRecord>();

  constructor(store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;
  }

  private async resolveAssetContext(assetId: string, tenantId: string) {
    const camera = await this.store.getCamera(assetId);
    if (camera) {
      return {
        assetType: 'camera' as FirmwareVersion['assetCategory'],
        deviceName: camera.name,
        vendor: camera.vendor,
        model: camera.model,
      };
    }

    const maintenanceAsset = await this.store.getMaintenanceAsset(assetId);
    if (maintenanceAsset) {
      return {
        assetType: maintenanceAsset.assetType as FirmwareVersion['assetCategory'],
        deviceName: maintenanceAsset.name,
        vendor: maintenanceAsset.vendor,
        model: maintenanceAsset.model,
      };
    }

    return {
      assetType: 'other' as FirmwareVersion['assetCategory'],
      deviceName: assetId,
      vendor: undefined,
      model: undefined,
    };
  }

  private buildInventoryRecord(
    tenantId: string,
    assetId: string,
    assetType: FirmwareVersion['assetCategory'],
    version: FirmwareCatalogEntry | undefined,
    previousVersion?: string,
    currentVersion?: string,
  ): AssetFirmwareInventoryRecord {
    const now = new Date().toISOString();
    const latestVersion = version?.version ?? currentVersion ?? 'unknown';
    const previous = previousVersion ?? 'unknown';

    let classification: FirmwareClassification = 'unknown';
    let securityStatus: AssetFirmwareInventoryRecord['securityStatus'] = 'unknown';
    let upgradeAvailable = false;

    if (!version) {
      classification = 'unknown';
      securityStatus = 'unknown';
    } else if (version.status !== 'approved') {
      classification = 'upgrade-blocked';
      securityStatus = 'blocked';
    } else if (previous === latestVersion || currentVersion === latestVersion) {
      classification = 'current';
      securityStatus = 'current';
    } else if (version.criticality === 'critical') {
      classification = 'security-update-required';
      securityStatus = 'critical';
      upgradeAvailable = true;
    } else if (version.criticality === 'important') {
      classification = 'update-available';
      securityStatus = 'update-required';
      upgradeAvailable = true;
    } else {
      classification = 'update-available';
      securityStatus = 'update-required';
      upgradeAvailable = true;
    }

    return {
      id: uuidv4(),
      tenantId,
      assetId,
      assetType,
      currentVersion: currentVersion ?? previous,
      latestApprovedVersion: latestVersion,
      firmwareReleaseDate: version?.releaseDate ? version.releaseDate.toISOString() : undefined,
      upgradeAvailable,
      securityStatus,
      endOfSupportState: 'supported',
      lastFirmwareCheck: now,
      lastUpgrade: previous === latestVersion ? now : undefined,
      rollbackVersion: previous !== 'unknown' && previous !== latestVersion ? previous : undefined,
      classification,
      releaseNotes: version?.releaseNotes,
      minimumPrerequisiteVersion: version?.minimumPrerequisiteVersion,
      knownIssues: version?.knownIssues,
      rollbackCapability: version?.rollbackCapability ?? true,
      vendor: version?.vendor,
      model: version?.model,
      createdAt: now,
    };
  }

  private compareVersions(left: string, right: string): number {
    const leftParts = left.split(/[.-]/).filter(Boolean).map((part) => Number.parseInt(part, 10)).filter((part) => !Number.isNaN(part));
    const rightParts = right.split(/[.-]/).filter(Boolean).map((part) => Number.parseInt(part, 10)).filter((part) => !Number.isNaN(part));
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
      const leftValue = leftParts[index] ?? 0;
      const rightValue = rightParts[index] ?? 0;
      if (leftValue > rightValue) return 1;
      if (leftValue < rightValue) return -1;
    }

    return 0;
  }

  // ========================================================================
  // Firmware Version Management
  // ========================================================================

  async registerFirmwareVersion(data: Omit<FirmwareVersion, 'id' | 'createdAt' | 'status'> & {
    checksum?: string;
    signature?: string;
    knownIssues?: string[];
    minimumPrerequisiteVersion?: string;
    rollbackCapability?: boolean;
    source?: FirmwareCatalogEntry['source'];
    packageType?: FirmwareCatalogEntry['packageType'];
  }): Promise<FirmwareCatalogEntry> {
    const entry: FirmwareCatalogEntry = {
      ...data,
      id: uuidv4(),
      status: 'draft',
      createdAt: new Date(),
      rollbackCapability: data.rollbackCapability ?? true,
      source: data.source ?? 'manual',
      packageType: data.packageType ?? 'full-image',
    };

    this.catalog.set(entry.id, entry);
    this.logger.info('Firmware version registered:', {
      id: entry.id,
      vendor: entry.vendor,
      model: entry.model,
      version: entry.version,
    });

    return entry;
  }

  async createUpgradePlan(data: {
    tenantId: string;
    firmwareVersionId: string;
    targetAssets: string[];
    strategy: FirmwareUpgradePlan['strategy'];
    requestedBy: string;
    safetyContext: FirmwareUpgradeSafetyContext;
  }): Promise<FirmwareUpgradePlan> {
    const version = this.catalog.get(data.firmwareVersionId);
    const blockers: string[] = [];
    const warnings: string[] = [];

    for (const assetId of data.targetAssets) {
      const asset = await this.store.getMaintenanceAsset(assetId);
      if (asset && asset.status !== 'operational') {
        blockers.push(`Target asset ${assetId} is not in an operational state for firmware upgrades.`);
      }

      const incidents = await this.store.listIncidents(data.tenantId, { limit: 200 });
      const activeIncident = incidents.find((incident: any) =>
        incident.status !== 'closed' && incident.status !== 'resolved' && incident.status !== 'false-alarm' &&
        incident.id && (
          (incident.branchId && asset?.branchNodeId && incident.branchId === asset.branchNodeId) ||
          false
        )
      );

      if (!activeIncident) {
        for (const incident of incidents) {
          const incidentCameras = await this.store.listIncidentCameras?.(incident.id);
          const incidentCameraMatch = incidentCameras?.find((entry: any) => entry.cameraId === assetId);
          if (incidentCameraMatch && !['closed', 'resolved', 'false-alarm'].includes(incident.status)) {
            blockers.push(`Target asset ${assetId} is linked to an active incident and cannot be upgraded.`);
            break;
          }
        }
      } else {
        blockers.push(`Target asset ${assetId} is linked to an active incident and cannot be upgraded.`);
      }
    }

    if (!version) {
      blockers.push('Firmware package must be registered before upgrade.');
    }

    if (!data.safetyContext.modelConfirmed) blockers.push('Device model must be confirmed before upgrade.');
    if (!data.safetyContext.exactVersionConfirmed) blockers.push('The exact firmware package must be confirmed.');
    if (!data.safetyContext.powerConfirmed) blockers.push('Sufficient power must be confirmed before upgrade.');
    if (!data.safetyContext.upsConfirmed) blockers.push('UPS state must be confirmed before upgrade.');
    if (!data.safetyContext.networkStable) blockers.push('Stable network connectivity must be verified before upgrade.');
    if (!data.safetyContext.backupCompleted) blockers.push('Configuration backup must be completed before upgrade.');
    if (!data.safetyContext.redundancyVerified) blockers.push('Recording or storage redundancy must be verified before upgrade.');
    if (data.safetyContext.activeIncidentsPresent) blockers.push('Active incidents must be cleared before upgrade.');
    if (!data.safetyContext.alertsSuspended) warnings.push('Planned restart alerts should be suspended during the upgrade window.');
    if (!data.safetyContext.maintenanceWindowApproved) blockers.push('Maintenance window approval is required before upgrade.');
    if (!data.safetyContext.rollbackPlanned) blockers.push('Rollback planning is required before upgrade.');
    if (!data.safetyContext.packageVerified) blockers.push('Checksum and signature verification is required before upgrade.');
    if (!data.safetyContext.compatibilityVerified) blockers.push('Model compatibility must be verified before upgrade.');

    if (version && version.status !== 'approved') {
      blockers.push('Firmware package must be approved before it can be deployed.');
    }

    if (data.strategy === 'single-device' && data.targetAssets.length > 1) {
      warnings.push('Single-device strategy should target a single asset.');
    }

    if (data.strategy === 'emergency-security-rollout' && data.targetAssets.length > 5) {
      warnings.push('Emergency rollout should be limited to the minimum required set of assets.');
    }

    const plan: FirmwareUpgradePlan = {
      id: uuidv4(),
      tenantId: data.tenantId,
      firmwareVersionId: data.firmwareVersionId,
      targetAssets: data.targetAssets,
      strategy: data.strategy,
      requestedBy: data.requestedBy,
      status: blockers.length > 0 ? 'blocked' : 'planned',
      safetyChecks: {
        passed: blockers.length === 0,
        blockers,
        warnings,
      },
      createdAt: new Date(),
    };

    this.upgradePlans.set(plan.id, plan);
    return plan;
  }

  async approveUpgradePlan(planId: string, approvedBy: string): Promise<boolean> {
    const plan = this.upgradePlans.get(planId);
    if (!plan || plan.status !== 'planned') {
      return false;
    }

    plan.status = 'approved';
    this.logger.info('Firmware upgrade plan approved', { planId, approvedBy });
    return true;
  }

  async executeUpgradePlan(planId: string): Promise<boolean> {
    const plan = this.upgradePlans.get(planId);
    if (!plan || plan.status !== 'approved') {
      return false;
    }

    plan.status = 'in-progress';
    this.logger.info('Firmware upgrade plan started', { planId });
    return true;
  }

  async getAvailableVersions(deviceType?: string, manufacturer?: string): Promise<FirmwareCatalogEntry[]> {
    const normalizedDeviceType = deviceType?.toLowerCase();
    const normalizedManufacturer = manufacturer?.toLowerCase();

    return [...this.catalog.values()]
      .filter((entry) => {
        if (normalizedDeviceType && entry.assetCategory !== normalizedDeviceType) {
          return false;
        }
        if (normalizedManufacturer && entry.vendor.toLowerCase() !== normalizedManufacturer) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.releaseDate.getTime() - right.releaseDate.getTime());
  }

  createDeploymentPlan(
    firmwareVersionId: string,
    targetDevices: string[],
    strategy: string = 'sequential',
    scheduleTime?: Date,
  ) {
    const plan = {
      id: uuidv4(),
      firmwareVersionId,
      targetDevices,
      strategy,
      scheduleTime,
      status: 'planned' as const,
      createdAt: new Date(),
    };

    this.deploymentPlans.set(plan.id, plan);
    return plan;
  }

  approvePlan(planId: string, approvedBy: string): boolean {
    const plan = this.deploymentPlans.get(planId);
    if (!plan) {
      return false;
    }

    plan.status = 'approved';
    plan.approvedBy = approvedBy;
    return true;
  }

  startDeployment(planId: string): boolean {
    const plan = this.deploymentPlans.get(planId);
    if (!plan || plan.status !== 'approved') {
      return false;
    }

    plan.status = 'in-progress';
    return true;
  }

  getDeploymentStatus(planId: string) {
    return this.deploymentPlans.get(planId) ?? null;
  }

  rollbackDevice(updateId: string): boolean {
    const update = this.updates.get(updateId);
    if (!update) {
      return false;
    }

    void this.rollbackFirmwareUpdate({
      updateId,
      reason: 'Rollback requested through deployment workflow',
      rollbackBy: 'system',
    });
    return true;
  }

  getPendingApprovals(): FirmwareApprovalRequest[] {
    return [...this.approvals.values()].filter((request) => request.status === 'pending');
  }

  async requestApproval(data: {
    tenantId: string;
    firmwareVersionId: string;
    requestedBy: string;
    justification: string;
  }): Promise<FirmwareApprovalRequest> {
    const request: FirmwareApprovalRequest = {
      id: uuidv4(),
      tenantId: data.tenantId,
      firmwareVersionId: data.firmwareVersionId,
      requestedBy: data.requestedBy,
      requestedAt: new Date(),
      justification: data.justification,
      status: 'pending',
    };

    this.approvals.set(request.id, request);
    this.logger.info('Firmware approval requested:', {
      id: request.id,
      firmwareVersionId: data.firmwareVersionId,
      requestedBy: data.requestedBy,
    });

    return request;
  }

  async approveFirmware(data: {
    requestId: string;
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<void> {
    const request = this.approvals.get(data.requestId);
    if (!request) return;

    request.status = 'approved';
    request.reviewedBy = data.reviewedBy;
    request.reviewedAt = new Date();
    request.reviewNotes = data.reviewNotes;

    const version = this.catalog.get(request.firmwareVersionId);
    if (version) {
      version.status = 'approved';
      version.approvedBy = data.reviewedBy;
      version.approvedAt = new Date();
    }

    this.logger.info('Firmware approved:', {
      requestId: data.requestId,
      reviewedBy: data.reviewedBy,
    });
  }

  async rejectFirmware(data: {
    requestId: string;
    reviewedBy: string;
    reviewNotes: string;
  }): Promise<void> {
    const request = this.approvals.get(data.requestId);
    if (!request) return;

    request.status = 'rejected';
    request.reviewedBy = data.reviewedBy;
    request.reviewedAt = new Date();
    request.reviewNotes = data.reviewNotes;

    const version = this.catalog.get(request.firmwareVersionId);
    if (version) {
      version.status = 'rejected';
    }

    this.logger.info('Firmware rejected:', {
      requestId: data.requestId,
      reviewedBy: data.reviewedBy,
    });
  }

  // ========================================================================
  // Firmware Update Management
  // ========================================================================

  async scheduleFirmwareUpdate(data: {
    tenantId: string;
    firmwareVersionId: string;
    targetAssets: string[];
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<FirmwareUpdate> {
    const version = this.catalog.get(data.firmwareVersionId);
    if (!version) {
      throw new Error('Firmware version not found');
    }

    const update: FirmwareUpdate = {
      id: uuidv4(),
      tenantId: data.tenantId,
      firmwareVersionId: data.firmwareVersionId,
      targetAssets: data.targetAssets,
      scheduledAt: data.scheduledAt,
      status: data.scheduledAt ? 'scheduled' : 'in-progress',
      progress: {
        total: data.targetAssets.length,
        completed: 0,
        failed: 0,
        inProgress: 0,
      },
      createdBy: data.createdBy,
      createdAt: new Date(),
    };

    this.updates.set(update.id, update);
    this.logger.info('Firmware update scheduled:', {
      id: update.id,
      firmwareVersionId: data.firmwareVersionId,
      targetAssets: data.targetAssets.length,
      scheduledAt: data.scheduledAt,
    });

    return update;
  }

  async executeFirmwareUpdate(updateId: string): Promise<void> {
    const update = this.updates.get(updateId);
    if (!update) return;

    const version = this.catalog.get(update.firmwareVersionId);
    if (!version) return;

    update.status = 'in-progress';
    update.startedAt = new Date();

    for (const assetId of update.targetAssets) {
      const previousInventory = this.assetInventory.get(assetId);
      const previousVersion = previousInventory?.currentVersion ?? 'unknown';
      const assetContext = await this.resolveAssetContext(assetId, update.tenantId);
      const inventory = this.buildInventoryRecord(
        update.tenantId,
        assetId,
        assetContext.assetType,
        version,
        previousVersion,
        version.version,
      );
      inventory.deviceName = assetContext.deviceName;
      inventory.vendor = assetContext.vendor ?? inventory.vendor;
      inventory.model = assetContext.model ?? inventory.model;
      this.assetInventory.set(assetId, inventory);
    }

    update.status = 'completed';
    update.completedAt = new Date();
    update.progress = {
      total: update.targetAssets.length,
      completed: update.targetAssets.length,
      failed: 0,
      inProgress: 0,
    };
  }

  async updateAssetFirmwareStatus(data: {
    assetUpdateId: string;
    status: AssetFirmwareUpdate['status'];
    errorMessage?: string;
  }): Promise<void> {
    this.logger.debug('Asset firmware status updated:', {
      assetUpdateId: data.assetUpdateId,
      status: data.status,
    });
  }

  async getFirmwareUpdateProgress(updateId: string): Promise<FirmwareUpdate> {
    return this.updates.get(updateId) ?? {
      id: updateId,
      tenantId: 'unknown',
      firmwareVersionId: 'unknown',
      targetAssets: [],
      status: 'in-progress',
      progress: { total: 0, completed: 0, failed: 0, inProgress: 0 },
      createdBy: 'system',
      createdAt: new Date(),
    };
  }

  async rollbackFirmwareUpdate(data: {
    updateId: string;
    reason: string;
    rollbackBy: string;
  }): Promise<void> {
    const update = this.updates.get(data.updateId);
    if (!update) return;

    update.status = 'rollback';
    for (const assetId of update.targetAssets) {
      const inventory = this.assetInventory.get(assetId);
      if (inventory?.rollbackVersion) {
        inventory.currentVersion = inventory.rollbackVersion;
        inventory.rollbackVersion = undefined;
        inventory.upgradeAvailable = true;
        inventory.classification = 'update-available';
        inventory.securityStatus = 'update-required';
      }
    }

    this.logger.info('Rolling back firmware update:', {
      updateId: data.updateId,
      reason: data.reason,
      rollbackBy: data.rollbackBy,
    });
  }

  async canRollback(updateId: string): Promise<boolean> {
    const update = this.updates.get(updateId);
    if (!update) return false;
    return update.status === 'completed' || update.status === 'failed';
  }

  async checkCompatibility(data: {
    firmwareVersionId: string;
    assetId: string;
  }): Promise<{
    compatible: boolean;
    reason?: string;
    warnings?: string[];
  }> {
    const version = this.catalog.get(data.firmwareVersionId);
    if (!version) {
      return { compatible: false, reason: 'Firmware version not found' };
    }

    const assetContext = await this.resolveAssetContext(data.assetId, version.tenantId);
    const normalizedModel = (assetContext.model ?? '').toLowerCase();
    const compatibilityMatches = version.compatibility.length === 0 || version.compatibility.some((entry) =>
      entry.toLowerCase().includes(normalizedModel) || normalizedModel.includes(entry.toLowerCase()),
    );

    const warnings: string[] = [];
    if (version.knownIssues?.length) {
      warnings.push(...version.knownIssues);
    }
    if (version.minimumPrerequisiteVersion) {
      warnings.push(`Requires firmware ${version.minimumPrerequisiteVersion} or newer as a prerequisite.`);
    }

    if (!compatibilityMatches) {
      return {
        compatible: false,
        reason: 'Device model is not listed in the compatibility matrix.',
        warnings,
      };
    }

    return {
      compatible: true,
      warnings,
    };
  }

  async getCompatibleAssets(data: {
    tenantId: string;
    firmwareVersionId: string;
  }): Promise<string[]> {
    const version = this.catalog.get(data.firmwareVersionId);
    if (!version) return [];

    const maintenanceAssets = await this.store.listMaintenanceAssets(data.tenantId);
    return maintenanceAssets
      .filter((asset) => {
        const normalizedModel = (asset.model ?? '').toLowerCase();
        return version.compatibility.length === 0 || version.compatibility.some((entry) =>
          entry.toLowerCase().includes(normalizedModel) || normalizedModel.includes(entry.toLowerCase()),
        );
      })
      .map((asset) => asset.id);
  }

  async scheduleBulkUpdateByBranch(data: {
    tenantId: string;
    firmwareVersionId: string;
    branchNodeIds: string[];
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<FirmwareUpdate[]> {
    const updates: FirmwareUpdate[] = [];
    for (const branchId of data.branchNodeIds) {
      const update = await this.scheduleFirmwareUpdate({
        tenantId: data.tenantId,
        firmwareVersionId: data.firmwareVersionId,
        targetAssets: [branchId],
        scheduledAt: data.scheduledAt,
        createdBy: data.createdBy,
      });
      updates.push(update);
    }
    return updates;
  }

  async scheduleBulkUpdateByCategory(data: {
    tenantId: string;
    firmwareVersionId: string;
    assetCategory: FirmwareVersion['assetCategory'];
    scheduledAt?: Date;
    createdBy: string;
  }): Promise<FirmwareUpdate> {
    const version = this.catalog.get(data.firmwareVersionId);
    if (!version) {
      throw new Error('Firmware version not found');
    }

    const maintenanceAssets = await this.store.listMaintenanceAssets(data.tenantId);
    const assetIds = maintenanceAssets
      .filter((asset) => asset.assetType === data.assetCategory)
      .map((asset) => asset.id);

    return this.scheduleFirmwareUpdate({
      tenantId: data.tenantId,
      firmwareVersionId: data.firmwareVersionId,
      targetAssets: assetIds,
      scheduledAt: data.scheduledAt,
      createdBy: data.createdBy,
    });
  }

  async getFirmwareUpdateStats(tenantId: string): Promise<{
    totalUpdates: number;
    completedUpdates: number;
    failedUpdates: number;
    inProgressUpdates: number;
    assetsUpToDate: number;
    assetsOutdated: number;
    criticalUpdatesAvailable: number;
  }> {
    const tenantUpdates = [...this.updates.values()].filter((update) => update.tenantId === tenantId);
    const tenantInventory = [...this.assetInventory.values()].filter((inventory) => inventory.tenantId === tenantId);

    return {
      totalUpdates: tenantUpdates.length,
      completedUpdates: tenantUpdates.filter((update) => update.status === 'completed').length,
      failedUpdates: tenantUpdates.filter((update) => update.status === 'failed').length,
      inProgressUpdates: tenantUpdates.filter((update) => update.status === 'in-progress').length,
      assetsUpToDate: tenantInventory.filter((inventory) => inventory.classification === 'current').length,
      assetsOutdated: tenantInventory.filter((inventory) => inventory.classification !== 'current').length,
      criticalUpdatesAvailable: tenantInventory.filter((inventory) => inventory.classification === 'security-update-required').length,
    };
  }

  async getFirmwareVersionDistribution(data: {
    tenantId: string;
    assetCategory?: FirmwareVersion['assetCategory'];
  }): Promise<Array<{
    version: string;
    vendor: string;
    model: string;
    count: number;
    isLatest: boolean;
  }>> {
    const versions = [...this.catalog.values()].filter((entry) => entry.tenantId === data.tenantId && (!data.assetCategory || entry.assetCategory === data.assetCategory));
    return versions.map((entry) => ({
      version: entry.version,
      vendor: entry.vendor,
      model: entry.model,
      count: [...this.assetInventory.values()].filter((inventory) => inventory.tenantId === data.tenantId && inventory.currentVersion === entry.version).length,
      isLatest: entry.status === 'approved',
    }));
  }

  async listFirmwareCatalog(tenantId: string): Promise<FirmwareCatalogEntry[]> {
    return [...this.catalog.values()]
      .filter((entry) => entry.tenantId === tenantId)
      .sort((left, right) => left.releaseDate.getTime() - right.releaseDate.getTime());
  }

  async getAssetFirmwareInventory(tenantId: string, assetId: string): Promise<AssetFirmwareInventoryRecord> {
    const existing = [...this.assetInventory.values()].find((item) => item.tenantId === tenantId && item.assetId === assetId);
    if (existing) {
      return existing;
    }

    const assetContext = await this.resolveAssetContext(assetId, tenantId);
    const record = this.buildInventoryRecord(tenantId, assetId, assetContext.assetType, undefined, 'unknown', 'unknown');
    record.deviceName = assetContext.deviceName;
    record.vendor = assetContext.vendor;
    record.model = assetContext.model;
    this.assetInventory.set(assetId, record);
    return record;
  }
}

// Singleton instance
let firmwareManagerInstance: FirmwareManager | null = null;

export function initFirmwareManager(store: ControlPlaneStore, logger?: any): FirmwareManager {
  if (!firmwareManagerInstance) {
    firmwareManagerInstance = new FirmwareManager(store, logger);
  }
  return firmwareManagerInstance;
}

export function getFirmwareManager(): FirmwareManager | null {
  return firmwareManagerInstance;
}
