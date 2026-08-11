/**
 * Certificate Security Types
 * Real X.509 certificate parsing and validation types with explicit evidence states
 */

// ============================================================================
// Certificate Parsing
// ============================================================================

export type CertificateParseStatus = 'PARSED' | 'INVALID' | 'UNSUPPORTED';

export interface ParsedCertificate {
  status: 'PARSED';
  fingerprint256: string;
  serialNumber: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  subjectAltNames: SubjectAltName[];
  publicKey: {
    type: string;
    size?: number;
    pem: string;
    fingerprint: string;
  };
  rawPem: string;
  rawDer: Buffer;
}

export interface CertificateParseFailure {
  status: 'INVALID' | 'UNSUPPORTED';
  error: string;
}

export type CertificateParseResult = ParsedCertificate | CertificateParseFailure;

export interface SubjectAltName {
  type: 'DNS' | 'IP' | 'URI' | 'EMAIL';
  value: string;
}

// ============================================================================
// Certificate Validation
// ============================================================================

export type TimeValidity = 'VALID' | 'NOT_YET_VALID' | 'EXPIRED' | 'UNKNOWN';
export type ChainValidity = 'TRUSTED' | 'UNTRUSTED' | 'INCOMPLETE' | 'UNKNOWN';
export type HostnameValidity = 'MATCH' | 'MISMATCH' | 'NOT_CHECKED';
export type RevocationStatus = 'GOOD' | 'REVOKED' | 'UNKNOWN';
export type OverallValidity = 'VALID' | 'INVALID' | 'UNKNOWN';

export interface CertificateValidationResult {
  parsed: boolean;
  timeValidity: TimeValidity;
  chain: ChainValidity;
  hostname: HostnameValidity;
  revocation: RevocationStatus;
  overall: OverallValidity;
  errors: string[];
  trustAnchorId?: string;
  trustSource?: TrustSource;
}

// ============================================================================
// Revocation
// ============================================================================

export type RevocationSource = 'OCSP' | 'CRL' | 'OCSP_STAPLED' | 'NONE';

export interface RevocationResult {
  status: RevocationStatus;
  source: RevocationSource;
  checkedAt: Date;
  thisUpdate?: Date;
  nextUpdate?: Date;
  responderUrl?: string;
  error?: string;
}

// ============================================================================
// Trust Store
// ============================================================================

export type TrustSource =
  | 'PUBLIC_CA'
  | 'PRIVATE_CA'
  | 'CUSTOMER_CA'
  | 'MANUFACTURER_CA'
  | 'PINNED';

export interface TrustAnchor {
  id: string;
  tenantId?: string;
  type: TrustSource;
  certificatePem: string;
  fingerprint: string;
  subject: string;
  enabled: boolean;
  createdAt: Date;
}

// ============================================================================
// Certificate Assessment
// ============================================================================

export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface CertificateAssessment {
  deviceId: string;
  observedAt: Date;
  certificate?: {
    fingerprintSha256: string;
    serialNumber: string;
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
    publicKeyAlgorithm: string;
    publicKeySize?: number;
    subjectAltNames: SubjectAltName[];
  };
  checks: {
    parsing: CheckStatus;
    time: CheckStatus;
    chain: CheckStatus;
    identity: CheckStatus;
    revocation: CheckStatus;
  };
  overall: OverallValidity;
  findings: SecurityFinding[];
  errors: string[];
  evidence: CertificateEvidence;
}

export interface SecurityFinding {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  recommendation?: string;
}

// ============================================================================
// Certificate Evidence
// ============================================================================

export type CertificateSource =
  | 'TLS_HANDSHAKE'
  | 'DEVICE_API'
  | 'FILE_IMPORT'
  | 'CONFIGURATION';

export type CertificateParser = 'NODE_X509' | 'OPENSSL';

export interface CertificateEvidence {
  source: CertificateSource;
  observedAt: Date;
  fingerprintSha256?: string;
  rawAvailable: boolean;
  parser: CertificateParser;
  simulated: false;
}

// ============================================================================
// Device Certificate Status
// ============================================================================

export type CertificateAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface DeviceCertificateStatus {
  availability: CertificateAvailability;
  parseStatus: CertificateParseStatus | 'UNKNOWN';
  validation: OverallValidity;
  certificate?: ParsedCertificate;
  validationResult?: CertificateValidationResult;
  error?: string;
}

// ============================================================================
// Certificate Discovery
// ============================================================================

export interface TLSCertificateInfo {
  raw: Buffer;
  peerCertificate: Buffer;
  intermediates: Buffer[];
  protocol: string;
  cipher: string;
}

// ============================================================================
// Certificate Change Events
// ============================================================================

export interface CertificateChangeEvent {
  type: 'certificate.changed';
  deviceId: string;
  tenantId: string;
  previousFingerprint: string;
  currentFingerprint: string;
  timestamp: Date;
  reason?: string;
}

// ============================================================================
// Certificate Configuration
// ============================================================================

export interface CertificatePolicy {
  expiryWarningDays: number;
  expiryCriticalDays: number;
  minKeySize: {
    rsa: number;
    ecdsa: number;
  };
  allowedSignatureAlgorithms: string[];
  requireOcspValidation: boolean;
  requireChainValidation: boolean;
}

// ============================================================================
// Certificate Storage
// ============================================================================

export interface StoredCertificate {
  id: string;
  tenantId: string;
  deviceId: string;
  fingerprintSha256: string;
  certificateDer: Buffer;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  discoveredAt: Date;
  parseStatus: CertificateParseStatus;
}

export interface StoredCertificateAssessment {
  id: string;
  tenantId: string;
  certificateId: string;
  assessedAt: Date;
  timeStatus: CheckStatus;
  chainStatus: CheckStatus;
  identityStatus: CheckStatus;
  revocationStatus: CheckStatus;
  overallStatus: OverallValidity;
  errorCode?: string;
  errorMessage?: string;
}
