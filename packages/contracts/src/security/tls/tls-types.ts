/**
 * Canonical TLS & Database Transport Security Types
 */

import type { ConnectionOptions } from "node:tls";

export type DatabaseTlsMode = "DISABLED" | "VERIFY_CA" | "VERIFY_FULL";

export enum TlsErrorCode {
  UNTRUSTED_CA = "UNTRUSTED_CA",
  CERTIFICATE_EXPIRED = "CERTIFICATE_EXPIRED",
  HOSTNAME_MISMATCH = "HOSTNAME_MISMATCH",
  CERTIFICATE_REVOKED = "CERTIFICATE_REVOKED",
  TLS_HANDSHAKE_FAILED = "TLS_HANDSHAKE_FAILED",
  UNSUPPORTED_TLS_VERSION = "UNSUPPORTED_TLS_VERSION",
  CLIENT_CERTIFICATE_REQUIRED = "CLIENT_CERTIFICATE_REQUIRED",
  CLIENT_CERTIFICATE_REJECTED = "CLIENT_CERTIFICATE_REJECTED",
  INSECURE_OVERRIDE_FORBIDDEN = "INSECURE_OVERRIDE_FORBIDDEN",
}

export interface TrustedTlsOptions {
  enabled?: boolean;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer | Array<string | Buffer>;
  cert?: string | Buffer;
  key?: string | Buffer;
  servername?: string;
  minVersion?: "TLSv1.2" | "TLSv1.3";
  checkServerIdentity?: (servername: string, cert: any) => Error | undefined;
}

export interface DatabaseTlsConfigOptions {
  mode?: DatabaseTlsMode;
  ca?: string | Buffer;
  caFile?: string;
  cert?: string | Buffer;
  certFile?: string;
  key?: string | Buffer;
  keyFile?: string;
  rejectUnauthorized?: boolean;
  servername?: string;
  isProduction?: boolean;
}

export type DeviceTlsTrustState =
  | "TRUSTED"
  | "PINNED"
  | "SELF_SIGNED_UNAPPROVED"
  | "EXPIRED"
  | "HOSTNAME_MISMATCH"
  | "UNTRUSTED_CA"
  | "LEGACY_TLS"
  | "UNKNOWN";

export interface DeviceCertificateFingerprint {
  deviceId: string;
  algorithm: "sha256";
  fingerprint: string;
  approvedAt: string;
  approvedBy: string;
  expiresAt?: string;
  notes?: string;
}

export interface CertificateStatus {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  fingerprintSha256: string;
  state: "VALID" | "EXPIRING" | "EXPIRED" | "UNTRUSTED" | "HOSTNAME_MISMATCH";
}

export interface TlsScannerPolicyOptions {
  allowedCidrs?: string[];
  blockedCidrs?: string[];
  allowedPorts?: number[];
  allowPrivateIps?: boolean;
}
