import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { AnalyticsRuleInput, ControlPlaneStore } from "../control-plane-store.js";
import type { DiscoveredCamera, RecordingJob } from "../domain/models.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const discoveryParams = z.object({ 
  branchId: z.string().min(1),
  discoveryId: z.string().min(1),
});

const approveDiscoveryBody = z.object({
  name: z.string().min(1),
  channel: z.number().int().min(1).optional(),
  protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]).optional(),
  connectionSecretRef: z.string().min(1).optional(),
});

const approveAllBody = z.object({
  recordingMode: z.enum(["continuous", "motion"]).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  enableAnalytics: z.boolean().optional(),
  enableAlerts: z.boolean().optional(),
});

const activateDiscoveryBody = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1_024),
});

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

function retentionTiers(retentionDays: number) {
  const hotRetentionDays = Math.min(30, retentionDays);
  const warmRetentionDays = Math.min(60, Math.max(0, retentionDays - hotRetentionDays));
  return {
    hotRetentionDays,
    warmRetentionDays,
    coldRetentionDays: Math.max(0, retentionDays - hotRetentionDays - warmRetentionDays),
  };
}

function isRecorderBacked(camera: Pick<DiscoveredCamera, "recorderId" | "sourceType">) {
  return Boolean(camera.recorderId) || camera.sourceType === "analog-dvr-channel" ||
    camera.sourceType === "nvr-channel";
}

function vpnDiscoveryReference(branchId: string, camera: Pick<DiscoveredCamera, "sourceType" | "ipAddress" | "recorderId" | "recorderChannel">) {
  const recorderBacked = isRecorderBacked(camera);
  const source = recorderBacked
    ? `recorder/${encodeURIComponent(camera.recorderId ?? "unknown")}/channel/${camera.recorderChannel ?? 0}`
    : `camera/${camera.ipAddress}`;
  return `vpn://${encodeURIComponent(branchId)}/${source}`;
}

async function discoveryConnection(
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

function defaultRecordingJob(
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

/**
 * Lists pending ONVIF discoveries. Submission, approval, and camera inventory
 * remain on the existing control-plane routes so they retain the same
 * authorization, validation, secret redaction, and audit behavior.
 */
export async function registerCameraDiscoveryRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  pool?: Pool,
) {
  app.get("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }
    return { data: await store.listDiscoveredCameras(branchId) };
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/approve", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = approveDiscoveryBody.parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const discoveries = await store.listDiscoveredCameras(branchId);
    const discovered = discoveries.find((item) => item.id === discoveryId);
    if (!discovered) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    const connection = await discoveryConnection(store, branchId, discovered);
    const camera = await store.approveCamera(branchId, {
      discoveryId,
      name: body.name,
      protocol: body.protocol ?? (discovered.recorderId ? "vendor-adapter" : "onvif-t"),
      channel: body.channel ?? discovered.recorderChannel ?? 1,
      connectionSecretRef: body.connectionSecretRef ?? connection.connectionSecretRef,
      ...(connection.connectionTransport ? { connectionTransport: connection.connectionTransport } : {}),
      model: discovered.model,
      serialNumber: discovered.serialNumber,
      ipAddress: discovered.ipAddress,
      sourceType: discovered.sourceType,
      recorderId: discovered.recorderId,
      recorderChannel: discovered.recorderChannel,
      recorderSerialNumber: discovered.recorderSerialNumber,
    });

    if (!camera) {
      return reply.code(500).send({ error: "failed_to_approve_camera" });
    }

    const recorderBacked = isRecorderBacked(discovered);
    await store.upsertRecordingJob(
      camera.id,
      defaultRecordingJob("continuous", 180, recorderBacked),
    );

    return {
      success: true,
      cameraId: camera.id,
      recordingArchitecture: recorderBacked ? "recorder-local-evidence-only" : "sentinel-local",
      message: `Camera ${body.name} approved and added to monitoring`,
    };
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/activate", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = activateDiscoveryBody.parse(request.body);
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden", reason: decision?.reason ?? "no_matching_grant" });
    }
    if (!pool) {
      return reply.code(503).send({ error: "discovery_credentials_database_unavailable" });
    }

    const discovered = (await store.listDiscoveredCameras(branchId))
      .find((item) => item.id === discoveryId);
    if (!discovered) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }
    const agent = await store.getEdgeAgent(discovered.edgeAgentId);
    if (!agent || agent.branchId !== branchId) {
      return reply.code(409).send({ error: "discovery_edge_agent_unavailable" });
    }
    if (agent.status !== "online") {
      return reply.code(409).send({
        error: "discovery_edge_agent_not_connected",
        message: "Connect the branch scanner to verify this device.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM camera_credentials
         WHERE branch_id = $1 AND ip_address = $2 AND scope = 'host-specific'`,
        [branchId, discovered.ipAddress],
      );
      await client.query(
        `INSERT INTO camera_credentials
           (branch_id, edge_agent_id, ip_address, username, password, scope)
         VALUES ($1, $2, $3, $4, $5, 'host-specific')`,
        [branchId, discovered.edgeAgentId, discovered.ipAddress, body.username, body.password],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const scan = await store.createEdgeScanJob(branchId, discovered.edgeAgentId);
    await store.writeAudit({
      tenantId: branch.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.discovery_credentials_activated",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { discoveryId, edgeAgentId: discovered.edgeAgentId, credentialScope: "host-specific" },
    });
    return reply.code(202).send({
      scanId: scan.id,
      status: scan.status,
      message: "Credentials saved. The branch gateway is verifying the device now.",
    });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/approve-all", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = approveAllBody.parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    // Get all pending discovered cameras
    const discoveries = await store.listDiscoveredCameras(branchId);
    const pendingDiscoveries = discoveries.filter((discovered) =>
      discovered.status === "pending" &&
      discovered.duplicateStatus === "unique" &&
      discovered.compatibilityStatus === "compatible"
    );

    const results: Array<Record<string, unknown>> = [];
    let provisioned = 0;
    let partial = 0;
    let needsAttention = 0;
    let failed = 0;
    const recordingMode = body.recordingMode ?? "continuous";
    const retentionDays = body.retentionDays ?? 180;
    const analyticsEnabled = body.enableAnalytics ?? true;
    const alertsEnabled = body.enableAlerts ?? true;
    const connection = await store.getBranchConnectivityProfile(branchId);

    for (const [index, discovered] of pendingDiscoveries.entries()) {
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
        needsAttention++;
        continue;
      }

      try {
        const name = discovered.displayName || discovered.model || `${discovered.vendor} camera`;
        const sourceConnection = connection?.primaryTransport === "vpn"
          ? { connectionSecretRef: vpnDiscoveryReference(branchId, discovered), connectionTransport: "vpn" as const }
          : { connectionSecretRef: `edge://${discovered.edgeAgentId}/${discovered.id}` };
        const camera = await store.approveCamera(branchId, {
          discoveryId: discovered.id,
          name,
          protocol: discovered.recorderId ? "vendor-adapter" : "onvif-t",
          channel: discovered.recorderChannel ?? index + 1,
          connectionSecretRef: sourceConnection.connectionSecretRef,
          ...(sourceConnection.connectionTransport ? { connectionTransport: sourceConnection.connectionTransport } : {}),
          model: discovered.model,
          serialNumber: discovered.serialNumber,
          ipAddress: discovered.ipAddress,
          streamProfile: "main",
          sourceType: discovered.sourceType,
          recorderId: discovered.recorderId,
          recorderChannel: discovered.recorderChannel,
          recorderSerialNumber: discovered.recorderSerialNumber,
        });

        if (!camera) {
          throw new Error("Failed to approve discovered camera");
        }

        await store.upsertRecordingJob(
          camera.id,
          defaultRecordingJob(
            recordingMode,
            retentionDays,
            isRecorderBacked(discovered),
          ),
        );

        if (analyticsEnabled) {
          for (const definition of defaultAnalyticsRules) {
            await store.createAnalyticsRule(
              branch.tenantId,
              camera.id,
              request.currentUser.id,
              analyticsRuleInput(definition, alertsEnabled),
            );
          }
        }

        results.push({
          discoveryId: discovered.id,
          cameraId: camera.id,
          status: "provisioned",
          message: "Camera, recording, analytics, and alerts provisioned successfully",
          stages: {
            approved: true,
            recording: isRecorderBacked(discovered) ? "recorder-local" : "configured",
            analytics: analyticsEnabled ? "active" : "disabled",
            alerts: alertsEnabled ? "enabled" : "disabled",
          },
        });
        provisioned++;
      } catch (error: any) {
        results.push({
          discoveryId: discovered.id,
          status: "failed",
          message: error.message || "Failed to provision camera",
        });
        failed++;
      }
    }

    return reply.code(201).send({
      summary: {
        total: pendingDiscoveries.length,
        provisioned,
        partial,
        needsAttention,
        failed,
      },
      results,
    });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/reject", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const rejected = await store.rejectDiscovery(discoveryId, body.reason);
    if (!rejected) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    return { success: true, message: "Discovery rejected" };
  });

  app.patch("/v1/branches/:branchId/cameras/discovered/:discoveryId/rename", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = z.object({ displayName: z.string().min(1) }).parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const renamed = await store.renameDiscovery(discoveryId, body.displayName);
    if (!renamed) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    return { success: true, message: "Display name updated" };
  });
}
