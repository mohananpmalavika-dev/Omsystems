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
      return reply.code(409).send({
        error: "provisioning_in_progress",
        run: await buildProvisioningRunView(store, branchId, request.currentUser, existing),
      });
    }

    const agents = await store.listEdgeAgentsByBranch(branchId);
    const selected = edgeAgentId
      ? agents.find((agent) => agent.id === edgeAgentId)
      : agents.find((agent) => agent.status === "online");
    if (!selected || selected.status !== "online") {
      return reply.code(409).send({
        error: agents.length > 0 ? "edge_agent_not_connected" : "edge_agent_required",
        message: "An enrolled, online Branch Gateway is required to inspect the private CCTV network.",
      });
    }

    const job = await store.createEdgeScanJob(branchId, selected.id);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.started",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { runId: job.id, edgeAgentId: selected.id },
    });
    return reply.code(202).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
    });
  });

  app.get("/v1/branches/:branchId/provisioning", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const job = await store.getLatestEdgeScanJob(branchId);
    return {
      run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
    };
  });

  app.get("/v1/branches/:branchId/provisioning/:runId", async (request, reply) => {
    const { branchId, runId } = runParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const job = await store.getEdgeScanJob(branchId, runId);
    if (!job) return reply.code(404).send({ error: "provisioning_run_not_found" });
    return {
      run: await buildProvisioningRunView(store, branchId, request.currentUser, job),
    };
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
      return reply.code(409).send({ error: "provisioning_run_not_retryable" });
    }
    const agents = await store.listEdgeAgentsByBranch(branchId);
    const selected = agents.find((agent) => agent.id === existing.edgeAgentId && agent.status === "online") ??
      agents.find((agent) => agent.status === "online");
    if (!selected) return reply.code(409).send({ error: "edge_agent_not_connected" });
    const replacement = await store.createEdgeScanJob(branchId, selected.id);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "zero_touch_provisioning.retried",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: { previousRunId: runId, runId: replacement.id, edgeAgentId: selected.id },
    });
    return reply.code(202).send({
      run: await buildProvisioningRunView(store, branchId, request.currentUser, replacement),
    });
  });
}

async function requireDeviceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
  if (!decision) {
    await reply.code(404).send({ error: "branch_not_found" });
    return false;
  }
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  return true;
}
