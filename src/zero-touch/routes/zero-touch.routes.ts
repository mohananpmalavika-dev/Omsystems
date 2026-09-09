/**
 * Production Zero-Touch Brownfield API Routes
 * Exposes fleet status, live provisioning jobs, SSE real-time events,
 * device reviews, approval workflows, credential attachments, and engineering diagnostics.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import { zeroTouchJobEngineService } from "../services/zero-touch-job-engine.service.js";
import { zeroTouchEnrollmentService } from "../services/zero-touch-enrollment.service.js";
import { zeroTouchDeviceReviewService } from "../services/zero-touch-device-review.service.js";

export async function registerZeroTouchRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  // 1. Fleet Overview & SLA Metrics
  const fleetHandler = async (request: any, reply: any) => {
    const accessibleBranches = await store.listAccessibleNodes(request.currentUser, "device:configure", "branch");
    const branchData = await Promise.all(accessibleBranches.map(async (branch) => {
      const [agents, cameras, discoveries, latestJob, region] = await Promise.all([
        store.listEdgeAgentsByBranch(branch.id),
        store.listCamerasByBranch(request.currentUser, branch.id, "device:configure"),
        store.listDiscoveredCameras(branch.id),
        store.getLatestEdgeScanJob(branch.id),
        resolveBranchRegion(store, branch),
      ]);

      const agent = agents.find((item) => item.status === "online") ?? agents[0];
      const discoveredDeviceCount = Math.max(
        latestJob?.resultCount ?? 0,
        new Set(discoveries.map((item) => item.deviceIdentityId)).size,
      );
      const readinessScorePct = latestJob && latestJob.resultCount > 0
        ? Math.round((latestJob.verifiedCount / latestJob.resultCount) * 100)
        : cameras.length > 0
          ? Math.round((cameras.filter((camera) => camera.status === "online").length / cameras.length) * 100)
          : 0;
      const provisioningInProgress = latestJob?.status === "queued" || latestJob?.status === "running";
      const hasReviewItems = Boolean(
        latestJob && (
          latestJob.credentialsRequiredCount > 0 ||
          latestJob.pendingVerificationCount > 0 ||
          latestJob.verifiedCount < latestJob.resultCount
        ),
      );

      return {
        branchId: branch.id,
        branchName: branch.name,
        region,
        agentStatus: agent?.status === "online"
          ? "CONNECTED"
          : agent?.status === "offline"
            ? "OFFLINE"
            : "NOT_ENROLLED",
        agentId: agent?.id,
        agentVersion: agent?.version,
        lastHeartbeat: agent?.lastSeenAt ?? undefined,
        totalDevices: discoveredDeviceCount,
        totalCameras: cameras.length,
        readinessScorePct: Math.max(0, Math.min(100, readinessScorePct)),
        lastJobStatus: latestJob ? toLegacyProvisioningStatus(latestJob.status) : undefined,
        lastJobId: latestJob?.id,
        lastProvisionedAt: latestJob?.completedAt ?? undefined,
        operationalStatus: provisioningInProgress
          ? "PROVISIONING"
          : latestJob?.status === "failed"
            ? "FAILED"
            : latestJob?.status === "completed" && hasReviewItems
              ? "PARTIAL"
              : cameras.length > 0
                ? "ACTIVE"
                : "UNENROLLED",
      };
    }));

    const jobs = await Promise.all(accessibleBranches.map((branch) => store.getLatestEdgeScanJob(branch.id)));
    const completedDurations = jobs
      .map((job) => job && job.status === "completed" && job.startedAt && job.completedAt
        ? Math.max(0, (Date.parse(job.completedAt) - Date.parse(job.startedAt)) / 1000)
        : undefined)
      .filter((duration): duration is number => Number.isFinite(duration))
      .sort((left, right) => left - right);
    const percentile = (ratio: number) => completedDurations.length === 0
      ? 0
      : Number(completedDurations[Math.min(completedDurations.length - 1, Math.floor(completedDurations.length * ratio))]!.toFixed(1));
    const targetSlaSeconds = Number(process.env.ZTP_TARGET_SLA_SECONDS ?? "90");
    const withinSla = completedDurations.filter((duration) => duration <= targetSlaSeconds).length;
    const slaMetrics = {
      targetSlaSeconds,
      lastProvisioningSeconds: completedDurations.at(-1) ? Number(completedDurations.at(-1)!.toFixed(1)) : 0,
      fleetAverageSeconds: completedDurations.length === 0
        ? 0
        : Number((completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length).toFixed(1)),
      p50Seconds: percentile(0.5),
      p95Seconds: percentile(0.95),
      totalBranchesProvisioned: jobs.filter((job) => job?.status === "completed").length,
      activeProvisioningJobs: jobs.filter((job) => job?.status === "queued" || job?.status === "running").length,
      slaAdherencePct: completedDurations.length === 0 ? 0 : Number(((withinSla / completedDurations.length) * 100).toFixed(1)),
    };

    return reply.code(200).send({
      success: true,
      data: {
        branches: branchData,
        slaMetrics,
      },
    });
  };
  // /v1 is served through the authenticated dashboard BFF. Keep the old
  // location for existing API clients while they migrate.
  app.get("/v1/zero-touch/fleet", fleetHandler);
  app.get("/api/v1/zero-touch/fleet", fleetHandler);

  // 2. Create Branch Profile
  app.post("/api/v1/zero-touch/branches", async (request, reply) => {
    return reply.code(410).send({
      success: false,
      error: "legacy_zero_touch_branch_creation_disabled",
      message: "Create branches through the authenticated control-plane organization API.",
    });
  });

  // 3. Generate Single-Use 15-Minute Enrollment Package
  app.post("/api/v1/zero-touch/branches/:branchId/enrollment", async (request, reply) => {
    void request;
    return reply.code(410).send({
      success: false,
      error: "legacy_enrollment_disabled",
      message: "Create a persisted edge activation through POST /v1/branches/:branchId/edge-activations.",
    });
    /*
    const { branchId } = request.params as { branchId: string };
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ success: false, error: "branch_not_found" });
    const access = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (access && !access.allowed) return reply.code(403).send({ success: false, error: "forbidden" });

    const body = z.object({
      tenantId: z.string().trim().min(1).optional(),
      expiryMinutes: z.number().int().positive().default(15),
    }).parse(request.body || {});

    const publicBase = (request.headers["x-sentinel-public-api-base"] as string) ||
      process.env.CONTROL_PLANE_PUBLIC_URL;
    if (!publicBase) return reply.code(503).send({ success: false, error: "control_plane_public_url_required" });

    const pkg = zeroTouchEnrollmentService.generateEnrollmentPackage(
      branchId,
      branch.name,
      body.tenantId ?? request.currentUser.tenantId,
      body.expiryMinutes,
      publicBase,
    );

    return reply.code(201).send({
      success: true,
      data: pkg,
    });
    */
  });

  // 4. Agent Bootstrap & mTLS Key Exchange
  app.post("/api/v1/zero-touch/enrollment/exchange", async (request, reply) => {
    void request;
    return reply.code(410).send({
      success: false,
      error: "legacy_enrollment_disabled",
      message: "Use POST /v1/edge-enrollment/activate with an edge activation code.",
    });
    /*
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
    */
  });

  // 5. Start Real Zero-Touch Provisioning Job
  app.post("/api/v1/zero-touch/branches/:branchId/provision", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    return reply.code(410).send({
      success: false,
      error: "legacy_zero_touch_disabled",
      message: "Use POST /v1/branches/:branchId/scan-jobs to queue a persisted scan for an enrolled edge agent.",
    });
  });

  // 6. List Active & Historical Provisioning Jobs
  app.get("/api/v1/zero-touch/provisioning/jobs", async (request, reply) => {
    const query = request.query as { branchId?: string };
    const jobs = zeroTouchJobEngineService.listJobs(query.branchId);
    return reply.code(200).send({
      success: true,
      data: jobs,
    });
  });

  // 7. Get Detailed Provisioning Job Execution
  app.get("/api/v1/zero-touch/provisioning/jobs/:jobId", async (request, reply) => {
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
  app.get("/api/v1/zero-touch/provisioning/jobs/:jobId/events", async (request, reply) => {
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
  app.post("/api/v1/zero-touch/provisioning/jobs/:jobId/cancel", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const cancelled = zeroTouchJobEngineService.cancelJob(jobId);
    return reply.code(200).send({
      success: cancelled,
      message: cancelled ? "Job cancelled successfully." : "Job could not be cancelled.",
    });
  });

  // 10. Retry Provisioning Job
  app.post("/api/v1/zero-touch/provisioning/jobs/:jobId/retry", async (request, reply) => {
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
  app.get("/api/v1/zero-touch/branches/:branchId/discovered-devices", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const devices = zeroTouchJobEngineService.getDiscoveredDevices(branchId);
    return reply.code(200).send({
      success: true,
      data: devices,
    });
  });

  // 12. Supply Credentials for Discovered Appliance
  app.post("/api/v1/zero-touch/devices/:deviceId/credentials", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const body = z.object({
      branchId: z.string(),
      username: z.string().min(1),
      passwordVaultKey: z.string().min(1),
    }).parse(request.body);

    const result = zeroTouchDeviceReviewService.supplyCredentials(body.branchId, deviceId, {
      username: body.username,
      passwordVaultKey: body.passwordVaultKey,
    });

    return reply.code(result.success ? 200 : 400).send(result);
  });

  // 13. Approve Specific Channels on Device
  app.post("/api/v1/zero-touch/devices/:deviceId/approve", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const body = z.object({
      branchId: z.string(),
      channelNumbers: z.array(z.number()).optional(),
    }).parse(request.body);

    const result = zeroTouchDeviceReviewService.approveDeviceChannels(body.branchId, deviceId, body.channelNumbers);
    return reply.code(200).send(result);
  });

  // 14. Batch Approve All Channels on Branch
  app.post("/api/v1/zero-touch/branches/:branchId/batch-approve", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const result = zeroTouchDeviceReviewService.batchApproveBranch(branchId);
    return reply.code(200).send(result);
  });

  // 15. Engineering Diagnostic Probes & Logs
  const diagnosticsHandler = async (request: any, reply: any) => {
    const { branchId } = request.params as { branchId: string };
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ success: false, error: "branch_not_found" });
    const access = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!access?.allowed) return reply.code(403).send({ success: false, error: "forbidden" });
    const [agents, job, discoveries, telemetry] = await Promise.all([
      store.listEdgeAgentsByBranch(branchId),
      store.getLatestEdgeScanJob(branchId),
      store.listDiscoveredCameras(branchId),
      store.listLatestOperationalTelemetry(branch.tenantId, [branchId]),
    ]);
    const agent = agents.find((item) => item.status === "online") ?? agents[0];
    const latestTelemetry = telemetry
      .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))
      .slice(0, 25);
    const verified = discoveries.filter((item) => item.streamVerified === true).length;
    const credentialsRequired = discoveries.filter((item) => item.credentialsRequired === true).length;
    const issues = [
      ...(!agent ? [{ severity: "critical", code: "edge_agent_missing", message: "No edge agent is enrolled for this branch." }] : []),
      ...(agent?.status !== "online" ? [{ severity: "warning", code: "edge_agent_offline", message: "The enrolled edge agent is not currently online." }] : []),
      ...(latestTelemetry.length === 0 ? [{ severity: "warning", code: "telemetry_unavailable", message: "No authenticated operational telemetry has been received yet." }] : []),
      ...(job?.status === "failed" ? [{ severity: "critical", code: "scan_failed", message: job.error ?? "The most recent discovery scan failed." }] : []),
      ...(credentialsRequired > 0 ? [{ severity: "warning", code: "credentials_required", message: `${credentialsRequired} discovered device(s) require credentials before approval.` }] : []),
    ];
    return reply.code(200).send({
      success: true,
      data: {
        branchId,
        branchName: branch.name,
        generatedAt: new Date().toISOString(),
        agent: agent ? {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          version: agent.version,
          lastHeartbeat: agent.lastSeenAt,
        } : null,
        scan: job ? {
          id: job.id,
          status: job.status,
          requestedAt: job.requestedAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          resultCount: job.resultCount,
          verifiedCount: job.verifiedCount,
          provisionedCount: job.provisionedCount,
          error: job.error,
        } : null,
        discoveries: {
          total: discoveries.length,
          verified,
          credentialsRequired,
          pendingVerification: discoveries.filter((item) => !item.credentialsRequired && item.streamVerified !== true).length,
          duplicates: discoveries.filter((item) => item.duplicateStatus === "duplicate").length,
        },
        telemetry: latestTelemetry.map((item) => ({
          deviceType: item.deviceType,
          deviceId: item.deviceId,
          observedAt: item.observedAt,
          source: item.source,
          reasonCodes: item.reasonCodes,
        })),
        issues,
      },
    });
  };
  app.get("/v1/zero-touch/diagnostics/:branchId", diagnosticsHandler);
  app.get("/api/v1/zero-touch/diagnostics/:branchId", diagnosticsHandler);

  // Backward compatibility routes for legacy callers
  app.post("/api/zero-touch/branches/create-and-enroll", async (_request, reply) => {
    return reply.code(410).send({
      success: false,
      error: "legacy_zero_touch_disabled",
      message: "Create the branch in the authenticated organization API, then create an edge activation.",
    });
  });

  app.post("/api/zero-touch/enrollment/exchange", async (_request, reply) => {
    return reply.code(410).send({
      success: false,
      error: "legacy_zero_touch_disabled",
      message: "Use the authenticated edge-agent activation flow.",
    });
  });
}

async function resolveBranchRegion(store: ControlPlaneStore, branch: { parentId: string | null }) {
  let parentId = branch.parentId;
  for (let depth = 0; parentId && depth < 20; depth += 1) {
    const parent = await store.getNode(parentId);
    if (!parent) break;
    if (["region", "zone", "area"].includes(parent.type)) return parent.name;
    parentId = parent.parentId;
  }
  return "";
}

function toLegacyProvisioningStatus(status: "queued" | "running" | "completed" | "failed") {
  return {
    queued: "QUEUED",
    running: "DISCOVERING",
    completed: "COMPLETED",
    failed: "FAILED",
  }[status];
}
