import type { ControlPlaneStore } from "../control-plane-store.js";
import type { DiscoveredCamera, RecordingJob } from "../domain/models.js";
import { CAMERA_AI_RULE_BUNDLE, ensureCameraAiBundle } from "../analytics/camera-ai-bundle.js";
import type { DeviceCapabilityRegistry } from "../device-capabilities/index.js";

export interface CameraProvisionResult {
  discoveryId: string;
  cameraId?: string;
  status: "provisioned" | "partial" | "needs-attention" | "failed";
  message: string;
  stages?: {
    approved: boolean;
    recording: string;
    analytics: string;
    alerts: string;
    capabilities: string;
  };
  capabilities?: {
    discovered: number;
    verified: number;
    supported: number;
    unavailable: number;
  };
}

export interface CameraProvisionSummary {
  total: number;
  provisioned: number;
  partial: number;
  needsAttention: number;
  failed: number;
  credentialsRequired: number;
  pendingVerification: number;
}

export interface CameraProvisionOutcome {
  summary: CameraProvisionSummary;
  results: CameraProvisionResult[];
}

interface CameraProvisionOptions {
  edgeAgentId?: string;
  recordingMode?: "continuous" | "motion";
  retentionDays?: number;
  enableAnalytics?: boolean;
  enableAlerts?: boolean;
  createdBy?: string;
  capabilityRegistry?: DeviceCapabilityRegistry;
  discoverCapabilities?: boolean;
}

function retentionTiers(retentionDays: number) {
  const hotRetentionDays = Math.min(30, retentionDays);
  const warmRetentionDays = Math.min(60, Math.max(0, retentionDays - hotRetentionDays));
  return {
    hotRetentionDays,
    warmRetentionDays,
    coldRetentionDays: Math.max(0, retentionDays - hotRetentionDays - warmRetentionDays),
  };
}

export function isRecorderBacked(camera: Pick<DiscoveredCamera, "recorderId" | "sourceType">) {
  return Boolean(camera.recorderId) || camera.sourceType === "analog-dvr-channel" ||
    camera.sourceType === "nvr-channel";
}

export async function discoveryConnection(
  _store: ControlPlaneStore,
  _branchId: string,
  camera: Pick<DiscoveredCamera, "sourceType" | "ipAddress" | "recorderId" | "recorderChannel" | "edgeAgentId" | "id">,
) {
  // Discovery runs where the source is reachable and stores its verified RTSP
  // URI in that gateway's secret store. Keep that route after approval even
  // when the gateway's control/event uplink is an existing site-to-site VPN.
  // Direct central VPN ingestion remains available through manual registration.
  return {
    connectionSecretRef: `edge://${camera.edgeAgentId}/${camera.id}`,
    connectionTransport: "edge-gateway" as const,
  };
}

export function defaultRecordingJob(
  mode: "continuous" | "motion",
  retentionDays: number,
  recorderBacked = false,
): Omit<RecordingJob, "id" | "cameraId" | "updatedAt"> {
  return {
    mode,
    enabled: true,
    status: "idle",
    primaryRecordingStorage: recorderBacked ? "recorder-local" : "sentinel-local",
    cloudArchivePolicy: recorderBacked ? "incident-evidence-only" : "none",
    retentionDays,
    segmentDurationSeconds: 60,
    ...retentionTiers(retentionDays),
    critical: false,
    backupRequired: !recorderBacked,
    automaticDeletionEnabled: true,
    evidenceProtection: true,
    recordMainStream: true,
    preRollSeconds: 30,
    postRollSeconds: 120,
    minMotionDurationSeconds: 1,
    motionConfidenceThreshold: 0.65,
    cooldownSeconds: 60,
    maxEventDurationSeconds: 600,
    triggerEventTypes: CAMERA_AI_RULE_BUNDLE.map((rule) => rule.detectionType),
  };
}

function cameraProtocol(discovered: DiscoveredCamera) {
  if (isRecorderBacked(discovered)) return "vendor-adapter" as const;
  if (discovered.onvifSupport === false || discovered.discoveryMethod === "rtsp-network-scan") {
    return "rtsp" as const;
  }
  return "onvif-t" as const;
}

function compatibleUnique(discovered: DiscoveredCamera) {
  const duplicateStatus = discovered.duplicateStatus ?? "unique";
  const compatibility = discovered.compatibilityStatus ?? discovered.compatibility;
  return duplicateStatus === "unique" && compatibility === "compatible";
}

export function supersededRecorderCredentialDiscoveryIds(
  discoveries: readonly DiscoveredCamera[],
) {
  const verifiedRecorderIds = new Set(discoveries
    .filter((item) => item.recorderId && item.recorderChannel !== undefined &&
      item.streamVerified === true && item.credentialsRequired !== true)
    .map((item) => item.recorderId!));
  return discoveries
    .filter((item) => item.credentialsRequired === true && item.recorderId &&
      item.recorderChannel === undefined && verifiedRecorderIds.has(item.recorderId))
    .map((item) => item.id);
}

export async function autoProvisionVerifiedCameras(
  store: ControlPlaneStore,
  branchId: string,
  options: CameraProvisionOptions = {},
): Promise<CameraProvisionOutcome> {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") throw new Error("branch_not_found");

  const discoveredForBranch = await store.listDiscoveredCameras(branchId);
  const agentDiscoveries = discoveredForBranch.filter((discovered) =>
    !options.edgeAgentId || discovered.edgeAgentId === options.edgeAgentId
  );
  const supersededLoginIds = new Set(supersededRecorderCredentialDiscoveryIds(agentDiscoveries));
  await Promise.all([...supersededLoginIds].map((discoveryId) =>
    store.rejectDiscovery(discoveryId, "superseded_by_verified_recorder_channels")
  ));
  const scopedDiscoveries = agentDiscoveries.filter((discovered) =>
    discovered.status === "pending" &&
    !supersededLoginIds.has(discovered.id)
  );
  const pendingDiscoveries = scopedDiscoveries.filter(compatibleUnique);
  const results: CameraProvisionResult[] = [];
  const summary: CameraProvisionSummary = {
    total: pendingDiscoveries.length,
    provisioned: 0,
    partial: 0,
    needsAttention: 0,
    failed: 0,
    credentialsRequired: scopedDiscoveries.filter((item) => item.credentialsRequired === true).length,
    pendingVerification: scopedDiscoveries.filter((item) => !item.credentialsRequired && !item.streamVerified).length,
  };
  const recordingMode = options.recordingMode ?? "continuous";
  const retentionDays = options.retentionDays ?? 180;
  const analyticsEnabled = options.enableAnalytics ?? true;
  const alertsEnabled = options.enableAlerts ?? analyticsEnabled;

  for (const discovered of pendingDiscoveries) {
    if (!discovered.streamVerified || discovered.credentialsRequired) {
      results.push({
        discoveryId: discovered.id,
        status: "needs-attention",
        message: discovered.credentialsRequired
          ? "Camera credentials are required before provisioning"
          : "The camera stream must be verified before provisioning",
        stages: {
          approved: false,
          recording: "waiting-for-stream",
          analytics: "waiting-for-stream",
          alerts: "waiting-for-stream",
          capabilities: "not-attempted",
        },
      });
      summary.needsAttention++;
      continue;
    }

    try {
      const name = discovered.displayName || discovered.model || `${discovered.vendor} camera`;
      const sourceConnection = await discoveryConnection(store, branchId, discovered);
      const camera = await store.approveCamera(branchId, {
        discoveryId: discovered.id,
        name,
        protocol: cameraProtocol(discovered),
        channel: discovered.recorderChannel ?? 1,
        connectionSecretRef: sourceConnection.connectionSecretRef,
        ...(sourceConnection.connectionTransport ? { connectionTransport: sourceConnection.connectionTransport } : {}),
        model: discovered.model,
        serialNumber: discovered.serialNumber,
        macAddress: discovered.macAddress,
        ipAddress: discovered.ipAddress,
        onvifUuid: discovered.onvifUuid,
        certificateRef: discovered.certificateRef,
        certificateFingerprint: discovered.certificateFingerprint,
        streamProfile: "main",
        sourceType: discovered.sourceType,
        recorderId: discovered.recorderId,
        recorderChannel: discovered.recorderChannel,
        recorderSerialNumber: discovered.recorderSerialNumber,
      });
      if (!camera) throw new Error("Failed to approve discovered camera");

      await store.upsertRecordingJob(
        camera.id,
        defaultRecordingJob(recordingMode, retentionDays, isRecorderBacked(discovered)),
      );

      if (analyticsEnabled) {
        await ensureCameraAiBundle(
          store,
          branch.tenantId,
          camera.id,
          alertsEnabled ? options.createdBy : undefined,
        );
      }

      // Discover capabilities if registry provided
      let capabilitiesResult;
      if (options.capabilityRegistry && (options.discoverCapabilities ?? true)) {
        try {
          const capabilities = await options.capabilityRegistry.refreshCapabilities(
            branch.tenantId,
            camera.id,
          );

          // Count capabilities by state
          const counts = countCapabilitiesByState(capabilities);
          capabilitiesResult = {
            discovered: counts.total,
            verified: counts.verified,
            supported: counts.supported,
            unavailable: counts.unavailable,
          };
        } catch (error) {
          console.warn(
            `Failed to discover capabilities for camera ${camera.id}:`,
            error instanceof Error ? error.message : String(error),
          );
          capabilitiesResult = {
            discovered: 0,
            verified: 0,
            supported: 0,
            unavailable: 0,
          };
        }
      }

      results.push({
        discoveryId: discovered.id,
        cameraId: camera.id,
        status: "provisioned",
        message: analyticsEnabled
          ? "Camera, recording, analytics, and alerts provisioned successfully"
          : "Verified live stream activated with continuous recording",
        stages: {
          approved: true,
          recording: isRecorderBacked(discovered) ? "recorder-local" : "configured",
          analytics: analyticsEnabled ? "active" : "disabled",
          alerts: analyticsEnabled && alertsEnabled ? "enabled" : "disabled",
          capabilities: capabilitiesResult ? "discovered" : "skipped",
        },
        capabilities: capabilitiesResult,
      });
      summary.provisioned++;
    } catch (error) {
      results.push({
        discoveryId: discovered.id,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to provision camera",
      });
      summary.failed++;
    }
  }

  return { summary, results };
}

/**
 * Count capabilities by state for provisioning summary.
 */
function countCapabilitiesByState(capabilities: any): {
  total: number;
  verified: number;
  supported: number;
  unavailable: number;
} {
  let total = 0;
  let verified = 0;
  let supported = 0;
  let unavailable = 0;

  function traverse(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    if ("state" in obj && "verificationLevel" in obj) {
      // This is a capability
      total++;
      if (obj.verificationLevel === "VERIFIED") verified++;
      if (obj.state === "SUPPORTED") supported++;
      if (obj.state === "UNAVAILABLE") unavailable++;
    } else {
      // Traverse nested objects
      for (const value of Object.values(obj)) {
        traverse(value);
      }
    }
  }

  traverse(capabilities);
  return { total, verified, supported, unavailable };
}
