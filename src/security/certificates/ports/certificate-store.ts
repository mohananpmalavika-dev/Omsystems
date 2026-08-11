/**
 * Certificate Store Interface
 * Repository abstraction for certificate lifecycle persistence
 */

import {
  ManagedCertificate,
  CertificateLifecycleEvent,
  CertificateSigningRequestRecord,
  CertificateLifecycleState,
  CertificateJob,
  CertificateJobType,
  RenewalAttempt,
  CertificateDeploymentRecord
} from '../domain/certificate-lifecycle.types.js';

/**
 * Certificate Store Interface
 * 
 * Persistence layer for certificate lifecycle management.
 * All certificate state, events, and jobs are stored through this interface.
 */
export interface CertificateStore {
  // ============================================================================
  // Managed Certificate Operations
  // ============================================================================

  /**
   * Create a new managed certificate record
   */
  createCertificate(
    certificate: Omit<ManagedCertificate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ManagedCertificate>;

  /**
   * Get a certificate by ID
   */
  getCertificate(id: string): Promise<ManagedCertificate | null>;

  /**
   * Get a certificate by key ID
   */
  getCertificateByKeyId(keyId: string): Promise<ManagedCertificate | null>;

  /**
   * Get a certificate by provider request ID
   */
  getCertificateByProviderRequestId(
    providerRequestId: string
  ): Promise<ManagedCertificate | null>;

  /**
   * Get a certificate by serial number and issuer
   */
  getCertificateBySerial(
    serialNumber: string,
    issuer: string
  ): Promise<ManagedCertificate | null>;

  /**
   * Get a certificate by fingerprint
   */
  getCertificateByFingerprint(
    fingerprint: string
  ): Promise<ManagedCertificate | null>;

  /**
   * Update certificate state
   */
  updateCertificateState(
    id: string,
    state: CertificateLifecycleState,
    updates?: Partial<ManagedCertificate>
  ): Promise<ManagedCertificate>;

  /**
   * Update certificate details after issuance
   */
  updateIssuedCertificate(
    id: string,
    updates: {
      certificatePem: string;
      chainPem?: string[];
      serialNumber: string;
      fingerprintSha256: string;
      notBefore: Date;
      notAfter: Date;
      issuedAt: Date;
    }
  ): Promise<ManagedCertificate>;

  /**
   * List certificates with filters
   */
  listCertificates(filters: CertificateFilters): Promise<ManagedCertificate[]>;

  /**
   * Count certificates matching filters
   */
  countCertificates(filters: CertificateFilters): Promise<number>;

  /**
   * Get certificates expiring within days
   */
  getCertificatesExpiringWithinDays(days: number): Promise<ManagedCertificate[]>;

  /**
   * Get certificates in specific states
   */
  getCertificatesByStates(
    states: CertificateLifecycleState[]
  ): Promise<ManagedCertificate[]>;

  /**
   * Get certificates due for renewal
   */
  getCertificatesDueForRenewal(
    beforeDate: Date
  ): Promise<ManagedCertificate[]>;

  /**
   * Delete a certificate (soft delete recommended)
   */
  deleteCertificate(id: string): Promise<void>;

  // ============================================================================
  // Certificate Lifecycle Event Operations
  // ============================================================================

  /**
   * Record a lifecycle state transition
   */
  recordLifecycleEvent(
    event: Omit<CertificateLifecycleEvent, 'id'>
  ): Promise<CertificateLifecycleEvent>;

  /**
   * Get lifecycle events for a certificate
   */
  getCertificateEvents(
    certificateId: string,
    options?: {
      limit?: number;
      offset?: number;
      fromDate?: Date;
      toDate?: Date;
    }
  ): Promise<CertificateLifecycleEvent[]>;

  /**
   * Get latest lifecycle event for a certificate
   */
  getLatestLifecycleEvent(
    certificateId: string
  ): Promise<CertificateLifecycleEvent | null>;

  // ============================================================================
  // CSR Operations
  // ============================================================================

  /**
   * Store a CSR record
   */
  createCSR(
    csr: Omit<CertificateSigningRequestRecord, 'id'>
  ): Promise<CertificateSigningRequestRecord>;

  /**
   * Get a CSR by ID
   */
  getCSR(id: string): Promise<CertificateSigningRequestRecord | null>;

  /**
   * Get a CSR by certificate ID
   */
  getCSRByCertificateId(
    certificateId: string
  ): Promise<CertificateSigningRequestRecord | null>;

  /**
   * Get a CSR by hash
   */
  getCSRByHash(
    csrSha256: string
  ): Promise<CertificateSigningRequestRecord | null>;

  // ============================================================================
  // Deployment Operations
  // ============================================================================

  /**
   * Add deployment record to certificate
   */
  addDeployment(
    certificateId: string,
    deployment: Omit<CertificateDeploymentRecord, 'id'>
  ): Promise<ManagedCertificate>;

  /**
   * Update deployment state
   */
  updateDeployment(
    certificateId: string,
    deploymentId: string,
    updates: Partial<CertificateDeploymentRecord>
  ): Promise<ManagedCertificate>;

  /**
   * Get deployments for a certificate
   */
  getDeployments(certificateId: string): Promise<CertificateDeploymentRecord[]>;

  /**
   * Get active deployments across all certificates
   */
  getActiveDeployments(): Promise<
    Array<{
      certificate: ManagedCertificate;
      deployment: CertificateDeploymentRecord;
    }>
  >;

  // ============================================================================
  // Job Operations
  // ============================================================================

  /**
   * Create a new job
   */
  createJob(
    job: Omit<CertificateJob, 'id' | 'state' | 'attempts'>
  ): Promise<CertificateJob>;

  /**
   * Get a job by ID
   */
  getJob(id: string): Promise<CertificateJob | null>;

  /**
   * Get pending jobs of a specific type
   */
  getPendingJobs(
    type?: CertificateJobType,
    limit?: number
  ): Promise<CertificateJob[]>;

  /**
   * Get jobs for a certificate
   */
  getCertificateJobs(
    certificateId: string,
    options?: {
      type?: CertificateJobType;
      state?: CertificateJob['state'];
      limit?: number;
    }
  ): Promise<CertificateJob[]>;

  /**
   * Update job state
   */
  updateJobState(
    id: string,
    state: CertificateJob['state'],
    updates?: {
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      result?: Record<string, any>;
      nextRetryAt?: Date;
    }
  ): Promise<CertificateJob>;

  /**
   * Increment job attempt counter
   */
  incrementJobAttempts(id: string): Promise<CertificateJob>;

  /**
   * Delete old completed jobs
   */
  deleteCompletedJobs(olderThan: Date): Promise<number>;

  // ============================================================================
  // Renewal Tracking
  // ============================================================================

  /**
   * Create a renewal attempt record
   */
  createRenewalAttempt(
    attempt: Omit<RenewalAttempt, 'id'>
  ): Promise<RenewalAttempt>;

  /**
   * Get renewal attempts for a certificate
   */
  getRenewalAttempts(certificateId: string): Promise<RenewalAttempt[]>;

  /**
   * Update renewal attempt
   */
  updateRenewalAttempt(
    id: string,
    updates: Partial<RenewalAttempt>
  ): Promise<RenewalAttempt>;

  /**
   * Get latest renewal attempt
   */
  getLatestRenewalAttempt(
    certificateId: string
  ): Promise<RenewalAttempt | null>;

  // ============================================================================
  // Statistics and Reporting
  // ============================================================================

  /**
   * Get certificate statistics
   */
  getStatistics(): Promise<CertificateStatistics>;

  /**
   * Get tenant-specific statistics
   */
  getTenantStatistics(tenantId: string): Promise<CertificateStatistics>;
}

export interface CertificateFilters {
  tenantId?: string;
  targetType?: string;
  targetId?: string;
  state?: CertificateLifecycleState;
  states?: CertificateLifecycleState[];
  profile?: string;
  providerId?: string;
  expiringWithinDays?: number;
  expiredOnly?: boolean;
  activeOnly?: boolean;
  search?: string; // Search by name, subject CN, SANs
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface CertificateStatistics {
  total: number;
  byState: Record<CertificateLifecycleState, number>;
  byProfile: Record<string, number>;
  byProvider: Record<string, number>;
  active: number;
  expiringSoon: number; // Within 30 days
  expired: number;
  failed: number;
  pendingRenewal: number;
  averageIssuanceTimeMs: number;
  averageDeploymentTimeMs: number;
}

/**
 * Certificate Store Factory
 */
export interface CertificateStoreFactory {
  /**
   * Create a certificate store instance
   */
  createStore(config: {
    type: 'mongodb' | 'postgresql' | 'memory';
    connectionString?: string;
    options?: Record<string, any>;
  }): Promise<CertificateStore>;
}
