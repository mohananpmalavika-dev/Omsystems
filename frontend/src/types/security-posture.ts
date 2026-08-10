/**
 * Security Posture TypeScript Types
 * 
 * Type definitions for the enhanced security posture telemetry system.
 */

export interface SecurityTelemetryMetric {
  name: string;
  value: number;
  unit: string;
  
  // Provenance
  source: string;
  timestamp: Date;
  freshness: 'current' | 'stale' | 'unknown';
  available: boolean;
  confidence: number; // 0-1
  
  // Optional context
  metadata?: Record<string, any>;
  errorMessage?: string;
}

export interface SecurityPostureTelemetry {
  // Overall posture
  overallScore: number;
  overallConfidence: number;
  timestamp: Date;
  
  // Individual components with full telemetry
  encryption: EncryptionTelemetry;
  tls: TLSTelemetry;
  certificates: CertificateTelemetry;
  secureBoot: SecureBootTelemetry;
  tpm: TPMTelemetry;
  tamper: TamperTelemetry;
  ransomware: RansomwareTelemetry;
  secrets: SecretsTelemetry;
}

export interface EncryptionTelemetry {
  dataAtRest: SecurityTelemetryMetric;
  encryptedVideos: SecurityTelemetryMetric;
  encryptedRecordings: SecurityTelemetryMetric;
  keyRotation: SecurityTelemetryMetric;
  kmsAvailability: SecurityTelemetryMetric;
}

export interface TLSTelemetry {
  tlsVersion: SecurityTelemetryMetric;
  cipherStrength: SecurityTelemetryMetric;
  httpsOnly: SecurityTelemetryMetric;
  certValidation: SecurityTelemetryMetric;
  ocspStapling: SecurityTelemetryMetric;
}

export interface CertificateTelemetry {
  healthyCount: SecurityTelemetryMetric;
  expiringSoonCount: SecurityTelemetryMetric;
  expiredCount: SecurityTelemetryMetric;
  revokedCount: SecurityTelemetryMetric;
  averageDaysToExpiry: SecurityTelemetryMetric;
  rotationCompliance: SecurityTelemetryMetric;
}

export interface SecureBootTelemetry {
  enabled: SecurityTelemetryMetric;
  compliantDevices: SecurityTelemetryMetric;
  uefiValidation: SecurityTelemetryMetric;
  bootloaderIntegrity: SecurityTelemetryMetric;
}

export interface TPMTelemetry {
  tpmPresent: SecurityTelemetryMetric;
  tpmVersion: SecurityTelemetryMetric;
  attestationSuccess: SecurityTelemetryMetric;
  attestationFailures: SecurityTelemetryMetric;
  pcrValidation: SecurityTelemetryMetric;
}

export interface TamperTelemetry {
  activeEvents: SecurityTelemetryMetric;
  criticalEvents: SecurityTelemetryMetric;
  cameraCovers: SecurityTelemetryMetric;
  enclosureOpened: SecurityTelemetryMetric;
  sensorHealth: SecurityTelemetryMetric;
}

export interface RansomwareTelemetry {
  activeThreats: SecurityTelemetryMetric;
  suspiciousActivity: SecurityTelemetryMetric;
  rapidEncryption: SecurityTelemetryMetric;
  suspiciousProcesses: SecurityTelemetryMetric;
  protectionEnabled: SecurityTelemetryMetric;
}

export interface SecretsTelemetry {
  rotationCompliance: SecurityTelemetryMetric;
  expiringSecrets: SecurityTelemetryMetric;
  vaultAvailability: SecurityTelemetryMetric;
  accessAuditCompliance: SecurityTelemetryMetric;
}

export interface CollectorHealth {
  collectorId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastRunAt?: string;
  lastSuccessAt?: string;
  failures24h: number;
  averageDurationMs?: number;
  error?: string;
}

export interface CollectorHealthSummary {
  overall: 'healthy' | 'degraded' | 'failed';
  timestamp: string;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  totalCount: number;
  collectors: CollectorHealth[];
}
