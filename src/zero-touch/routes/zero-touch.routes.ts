/**
 * Zero-Touch Brownfield API Routes
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zeroTouchEnrollmentService } from "../services/zero-touch-enrollment.service.js";
import { zeroTouchAutoProvisionerService } from "../services/zero-touch-auto-provisioner.service.js";
import type { AutoDiscoveredDevice } from "../domain/zero-touch.types.js";

export async function registerZeroTouchRoutes(app: FastifyInstance) {
  // 1. Create Branch & Generate Signed Enrollment Code with 1-Line Installers
  app.post("/api/zero-touch/branches/create-and-enroll", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      branchId: z.string().min(2),
      branchName: z.string().min(2),
      tenantId: z.string().default("tenant-bank-01"),
      expiryHours: z.number().int().positive().default(24),
    }).parse(request.body);

    const token = zeroTouchEnrollmentService.generateEnrollmentToken(
      body.branchId,
      body.branchName,
      body.tenantId,
      body.expiryHours,
    );

    return reply.code(201).send({
      success: true,
      data: token,
    });
  });

  // 2. Agent Bootstrap: Token Exchange for mTLS Credentials
  app.post("/api/zero-touch/enrollment/exchange", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      token: z.string().min(5),
      hostname: z.string().default("sg-edge-host"),
      platform: z.enum(["win32", "linux", "docker"]).default("win32"),
      macAddress: z.string().default("3C:EF:8C:00:11:22"),
    }).parse(request.body);

    const result = zeroTouchEnrollmentService.exchangeToken(body.token, {
      hostname: body.hostname,
      platform: body.platform,
      macAddress: body.macAddress,
    });

    if (!result.success) {
      return reply.code(400).send(result);
    }
    return reply.code(200).send(result);
  });

  // 3. Autonomous Discovery Ingestion & Camera Auto-Provisioning
  app.post("/api/zero-touch/branches/:branchId/auto-register", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const body = z.object({
      agentId: z.string(),
      scannedSubnets: z.array(z.string()).default(["192.168.1.0/24"]),
      discoveredDevices: z.array(z.any()),
      discoveryDurationMs: z.number().default(1800),
    }).parse(request.body);

    const report = await zeroTouchAutoProvisionerService.autoProvisionBranch({
      branchId,
      agentId: body.agentId,
      scannedSubnets: body.scannedSubnets,
      discoveredDevices: body.discoveredDevices as AutoDiscoveredDevice[],
      discoveryDurationMs: body.discoveryDurationMs,
    });

    return reply.code(200).send({
      success: true,
      data: report,
    });
  });

  // 4. Live Branch Onboarding State Tracker
  app.get("/api/zero-touch/branches/:branchId/status", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const status = zeroTouchEnrollmentService.getBranchStatus(branchId);
    if (!status) {
      return reply.code(404).send({ success: false, error: "Branch onboarding record not found" });
    }
    const report = zeroTouchAutoProvisionerService.getOnboardingReport(branchId);
    return reply.code(200).send({
      success: true,
      data: { status, report },
    });
  });

  // 5. List All Active Onboarding Branches
  app.get("/api/zero-touch/branches", { config: { noAuth: true } }, async (_request, reply) => {
    const statuses = zeroTouchEnrollmentService.listBranchStatuses();
    return reply.code(200).send({
      success: true,
      data: statuses,
    });
  });

  // 6. Interactive 90-Second Zero-Touch Simulator (Simulates unboxed agent bootstrapping 20 cameras)
  app.post("/api/zero-touch/branches/:branchId/simulate-run", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const body = z.object({
      branchName: z.string().default("Simulated Bank Branch"),
    }).parse(request.body || {});

    // 1. Generate Token
    const token = zeroTouchEnrollmentService.generateEnrollmentToken(branchId, body.branchName);

    // 2. Exchange Token
    const exchange = zeroTouchEnrollmentService.exchangeToken(token.token, {
      hostname: `sg-edge-${branchId.toLowerCase()}`,
      platform: "win32",
      macAddress: "3C:EF:8C:99:88:77",
    });

    // 3. Mock 20-camera brownfield LAN (16-channel CP PLUS NVR + 4 Dahua IPCs)
    const mockChannels = Array.from({ length: 16 }, (_, i) => ({
      channelNumber: i + 1,
      channelName: `Camera ${i + 1} (${i < 4 ? "Cash Counter" : i < 8 ? "Public Hall" : "Locker Entry"})`,
      mainRtspUri: `rtsp://192.168.1.10:554/cam/realmonitor?channel=${i + 1}&subtype=0`,
      subRtspUri: `rtsp://192.168.1.10:554/cam/realmonitor?channel=${i + 1}&subtype=1`,
      codec: "H264" as const,
      resolution: { width: 1920, height: 1080 },
      fps: 25,
      bitrateKbps: 3200,
      hasAudio: i < 4,
      hasPtz: i === 0,
      status: "ONLINE" as const,
    }));

    const mockDevices: AutoDiscoveredDevice[] = [
      {
        ipAddress: "192.168.1.10",
        macAddress: "3C:EF:8C:44:11:A1",
        protocol: "CPPLUS_PROPRIETARY",
        deviceType: "DVR_NVR",
        manufacturer: "CP PLUS",
        model: "CP-UNR-416T2",
        firmwareVersion: "4.001.0000000.2",
        serialNumber: "CP416T2991823",
        channelCount: 16,
        channels: mockChannels,
        discoveredAt: new Date().toISOString(),
      },
      ...Array.from({ length: 4 }, (_, j) => ({
        ipAddress: `192.168.1.${20 + j}`,
        macAddress: `E0:50:8B:12:34:${(10 + j).toString(16)}`,
        protocol: "DAHUA_CGI" as const,
        deviceType: "IP_CAMERA" as const,
        manufacturer: "Dahua Technology",
        model: "IPC-HFW5442E-ZE",
        firmwareVersion: "2.800.0000000.18.R",
        serialNumber: `DH5442998${10 + j}`,
        channelCount: 1,
        channels: [
          {
            channelNumber: 1,
            channelName: `Perimeter IPC ${j + 1}`,
            mainRtspUri: `rtsp://192.168.1.${20 + j}:554/cam/realmonitor?channel=1&subtype=0`,
            codec: "H265" as const,
            resolution: { width: 2560, height: 1440 },
            fps: 30,
            bitrateKbps: 4096,
            hasAudio: false,
            hasPtz: false,
            status: "ONLINE" as const,
          },
        ],
        discoveredAt: new Date().toISOString(),
      })),
    ];

    // 4. Auto Provision
    const report = await zeroTouchAutoProvisionerService.autoProvisionBranch({
      branchId,
      agentId: exchange.agentId!,
      scannedSubnets: ["192.168.1.0/24"],
      discoveredDevices: mockDevices,
      discoveryDurationMs: 1400,
    });

    return reply.code(200).send({
      success: true,
      data: {
        token,
        exchange,
        report,
      },
    });
  });
}
