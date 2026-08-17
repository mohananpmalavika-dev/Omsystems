/**
 * Enterprise Physical Asset & Spare Replacement Lifecycle Domain Types
 * (Logical vs Physical Device Separation, 10-Step Replacement Saga, Compatibility Engine & Regional Spare Pools)
 */

export type AssetType =
  | "RECORDER"
  | "CAMERA"
  | "EDGE_GATEWAY"
  | "STORAGE_DISK"
  | "POE_SWITCH"
  | "UPS"
  | "ROUTER";

export type AssetLifecycleStatus =
  | "IN_STOCK"
  | "RESERVED"
  | "DISPATCHED"
  | "INSTALLING"
  | "IN_SERVICE"
  | "REPAIR_REQUIRED"
  | "UNDER_REPAIR"
  | "RMA"
  | "REPLACED"
  | "RETIRED"
  | "LOST";

export type AssetCustody =
  | "WAREHOUSE"
  | "REGIONAL_OFFICE"
  | "BRANCH"
  | "ENGINEER_CUSTODY"
  | "COURIER_TRANSIT";

export type ReplacementType =
  | "FAILURE"
  | "UPGRADE"
  | "WARRANTY"
  | "PREVENTIVE"
  | "DAMAGE"
  | "OTHER";

export type ReplacementTransactionStatus =
  | "PLANNED"
  | "VALIDATING"
  | "MIGRATING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK";

export interface LogicalDevice {
  id: string; // e.g. "REC-BR118-01"
  tenantId: string;
  branchId: string;
  branchName: string;
  type: AssetType;
  role: "PRIMARY_RECORDER" | "BACKUP_RECORDER" | "VAULT_CAMERA" | "GATEWAY_CORE" | "POE_DISTRIBUTION";
  name: string;
  positionName: string;
  currentAssetId: string;
  currentSerialNumber: string;
  currentModel: string;
  channelsCount: number;
  digitalTwinNodeId: string;
  status: "ONLINE" | "DEGRADED" | "OFFLINE";
  createdAt: string;
  updatedAt: string;
}

export interface PhysicalAsset {
  id: string;
  assetTag: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  hardwareRevision: string;
  firmwareVersion: string;
  assetType: AssetType;

  // Commercial & Warranty
  purchaseDate: string;
  installationDate?: string;
  warrantyStart: string;
  warrantyEnd: string;
  warrantyStatus: "IN_WARRANTY" | "EXPIRING_SOON" | "EXPIRED";
  supplier: string;
  invoiceNumber: string;

  // Lifecycle & Location
  lifecycleStatus: AssetLifecycleStatus;
  condition: "NEW" | "REFURBISHED" | "GOOD" | "FAULTY";
  custody: AssetCustody;
  regionId: string;
  currentBranchId?: string;
  currentLogicalDeviceId?: string;

  // Technical Specs
  specs: {
    channelCount?: number;
    supportedCodecs?: string[];
    maxResolution?: string;
    onvifCompliant?: boolean;
    storageCapacityTb?: number;
    poeBudgetWatts?: number;
  };

  createdAt: string;
  updatedAt: string;
}

export interface AssetAssignmentHistory {
  id: string;
  assetId: string;
  serialNumber: string;
  logicalDeviceId: string;
  branchId: string;
  installedAt: string;
  removedAt?: string;
  installedBy: string;
  removedBy?: string;
  reason?: string;
  workOrderId?: string;
  replacementId?: string;
  isCurrent: boolean;
}

export interface ChannelMappingPreservation {
  logicalChannel: number;
  cameraId: string;
  cameraName: string;
  oldPhysicalInput: number;
  newPhysicalInput: number;
  streamUrl: string;
  migrationStatus: "MIGRATED" | "VERIFIED" | "FAILED";
}

export interface DeviceConfigurationSnapshot {
  logicalDeviceId: string;
  assetSerial: string;
  capturedAt: string;
  firmware: string;
  network: {
    ip: string;
    subnet: string;
    gateway: string;
    ntp: string;
  };
  channels: Array<{
    channel: number;
    cameraId: string;
    resolution: string;
    fps: number;
    bitrateKbps: number;
  }>;
  retentionDays: number;
  recordingMode: "CONTINUOUS" | "MOTION" | "AI_TRIGGERED";
}

export interface ReplacementTransaction {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  logicalDeviceId: string;

  oldAssetId: string;
  oldSerialNumber: string;
  oldModel: string;

  newAssetId: string;
  newSerialNumber: string;
  newModel: string;

  replacementType: ReplacementType;
  status: ReplacementTransactionStatus;
  workOrderId?: string;

  compatibilityCheck: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
  };

  configSnapshot?: DeviceConfigurationSnapshot;
  channelMappings: ChannelMappingPreservation[];

  verification: {
    deviceReachable: boolean;
    authSuccess: boolean;
    channelsRestoredCount: number;
    liveViewVerified: boolean;
    recordingVerified: boolean;
    digitalTwinUpdated: boolean;
    verifiedBy: string;
    verifiedAt?: string;
  };

  oldAssetDisposition: "RETIRED" | "RMA" | "REPAIR_DEPOT";
  startedAt: string;
  completedAt?: string;
  performedBy: string;
}

export interface RegionalSpareStock {
  regionId: string;
  regionName: string;
  assetType: AssetType;
  inStockCount: number;
  reservedCount: number;
  inTransitCount: number;
  minThreshold: number;
  status: "HEALTHY" | "LOW_STOCK" | "CRITICAL_EMPTY";
}
