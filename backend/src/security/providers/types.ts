/**
 * Zero Trust Provider Types
 * Type definitions for all security provider layers
 */

// ============================================================================
// Common Types
// ============================================================================

export enum SecurityVerdict {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  CHALLENGE = 'CHALLENGE',
  REVIEW = 'REVIEW'
}

export enum ThreatLevel {
  NONE = 0,
  LOW = 25,
  MEDIUM = 50,
  HIGH = 75,
  CRITICAL = 100
}

export interface ProviderContext {
  requestId: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  resource: string;
  action: string;
  metadata?: Record<string, any>;
}

export interface ProviderResult {
  verdict: SecurityVerdict;
  score: number; // 0-100, higher = more risk
  confidence: number; // 0-1, how confident in this assessment
  reason: string;
  evidence: Record<string, any>;
  requiredActions?: string[];
  expiresAt?: Date;
}

// ============================================================================
// Identity Provider Types
// ============================================================================

export interface IdentityVerificationResult extends ProviderResult {
  userExists: boolean;
  accountActive: boolean;
  accountLocked: boolean;
  passwordExpired: boolean;
  sessionValid: boolean;
  identityClaims: IdentityClaim[];
}

export interface IdentityClaim {
  type: 'email' | 'phone' | 'employee_id' | 'department' | 'role' | 'custom';
  value: string;
  verified: boolean;
  verifiedAt?: Date;
}

export interface UserContext {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  departments: string[];
  employeeId?: string;
  accountCreatedAt: Date;
  lastPasswordChange: Date;
  lastSuccessfulLogin?: Date;
  failedLoginAttempts: number;
}

// ============================================================================
// MFA Provider Types
// ============================================================================

export interface MFAVerificationResult extends ProviderResult {
  mfaEnabled: boolean;
  mfaVerified: boolean;
  mfaMethod?: MFAMethod;
  lastMFATime?: Date;
  backupCodesRemaining?: number;
}

export enum MFAMethod {
  TOTP = 'TOTP',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  BACKUP_CODE = 'BACKUP_CODE',
  HARDWARE_TOKEN = 'HARDWARE_TOKEN',
  BIOMETRIC = 'BIOMETRIC'
}

export interface TOTPSecret {
  userId: string;
  secret: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: number;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface BackupCode {
  userId: string;
  codeHash: string;
  used: boolean;
  usedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// Device Identity Provider Types
// ============================================================================

export interface DeviceVerificationResult extends ProviderResult {
  deviceKnown: boolean;
  deviceTrusted: boolean;
  deviceFingerprint: string;
  deviceMetadata: DeviceMetadata;
  firstSeen?: Date;
  lastSeen?: Date;
  anomalies: DeviceAnomaly[];
}

export interface DeviceMetadata {
  deviceId: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'server' | 'iot' | 'unknown';
  os: string;
  osVersion: string;
  browser?: string;
  browserVersion?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  userAgent: string;
  hardwareFingerprint?: string;
}

export interface DeviceFingerprint {
  deviceId: string;
  userId: string;
  fingerprint: string;
  components: {
    canvas?: string;
    webgl?: string;
    audio?: string;
    fonts?: string[];
    plugins?: string[];
    hardware?: string;
  };
  createdAt: Date;
  lastUpdated: Date;
}

export interface DeviceAnomaly {
  type: 'user_agent_change' | 'timezone_change' | 'screen_change' | 'new_device' | 'rapid_device_switch';
  severity: ThreatLevel;
  description: string;
  detectedAt: Date;
}

// ============================================================================
// Certificate Provider Types
// ============================================================================

export interface CertificateVerificationResult extends ProviderResult {
  certificatePresent: boolean;
  certificateValid: boolean;
  certificateExpired: boolean;
  tpmAttested: boolean;
  chainValid: boolean;
  certificateDetails?: CertificateDetails;
}

export interface CertificateDetails {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  publicKey: string;
  signatureAlgorithm: string;
  fingerprint: string;
  extensions?: Record<string, any>;
}

export interface TPMAttestation {
  deviceId: string;
  attestationData: string;
  nonce: string;
  timestamp: Date;
  pcrs?: Record<string, string>; // Platform Configuration Registers
  verified: boolean;
}

// ============================================================================
// Network Trust Provider Types
// ============================================================================

export interface NetworkVerificationResult extends ProviderResult {
  ipReputation: IPReputation;
  locationTrust: LocationTrust;
  vpnDetected: boolean;
  proxyDetected: boolean;
  torDetected: boolean;
  threats: NetworkThreat[];
}

export interface IPReputation {
  ipAddress: string;
  score: number; // 0-100, higher = more trustworthy
  categories: string[]; // e.g., 'vpn', 'proxy', 'tor', 'datacenter', 'residential'
  isKnownThreat: boolean;
  isBotnet: boolean;
  lastSeen: Date;
  source: string; // reputation source
}

export interface LocationTrust {
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isKnownLocation: boolean;
  impossibleTravel: boolean;
  distance?: number; // km from last location
  timeElapsed?: number; // seconds since last access
  maxPossibleSpeed?: number; // km/h
}

export interface NetworkThreat {
  type: 'malicious_ip' | 'brute_force' | 'port_scan' | 'ddos' | 'unknown';
  severity: ThreatLevel;
  description: string;
  detectedAt: Date;
  source: string;
}

// ============================================================================
// Risk Engine Types
// ============================================================================

export interface RiskAssessmentResult extends ProviderResult {
  riskScore: number;
  riskLevel: ThreatLevel;
  riskFactors: RiskFactor[];
  anomalies: Anomaly[];
  behaviorProfile?: BehaviorProfile;
}

export interface RiskFactor {
  category: 'identity' | 'device' | 'network' | 'behavior' | 'temporal';
  factor: string;
  weight: number;
  score: number;
  description: string;
}

export interface Anomaly {
  type: 'velocity' | 'location' | 'time' | 'resource' | 'behavior' | 'device';
  severity: ThreatLevel;
  description: string;
  expectedValue?: any;
  actualValue: any;
  deviation: number; // how far from normal (standard deviations)
}

export interface BehaviorProfile {
  userId: string;
  normalAccessTimes: TimePattern[];
  normalLocations: string[];
  normalDevices: string[];
  normalResources: string[];
  averageSessionDuration: number;
  typicalRequestRate: number;
  lastUpdated: Date;
}

export interface TimePattern {
  dayOfWeek: number; // 0-6
  hourStart: number; // 0-23
  hourEnd: number;
  frequency: number; // 0-1
}

// ============================================================================
// Authorization Policy Types
// ============================================================================

export interface AuthorizationResult extends ProviderResult {
  authorized: boolean;
  matchedPolicies: PolicyMatch[];
  effectivePermissions: Permission[];
  conditions: PolicyCondition[];
}

export interface PolicyMatch {
  policyId: string;
  policyName: string;
  effect: 'allow' | 'deny';
  priority: number;
  matchedConditions: string[];
}

export interface Permission {
  resource: string;
  actions: string[];
  conditions?: PolicyCondition[];
  expiresAt?: Date;
}

export interface PolicyCondition {
  type: 'time' | 'location' | 'device' | 'mfa' | 'risk' | 'approval';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value: any;
  satisfied: boolean;
  required: boolean;
  reason?: string;
}

export interface AttributeSet {
  subject: Record<string, any>; // user attributes
  resource: Record<string, any>; // resource attributes
  environment: Record<string, any>; // context attributes
  action: string;
}

// ============================================================================
// Provider Interfaces
// ============================================================================

export interface ISecurityProvider {
  readonly name: string;
  readonly version: string;
  
  verify(context: ProviderContext): Promise<ProviderResult>;
  healthCheck(): Promise<boolean>;
}

export interface IIdentityProvider extends ISecurityProvider {
  verify(context: ProviderContext): Promise<IdentityVerificationResult>;
  getUserContext(userId: string): Promise<UserContext | null>;
  validateSession(sessionId: string): Promise<boolean>;
  recordLoginAttempt(userId: string, success: boolean): Promise<void>;
}

export interface IMFAProvider extends ISecurityProvider {
  verify(context: ProviderContext): Promise<MFAVerificationResult>;
  enrollMFA(userId: string, method: MFAMethod): Promise<{ secret?: string; backupCodes?: string[] }>;
  verifyTOTP(userId: string, token: string): Promise<boolean>;
  verifyBackupCode(userId: string, code: string): Promise<boolean>;
  generateBackupCodes(userId: string): Promise<string[]>;
}

export interface IDeviceProvider extends ISecurityProvider {
  verify(context: ProviderContext): Promise<DeviceVerificationResult>;
  registerDevice(deviceId: string, userId: string, metadata: DeviceMetadata): Promise<void>;
  getDeviceFingerprint(deviceId: string): Promise<DeviceFingerprint | null>;
  detectAnomalies(context: ProviderContext, previousMetadata?: DeviceMetadata): Promise<DeviceAnomaly[]>;
}

export interface ICertificateProvider extends ISecurityProvider {
  verify(context: ProviderContext): Promise<CertificateVerificationResult>;
  validateCertificate(certificate: string): Promise<boolean>;
  validateTPMAttestation(attestation: TPMAttestation): Promise<boolean>;
  verifyCertificateChain(certificate: string): Promise<boolean>;
}

export interface INetworkProvider extends ISecurityProvider {
  verify(context: ProviderContext): Promise<NetworkVerificationResult>;
  checkIPReputation(ipAddress: string): Promise<IPReputation>;
  detectImpossibleTravel(userId: string, currentLocation: { lat: number; lon: number }): Promise<boolean>;
  detectVPN(ipAddress: string): Promise<boolean>;
}

export interface IRiskEngine extends ISecurityProvider {
  verify(context: ProviderContext): Promise<RiskAssessmentResult>;
  calculateRiskScore(factors: RiskFactor[]): number;
  getBehaviorProfile(userId: string): Promise<BehaviorProfile | null>;
  updateBehaviorProfile(userId: string, context: ProviderContext): Promise<void>;
  detectAnomalies(context: ProviderContext, profile?: BehaviorProfile): Promise<Anomaly[]>;
}

export interface IAuthorizationEngine extends ISecurityProvider {
  verify(context: ProviderContext): Promise<AuthorizationResult>;
  evaluatePolicies(attributes: AttributeSet): Promise<PolicyMatch[]>;
  checkPermission(userId: string, resource: string, action: string): Promise<boolean>;
  getEffectivePermissions(userId: string): Promise<Permission[]>;
}

// ============================================================================
// Zero Trust Orchestrator Types
// ============================================================================

export interface ZeroTrustDecision {
  verdict: SecurityVerdict;
  riskScore: number;
  providerResults: {
    identity?: IdentityVerificationResult;
    mfa?: MFAVerificationResult;
    device?: DeviceVerificationResult;
    certificate?: CertificateVerificationResult;
    network?: NetworkVerificationResult;
    risk?: RiskAssessmentResult;
    authorization?: AuthorizationResult;
  };
  requiredActions: string[];
  blockers: string[];
  warnings: string[];
  expiresAt: Date;
  evaluatedAt: Date;
  processingTimeMs: number;
}

export interface ProviderChain {
  providers: ISecurityProvider[];
  stopOnFailure: boolean;
  minimumScore?: number;
  requiredProviders?: string[];
}
