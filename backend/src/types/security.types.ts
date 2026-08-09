/**
 * Enterprise Security Types
 * Core types for Zero Trust, HSM, Secret Vault, and advanced security features
 */

// ============================================================================
// Zero Trust Architecture
// ============================================================================

export interface ZeroTrustContext {
  userId: string;
  deviceId: string;
  deviceFingerprint: string;
  ipAddress: string;
  location: GeoLocation;
  timestamp: Date;
  sessionId: string;
  userAgent: string;
  tlsVersion?: string;
  certificateHash?: string;
}

export interface GeoLocation {
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface DeviceTrust {
  deviceId: string;
  trustLevel: TrustLevel;
  certificateValid: boolean;
  tpmAttested: boolean;
  secureBootEnabled: boolean;
  osVersion: string;
  lastSeen: Date;
  complianceStatus: ComplianceStatus;
  riskScore: number;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  riskScore: number;
  requiredActions: string[];
  conditions: AccessCondition[];
  expiresAt: Date;
}

export interface AccessCondition {
  type: 'MFA' | 'VPN' | 'TIME' | 'LOCATION' | 'DEVICE' | 'BEHAVIOR';
  required: boolean;
  satisfied: boolean;
  details: string;
}

export enum TrustLevel {
  UNKNOWN = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  FULL = 4
}

export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
  UNKNOWN = 'UNKNOWN',
  PENDING = 'PENDING'
}

// ============================================================================
// Secret Vault
// ============================================================================

export interface SecretVaultConfig {
  provider: SecretProvider;
  endpoint: string;
  namespace?: string;
  roleId?: string;
  secretId?: string;
  token?: string;
  region?: string;
  keyVaultName?: string;
  projectId?: string;
}

export enum SecretProvider {
  HASHICORP_VAULT = 'HASHICORP_VAULT',
  AZURE_KEY_VAULT = 'AZURE_KEY_VAULT',
  AWS_SECRETS_MANAGER = 'AWS_SECRETS_MANAGER',
  GCP_SECRET_MANAGER = 'GCP_SECRET_MANAGER',
  LOCAL_ENCRYPTED = 'LOCAL_ENCRYPTED'
}

export interface Secret {
  id: string;
  path: string;
  key: string;
  value: string;
  metadata: Record<string, any>;
  version: number;
  createdAt: Date;
  expiresAt?: Date;
  rotationPolicy?: RotationPolicy;
}

export interface RotationPolicy {
  enabled: boolean;
  intervalDays: number;
  lastRotated: Date;
  nextRotation: Date;
  autoRotate: boolean;
}

// ============================================================================
// Hardware Security Module (HSM)
// ============================================================================

export interface HSMConfig {
  provider: HSMProvider;
  endpoint: string;
  partition?: string;
  username?: string;
  password?: string;
  clientCertificate?: string;
  keyLabel: string;
}

export enum HSMProvider {
  THALES = 'THALES',
  UTIMACO = 'UTIMACO',
  ENTRUST = 'ENTRUST',
  AWS_CLOUDHSM = 'AWS_CLOUDHSM',
  AZURE_MANAGED_HSM = 'AZURE_MANAGED_HSM',
  SOFTHSM = 'SOFTHSM'
}

export interface HSMKey {
  id: string;
  label: string;
  algorithm: string;
  keyType: 'AES' | 'RSA' | 'ECDSA' | 'HMAC';
  keySize: number;
  usage: KeyUsage[];
  createdAt: Date;
  exportable: boolean;
}

export enum KeyUsage {
  ENCRYPT = 'ENCRYPT',
  DECRYPT = 'DECRYPT',
  SIGN = 'SIGN',
  VERIFY = 'VERIFY',
  WRAP = 'WRAP',
  UNWRAP = 'UNWRAP'
}

// ============================================================================
// Certificate Management
// ============================================================================

export interface Certificate {
  id: string;
  commonName: string;
  subjectAlternativeNames: string[];
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  keyAlgorithm: string;
  keySize: number;
  publicKey: string;
  privateKeyRef?: string; // Reference to HSM or vault
  certificateChain: string[];
  usage: CertificateUsage[];
  status: CertificateStatus;
  ocspUrl?: string;
  crlUrl?: string;
  autoRenew: boolean;
  deviceId?: string;
  deviceType?: string;
}

export enum CertificateUsage {
  SERVER_AUTH = 'SERVER_AUTH',
  CLIENT_AUTH = 'CLIENT_AUTH',
  CODE_SIGNING = 'CODE_SIGNING',
  EMAIL_PROTECTION = 'EMAIL_PROTECTION',
  DEVICE_IDENTITY = 'DEVICE_IDENTITY'
}

export enum CertificateStatus {
  VALID = 'VALID',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  INVALID = 'INVALID',
  UNKNOWN = 'UNKNOWN'
}

export interface CertificateHealth {
  totalCertificates: number;
  healthy: number;
  expiringSoon: number; // Within 30 days
  expired: number;
  revoked: number;
  invalid: number;
}

// ============================================================================
// Password Rotation
// ============================================================================

export interface PasswordRotationJob {
  id: string;
  targetType: RotationTargetType;
  targetId: string;
  targetName: string;
  status: RotationStatus;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  newPassword?: string; // Temporary, cleared after update
  oldPasswordBackup?: string; // Encrypted backup
  verificationStatus: VerificationStatus;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export enum RotationTargetType {
  CAMERA = 'CAMERA',
  RECORDER = 'RECORDER',
  SWITCH = 'SWITCH',
  FIREWALL = 'FIREWALL',
  LINUX_HOST = 'LINUX_HOST',
  WINDOWS_HOST = 'WINDOWS_HOST',
  DATABASE = 'DATABASE',
  API_KEY = 'API_KEY'
}

export enum RotationStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  VERIFYING = 'VERIFYING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK'
}

export enum VerificationStatus {
  NOT_VERIFIED = 'NOT_VERIFIED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED'
}

// ============================================================================
// Tamper Detection
// ============================================================================

export interface TamperEvent {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName: string;
  tamperType: TamperType;
  severity: TamperSeverity;
  classification: TamperClassification;
  detectedAt: Date;
  resolvedAt?: Date;
  description: string;
  evidenceUrls: string[];
  aiAnalysis?: TamperAIAnalysis;
  responseActions: string[];
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export enum TamperType {
  CAMERA_COVERED = 'CAMERA_COVERED',
  CAMERA_MOVED = 'CAMERA_MOVED',
  RECORDER_OPENED = 'RECORDER_OPENED',
  HDD_REMOVED = 'HDD_REMOVED',
  USB_INSERTED = 'USB_INSERTED',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  FIRMWARE_MODIFIED = 'FIRMWARE_MODIFIED',
  CLOCK_TAMPERING = 'CLOCK_TAMPERING',
  NETWORK_DISCONNECTED = 'NETWORK_DISCONNECTED',
  CABINET_OPENED = 'CABINET_OPENED',
  POWER_LOSS = 'POWER_LOSS',
  PHYSICAL_DAMAGE = 'PHYSICAL_DAMAGE'
}

export enum TamperSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum TamperClassification {
  ACCIDENTAL = 'ACCIDENTAL',
  MAINTENANCE = 'MAINTENANCE',
  SUSPICIOUS = 'SUSPICIOUS',
  MALICIOUS = 'MALICIOUS',
  UNKNOWN = 'UNKNOWN'
}

export interface TamperAIAnalysis {
  confidence: number;
  intent: 'ACCIDENTAL' | 'INTENTIONAL';
  riskScore: number;
  patterns: string[];
  recommendations: string[];
}

// ============================================================================
// Video Encryption
// ============================================================================

export interface VideoEncryptionConfig {
  enabled: boolean;
  algorithm: EncryptionAlgorithm;
  keyId: string;
  keyRotationDays: number;
  encryptInTransit: boolean;
  encryptAtRest: boolean;
  tlsVersion: string;
  cipherSuites: string[];
}

export enum EncryptionAlgorithm {
  AES_256_GCM = 'AES_256_GCM',
  AES_256_CBC = 'AES_256_CBC',
  CHACHA20_POLY1305 = 'CHACHA20_POLY1305'
}

export interface EncryptedVideo {
  id: string;
  originalPath: string;
  encryptedPath: string;
  keyId: string;
  algorithm: EncryptionAlgorithm;
  iv: string;
  authTag: string;
  metadata: Record<string, any>;
  encryptedAt: Date;
  size: number;
  checksum: string;
}

// ============================================================================
// Immutable Storage
// ============================================================================

export interface ImmutableObject {
  id: string;
  objectType: ImmutableObjectType;
  objectId: string;
  objectPath: string;
  retentionPolicy: RetentionPolicy;
  legalHold: boolean;
  legalHoldReason?: string;
  locked: boolean;
  lockedUntil: Date;
  createdAt: Date;
  checksum: string;
  size: number;
  metadata: Record<string, any>;
}

export enum ImmutableObjectType {
  VIDEO_RECORDING = 'VIDEO_RECORDING',
  EVIDENCE = 'EVIDENCE',
  AUDIT_LOG = 'AUDIT_LOG',
  INCIDENT_REPORT = 'INCIDENT_REPORT',
  INVESTIGATION = 'INVESTIGATION'
}

export interface RetentionPolicy {
  retentionDays: number;
  wormEnabled: boolean;
  deleteAfterRetention: boolean;
  extendable: boolean;
}

// ============================================================================
// Ransomware Detection
// ============================================================================

export interface RansomwareEvent {
  id: string;
  detectedAt: Date;
  severity: RansomwareSeverity;
  classification: RansomwareClassification;
  affectedDevices: string[];
  indicators: RansomwareIndicator[];
  aiAnalysis: RansomwareAIAnalysis;
  responseActions: RansomwareResponse[];
  resolved: boolean;
  resolvedAt?: Date;
}

export enum RansomwareSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum RansomwareClassification {
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  LIKELY_RANSOMWARE = 'LIKELY_RANSOMWARE',
  CONFIRMED_ATTACK = 'CONFIRMED_ATTACK'
}

export interface RansomwareIndicator {
  type: RansomwareIndicatorType;
  description: string;
  confidence: number;
  timestamp: Date;
  details: Record<string, any>;
}

export enum RansomwareIndicatorType {
  MASS_ENCRYPTION = 'MASS_ENCRYPTION',
  CPU_SPIKE = 'CPU_SPIKE',
  UNKNOWN_PROCESS = 'UNKNOWN_PROCESS',
  SERVICE_STOPPED = 'SERVICE_STOPPED',
  RAPID_FILE_DELETION = 'RAPID_FILE_DELETION',
  SMB_ANOMALY = 'SMB_ANOMALY',
  STORAGE_CORRUPTION = 'STORAGE_CORRUPTION',
  ENCRYPTION_EXTENSION = 'ENCRYPTION_EXTENSION',
  REGISTRY_CHANGES = 'REGISTRY_CHANGES',
  BACKUP_DELETION = 'BACKUP_DELETION'
}

export interface RansomwareAIAnalysis {
  overallRisk: number;
  attackStage: 'RECONNAISSANCE' | 'INITIAL_ACCESS' | 'EXECUTION' | 'ENCRYPTION' | 'EXTORTION';
  predictedImpact: string;
  recommendations: string[];
}

export interface RansomwareResponse {
  action: RansomwareResponseAction;
  targetDevice: string;
  executedAt: Date;
  success: boolean;
  details: string;
}

export enum RansomwareResponseAction {
  ISOLATE_DEVICE = 'ISOLATE_DEVICE',
  NOTIFY_SOC = 'NOTIFY_SOC',
  PRESERVE_LOGS = 'PRESERVE_LOGS',
  START_FORENSICS = 'START_FORENSICS',
  BLOCK_NETWORK = 'BLOCK_NETWORK',
  SNAPSHOT_STORAGE = 'SNAPSHOT_STORAGE',
  ALERT_ADMIN = 'ALERT_ADMIN'
}

// ============================================================================
// Supply Chain Verification
// ============================================================================

export interface SoftwarePackage {
  id: string;
  name: string;
  version: string;
  vendor: string;
  downloadUrl: string;
  sha256: string;
  sha512?: string;
  digitalSignature?: string;
  signerCertificate?: string;
  sbom?: SBOM;
  verified: boolean;
  verifiedAt?: Date;
  trustLevel: TrustLevel;
  vulnerabilities: Vulnerability[];
}

export interface SBOM {
  format: 'SPDX' | 'CycloneDX';
  version: string;
  components: SBOMComponent[];
  dependencies: SBOMDependency[];
}

export interface SBOMComponent {
  name: string;
  version: string;
  purl: string;
  licenses: string[];
  hashes: Record<string, string>;
}

export interface SBOMDependency {
  ref: string;
  dependsOn: string[];
}

export interface Vulnerability {
  id: string;
  cveId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  fixedVersion?: string;
  publishedAt: Date;
}

// ============================================================================
// Secure Boot & TPM
// ============================================================================

export interface SecureBootStatus {
  deviceId: string;
  enabled: boolean;
  bootChainValid: boolean;
  lastValidated: Date;
  stages: BootStage[];
  issues: string[];
}

export interface BootStage {
  name: string;
  hash: string;
  valid: boolean;
  timestamp: Date;
}

export interface TPMDevice {
  deviceId: string;
  tpmVersion: string;
  manufacturer: string;
  firmwareVersion: string;
  attestationValid: boolean;
  lastAttestation: Date;
  pcrValues: Record<string, string>;
  ekCertificate?: string;
  aikCertificate?: string;
  status: TPMStatus;
}

export enum TPMStatus {
  HEALTHY = 'HEALTHY',
  ATTESTATION_FAILED = 'ATTESTATION_FAILED',
  MISSING = 'MISSING',
  DISABLED = 'DISABLED',
  ERROR = 'ERROR'
}

// ============================================================================
// Security Operations Center (SOC)
// ============================================================================

export interface SecurityPosture {
  overallScore: number;
  timestamp: Date;
  provenance?: 'REAL' | 'DEGRADED' | 'UNAVAILABLE';
  available?: boolean;
  reason?: string;
  metrics: SecurityMetrics;
  alerts: SecurityAlert[];
  trends: SecurityTrend[];
}

export interface SecurityMetrics {
  zeroTrust: {
    score: number;
    devicesCompliant: number;
    devicesTotal: number;
    highRiskSessions: number;
  };
  encryption: {
    score: number;
    videosEncrypted: number;
    videosTotal: number;
    tlsCompliance: number;
  };
  certificates: {
    score: number;
    healthy: number;
    expiringSoon: number;
    expired: number;
    revoked: number;
  };
  secrets: {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNAVAILABLE';
    rotationCompliance: number;
    expiring: number;
  };
  ransomware: {
    activeThreats: number;
    eventsToday: number;
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNAVAILABLE';
    available: boolean;
  };
  tamper: {
    activeEvents: number;
    criticalEvents: number;
    resolvedToday: number;
    available: boolean;
  };
  secureBoot: {
    score: number;
    compliantDevices: number;
    totalDevices: number;
  };
  tpm: {
    score: number;
    attestedDevices: number;
    totalDevices: number;
    failedAttestations: number;
  };
}

export interface SecurityAlert {
  id: string;
  type: SecurityAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  timestamp: Date;
  source: string;
  acknowledged: boolean;
  resolvedAt?: Date;
  actions: string[];
}

export enum SecurityAlertType {
  ZERO_TRUST_VIOLATION = 'ZERO_TRUST_VIOLATION',
  CERTIFICATE_EXPIRED = 'CERTIFICATE_EXPIRED',
  PASSWORD_ROTATION_FAILED = 'PASSWORD_ROTATION_FAILED',
  TAMPER_DETECTED = 'TAMPER_DETECTED',
  RANSOMWARE_DETECTED = 'RANSOMWARE_DETECTED',
  SECURE_BOOT_FAILED = 'SECURE_BOOT_FAILED',
  TPM_ATTESTATION_FAILED = 'TPM_ATTESTATION_FAILED',
  ENCRYPTION_KEY_COMPROMISED = 'ENCRYPTION_KEY_COMPROMISED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  SUPPLY_CHAIN_RISK = 'SUPPLY_CHAIN_RISK'
}

export interface SecurityTrend {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  direction: 'UP' | 'DOWN' | 'STABLE';
}

// ============================================================================
// Security Policy
// ============================================================================

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyCondition {
  type: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'LESS_THAN';
  value: any;
}

export interface PolicyAction {
  type: 'ALLOW' | 'DENY' | 'CHALLENGE' | 'LOG' | 'ALERT';
  parameters: Record<string, any>;
}
