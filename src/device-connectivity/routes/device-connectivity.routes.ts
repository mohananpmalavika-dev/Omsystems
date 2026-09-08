import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { DeviceConnectivityService } from "../application/device-connectivity.service.js";
import { DeviceAdapterResolver } from "../adapters/device-adapter.contract.js";

const connectivityService = new DeviceConnectivityService();
const hostSchema = z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9._:-]+$/, "Invalid host");
const portSchema = z.number().int().min(1).max(65_535).default(554);
const probeSchema = z.object({ host: hostSchema, port: portSchema, expectedManufacturer: z.string().optional() });
const verifyStreamSchema = z.object({ host: hostSchema, port: portSchema });
const onboardSchema = z.object({
  host: hostSchema, port: portSchema, branchId: z.string().min(1),
  expectedManufacturer: z.string().min(1).optional(), credentialRef: z.string().min(1),
});

export async function registerDeviceConnectivityRoutes(app: FastifyInstance) {
  // 1. Progressive Fingerprinting Probe
  app.post("/v1/connectivity/probe", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = probeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: "validation_failed", issues: parsed.error.issues });
    const body = parsed.data;

    try {
      const { adapter, probeResult } = await DeviceAdapterResolver.resolveBestAdapter(body as any);
      return { success: true, data: { resolvedAdapter: adapter.adapterType, adapterVersion: adapter.adapterVersion, probe: probeResult } };
    } catch (error) {
      return reply.code(503).send({ success: false, error: error instanceof Error ? error.message : "No verified adapter available" });
    }
  });

  // 2. 8-Factor Stream Verification (Beyond ping / port 554)
  app.post("/v1/connectivity/verify-stream", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = verifyStreamSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: "validation_failed", issues: parsed.error.issues });
    const body = parsed.data;

    const verification = await connectivityService.verifyStream(body as any);
    return reply.code(503).send({ success: false, error: "RTSP verification transport is not configured", data: verification });
  });

  // 3. Asynchronous Onboarding Workflow
  app.post("/v1/connectivity/onboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = onboardSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: "validation_failed", issues: parsed.error.issues });
    const body = parsed.data;

    try {
      const result = await connectivityService.onboardDevice(
        { host: body.host, port: body.port, branchId: body.branchId, expectedManufacturer: body.expectedManufacturer },
        { credentialRef: body.credentialRef },
      );
      return { success: true, data: result };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 4. Detailed 0-100 Connectivity Score Breakdown
  app.get("/v1/connectivity/score/:deviceId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { deviceId } = req.params as { deviceId: string };
    if (!connectivityService.hasDevice(deviceId)) {
      return reply.code(404).send({ success: false, error: "device_connectivity_not_found" });
    }
    const score = connectivityService.computeConnectivityScore(deviceId);
    return { success: true, data: score };
  });

  // 5. Hardware Model Compatibility Certification Matrix
  app.get("/v1/connectivity/certifications", async () => {
    const matrix = connectivityService.getHardwareCertificationMatrix();
    return { success: true, data: matrix };
  });

  // 6. Device Connection State and Diagnostics
  app.get("/v1/connectivity/device/:deviceId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { deviceId } = req.params as { deviceId: string };
    if (!connectivityService.hasDevice(deviceId)) {
      return reply.code(404).send({ success: false, error: "device_connectivity_not_found" });
    }
    const status = connectivityService.getDeviceStatus(deviceId);
    return { success: true, data: status };
  });
}
