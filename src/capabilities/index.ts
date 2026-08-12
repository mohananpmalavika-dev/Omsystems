/**
 * Capabilities Module
 * Exposes system capability tiers and status tracking
 */

export {
  CapabilityRegistry,
  CapabilityTier,
  CapabilityStatus,
  getCapabilityRegistry,
  resetCapabilityRegistry,
  type CapabilityDefinition,
  type CapabilityCheck,
} from './capability-registry.js';

export {
  SYSTEM_CAPABILITIES,
  initializeCapabilities,
  getCapabilitiesByTier,
  getCapabilitiesByCategory,
  getCapabilityStats,
} from './capability-definitions.js';

// Re-export the real security collectors that exist in the project.
export { BaseEvidenceCollector, EvidenceSource } from '../security/collectors/base-evidence-collector.js';
export { CertificateCollector } from '../security/collectors/certificate-collector.js';
export { PasswordRotationCollector } from '../security/collectors/password-rotation-collector.js';
export { MFAComplianceCollector } from '../security/collectors/mfa-compliance-collector.js';
export { TPMAttestationCollector } from '../security/collectors/tpm-attestation-collector.js';
export { TamperDetectionCollector } from '../security/collectors/tamper-detection-collector.js';
export { RansomwareDetectorCollector } from '../security/collectors/ransomware-detector-collector.js';
export { FirmwareVerificationCollector } from '../security/collectors/firmware-verification-collector.js';
export { CollectorRegistry, getCollectorRegistry } from '../security/collectors/collector-registry.js';
