import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { buildProvisioningRunView } from "../provisioning/provisioning-status.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const runParams = z.object({ branchId: z.string().min(1), runId: z.string().min(1) });
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
