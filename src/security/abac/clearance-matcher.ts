/**
 * User Clearance Tags & Hierarchical Clearance Level Evaluator
 * Enforces military/banking grade multi-label tag security and clearance ranks.
 */

import {
  type ClearanceLevel,
  CLEARANCE_RANKS,
  type ContextualClearanceRule,
  type UserClearanceProfile,
} from "./abac.types.js";

export function evaluateClearanceAccess(
  userProfile?: Partial<UserClearanceProfile> | null,
  rule?: ContextualClearanceRule,
  requestTime: Date = new Date(),
): {
  passed: boolean;
  userLevel?: ClearanceLevel;
  requiredLevel?: ClearanceLevel;
  matchedTags?: string[];
  missingTags?: string[];
  prohibitedTags?: string[];
  reason?: string;
} {
  const userLevel: ClearanceLevel = userProfile?.clearanceLevel || "UNCLASSIFIED";
  const userTags = new Set((userProfile?.clearanceTags || []).map((t) => t.toUpperCase()));

  // 1. Check revocation status
  if (userProfile?.revoked) {
    return {
      passed: false,
      userLevel,
      reason: `User clearance was REVOKED${userProfile.revocationReason ? `: ${userProfile.revocationReason}` : ""}`,
    };
  }

  // 2. Check validity window
  if (userProfile?.validFrom) {
    const validFrom = new Date(userProfile.validFrom);
    if (requestTime < validFrom) {
      return {
        passed: false,
        userLevel,
        reason: `User clearance is not yet active (valid from ${validFrom.toISOString()})`,
      };
    }
  }

  if (userProfile?.validUntil) {
    const validUntil = new Date(userProfile.validUntil);
    if (requestTime > validUntil) {
      return {
        passed: false,
        userLevel,
        reason: `User clearance EXPIRED on ${validUntil.toISOString()}`,
      };
    }
  }

  if (!rule) {
    return { passed: true, userLevel };
  }

  // 3. Hierarchical Clearance Rank Check
  if (rule.minClearanceLevel) {
    const userRank = CLEARANCE_RANKS[userLevel] ?? 0;
    const requiredRank = CLEARANCE_RANKS[rule.minClearanceLevel] ?? 0;

    if (userRank < requiredRank) {
      return {
        passed: false,
        userLevel,
        requiredLevel: rule.minClearanceLevel,
        reason: `Insufficient clearance level: User has '${userLevel}' (rank ${userRank}) but rule requires minimum '${rule.minClearanceLevel}' (rank ${requiredRank})`,
      };
    }
  }

  // 4. Prohibited Tags Check (e.g. SUSPENDED, PROBATIONARY)
  if (rule.prohibitedClearanceTags && rule.prohibitedClearanceTags.length > 0) {
    const foundProhibited = rule.prohibitedClearanceTags
      .map((t) => t.toUpperCase())
      .filter((t) => userTags.has(t));

    if (foundProhibited.length > 0) {
      return {
        passed: false,
        userLevel,
        prohibitedTags: foundProhibited,
        reason: `User holds prohibited clearance tag(s): [${foundProhibited.join(", ")}]`,
      };
    }
  }

  // 5. Required Clearance Tags Check
  if (rule.requiredClearanceTags && rule.requiredClearanceTags.length > 0) {
    const required = rule.requiredClearanceTags.map((t) => t.toUpperCase());
    const matched = required.filter((t) => userTags.has(t));
    const missing = required.filter((t) => !userTags.has(t));
    const matchMode = rule.matchMode || "ALL";

    if (matchMode === "ALL" && missing.length > 0) {
      return {
        passed: false,
        userLevel,
        matchedTags: matched,
        missingTags: missing,
        reason: `User missing required clearance tag(s): [${missing.join(", ")}]`,
      };
    }

    if (matchMode === "ANY" && matched.length === 0) {
      return {
        passed: false,
        userLevel,
        missingTags: required,
        reason: `User does not possess any of the required clearance tags: [${required.join(", ")}]`,
      };
    }

    return {
      passed: true,
      userLevel,
      requiredLevel: rule.minClearanceLevel,
      matchedTags: matched,
    };
  }

  return {
    passed: true,
    userLevel,
    requiredLevel: rule.minClearanceLevel,
  };
}
