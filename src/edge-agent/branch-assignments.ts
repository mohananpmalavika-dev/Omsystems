import type { EdgeAgent } from "../domain/models.js";

export function edgeAgentServesBranch(agent: EdgeAgent, branchId: string) {
  return agent.credentialStatus !== "revoked" && (agent.branchId === branchId ||
    agent.branchAssignments?.some(assignment => assignment.branchId === branchId) === true);
}

export function edgeAgentBranchIds(agent: EdgeAgent) {
  return [...new Set([agent.branchId, ...(agent.branchAssignments ?? []).map(a => a.branchId)])];
}

export const SHARED_BRANCH_AGENT_VERSION = "0.1.47";
export function supportsSharedBranches(version: string) {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) &&
    (parts[0]! > 0 || parts[1]! > 1 || (parts[1] === 1 && parts[2]! >= 47));
}
