import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { DeviceConnectivityService } from "../application/device-connectivity.service.js";
import { DeviceAdapterResolver } from "../adapters/device-adapter.contract.js";

const connectivityService = new DeviceConnectivityService();

export async function registerDeviceConnectivityRoutes(app: FastifyInstance) {
  // 1. Progressive Fingerprinting Probe
  app.post("/v1/connectivity/probe", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z
      .object({
        host: z.string(),
        port: z.number().default(554),
        expectedManufacturer: z.string().optional(),
      })
      .parse(req.body);

    try {
      const { adapter, probeResult } = await DeviceAdapterResolver.resolveBestAdapter(body as any);
      return { success: true, data: { resolvedAdapter: adapter.adapterType, adapterVersion: adapter.adapterVersion, probe: probeResult } };
    } catch (error) {
      return reply.code(503).send({ success: false, error: error instanceof Error ? error.message : "No verified adapter available" });
    }
  });

  // 2. 8-Factor Stream Verification (Beyond ping / port 554)
  app.post("/v1/connectivity/verify-stream", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z
      .object({
        host: z.string(),
        port: z.number().default(554),
      })
      .parse(req.body);

    const verification = await connectivityService.verifyStream(body as any);
    return reply.code(503).send({ success: false, error: "RTSP verification transport is not configured", data: verification });
  });

  // 3. Asynchronous Onboarding Workflow
  app.post("/v1/connectivity/onboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z
      .object({
        host: z.string(),
        port: z.number().default(554),
        branchId: z.string().min(1),
        expectedManufacturer: z.string().min(1).optional(),
        credentialRef: z.string().min(1),
      })
      .parse(req.body);

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
  app.get("/v1/connectivity/score/:deviceId", async (req: FastifyRequest) => {
    const { deviceId } = req.params as { deviceId: string };
    const score = connectivityService.computeConnectivityScore(deviceId);
    return { success: true, data: score };
  });

  // 5. Hardware Model Compatibility Certification Matrix
  app.get("/v1/connectivity/certifications", async () => {
    const matrix = connectivityService.getHardwareCertificationMatrix();
    return { success: true, data: matrix };
  });

  // 6. Device Connection State and Diagnostics
  app.get("/v1/connectivity/device/:deviceId", async (req: FastifyRequest) => {
    const { deviceId } = req.params as { deviceId: string };
    const status = connectivityService.getDeviceStatus(deviceId);
    return { success: true, data: status };
  });
}
