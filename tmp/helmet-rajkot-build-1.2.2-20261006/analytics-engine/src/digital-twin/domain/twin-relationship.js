/**
 * Twin Relationship Domain Model
 *
 * Canonical edge representation in the Digital Twin graph.
 * Relationships capture dependencies, connections, and semantic links.
 */
/**
 * Create a new Twin Relationship with defaults
 */
export function createTwinRelationship(id, tenantId, sourceNodeId, targetNodeId, type, options) {
    const now = new Date();
    return {
        id,
        tenantId,
        sourceNodeId,
        targetNodeId,
        type,
        criticality: options?.criticality ?? 'MEDIUM',
        confidence: options?.confidence ?? 1.0,
        source: options?.source ?? 'CONFIGURATION',
        dependencySemantics: options?.dependencySemantics,
        validFrom: options?.validFrom ?? now,
        validUntil: options?.validUntil,
        metadata: options?.metadata ?? {},
        createdAt: now,
        updatedAt: now,
        deletedAt: options?.deletedAt
    };
}
/**
 * Check if relationship is currently valid
 */
export function isRelationshipValid(relationship, at = new Date()) {
    if (relationship.deletedAt) {
        return false;
    }
    if (at < relationship.validFrom) {
        return false;
    }
    if (relationship.validUntil && at > relationship.validUntil) {
        return false;
    }
    return true;
}
/**
 * Check if relationship is high confidence
 */
export function isHighConfidence(relationship) {
    return relationship.confidence >= 0.8;
}
/**
 * Check if relationship is critical
 */
export function isCriticalRelationship(relationship) {
    return relationship.criticality === 'CRITICAL';
}
/**
 * Get failure effect from dependency semantics
 */
export function getFailureEffect(relationship) {
    return relationship.dependencySemantics?.failureEffect ?? null;
}
/**
 * Check if relationship is required (not optional)
 */
export function isRequiredRelationship(relationship) {
    return relationship.dependencySemantics?.required ?? true;
}
/**
 * Check if relationship is part of a redundancy group
 */
export function isRedundant(relationship) {
    return !!relationship.dependencySemantics?.redundancyGroup;
}
/**
 * Update relationship confidence
 */
export function updateRelationshipConfidence(relationship, confidence, source) {
    return {
        ...relationship,
        confidence: Math.max(0, Math.min(1, confidence)),
        source: source ?? relationship.source,
        updatedAt: new Date()
    };
}
/**
 * Mark relationship as expired
 */
export function expireRelationship(relationship, expiryDate = new Date()) {
    return {
        ...relationship,
        validUntil: expiryDate,
        updatedAt: new Date()
    };
}
/**
 * Update dependency semantics
 */
export function updateDependencySemantics(relationship, semantics) {
    return {
        ...relationship,
        dependencySemantics: {
            ...relationship.dependencySemantics,
            ...semantics
        },
        updatedAt: new Date()
    };
}
/**
 * Create a redundant relationship group
 *
 * Example: Camera recorded by both NVR-1 and NVR-2 (minimum 1 healthy)
 */
export function createRedundantRelationships(tenantId, sourceNodeId, targetNodeIds, type, minimumHealthy, options) {
    const redundancyGroup = `redundancy_${sourceNodeId}_${Date.now()}`;
    return targetNodeIds.map((targetNodeId, index) => createTwinRelationship(`rel_${sourceNodeId}_${targetNodeId}_${Date.now()}_${index}`, tenantId, sourceNodeId, targetNodeId, type, {
        ...options,
        dependencySemantics: {
            required: true,
            redundancyGroup,
            minimumHealthy,
            failureEffect: minimumHealthy === targetNodeIds.length ? 'UNAVAILABLE' : 'DEGRADED',
            weight: 1.0 / targetNodeIds.length
        }
    }));
}
/**
 * Assess relationship quality
 */
export function assessRelationshipQuality(relationship) {
    const now = new Date();
    // Check if expired
    if (!isRelationshipValid(relationship, now)) {
        return {
            trustworthy: false,
            qualityScore: 0,
            confidenceLevel: 'LOW',
            sourceReliability: 'UNCERTAIN',
            needsVerification: true,
            reason: 'Relationship expired or invalid'
        };
    }
    // Assess based on source
    let sourceReliability;
    let baseScore;
    switch (relationship.source) {
        case 'DISCOVERY':
        case 'TELEMETRY':
            sourceReliability = 'VERIFIED';
            baseScore = 90;
            break;
        case 'CONFIGURATION':
            sourceReliability = 'VERIFIED';
            baseScore = 95;
            break;
        case 'OPERATOR':
            sourceReliability = 'VERIFIED';
            baseScore = 85;
            break;
        case 'INFERRED':
            sourceReliability = 'INFERRED';
            baseScore = 60;
            break;
        case 'IMPORTED':
            sourceReliability = 'UNCERTAIN';
            baseScore = 50;
            break;
        default:
            sourceReliability = 'UNCERTAIN';
            baseScore = 40;
    }
    // Adjust by confidence
    const qualityScore = Math.round(baseScore * relationship.confidence);
    // Determine confidence level
    let confidenceLevel;
    if (relationship.confidence >= 0.8) {
        confidenceLevel = 'HIGH';
    }
    else if (relationship.confidence >= 0.5) {
        confidenceLevel = 'MEDIUM';
    }
    else {
        confidenceLevel = 'LOW';
    }
    // Determine if verification needed
    const needsVerification = relationship.confidence < 0.7 ||
        relationship.source === 'INFERRED' ||
        relationship.source === 'IMPORTED';
    const trustworthy = qualityScore >= 70 && !needsVerification;
    return {
        trustworthy,
        qualityScore,
        confidenceLevel,
        sourceReliability,
        needsVerification,
        reason: trustworthy ? undefined : 'Low confidence or unverified source'
    };
}
