/**
 * Certificate Authority Provider Interface
 * Pluggable abstraction for different CA implementations
 */

import {
  CertificateAuthorityProviderType,
  CertificateAuthorityCapabilities,
  CertificateAuthorityHealth,
  SubmitCertificateRequest,
  CertificateRequestSubmission,
  CertificateRequestStatusRequest,
  CertificateRequestStatus,
  RetrieveCertificateRequest,
  IssuedCertificate,
  RevokeCertificateRequest,
  RevocationResult,
  RevocationStatusRequest,
  RevocationStatusResult
} from '../domain/certificate-lifecycle.types.js';

/**
 * Certificate Authority Provider Interface
 * 
 * All CA implementations (ACME, ADCS, Vault, Venafi, Manual) must implement this interface.
 * The interface normalizes different CA protocols into a consistent application-level contract.
 */
export interface CertificateAuthorityProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: CertificateAuthorityProviderType;

  /**
   * Provider capabilities - what operations does this CA support?
   */
  readonly capabilities: CertificateAuthorityCapabilities;

  /**
   * Submit a certificate signing request to the CA
   * 
   * @param request - Certificate request with CSR and metadata
   * @returns Submission result - may be synchronous (ISSUED) or asynchronous (PENDING)
   * 
   * Implementation notes:
   * - MUST be idempotent using request.idempotencyKey
   * - MUST validate CSR before submission
   * - SHOULD return ISSUED immediately if CA supports synchronous issuance
   * - SHOULD return PENDING for asynchronous CAs with polling support
   * - MUST return MANUAL_ACTION_REQUIRED for offline/manual CAs
   */
  submitCertificateRequest(
    request: SubmitCertificateRequest
  ): Promise<CertificateRequestSubmission>;

  /**
   * Check the status of a previously submitted certificate request
   * 
   * @param request - Status request with provider request ID
   * @returns Current status of the certificate request
   * 
   * Implementation notes:
   * - Only required if capabilities.supportsPolling is true
   * - MUST handle unknown request IDs gracefully
   * - SHOULD cache results to avoid excessive API calls
   */
  getCertificateRequestStatus(
    request: CertificateRequestStatusRequest
  ): Promise<CertificateRequestStatus>;

  /**
   * Retrieve an issued certificate
   * 
   * @param request - Retrieval request with provider request ID
   * @returns Issued certificate with full chain
   * 
   * Implementation notes:
   * - MUST include full certificate chain
   * - MUST verify certificate matches original CSR
   * - SHOULD include CA-specific metadata
   */
  retrieveIssuedCertificate(
    request: RetrieveCertificateRequest
  ): Promise<IssuedCertificate>;

  /**
   * Revoke a previously issued certificate
   * 
   * @param request - Revocation request with reason
   * @returns Revocation result
   * 
   * Implementation notes:
   * - Only required if capabilities.automaticRevocation is true
   * - MUST be idempotent
   * - SHOULD verify certificate was issued by this CA
   * - MUST update OCSP/CRL if supported
   */
  revokeCertificate(
    request: RevokeCertificateRequest
  ): Promise<RevocationResult>;

  /**
   * Check the revocation status of a certificate
   * 
   * @param request - Status request with serial number and issuer
   * @returns Revocation status from OCSP, CRL, or CA API
   * 
   * Implementation notes:
   * - Optional method - only implement if CA provides API access
   * - SHOULD prefer OCSP over CRL
   * - MUST distinguish between GOOD, REVOKED, and UNKNOWN
   * - MUST NOT return GOOD if status cannot be determined
   */
  getRevocationStatus?(
    request: RevocationStatusRequest
  ): Promise<RevocationStatusResult>;

  /**
   * Perform health check on the CA connection
   * 
   * @returns Health status with connectivity, authentication, and latency info
   * 
   * Implementation notes:
   * - MUST verify network reachability
   * - MUST verify authentication credentials
   * - SHOULD verify authorization/permissions
   * - SHOULD measure latency
   * - MUST NOT throw errors - return UNAVAILABLE state instead
   */
  healthCheck(): Promise<CertificateAuthorityHealth>;

  /**
   * Initialize the provider with configuration
   * 
   * @param config - Provider-specific configuration
   * 
   * Implementation notes:
   * - Called once during provider instantiation
   * - MUST validate configuration
   * - SHOULD establish persistent connections
   * - SHOULD NOT throw for temporary network issues
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * Cleanup resources and close connections
   * 
   * Implementation notes:
   * - Called during shutdown
   * - SHOULD close all connections
   * - MUST complete gracefully
   */
  shutdown(): Promise<void>;
}

/**
 * Provider factory interface
 */
export interface CertificateAuthorityProviderFactory {
  /**
   * Create a provider instance
   */
  createProvider(
    type: CertificateAuthorityProviderType,
    config: Record<string, any>
  ): Promise<CertificateAuthorityProvider>;

  /**
   * Get list of supported provider types
   */
  getSupportedTypes(): CertificateAuthorityProviderType[];
}
