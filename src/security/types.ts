/**
 * Enterprise Security Types
 * Comprehensive type definitions for cybersecurity components
 */

// ============================================================================
// Zero Trust Types
// ============================================================================

export enum TrustLevel {
  UNKNOWN = 'unknown',
  UNTRUSTED = 'untrusted',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERIFIED = 'verified'
}

export enum AccessDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  CHALLENGE = 'challenge',
  STEP_UP = 'step_up'
}

export interface ZeroTrustContext {
  userId: string;
  deviceId: string;
  ipAddress: string;
  location?: {
    country: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  timestamp: Date;
  userAgent?: string;
  sessionId?: string;
  mfaVerified: boolean;
  deviceTrusted: boolean;
  riskScore: number; // 0-100
}

export interface ZeroTrustPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  action: AccessDecision;
  requireMFA?: boolean;
  allowedLocations?: string[];
  allowedIPs?: string[];
  allowedDevices?: string[];
  timeRestrictions?: TimeRestriction[];
  maxRiskScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyCondition {
  type: 'user' | 'role' | 'device' | 'location' | 'time' | 'risk' | 'resource';
  operator: 'equals' | 'contains' | 'in' | 'gt' | 'lt' | 'between';
  value: any;
}

export interface TimeRestriction {
  daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string;
}

export interface AccessRequest {
  context: ZeroTrustContext;
  resource: string;
  action: string;
  metadata?: Record<string, any>;
}

export interface AccessResponse {
  decision: AccessDecision;
  reason: string;
  policies: string[];
  riskScore: number;
  requiresChallenge?: boolean;
  challengeType?: 'mfa' | 'biometric' | 'approval';
  expiresAt?: Date;
}

// ============================================================================
// Secret Vault Types
// ============================================================================

export enum SecretType {
  PASSWORD = 'password',
  API_KEY = 'api_key',
  TOKEN = 'token',
  CERTIFICATE = 'certificate',
  PRIVATE_KEY = 'private_key',
  DATABASE_CREDENTIAL = 'database_credential',
  SSH_KEY = 'ssh_key',
  ENCRYPTION_KEY = 'encryption_key',
  SIGNING_KEY = 'signing_key'
}

export interface Secret {
  id: string;
  name: string;
  type: SecretType;
  description?: string;
  value: string; // Encrypted
  metadata: Record<string, any>;
  tags: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  rotationPolicy?: RotationPolicy;
  accessCount: number;
  lastAccessedAt?: Date;
  lastRotatedAt?: Date;
}

export interface SecretVersion {
  id: string;
  secretId: string;
  version: number;
  value: string; // Encrypted
  createdAt: Date;
  createdBy: string;
  deprecatedAt?: Date;
}

export interface RotationPolicy {
  enabled: boolean;
  intervalDays: number;
  notifyBeforeDays: number;
  autoRotate: boolean;
  rotationScript?: string;
}

export interface SecretAccessLog {
  id: string;
  secretId: string;
  userId: string;
  action: 'create' | 'read' | 'write' | 'rotate' | 'delete';
  timestamp: Date;
  ipAddress: string;
  success: boolean;
  reason?: string;
}

// ============================================================================
// Certificate Management Types
// ============================================================================

export enum CertificateStatus {
  VALID = 'valid',
  EXPIRING_SOON = 'expiring_soon',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  INVALID = 'invalid'
}

export enum CertificateType {
  SSL_TLS = 'ssl_tls',
  CLIENT = 'client',
  CODE_SIGNING = 'code_signing',
  EMAIL = 'email',
  ROOT_CA = 'root_ca',
  INTERMEDIATE_CA = 'intermediate_ca'
}

export interface Certificate {
  id: string;
  name: string;
  type: CertificateType;
  commonName: string;
  subjectAlternativeNames: string[];
  issuer: string;
  serialNumber: string;
  fingerprint: string;
  algorithm: string;
  keySize: number;
  notBefore: Date;
  notAfter: Date;
  status: CertificateStatus;
  pemCertificate: string;
  pemPrivateKey?: string;
  pemChain?: string[];
  autoRenew: boolean;
  renewDaysBeforeExpiry: number;
  usedBy: CertificateUsage[];
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
}

export interface CertificateUsage {
  resourceType: 'camera' | 'recorder' | 'server' | 'application' | 'user';
  resourceId: string;
  resourceName: string;
  purpose: string;
}

export interface CertificateCheck {
  certificateId: string;
  timestamp: Date;
  status: CertificateStatus;
  daysUntilExpiry: number;
  validationErrors: string[];
  revocationChecked: boolean;
  ocspStatus?: 'good' | 'revoked' | 'unknown';
}

// ============================================================================
// Password Rotation Types
// ============================================================================

export enum RotationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface PasswordRotationTarget {
  id: string;
  type: 'camera' | 'recorder' | 'switch' | 'server' | 'service_account';
  name: string;
  host: string;
  port?: number;
  protocol: 'onvif' | 'ssh' | 'http' | 'snmp' | 'custom';
  username: string;
  secretId: string; // Reference to Secret Vault
  lastRotation?: Date;
  nextRotation: Date;
  rotationPolicy: RotationPolicy;
  enabled: boolean;
  metadata: Record<string, any>;
}

export interface PasswordRotationJob {
  id: string;
  targetId: string;
  status: RotationStatus;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  oldPasswordHash: string;
  newPasswordHash: string;
  attempts: number;
  error?: string;
  rollbackAvailable: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  specialChars: string;
  forbiddenPasswords: string[];
  preventReuse: number; // Number of previous passwords to check
}

// ============================================================================
// HSM Types
// ============================================================================

export enum HSMOperationType {
  SIGN = 'sign',
  VERIFY = 'verify',
  ENCRYPT = 'encrypt',
  DECRYPT = 'decrypt',
  GENERATE_KEY = 'generate_key',
  DERIVE_KEY = 'derive_key',
  WRAP_KEY = 'wrap_key',
  UNWRAP_KEY = 'unwrap_key'
}

export interface HSMConfig {
  type: 'pkcs11' | 'aws_cloudhsm' | 'azure_keyvault' | 'softhsm';
  endpoint?: string;
  slot?: number;
  pin?: string;
  libraryPath?: string;
  credentials?: Record<string, string>;
}

export interface HSMKey {
  id: string;
  label: string;
  algorithm: 'RSA' | 'ECDSA' | 'AES' | 'HMAC';
  keySize: number;
  purpose: string[];
  createdAt: Date;
  expiresAt?: Date;
  metadata: Record<string, any>;
}

export interface HSMOperation {
  id: string;
  type: HSMOperationType;
  keyId: string;
  timestamp: Date;
  userId: string;
  success: boolean;
  duration: number;
  error?: string;
}

// ============================================================================
// Tamper Detection Types
// ============================================================================

export enum TamperEventType {
  PHYSICAL_TAMPER = 'physical_tamper',
  CHASSIS_OPENED = 'chassis_opened',
  DEVICE_UNPLUGGED = 'device_unplugged',
  USB_INSERTED = 'usb_inserted',
  CONFIG_MODIFIED = 'config_modified',
  FIRMWARE_MODIFIED = 'firmware_modified',
  DISK_REMOVED = 'disk_removed',
  NETWORK_DISCONNECTED = 'network_disconnected',
  GPS_SPOOFING = 'gps_spoofing',
  CLOCK_MANIPULATION = 'clock_manipulation',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  INTEGRITY_VIOLATION = 'integrity_violation'
}

export interface TamperEvent {
  id: string;
  type: TamperEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  deviceType: 'camera' | 'recorder' | 'server' | 'switch' | 'sensor';
  deviceId: string;
  deviceName: string;
  location?: string;
  timestamp: Date;
  description: string;
  evidence: TamperEvidence[];
  verified: boolean;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolution?: string;
  metadata: Record<string, any>;
}

export interface TamperEvidence {
  type: 'log' | 'sensor' | 'video' | 'image' | 'metric';
  source: string;
  timestamp: Date;
  data: any;
  checksum?: string;
}

export interface TamperSensor {
  deviceId: string;
  sensorType: 'door' | 'motion' | 'vibration' | 'temperature' | 'humidity' | 'light';
  enabled: boolean;
  threshold?: number;
  lastReading?: number;
  lastReadingAt?: Date;
}

// ============================================================================
// Video Encryption Types
// ============================================================================

export enum EncryptionAlgorithm {
  AES_256_GCM = 'aes-256-gcm',
  AES_256_CBC = 'aes-256-cbc',
  CHACHA20_POLY1305 = 'chacha20-poly1305'
}

export interface EncryptionConfig {
  algorithm: EncryptionAlgorithm;
  keySize: number;
  keyRotationDays: number;
  compressBeforeEncrypt: boolean;
}

export interface EncryptedVideo {
  id: string;
  originalVideoId: string;
  algorithm: EncryptionAlgorithm;
  keyId: string;
  ivBase64: string;
  authTagBase64?: string;
  encryptedSize: number;
  originalSize: number;
  encryptedAt: Date;
  encryptedBy: string;
  checksum: string;
  metadata: Record<string, any>;
}

export interface EncryptionKey {
  id: string;
  algorithm: EncryptionAlgorithm;
  keyBase64: string; // Encrypted by master key
  createdAt: Date;
  expiresAt?: Date;
  rotatedFromKeyId?: string;
  usageCount: number;
  purpose: string;
}

// ============================================================================
// Immutable Storage Types
// ============================================================================

export enum RetentionStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  EXPIRED = 'expired',
  LEGAL_HOLD = 'legal_hold'
}

export interface ImmutableObject {
  id: string;
  objectKey: string;
  objectType: string;
  size: number;
  checksum: string;
  algorithm: string;
  retentionPeriodDays: number;
  retentionExpiresAt: Date;
  retentionStatus: RetentionStatus;
  legalHolds: LegalHold[];
  versions: ImmutableVersion[];
  createdAt: Date;
  createdBy: string;
  locked: boolean;
  lockedAt?: Date;
  metadata: Record<string, any>;
}

export interface ImmutableVersion {
  versionId: string;
  checksum: string;
  size: number;
  timestamp: Date;
  immutable: boolean;
}

export interface LegalHold {
  id: string;
  caseNumber: string;
  description: string;
  appliedAt: Date;
  appliedBy: string;
  expiresAt?: Date;
  releasedAt?: Date;
  releasedBy?: string;
}

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  objectTypes: string[];
  retentionDays: number;
  lockImmediately: boolean;
  allowVersions: boolean;
  enabled: boolean;
  priority: number;
}

// ============================================================================
// Ransomware Detection Types
// ============================================================================

export enum ThreatLevel {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface RansomwareThreat {
  id: string;
  type: 'file_encryption' | 'mass_deletion' | 'privilege_escalation' | 'service_disruption' | 'suspicious_process' | 'network_anomaly';
  level: ThreatLevel;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  detectedAt: Date;
  indicators: ThreatIndicator[];
  affectedResources: string[];
  recommendedActions: string[];
  autoIsolated: boolean;
  isolated: boolean;
  isolatedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export interface ThreatIndicator {
  type: 'behavioral' | 'signature' | 'heuristic' | 'ml_detection';
  description: string;
  confidence: number; // 0-100
  evidence: any;
  timestamp: Date;
}

export interface RansomwarePattern {
  id: string;
  name: string;
  description: string;
  indicators: PatternIndicator[];
  threshold: number; // Number of indicators required
  severity: ThreatLevel;
  autoIsolate: boolean;
  enabled: boolean;
}

export interface PatternIndicator {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: any;
  weight: number;
}

export interface BehaviorBaseline {
  deviceId: string;
  metric: string;
  average: number;
  stdDev: number;
  min: number;
  max: number;
  sampleSize: number;
  lastUpdated: Date;
}

// ============================================================================
// Supply Chain Verification Types
// ============================================================================

export enum VerificationStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
  FAILED = 'failed',
  UNKNOWN = 'unknown'
}

export interface SoftwarePackage {
  id: string;
  name: string;
  version: string;
  type: 'update' | 'plugin' | 'driver' | 'firmware' | 'container' | 'ai_model';
  vendor: string;
  downloadUrl?: string;
  localPath?: string;
  size: number;
  checksum: string;
  checksumAlgorithm: string;
  signature?: string;
  publicKey?: string;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
  trustedPublisher: boolean;
  sbom?: SoftwareBillOfMaterials;
  vulnerabilities: Vulnerability[];
  installedAt?: Date;
  installedBy?: string;
  metadata: Record<string, any>;
}

export interface SoftwareBillOfMaterials {
  version: string;
  components: SBOMComponent[];
  generatedAt: Date;
}

export interface SBOMComponent {
  name: string;
  version: string;
  type: string;
  supplier?: string;
  license?: string;
  checksum?: string;
  dependencies?: string[];
}

export interface Vulnerability {
  id: string;
  cveId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedVersions: string[];
  fixedVersion?: string;
  publishedAt: Date;
  patchAvailable: boolean;
}

export interface TrustedPublisher {
  id: string;
  name: string;
  publicKeys: string[];
  certificateFingerprints: string[];
  verified: boolean;
  addedAt: Date;
  addedBy: string;
}

// ============================================================================
// Secure Boot Types
// ============================================================================

export enum BootStatus {
  VERIFIED = 'verified',
  FAILED = 'failed',
  UNKNOWN = 'unknown',
  DISABLED = 'disabled'
}

export interface SecureBootStatus {
  deviceId: string;
  deviceName: string;
  enabled: boolean;
  status: BootStatus;
  lastVerification: Date;
  bootChain: BootComponent[];
  measurements: BootMeasurement[];
  anomaliesDetected: boolean;
  anomalies: string[];
}

export interface BootComponent {
  name: string;
  type: 'firmware' | 'bootloader' | 'kernel' | 'initramfs' | 'drivers';
  version: string;
  checksum: string;
  verified: boolean;
  signature?: string;
}

export interface BootMeasurement {
  pcrIndex: number;
  pcrValue: string;
  event: string;
  timestamp: Date;
}

// ============================================================================
// TPM Types
// ============================================================================

export interface TPMStatus {
  deviceId: string;
  deviceName: string;
  present: boolean;
  enabled: boolean;
  version: string;
  manufacturer: string;
  firmwareVersion: string;
  attestationSupported: boolean;
  sealingSupported: boolean;
  lastAttestationAt?: Date;
  attestationResult?: AttestationResult;
}

export interface AttestationResult {
  success: boolean;
  timestamp: Date;
  quote: string; // Base64 encoded TPM quote
  signature: string;
  pcrs: Record<number, string>;
  nonce: string;
  verified: boolean;
  verifiedBy?: string;
  trustLevel: TrustLevel;
  anomalies: string[];
}

export interface TPMKey {
  deviceId: string;
  handle: string;
  type: 'storage' | 'signing' | 'binding' | 'endorsement';
  algorithm: string;
  persistent: boolean;
  createdAt: Date;
}

// ============================================================================
// Security Posture Types
// ============================================================================

/**
 * Security Evidence - proof backing a security metric
 * This is the foundation for real, verifiable security posture
 */
export interface SecurityEvidence {
  id: string;
  source: EvidenceSource;
  collectorType: string;
  collectedAt: Date;
  expiresAt?: Date;
  freshnessMs: number;
  confidence: number; // 0-100
  status: 'valid' | 'stale' | 'expired' | 'failed';
  rawData: any;
  metadata?: Record<string, any>;
}

export type EvidenceSource =
  | 'certificate_scan'
  | 'secret_vault_query'
  | 'tpm_attestation'
  | 'password_rotation_check'
  | 'device_identity_check'
  | 'zero_trust_policy'
  | 'user_mfa_status'
  | 'video_encryption_scan'
  | 'threat_detection'
  | 'access_log_analysis'
  | 'manual_entry'
  | 'simulation'; // Marks simulated/placeholder data

export interface EvidenceCollectorConfig {
  enabled: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  maxStalenessMs?: number; // Reject evidence older than this
}

export interface CollectorStatus {
  name: string;
  type: EvidenceSource;
  enabled: boolean;
  status: 'active' | 'inactive' | 'error' | 'not_configured';
  lastRun?: Date;
  nextRun?: Date;
  description: string;
}

export interface FreshnessReport {
  overallFreshness: 'fresh' | 'stale' | 'expired';
  oldestEvidenceMs: number;
  staleCollectors: string[];
  missingCollectors: string[];
}

export interface SecurityPosture {
  overallScore: number; // 0-100
  timestamp: Date;
  categories: SecurityCategory[];
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  trends: SecurityTrend[];
  recommendations: SecurityRecommendation[];
  provenance: 'LIVE' | 'PARTIAL' | 'SIMULATED' | 'UNAVAILABLE'; // Added provenance tracking
  collectorStatus?: CollectorStatus[];
  evidenceFreshness?: FreshnessReport;
}

export interface SecurityCategory {
  name: string;
  score: number; // 0-100
  weight: number;
  metrics: SecurityMetricWithEvidence[];
  issues: SecurityIssue[];
}

export interface SecurityMetric {
  name: string;
  value: number | null;
  target: number;
  unit: string;
  status: 'good' | 'warning' | 'critical' | 'unavailable';
}

/**
 * Enhanced metric with evidence backing
 */
export interface SecurityMetricWithEvidence extends SecurityMetric {
  evidence: SecurityEvidence[];
  lastUpdated: Date;
  confidence: number; // Aggregate confidence from evidence
  provenance: 'LIVE' | 'SIMULATED' | 'UNAVAILABLE';
}

export interface SecurityIssue {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedResources: string[];
  remediation: string;
  detectedAt: Date;
  resolvedAt?: Date;
  falsePositive: boolean;
}

export interface SecurityTrend {
  metric: string;
  dataPoints: SecurityDataPoint[];
  direction: 'improving' | 'stable' | 'degrading';
  changePercent: number;
}

export interface SecurityDataPoint {
  timestamp: Date;
  value: number;
}

export interface SecurityRecommendation {
  priority: number;
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  resourceLinks: string[];
}

// ============================================================================
// Compliance Types
// ============================================================================

export enum ComplianceFramework {
  ISO_27001 = 'iso_27001',
  IEC_62443 = 'iec_62443',
  NIST_CSF = 'nist_csf',
  CIS_CONTROLS = 'cis_controls',
  SOC_2 = 'soc_2',
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  PCI_DSS = 'pci_dss'
}

export interface ComplianceStatus {
  framework: ComplianceFramework;
  overallCompliance: number; // 0-100
  controls: ComplianceControl[];
  lastAssessment: Date;
  nextAssessment: Date;
  auditorNotes?: string;
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  required: boolean;
  implemented: boolean;
  compliant: boolean;
  evidence: string[];
  lastVerified?: Date;
  notes?: string;
}
