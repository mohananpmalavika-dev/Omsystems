/**
 * Zero-Touch Brownfield Automated Onboarding Domain Types
 * Enables autonomous branch setup, agent self-enrollment,
 * multi-protocol discovery, channel identification, and zero-touch camera provisioning.
 */

export type OnboardingStage =
  | "BRANCH_CREATED"
  | "ENROLLMENT_GENERATED"
  | "AGENT_AUTHENTICATING"
  | "AGENT_ENROLLED"
  | "SCANNING_LAN"
  | "DISCOVERING_RECORDERS"
  | "IDENTIFYING_CHANNELS"
  | "PROBING_STREAM_HEALTH"
  | "AUTO_PROVISIONING_CAMERAS"
  | "MONITORING_ACTIVE"
  | "FAILED";

export interface EnrollmentToken {
  token: string;                  // e.g. "ENROLL-MUM-8492-X9F"
  branchId: string;
  tenantId: string;
  controlPlaneUrl: string;
  expiresAt: string;             // 24h expiration
  isUsed: boolean;
  usedAt?: string;
  enrolledAgentId?: string;
  installerScripts: {
    windowsPowerShell: string;
    linuxBash: string;
    dockerCompose: string;
  };
}

export interface AutoDiscoveredChannel {
  channelNumber: number;
  channelName: string;
  mainRtspUri: string;
  subRtspUri?: string;
  codec: "H264" | "H265" | "MJPEG";
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  bitrateKbps: number;
  hasAudio: boolean;
  hasPtz: boolean;
  status: "ONLINE" | "OFFLINE" | "UNAUTHENTICATED";
}

export interface AutoDiscoveredDevice {
  ipAddress: string;
  macAddress: string;
  protocol: "ONVIF" | "DAHUA_CGI" | "HIKVISION_ISAPI" | "CPPLUS_PROPRIETARY" | "GENERIC_RTSP";
  deviceType: "IP_CAMERA" | "DVR_NVR" | "NETWORK_SWITCH" | "EDGE_GATEWAY";
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber: string;
  channelCount: number;
  channels: AutoDiscoveredChannel[];
  onvifEndpoint?: string;
  discoveredAt: string;
}

export interface AutoProvisioningRequest {
  branchId: string;
  agentId: string;
  scannedSubnets: string[];
  discoveredDevices: AutoDiscoveredDevice[];
  discoveryDurationMs: number;
}

export interface ProvisionedCameraRecord {
  cameraId: string;
  cameraName: string;
  branchId: string;
  ipAddress: string;
  channelNumber: number;
  recorderId?: string;
  protocol: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  resolution: string;
  fps: number;
  recordingStreamUri: string;
  status: "PROVISIONED_AND_ACTIVE";
  provisionedAt: string;
}

export interface ZeroTouchOnboardingReport {
  onboardingId: string;
  branchId: string;
  branchName: string;
  agentId: string;
  stage: OnboardingStage;
  totalDevicesFound: number;
  totalCamerasProvisioned: number;
  totalRecordersFound: number;
  elapsedSeconds: number;
  provisionedCameras: ProvisionedCameraRecord[];
  digitalTwinNodesCreated: number;
  recordingStarted: boolean;
  message: string;
  completedAt?: string;
}

export interface BranchOnboardingStatus {
  branchId: string;
  branchName: string;
  tenantId: string;
  currentStage: OnboardingStage;
  stageProgressPct: number;
  enrollmentCode?: string;
  agentConnected: boolean;
  camerasDiscovered: number;
  camerasProvisioned: number;
  elapsedSeconds: number;
  lastUpdated: string;
  error?: string;
}
