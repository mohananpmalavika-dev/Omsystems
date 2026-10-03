export type AssignmentScope = "branch" | "region" | "zone";
export type BranchAssignment = {branchId:string;scopeNodeId:string;vpnNetworks:string[]};
export type ConnectionNode = {id:string;name:string;type:AssignmentScope;path:string[]};
export type ConnectionBranch = ConnectionNode & {vpnNetworks:string[]};
export type ConnectionAgent = {
  id:string;name:string;branchId:string;branchName:string;version:string;
  status:"online"|"offline"|"pending";lastSeenAt:string|null;
  supportsSharedBranches:boolean;branchAssignments:BranchAssignment[];
};
export type BranchConnectionCatalog = {
  minimumAgentVersion:string;scopes:ConnectionNode[];branches:ConnectionBranch[];agents:ConnectionAgent[];
};
export function branchesInScope(branches:ConnectionBranch[],scopeNodeId:string) {
  return branches.filter(b=>b.path.includes(scopeNodeId));
}
export function splitVpnNetworks(value:string) {
  return [...new Set(value.split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean))];
}
