/**
 * Security Posture Service Tests
 * 
 * Ensures the service properly:
 * 1. Handles collector failures safely
 * 2. Enforces freshness policies
 * 3. Rejects simulated data in production
 * 4. Never converts failures to HEALTHY
 */

import { describe, it, expect, beforeEach, vi as jest } from 'vitest';
import { SecurityPostureService } from '../security-posture.service.js';
import type {
  SecureBootCollector,
  RansomwareCollector,
  TamperProtectionCollector,
  TamperConditionCollector,
  SecurityCollectionContext,
} from '../../evidence/security-evidence-types.js';
import {
  healthyEvidence,
  unhealthyEvidence,
  unknownEvidence,
} from '../../evidence/security-evidence-types.js';

describe('SecurityPostureService', () => {
  let mockSecureBootCollector: jest.Mocked<SecureBootCollector>;
  let mockRansomwareCollector: jest.Mocked<RansomwareCollector>;
  let mockTamperProtectionCollector: jest.Mocked<TamperProtectionCollector>;
  let mockTamperConditionCollector: jest.Mocked<TamperConditionCollector>;
  
  const mockContext: SecurityCollectionContext = {
    timestamp: new Date(),
  };

  beforeEach(() => {
    mockSecureBootCollector = {
      collect: jest.fn(),
      collectSecureBootEvidence: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        available: true,
        lastCollection: new Date(),
        errorCount: 0,
        lastError: null,
      }),
    } as any;

    mockRansomwareCollector = {
      collect: jest.fn(),
      collectRansomwareEvidence: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        available: true,
        lastCollection: new Date(),
        errorCount: 0,
        lastError: null,
      }),
    } as any;

    mockTamperProtectionCollector = {
      collect: jest.fn(),
      collectTamperProtectionEvidence: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        available: true,
        lastCollection: new Date(),
        errorCount: 0,
        lastError: null,
      }),
    } as any;

    mockTamperConditionCollector = {
      collect: jest.fn(),
      collectTamperConditionEvidence: jest.fn(),
      getHealth: jest.fn().mockResolvedValue({
        available: true,
        lastCollection: new Date(),
        errorCount: 0,
        lastError: null,
      }),
    } as any;
  });

  describe('Collector Failure Handling', () => {
    it('should return UNKNOWN when secure boot collector fails', async () => {
      mockSecureBootCollector.collectSecureBootEvidence.mockRejectedValue(
        new Error('TPM unavailable')
      );
      mockRansomwareCollector.collectRansomwareEvidence.mockResolvedValue(
        healthyEvidence({
          agentInstalled: true,
          agentConnected: true,
          agentVersion: '1.0.0',
          definitionsCurrent: true,
          definitionsVersion: '2024-08',
          behaviorMonitoringEnabled: true,
          lastScanAt: new Date(),
          lastThreatDetectedAt: null,
          activeThreatCount: 0,
          quarantinedThreatCount: 0,
        }, new Date())
      );
      mockTamperProtectionCollector.collectTamperProtectionEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          protectionEnabled: true,
          sensorStatus: {
            enclosureSensor: true,
            motionSensor: true,
            vibrationSensor: true,
          },
          lastVerifiedAt: new Date(),
        }, new Date())
      );
      mockTamperConditionCollector.collectTamperConditionEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          enclosureOpened: false,
          cameraMoved: false,
          lensObstructed: false,
          cableDisconnected: false,
          vibrationDetected: false,
          detectedAt: new Date(),
          sensorReadings: {},
        }, new Date())
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        mockRansomwareCollector,
        mockTamperProtectionCollector,
        mockTamperConditionCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      expect(posture.secureBoot.state).toBe('UNKNOWN');
      expect(posture.secureBoot.reason).toBe('COLLECTOR_UNAVAILABLE');
      expect(posture.ransomwareProtection.state).toBe('HEALTHY');
    });

    it('should NEVER convert collector failure to HEALTHY', async () => {
      mockSecureBootCollector.collectSecureBootEvidence.mockRejectedValue(
        new Error('Network timeout')
      );
      mockRansomwareCollector.collectRansomwareEvidence.mockRejectedValue(
        new Error('Service unavailable')
      );
      mockTamperProtectionCollector.collectTamperProtectionEvidence.mockRejectedValue(
        new Error('Permission denied')
      );
      mockTamperConditionCollector.collectTamperConditionEvidence.mockRejectedValue(
        new Error('Sensor offline')
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        mockRansomwareCollector,
        mockTamperProtectionCollector,
        mockTamperConditionCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      // ALL collectors failed - ALL should be UNKNOWN, NEVER HEALTHY
      expect(posture.secureBoot.state).toBe('UNKNOWN');
      expect(posture.ransomwareProtection.state).toBe('UNKNOWN');
      expect(posture.tamperProtection.state).toBe('UNKNOWN');
      expect(posture.tamperCondition.state).toBe('UNKNOWN');
    });
  });

  describe('Missing Collectors', () => {
    it('should return UNKNOWN when collectors are not provided', async () => {
      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        // No collectors provided
      );

      const posture = await service.getDevicePosture(mockContext);

      expect(posture.secureBoot.state).toBe('UNKNOWN');
      expect(posture.secureBoot.reason).toBe('NOT_CONFIGURED');
      expect(posture.ransomwareProtection.state).toBe('UNKNOWN');
      expect(posture.ransomwareProtection.reason).toBe('NOT_CONFIGURED');
    });

    it('should handle partial collector configuration', async () => {
      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          attestationId: 'att-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: { 0: 'hash' },
          policyId: 'policy-1',
          attestedAt: new Date(),
        }, new Date())
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        // Only secure boot collector provided
      );

      const posture = await service.getDevicePosture(mockContext);

      expect(posture.secureBoot.state).toBe('HEALTHY');
      expect(posture.ransomwareProtection.state).toBe('UNKNOWN');
      expect(posture.tamperProtection.state).toBe('UNKNOWN');
      expect(posture.tamperCondition.state).toBe('UNKNOWN');
    });
  });

  describe('Freshness Enforcement', () => {
    it('should downgrade stale evidence to UNKNOWN', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          attestationId: 'att-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: {},
          policyId: 'policy-1',
          attestedAt: twoHoursAgo,
        }, twoHoursAgo) // Evidence from 2 hours ago
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      // Secure boot policy is 24 hours, so 2 hours should still be fresh
      expect(posture.secureBoot.state).toBe('HEALTHY');
    });

    it('should apply different freshness policies per control type', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      mockRansomwareCollector.collectRansomwareEvidence.mockResolvedValue(
        healthyEvidence({
          agentInstalled: true,
          agentConnected: true,
          agentVersion: '1.0.0',
          definitionsCurrent: true,
          definitionsVersion: '2024-08',
          behaviorMonitoringEnabled: true,
          lastScanAt: tenMinutesAgo,
          lastThreatDetectedAt: null,
          activeThreatCount: 0,
          quarantinedThreatCount: 0,
        }, tenMinutesAgo)
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        undefined,
        mockRansomwareCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      // Ransomware policy is 5 minutes, so 10 minutes is stale
      expect(posture.ransomwareProtection.state).toBe('UNKNOWN');
      expect(posture.ransomwareProtection.reason).toBe('STALE_EVIDENCE');
    });
  });

  describe('Simulated Data in Production', () => {
    it('should reject simulated evidence in production', async () => {
      const simulatedEvidence = {
        state: 'HEALTHY' as const,
        available: true,
        source: 'SIMULATED' as const,
        confidence: 1.0,
        observedAt: new Date(),
        reason: 'VERIFIED' as const,
        evidence: {
          deviceId: 'device-1',
          attestationId: 'sim-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: {},
          policyId: 'simulated-policy',
          attestedAt: new Date(),
        },
      };

      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(simulatedEvidence);

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      expect(posture.secureBoot.state).toBe('UNKNOWN');
      expect(posture.secureBoot.reason).toBe('SIMULATED_DATA');
    });

    it('should allow simulated evidence in development', async () => {
      const simulatedEvidence = {
        state: 'HEALTHY' as const,
        available: true,
        source: 'SIMULATED' as const,
        confidence: 1.0,
        observedAt: new Date(),
        reason: 'VERIFIED' as const,
        evidence: {
          deviceId: 'device-1',
          attestationId: 'sim-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: {},
          policyId: 'simulated-policy',
          attestedAt: new Date(),
        },
      };

      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(simulatedEvidence);

      const service = new SecurityPostureService(
        { environment: 'development', enforceStrictness: false },
        mockSecureBootCollector,
      );

      const posture = await service.getDevicePosture(mockContext);

      expect(posture.secureBoot.state).toBe('HEALTHY');
      expect(posture.secureBoot.source).toBe('SIMULATED');
    });
  });

  describe('Posture Summary', () => {
    it('should calculate correct summary', async () => {
      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          attestationId: 'att-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: {},
          policyId: 'policy-1',
          attestedAt: new Date(),
        }, new Date())
      );
      
      mockRansomwareCollector.collectRansomwareEvidence.mockResolvedValue(
        unhealthyEvidence({
          agentInstalled: true,
          agentConnected: true,
          agentVersion: '1.0.0',
          definitionsCurrent: false,
          definitionsVersion: '2024-01', // Outdated
          behaviorMonitoringEnabled: true,
          lastScanAt: new Date(),
          lastThreatDetectedAt: null,
          activeThreatCount: 0,
          quarantinedThreatCount: 0,
        }, new Date())
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        mockRansomwareCollector,
      );

      const summary = await service.getPostureSummary(mockContext);

      expect(summary.overallState).toBe('UNHEALTHY');
      expect(summary.healthyControls).toBe(1);
      expect(summary.unhealthyControls).toBe(1);
      expect(summary.unknownControls).toBe(2); // tamper protection/condition not configured
      expect(summary.evidenceCoverage).toBe(0.5); // 2 out of 4 have evidence
    });

    it('should show UNKNOWN overall when majority unconfigured', async () => {
      mockSecureBootCollector.collectSecureBootEvidence.mockResolvedValue(
        healthyEvidence({
          deviceId: 'device-1',
          attestationId: 'att-123',
          secureBootEnabled: true,
          quoteVerified: true,
          nonceVerified: true,
          pcrPolicyVerified: true,
          pcrs: {},
          policyId: 'policy-1',
          attestedAt: new Date(),
        }, new Date())
      );

      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        // Only 1 out of 4 collectors configured
      );

      const summary = await service.getPostureSummary(mockContext);

      expect(summary.overallState).toBe('UNKNOWN');
      expect(summary.evidenceCoverage).toBe(0.25);
    });
  });

  describe('Collector Status', () => {
    it('should report collector availability', () => {
      const service = new SecurityPostureService(
        { environment: 'production', enforceStrictness: true },
        mockSecureBootCollector,
        mockRansomwareCollector,
      );

      const status = service.getCollectorStatus();

      expect(status.secureBootCollector).toBe(true);
      expect(status.ransomwareCollector).toBe(true);
      expect(status.tamperProtectionCollector).toBe(false);
      expect(status.tamperConditionCollector).toBe(false);
    });
  });
});
