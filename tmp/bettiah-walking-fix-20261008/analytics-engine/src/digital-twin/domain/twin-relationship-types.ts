/**
 * Twin Relationship Types
 * 
 * Canonical edge types representing dependencies, connections,
 * and semantic relationships in the Digital Twin graph.
 */

/**
 * Structural relationships (organizational hierarchy)
 */
export type StructuralRelationType =
  | 'CONTAINS'          // Parent contains child (Branch contains Camera)
  | 'LOCATED_AT'        // Physical location (Camera located at Branch)
  | 'BELONGS_TO'        // Ownership/membership (Device belongs to Organization)
  | 'PART_OF';          // Component relationship (Disk part of Storage Array)

/**
 * Network connectivity relationships
 */
export type NetworkRelationType =
  | 'CONNECTED_TO'      // Direct network connection
  | 'CONNECTED_THROUGH' // Indirect connection via intermediary
  | 'ROUTES_THROUGH'    // Traffic routing dependency
  | 'UPLINKS_TO'        // Network uplink dependency
  | 'VLAN_MEMBER';      // VLAN membership

/**
 * Power dependency relationships
 */
export type PowerRelationType =
  | 'POWERED_BY'        // Device powered by power source
  | 'BACKED_UP_BY';     // Backup power source

/**
 * Video infrastructure relationships
 */
export type VideoRelationType =
  | 'RECORDED_BY'       // Camera recorded by NVR/DVR
  | 'USES_CHANNEL'      // Uses a specific recorder channel
  | 'STREAMS_TO'        // Streams video to destination
  | 'ENCODES_FOR'       // Encoder serves camera
  | 'DECODES_FOR';      // Decoder serves display

/**
 * Storage relationships
 */
export type StorageRelationType =
  | 'STORES_ON'         // Data stored on storage device
  | 'MIRRORS_TO'        // Data mirrored to redundant storage
  | 'REPLICATES_TO';    // Data replicated to backup

/**
 * Security and access relationships
 */
export type SecurityRelationType =
  | 'AUTHENTICATED_BY'  // Authentication dependency
  | 'PROTECTED_BY'      // Security protection dependency
  | 'CONTROLS_ACCESS_TO' // Access control relationship
  | 'SECURES';          // Security coverage

/**
 * Management and control relationships
 */
export type ManagementRelationType =
  | 'MANAGED_BY'        // Device managed by controller
  | 'MONITORS'          // Monitoring relationship
  | 'CONFIGURED_BY'     // Configuration dependency
  | 'REPORTS_TO';       // Telemetry reporting

/**
 * Business capability relationships
 */
export type BusinessRelationType =
  | 'PROVIDES_EVIDENCE_FOR'    // Camera provides evidence for ATM
  | 'COVERS'                    // Camera covers physical area
  | 'MONITORS_ZONE'             // Device monitors security zone
  | 'SUPPORTS_CAPABILITY'       // Infrastructure supports business capability
  | 'REQUIRES_COVERAGE'         // Business asset requires camera coverage
  | 'REQUIRES_EVIDENCE';        // Compliance requires evidence chain

/**
 * Policy and compliance relationships
 */
export type PolicyRelationType =
  | 'GOVERNED_BY'       // Governed by policy
  | 'SUBJECT_TO'        // Subject to compliance requirement
  | 'AUDITED_BY';       // Audited by compliance system

/**
 * Dependency relationships (operational)
 */
export type DependencyRelationType =
  | 'DEPENDS_ON'        // Generic operational dependency
  | 'REQUIRED_FOR'      // Required for operation
  | 'FAILS_WITH';       // Correlated failure

/**
 * All relationship types in the Digital Twin
 */
export type TwinRelationshipType =
  | StructuralRelationType
  | NetworkRelationType
  | PowerRelationType
  | VideoRelationType
  | StorageRelationType
  | SecurityRelationType
  | ManagementRelationType
  | BusinessRelationType
  | PolicyRelationType
  | DependencyRelationType;

/**
 * Relationship criticality (impact if this relationship fails)
 */
export type TwinRelationshipCriticality =
  | 'CRITICAL'          // Service unavailable
  | 'HIGH'              // Major degradation
  | 'MEDIUM'            // Minor degradation
  | 'LOW';              // Minimal impact

/**
 * Relationship provenance (how was this relationship established)
 */
export type TwinRelationshipSource =
  | 'DISCOVERY'         // Automatically discovered (ONVIF, SNMP, etc.)
  | 'CONFIGURATION'     // Explicitly configured by operator
  | 'TELEMETRY'         // Inferred from telemetry data
  | 'OPERATOR'          // Manually created by operator
  | 'INFERRED'          // Algorithmically inferred
  | 'IMPORTED';         // Imported from external system

/**
 * Failure propagation semantics for each relationship type
 */
export type FailurePropagation =
  | 'TARGET_TO_SOURCE'  // If target fails, source affected (DEPENDS_ON)
  | 'SOURCE_TO_TARGET'  // If source fails, target affected (PROVIDES_EVIDENCE_FOR)
  | 'BIDIRECTIONAL'     // Failures propagate both ways
  | 'NONE';             // No failure propagation

/**
 * Dependency semantics for impact analysis
 */
export interface DependencySemantics {
  /** Is this relationship required for operation? */
  required: boolean;
  
  /** Redundancy group (if part of redundant set) */
  redundancyGroup?: string;
  
  /** Minimum healthy relationships in redundancy group */
  minimumHealthy?: number;
  
  /** Effect when dependency fails */
  failureEffect: 'UNAVAILABLE' | 'DEGRADED' | 'AT_RISK';
  
  /** Weight for impact calculation (0.0 to 1.0) */
  weight?: number;
}

/**
 * Relationship semantics registry
 * 
 * Defines how each relationship type behaves during impact analysis
 */
export const RELATIONSHIP_SEMANTICS: Record<TwinRelationshipType, {
  failurePropagation: FailurePropagation;
  category: string;
  description: string;
}> = {
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
export function getFailurePropagation(type: TwinRelationshipType): FailurePropagation {
  return RELATIONSHIP_SEMANTICS[type].failurePropagation;
}

/**
 * Get relationship category
 */
export function getRelationshipCategory(type: TwinRelationshipType): string {
  return RELATIONSHIP_SEMANTICS[type].category;
}

/**
 * Check if relationship is structural (no failure propagation)
 */
export function isStructuralRelationship(type: TwinRelationshipType): boolean {
  return getRelationshipCategory(type) === 'structural';
}

/**
 * Check if relationship is operational (can propagate failures)
 */
export function isOperationalRelationship(type: TwinRelationshipType): boolean {
  const propagation = getFailurePropagation(type);
  return propagation !== 'NONE';
}

/**
 * Check if relationship is business-semantic
 */
export function isBusinessRelationship(type: TwinRelationshipType): boolean {
  return getRelationshipCategory(type) === 'business';
}
