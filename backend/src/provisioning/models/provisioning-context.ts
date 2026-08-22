/**
 * Provisioning Context Model
 * Carries state and evidence through the provisioning workflow
 */

import {
  BranchActivationResult,
  BranchHealthResult,
  CameraDiscoveryResult,
  NetworkProvisioningResult,
  ProvisioningStepResult,
  RecordingVerificationResult,
  StorageProvisioningResult,
} from './provisioning-result';

/**
 * Main provisioning context that flows through all steps
 */
export interface ProvisioningContext {
  jobId: string;
  tenantId: string;
  organizationId?: string;
  branchId: string;
  requestedBy?: string;
  config: BranchProvisioningConfig;
  
  // Step results - populated as provisioning progresses
  network?: ProvisioningStepResult<NetworkProvisioningResult>;
  cameras?: ProvisioningStepResult<CameraDiscoveryResult>;
  storage?: ProvisioningStepResult<StorageProvisioningResult>;
  recording?: ProvisioningStepResult<RecordingVerificationResult>;
  health?: ProvisioningStepResult<BranchHealthResult>;
  activation?: ProvisioningStepResult<BranchActivationResult>;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Branch provisioning configuration
 */
export interface BranchProvisioningConfig {
  network: BranchNetworkConfig;
  discovery: CameraDiscoveryConfig;
  storage: StorageConfig;
  recording: RecordingConfig;
  health: HealthPolicyConfig;
  credentials: CredentialConfig;
  templateId?: string;
}

/**
 * Network configuration
 */
export interface BranchNetworkConfig {
  management: {
    mode: 'dhcp' | 'static';
    address?: string;
    prefixLength?: number;
    gateway?: string;
  };
  cameraNetwork: {
    subnet: string;
    vlanId?: number;
    dhcp?: {
      enabled: boolean;
      start?: string;
      end?: string;
    };
  };
  dnsServers: string[];
  ntpServers: string[];
}

/**
 * Camera discovery configuration
 */
export interface CameraDiscoveryConfig {
  approvedSubnets: string[];
  expectedCount?: number;
  permittedVendors?: string[];
  minimumSuccessPercent: number;
  enableOnvifDiscovery: boolean;
  enableSubnetScan: boolean;
  scanPorts: number[];
  discoveryTimeoutSeconds: number;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  retentionDays: number;
  reservePercent: number;
  minimumWriteMbps: number;
  minimumReadMbps: number;
  allowedMountRoots: string[];
  allowFormatting: boolean;
  minimumCapacityBytes: number;
}

/**
 * Recording configuration
 */
export interface RecordingConfig {
  enabled: boolean;
  testDurationSeconds: number;
  minimumCamerasToTest: number;
  requireAllCamerasPass: boolean;
}

/**
 * Health policy configuration
 */
export interface HealthPolicyConfig {
  network: {
    gatewayRequired: boolean;
    dnsRequired: boolean;
    ntpRequired: boolean;
    maximumClockDriftSeconds: number;
  };
  cameras: {
    minimumOperationalPercent: number;
    requireStreamValidation: boolean;
    blockOnDefaultCredentials: boolean;
  };
  storage: {
    writableRequired: boolean;
    minimumRetentionDays: number;
    requirePerformanceTest: boolean;
  };
  recording: {
    verifiedRequired: boolean;
    minimumSuccessPercent: number;
  };
}

/**
 * Credential configuration
 */
export interface CredentialConfig {
  allowDefaultCredentials: boolean;
  requireCredentialRotation: boolean;
  vaultEnabled: boolean;
  fallbackUsername?: string;
  fallbackPasswordRef?: string;
}

/**
 * Discovery context for camera discovery providers
 */
export interface DiscoveryContext {
  branchId: string;
  tenantId: string;
  approvedSubnets: string[];
  scanPorts: number[];
  timeoutSeconds: number;
}

/**
 * Default provisioning configuration
 */
export const DEFAULT_PROVISIONING_CONFIG: BranchProvisioningConfig = {
  network: {
    management: {
      mode: 'dhcp',
    },
    cameraNetwork: {
      subnet: '192.168.100.0/24',
    },
    dnsServers: ['8.8.8.8', '8.8.4.4'],
    ntpServers: ['pool.ntp.org', 'time.google.com'],
  },
  discovery: {
    approvedSubnets: ['192.168.100.0/24'],
    minimumSuccessPercent: 80,
    enableOnvifDiscovery: true,
    enableSubnetScan: true,
    scanPorts: [80, 443, 554, 8000, 8080],
    discoveryTimeoutSeconds: 300,
  },
  storage: {
    retentionDays: 30,
    reservePercent: 15,
    minimumWriteMbps: 100,
    minimumReadMbps: 200,
    allowedMountRoots: ['/mnt/surveillance', '/recordings'],
    allowFormatting: false,
    minimumCapacityBytes: 1099511627776, // 1TB
  },
  recording: {
    enabled: true,
    testDurationSeconds: 10,
    minimumCamerasToTest: 1,
    requireAllCamerasPass: false,
  },
  health: {
    network: {
      gatewayRequired: true,
      dnsRequired: true,
      ntpRequired: true,
      maximumClockDriftSeconds: 5,
    },
    cameras: {
      minimumOperationalPercent: 90,
      requireStreamValidation: true,
      blockOnDefaultCredentials: false,
    },
    storage: {
      writableRequired: true,
      minimumRetentionDays: 30,
      requirePerformanceTest: true,
    },
    recording: {
      verifiedRequired: true,
      minimumSuccessPercent: 90,
    },
  },
  credentials: {
    allowDefaultCredentials: false,
    requireCredentialRotation: true,
    vaultEnabled: true,
  },
};
