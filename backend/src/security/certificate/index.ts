/**
 * Certificate Security Infrastructure
 * Real X.509 parsing, validation, and trust management
 */

// Types
export * from './types';

// Core components
export { X509Parser, x509Parser } from './x509-parser';
export { TimeValidator, timeValidator } from './time-validator';
export { TrustStore, trustStore } from './trust-store';
export { ChainValidator, chainValidator } from './chain-validator';
export { RevocationService, revocationService } from './revocation-service';
export { TLSDiscovery, tlsDiscovery, discoverDeviceCertificate } from './tls-discovery';
export { CertificateRepository, certificateRepository } from './certificate-repository';
export { CertificatePolicyEvaluator, certificatePolicyEvaluator } from './policy-evaluator';

// Main certificate manager
export { CertificateManager, certificateManager } from './certificate-manager';

// Security posture integration
export { SecurityPostureIntegration, securityPostureIntegration } from './security-posture-integration';

// Certificate change event handling
export { CertificateChangeEventHandler, certificateChangeEventHandler } from './change-event-handler';
