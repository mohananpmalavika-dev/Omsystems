/**
 * Production Zero-Touch Brownfield API Routes
 * Exposes fleet status, live provisioning jobs, SSE real-time events,
 * device reviews, approval workflows, credential attachments, and engineering diagnostics.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zeroTouchJobEngineService } from "../services/zero-touch-job-engine.service.js";
import { zeroTouchEnrollmentService } from "../services/zero-touch-enrollment.service.js";
import { zeroTouchDeviceReviewService } from "../services/zero-touch-device-review.service.js";

export async function registerZeroTouchRoutes(app: FastifyInstance) {
  // 1. Fleet Overview & SLA Metrics
  app.get("/api/v1/zero-touch/fleet", { config: { noAuth: true } }, async (_request, reply) => {
    const branches = zeroTouchJobEngineService.listBranches();
    const slaMetrics = zeroTouchJobEngineService.getFleetSlaMetrics();
    return reply.code(200).send({
      success: true,
      data: {
        branches,
        slaMetrics,
      },
    });
  });

  // 2. Create Branch Profile
  app.post("/api/v1/zero-touch/branches", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      branchId: z.string().min(2),
      branchName: z.string().min(2),
      region: z.string().optional(),
    }).parse(request.body);

    const branch = zeroTouchJobEngineService.createBranch(body as { branchId: string; branchName: string; region?: string; });
    return reply.code(201).send({
      success: true,
      data: branch,
    });
  });

  // 3. Generate Single-Use 15-Minute Enrollment Package
  app.post("/api/v1/zero-touch/branches/:branchId/enrollment", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const branch = zeroTouchJobEngineService.getBranch(branchId);
    if (!branch) return reply.code(404).send({ success: false, error: "branch_not_found" });
    const branchName = branch.branchName;

    const body = z.object({
      tenantId: z.string().trim().min(1),
      expiryMinutes: z.number().int().positive().default(15),
    }).parse(request.body || {});

    const publicBase = (request.headers["x-sentinel-public-api-base"] as string) ||
      process.env.CONTROL_PLANE_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL;
    if (!publicBase) return reply.code(503).send({ success: false, error: "control_plane_public_url_required" });

    const pkg = zeroTouchEnrollmentService.generateEnrollmentPackage(
      branchId,
      branchName,
      body.tenantId,
      body.expiryMinutes,
      publicBase,
    );

    return reply.code(201).send({
      success: true,
      data: pkg,
    });
  });

  // 4. Agent Bootstrap & mTLS Key Exchange
  app.post("/api/v1/zero-touch/enrollment/exchange", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      token: z.string().min(5),
      hostname: z.string().trim().min(1),
      platform: z.enum(["win32", "linux", "docker"]),
      macAddress: z.string().trim().min(1),
      csrPem: z.string().trim().min(1),
    }).parse(request.body);

    const result = zeroTouchEnrollmentService.exchangeToken(body.token, {
      hostname: body.hostname,
      platform: body.platform,
      macAddress: body.macAddress,
      csrPem: body.csrPem,
    });

    if (!result.success) {
      return reply.code(400).send(result);
    }
    return reply.code(200).send(result);
  });

  // 5. Start Real Zero-Touch Provisioning Job
  app.post("/api/v1/zero-touch/branches/:branchId/provision", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    return reply.code(410).send({
      success: false,
      error: "legacy_zero_touch_disabled",
      message: "Use POST /v1/branches/:branchId/scan-jobs to queue a persisted scan for an enrolled edge agent.",
    });
  });

  // 6. List Active & Historical Provisioning Jobs
  app.get("/api/v1/zero-touch/provisioning/jobs", { config: { noAuth: true } }, async (request, reply) => {
    const query = request.query as { branchId?: string };
    const jobs = zeroTouchJobEngineService.listJobs(query.branchId);
    return reply.code(200).send({
      success: true,
      data: jobs,
    });
  });

  // 7. Get Detailed Provisioning Job Execution
  app.get("/api/v1/zero-touch/provisioning/jobs/:jobId", { config: { noAuth: true } }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = zeroTouchJobEngineService.getJob(jobId);
    if (!job) {
      return reply.code(404).send({ success: false, error: "Provisioning job not found" });
    }
    return reply.code(200).send({
      success: true,
      data: job,
    });
  });

  // 8. Server-Sent Events (SSE) for Real-Time Job Progress Streaming
  app.get("/api/v1/zero-touch/provisioning/jobs/:jobId/events", { config: { noAuth: true } }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = zeroTouchJobEngineService.getJob(jobId);
    if (!job) {
      return reply.code(404).send({ success: false, error: "Job not found" });
    }

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    // Send initial snapshot
    reply.raw.write(`data: ${JSON.stringify({ type: "snapshot", job })}\n\n`);

    const onStep = (data: any) => {
      if (data.jobId === jobId) {
        reply.raw.write(`data: ${JSON.stringify({ type: "step_update", data })}\n\n`);
      }
    };

    const onComplete = (completedJob: any) => {
      if (completedJob.id === jobId) {
        reply.raw.write(`data: ${JSON.stringify({ type: "completed", job: completedJob })}\n\n`);
      }
    };

    zeroTouchJobEngineService.on("step_completed", onStep);
    zeroTouchJobEngineService.on("job_completed", onComplete);

    request.raw.on("close", () => {
      zeroTouchJobEngineService.off("step_completed", onStep);
      zeroTouchJobEngineService.off("job_completed", onComplete);
    });
  });

  // 9. Cancel Provisioning Job
  app.post("/api/v1/zero-touch/provisioning/jobs/:jobId/cancel", { config: { noAuth: true } }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const cancelled = zeroTouchJobEngineService.cancelJob(jobId);
    return reply.code(200).send({
      success: cancelled,
      message: cancelled ? "Job cancelled successfully." : "Job could not be cancelled.",
    });
  });

  // 10. Retry Provisioning Job
  app.post("/api/v1/zero-touch/provisioning/jobs/:jobId/retry", { config: { noAuth: true } }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const retriedJob = await zeroTouchJobEngineService.retryJob(jobId);
    if (!retriedJob) {
      return reply.code(404).send({ success: false, error: "Original job not found for retry" });
    }
    return reply.code(202).send({
      success: true,
      data: retriedJob,
    });
  });

  // 11. Discovered Devices Review List
  app.get("/api/v1/zero-touch/branches/:branchId/discovered-devices", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const devices = zeroTouchJobEngineService.getDiscoveredDevices(branchId);
    return reply.code(200).send({
      success: true,
      data: devices,
    });
  });

  // 12. Supply Credentials for Discovered Appliance
  app.post("/api/v1/zero-touch/devices/:deviceId/credentials", { config: { noAuth: true } }, async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const body = z.object({
      branchId: z.string(),
      username: z.string().default("admin"),
      passwordVaultKey: z.string().default("vault-secret-key"),
    }).parse(request.body);

    const result = zeroTouchDeviceReviewService.supplyCredentials(body.branchId, deviceId, {
      username: body.username,
      passwordVaultKey: body.passwordVaultKey,
    });

    return reply.code(result.success ? 200 : 400).send(result);
  });

  // 13. Approve Specific Channels on Device
  app.post("/api/v1/zero-touch/devices/:deviceId/approve", { config: { noAuth: true } }, async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const body = z.object({
      branchId: z.string(),
      channelNumbers: z.array(z.number()).optional(),
    }).parse(request.body);

    const result = zeroTouchDeviceReviewService.approveDeviceChannels(body.branchId, deviceId, body.channelNumbers);
    return reply.code(200).send(result);
  });

  // 14. Batch Approve All Channels on Branch
  app.post("/api/v1/zero-touch/branches/:branchId/batch-approve", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const result = zeroTouchDeviceReviewService.batchApproveBranch(branchId);
    return reply.code(200).send(result);
  });

  // 15. Engineering Diagnostic Probes & Logs
  app.get("/api/v1/zero-touch/diagnostics/:branchId", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const report = zeroTouchJobEngineService.getDiagnostics(branchId);
    if (!report) return reply.code(404).send({ success: false, error: "diagnostics_not_available" });
    return reply.code(200).send({
      success: true,
      data: report,
    });
  });

  // Backward compatibility routes for legacy callers
  app.post("/api/zero-touch/branches/create-and-enroll", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      branchId: z.string(),
      branchName: z.string(),
      tenantId: z.string().trim().min(1),
    }).parse(request.body);

    const pkg = zeroTouchEnrollmentService.generateEnrollmentPackage(body.branchId, body.branchName, body.tenantId, 15);
    return reply.code(201).send({ success: true, data: pkg });
  });

  app.post("/api/zero-touch/enrollment/exchange", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({ token: z.string() }).parse(request.body);
    const result = zeroTouchEnrollmentService.exchangeToken(body.token, {
      hostname: "legacy-client",
      platform: "linux",
      macAddress: "not-provided",
      csrPem: "not-provided",
    });
    return reply.code(result.success ? 200 : 400).send(result);
  });
}
