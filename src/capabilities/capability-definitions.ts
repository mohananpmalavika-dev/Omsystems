/**
 * Capability Definitions
 * Comprehensive list of all system capabilities with their tier classification
 */

import {
  CapabilityDefinition,
  CapabilityTier,
  CapabilityStatus,
} from './capability-registry';

/**
 * All system capabilities
 * 
 * Tier Classification:
 * - REAL: Fully implemented, tested, deployed, connected to real data sources
 * - READY: Code exists and tested, but deployment/configuration pending
 * - PLANNED: UI/API exists, but actual backend logic is mock/simulation
 */
export const SYSTEM_CAPABILITIES: CapabilityDefinition[] = [
  // ============================================================================
  // SECURITY CAPABILITIES
  // ============================================================================
  {
    id: 'security.certificate_monitoring',
    name: 'Certificate Monitoring',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Real-time TLS certificate expiry monitoring and alerts',
    requiredCollectors: ['certificate'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.password_rotation',
    name: 'Password Rotation Tracking',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Tracks password age and enforces rotation policies',
    requiredCollectors: ['password-rotation'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.mfa_compliance',
    name: 'MFA Compliance Monitoring',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Monitors MFA enrollment and usage across users',
    requiredCollectors: ['mfa-compliance'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.secret_vault',
    name: 'Secret Vault with Access Control',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Encrypted secret storage with RBAC and audit logging',
    requiredServices: ['secret-vault', 'secret-access-control'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.audit_logging',
    name: 'Comprehensive Audit Logging',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Immutable audit logs for all security-sensitive operations',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.rbac',
    name: 'Role-Based Access Control',
    category: 'security',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Comprehensive RBAC with permission checking',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'security.tpm_attestation',
    name: 'TPM Device Attestation',
    category: 'security',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Hardware-backed device identity verification',
    requiredCollectors: ['tpm-attestation'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'security.tamper_detection',
    name: 'Physical Tamper Detection',
    category: 'security',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Detects physical tampering with edge devices',
    requiredCollectors: ['tamper-detection'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'security.ransomware_detection',
    name: 'Ransomware Detection',
    category: 'security',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Behavioral analysis for ransomware activity',
    requiredCollectors: ['ransomware-detector'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'security.firmware_verification',
    name: 'Firmware Integrity Verification',
    category: 'security',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Verifies firmware signatures and detects unauthorized changes',
    requiredCollectors: ['firmware-verification'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'security.siem_export',
    name: 'SIEM Integration',
    category: 'security',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Export security events to external SIEM platforms',
    requiredConfig: ['SIEM_ENDPOINT', 'SIEM_API_KEY'],
    metadata: {
      confidence: 0,
    },
  },

  // ============================================================================
  // ANALYTICS CAPABILITIES
  // ============================================================================
  {
    id: 'analytics.person_detection',
    name: 'Person Detection',
    category: 'analytics',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Real-time person detection from camera feeds',
    requiredServices: ['ai-inference-engine', 'yolo'],
    metadata: {
      version: '1.0.0',
      confidence: 95,
    },
  },
  {
    id: 'analytics.motion_detection',
    name: 'Motion Detection',
    category: 'analytics',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Video motion analysis and alerts',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'analytics.camera_health',
    name: 'Camera Health Monitoring',
    category: 'analytics',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Monitors camera connectivity, quality, and operational status',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'analytics.object_detection',
    name: 'Generic Object Detection',
    category: 'analytics',
    tier: CapabilityTier.READY,
    status: CapabilityStatus.INACTIVE,
    description: 'Multi-class object detection (vehicles, objects, etc.)',
    requiredServices: ['ai-inference-engine', 'yolo'],
    metadata: {
      version: '1.0.0',
      confidence: 80,
    },
  },
  {
    id: 'analytics.face_recognition',
    name: 'Face Recognition',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Face detection and re-identification',
    requiredServices: ['ai-inference-engine', 'face-recognition-model'],
    metadata: {
      confidence: 30,
    },
  },
  {
    id: 'analytics.anpr',
    name: 'License Plate Recognition (ANPR)',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Automatic Number Plate Recognition',
    requiredServices: ['ai-inference-engine', 'anpr-model'],
    metadata: {
      confidence: 20,
    },
  },
  {
    id: 'analytics.crowd_density',
    name: 'Crowd Density Analysis',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Real-time crowd counting and density heatmaps',
    requiredServices: ['ai-inference-engine', 'crowd-model'],
    metadata: {
      confidence: 25,
    },
  },
  {
    id: 'analytics.behavior_analysis',
    name: 'Behavioral Analysis',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Detect anomalous behavior patterns (loitering, fighting, etc.)',
    requiredServices: ['ai-inference-engine', 'behavior-model'],
    metadata: {
      confidence: 15,
    },
  },
  {
    id: 'analytics.fall_detection',
    name: 'Fall Detection',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Detects person falling for safety monitoring',
    requiredServices: ['ai-inference-engine', 'pose-estimation-model'],
    metadata: {
      confidence: 20,
    },
  },
  {
    id: 'analytics.helmet_detection',
    name: 'PPE/Helmet Detection',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Verifies personal protective equipment usage',
    requiredServices: ['ai-inference-engine', 'ppe-model'],
    metadata: {
      confidence: 30,
    },
  },
  {
    id: 'analytics.heatmap_generation',
    name: 'Activity Heatmap Generation',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Generates historical activity heatmaps',
    metadata: {
      confidence: 40,
    },
  },
  {
    id: 'analytics.reid_tracking',
    name: 'Person Re-Identification',
    category: 'analytics',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Track same person across multiple cameras',
    requiredServices: ['ai-inference-engine', 'reid-model', 'vector-store'],
    metadata: {
      confidence: 10,
    },
  },

  // ============================================================================
  // INFRASTRUCTURE CAPABILITIES
  // ============================================================================
  {
    id: 'infrastructure.onvif_discovery',
    name: 'ONVIF Camera Discovery',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Automatic discovery of ONVIF-compliant cameras',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.dvr_integration',
    name: 'DVR/NVR Integration',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Integration with analog DVR systems',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.recording_management',
    name: 'Recording Management',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Record, store, and retrieve camera footage',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.hls_streaming',
    name: 'HLS Live Streaming',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Real-time HLS video streaming from cameras',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.storage_health',
    name: 'Storage Health Monitoring',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Monitor disk usage and storage health',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.distributed_event_bus',
    name: 'Distributed Event Bus',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Redis-based event bus for multi-instance deployment',
    requiredConfig: ['REDIS_HOST', 'EVENT_BUS_MODE'],
    metadata: {
      version: '2.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.edge_agent',
    name: 'Edge Agent Deployment',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Lightweight edge agents for branch-level monitoring',
    metadata: {
      version: '1.0.0',
      confidence: 90,
    },
  },
  {
    id: 'infrastructure.multi_tenant',
    name: 'Multi-Tenant Architecture',
    category: 'infrastructure',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Complete tenant isolation and data segregation',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'infrastructure.ha_deployment',
    name: 'High Availability Deployment',
    category: 'infrastructure',
    tier: CapabilityTier.READY,
    status: CapabilityStatus.NOT_CONFIGURED,
    description: 'Multi-instance control plane with failover',
    requiredConfig: ['HA_MODE', 'REDIS_SENTINEL', 'POSTGRES_REPLICATION'],
    metadata: {
      confidence: 70,
    },
  },
  {
    id: 'infrastructure.disaster_recovery',
    name: 'Disaster Recovery',
    category: 'infrastructure',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Automated backup, restore, and DR testing',
    metadata: {
      confidence: 30,
    },
  },

  // ============================================================================
  // OPERATIONS CAPABILITIES
  // ============================================================================
  {
    id: 'operations.alert_management',
    name: 'Alert Management System',
    category: 'operations',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Complete alert lifecycle management',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'operations.notification_delivery',
    name: 'Multi-Channel Notification',
    category: 'operations',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Email, SMS, push, webhook notification delivery',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'operations.alert_counters',
    name: 'Backend Alert Counters',
    category: 'operations',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Cached backend aggregation for alert statistics',
    requiredServices: ['alert-counter-cache'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'operations.evidence_capture',
    name: 'Evidence Capture System',
    category: 'operations',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Automatic evidence capture and storage for alerts',
    metadata: {
      version: '1.0.0',
      confidence: 95,
    },
  },
  {
    id: 'operations.alert_correlation',
    name: 'Alert Correlation Engine',
    category: 'operations',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Correlate related alerts into incidents',
    requiredServices: ['alert-correlation-orchestrator'],
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'operations.incident_management',
    name: 'Incident Management',
    category: 'operations',
    tier: CapabilityTier.READY,
    status: CapabilityStatus.INACTIVE,
    description: 'Complete incident lifecycle from alert to resolution',
    metadata: {
      version: '0.8.0',
      confidence: 50,
    },
  },
  {
    id: 'operations.on_call_management',
    name: 'On-Call Management',
    category: 'operations',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Duty roster, escalation, and on-call scheduling',
    metadata: {
      confidence: 20,
    },
  },
  {
    id: 'operations.sla_tracking',
    name: 'SLA Tracking and Enforcement',
    category: 'operations',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Track response/resolution SLAs and auto-escalate',
    metadata: {
      confidence: 15,
    },
  },
  {
    id: 'operations.workload_balancing',
    name: 'Operator Workload Balancing',
    category: 'operations',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Automatically balance alerts across available operators',
    metadata: {
      confidence: 10,
    },
  },
  {
    id: 'operations.maintenance_windows',
    name: 'Maintenance Windows',
    category: 'operations',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Suppress alerts during scheduled maintenance',
    metadata: {
      confidence: 25,
    },
  },

  // ============================================================================
  // INTEGRATION CAPABILITIES
  // ============================================================================
  {
    id: 'integration.webhook_delivery',
    name: 'Webhook Integration',
    category: 'integration',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Push events to external webhooks',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'integration.rest_api',
    name: 'Comprehensive REST API',
    category: 'integration',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Full-featured REST API for all operations',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'integration.sse_streaming',
    name: 'Server-Sent Events (SSE)',
    category: 'integration',
    tier: CapabilityTier.REAL,
    status: CapabilityStatus.ACTIVE,
    description: 'Real-time event streaming via SSE',
    metadata: {
      version: '1.0.0',
      confidence: 100,
    },
  },
  {
    id: 'integration.saml_sso',
    name: 'SAML Single Sign-On',
    category: 'integration',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Enterprise SAML 2.0 SSO integration',
    requiredConfig: ['SAML_IDP_URL', 'SAML_CERT'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'integration.oidc',
    name: 'OpenID Connect (OIDC)',
    category: 'integration',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'OIDC authentication with Azure AD, Okta, etc.',
    requiredConfig: ['OIDC_ISSUER', 'OIDC_CLIENT_ID'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'integration.ldap_ad',
    name: 'LDAP/Active Directory',
    category: 'integration',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'User directory integration with LDAP/AD',
    requiredConfig: ['LDAP_HOST', 'LDAP_BIND_DN'],
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'integration.scim_provisioning',
    name: 'SCIM User Provisioning',
    category: 'integration',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'Automated user provisioning via SCIM 2.0',
    metadata: {
      confidence: 0,
    },
  },
  {
    id: 'integration.graphql_api',
    name: 'GraphQL API',
    category: 'integration',
    tier: CapabilityTier.PLANNED,
    status: CapabilityStatus.UNAVAILABLE,
    description: 'GraphQL interface for complex queries',
    metadata: {
      confidence: 0,
    },
  },
];

/**
 * Initialize capability registry with all system capabilities
 */
export function initializeCapabilities(registry: any): void {
  registry.registerMany(SYSTEM_CAPABILITIES);
}

/**
 * Get capabilities by tier (helper function)
 */
export function getCapabilitiesByTier(tier: CapabilityTier): CapabilityDefinition[] {
  return SYSTEM_CAPABILITIES.filter(c => c.tier === tier);
}

/**
 * Get capabilities by category (helper function)
 */
export function getCapabilitiesByCategory(category: CapabilityDefinition['category']): CapabilityDefinition[] {
  return SYSTEM_CAPABILITIES.filter(c => c.category === category);
}

/**
 * Statistics
 */
export function getCapabilityStats() {
  const real = SYSTEM_CAPABILITIES.filter(c => c.tier === CapabilityTier.REAL).length;
  const ready = SYSTEM_CAPABILITIES.filter(c => c.tier === CapabilityTier.READY).length;
  const planned = SYSTEM_CAPABILITIES.filter(c => c.tier === CapabilityTier.PLANNED).length;

  return {
    total: SYSTEM_CAPABILITIES.length,
    real,
    ready,
    planned,
    implementationRate: ((real / SYSTEM_CAPABILITIES.length) * 100).toFixed(1) + '%',
    readinessRate: (((real + ready) / SYSTEM_CAPABILITIES.length) * 100).toFixed(1) + '%',
  };
}
