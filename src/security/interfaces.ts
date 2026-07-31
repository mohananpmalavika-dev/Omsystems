/**
 * Enterprise Security Interfaces
 * Service contracts for all security components
 */

import {
  Secret,
  SecretType,
  SecretAccessLog,
  Certificate,
  CertificateType,
  CertificateCheck,
  PasswordRotationTarget,
  PasswordRotationJob,
  PasswordPolicy,
  HSMKey,
  HSMOperation,
  HSMOperationType,
  TamperEvent,
  TamperEventType,
  EncryptedVideo,
  EncryptionConfig,
  ImmutableObject,
  RetentionPolicy,
  RansomwareThreat,
  SoftwarePackage,
  SecureBootStatus,
  TPMStatus,
  AttestationResult,
  SecurityPosture,
  ZeroTrustPolicy,
  AccessRequest,
  AccessResponse,
  ComplianceStatus,
  ComplianceFramework
} from './types.js';

// ============================================================================
// Secret Vault Interface
// ============================================================================

export interface ISecretVaultService {
  // Secret Management
  createSecret(
    name: string,
    type: SecretType,
    value: string,
    metadata?: Record<string, any>
  ): Promise<Secret>;
  
  getSecret(id: string, version?: number): Promise<Secret>;
  
  updateSecret(id: string, value: string): Promise<Secret>;
  
  deleteSecret(id: string): Promise<void>;
  
  listSecrets(filters?: SecretFilters): Promise<Secret[]>;
  
  rotateSecret(id: string): Promise<Secret>;
  
  // Version Management
  getSecretVersions(secretId: string): Promise<any[]>;
  
  // Access Logging
  logAccess(secretId: string, userId: string, action: string, success: boolean): Promise<void>;
  
  getAccessLogs(secretId: string, limit?: number): Promise<SecretAccessLog[]>;
  
  // Encryption
  encrypt(plaintext: string): Promise<string>;
  
  decrypt(ciphertext: string): Promise<string>;
}

export interface SecretFilters {
  type?: SecretType;
  tags?: string[];
  expiringSoon?: boolean;
  needsRotation?: boolean;
}

// ============================================================================
// Certificate Management Interface
// ============================================================================

export interface ICertificateManagementService {
  // Certificate Management
  importCertificate(
    name: string,
    type: CertificateType,
    pemCertificate: string,
    pemPrivateKey?: string,
    pemChain?: string[]
  ): Promise<Certificate>;
  
  getCertificate(id: string): Promise<Certificate>;
  
  listCertificates(filters?: CertificateFilters): Promise<Certificate[]>;
  
  deleteCertificate(id: string): Promise<void>;
  
  // Certificate Operations
  verifyCertificate(id: string): Promise<CertificateCheck>;
  
  renewCertificate(id: string): Promise<Certificate>;
  
  revokeCertificate(id: string, reason: string): Promise<void>;
  
  // Monitoring
  checkExpiringCertificates(daysThreshold: number): Promise<Certificate[]>;
  
  autoRenewCertificates(): Promise<Certificate[]>;
  
  // Certificate Chains
  validateChain(certificateId: string): Promise<boolean>;
  
  // Usage Tracking
  trackUsage(certificateId: string, resourceType: string, resourceId: string): Promise<void>;
}

export interface CertificateFilters {
  type?: CertificateType;
  status?: string;
  expiringSoon?: boolean;
  expiryDays?: number;
}

// ============================================================================
// Password Rotation Interface
// ============================================================================

export interface IPasswordRotationService {
  // Target Management
  addTarget(target: Omit<PasswordRotationTarget, 'id'>): Promise<PasswordRotationTarget>;
  
  getTarget(id: string): Promise<PasswordRotationTarget>;
  
  listTargets(filters?: TargetFilters): Promise<PasswordRotationTarget[]>;
  
  updateTarget(id: string, updates: Partial<PasswordRotationTarget>): Promise<PasswordRotationTarget>;
  
  deleteTarget(id: string): Promise<void>;
  
  // Rotation Operations
  rotatePassword(targetId: string, force?: boolean): Promise<PasswordRotationJob>;
  
  rotateAll(filters?: TargetFilters): Promise<PasswordRotationJob[]>;
  
  scheduleRotation(targetId: string, scheduledAt: Date): Promise<PasswordRotationJob>;
  
  // Job Management
  getJob(id: string): Promise<PasswordRotationJob>;
  
  listJobs(targetId?: string, status?: string): Promise<PasswordRotationJob[]>;
  
  retryJob(jobId: string): Promise<PasswordRotationJob>;
  
  rollbackJob(jobId: string): Promise<void>;
  
  // Password Generation
  generatePassword(policy: PasswordPolicy): Promise<string>;
  
  validatePassword(password: string, policy: PasswordPolicy): Promise<boolean>;
}

export interface TargetFilters {
  type?: string;
  enabled?: boolean;
  needsRotation?: boolean;
  overdue?: boolean;
}

// ============================================================================
// HSM Interface
// ============================================================================

export interface IHSMService {
  // Initialization
  initialize(config: any): Promise<void>;
  
  isConnected(): Promise<boolean>;
  
  // Key Management
  generateKey(label: string, algorithm: string, keySize: number): Promise<HSMKey>;
  
  importKey(label: string, keyData: Buffer, algorithm: string): Promise<HSMKey>;
  
  getKey(id: string): Promise<HSMKey>;
  
  listKeys(): Promise<HSMKey[]>;
  
  deleteKey(id: string): Promise<void>;
  
  // Cryptographic Operations
  sign(keyId: string, data: Buffer): Promise<Buffer>;
  
  verify(keyId: string, data: Buffer, signature: Buffer): Promise<boolean>;
  
  encrypt(keyId: string, plaintext: Buffer): Promise<Buffer>;
  
  decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer>;
  
  // Key Wrapping
  wrapKey(keyId: string, wrappingKeyId: string): Promise<Buffer>;
  
  unwrapKey(wrappedKey: Buffer, unwrappingKeyId: string): Promise<HSMKey>;
  
  // Logging
  logOperation(operation: HSMOperationType, keyId: string, success: boolean): Promise<void>;
  
  getOperationLogs(keyId?: string, limit?: number): Promise<HSMOperation[]>;
}

// ============================================================================
// Zero Trust Policy Engine Interface
// ============================================================================

export interface IZeroTrustPolicyEngine {
  // Policy Management
  createPolicy(policy: Omit<ZeroTrustPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ZeroTrustPolicy>;
  
  getPolicy(id: string): Promise<ZeroTrustPolicy>;
  
  listPolicies(enabled?: boolean): Promise<ZeroTrustPolicy[]>;
  
  updatePolicy(id: string, updates: Partial<ZeroTrustPolicy>): Promise<ZeroTrustPolicy>;
  
  deletePolicy(id: string): Promise<void>;
  
  // Access Evaluation
  evaluateAccess(request: AccessRequest): Promise<AccessResponse>;
  
  // Risk Scoring
  calculateRiskScore(context: any): Promise<number>;
  
  // Device Trust
  verifyDevice(deviceId: string): Promise<boolean>;
  
  registerDevice(deviceId: string, userId: string, metadata: Record<string, any>): Promise<void>;
  
  // Continuous Authentication
  startContinuousAuth(sessionId: string, context: any): Promise<void>;
  
  checkAuthStatus(sessionId: string): Promise<boolean>;
}

// ============================================================================
// Tamper Detection Interface
// ============================================================================

export interface ITamperDetectionService {
  // Event Management
  reportTamper(event: Omit<TamperEvent, 'id' | 'timestamp' | 'verified' | 'acknowledged'>): Promise<TamperEvent>;
  
  getTamperEvent(id: string): Promise<TamperEvent>;
  
  listTamperEvents(filters?: TamperFilters): Promise<TamperEvent[]>;
  
  acknowledgeTamperEvent(id: string, userId: string, resolution: string): Promise<void>;
  
  // Monitoring
  monitorDevice(deviceId: string, deviceType: string): Promise<void>;
  
  stopMonitoring(deviceId: string): Promise<void>;
  
  // Verification
  verifyTamperEvent(eventId: string): Promise<boolean>;
  
  // Sensors
  registerSensor(deviceId: string, sensorType: string): Promise<void>;
  
  getSensorStatus(deviceId: string): Promise<any[]>;
}

export interface TamperFilters {
  deviceType?: string;
  type?: TamperEventType;
  severity?: string;
  acknowledged?: boolean;
  startDate?: Date;
  endDate?: Date;
}

// ============================================================================
// Video Encryption Interface
// ============================================================================

export interface IVideoEncryptionService {
  // Configuration
  setEncryptionConfig(config: EncryptionConfig): Promise<void>;
  
  getEncryptionConfig(): Promise<EncryptionConfig>;
  
  // Encryption Operations
  encryptVideo(videoId: string, videoPath: string): Promise<EncryptedVideo>;
  
  decryptVideo(encryptedVideoId: string, outputPath: string): Promise<void>;
  
  // Key Management
  generateEncryptionKey(): Promise<any>;
  
  rotateKeys(): Promise<void>;
  
  // Streaming Encryption
  encryptStream(inputStream: NodeJS.ReadableStream): NodeJS.ReadableStream;
  
  decryptStream(inputStream: NodeJS.ReadableStream, keyId: string, iv: string): NodeJS.ReadableStream;
  
  // Metadata
  getEncryptedVideoInfo(id: string): Promise<EncryptedVideo>;
  
  verifyIntegrity(encryptedVideoId: string): Promise<boolean>;
}

// ============================================================================
// Immutable Storage Interface
// ============================================================================

export interface IImmutableStorageService {
  // Object Management
  storeImmutable(
    objectKey: string,
    objectType: string,
    data: Buffer,
    retentionDays: number,
    metadata?: Record<string, any>
  ): Promise<ImmutableObject>;
  
  getImmutableObject(id: string): Promise<ImmutableObject>;
  
  listImmutableObjects(filters?: ImmutableFilters): Promise<ImmutableObject[]>;
  
  // Retention Management
  applyRetentionPolicy(policyId: string, objectId: string): Promise<void>;
  
  extendRetention(objectId: string, additionalDays: number): Promise<void>;
  
  // Legal Holds
  applyLegalHold(objectId: string, caseNumber: string, description: string): Promise<void>;
  
  releaseLegalHold(objectId: string, holdId: string, userId: string): Promise<void>;
  
  listLegalHolds(objectId: string): Promise<any[]>;
  
  // Locking
  lockObject(objectId: string): Promise<void>;
  
  // Verification
  verifyIntegrity(objectId: string): Promise<boolean>;
  
  verifyImmutability(objectId: string): Promise<boolean>;
  
  // Policy Management
  createRetentionPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<RetentionPolicy>;
  
  listRetentionPolicies(): Promise<RetentionPolicy[]>;
}

export interface ImmutableFilters {
  objectType?: string;
  retentionStatus?: string;
  hasLegalHold?: boolean;
}

// ============================================================================
// Ransomware Detection Interface
// ============================================================================

export interface IRansomwareDetectionService {
  // Threat Detection
  detectThreats(): Promise<RansomwareThreat[]>;
  
  analyzeDevice(deviceId: string): Promise<RansomwareThreat | null>;
  
  // Monitoring
  startMonitoring(deviceId: string): Promise<void>;
  
  stopMonitoring(deviceId: string): Promise<void>;
  
  // Baseline Management
  createBaseline(deviceId: string): Promise<void>;
  
  updateBaseline(deviceId: string): Promise<void>;
  
  // Pattern Management
  addPattern(pattern: any): Promise<void>;
  
  listPatterns(): Promise<any[]>;
  
  // Response Actions
  isolateDevice(deviceId: string, reason: string): Promise<void>;
  
  restoreDevice(deviceId: string): Promise<void>;
  
  // Threat Management
  getThreat(id: string): Promise<RansomwareThreat>;
  
  listThreats(filters?: ThreatFilters): Promise<RansomwareThreat[]>;
  
  resolveThreat(threatId: string, userId: string, notes: string): Promise<void>;
}

export interface ThreatFilters {
  deviceId?: string;
  level?: string;
  resolved?: boolean;
  startDate?: Date;
  endDate?: Date;
}

// ============================================================================
// Supply Chain Verification Interface
// ============================================================================

export interface ISupplyChainVerificationService {
  // Package Verification
  verifyPackage(packagePath: string): Promise<SoftwarePackage>;
  
  verifySignature(packagePath: string, signaturePath: string, publicKey: string): Promise<boolean>;
  
  verifyChecksum(packagePath: string, expectedChecksum: string, algorithm: string): Promise<boolean>;
  
  // Publisher Management
  addTrustedPublisher(name: string, publicKey: string, certificate: string): Promise<void>;
  
  listTrustedPublishers(): Promise<any[]>;
  
  removeTrustedPublisher(id: string): Promise<void>;
  
  // SBOM Management
  parseSBOM(sbomPath: string): Promise<any>;
  
  validateSBOM(sbomPath: string): Promise<boolean>;
  
  // Vulnerability Scanning
  scanForVulnerabilities(packageId: string): Promise<any[]>;
  
  checkCVE(cveId: string): Promise<any>;
  
  // Package Management
  registerPackage(pkg: Omit<SoftwarePackage, 'id'>): Promise<SoftwarePackage>;
  
  getPackage(id: string): Promise<SoftwarePackage>;
  
  listPackages(filters?: PackageFilters): Promise<SoftwarePackage[]>;
}

export interface PackageFilters {
  type?: string;
  vendor?: string;
  verificationStatus?: string;
  hasVulnerabilities?: boolean;
}

// ============================================================================
// Secure Boot Verification Interface
// ============================================================================

export interface ISecureBootVerificationService {
  // Boot Verification
  verifyBoot(deviceId: string): Promise<SecureBootStatus>;
  
  getBootStatus(deviceId: string): Promise<SecureBootStatus>;
  
  listDeviceBootStatus(filters?: BootFilters): Promise<SecureBootStatus[]>;
  
  // Component Verification
  verifyComponent(deviceId: string, componentName: string): Promise<boolean>;
  
  registerTrustedComponent(name: string, checksum: string, signature: string): Promise<void>;
  
  // Monitoring
  enableBootMonitoring(deviceId: string): Promise<void>;
  
  disableBootMonitoring(deviceId: string): Promise<void>;
  
  // Measurements
  collectMeasurements(deviceId: string): Promise<any[]>;
  
  validateMeasurements(deviceId: string, measurements: any[]): Promise<boolean>;
}

export interface BootFilters {
  status?: string;
  enabled?: boolean;
  anomaliesDetected?: boolean;
}

// ============================================================================
// TPM Attestation Interface
// ============================================================================

export interface ITPMAttestationService {
  // TPM Status
  getTPMStatus(deviceId: string): Promise<TPMStatus>;
  
  listTPMDevices(): Promise<TPMStatus[]>;
  
  // Attestation
  requestAttestation(deviceId: string): Promise<AttestationResult>;
  
  verifyAttestation(deviceId: string, quote: string, signature: string, pcrs: Record<number, string>): Promise<AttestationResult>;
  
  // Key Management
  createTPMKey(deviceId: string, keyType: string, algorithm: string): Promise<any>;
  
  getTPMKeys(deviceId: string): Promise<any[]>;
  
  // Sealing
  sealData(deviceId: string, data: Buffer, pcrSelection: number[]): Promise<Buffer>;
  
  unsealData(deviceId: string, sealedData: Buffer): Promise<Buffer>;
  
  // Quote Generation
  generateQuote(deviceId: string, nonce: string, pcrSelection: number[]): Promise<any>;
}

// ============================================================================
// Security Posture Interface
// ============================================================================

export interface ISecurityPostureService {
  // Posture Assessment
  calculatePosture(): Promise<SecurityPosture>;
  
  getPosture(): Promise<SecurityPosture>;
  
  getPostureHistory(days: number): Promise<SecurityPosture[]>;
  
  // Category Scoring
  scoreCertificates(): Promise<any>;
  
  scoreAuthentication(): Promise<any>;
  
  scoreEncryption(): Promise<any>;
  
  scoreAccessControl(): Promise<any>;
  
  scoreThreatDetection(): Promise<any>;
  
  scoreCompliance(): Promise<any>;
  
  // Issue Management
  listIssues(filters?: IssueFilters): Promise<any[]>;
  
  resolveIssue(issueId: string, userId: string): Promise<void>;
  
  markFalsePositive(issueId: string, userId: string): Promise<void>;
  
  // Recommendations
  getRecommendations(): Promise<any[]>;
  
  // Compliance
  assessCompliance(framework: ComplianceFramework): Promise<ComplianceStatus>;
  
  listComplianceFrameworks(): Promise<ComplianceStatus[]>;
}

export interface IssueFilters {
  category?: string;
  severity?: string;
  resolved?: boolean;
}
