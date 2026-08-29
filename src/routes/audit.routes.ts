import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AuditRepository } from "../database/audit-repository.js";
import type { Camera } from "../domain/models.js";

const branchComplianceQuery = z.object({
  branchNodeId: z.string().uuid().optional(),
});

const healthQuery = z.object({
  cameraId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
  status: z.enum(['healthy', 'warning', 'degraded', 'critical', 'offline', 'maintenance', 'unknown']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  summary: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

const healthCheckBody = z.object({
  cameraId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.cameraId) !== Boolean(value.branchNodeId), {
  message: 'Provide exactly one cameraId or branchNodeId',
});

export async function registerAuditRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  auditRepo: AuditRepository,
) {
  app.get("/v1/audit/branch-compliance", async (request, reply) => {
    const query = branchComplianceQuery.parse(request.query);
    const branches = await store.listAccessibleNodes(request.currentUser, "analytics:view", "branch");
    const targets = query.branchNodeId
      ? branches.filter((branch) => branch.id === query.branchNodeId)
      : branches;
    if (query.branchNodeId && targets.length === 0) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const rows = await Promise.all(targets.map((branch) =>
      auditRepo.getBranchComplianceSummary(request.currentUser.tenantId, branch.id),
    ));
    return { data: rows.flat() };
  });

  app.get("/v1/audit/health", async (request, reply) => {
    const query = healthQuery.parse(request.query);
    const branches = await store.listAccessibleNodes(
      request.currentUser,
      "analytics:view",
      "branch",
    );
    const targetBranches = query.branchNodeId
      ? branches.filter((branch) => branch.id === query.branchNodeId)
      : branches;
    if (query.branchNodeId && targetBranches.length === 0) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const allCameras = (await Promise.all(targetBranches.map((branch) =>
      store.listCamerasByBranch(request.currentUser, branch.id, "analytics:view"),
    ))).flat();
    const allowedCameraIds = new Set(allCameras.map((camera) => camera.id));
    if (query.cameraId && !allowedCameraIds.has(query.cameraId)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await auditRepo.listLatestCameraHealthChecks(
      request.currentUser.tenantId,
      targetBranches.map((branch) => branch.id),
      {
        ...(query.cameraId ? { cameraId: query.cameraId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
      },
    ) as Array<Record<string, unknown>>;
    const records = rows.filter((row) => typeof row.cameraId === 'string' && allowedCameraIds.has(row.cameraId));

    if (query.summary) {
      const assessed = records.filter((row) => row.overallStatus !== 'unknown');
      const scores = assessed
        .filter((row) => row.healthScore !== null && row.healthScore !== undefined && row.healthScore !== '')
        .map((row) => typeof row.healthScore === 'number' ? row.healthScore : Number(row.healthScore))
        .filter((score) => Number.isFinite(score));
      const countStatus = (status: string) => records.filter((row) => row.overallStatus === status).length;
      return {
        data: {
          totalCameras: allCameras.length,
          assessedCameras: assessed.length,
          unassessedCameras: Math.max(0, allCameras.length - assessed.length),
          onlineCameras: records.filter((row) => row.isOnline === true).length,
          recordingCameras: records.filter((row) => row.isRecording === true).length,
          healthyCameras: countStatus('healthy'),
          warningCameras: countStatus('warning'),
          degradedCameras: countStatus('degraded'),
          criticalCameras: countStatus('critical'),
          offlineCameras: countStatus('offline'),
          avgHealthScore: scores.length
            ? Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 10) / 10
            : null,
        },
      };
    }

    return { data: records, total: records.length };
  });

  app.post("/v1/audit/health/check", async (request, reply) => {
    const body = healthCheckBody.parse(request.body);
    let cameras: Camera[] = [];
    let resourceNodeId: string;

    if (body.cameraId) {
      const camera = await store.getCamera(body.cameraId);
      if (!camera) return reply.code(404).send({ error: 'camera_not_found' });
      const decision = await store.checkAccess(request.currentUser, 'device:configure', camera.nodeId);
      if (!decision?.allowed) return reply.code(403).send({ error: 'forbidden' });
      cameras = [camera];
      resourceNodeId = camera.nodeId;
    } else {
      resourceNodeId = body.branchNodeId!;
      const decision = await store.checkAccess(request.currentUser, 'device:configure', resourceNodeId);
      if (!decision?.allowed) return reply.code(403).send({ error: 'forbidden' });
      cameras = await store.listCamerasByBranch(request.currentUser, resourceNodeId, 'device:configure');
    }

    const commands: Array<{ cameraId: string; commandId: string }> = [];
    const unavailable: Array<{ cameraId: string; reason: string }> = [];
    const agentCache = new Map<string, Awaited<ReturnType<typeof store.getEdgeAgent>>>();
    for (const camera of cameras) {
      if (!camera.edgeAgentId) {
        unavailable.push({ cameraId: camera.id, reason: 'edge_agent_not_assigned' });
        continue;
      }
      let agent = agentCache.get(camera.edgeAgentId);
      if (agent === undefined) {
        agent = await store.getEdgeAgent(camera.edgeAgentId);
        agentCache.set(camera.edgeAgentId, agent);
      }
      if (!agent || agent.branchId !== camera.branchId || agent.status !== 'online') {
        unavailable.push({ cameraId: camera.id, reason: 'edge_agent_not_connected' });
        continue;
      }
      const command = await store.createEdgeCommand({
        edgeAgentId: agent.id,
        type: 'probe-camera',
        payload: { cameraId: camera.id },
        requestedBy: request.currentUser.id,
      });
      commands.push({ cameraId: camera.id, commandId: command.id });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'audit.health_check_requested',
      resourceNodeId,
      outcome: commands.length > 0 ? 'success' : 'failure',
      sourceIp: request.ip,
      details: {
        requestedCameraCount: cameras.length,
        queuedCameraCount: commands.length,
        unavailableCameraCount: unavailable.length,
        commandIds: commands.map((command) => command.commandId),
      },
    });

    if (commands.length === 0) {
      return reply.code(409).send({
        error: 'edge_probe_unavailable',
        message: 'No online Branch Gateway is available for the selected cameras.',
        unavailable,
      });
    }
    return reply.code(202).send({
      message: 'Camera probes were queued on the connected Branch Gateways.',
      status: 'queued',
      queued: commands.length,
      unavailable: unavailable.length,
      commands,
    });
  });
}
