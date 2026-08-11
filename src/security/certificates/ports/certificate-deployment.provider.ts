/**
 * Certificate Deployment Provider Interface
 * Pluggable abstraction for deploying certificates to different targets
 */

import {
  CertificateTarget,
  CertificateTargetType,
  DeployCertificateRequest,
  CertificateDeploymentResult,
  RollbackCertificateRequest,
  ReloadResult
} from '../domain/certificate-lifecycle.types.js';

/**
 * Certificate Deployment Provider Interface
 * 
 * Abstracts certificate deployment across different target types:
 * - Web servers (NGINX, Apache)
 * - Kubernetes secrets
 * - Recorders, cameras, edge devices
 * - Load balancers
 * - Certificate stores (Windows, Java Keystore)
 * - File systems
 * 
 * Key principle: Deployment is separate from issuance.
 * A certificate isn't "deployed" just because it exists in the database.
 */
export interface CertificateDeploymentProvider {
  /**
   * Target type this provider handles
   */
  readonly targetType: CertificateTargetType;

  /**
   * Check if this provider can deploy to the specified target
   * 
   * @param target - Deployment target configuration
   * @returns true if this provider can handle the target
   * 
   * Implementation notes:
   * - Used by deployment orchestrator to select provider
   * - SHOULD validate target configuration structure
   * - MUST return false for unsupported configurations
   */
  supports(target: CertificateTarget): boolean;

  /**
   * Deploy a certificate to the target
   * 
   * @param request - Deployment request with certificate and target
   * @returns Deployment result with status
   * 
   * Implementation notes:
   * - MUST be idempotent
   * - SHOULD verify target is reachable before deployment
   * - MUST back up existing certificate if rollback is requested
   * - SHOULD verify certificate format is compatible with target
   * - For remote targets: MUST handle network errors gracefully
   * - MUST NOT mark as deployed if file copy succeeded but reload failed
   */
  deploy(
    request: DeployCertificateRequest
  ): Promise<CertificateDeploymentResult>;

  /**
   * Rollback to previous certificate
   * 
   * @param request - Rollback request with deployment ID
   * 
   * Implementation notes:
   * - Only called if deploy() with rollbackOnFailure=true failed
   * - MUST restore backed-up certificate
   * - SHOULD reload/restart service after rollback
   * - MUST be implemented if provider supports rollback
   */
  rollback?(request: RollbackCertificateRequest): Promise<void>;

  /**
   * Reload or restart the service to pick up new certificate
   * 
   * @param target - Target to reload
   * @returns Reload result indicating what action was taken
   * 
   * Implementation notes:
   * - MUST NOT return success if reload failed
   * - SHOULD distinguish between reload, restart, and reboot
   * - For NGINX: nginx -s reload
   * - For Kubernetes: may not be needed (automatic)
   * - For devices: may require reboot
   * - MUST handle cases where reload is not supported
   */
  reload(target: CertificateTarget): Promise<ReloadResult>;

  /**
   * Verify the target is currently using the specified certificate
   * 
   * @param target - Target to verify
   * @param expectedFingerprint - Expected certificate fingerprint
   * @returns true if target is presenting the expected certificate
   * 
   * Implementation notes:
   * - MUST actually connect to the target (TLS handshake)
   * - MUST verify fingerprint matches
   * - SHOULD verify entire chain
   * - MUST handle connection failures gracefully
   * - For file-based: read file and compute fingerprint
   * - For TLS: perform handshake and extract certificate
   */
  verify(
    target: CertificateTarget,
    expectedFingerprint: string
  ): Promise<boolean>;

  /**
   * Get current certificate fingerprint from target
   * 
   * @param target - Target to query
   * @returns Current certificate fingerprint or null if unable to determine
   * 
   * Implementation notes:
   * - Used by verification service
   * - MUST NOT throw on connection failure
   * - SHOULD return null for unreachable targets
   */
  getCurrentCertificateFingerprint(
    target: CertificateTarget
  ): Promise<string | null>;

  /**
   * Remove/delete a certificate from the target
   * 
   * @param target - Target to clean up
   * @param certificateId - Certificate ID to remove
   * 
   * Implementation notes:
   * - Used during revocation cleanup
   * - SHOULD preserve backups for audit
   * - MUST handle cases where certificate is not present
   */
  remove?(target: CertificateTarget, certificateId: string): Promise<void>;

  /**
   * Health check for the target
   * 
   * @param target - Target to check
   * @returns Health status
   * 
   * Implementation notes:
   * - MUST verify target is reachable
   * - SHOULD verify authentication works
   * - SHOULD measure latency
   */
  healthCheck(target: CertificateTarget): Promise<TargetHealthStatus>;

  /**
   * Initialize the provider
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * Cleanup
   */
  shutdown(): Promise<void>;
}

export interface TargetHealthStatus {
  reachable: boolean;
  authenticated: boolean;
  latencyMs?: number;
  version?: string;
  error?: string;
  checkedAt: Date;
}

/**
 * Deployment provider factory
 */
export interface CertificateDeploymentProviderFactory {
  /**
   * Create a deployment provider instance
   */
  createProvider(
    type: CertificateTargetType,
    config: Record<string, any>
  ): Promise<CertificateDeploymentProvider>;

  /**
   * Get list of supported target types
   */
  getSupportedTypes(): CertificateTargetType[];

  /**
   * Get the appropriate provider for a target
   */
  getProviderForTarget(
    target: CertificateTarget
  ): Promise<CertificateDeploymentProvider | null>;
}
