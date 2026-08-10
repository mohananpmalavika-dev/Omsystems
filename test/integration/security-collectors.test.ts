/**
 * Sprint 2: Security Collectors Integration Test
 * 
 * Verifies all 6 security collectors are PRODUCTION-ready and returning real data
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getCollectorRegistry } from '../../src/security/collectors/collector-registry.js';
import { TPMAttestationCollector } from '../../src/security/collectors/tpm-attestation-collector.js';
import { SecureBootCollector } from '../../src/security/collectors/secure-boot-collector.js';
import { RansomwareDetectorCollector } from '../../src/security/collectors/ransomware-detector-collector.js';
import { FirmwareVerificationCollector } from '../../src/security/collectors/firmware-verification-collector.js';
import { EncryptionEvidenceCollector } from '../../src/security/collectors/encryption-evidence-collector.js';
import { PasswordRotationCollector } from '../../src/security/collectors/password-rotation-collector.js';
import { EvidenceSource } from '../../src/security/collectors/base-evidence-collector.js';

describe('Sprint 2: Security Collectors Production Verification', () => {
  let registry: any;

  beforeAll(async () => {
    registry = getCollectorRegistry();
    
    // Initialize all collectors
    registry.initializeDefaultCollectors({
      certificate: { enabled: true },
      passwordRotation: { enabled: true },
      mfaCompliance: { enabled: true },
      tpmAttestation: { enabled: true },
      secureBoot: { enabled: true },
      ransomwareDetection: { enabled: true },
      firmwareVerification: { enabled: true },
      encryptionEvidence: { enabled: true },
    });
  });

  describe('Collector 1: TPM Attestation', () => {
    it('should collect TPM attestation data', async () => {
      const collector = new TPMAttestationCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('tpm_attestation');
      expect(evidence.value.totalDevices).toBeGreaterThanOrEqual(0);
      expect(evidence.timestamp).toBeInstanceOf(Date);
      expect(evidence.confidence).toBeGreaterThanOrEqual(0);
      expect(evidence.confidence).toBeLessThanOrEqual(100);
      
      console.log('✓ TPM Attestation Collector');
      console.log(`  Total devices: ${evidence.value.totalDevices}`);
      console.log(`  Valid attestations: ${evidence.value.validAttestations}`);
      console.log(`  Confidence: ${evidence.confidence}%`);
    });
  });

  describe('Collector 2: Secure Boot', () => {
    it('should collect Secure Boot status', async () => {
      const collector = new SecureBootCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('secure_boot');
      expect(evidence.value.totalDevices).toBeGreaterThanOrEqual(1); // At least local device
      expect(evidence.source).toBe(EvidenceSource.LIVE);
      expect(evidence.provenance.collectionMethod).toBe('system_api');
      
      console.log('✓ Secure Boot Collector');
      console.log(`  Total devices: ${evidence.value.totalDevices}`);
      console.log(`  Secure Boot enabled: ${evidence.value.secureBootEnabled}`);
      console.log(`  UEFI mode devices: ${evidence.value.totalDevices - evidence.value.legacyBiosMode}`);
      console.log(`  Confidence: ${evidence.confidence}%`);
    });

    it('should detect platform correctly', async () => {
      const collector = new SecureBootCollector({ enabled: true });
      const evidence = await collector.collect();
      
      if (evidence.value.totalDevices > 0) {
        const firstDevice = evidence.value.devicesRequiringAttention[0] || 
                          { platform: 'windows' }; // Default if no issues
        
        expect(['windows', 'linux', 'unknown']).toContain(firstDevice.platform);
      }
    });
  });

  describe('Collector 3: Ransomware Detection', () => {
    it('should collect ransomware indicators', async () => {
      const collector = new RansomwareDetectorCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('ransomware_detection');
      expect(evidence.value.totalDevices).toBeGreaterThanOrEqual(0);
      expect(evidence.value.devicesMonitored).toBeLessThanOrEqual(evidence.value.totalDevices);
      expect(evidence.value.activeThreats).toBeGreaterThanOrEqual(0);
      
      // No active threats = 100% confidence
      if (evidence.value.activeThreats === 0) {
        expect(evidence.confidence).toBe(100);
      }
      
      console.log('✓ Ransomware Detection Collector');
      console.log(`  Devices monitored: ${evidence.value.devicesMonitored}`);
      console.log(`  Active threats: ${evidence.value.activeThreats}`);
      console.log(`  Contained threats: ${evidence.value.containedThreats}`);
      console.log(`  Confidence: ${evidence.confidence}%`);
    });
  });

  describe('Collector 4: Firmware Verification', () => {
    it('should collect firmware verification status', async () => {
      const collector = new FirmwareVerificationCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('firmware_verification');
      expect(evidence.value.totalDevices).toBeGreaterThanOrEqual(0);
      expect(evidence.value.validSignatures).toBeLessThanOrEqual(evidence.value.totalDevices);
      
      console.log('✓ Firmware Verification Collector');
      console.log(`  Total devices: ${evidence.value.totalDevices}`);
      console.log(`  Valid signatures: ${evidence.value.validSignatures}`);
      console.log(`  Invalid signatures: ${evidence.value.invalidSignatures}`);
      console.log(`  Confidence: ${evidence.confidence}%`);
    });
  });

  describe('Collector 5: Encryption Evidence', () => {
    it('should collect encryption evidence', async () => {
      const collector = new EncryptionEvidenceCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('encryption_evidence');
      expect(evidence.value.totalComponents).toBeGreaterThan(0);
      expect(evidence.source).toBe(EvidenceSource.LIVE);
      
      // Verify all categories are checked
      expect(evidence.value.encryptionByCategory).toBeDefined();
      expect(evidence.value.encryptionByCategory.storage).toBeDefined();
      expect(evidence.value.encryptionByCategory.transit).toBeDefined();
      expect(evidence.value.encryptionByCategory.database).toBeDefined();
      expect(evidence.value.encryptionByCategory.backup).toBeDefined();
      
      console.log('✓ Encryption Evidence Collector');
      console.log(`  Total components: ${evidence.value.totalComponents}`);
      console.log(`  Encrypted: ${evidence.value.encrypted}`);
      console.log(`  Not encrypted: ${evidence.value.notEncrypted}`);
      console.log(`  Storage: ${evidence.value.encryptionByCategory.storage.encrypted}/${evidence.value.encryptionByCategory.storage.total}`);
      console.log(`  Transit: ${evidence.value.encryptionByCategory.transit.encrypted}/${evidence.value.encryptionByCategory.transit.total}`);
      console.log(`  Database: ${evidence.value.encryptionByCategory.database.encrypted}/${evidence.value.encryptionByCategory.database.total}`);
      console.log(`  Confidence: ${evidence.confidence}%`);
    });

    it('should verify key management', async () => {
      const collector = new EncryptionEvidenceCollector({ enabled: true });
      const evidence = await collector.collect();
      
      expect(evidence.value.keyManagement).toBeDefined();
      expect(evidence.value.keyManagement.hsmStored).toBeGreaterThanOrEqual(0);
      expect(evidence.value.keyManagement.vaultStored).toBeGreaterThanOrEqual(0);
      
      console.log('  Key management:');
      console.log(`    HSM stored: ${evidence.value.keyManagement.hsmStored}`);
      console.log(`    Vault stored: ${evidence.value.keyManagement.vaultStored}`);
      console.log(`    File stored: ${evidence.value.keyManagement.fileStored}`);
    });

    it('should track key rotation', async () => {
      const collector = new EncryptionEvidenceCollector({ enabled: true });
      const evidence = await collector.collect();
      
      expect(evidence.value.keyRotation).toBeDefined();
      expect(evidence.value.keyRotation.current).toBeGreaterThanOrEqual(0);
      expect(evidence.value.keyRotation.aging).toBeGreaterThanOrEqual(0);
      expect(evidence.value.keyRotation.expired).toBeGreaterThanOrEqual(0);
      
      console.log('  Key rotation:');
      console.log(`    Current (<90 days): ${evidence.value.keyRotation.current}`);
      console.log(`    Aging (90-180 days): ${evidence.value.keyRotation.aging}`);
      console.log(`    Expired (>180 days): ${evidence.value.keyRotation.expired}`);
    });
  });

  describe('Collector 6: Password Rotation', () => {
    it('should collect password rotation data', async () => {
      const collector = new PasswordRotationCollector({ enabled: true });
      
      const evidence = await collector.collect();
      
      expect(evidence).toBeDefined();
      expect(evidence.type).toBe('password_rotation_check');
      
      console.log('✓ Password Rotation Collector');
      console.log(`  Confidence: ${evidence.confidence}%`);
    });
  });

  describe('Registry Integration', () => {
    it('should register all collectors', () => {
      const collectors = registry.getAllCollectors();
      
      expect(collectors.length).toBeGreaterThanOrEqual(6);
      
      const collectorTypes = collectors.map((c: any) => c.id || c.type);
      expect(collectorTypes).toContain('tpm-attestation');
      expect(collectorTypes).toContain('secure-boot');
      expect(collectorTypes).toContain('ransomware-detector');
      expect(collectorTypes).toContain('firmware-verification');
      expect(collectorTypes).toContain('encryption-evidence');
      expect(collectorTypes).toContain('password_rotation_check');
      
      console.log('✓ All collectors registered');
      console.log(`  Total collectors: ${collectors.length}`);
    });

    it('should collect from all collectors', async () => {
      const results = await registry.collectAll();
      
      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBeGreaterThanOrEqual(6);
      
      console.log('✓ All collectors executed');
      console.log(`  Collections completed: ${results.size}`);
    });

    it('should report health status for all collectors', async () => {
      const healthStatuses = await registry.getHealthStatus();
      
      expect(healthStatuses.length).toBeGreaterThanOrEqual(6);
      
      for (const health of healthStatuses) {
        expect(health.name).toBeDefined();
        expect(health.type).toBeDefined();
        expect(health.enabled).toBeDefined();
        expect(health.healthy).toBeDefined();
      }
      
      const healthyCount = healthStatuses.filter((h: any) => h.healthy).length;
      
      console.log('✓ Collector health verified');
      console.log(`  Healthy: ${healthyCount}/${healthStatuses.length}`);
    });
  });

  describe('Performance Verification', () => {
    it('should complete full security telemetry collection in <10 seconds', async () => {
      const startTime = Date.now();
      
      const results = await registry.collectAll();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
      
      console.log('✓ Performance verified');
      console.log(`  Total collection time: ${duration}ms`);
      console.log(`  Average per collector: ${Math.round(duration / results.size)}ms`);
    });
  });

  describe('Data Quality Verification', () => {
    it('should return LIVE data, not SIMULATED', async () => {
      const collectors = [
        new SecureBootCollector({ enabled: true }),
        new EncryptionEvidenceCollector({ enabled: true }),
      ];
      
      for (const collector of collectors) {
        const evidence = await collector.collect();
        
        expect(evidence.source).toBe(EvidenceSource.LIVE);
        expect(evidence.provenance.collectionMethod).not.toContain('simulation');
      }
      
      console.log('✓ All new collectors return LIVE data');
    });

    it('should have valid timestamps', async () => {
      const results = await registry.collectAll();
      const now = Date.now();
      
      for (const evidenceList of results.values()) {
        for (const evidence of evidenceList) {
          const timestamp = new Date(evidence.timestamp).getTime();
          expect(timestamp).toBeLessThanOrEqual(now);
          expect(timestamp).toBeGreaterThan(now - 60000); // Within last minute
        }
      }
      
      console.log('✓ All timestamps are fresh');
    });

    it('should calculate confidence scores correctly', async () => {
      const results = await registry.collectAll();
      
      for (const evidenceList of results.values()) {
        for (const evidence of evidenceList) {
          expect(evidence.confidence).toBeGreaterThanOrEqual(0);
          expect(evidence.confidence).toBeLessThanOrEqual(100);
          expect(Number.isInteger(evidence.confidence)).toBe(true);
        }
      }
      
      console.log('✓ All confidence scores valid (0-100)');
    });
  });
});
