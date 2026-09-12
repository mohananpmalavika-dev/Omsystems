/**
 * Mutual TLS (mTLS) Authentication Domain Contracts & Types
 * Authoritative banking-grade client certificate identity types.
 */

export type NodeRole =
  | "EDGE_AGENT"
  | "EDGE_GATEWAY"
  | "MEDIA_NODE"
  | "RECORDING_ENGINE"
  | "CONTROL_PLANE";

export type MtlsStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "SUSPENDED";

export type MtlsEnforcementMode = "ENFORCED" | "PERMISSIVE" | "DISABLED";

export interface TrustedCertificatePinRecord {
  id: string;
  nodeId: string;
  role: NodeRole;
  certFingerprint: string; // SHA-256 hex lowercase
  commonName?: string;
  allowedSans: string[];
  subjectDn?: string;
  issuerDn?: string;
  serialNumber?: string;
  notBefore?: string;
  notAfter?: string;
  status: MtlsStatus;
  revokedAt?: string;
  revocationReason?: string;
  pinnedBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PinCertificateInput {
  nodeId: string;
  role: NodeRole;
  certFingerprint: string;
  commonName?: string;
  allowedSans: string[];
  subjectDn?: string;
  issuerDn?: string;
  serialNumber?: string;
  notBefore?: Date | string;
  notAfter?: Date | string;
  pinnedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface MtlsRevocationRecord {
  fingerprint: string;
  serialNumber?: string;
  issuerDn?: string;
  reason: string;
  revokedBy: string;
  revokedAt: string;
}

export interface RevokeCertificateInput {
  fingerprint: string;
  serialNumber?: string;
  issuerDn?: string;
  reason: string;
  revokedBy: string;
}

export interface MtlsAuditEntry {
  id?: string;
  nodeId?: string;
  role?: NodeRole | string;
  fingerprint: string;
  clientIp?: string;
  endpoint?: string;
  decision: "ALLOWED" | "REJECTED";
  rejectionReason?: string;
  tlsVersion?: string;
  cipherSuite?: string;
  timestamp?: string;
}

export interface MtlsCertificateDetails {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  sans: string[];
  fingerprint: string;
}

export interface MtlsValidationResult {
  valid: boolean;
  nodeId?: string;
  role?: NodeRole;
  fingerprint?: string;
  rejectionReason?: string;
  certDetails?: MtlsCertificateDetails;
}

export interface MtlsMetrics {
  totalPinned: number;
  totalRevoked: number;
  activePins: number;
  totalAuditLogs: number;
}

export interface IMtlsRepository {
  pinCertificate(input: PinCertificateInput): Promise<TrustedCertificatePinRecord>;
  getPinByFingerprint(fingerprint: string): Promise<TrustedCertificatePinRecord | null>;
  listPins(role?: NodeRole): Promise<TrustedCertificatePinRecord[]>;
  deletePin(fingerprint: string): Promise<boolean>;
  revokeCertificate(input: RevokeCertificateInput): Promise<void>;
  isRevoked(fingerprint: string): Promise<boolean>;
  listRevokedCertificates(): Promise<MtlsRevocationRecord[]>;
  recordAuditLog(entry: MtlsAuditEntry): Promise<void>;
  getAuditLogs(filter?: { nodeId?: string; limit?: number; offset?: number }): Promise<MtlsAuditEntry[]>;
  getMetrics(): Promise<MtlsMetrics>;
}
