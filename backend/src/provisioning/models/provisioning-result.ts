/**
 * Provisioning Result Models
 * Structured results for each provisioning step with evidence tracking
 */

/**
 * Common provisioning step result structure
 */
export interface ProvisioningStepResult<T = unknown> {
  success: boolean;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  data?: T;
  warnings: ProvisioningWarning[];
  errors: ProvisioningError[];
  diagnostics?: Record<string, unknown>;
}

export interface ProvisioningWarning {
  code: string;
  message: string;
  resourceId?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ProvisioningError {
  code: string;
  message: string;
  resourceId?: string;
  retryable: boolean;
  cause?: string;
  technicalDetails?: string;
}

/**
 * Network Provisioning Results
 */
export interface NetworkProvisioningResult {
  interfaces: InterfaceProvisioningResult[];
  gatewayReachable: boolean;
  dnsWorking: boolean;
  ntpWorking: boolean;
  configuredVlans: number[];
  managementAddress?: string;
  cameraSubnetReachable: boolean;
}

export interface InterfaceProvisioningResult {
  name: string;
  type: 'management' | 'camera' | 'uplink';
  configured: boolean;
  mode: 'dhcp' | 'static';
  address?: string;
  prefixLength?: number;
  gateway?: string;
  status: 'up' | 'down';
}

export interface NetworkVerificationResult {
  interfaceUp: boolean;
  assignedAddressCorrect: boolean;
  gatewayReachable: boolean;
  internetReachable?: boolean;
  dnsWorking: boolean;
  ntpWorking: boolean;
  cameraSubnetReachable: boolean;
  vlanAvailable?: boolean;
  latencyMs?: number;
}

/**
 * Camera Discovery Results
 */
export interface CameraDiscoveryResult {
  discovered: DiscoveredCamera[];
  imported: ImportedCamera[];
  duplicates: DuplicateCamera[];
  unreachable: DiscoveredCamera[];
  authenticationFailures: DiscoveredCamera[];
  unsupported: DiscoveredCamera[];
  totalDiscovered: number;
  totalImported: number;
  successRate: number;
}

export interface DiscoveredCamera {
  discoverySource: 'onvif' | 'subnet' | 'vendor' | 'manual';
  ipAddress: string;
  macAddress?: string;
  endpointReference?: string;
  serviceUrls?: string[];
  vendor?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  scopes?: string[];
  discoveredAt: Date;
  fingerprint?: DeviceFingerprint;
}

export interface ImportedCamera {
  cameraId: string;
  ipAddress: string;
  name: string;
  vendor: string;
  model: string;
  serialNumber?: string;
  capabilities: CameraCapabilities;
  streamValidated: boolean;
  credentialRotated: boolean;
  defaultCredentialRemaining: boolean;
  ntpSynchronized: boolean;
  clockDriftSeconds?: number;
}

export interface DuplicateCamera {
  ipAddress: string;
  identity: string;
  reason: string;
}

export interface DeviceFingerprint {
  type: 'camera' | 'nvr' | 'dvr' | 'storage' | 'router' | 'switch' | 'unknown';
  vendor?: string;
  model?: string;
  serialNumber?: string;
  protocols: string[];
  confidence: number;
  evidence: FingerprintEvidence[];
}

export interface FingerprintEvidence {
  source: string;
  value: string;
}

export interface CameraCapabilities {
  rtspAvailable: boolean;
  profiles: CameraProfile[];
  ptz: boolean;
  audio: boolean;
  events: boolean;
  analytics: boolean;
  snapshot: boolean;
  maxResolution?: {
    width: number;
    height: number;
  };
  supportsHttps: boolean;
  supportsTls: boolean;
}

export interface CameraProfile {
  token: string;
  name: string;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  streamUri?: string;
  bitrateMbps?: number;
}

export interface StreamValidationResult {
  reachable: boolean;
  codecDetected?: string;
  width?: number;
  height?: number;
  fpsObserved?: number;
  firstFrameLatencyMs?: number;
  timestampReceived?: Date;
}

/**
 * Storage Provisioning Results
 */
export interface StorageProvisioningResult {
  devices: StorageDevice[];
  selectedDevice?: StorageDevice;
  recordingPath: string;
  totalBytes: number;
  availableBytes: number;
  requiredBytes: number;
  retentionDays: number;
  retentionAchievable: boolean;
  writeVerified: boolean;
  readVerified: boolean;
  writeMbps?: number;
  readMbps?: number;
  checksumValid: boolean;
}

export interface StorageDevice {
  id: string;
  type: 'local' | 'nas' | 'san' | 'object';
  mountPoint?: string;
  totalBytes: number;
  availableBytes: number;
  writable: boolean;
  createdByProvisioning: boolean;
}

export interface StorageVerificationResult {
  writable: boolean;
  readable: boolean;
  checksumValid: boolean;
  writeMbps: number;
  readMbps: number;
  performanceAdequate: boolean;
}

/**
 * Recording Verification Results
 */
export interface RecordingVerificationResult {
  probes: RecordingProbeResult[];
  totalTested: number;
  totalPassed: number;
  successRate: number;
  allCriticalPassed: boolean;
}

export interface RecordingProbeResult {
  cameraId: string;
  cameraName: string;
  streamReceived: boolean;
  recordingStarted: boolean;
  recordingPersisted: boolean;
  playbackReadable: boolean;
  firstPacketAt?: Date;
  archiveCreatedAt?: Date;
  archivePath?: string;
  durationSeconds: number;
  error?: string;
}

/**
 * Health Check Results
 */
export interface BranchHealthResult {
  healthy: boolean;
  score: number;
  blockingIssues: HealthIssue[];
  warnings: HealthIssue[];
  components: {
    network: ComponentHealth;
    cameras: ComponentHealth;
    storage: ComponentHealth;
    recording: ComponentHealth;
    timeSync: ComponentHealth;
  };
}

export interface HealthIssue {
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  message: string;
  resourceId?: string;
  blocking: boolean;
  remediation?: string;
}

export interface ComponentHealth {
  healthy: boolean;
  score: number;
  status: 'pass' | 'degraded' | 'fail';
  issues: HealthIssue[];
  metadata?: Record<string, unknown>;
}

/**
 * Branch Activation Results
 */
export interface BranchActivationResult {
  activated: boolean;
  activatedAt: Date;
  healthScore: number;
  activeServices: string[];
  configurationApplied: boolean;
}
