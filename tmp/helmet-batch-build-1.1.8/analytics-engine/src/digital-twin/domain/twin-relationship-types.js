/**
 * Twin Relationship Types
 *
 * Canonical edge types representing dependencies, connections,
 * and semantic relationships in the Digital Twin graph.
 */
/**
 * Relationship semantics registry
 *
 * Defines how each relationship type behaves during impact analysis
 */
export const RELATIONSHIP_SEMANTICS = {
    // Structural
    CONTAINS: {
        failurePropagation: 'NONE',
        category: 'structural',
        description: 'Hierarchical containment'
    },
    LOCATED_AT: {
        failurePropagation: 'NONE',
        category: 'structural',
        description: 'Physical location'
    },
    BELONGS_TO: {
        failurePropagation: 'NONE',
        category: 'structural',
        description: 'Organizational ownership'
    },
    PART_OF: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'structural',
        description: 'Component relationship'
    },
    // Network
    CONNECTED_TO: {
        failurePropagation: 'BIDIRECTIONAL',
        category: 'network',
        description: 'Direct network connection'
    },
    CONNECTED_THROUGH: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'network',
        description: 'Network path dependency'
    },
    ROUTES_THROUGH: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'network',
        description: 'Routing dependency'
    },
    UPLINKS_TO: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'network',
        description: 'Network uplink'
    },
    VLAN_MEMBER: {
        failurePropagation: 'NONE',
        category: 'network',
        description: 'VLAN membership'
    },
    // Power
    POWERED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'power',
        description: 'Power dependency'
    },
    BACKED_UP_BY: {
        failurePropagation: 'NONE',
        category: 'power',
        description: 'Backup power source'
    },
    // Video
    RECORDED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'video',
        description: 'Recording dependency'
    },
    USES_CHANNEL: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'video',
        description: 'Recorder channel usage'
    },
    STREAMS_TO: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'video',
        description: 'Video streaming'
    },
    ENCODES_FOR: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'video',
        description: 'Video encoding'
    },
    DECODES_FOR: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'video',
        description: 'Video decoding'
    },
    // Storage
    STORES_ON: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'storage',
        description: 'Storage dependency'
    },
    MIRRORS_TO: {
        failurePropagation: 'NONE',
        category: 'storage',
        description: 'Storage mirroring'
    },
    REPLICATES_TO: {
        failurePropagation: 'NONE',
        category: 'storage',
        description: 'Data replication'
    },
    // Security
    AUTHENTICATED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'security',
        description: 'Authentication dependency'
    },
    PROTECTED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'security',
        description: 'Security protection'
    },
    CONTROLS_ACCESS_TO: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'security',
        description: 'Access control'
    },
    SECURES: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'security',
        description: 'Security coverage'
    },
    // Management
    MANAGED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'management',
        description: 'Management dependency'
    },
    MONITORS: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'management',
        description: 'Monitoring relationship'
    },
    CONFIGURED_BY: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'management',
        description: 'Configuration dependency'
    },
    REPORTS_TO: {
        failurePropagation: 'NONE',
        category: 'management',
        description: 'Telemetry reporting'
    },
    // Business
    PROVIDES_EVIDENCE_FOR: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'business',
        description: 'Evidence provision'
    },
    COVERS: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'business',
        description: 'Area coverage'
    },
    MONITORS_ZONE: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'business',
        description: 'Zone monitoring'
    },
    SUPPORTS_CAPABILITY: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'business',
        description: 'Capability support'
    },
    REQUIRES_COVERAGE: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'business',
        description: 'Coverage requirement'
    },
    REQUIRES_EVIDENCE: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'business',
        description: 'Evidence requirement'
    },
    // Policy
    GOVERNED_BY: {
        failurePropagation: 'NONE',
        category: 'policy',
        description: 'Policy governance'
    },
    SUBJECT_TO: {
        failurePropagation: 'NONE',
        category: 'policy',
        description: 'Compliance requirement'
    },
    AUDITED_BY: {
        failurePropagation: 'NONE',
        category: 'policy',
        description: 'Audit relationship'
    },
    // Dependency
    DEPENDS_ON: {
        failurePropagation: 'TARGET_TO_SOURCE',
        category: 'dependency',
        description: 'Operational dependency'
    },
    REQUIRED_FOR: {
        failurePropagation: 'SOURCE_TO_TARGET',
        category: 'dependency',
        description: 'Requirement relationship'
    },
    FAILS_WITH: {
        failurePropagation: 'BIDIRECTIONAL',
        category: 'dependency',
        description: 'Correlated failure'
    }
};
/**
 * Get failure propagation direction for a relationship type
 */
export function getFailurePropagation(type) {
    return RELATIONSHIP_SEMANTICS[type].failurePropagation;
}
/**
 * Get relationship category
 */
export function getRelationshipCategory(type) {
    return RELATIONSHIP_SEMANTICS[type].category;
}
/**
 * Check if relationship is structural (no failure propagation)
 */
export function isStructuralRelationship(type) {
    return getRelationshipCategory(type) === 'structural';
}
/**
 * Check if relationship is operational (can propagate failures)
 */
export function isOperationalRelationship(type) {
    const propagation = getFailurePropagation(type);
    return propagation !== 'NONE';
}
/**
 * Check if relationship is business-semantic
 */
export function isBusinessRelationship(type) {
    return getRelationshipCategory(type) === 'business';
}
