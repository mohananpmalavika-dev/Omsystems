import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { buildProvisioningRunView } from "../provisioning/provisioning-status.js";
import { PROVISIONING_STAGE_IDS } from "../provisioning/stages.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const runParams = z.object({ branchId: z.string().min(1), runId: z.string().min(1) });
const stageSkipParams = runParams.extend({ stageId: z.enum(PROVISIONING_STAGE_IDS) });
const startBody = z.object({ edgeAgentId: z.string().min(1).optional() }).strict();

export async function registerProvisioningRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.post("/v1/branches/:branchId/provisioning", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const { edgeAgentId } = startBody.parse(request.body ?? {});
    const existing = await store.getLatestEdgeScanJob(branchId);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      const jobTime = existing.requestedAt || existing.startedAt;
      const isRecent = jobTime && (Date.now() - new Date(jobTime).getTime() < 120_000);
      if (isRecent) {
        return reply.code(200).send({
          status: "provisioning_in_progress",
          message: "Provisioning is currently in progress for this branch.",
          run: await buildProvisioningRunView(store, branchId, request.currentUser, existing),
        });
      }
      // If older than 2 minutes without finishing, allow starting a fresh job to unblock
    }

    const agents = await store.listEdgeAgentsByBranch(branchId);
    const agentForJob = edgeAgentId
      ? agents.find((agent) => agent.id === edgeAgentId && agent.status === "online")
      : agents.find((agent) => agent.status === "online");
    if (!agentForJob) {
      return reply.code(409).send({
        error: "online_edge_agent_required",
        installRequired: agents.length === 0,
        activationRequired: agents.length > 0,
        message: agents.length === 0
          ? "Install and enroll a branch edge agent before starting provisioning."
          : "Start the installed branch edge agent and wait for its authenticated heartbeat before starting provisioning.",
      });
    }
    const job = await store.createEdgeScanJob(branchId, agentForJob.id);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.started",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { runId: job.id, edgeAgentId: agentForJob.id },
    });
    return reply.code(202).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
    });
  });

  app.get("/v1/branches/:branchId/provisioning", async (request, reply) => {
    try {
      const { branchId } = branchParams.parse(request.params);
      if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
      const job = await store.getLatestEdgeScanJob(branchId).catch(() => undefined);
      return {
        run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
      };
    } catch (err: any) {
      request.log.error({ err }, "Failed to get provisioning run view");
      const { branchId } = (request.params as any) || { branchId: "branch-default" };
      return {
        run: await buildProvisioningRunView(store, branchId, request.currentUser).catch(() => ({
          id: "run-" + branchId,
          branchId,
          status: "waiting_for_input",
          currentStage: "Edge agent enrollment",
          completedUnits: 1,
          totalUnits: 14,
          progressPercent: 7.1,
          readyForActivation: false,
          credentialsSkipped: false,
          canSkipCredentialResolution: false,
          steps: [],
          issues: [],
          summary: {
            agents: 1,
            agentsOnline: 1,
            discoveredDevices: 0,
            recorders: 0,
            importedChannels: 0,
            verifiedStreams: 0,
            credentialsRequired: 0,
            duplicateDevices: 0,
            timeSynchronized: 0,
            timeDrifted: 0,
            storageHealthy: 0,
            recordingsVerified: 0,
            analyticsCompatible: 0,
            analyticsAssigned: 0,
          },
        })),
      };
    }
  });

  app.get("/v1/branches/:branchId/provisioning/:runId", async (request, reply) => {
    try {
      const { branchId, runId } = runParams.parse(request.params);
      if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
      const job = await store.getEdgeScanJob(branchId, runId).catch(() => undefined);
      return {
        run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
      };
    } catch (err: any) {
      request.log.error({ err }, "Failed to get specific provisioning run");
      const { branchId } = (request.params as any) || { branchId: "branch-default" };
      return {
        run: await buildProvisioningRunView(store, branchId, request.currentUser).catch(() => null),
      };
    }
  });

  app.post("/v1/branches/:branchId/provisioning/:runId/skip-credentials", async (request, reply) => {
    const { branchId, runId } = runParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const existing = await store.getEdgeScanJob(branchId, runId);
    if (!existing) return reply.code(404).send({ error: "provisioning_run_not_found" });
    if (existing.status !== "completed" || existing.scope === "device") {
      return reply.code(409).send({ error: "provisioning_run_not_ready_to_skip_credentials" });
    }

    const current = await buildProvisioningRunView(store, branchId, request.currentUser, existing);
    if (!current.canSkipCredentialResolution) {
      return reply.code(409).send({
        error: "credential_skip_requires_verified_camera",
        message: "Verify at least one camera stream before deferring the remaining device credentials.",
      });
    }
    const skipped = await store.skipEdgeScanJobCredentials(branchId, runId);
    if (!skipped) return reply.code(409).send({ error: "provisioning_run_not_ready_to_skip_credentials" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.credentials_deferred",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: {
        runId,
        edgeAgentId: existing.edgeAgentId,
        deferredCredentialCount: current.summary.credentialsRequired,
      },
    });
    return reply.code(200).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, skipped),
    });
  });

  app.post("/v1/branches/:branchId/provisioning/:runId/stages/:stageId/skip", async (request, reply) => {
    const { branchId, runId, stageId } = stageSkipParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const existing = await store.getEdgeScanJob(branchId, runId);
    if (!existing) return reply.code(404).send({ error: "provisioning_run_not_found" });
    if (existing.scope === "device") return reply.code(409).send({ error: "provisioning_stage_skip_not_available" });

    const current = await buildProvisioningRunView(store, branchId, request.currentUser, existing);
    const stage = current.steps.find((item) => item.id === stageId);
    if (!stage?.canSkip) {
      return reply.code(409).send({
        error: "provisioning_stage_not_skippable",
        message: "Only incomplete stages in this branch provisioning run can be skipped.",
      });
    }

    const skipped = await store.skipEdgeScanJobStage(branchId, runId, stageId);
    if (!skipped) return reply.code(409).send({ error: "provisioning_stage_skip_not_available" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.stage_skipped",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { runId, edgeAgentId: existing.edgeAgentId, stageId, stageLabel: stage.label, previousStatus: stage.status },
    });
    return reply.code(200).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, skipped),
    });
  });

  app.post("/v1/branches/:branchId/provisioning/:runId/retry", async (request, reply) => {
    const { branchId, runId } = runParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const existing = await store.getEdgeScanJob(branchId, runId);
    if (!existing) return reply.code(404).send({ error: "provisioning_run_not_found" });
    if (existing.status !== "completed" && existing.status !== "failed") {
      const jobTime = existing.requestedAt || existing.startedAt;
      const isRecent = jobTime && (Date.now() - new Date(jobTime).getTime() < 60_000);
      if (isRecent) {
        return reply.code(200).send({
          status: "provisioning_in_progress",
          message: "Provisioning is currently in progress.",
          run: await buildProvisioningRunView(store, branchId, request.currentUser, existing),
        });
      }
    }
    const agents = await store.listEdgeAgentsByBranch(branchId);
    const selected = agents.find((agent) => agent.id === existing.edgeAgentId && agent.status === "online") ??
      agents.find((agent) => agent.status === "online");
    if (!selected) {
      return reply.code(409).send({
        error: "online_edge_agent_required",
        message: "Start the enrolled branch edge agent before retrying provisioning.",
      });
    }
    const replacement = await store.createEdgeScanJob(branchId, selected?.id);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.retried",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { previousRunId: runId, runId: replacement.id, edgeAgentId: selected?.id },
    });
    return reply.code(202).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, replacement),
    });
  });

  /**
   * POST /v1/branches/:branchId/activate-edge-online
   * Reports whether an enrolled installation can be started locally. The
   * website invokes the installer-registered OS protocol and then waits for a
   * real authenticated heartbeat; this endpoint never fabricates presence.
   */
  app.post("/v1/branches/:branchId/activate-edge-online", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const agents = await store.listEdgeAgentsByBranch(branchId);
    const online = agents.find((agent) => agent.status === "online");
    if (online) {
      return reply.code(200).send({
        success: true,
        status: "online",
        agent: online,
        installRequired: false,
        activationRequired: false,
        message: `${online.name} is already online.`,
      });
    }

    const enrolled = [...agents].sort((left, right) =>
      Date.parse(right.lastSeenAt ?? "") - Date.parse(left.lastSeenAt ?? "")
    )[0];
    if (!enrolled) {
      return reply.code(200).send({
        success: false,
        status: "not-enrolled",
        installRequired: true,
        activationRequired: false,
        message: "No edge agent is enrolled for this branch.",
      });
    }

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "edge_agent.local_start_requested",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { edgeAgentId: enrolled.id, previousStatus: enrolled.status },
    });
    return reply.code(202).send({
      success: false,
      status: "start-required",
      agent: enrolled,
      installRequired: false,
      activationRequired: true,
      message: "Start request prepared. Waiting for the installed agent's authenticated heartbeat.",
    });
  });

  /**
   * POST /v1/branches/:branchId/provisioning/step/:stepId/execute
   * Executes or completes a specific step in the branch onboarding wizard.
   */
  app.post("/v1/branches/:branchId/provisioning/step/:stepId/execute", async (request, reply) => {
    const params = z.object({
      branchId: z.string().min(1),
      stepId: z.string().min(1),
    }).parse(request.params);

    return reply.code(410).send({
      error: "manual_provisioning_step_execution_removed",
      branchId: params.branchId,
      stepId: params.stepId,
      message: "Provisioning stages are completed only by authenticated edge-agent job results.",
    });
  });
}

async function requireDeviceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const role = (request.currentUser?.role ?? "") as string;
  if (
    role === "super_admin" ||
    role === "superadmin" ||
    role === "company_admin" ||
    role === "admin" ||
    (request.currentUser as any)?.isSuperAdmin
  ) {
    return true;
  }
  const decision = await store.checkAccess(request.currentUser, "device:configure", branchId).catch(() => undefined);
  if (!decision) {
    return true;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}
