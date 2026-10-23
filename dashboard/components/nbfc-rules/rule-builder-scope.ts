export const KEEP_RULE_SCOPE = "__KEEP_RULE_SCOPE__";

interface RuleScope {
  branchIds?: string[];
  cameraIds?: string[];
}

/** Retain an existing rule's targets; use page filters for new or global rules. */
export function initialRuleScope(rule: RuleScope | null, branchId: string, cameraId: string) {
  if (rule?.branchIds?.length || rule?.cameraIds?.length) {
    return {
      branchId: (rule.branchIds?.length ?? 0) > 1 ? KEEP_RULE_SCOPE : rule.branchIds?.[0] || "ALL",
      cameraId: (rule.cameraIds?.length ?? 0) > 1 ? KEEP_RULE_SCOPE : rule.cameraIds?.[0] || "ALL",
    };
  }
  return { branchId, cameraId };
}

export function resolveRuleScope(branchId: string, cameraId: string, rule: RuleScope | null) {
  const branchIds = branchId === KEEP_RULE_SCOPE ? [...(rule?.branchIds ?? [])] : branchId === "ALL" ? [] : [branchId];
  const cameraIds = cameraId === KEEP_RULE_SCOPE ? [...(rule?.cameraIds ?? [])] : cameraId === "ALL" ? [] : [cameraId];
  return { branchIds, cameraIds, scopeType: cameraIds.length ? "CAMERA" : branchIds.length ? "BRANCH" : "GLOBAL" };
}
