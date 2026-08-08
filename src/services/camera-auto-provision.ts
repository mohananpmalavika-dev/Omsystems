import type { AnalyticsRuleInput, ControlPlaneStore } from "../control-plane-store.js";
import type { DiscoveredCamera, RecordingJob } from "../domain/models.js";

const defaultAnalyticsRules: ReadonlyArray<Pick<
  AnalyticsRuleInput,
  "name" | "detectionType" | "objectClasses" | "severity" | "minDurationSeconds"
>> = [
  { name: "Person detection", detectionType: "person", objectClasses: ["person"], severity: "P2", minDurationSeconds: 0 },
  { name: "Vehicle detection", detectionType: "vehicle", objectClasses: ["car", "truck", "bus", "motorcycle"], severity: "P3", minDurationSeconds: 0 },
  { name: "Restricted-area intrusion", detectionType: "intrusion", objectClasses: ["person", "vehicle"], severity: "P1", minDurationSeconds: 1 },
  { name: "Line crossing", detectionType: "line-crossing", objectClasses: ["person", "vehicle"], severity: "P2", minDurationSeconds: 0 },
  { name: "Loitering", detectionType: "loitering", objectClasses: ["person"], severity: "P2", minDurationSeconds: 30 },
  { name: "Crowd detection", detectionType: "crowd", objectClasses: ["person"], severity: "P2", minDurationSeconds: 10 },
  { name: "Fire and smoke detection", detectionType: "fire-smoke", objectClasses: ["fire", "smoke"], severity: "P1", minDurationSeconds: 1 },
  { name: "Safety equipment detection", detectionType: "ppe", objectClasses: ["person", "helmet", "vest"], severity: "P2", minDurationSeconds: 1 },
  { name: "Camera tamper detection", detectionType: "camera-tamper", objectClasses: [], severity: "P1", minDurationSeconds: 1 },
  { name: "Unattended object", detectionType: "object-left", objectClasses: ["bag", "package"], severity: "P2", minDurationSeconds: 30 },
];

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

function vpnDiscoveryReference(
  branchId: string,
  camera: Pick<DiscoveredCamera, "sourceType" | "ipAddress" | "recorderId" | "recorderChannel">,
) {
  const source = isRecorderBacked(camera)
    ? `recorder/${encodeURIComponent(camera.recorderId ?? "unknown")}/channel/${camera.recorderChannel ?? 0}`
    : `camera/${camera.ipAddress}`;
  return `vpn://${encodeURIComponent(branchId)}/${source}`;
}

export async function discoveryConnection(
  store: ControlPlaneStore,
  branchId: string,
  camera: Pick<DiscoveredCamera, "sourceType" | "ipAddress" | "recorderId" | "recorderChannel" | "edgeAgentId" | "id">,
) {
  const profile = await store.getBranchConnectivityProfile(branchId);
  if (profile?.primaryTransport === "vpn") {
    return {
      connectionSecretRef: vpnDiscoveryReference(branchId, camera),
      connectionTransport: "vpn" as const,
    };
  }
  return { connectionSecretRef: `edge://${camera.edgeAgentId}/${camera.id}` };
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
    triggerEventTypes: defaultAnalyticsRules.map((rule) => rule.detectionType),
  };
}

function analyticsRuleInput(
  definition: (typeof defaultAnalyticsRules)[number],
  alertsEnabled: boolean,
): AnalyticsRuleInput {
  return {
    ...definition,
    enabled: true,
    minConfidence: 0.65,
    direction: "any",
    cooldownSeconds: 60,
    recipients: [],
    recordingPolicy: alertsEnabled ? "protect-window" : "event-recording",
    preRollSeconds: 30,
    postRollSeconds: 120,
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

export async function autoProvisionVerifiedCameras(
  store: ControlPlaneStore,
  branchId: string,
  options: CameraProvisionOptions = {},
): Promise<CameraProvisionOutcome> {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") throw new Error("branch_not_found");

  const scopedDiscoveries = (await store.listDiscoveredCameras(branchId)).filter((discovered) =>
    discovered.status === "pending" &&
    (!options.edgeAgentId || discovered.edgeAgentId === options.edgeAgentId)
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
  const analyticsEnabled = options.enableAnalytics === true && Boolean(options.createdBy);
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

      if (analyticsEnabled && options.createdBy) {
        for (const definition of defaultAnalyticsRules) {
          await store.createAnalyticsRule(
            branch.tenantId,
            camera.id,
            options.createdBy,
            analyticsRuleInput(definition, alertsEnabled),
          );
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
        },
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
