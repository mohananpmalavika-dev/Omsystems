import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { branchMosaicService } from "../branch-mosaic/services/branch-mosaic.service.js";
import { recorderDriverFactory } from "../recorder-drivers/services/recorder-driver-factory.service.js";
import { cameraVerificationService } from "../camera-verification/services/camera-verification.service.js";

const probeDriverSchema = z.object({
  recorderId: z.string(),
  branchId: z.string(),
  vendor: z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "ONVIF"]),
  host: z.string().ip(),
  port: z.number().int().min(1).max(65535),
  targetRetentionDays: z.number().default(90),
});

const verifyCameraSchema = z.object({
  cameraId: z.string(),
  branchId: z.string(),
  channelConnected: z.boolean(),
  signalLoss: z.boolean(),
  rtspReachable: z.boolean(),
  rtspLatencyMs: z.number().nonnegative(),
  decodable: z.boolean(),
  videoCodec: z.string().min(1),
  fps: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frozenFrameDetected: z.boolean(),
  blackFrameDetected: z.boolean(),
  recordingNow: z.boolean(),
});

export const registerP0ControlPlaneRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. Get 400-Branch Mosaic Projections (Sub-millisecond Single-Query)
  app.get("/v1/mosaic/branches", async (request, reply) => {
    const tenantId = request.currentUser?.tenantId ?? (request.query as any)?.tenantId;
    if (!tenantId) return reply.code(400).send({ error: "tenant_id_required" });
    const data = await branchMosaicService.getMosaicProjections(tenantId);
    return reply.code(200).send({
      success: true,
      data,
    });
  });

  // 2. One-Click Branch Drilldown Detail
  app.get("/v1/mosaic/branches/:branchId/drilldown", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const detail = await branchMosaicService.getBranchDrilldown(branchId);
    if (!detail) {
      return reply.code(404).send({ error: "branch_not_found", message: `Branch ${branchId} not found` });
    }
    return reply.code(200).send({ success: true, data: detail });
  });

  // 3. Probe Recorder via Canonical Driver & Produce Authoritative Evidence
  app.post("/v1/recorders/drivers/probe", async (request, reply) => {
    const body = probeDriverSchema.parse(request.body);
    const driver = recorderDriverFactory.createDriver({
      recorderId: body.recorderId,
      branchId: body.branchId,
      vendor: body.vendor,
      host: body.host,
      port: body.port,
    });

    const observation = await driver.buildAuthoritativeObservation(body.targetRetentionDays);
    return reply.code(200).send({
      success: true,
      message: `Authoritative health observation produced via ${body.vendor} canonical driver`,
      data: observation,
    });
  });

  // 4. Run True 6-Layer Camera Health Verification
  app.post("/v1/cameras/verify", async (request, reply) => {
    const body = verifyCameraSchema.parse(request.body);
    const observation = cameraVerificationService.evaluateCameraHealth(body as any);
    return reply.code(200).send({
      success: true,
      data: observation,
    });
  });
};
