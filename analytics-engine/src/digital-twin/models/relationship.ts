/**
 * Digital Twin Relationship Models
 * 
 * Defines connections and dependencies between infrastructure assets.
 */

export type RelationshipType =
  // Hierarchy
  | 'contains'
  | 'located_in'
  
  // Physical connectivity
  | 'connected_to'
  | 'powered_by'
  | 'uplink_to'
  | 'routes_through'
  
  // Functional dependencies
  | 'depends_on'
  | 'records_to'
  | 'stores_on'
  | 'managed_by'
  | 'authenticates_via'
  
  // Service relationships
  | 'monitors'
  | 'backs_up'
  | 'replicates_to';

export type RelationshipCriticality = 'low' | 'medium' | 'high' | 'critical';

export interface TwinRelationship {
  id: string;
  
  // Connection
  sourceId: string;
  targetId: string;
  
  // Type
  type: RelationshipType;
  
  // Impact assessment
  criticality: RelationshipCriticality;
  
  // Optional metadata
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Relationship metadata for specific types
 */
export interface NetworkConnectionMetadata {
  port?: string | number;
  vlan?: number;
  bandwidth?: string;
  protocol?: string;
}

export interface RecordingRelationshipMetadata {
  channel?: number;
  recordingMode?: 'continuous' | 'motion' | 'scheduled';
  quality?: string;
  fps?: number;
}

export interface StorageRelationshipMetadata {
  retentionDays?: number;
  redundancy?: boolean;
  compressionRatio?: number;
}

/**
 * Relationship builder
 */
export class RelationshipBuilder {
  private relationship: Partial<TwinRelationship>;
  
  constructor(sourceId: string, targetId: string, type: RelationshipType) {
    this.relationship = {
      id: `rel_${sourceId}_${targetId}_${type}_${Date.now()}`,
      sourceId,
      targetId,
      type,
      criticality: 'medium',
      createdAt: new Date()
    };
  }
  
  withCriticality(criticality: RelationshipCriticality): this {
    this.relationship.criticality = criticality;
    return this;
  }
  
  withMetadata(metadata: Record<string, unknown>): this {
    this.relationship.metadata = metadata;
    return this;
  }
  
  build(): TwinRelationship {
    return this.relationship as TwinRelationship;
  }
}

/**
 * Helper functions to create common relationships
 */
export function createConnection(
  sourceId: string,
  targetId: string,
  options?: {
    criticality?: RelationshipCriticality;
    metadata?: NetworkConnectionMetadata;
  }
): TwinRelationship {
  return new RelationshipBuilder(sourceId, targetId, 'connected_to')
    .withCriticality(options?.criticality || 'high')
    .withMetadata(options?.metadata || {})
    .build();
}

export function createRecordingRelationship(
  cameraId: string,
  recorderId: string,
  options?: {
    criticality?: RelationshipCriticality;
    metadata?: RecordingRelationshipMetadata;
  }
): TwinRelationship {
  return new RelationshipBuilder(cameraId, recorderId, 'records_to')
    .withCriticality(options?.criticality || 'critical')
    .withMetadata(options?.metadata || {})
    .build();
}

export function createStorageRelationship(
  recorderId: string,
  storageId: string,
  options?: {
    criticality?: RelationshipCriticality;
    metadata?: StorageRelationshipMetadata;
  }
): TwinRelationship {
  return new RelationshipBuilder(recorderId, storageId, 'stores_on')
    .withCriticality(options?.criticality || 'critical')
    .withMetadata(options?.metadata || {})
    .build();
}

export function createDependency(
  sourceId: string,
  targetId: string,
  criticality: RelationshipCriticality = 'medium'
): TwinRelationship {
  return new RelationshipBuilder(sourceId, targetId, 'depends_on')
    .withCriticality(criticality)
    .build();
}

export function createUplinkRelationship(
  deviceId: string,
  uplinkId: string,
  criticality: RelationshipCriticality = 'high'
): TwinRelationship {
  return new RelationshipBuilder(deviceId, uplinkId, 'uplink_to')
    .withCriticality(criticality)
    .build();
}

/**
 * Determine if a relationship type represents a critical dependency
 */
export function isDependencyRelationship(type: RelationshipType): boolean {
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
export function isDownstreamDependency(type: RelationshipType): boolean {
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
