/**
 * Digital Twin Asset Models
 * 
 * Core types for representing physical and logical infrastructure assets
 * in the surveillance system digital twin.
 */

export type AssetType =
  | 'enterprise'
  | 'region'
  | 'branch'
  | 'network'
  | 'gateway'
  | 'switch'
  | 'vlan'
  | 'camera'
  | 'dvr'
  | 'nvr'
  | 'storage'
  | 'server'
  | 'recorder';

export type AssetStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'offline'
  | 'unknown'
  | 'degraded'
  | 'maintenance';

export interface TwinIssue {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface AssetHealth {
  score: number; // 0-100
  lastSeen?: Date;
  issues: TwinIssue[];
  metrics?: {
    uptime?: number;
    packetLoss?: number;
    latency?: number;
    errorRate?: number;
    [key: string]: number | undefined;
  };
}

export interface AssetSecurity {
  score: number; // 0-100
  vulnerabilities: number;
  configurationIssues: number;
  lastAudit?: Date;
  details?: {
    firmwareStatus?: 'current' | 'outdated' | 'critical';
    defaultCredentials?: boolean;
    exposedPorts?: number;
    encryptionEnabled?: boolean;
    tlsEnabled?: boolean;
    lastCredentialRotation?: Date;
  };
}

export interface DigitalTwinAsset {
  id: string;
  type: AssetType;
  name: string;
  
  // Hierarchy
  parentId?: string;
  
  // Current state
  status: AssetStatus;
  
  // Type-specific data
  metadata: Record<string, unknown>;
  
  // Health and security
  health: AssetHealth;
  security: AssetSecurity;
  
  // Business context
  location?: string;
  purpose?: string;
  criticality?: 'critical' | 'high' | 'medium' | 'low';
  complianceRequired?: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type-specific metadata interfaces for type safety
 */
export interface CameraMetadata {
  ipAddress: string;
  macAddress?: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  resolution?: string;
  fps?: number;
  protocol?: string;
  streamUrl?: string;
  ptzCapable?: boolean;
  zone?: string;
  coverage?: string[];
  [key: string]: unknown;
}

export interface NetworkDeviceMetadata {
  ipAddress: string;
  macAddress?: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  ports?: number;
  poeEnabled?: boolean;
  vlan?: number;
  bandwidth?: string;
  [key: string]: unknown;
}

export interface StorageMetadata {
  capacityBytes: number;
  usedBytes: number;
  freeBytes?: number;
  raid?: string;
  retentionDays?: number;
  location?: string;
  redundancy?: boolean;
  compressionEnabled?: boolean;
  [key: string]: unknown;
}

export interface RecorderMetadata {
  ipAddress: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  channels?: number;
  usedChannels?: number;
  recordingCapacity?: number;
  recordingFormat?: string;
  [key: string]: unknown;
}

export interface BranchMetadata {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  operatingHours?: string;
  contactPerson?: string;
  contactPhone?: string;
  [key: string]: unknown;
}

/**
 * Asset creation helpers
 */
export function createAsset(
  type: AssetType,
  name: string,
  metadata: Record<string, unknown>,
  options?: {
    parentId?: string;
    status?: AssetStatus;
    criticality?: 'critical' | 'high' | 'medium' | 'low';
  }
): DigitalTwinAsset {
  const now = new Date();
  
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    name,
    parentId: options?.parentId,
    status: options?.status || 'unknown',
    metadata,
    health: {
      score: 100,
      issues: []
    },
    security: {
      score: 100,
      vulnerabilities: 0,
      configurationIssues: 0
    },
    criticality: options?.criticality || 'medium',
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Type guards
 */
export function isCameraAsset(asset: DigitalTwinAsset): asset is DigitalTwinAsset & { metadata: CameraMetadata } {
  return asset.type === 'camera';
}

export function isNetworkAsset(asset: DigitalTwinAsset): boolean {
  return ['gateway', 'switch', 'vlan', 'network'].includes(asset.type);
}

export function isStorageAsset(asset: DigitalTwinAsset): asset is DigitalTwinAsset & { metadata: StorageMetadata } {
  return asset.type === 'storage';
}

export function isRecorderAsset(asset: DigitalTwinAsset): boolean {
  return ['dvr', 'nvr', 'recorder'].includes(asset.type);
}
