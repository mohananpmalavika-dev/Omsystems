import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  autoProvisionVerifiedCameras,
  defaultRecordingJob,
  discoveryConnection,
  isRecorderBacked,
} from "../services/camera-auto-provision.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const discoveryParams = z.object({ 
  branchId: z.string().min(1),
  discoveryId: z.string().min(1),
});
const cameraIdentityParams = z.object({ cameraId: z.string().min(1) });

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
  app.get("/v1/cameras/:cameraId/identity", async (request, reply) => {
    const { cameraId } = cameraIdentityParams.parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const decision = await store.checkAccess(request.currentUser, "device:configure", camera.nodeId);
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden",
        reason: decision?.reason ?? "no_matching_grant",
      });
    }
    const identity = await store.getDeviceIdentityByCamera(cameraId);
    if (!identity) return reply.code(404).send({ error: "device_identity_not_found" });
    return identity;
  });

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
      macAddress: discovered.macAddress,
      ipAddress: discovered.ipAddress,
      onvifUuid: discovered.onvifUuid,
      certificateRef: discovered.certificateRef,
      certificateFingerprint: discovered.certificateFingerprint,
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

    const outcome = await autoProvisionVerifiedCameras(store, branchId, {
      recordingMode: body.recordingMode ?? "continuous",
      retentionDays: body.retentionDays ?? 180,
      enableAnalytics: body.enableAnalytics ?? true,
      enableAlerts: body.enableAlerts ?? true,
      createdBy: request.currentUser.id,
    });
    const { credentialsRequired: _credentialsRequired, pendingVerification: _pendingVerification, ...summary } = outcome.summary;
    return reply.code(201).send({ summary, results: outcome.results });
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
