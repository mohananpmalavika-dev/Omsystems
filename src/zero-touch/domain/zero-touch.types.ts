/**
 * Zero-Touch Brownfield Automated Onboarding Domain Types (Production Control Plane)
 * Real provisioning state machine, fleet management, device review & approval,
 * credential vault binding, end-to-end video verification, and SLA metrics.
 */

export type ProvisioningJobStatus =
  | "QUEUED"
  | "ENROLLING"
  | "AGENT_CONNECTING"
  | "DISCOVERING"
  | "DISCOVERY_COMPLETE"
  | "VALIDATING"
  | "AWAITING_CREDENTIALS"
  | "AWAITING_APPROVAL"
  | "REGISTERING"
  | "VERIFYING_RECORDING"
  | "COMPLETED"
  | "PARTIALLY_READY"
  | "FAILED"
  | "CANCELLED";

export type ProvisioningStepType =
  | "CREATE_BRANCH"
  | "ENROLLMENT_VERIFIED"
  | "MTLS_ESTABLISHED"
  | "AGENT_HEARTBEAT"
  | "NETWORK_SCAN"
  | "DEVICE_DISCOVERY"
  | "CHANNEL_IDENTIFICATION"
  | "CREDENTIAL_AUTHENTICATION"
  | "STREAM_VALIDATION"
  | "DEVICE_REGISTRATION"
  | "RECORDING_VERIFICATION"
  | "MONITORING_ACTIVATION";

export type StepExecutionStatus = "PENDING" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";

export interface ProvisioningJobStep {
  step: ProvisioningStepType;
  label: string;
  description: string;
  status: StepExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface StreamVerificationDetails {
  framesIngested: number;
  bitrateMeasuredKbps: number;
  fpsMeasured: number;
  packetLossPct: number;
  recordingSegmentWritten: boolean;
  segmentDurationSec: number;
  storagePathVerified: string;
  playbackVerified: boolean;
  playbackLatencyMs: number;
  telemetryBound: boolean;
}

export interface DiscoveredChannelReview {
  channelNumber: number;
  channelName: string;
  mainRtspUri: string;
  subRtspUri?: string;
  codec: "H264" | "H265" | "MJPEG";
  resolution: string;
  fps: number;
  bitrateKbps: number;
  hasAudio: boolean;
  hasPtz: boolean;
  validationState: "PENDING" | "VALIDATED" | "AUTH_FAILED" | "UNREACHABLE";
  isApproved: boolean;
  streamVerified?: boolean; // Simple boolean flag for stream verification status
  streamVerification?: StreamVerificationDetails;
  errorMessage?: string;
}

export interface DiscoveredDeviceReviewItem {
  deviceId: string;
  branchId: string;
  ipAddress: string;
  macAddress: string;
  protocol: "ONVIF" | "DAHUA_CGI" | "HIKVISION_ISAPI" | "CPPLUS_PROPRIETARY" | "GENERIC_RTSP";
  deviceType: "IP_CAMERA" | "DVR_NVR" | "NETWORK_SWITCH" | "EDGE_GATEWAY";
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  channelCount: number;
  channels: DiscoveredChannelReview[];
  reviewStatus: "DISCOVERED" | "VALIDATED" | "AWAITING_CREDENTIALS" | "APPROVED" | "REJECTED" | "REGISTERED";
  credentialsRequired: boolean;
  streamVerified?: boolean; // Simple boolean flag indicating if device has verified streaming
  credentialVaultKey?: string;
  discoveredAt: string;
  lastValidatedAt?: string;
  onvifEndpoint?: string;
}

export interface ProvisioningJob {
  id: string;
  branchId: string;
  branchName: string;
  agentId?: string;
  status: ProvisioningJobStatus;
  currentStep: ProvisioningStepType;
  steps: ProvisioningJobStep[];
  startedAt: string;
  completedAt?: string;
  totalDurationSeconds?: number;
  targetSlaSeconds: number;
  readinessScorePct: number;
  
  // Counts
  discoveredDeviceCount: number;
  discoveredChannelCount: number;
  approvedChannelCount: number;
  registeredCameraCount: number;
  streamingVerifiedCount: number;
  recordingVerifiedCount: number;
  unauthenticatedCount: number;
  unreachableCount: number;

  errorMessage?: string;
  diagnosticsLogUrl?: string;
  createdBy: string;
  scannedSubnets: string[];
}

export interface EnrollmentPackage {
  token: string;                  // e.g. "ENR-8F29A005-B81C"
  branchId: string;
  branchName: string;
  tenantId: string;
  controlPlaneUrl: string;
  expiresAt: string;             // 15-minute TTL
  maxUses: number;
  usedCount: number;
  isRevoked: boolean;
  issuedAt: string;
  installerScripts: {
    windowsPowerShell: string;
    linuxBash: string;
    dockerCompose: string;
  };
}

export interface BranchFleetSummary {
  branchId: string;
  branchName: string;
  region: string;
  agentStatus: "CONNECTED" | "NOT_ENROLLED" | "OFFLINE" | "DEGRADED";
  agentId?: string;
  agentVersion?: string;
  agentIp?: string;
  lastHeartbeat?: string;
  totalDevices: number;
  totalCameras: number;
  readinessScorePct: number;
  lastJobStatus?: ProvisioningJobStatus;
  lastJobId?: string;
  lastProvisionedAt?: string;
  operationalStatus: "ACTIVE" | "PROVISIONING" | "PARTIAL" | "FAILED" | "UNENROLLED";
}

export interface FleetSlaMetrics {
  targetSlaSeconds: number;
  lastProvisioningSeconds: number;
  fleetAverageSeconds: number;
  p50Seconds: number;
  p95Seconds: number;
  totalBranchesProvisioned: number;
  activeProvisioningJobs: number;
  slaAdherencePct: number;
}

export interface ProvisioningDiagnosticReport {
  branchId: string;
  agentId: string;
  generatedAt: string;
  mTLSStatus: {
    clientCertSerial: string;
    san: string;
    thumbprint: string;
    isValid: boolean;
    expiresAt: string;
  };
  networkDiagnostics: {
    gatewayIp: string;
    detectedSubnets: string[];
    onvifMulticastReachability: boolean;
    arpTableEntries: number;
    dnsLatencyMs: number;
    packetLossPct: number;
  };
  rawProbes: {
    protocol: string;
    targetIp: string;
    requestPayload?: string;
    responsePayload?: string;
    latencyMs: number;
    status: string;
  }[];
  agentLogs: string[];
}

export type EnrollmentToken = EnrollmentPackage;
export type BranchOnboardingStatus = any;
export type OnboardingStage = any;
export type AutoDiscoveredDevice = any;
export type AutoProvisioningRequest = any;
export type ZeroTouchOnboardingReport = any;
export type ProvisionedCameraRecord = any;

