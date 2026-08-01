import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const discoveryParams = z.object({ 
  branchId: z.string().min(1),
  discoveryId: z.string().min(1),
});

const approveDiscoveryBody = z.object({
  name: z.string().min(1),
  channel: z.number().int().min(1).default(1),
  protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]).default("onvif-t"),
  connectionSecretRef: z.string().min(1),
});

const approveAllBody = z.object({
  recordingMode: z.enum(["continuous", "motion"]).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  enableAnalytics: z.boolean().optional(),
  enableAlerts: z.boolean().optional(),
});

/**
 * Lists pending ONVIF discoveries. Submission, approval, and camera inventory
 * remain on the existing control-plane routes so they retain the same
 * authorization, validation, secret redaction, and audit behavior.
 */
export async function registerCameraDiscoveryRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
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

    const camera = await store.approveCamera(branchId, {
      discoveryId,
      name: body.name,
      protocol: body.protocol,
      channel: body.channel,
      connectionSecretRef: body.connectionSecretRef,
      model: discovered.model,
      serialNumber: discovered.serialNumber,
      ipAddress: discovered.ipAddress,
    });

    if (!camera) {
      return reply.code(500).send({ error: "failed_to_approve_camera" });
    }

    return {
      success: true,
      cameraId: camera.id,
      message: `Camera ${body.name} approved and added to monitoring`,
    };
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
    const pendingDiscoveries = discoveries.filter((d: any) => 
      d.duplicateStatus === "unique" && d.compatibilityStatus === "compatible"
    );

    const results: any[] = [];
    let provisioned = 0;
    let needsAttention = 0;
    let failed = 0;

    for (const discovered of pendingDiscoveries) {
      try {
        const name = discovered.displayName || discovered.model || `${discovered.vendor} camera`;
        const camera = await store.approveCamera(branchId, {
          discoveryId: discovered.id,
          name,
          protocol: "onvif-t",
          channel: 1,
          connectionSecretRef: `edge://${discovered.edgeAgentId}/${discovered.id}`,
          model: discovered.model,
          serialNumber: discovered.serialNumber,
          ipAddress: discovered.ipAddress,
          streamProfile: "main",
        });

        if (!camera) {
          throw new Error("Failed to approve discovered camera");
        }

        results.push({
          discoveryId: discovered.id,
          cameraId: camera.id,
          status: discovered.streamVerified ? "provisioned" : "partial",
          message: discovered.streamVerified ? "Provisioned successfully" : "Provisioned but stream needs verification",
        });

        if (discovered.streamVerified) {
          provisioned++;
        } else {
          needsAttention++;
        }
      } catch (error: any) {
        results.push({
          discoveryId: discovered.id,
          status: "failed",
          message: error.message || "Failed to provision camera",
        });
        failed++;
      }
    }

    return {
      summary: {
        provisioned,
        partial: needsAttention,
        needsAttention,
        failed,
      },
      results,
    };
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
