/**
 * Pattern Anonymizer Service Tests
 * 
 * Tests for privacy-preserving pattern anonymization
 */

import { PatternAnonymizerService } from '../pattern-anonymizer.service';
import type { LocalIncident } from '../pattern-anonymizer.service';

describe('PatternAnonymizerService', () => {
  let anonymizer: PatternAnonymizerService;
  
  beforeEach(() => {
    anonymizer = new PatternAnonymizerService('test-salt-123');
  });
  
  describe('anonymizeIncident', () => {
    it('should anonymize a basic incident', () => {
      const incident: LocalIncident = {
        id: 'incident-001',
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        detectionType: 'shoplifting',
        severity: 'P2',
        category: 'theft',
        occurredAt: new Date('2026-09-24T14:30:00Z'),
        detectedAt: new Date('2026-09-24T14:30:00Z'),
        cameraId: 'camera-789',
        cameraName: 'Store Front Camera',
        aiCapabilities: ['person-detection', 'behavior-analysis'],
        confidence: 0.85,
        outcome: 'detected-during',
        industryVertical: 'retail',
        facilityType: 'store',
      };
      
      const pattern = anonymizer.anonymizeIncident(incident);
      
      // Should have a generated pattern ID
      expect(pattern.id).toMatch(/^pattern-[a-f0-9]{16}$/);
      
      // Should map category correctly
      expect(pattern.category).toBe('theft');
      
      // Should map severity
      expect(pattern.severity).toBe('high');
      
      // Should anonymize timestamp to hour bucket
      expect(pattern.occurredAt.getMinutes()).toBe(0);
      expect(pattern.occurredAt.getSeconds()).toBe(0);
      
      // Should extract time of day
      expect(pattern.timeOfDay).toBe('afternoon');
      
      // Should extract day of week
      expect(pattern.dayOfWeek).toBe('thursday');
      
      // Should anonymize location
      expect(pattern.industryVertical).toBe('retail');
      expect(pattern.locationCategory).toBe('store');
      
      // Should preserve AI capabilities
      expect(pattern.aiCapabilitiesInvolved).toEqual(['person-detection', 'behavior-analysis']);
      
      // Should have anonymized deployment ID
      expect(pattern.contributingDeploymentId).toMatch(/^deployment-[a-f0-9]{12}$/);
      
      // Should initialize match count
      expect(pattern.matchCount).toBe(0);
    });
    
    it('should anonymize behavioral metadata', () => {
      const incident: LocalIncident = {
        id: 'incident-002',
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        detectionType: 'loitering',
        severity: 'P3',
        category: 'security',
        occurredAt: new Date('2026-09-24T02:30:00Z'),
        detectedAt: new Date('2026-09-24T02:30:00Z'),
        cameraId: 'camera-789',
        cameraName: 'Parking Lot Camera',
        metadata: {
          dwellTime: 45,
          actorCount: 2,
          toolsDetected: ['crowbar', 'flashlight'],
          vehiclePresent: true,
          coordinatedActivity: true,
        },
        aiCapabilities: ['person-detection', 'loitering'],
        confidence: 0.92,
        responseTime: 180,
        outcome: 'prevented',
        industryVertical: 'retail',
        facilityType: 'store',
      };
      
      const pattern = anonymizer.anonymizeIncident(incident);
      
      // Should describe approach pattern
      expect(pattern.behavioralSignature.approachPattern).toBe('extended-observation');
      
      // Should preserve tools
      expect(pattern.behavioralSignature.toolsUsed).toEqual(['crowbar', 'flashlight']);
      
      // Should preserve actor count
      expect(pattern.behavioralSignature.actorCount).toBe(2);
      
      // Should preserve vehicle flag
      expect(pattern.behavioralSignature.vehicleInvolved).toBe(true);
      
      // Should preserve coordination flag
      expect(pattern.behavioralSignature.coordinatedAttack).toBe(true);
      
      // Should preserve response time
      expect(pattern.responseTime).toBe(180);
      
      // Time of day should be night
      expect(pattern.timeOfDay).toBe('night');
    });
    
    it('should handle incidents with minimal metadata', () => {
      const incident: LocalIncident = {
        id: 'incident-003',
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        detectionType: 'motion',
        severity: 'P4',
        category: 'security',
        occurredAt: new Date('2026-09-24T10:00:00Z'),
        detectedAt: new Date('2026-09-24T10:00:00Z'),
        cameraId: 'camera-789',
        cameraName: 'Entrance Camera',
        aiCapabilities: ['motion-detection'],
        confidence: 0.65,
        outcome: 'unknown',
        industryVertical: 'corporate',
        facilityType: 'office',
      };
      
      const pattern = anonymizer.anonymizeIncident(incident);
      
      // Should still generate valid pattern
      expect(pattern.id).toBeTruthy();
      expect(pattern.category).toBe('intrusion');
      expect(pattern.severity).toBe('low');
      
      // Behavioral signature should handle undefined values
      expect(pattern.behavioralSignature.approachPattern).toBeUndefined();
      expect(pattern.behavioralSignature.toolsUsed).toBeUndefined();
      expect(pattern.behavioralSignature.actorCount).toBeUndefined();
    });
  });
  
  describe('verifyNoPII', () => {
    it('should pass valid anonymized pattern', () => {
      const pattern = {
        id: 'pattern-test001',
        category: 'theft' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        occurredAt: new Date(),
        timeOfDay: 'afternoon' as const,
        dayOfWeek: 'monday',
        industryVertical: 'retail' as const,
        locationCategory: 'store' as const,
        behavioralSignature: {},
        detectionMethods: ['motion-detection'],
        aiCapabilitiesInvolved: ['person-detection'],
        outcome: 'prevented' as const,
        contributingDeploymentId: 'deployment-abc123',
        sharedAt: new Date(),
        verificationStatus: 'unverified' as const,
        matchCount: 0,
      };
      
      const check = anonymizer.verifyNoPII(pattern);
      
      expect(check.safe).toBe(true);
      expect(check.violations).toEqual([]);
    });
    
    it('should detect GPS coordinates', () => {
      const pattern = {
        id: 'pattern-test002',
        latitude: 40.7128, // PII!
        longitude: -74.0060, // PII!
        category: 'theft' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        occurredAt: new Date(),
        timeOfDay: 'afternoon' as const,
        dayOfWeek: 'monday',
        industryVertical: 'retail' as const,
        locationCategory: 'store' as const,
        behavioralSignature: {},
        detectionMethods: ['motion-detection'],
        aiCapabilitiesInvolved: ['person-detection'],
        outcome: 'prevented' as const,
        contributingDeploymentId: 'deployment-abc123',
        sharedAt: new Date(),
        verificationStatus: 'unverified' as const,
        matchCount: 0,
      } as any;
      
      const check = anonymizer.verifyNoPII(pattern);
      
      expect(check.safe).toBe(false);
      expect(check.violations).toContain('Contains GPS coordinates');
    });
    
    it('should detect identity references', () => {
      const pattern = {
        id: 'pattern-test003',
        personId: 'person-123', // PII!
        category: 'theft' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        occurredAt: new Date(),
        timeOfDay: 'afternoon' as const,
        dayOfWeek: 'monday',
        industryVertical: 'retail' as const,
        locationCategory: 'store' as const,
        behavioralSignature: {},
        detectionMethods: ['motion-detection'],
        aiCapabilitiesInvolved: ['person-detection'],
        outcome: 'prevented' as const,
        contributingDeploymentId: 'deployment-abc123',
        sharedAt: new Date(),
        verificationStatus: 'unverified' as const,
        matchCount: 0,
      } as any;
      
      const check = anonymizer.verifyNoPII(pattern);
      
      expect(check.safe).toBe(false);
      expect(check.violations).toContain('Contains identity reference');
    });
    
    it('should detect biometric data', () => {
      const pattern = {
        id: 'pattern-test004',
        faceEmbedding: [0.1, 0.2, 0.3], // PII!
        category: 'theft' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        occurredAt: new Date(),
        timeOfDay: 'afternoon' as const,
        dayOfWeek: 'monday',
        industryVertical: 'retail' as const,
        locationCategory: 'store' as const,
        behavioralSignature: {},
        detectionMethods: ['motion-detection'],
        aiCapabilitiesInvolved: ['person-detection'],
        outcome: 'prevented' as const,
        contributingDeploymentId: 'deployment-abc123',
        sharedAt: new Date(),
        verificationStatus: 'unverified' as const,
        matchCount: 0,
      } as any;
      
      const check = anonymizer.verifyNoPII(pattern);
      
      expect(check.safe).toBe(false);
      expect(check.violations).toContain('Contains biometric data');
    });
    
    it('should detect deployment-specific IDs', () => {
      const pattern = {
        id: 'pattern-test005',
        tenantId: 'tenant-123', // PII!
        branchId: 'branch-456', // PII!
        cameraId: 'camera-789', // PII!
        category: 'theft' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        occurredAt: new Date(),
        timeOfDay: 'afternoon' as const,
        dayOfWeek: 'monday',
        industryVertical: 'retail' as const,
        locationCategory: 'store' as const,
        behavioralSignature: {},
        detectionMethods: ['motion-detection'],
        aiCapabilitiesInvolved: ['person-detection'],
        outcome: 'prevented' as const,
        contributingDeploymentId: 'deployment-abc123',
        sharedAt: new Date(),
        verificationStatus: 'unverified' as const,
        matchCount: 0,
      } as any;
      
      const check = anonymizer.verifyNoPII(pattern);
      
      expect(check.safe).toBe(false);
      expect(check.violations).toContain('Contains deployment-specific identifiers');
    });
  });
  
  describe('anonymizeIncidentBatch', () => {
    it('should anonymize multiple incidents', () => {
      const incidents: LocalIncident[] = [
        {
          id: 'incident-001',
          tenantId: 'tenant-123',
          branchId: 'branch-456',
          detectionType: 'shoplifting',
          severity: 'P2',
          category: 'theft',
          occurredAt: new Date('2026-09-24T14:30:00Z'),
          detectedAt: new Date('2026-09-24T14:30:00Z'),
          cameraId: 'camera-789',
          cameraName: 'Camera 1',
          aiCapabilities: ['person-detection'],
          confidence: 0.85,
          outcome: 'detected-during',
          industryVertical: 'retail',
          facilityType: 'store',
        },
        {
          id: 'incident-002',
          tenantId: 'tenant-123',
          branchId: 'branch-456',
          detectionType: 'intrusion',
          severity: 'P1',
          category: 'security',
          occurredAt: new Date('2026-09-24T03:00:00Z'),
          detectedAt: new Date('2026-09-24T03:00:00Z'),
          cameraId: 'camera-790',
          cameraName: 'Camera 2',
          aiCapabilities: ['motion-detection'],
          confidence: 0.95,
          outcome: 'prevented',
          industryVertical: 'retail',
          facilityType: 'store',
        },
      ];
      
      const result = anonymizer.anonymizeIncidentBatch(incidents);
      
      expect(result.patterns).toHaveLength(2);
      expect(result.skipped).toBe(0);
      expect(result.reasons).toEqual([]);
    });
    
    it('should skip low-confidence incidents when enabled', () => {
      const incidents: LocalIncident[] = [
        {
          id: 'incident-001',
          tenantId: 'tenant-123',
          branchId: 'branch-456',
          detectionType: 'motion',
          severity: 'P4',
          category: 'security',
          occurredAt: new Date(),
          detectedAt: new Date(),
          cameraId: 'camera-789',
          cameraName: 'Camera 1',
          aiCapabilities: ['motion-detection'],
          confidence: 0.45, // Too low!
          outcome: 'unknown',
          industryVertical: 'retail',
          facilityType: 'store',
        },
        {
          id: 'incident-002',
          tenantId: 'tenant-123',
          branchId: 'branch-456',
          detectionType: 'theft',
          severity: 'P2',
          category: 'theft',
          occurredAt: new Date(),
          detectedAt: new Date(),
          cameraId: 'camera-790',
          cameraName: 'Camera 2',
          aiCapabilities: ['person-detection'],
          confidence: 0.85, // Good
          outcome: 'detected-during',
          industryVertical: 'retail',
          facilityType: 'store',
        },
      ];
      
      const result = anonymizer.anonymizeIncidentBatch(incidents, {
        skipIfLowConfidence: true,
        minConfidence: 0.7,
      });
      
      expect(result.patterns).toHaveLength(1);
      expect(result.skipped).toBe(1);
      expect(result.reasons[0]).toContain('Confidence too low');
    });
  });
  
  describe('consistent deployment ID generation', () => {
    it('should generate same deployment ID for same salt', () => {
      const anonymizer1 = new PatternAnonymizerService('same-salt');
      const anonymizer2 = new PatternAnonymizerService('same-salt');
      
      const incident: LocalIncident = {
        id: 'incident-001',
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        detectionType: 'shoplifting',
        severity: 'P2',
        category: 'theft',
        occurredAt: new Date(),
        detectedAt: new Date(),
        cameraId: 'camera-789',
        cameraName: 'Camera 1',
        aiCapabilities: [],
        confidence: 0.85,
        outcome: 'detected-during',
        industryVertical: 'retail',
        facilityType: 'store',
      };
      
      const pattern1 = anonymizer1.anonymizeIncident(incident);
      const pattern2 = anonymizer2.anonymizeIncident(incident);
      
      expect(pattern1.contributingDeploymentId).toBe(pattern2.contributingDeploymentId);
    });
    
    it('should generate different deployment IDs for different salts', () => {
      const anonymizer1 = new PatternAnonymizerService('salt-1');
      const anonymizer2 = new PatternAnonymizerService('salt-2');
      
      const incident: LocalIncident = {
        id: 'incident-001',
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        detectionType: 'shoplifting',
        severity: 'P2',
        category: 'theft',
        occurredAt: new Date(),
        detectedAt: new Date(),
        cameraId: 'camera-789',
        cameraName: 'Camera 1',
        aiCapabilities: [],
        confidence: 0.85,
        outcome: 'detected-during',
        industryVertical: 'retail',
        facilityType: 'store',
      };
      
      const pattern1 = anonymizer1.anonymizeIncident(incident);
      const pattern2 = anonymizer2.anonymizeIncident(incident);
      
      expect(pattern1.contributingDeploymentId).not.toBe(pattern2.contributingDeploymentId);
    });
  });
});
