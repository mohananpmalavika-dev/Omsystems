/**
 * Twin Relationship Domain Model
 * 
 * Canonical edge representation in the Digital Twin graph.
 * Relationships capture dependencies, connections, and semantic links.
 */

import type {
  TwinRelationshipType,
  TwinRelationshipCriticality,
  TwinRelationshipSource,
  DependencySemantics
} from './twin-relationship-types.js';

/**
 * Canonical Twin Relationship (Edge)
 * 
 * Represents a directed relationship between two nodes in the graph
 */
export interface TwinRelationship {
  /** Unique relationship identifier */
  id: string;
  
  /** Multi-tenant scope */
  tenantId: string;
  
  /** Source node ID (the node that has the dependency) */
  sourceNodeId: string;
  
  /** Target node ID (the node being depended upon) */
  targetNodeId: string;
  
  /** Relationship type (DEPENDS_ON, CONNECTED_TO, RECORDED_BY, etc.) */
  type: TwinRelationshipType;
  
  /** Impact criticality if this relationship fails */
  criticality: TwinRelationshipCriticality;
  
  /** Confidence in this relationship (0.0 to 1.0) */
  confidence: number;
  
  /** How was this relationship established? */
  source: TwinRelationshipSource;
  
  /** Dependency semantics for impact analysis */
  dependencySemantics?: DependencySemantics;
  
  /** When does this relationship become valid? */
  validFrom: Date;
  
  /** When does this relationship expire? (null = indefinite) */
  validUntil?: Date;
  
  /** Relationship-specific metadata */
  metadata?: Record<string, unknown>;
  
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  
  /** Soft delete support */
  deletedAt?: Date;
}

/**
 * Create a new Twin Relationship with defaults
 */
export function createTwinRelationship(
  id: string,
  tenantId: string,
  sourceNodeId: string,
  targetNodeId: string,
  type: TwinRelationshipType,
  options?: Partial<Omit<TwinRelationship, 'id' | 'tenantId' | 'sourceNodeId' | 'targetNodeId' | 'type' | 'createdAt' | 'updatedAt'>>
): TwinRelationship {
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
export function isRelationshipValid(relationship: TwinRelationship, at: Date = new Date()): boolean {
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
export function isHighConfidence(relationship: TwinRelationship): boolean {
  return relationship.confidence >= 0.8;
}

/**
 * Check if relationship is critical
 */
export function isCriticalRelationship(relationship: TwinRelationship): boolean {
  return relationship.criticality === 'CRITICAL';
}

/**
 * Get failure effect from dependency semantics
 */
export function getFailureEffect(relationship: TwinRelationship): 'UNAVAILABLE' | 'DEGRADED' | 'AT_RISK' | null {
  return relationship.dependencySemantics?.failureEffect ?? null;
}

/**
 * Check if relationship is required (not optional)
 */
export function isRequiredRelationship(relationship: TwinRelationship): boolean {
  return relationship.dependencySemantics?.required ?? true;
}

/**
 * Check if relationship is part of a redundancy group
 */
export function isRedundant(relationship: TwinRelationship): boolean {
  return !!relationship.dependencySemantics?.redundancyGroup;
}

/**
 * Update relationship confidence
 */
export function updateRelationshipConfidence(
  relationship: TwinRelationship,
  confidence: number,
  source?: TwinRelationshipSource
): TwinRelationship {
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
export function expireRelationship(
  relationship: TwinRelationship,
  expiryDate: Date = new Date()
): TwinRelationship {
  return {
    ...relationship,
    validUntil: expiryDate,
    updatedAt: new Date()
  };
}

/**
 * Update dependency semantics
 */
export function updateDependencySemantics(
  relationship: TwinRelationship,
  semantics: Partial<DependencySemantics>
): TwinRelationship {
  return {
    ...relationship,
    dependencySemantics: {
      ...relationship.dependencySemantics,
      ...semantics
    } as DependencySemantics,
    updatedAt: new Date()
  };
}

/**
 * Create a redundant relationship group
 * 
 * Example: Camera recorded by both NVR-1 and NVR-2 (minimum 1 healthy)
 */
export function createRedundantRelationships(
  tenantId: string,
  sourceNodeId: string,
  targetNodeIds: string[],
  type: TwinRelationshipType,
  minimumHealthy: number,
  options?: Partial<Omit<TwinRelationship, 'id' | 'tenantId' | 'sourceNodeId' | 'targetNodeId' | 'type' | 'dependencySemantics'>>
): TwinRelationship[] {
  const redundancyGroup = `redundancy_${sourceNodeId}_${Date.now()}`;
  
  return targetNodeIds.map((targetNodeId, index) =>
    createTwinRelationship(
      `rel_${sourceNodeId}_${targetNodeId}_${Date.now()}_${index}`,
      tenantId,
      sourceNodeId,
      targetNodeId,
      type,
      {
        ...options,
        dependencySemantics: {
          required: true,
          redundancyGroup,
          minimumHealthy,
          failureEffect: minimumHealthy === targetNodeIds.length ? 'UNAVAILABLE' : 'DEGRADED',
          weight: 1.0 / targetNodeIds.length
        }
      }
    )
  );
}

/**
 * Relationship quality assessment
 */
export interface RelationshipQuality {
  /** Is this relationship trustworthy? */
  trustworthy: boolean;
  
  /** Quality score 0-100 */
  qualityScore: number;
  
  /** Confidence level */
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Source reliability */
  sourceReliability: 'VERIFIED' | 'INFERRED' | 'UNCERTAIN';
  
  /** Should this relationship be verified? */
  needsVerification: boolean;
  
  /** Reason for quality assessment */
  reason?: string;
}

/**
 * Assess relationship quality
 */
export function assessRelationshipQuality(relationship: TwinRelationship): RelationshipQuality {
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
  let sourceReliability: RelationshipQuality['sourceReliability'];
  let baseScore: number;
  
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
  let confidenceLevel: RelationshipQuality['confidenceLevel'];
  if (relationship.confidence >= 0.8) {
    confidenceLevel = 'HIGH';
  } else if (relationship.confidence >= 0.5) {
    confidenceLevel = 'MEDIUM';
  } else {
    confidenceLevel = 'LOW';
  }
  
  // Determine if verification needed
  const needsVerification = 
    relationship.confidence < 0.7 ||
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
