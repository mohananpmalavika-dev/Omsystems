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
} from './capability-registry';

export {
  SYSTEM_CAPABILITIES,
  initializeCapabilities,
  getCapabilitiesByTier,
  getCapabilitiesByCategory,
  getCapabilityStats,
} from './capability-definitions';

// Re-export security collectors
export { BaseEvidenceCollector, EvidenceSource } from './collectors/base-evidence-collector';
export { CertificateCollector } from './collectors/certificate-collector';
export { PasswordRotationCollector } from './collectors/password-rotation-collector';
export { MFAComplianceCollector } from './collectors/mfa-compliance-collector';
export { TPMAttestationCollector } from './collectors/tpm-attestation-collector';
export { TamperDetectionCollector } from './collectors/tamper-detection-collector';
export { RansomwareDetectorCollector } from './collectors/ransomware-detector-collector';
export { FirmwareVerificationCollector } from './collectors/firmware-verification-collector';
export { CollectorRegistry, getCollectorRegistry } from './collectors/collector-registry';
