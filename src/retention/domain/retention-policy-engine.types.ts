/**
 * Retention Policy Engine - Extended Domain Types
 */

export type RetentionPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type StorageClass = 'HOT' | 'WARM' | 'ARCHIVE';
export type PolicySource = 'CAMERA' | 'GROUP' | 'BRANCH' | 'REGION' | 'TENANT';

export interface ExtendedRetentionPolicy {
  id: string;
  tenantId: string;
  name: string;
  minimumRetentionDays: number;
  targetRetentionDays: number;
  priority: RetentionPriority;
  storageClass: StorageClass;
  deleteAfterRetention: boolean;
  allowTiering: boolean;
  legalHoldOverride: boolean;
  enabled: boolean;
  version: number;
  effectiveFrom: Date;
  createdBy: string;
  approvedBy?: string;
}

export interface EffectiveRetentionPolicy {
  cameraId: string;
  policyId: string;
  policyName: string;
  source: PolicySource;
  minimumRetentionDays: number;
  targetRetentionDays: number;
  priority: RetentionPriority;
  storageClass: StorageClass;
  allowTiering: boolean;
  calculatedAt: Date;
}

export interface LegalHoldScope {
  branches?: string[];
  cameras?: string[];
  startTime: Date;
  endTime: Date;
}

export interface LegalHold {
  id: string;
  tenantId: string;
  caseNumber: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
  releaseApprovedBy?: string;
  releasedAt?: Date;
  status: 'ACTIVE' | 'RELEASED';
  scope: LegalHoldScope;
}

export interface RetentionSegmentMetadata {
  id: string;
  cameraId: string;
  startTime: Date;
  endTime: Date;
  sizeBytes: number;
  storageNodeId: string;
  storageTier: StorageClass;
  retentionPolicyId: string;
  minimumRetainUntil: Date;
  legalHoldCount: number;
  isEvidenceLocked?: boolean;
  priority: RetentionPriority;
  deletionState: 'PROTECTED' | 'ELIGIBLE' | 'SCHEDULED' | 'DELETING' | 'DELETED' | 'FAILED';
}

export interface RetentionSimulationInput {
  tenantId: string;
  policyName: string;
  targetScope: {
    branches?: string[];
    cameraGroups?: string[];
    cameras?: string[];
  };
  proposedMinimumDays: number;
  proposedTargetDays: number;
}

export interface RetentionSimulationResult {
  simulationId: string;
  affectedCamerasCount: number;
  currentRequiredCapacityBytes: number;
  newRequiredCapacityBytes: number;
  availableUsableStorageBytes: number;
  capacityDeltaBytes: number;
  capacityShortfallBytes: number;
  isFeasibleWithoutExpansion: boolean;
  affectedBranchesCount: number;
  earliestProjectedViolationBranch?: string;
  earliestProjectedViolationDays?: number;
  calculatedAt: Date;
}
