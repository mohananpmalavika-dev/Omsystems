import type { ControlPlaneStore } from "../control-plane-store.js";

export interface PhysicalSirenAlert {
  alertId: string;
  tenantId: string;
  branchId?: string | undefined;
  cameraId?: string | undefined;
  severity: string;
  detectionType: string;
  occurredAt: string;
}

export type PhysicalSirenDispatchResult =
  | { queued: true; commandId: string; edgeAgentId: string }
  | { queued: false; reason: "branch_not_found" | "tenant_mismatch" | "edge_agent_unavailable" | "edge_agent_upgrade_required" };

const minimumSirenAgentVersion = "0.1.18";

/**
 * Routes a newly-created alert to one branch gateway. The gateway owns the
 * hardware-specific relay configuration, so relay credentials never enter the
 * control-plane command queue.
 */
export async function queuePhysicalSiren(
  store: ControlPlaneStore,
  alert: PhysicalSirenAlert,
): Promise<PhysicalSirenDispatchResult> {
  const camera = alert.cameraId ? await store.getCamera(alert.cameraId) : undefined;
  const branchId = alert.branchId ?? camera?.branchId;
  if (!branchId) return { queued: false, reason: "branch_not_found" };

  const branch = await store.getNode(branchId);
  if (!branch) return { queued: false, reason: "branch_not_found" };
  if (branch.tenantId !== alert.tenantId) return { queued: false, reason: "tenant_mismatch" };

  const branchAgents = (await store.listEdgeAgentsByBranch(branchId))
    .filter((agent) => agent.credentialStatus !== "revoked");
  const agents = branchAgents.filter((agent) => versionAtLeast(agent.version, minimumSirenAgentVersion));
  if (branchAgents.length > 0 && agents.length === 0) {
    return { queued: false, reason: "edge_agent_upgrade_required" };
  }
  const cameraAgent = camera?.edgeAgentId
    ? agents.find((agent) => agent.id === camera.edgeAgentId)
    : undefined;
  const agent = (cameraAgent?.status === "online" ? cameraAgent : undefined)
    ?? agents.find((candidate) => candidate.status === "online")
    ?? cameraAgent
    ?? agents[0];
  if (!agent) return { queued: false, reason: "edge_agent_unavailable" };

  const command = await store.createEdgeCommand({
    edgeAgentId: agent.id,
    type: "trigger-siren",
    requestedBy: "system:alert-siren",
    payload: {
      alertId: alert.alertId,
      branchId,
      severity: alert.severity,
      detectionType: alert.detectionType,
      occurredAt: alert.occurredAt,
    },
  });
  return { queued: true, commandId: command.id, edgeAgentId: agent.id };
}

function versionAtLeast(actual: string, minimum: string) {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(actual);
  const right = parse(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
