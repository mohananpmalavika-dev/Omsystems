/**
 * Digital Twin Relationship Models
 *
 * Defines connections and dependencies between infrastructure assets.
 */
/**
 * Relationship builder
 */
export class RelationshipBuilder {
    relationship;
    constructor(sourceId, targetId, type) {
        this.relationship = {
            id: `rel_${sourceId}_${targetId}_${type}_${Date.now()}`,
            sourceId,
            targetId,
            type,
            criticality: 'medium',
            createdAt: new Date()
        };
    }
    withCriticality(criticality) {
        this.relationship.criticality = criticality;
        return this;
    }
    withMetadata(metadata) {
        this.relationship.metadata = metadata;
        return this;
    }
    build() {
        return this.relationship;
    }
}
/**
 * Helper functions to create common relationships
 */
export function createConnection(sourceId, targetId, options) {
    return new RelationshipBuilder(sourceId, targetId, 'connected_to')
        .withCriticality(options?.criticality || 'high')
        .withMetadata(options?.metadata || {})
        .build();
}
export function createRecordingRelationship(cameraId, recorderId, options) {
    return new RelationshipBuilder(cameraId, recorderId, 'records_to')
        .withCriticality(options?.criticality || 'critical')
        .withMetadata(options?.metadata || {})
        .build();
}
export function createStorageRelationship(recorderId, storageId, options) {
    return new RelationshipBuilder(recorderId, storageId, 'stores_on')
        .withCriticality(options?.criticality || 'critical')
        .withMetadata(options?.metadata || {})
        .build();
}
export function createDependency(sourceId, targetId, criticality = 'medium') {
    return new RelationshipBuilder(sourceId, targetId, 'depends_on')
        .withCriticality(criticality)
        .build();
}
export function createUplinkRelationship(deviceId, uplinkId, criticality = 'high') {
    return new RelationshipBuilder(deviceId, uplinkId, 'uplink_to')
        .withCriticality(criticality)
        .build();
}
/**
 * Determine if a relationship type represents a critical dependency
 */
export function isDependencyRelationship(type) {
    return [
        'depends_on',
        'connected_to',
        'records_to',
        'stores_on',
        'routes_through',
        'powered_by',
        'authenticates_via'
    ].includes(type);
}
/**
 * Get relationship directionality for impact analysis
 */
export function isDownstreamDependency(type) {
    // These relationships indicate the source depends on the target
    return [
        'depends_on',
        'connected_to',
        'records_to',
        'stores_on',
        'routes_through',
        'powered_by',
        'authenticates_via',
        'uplink_to'
    ].includes(type);
}
