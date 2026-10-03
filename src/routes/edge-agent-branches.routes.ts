import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { isFreshEdgeAgent } from "../edge-agent/presence.js";
import { SHARED_BRANCH_AGENT_VERSION, supportsSharedBranches } from "../edge-agent/branch-assignments.js";
import { normalizeVpnNetwork } from "../../edge-agent/src/discovery/branch-network-scope.js";

const params = z.object({ id: z.string().min(1) });
const network = z.string().trim().min(1).max(43).transform((value, ctx) => {
  try { return normalizeVpnNetwork(value); } catch {
    ctx.addIssue({ code: "custom", message: "Enter a private IPv4 address or VPN CIDR from /20 to /32, for example 10.20.1.0/24." });
    return z.NEVER;
  }
});
const bodySchema = z.object({
  scopeNodeId: z.string().min(1),
  branches: z.array(z.object({ branchId: z.string().min(1), vpnNetworks: z.array(network).min(1).max(32) })).min(1).max(1000),
}).superRefine((value, ctx) => {
  if (new Set(value.branches.map(b => b.branchId)).size !== value.branches.length) ctx.addIssue({ code: "custom", message: "Select each branch only once." });
});

async function requireConfigure(request: FastifyRequest, reply: FastifyReply, store: ControlPlaneStore, nodeId: string) {
  const decision = await store.checkAccess(request.currentUser, "device:configure", nodeId);
  if (!decision?.allowed) { reply.code(403).send({ error: "forbidden", reason: decision?.reason }); return false; }
  return true;
}

export async function registerEdgeAgentBranchRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  app.get("/v1/edge-agent-branches", async (request, reply) => {
    const nodes = await store.listAccessibleNodes(request.currentUser, "device:configure");
    const branches = nodes.filter(n => n.type === "branch");
    const allowed = new Set(branches.map(b => b.id));
    const agents = (await store.listEdgeAgents(request.currentUser.tenantId))
      .filter(a => allowed.has(a.branchId) && a.credentialStatus === "active");
    const profiles = await Promise.all(branches.map(b => store.getBranchConnectivityProfile(b.id)));
    return reply.header("cache-control", "no-store").send({ data: {
      minimumAgentVersion: SHARED_BRANCH_AGENT_VERSION,
      scopes: nodes.filter(n => ["zone", "region"].includes(n.type)),
      branches: branches.map((b, i) => ({ ...b, vpnNetworks: profiles[i]?.vpnRemoteNetworks ?? [] })),
      agents: agents.map(a => ({ ...a, status: isFreshEdgeAgent(a) ? "online" : a.status === "pending" ? "pending" : "offline",
        branchName: branches.find(b => b.id === a.branchId)?.name,
        supportsSharedBranches: supportsSharedBranches(a.version),
        branchAssignments: (a.branchAssignments ?? []).filter(assignment => allowed.has(assignment.branchId)),
      })),
    } });
  });

  app.post("/v1/edge-agents/:id/branches", async (request, reply) => {
    const { id } = params.parse(request.params);
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_branch_assignment", message: parsed.error.issues[0]?.message });
    const body = parsed.data;
    const agent = await store.getEdgeAgent(id);
    if (!agent || agent.credentialStatus === "revoked") return reply.code(404).send({ error: "edge_agent_not_found" });
    if (!(await requireConfigure(request, reply, store, agent.branchId))) return;
    if (agent.credentialStatus !== "active") return reply.code(409).send({ error: "edge_agent_enrollment_required",
      message: "Activate this existing agent before connecting additional branches." });
    if (!supportsSharedBranches(agent.version)) return reply.code(409).send({ error: "edge_agent_update_required", minimumVersion: SHARED_BRANCH_AGENT_VERSION,
      message: "Update this existing agent once to enable multiple branches." });
    const scope = await store.getNode(body.scopeNodeId);
    if (!scope || scope.tenantId !== request.currentUser.tenantId || !["zone", "region", "branch"].includes(scope.type)) return reply.code(400).send({ error: "invalid_assignment_scope" });
    if (!(await requireConfigure(request, reply, store, scope.id))) return;
    for (const entry of body.branches) {
      const branch = await store.getNode(entry.branchId);
      if (!branch || branch.type !== "branch" || branch.tenantId !== scope.tenantId || !branch.path.includes(scope.id)) return reply.code(400).send({ error: "branch_outside_assignment_scope" });
      if (!(await requireConfigure(request, reply, store, branch.id))) return;
    }
    try {
      await store.assignEdgeAgentBranches(id, body.branches.map(b => ({ ...b, vpnNetworks: [...new Set(b.vpnNetworks)], scopeNodeId: scope.id })));
      await store.writeAudit({ tenantId: scope.tenantId, actorUserId: request.currentUser.id, action: "edge_agent.branches_assigned",
        resourceNodeId: scope.id, outcome: "success", sourceIp: request.ip,
        details: { edgeAgentId: id, scopeNodeId: scope.id, branches: body.branches } });
      return { data: { edgeAgentId: id, branchIds: body.branches.map(b => b.branchId) } };
    } catch (error) {
      const code = error instanceof Error ? error.message : "branch_assignment_failed";
      if (["overlapping_branch_networks", "home_branch_already_assigned", "invalid_branch_assignment"].includes(code)) return reply.code(409).send({ error: code });
      throw error;
    }
  });

  app.delete("/v1/edge-agents/:id/branches/:branchId", async (request, reply) => {
    const { id, branchId } = z.object({ id: z.string().min(1), branchId: z.string().min(1) }).parse(request.params);
    const agent = await store.getEdgeAgent(id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    if (!(await requireConfigure(request, reply, store, agent.branchId)) || !(await requireConfigure(request, reply, store, branchId))) return;
    try {
      await store.unassignEdgeAgentBranch(id, branchId);
      await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: "edge_agent.branch_unassigned",
        resourceNodeId: branchId, outcome: "success", sourceIp: request.ip, details: { edgeAgentId: id } });
      return reply.code(204).send();
    } catch (error) {
      const code = error instanceof Error ? error.message : "branch_unassignment_failed";
      if (["branch_has_agent_cameras", "cannot_unassign_home_branch", "edge_agent_not_found"].includes(code)) return reply.code(409).send({ error: code });
      throw error;
    }
  });
}
