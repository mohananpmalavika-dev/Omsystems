import type {
  AccessGrant,
  Action,
  ResourceNode,
  User,
} from "./models.js";

export interface AuthorizationDecision {
  allowed: boolean;
  reason: "allowed_by_grant" | "explicitly_denied" | "no_matching_grant";
  matchingScopeId?: string;
}

function contains(scope: ResourceNode, resource: ResourceNode): boolean {
  return resource.path.includes(scope.id);
}

/**
 * Evaluates grants using default-deny semantics. An applicable deny always wins.
 * Grants are tenant-bound and automatically apply to descendants of their scope.
 */
export function authorize(
  user: User,
  action: Action,
  resource: ResourceNode,
  nodesById: ReadonlyMap<string, ResourceNode>,
  grants: readonly AccessGrant[],
): AuthorizationDecision {
  if (user.tenantId !== resource.tenantId) {
    return { allowed: false, reason: "no_matching_grant" };
  }

  const applicable = grants.filter((grant) => {
    if (grant.userId !== user.id || !grant.actions.includes(action)) return false;
    const scope = nodesById.get(grant.scopeNodeId);
    return Boolean(
      scope &&
        scope.tenantId === user.tenantId &&
        contains(scope, resource),
    );
  });

  const denied = applicable.find((grant) => grant.effect === "deny");
  if (denied) {
    return {
      allowed: false,
      reason: "explicitly_denied",
      matchingScopeId: denied.scopeNodeId,
    };
  }

  const allowed = applicable.find((grant) => grant.effect === "allow");
  if (allowed) {
    return {
      allowed: true,
      reason: "allowed_by_grant",
      matchingScopeId: allowed.scopeNodeId,
    };
  }

  return { allowed: false, reason: "no_matching_grant" };
}
