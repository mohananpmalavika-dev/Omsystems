/**
 * Security Posture Telemetry Service
 * 
 * Provides REAL security metrics with full provenance using adapter-based architecture:
 * - source: where the data came from
 * - timestamp: when it was collected
 * - freshness: is the data current or stale
 * - availability: is the service actually working
 * - confidence: how reliable is this measurement (0-1)
 * 
 * This service orchestrates multiple domain-specific adapters to collect telemetry
 * from actual infrastructure rather than generating placeholder data.
 */

import { NetworkSecurityAdapter } from '../security-posture/adapters/network-security.adapter';
import { EncryptionAdapter } from '../security-posture/adapters/encryption.adapter';
import { SecretsManagementAdapter } from '../security-posture/adapters/secrets-management.adapter';
import { ThreatDetectionAdapter } from '../security-posture/adapters/threat-detection.adapter';
import { PlatformIntegrityAdapter } from '../security-posture/adapters/platform-integrity.adapter';
import { createTenantContext } from '../security-posture/contracts/telemetry-context';
import type { SecurityTelemetryResult } from '../security-posture/contracts/telemetry-result';
import { getCollectorHealthService } from '../security-posture/services/collector-health.service';

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
  // Data at rest
  dataAtRest: SecurityTelemetryMetric;
  encryptedVideos: SecurityTelemetryMetric;
  encryptedRecordings: SecurityTelemetryMetric;
  
  // Key management
  keyRotation: SecurityTelemetryMetric;
  kmsAvailability: SecurityTelemetryMetric;
}

export interface TLSTelemetry {
  // TLS compliance
  tlsVersion: SecurityTelemetryMetric;
  cipherStrength: SecurityTelemetryMetric;
  httpsOnly: SecurityTelemetryMetric;
  
  // Certificate validation
  certValidation: SecurityTelemetryMetric;
  ocspStapling: SecurityTelemetryMetric;
}

export interface CertificateTelemetry {
  // Certificate health
  healthyCount: SecurityTelemetryMetric;
  expiringSoonCount: SecurityTelemetryMetric;
  expiredCount: SecurityTelemetryMetric;
  revokedCount: SecurityTelemetryMetric;
  
  // Lifecycle
  averageDaysToExpiry: SecurityTelemetryMetric;
  rotationCompliance: SecurityTelemetryMetric;
}

export interface SecureBootTelemetry {
  // Secure boot status
  enabled: SecurityTelemetryMetric;
  compliantDevices: SecurityTelemetryMetric;
  
  // UEFI validation
  uefiValidation: SecurityTelemetryMetric;
  bootloaderIntegrity: SecurityTelemetryMetric;
}

export interface TPMTelemetry {
  // TPM availability
  tpmPresent: SecurityTelemetryMetric;
  tpmVersion: SecurityTelemetryMetric;
  
  // Attestation
  attestationSuccess: SecurityTelemetryMetric;
  attestationFailures: SecurityTelemetryMetric;
  
  // Integrity
  pcrValidation: SecurityTelemetryMetric;
}

export interface TamperTelemetry {
  // Tamper detection
  activeEvents: SecurityTelemetryMetric;
  criticalEvents: SecurityTelemetryMetric;
  
  // Physical security
  cameraCovers: SecurityTelemetryMetric;
  enclosureOpened: SecurityTelemetryMetric;
  
  // Sensor health
  sensorHealth: SecurityTelemetryMetric;
}

export interface RansomwareTelemetry {
  // Threat detection
  activeThreats: SecurityTelemetryMetric;
  suspiciousActivity: SecurityTelemetryMetric;
  
  // File monitoring
  rapidEncryption: SecurityTelemetryMetric;
  suspiciousProcesses: SecurityTelemetryMetric;
  
  // Protection status
  protectionEnabled: SecurityTelemetryMetric;
}

export interface SecretsTelemetry {
  // Secret management
  rotationCompliance: SecurityTelemetryMetric;
  expiringSecrets: SecurityTelemetryMetric;
  
  // Vault health
  vaultAvailability: SecurityTelemetryMetric;
  accessAuditCompliance: SecurityTelemetryMetric;
}

export class SecurityPostureTelemetryService {
  private networkAdapter: NetworkSecurityAdapter;
  private encryptionAdapter: EncryptionAdapter;
  private secretsAdapter: SecretsManagementAdapter;
  private threatAdapter: ThreatDetectionAdapter;
  private platformAdapter: PlatformIntegrityAdapter;
  
  constructor() {
    // Initialize adapters
    this.networkAdapter = new NetworkSecurityAdapter();
    this.encryptionAdapter = new EncryptionAdapter();
    this.secretsAdapter = new SecretsManagementAdapter();
    this.threatAdapter = new ThreatDetectionAdapter();
    this.platformAdapter = new PlatformIntegrityAdapter();
    
    // Register adapters with health service
    const healthService = getCollectorHealthService();
    healthService.registerCollector(this.networkAdapter as any);
    healthService.registerCollector(this.encryptionAdapter as any);
    healthService.registerCollector(this.secretsAdapter as any);
    healthService.registerCollector(this.threatAdapter as any);
    healthService.registerCollector(this.platformAdapter as any);
  }
  
  /**
   * Collect comprehensive security telemetry
   */
  async collect(tenantId: string = 'default'): Promise<SecurityPostureTelemetry> {
    const timestamp = new Date();
    const context = createTenantContext(tenantId);
    
    // Collect from all adapters in parallel using Promise.allSettled
    const [
      networkResults,
      encryptionResults,
      secretsResults,
      threatResults,
      platformResults,
    ] = await Promise.allSettled([
      this.networkAdapter.collect(context),
      this.encryptionAdapter.collect(context),
      this.secretsAdapter.collect(context),
      this.threatAdapter.collect(context),
      this.platformAdapter.collect(context),
    ]);
    
    // Process adapter results into legacy telemetry format
    const encryption = this.mapEncryptionTelemetry(
      encryptionResults.status === 'fulfilled' ? encryptionResults.value : []
    );
    
    const tls = this.mapTLSTelemetry(
      networkResults.status === 'fulfilled' ? networkResults.value : []
    );
    
    const certificates = this.mapCertificateTelemetry(
      networkResults.status === 'fulfilled' ? networkResults.value : []
    );
    
    const secureBoot = this.mapSecureBootTelemetry(
      platformResults.status === 'fulfilled' ? platformResults.value : []
    );
    
    const tpm = this.mapTPMTelemetry(
      platformResults.status === 'fulfilled' ? platformResults.value : []
    );
    
    const tamper = this.mapTamperTelemetry(
      threatResults.status === 'fulfilled' ? threatResults.value : []
    );
    
    const ransomware = this.mapRansomwareTelemetry(
      threatResults.status === 'fulfilled' ? threatResults.value : []
    );
    
    const secrets = this.mapSecretsTelemetry(
      secretsResults.status === 'fulfilled' ? secretsResults.value : []
    );
    
    // Calculate overall score from available metrics
    const { score, confidence } = this.calculateOverallScore({
      encryption,
      tls,
      certificates,
      secureBoot,
      tpm,
      tamper,
      ransomware,
      secrets,
    });
    
    return {
      overallScore: score,
      overallConfidence: confidence,
      timestamp,
      encryption,
      tls,
      certificates,
      secureBoot,
      tpm,
      tamper,
      ransomware,
      secrets,
    };
  }

  /**
   * Map encryption adapter results to legacy telemetry format
   */
  private mapEncryptionTelemetry(results: SecurityTelemetryResult[]): EncryptionTelemetry {
    const timestamp = new Date();
    
    // Find specific metrics from adapter results
    const findMetric = (source: string) => results.find(r => r.source === source);
    
    const recordingEncryption = findMetric('recording-encryption');
    const storageEncryption = findMetric('storage-encryption');
    const kmsHealth = findMetric('kms-health');
    const keyRotation = findMetric('key-rotation');
    
    return {
      dataAtRest: this.mapToMetric(
        'Data at Rest Encryption',
        storageEncryption,
        'percentage',
        timestamp
      ),
      encryptedVideos: this.mapToMetric(
        'Encrypted Videos',
        recordingEncryption,
        'count',
        timestamp
      ),
      encryptedRecordings: this.mapToMetric(
        'Encrypted Recordings',
        recordingEncryption,
        'percentage',
        timestamp
      ),
      keyRotation: this.mapToMetric(
        'Key Rotation Compliance',
        keyRotation,
        'percentage',
        timestamp
      ),
      kmsAvailability: this.mapToMetric(
        'KMS Availability',
        kmsHealth,
        'percentage',
        timestamp
      ),
    };
  }

  /**
   * Map TLS adapter results to legacy telemetry format
   */
  private mapTLSTelemetry(results: SecurityTelemetryResult[]): TLSTelemetry {
    const timestamp = new Date();
    
    const tlsProtocol = results.find(r => r.source === 'tls-protocol');
    const cipherStrength = results.find(r => r.source === 'cipher-strength');
    const httpsEnforcement = results.find(r => r.source === 'https-enforcement');
    const certValidation = results.find(r => r.source === 'certificate-validation');
    
    return {
      tlsVersion: this.mapToMetric(
        'TLS Version Compliance',
        tlsProtocol,
        'percentage',
        timestamp
      ),
      cipherStrength: this.mapToMetric(
        'Cipher Strength',
        cipherStrength,
        'score',
        timestamp
      ),
      httpsOnly: this.mapToMetric(
        'HTTPS Only Enforcement',
        httpsEnforcement,
        'percentage',
        timestamp
      ),
      certValidation: this.mapToMetric(
        'Certificate Validation',
        certValidation,
        'percentage',
        timestamp
      ),
      ocspStapling: {
        name: 'OCSP Stapling',
        value: 0,
        unit: 'percentage',
        source: 'network-security:ocsp-stapling',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'OCSP stapling monitoring not yet implemented',
      },
    };
  }

  /**
   * Map certificate adapter results to legacy telemetry format
   */
  private mapCertificateTelemetry(results: SecurityTelemetryResult[]): CertificateTelemetry {
    const timestamp = new Date();
    
    const certValidation = results.find(r => r.source === 'certificate-validation');
    
    return {
      healthyCount: this.mapToMetric(
        'Healthy Certificates',
        certValidation,
        'count',
        timestamp
      ),
      expiringSoonCount: this.mapToMetric(
        'Certificates Expiring Soon',
        certValidation,
        'count',
        timestamp
      ),
      expiredCount: this.mapToMetric(
        'Expired Certificates',
        certValidation,
        'count',
        timestamp
      ),
      revokedCount: {
        name: 'Revoked Certificates',
        value: 0,
        unit: 'count',
        source: 'certificate-manager:revoked',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'Certificate revocation checking not yet implemented',
      },
      averageDaysToExpiry: this.mapToMetric(
        'Average Days to Expiry',
        certValidation,
        'days',
        timestamp
      ),
      rotationCompliance: {
        name: 'Rotation Compliance',
        value: 0,
        unit: 'percentage',
        source: 'certificate-manager:rotation',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'Certificate rotation monitoring not yet implemented',
      },
    };
  }
  
  /**
   * Map secure boot adapter results to legacy telemetry format
   */
  private mapSecureBootTelemetry(results: SecurityTelemetryResult[]): SecureBootTelemetry {
    const timestamp = new Date();
    
    const secureBoot = results.find(r => r.source === 'secure-boot');
    const platformBoot = results.find(r => r.source === 'platform-boot');
    
    return {
      enabled: this.mapToMetric(
        'Secure Boot Enabled',
        secureBoot,
        'count',
        timestamp
      ),
      compliantDevices: this.mapToMetric(
        'Compliant Devices',
        secureBoot,
        'count',
        timestamp
      ),
      uefiValidation: this.mapToMetric(
        'UEFI Validation',
        secureBoot,
        'percentage',
        timestamp
      ),
      bootloaderIntegrity: this.mapToMetric(
        'Bootloader Integrity',
        platformBoot,
        'percentage',
        timestamp
      ),
    };
  }
  
  /**
   * Map TPM adapter results to legacy telemetry format
   */
  private mapTPMTelemetry(results: SecurityTelemetryResult[]): TPMTelemetry {
    const timestamp = new Date();
    
    const tpm = results.find(r => r.source === 'tpm');
    const attestation = results.find(r => r.source === 'tpm-attestation');
    const pcr = results.find(r => r.source === 'pcr-validation');
    
    return {
      tpmPresent: this.mapToMetric(
        'TPM Present',
        tpm,
        'count',
        timestamp
      ),
      tpmVersion: this.mapToMetric(
        'TPM Version 2.0+',
        tpm,
        'count',
        timestamp
      ),
      attestationSuccess: this.mapToMetric(
        'Successful Attestations',
        attestation,
        'count',
        timestamp
      ),
      attestationFailures: this.mapToMetric(
        'Failed Attestations',
        attestation,
        'count',
        timestamp
      ),
      pcrValidation: this.mapToMetric(
        'PCR Validation',
        pcr,
        'percentage',
        timestamp
      ),
    };
  }
  
  /**
   * Map tamper adapter results to legacy telemetry format
   */
  private mapTamperTelemetry(results: SecurityTelemetryResult[]): TamperTelemetry {
    const timestamp = new Date();
    
    const cameraTamper = results.find(r => r.source === 'camera-tamper');
    const cameraCover = results.find(r => r.source === 'camera-cover');
    
    return {
      activeEvents: this.mapToMetric(
        'Active Tamper Events',
        cameraTamper,
        'count',
        timestamp
      ),
      criticalEvents: this.mapToMetric(
        'Critical Tamper Events',
        cameraTamper,
        'count',
        timestamp
      ),
      cameraCovers: this.mapToMetric(
        'Camera Covers Detected',
        cameraCover,
        'count',
        timestamp
      ),
      enclosureOpened: {
        name: 'Enclosure Opened Events',
        value: 0,
        unit: 'count',
        source: 'tamper-detection:enclosure-opened',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'Enclosure tamper detection not yet implemented',
      },
      sensorHealth: {
        name: 'Tamper Sensor Health',
        value: 0,
        unit: 'percentage',
        source: 'tamper-detection:sensor-health',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'Sensor health monitoring not yet implemented',
      },
    };
  }
  
  /**
   * Map ransomware adapter results to legacy telemetry format
   */
  private mapRansomwareTelemetry(results: SecurityTelemetryResult[]): RansomwareTelemetry {
    const timestamp = new Date();
    
    const ransomware = results.find(r => r.source === 'ransomware-detection');
    const suspiciousProcess = results.find(r => r.source === 'suspicious-process');
    
    return {
      activeThreats: this.mapToMetric(
        'Active Ransomware Threats',
        ransomware,
        'count',
        timestamp
      ),
      suspiciousActivity: this.mapToMetric(
        'Suspicious Activity',
        ransomware,
        'count',
        timestamp
      ),
      rapidEncryption: this.mapToMetric(
        'Rapid Encryption Events',
        ransomware,
        'count',
        timestamp
      ),
      suspiciousProcesses: this.mapToMetric(
        'Suspicious Processes',
        suspiciousProcess,
        'count',
        timestamp
      ),
      protectionEnabled: {
        name: 'Ransomware Protection Enabled',
        value: 0,
        unit: 'count',
        source: 'ransomware-detection:protection-enabled',
        timestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'Protection status monitoring not yet implemented',
      },
    };
  }
  
  /**
   * Map secrets adapter results to legacy telemetry format
   */
  private mapSecretsTelemetry(results: SecurityTelemetryResult[]): SecretsTelemetry {
    const timestamp = new Date();
    
    const vaultHealth = results.find(r => r.source === 'vault-health');
    const secretExpiration = results.find(r => r.source === 'secret-expiration');
    const secretRotation = results.find(r => r.source === 'secret-rotation');
    const accessAudit = results.find(r => r.source === 'access-audit');
    
    return {
      rotationCompliance: this.mapToMetric(
        'Secret Rotation Compliance',
        secretRotation,
        'percentage',
        timestamp
      ),
      expiringSecrets: this.mapToMetric(
        'Expiring Secrets',
        secretExpiration,
        'count',
        timestamp
      ),
      vaultAvailability: this.mapToMetric(
        'Vault Availability',
        vaultHealth,
        'percentage',
        timestamp
      ),
      accessAuditCompliance: this.mapToMetric(
        'Access Audit Compliance',
        accessAudit,
        'percentage',
        timestamp
      ),
    };
  }
  
  /**
   * Helper to map adapter result to legacy metric format
   */
  private mapToMetric(
    name: string,
    result: SecurityTelemetryResult | undefined,
    unit: string,
    fallbackTimestamp: Date
  ): SecurityTelemetryMetric {
    if (!result) {
      return {
        name,
        value: 0,
        unit,
        source: 'adapter:not-found',
        timestamp: fallbackTimestamp,
        freshness: 'unknown',
        available: false,
        confidence: 0,
        errorMessage: 'No data from adapter',
      };
    }
    
    // Map availability to freshness
    let freshness: 'current' | 'stale' | 'unknown' = 'unknown';
    if (result.available && result.quality.freshness > 0.8) {
      freshness = 'current';
    } else if (result.available && result.quality.freshness > 0.3) {
      freshness = 'stale';
    }
    
    // Extract numeric value from adapter result
    let value = 0;
    if (result.value && typeof result.value === 'object') {
      // Extract relevant numeric value based on telemetry type
      if ('score' in result.value) {
        value = result.value.score as number;
      } else if ('enabled' in result.value) {
        value = result.value.enabled ? 1 : 0;
      } else if ('reachable' in result.value) {
        value = result.value.reachable ? 100 : 0;
      } else if ('valid' in result.value) {
        value = result.value.valid ? 100 : 0;
      }
    }
    
    return {
      name,
      value,
      unit,
      source: result.source,
      timestamp: result.observedAt,
      freshness,
      available: result.available,
      confidence: result.quality.confidence,
      errorMessage: result.errorMessage,
      metadata: result.evidence,
    };
  }

  /**
   * Calculate overall security score from available metrics
   */
  private calculateOverallScore(telemetry: {
    encryption: EncryptionTelemetry;
    tls: TLSTelemetry;
    certificates: CertificateTelemetry;
    secureBoot: SecureBootTelemetry;
    tpm: TPMTelemetry;
    tamper: TamperTelemetry;
    ransomware: RansomwareTelemetry;
    secrets: SecretsTelemetry;
  }): { score: number; confidence: number } {
    // Collect all available metrics
    const availableMetrics: Array<{ value: number; confidence: number; weight: number }> = [];

    // Helper to add metrics from a category
    const addMetrics = (category: any, weight: number) => {
      for (const metric of Object.values(category) as SecurityTelemetryMetric[]) {
        if (metric.available && metric.confidence > 0) {
          availableMetrics.push({
            value: metric.value,
            confidence: metric.confidence,
            weight,
          });
        }
      }
    };

    // Add metrics with category weights
    addMetrics(telemetry.encryption, 0.20);
    addMetrics(telemetry.tls, 0.15);
    addMetrics(telemetry.certificates, 0.15);
    addMetrics(telemetry.secureBoot, 0.10);
    addMetrics(telemetry.tpm, 0.10);
    addMetrics(telemetry.tamper, 0.15);
    addMetrics(telemetry.ransomware, 0.10);
    addMetrics(telemetry.secrets, 0.05);

    if (availableMetrics.length === 0) {
      return { score: 0, confidence: 0 };
    }

    // Calculate weighted average score
    const totalWeight = availableMetrics.reduce((sum, m) => sum + m.weight, 0);
    const weightedScore = availableMetrics.reduce(
      (sum, m) => sum + (m.value * m.weight * m.confidence),
      0
    ) / totalWeight;

    // Calculate average confidence
    const avgConfidence = availableMetrics.reduce(
      (sum, m) => sum + m.confidence,
      0
    ) / availableMetrics.length;

    return {
      score: Math.round(weightedScore),
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }
}

/**
 * Singleton instance
 */
let instance: SecurityPostureTelemetryService | null = null;

export function getSecurityPostureTelemetryService(): SecurityPostureTelemetryService {
  if (!instance) {
    instance = new SecurityPostureTelemetryService();
  }
  return instance;
}
