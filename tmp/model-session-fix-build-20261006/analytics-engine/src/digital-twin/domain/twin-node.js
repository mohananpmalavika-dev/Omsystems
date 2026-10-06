/**
 * Twin Node Domain Model
 *
 * Canonical node representation in the Digital Twin graph.
 * This is the authoritative model for all infrastructure elements.
 */
/**
 * Create a new Twin Node with defaults
 */
export function createTwinNode(id, tenantId, type, name, options) {
    const now = new Date();
    return {
        id,
        tenantId,
        type,
        name,
        lifecycle: options?.lifecycle ?? 'ACTIVE',
        operationalState: options?.operationalState ?? 'UNKNOWN',
        observedAt: options?.observedAt,
        criticality: options?.criticality ?? 'MEDIUM',
        location: options?.location,
        externalRef: options?.externalRef,
        health: {
            score: 100,
            status: 'UNKNOWN',
            issues: [],
            ...options?.health
        },
        security: {
            score: 100,
            status: 'UNKNOWN',
            issues: [],
            ...options?.security
        },
        capabilities: options?.capabilities,
        attributes: options?.attributes ?? {},
        compliance: options?.compliance,
        createdAt: now,
        updatedAt: now,
        deletedAt: options?.deletedAt
    };
}
/**
 * Update node operational state
 */
export function updateNodeOperationalState(node, newState, observedAt = new Date()) {
    return {
        ...node,
        operationalState: newState,
        observedAt,
        updatedAt: new Date()
    };
}
/**
 * Update node health
 */
export function updateNodeHealth(node, health) {
    return {
        ...node,
        health: {
            ...node.health,
            ...health
        },
        updatedAt: new Date()
    };
}
/**
 * Update node security posture
 */
export function updateNodeSecurity(node, security) {
    return {
        ...node,
        security: {
            ...node.security,
            ...security
        },
        updatedAt: new Date()
    };
}
/**
 * Add or update a capability
 */
export function setNodeCapability(node, capability) {
    const capabilities = node.capabilities ?? [];
    const existingIndex = capabilities.findIndex(c => c.capabilityId === capability.capabilityId);
    const updatedCapabilities = existingIndex >= 0
        ? [...capabilities.slice(0, existingIndex), capability, ...capabilities.slice(existingIndex + 1)]
        : [...capabilities, capability];
    return {
        ...node,
        capabilities: updatedCapabilities,
        updatedAt: new Date()
    };
}
/**
 * Check if node is healthy
 */
export function isNodeHealthy(node) {
    return node.operationalState === 'HEALTHY' && node.health.status === 'HEALTHY';
}
/**
 * Check if node is operational (not failed)
 */
export function isNodeOperational(node) {
    return node.operationalState !== 'FAILED' && node.lifecycle === 'ACTIVE';
}
/**
 * Check if node has critical issues
 */
export function hasNodeCriticalIssues(node) {
    return (node.operationalState === 'FAILED' ||
        node.health.status === 'CRITICAL' ||
        node.security.status === 'COMPROMISED');
}
/**
 * Get effective node status for display
 */
export function getNodeEffectiveStatus(node) {
    if (node.lifecycle !== 'ACTIVE') {
        return 'offline';
    }
    if (node.operationalState === 'FAILED' || node.health.status === 'CRITICAL') {
        return 'critical';
    }
    if (node.operationalState === 'DEGRADED' || node.health.status === 'DEGRADED') {
        return 'warning';
    }
    if (node.operationalState === 'HEALTHY' && node.health.status === 'HEALTHY') {
        return 'healthy';
    }
    return 'unknown';
}
