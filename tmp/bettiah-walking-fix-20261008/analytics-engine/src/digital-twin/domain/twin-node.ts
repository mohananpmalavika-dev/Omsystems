/**
 * Twin Node Domain Model
 * 
 * Canonical node representation in the Digital Twin graph.
 * This is the authoritative model for all infrastructure elements.
 */

import type {
  TwinNodeType,
  TwinNodeLifecycle,
  TwinNodeOperationalState,
  TwinNodeCriticality
} from './twin-node-types.js';

/**
 * External reference to domain-specific record
 * 
 * The Twin doesn't duplicate full device records; it references
 * the authoritative domain service (camera service, recorder service, etc.)
 */
export interface TwinNodeExternalRef {
  /** Domain service that owns this record (camera, recorder, network, etc.) */
  domain: string;
  
  /** Primary key in the domain service */
  id: string;
  
  /** Optional table name for direct database queries */
  table?: string;
}

/**
 * Capability attached to a node
 * 
 * Links to the AI capability catalog
 */
export interface TwinNodeCapability {
  /** Capability ID from capability-catalog.ts */
  capabilityId: string;
  
  /** Is this capability currently available? */
  status: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_PROVISIONED';
  
  /** Why is this capability in its current state? */
  reason?: string;
  
  /** Model or detector required */
  requiredModel?: string;
  
  /** Is the model provisioned and healthy? */
  modelProvisioned?: boolean;
  
  /** Configuration required? */
  configurationRequired?: boolean;
  
  /** Last checked timestamp */
  lastChecked?: Date;
}

/**
 * Canonical Twin Node
 * 
 * Represents any infrastructure element in the dependency graph
 */
export interface TwinNode {
  /** Unique node identifier (prefixed by type: camera_cam123, switch_sw456) */
  id: string;
  
  /** Multi-tenant scope */
  tenantId: string;
  
  /** Node type (CAMERA, NVR, SWITCH, ATM_SURVEILLANCE, etc.) */
  type: TwinNodeType;
  
  /** Reference to domain-specific record (optional, Twin can be standalone) */
  externalRef?: TwinNodeExternalRef;
  
  /** Human-readable name */
  name: string;
  
  /** Lifecycle state */
  lifecycle: TwinNodeLifecycle;
  
  /** Current operational state */
  operationalState: TwinNodeOperationalState;
  
  /** When was operational state last observed? */
  observedAt?: Date;
  
  /** Business criticality level */
  criticality: TwinNodeCriticality;
  
  /** Physical location (Branch ID, floor, zone) */
  location?: {
    branchId?: string;
    buildingId?: string;
    floorId?: string;
    zoneId?: string;
    coordinates?: {
      latitude?: number;
      longitude?: number;
    };
  };
  
  /** Health assessment */
  health: {
    /** Overall health score 0-100 */
    score: number;
    
    /** Health status */
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
    
    /** Active health issues */
    issues: string[];
    
    /** Health metrics (uptime, latency, packet loss, etc.) */
    metrics?: Record<string, number>;
    
    /** Last health check */
    lastCheck?: Date;
  };
  
  /** Security posture */
  security: {
    /** Overall security score 0-100 */
    score: number;
    
    /** Security status */
    status: 'SECURE' | 'VULNERABLE' | 'COMPROMISED' | 'UNKNOWN';
    
    /** Active security issues */
    issues: string[];
    
    /** Security attributes (firmware, certificates, encryption, etc.) */
    attributes?: {
      firmwareVersion?: string;
      firmwareUpToDate?: boolean;
      certificateValid?: boolean;
      certificateExpiry?: Date;
      encryptionEnabled?: boolean;
      tlsVersion?: string;
      defaultCredentials?: boolean;
      lastPasswordChange?: Date;
      secureBootEnabled?: boolean;
      tpmPresent?: boolean;
      attestationValid?: boolean;
    };
    
    /** Last security audit */
    lastAudit?: Date;
  };
  
  /** AI capabilities available on this node */
  capabilities?: TwinNodeCapability[];
  
  /** Type-specific attributes (IP, model, firmware, channel count, etc.) */
  attributes: Record<string, unknown>;
  
  /** Compliance flags */
  compliance?: {
    /** Is this node subject to compliance requirements? */
    required: boolean;
    
    /** Compliance standards (PCI-DSS, GDPR, HIPAA, etc.) */
    standards?: string[];
    
    /** Current compliance status */
    status?: 'COMPLIANT' | 'NON_COMPLIANT' | 'UNKNOWN';
    
    /** Compliance issues */
    issues?: string[];
  };
  
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  
  /** Soft delete support */
  deletedAt?: Date;
}

/**
 * Create a new Twin Node with defaults
 */
export function createTwinNode(
  id: string,
  tenantId: string,
  type: TwinNodeType,
  name: string,
  options?: Partial<Omit<TwinNode, 'id' | 'tenantId' | 'type' | 'name' | 'createdAt' | 'updatedAt'>>
): TwinNode {
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
export function updateNodeOperationalState(
  node: TwinNode,
  newState: TwinNodeOperationalState,
  observedAt: Date = new Date()
): TwinNode {
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
export function updateNodeHealth(
  node: TwinNode,
  health: Partial<TwinNode['health']>
): TwinNode {
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
export function updateNodeSecurity(
  node: TwinNode,
  security: Partial<TwinNode['security']>
): TwinNode {
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
export function setNodeCapability(
  node: TwinNode,
  capability: TwinNodeCapability
): TwinNode {
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
export function isNodeHealthy(node: TwinNode): boolean {
  return node.operationalState === 'HEALTHY' && node.health.status === 'HEALTHY';
}

/**
 * Check if node is operational (not failed)
 */
export function isNodeOperational(node: TwinNode): boolean {
  return node.operationalState !== 'FAILED' && node.lifecycle === 'ACTIVE';
}

/**
 * Check if node has critical issues
 */
export function hasNodeCriticalIssues(node: TwinNode): boolean {
  return (
    node.operationalState === 'FAILED' ||
    node.health.status === 'CRITICAL' ||
    node.security.status === 'COMPROMISED'
  );
}

/**
 * Get effective node status for display
 */
export function getNodeEffectiveStatus(node: TwinNode): 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown' {
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
