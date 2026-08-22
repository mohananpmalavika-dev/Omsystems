/**
 * Security Evidence System Tests
 * 
 * Tests the type-safe evidence system to ensure:
 * 1. Invalid states are impossible
 * 2. Missing evidence never becomes HEALTHY
 * 3. Simulated data is rejected in production
 * 4. Freshness policies are enforced
 * 5. Aggregation preserves uncertainty
 */

import {
  type SecurityEvidence,
  healthyEvidence,
  unhealthyEvidence,
  unknownEvidence,
  enforceFreshness,
  evaluateEvidenceSource,
  aggregateSecurityState,
  calculateEvidenceCoverage,
  calculatePostureSummary,
  FRESHNESS_POLICY,
} from '../security-evidence-types';

describe('Security Evidence Types', () => {
  describe('Factory Functions', () => {
    it('should create valid healthy evidence', () => {
      const now = new Date();
      const evidence = healthyEvidence({ test: 'data' }, now, 1.0);

      expect(evidence.state).toBe('HEALTHY');
      expect(evidence.available).toBe(true);
      expect(evidence.source).toBe('LIVE');
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.reason).toBe('VERIFIED');
      expect(evidence.evidence).toEqual({ test: 'data' });
    });

    it('should create valid unhealthy evidence', () => {
      const now = new Date();
      const evidence = unhealthyEvidence({ failure: 'details' }, now, 0.9);

      expect(evidence.state).toBe('UNHEALTHY');
      expect(evidence.available).toBe(true);
      expect(evidence.source).toBe('LIVE');
      expect(evidence.confidence).toBe(0.9);
      expect(evidence.reason).toBe('CONTROL_FAILED');
      expect(evidence.evidence).toEqual({ failure: 'details' });
    });

    it('should create valid unknown evidence', () => {
      const evidence = unknownEvidence('NOT_CONFIGURED');

      expect(evidence.state).toBe('UNKNOWN');
      expect(evidence.available).toBe(false);
      expect(evidence.source).toBe('UNAVAILABLE');
      expect(evidence.confidence).toBe(0);
      expect(evidence.reason).toBe('NOT_CONFIGURED');
      expect(evidence.evidence).toBeUndefined();
    });

    it('should clamp confidence to [0, 1] range', () => {
      const tooHigh = healthyEvidence({}, new Date(), 2.0);
      const tooLow = healthyEvidence({}, new Date(), -0.5);

      expect(tooHigh.confidence).toBe(1.0);
      expect(tooLow.confidence).toBe(0);
    });
  });

  describe('Freshness Enforcement', () => {
    it('should keep fresh evidence unchanged', () => {
      const now = new Date();
      const evidence = healthyEvidence({}, now, 1.0);

      const validated = enforceFreshness(evidence, 60000, now);

      expect(validated.state).toBe('HEALTHY');
    });

    it('should downgrade stale evidence to UNKNOWN', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const evidence = healthyEvidence({}, oneHourAgo, 1.0);

      const validated = enforceFreshness(evidence, 5 * 60 * 1000); // 5 min policy

      expect(validated.state).toBe('UNKNOWN');
      expect(validated.reason).toBe('STALE_EVIDENCE');
      expect(validated.available).toBe(false);
      expect(validated.observedAt).toEqual(oneHourAgo); // Preserves original timestamp
    });

    it('should not affect unknown evidence', () => {
      const unknown = unknownEvidence('NOT_CONFIGURED');

      const validated = enforceFreshness(unknown, 60000);

      expect(validated.state).toBe('UNKNOWN');
      expect(validated.reason).toBe('NOT_CONFIGURED');
    });

    it('should handle evidence with null observedAt', () => {
      const unknown = unknownEvidence('NO_EVIDENCE', 'UNAVAILABLE', null);

      const validated = enforceFreshness(unknown, 60000);

      expect(validated.state).toBe('UNKNOWN');
    });
  });

  describe('Environment Validation', () => {
    it('should reject simulated data in production', () => {
      const simulated: SecurityEvidence = {
        state: 'HEALTHY',
        available: true,
        source: 'SIMULATED',
        confidence: 1.0,
        observedAt: new Date(),
        reason: 'VERIFIED',
        evidence: {},
      };

      const validated = evaluateEvidenceSource(simulated, 'production');

      expect(validated.state).toBe('UNKNOWN');
      expect(validated.reason).toBe('SIMULATED_DATA');
      expect(validated.available).toBe(false);
    });

    it('should allow simulated data in development', () => {
      const simulated: SecurityEvidence = {
        state: 'HEALTHY',
        available: true,
        source: 'SIMULATED',
        confidence: 1.0,
        observedAt: new Date(),
        reason: 'VERIFIED',
        evidence: {},
      };

      const validated = evaluateEvidenceSource(simulated, 'development');

      expect(validated.state).toBe('HEALTHY');
      expect(validated.source).toBe('SIMULATED');
    });

    it('should allow live data in all environments', () => {
      const live = healthyEvidence({}, new Date(), 1.0);

      const prodValidated = evaluateEvidenceSource(live, 'production');
      const devValidated = evaluateEvidenceSource(live, 'development');

      expect(prodValidated.state).toBe('HEALTHY');
      expect(devValidated.state).toBe('HEALTHY');
    });
  });

  describe('State Aggregation', () => {
    it('should return HEALTHY when all controls are healthy', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        healthyEvidence({}, new Date()),
        healthyEvidence({}, new Date()),
      ];

      const state = aggregateSecurityState(controls);

      expect(state).toBe('HEALTHY');
    });

    it('should return UNHEALTHY when any control is unhealthy', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        unhealthyEvidence({}, new Date()),
        healthyEvidence({}, new Date()),
      ];

      const state = aggregateSecurityState(controls);

      expect(state).toBe('UNHEALTHY');
    });

    it('should return UNKNOWN when any control is unknown (no unhealthy)', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        healthyEvidence({}, new Date()),
        unknownEvidence('NOT_CONFIGURED'),
      ];

      const state = aggregateSecurityState(controls);

      expect(state).toBe('UNKNOWN');
    });

    it('should prioritize UNHEALTHY over UNKNOWN', () => {
      const controls = [
        unhealthyEvidence({}, new Date()),
        unknownEvidence('NOT_CONFIGURED'),
      ];

      const state = aggregateSecurityState(controls);

      expect(state).toBe('UNHEALTHY');
    });

    it('should return UNKNOWN for empty controls', () => {
      const state = aggregateSecurityState([]);

      expect(state).toBe('UNKNOWN');
    });

    describe('Truth Table Validation', () => {
      const testCases: Array<{
        input: string[];
        expected: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
      }> = [
        { input: ['H', 'H', 'H'], expected: 'HEALTHY' },
        { input: ['H', 'H', 'U'], expected: 'UNHEALTHY' },
        { input: ['H', 'U', '?'], expected: 'UNHEALTHY' },
        { input: ['H', 'H', '?'], expected: 'UNKNOWN' },
        { input: ['?', '?', '?'], expected: 'UNKNOWN' },
        { input: ['U', '?', '?'], expected: 'UNHEALTHY' },
        { input: ['H', '?', '?'], expected: 'UNKNOWN' },
      ];

      testCases.forEach(({ input, expected }) => {
        it(`should handle [${input.join(', ')}] → ${expected}`, () => {
          const controls = input.map(state => {
            if (state === 'H') return healthyEvidence({}, new Date());
            if (state === 'U') return unhealthyEvidence({}, new Date());
            return unknownEvidence('NOT_CONFIGURED');
          });

          expect(aggregateSecurityState(controls)).toBe(expected);
        });
      });
    });
  });

  describe('Evidence Coverage', () => {
    it('should calculate 100% coverage when all controls have live evidence', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        unhealthyEvidence({}, new Date()),
        healthyEvidence({}, new Date()),
      ];

      const coverage = calculateEvidenceCoverage(controls);

      expect(coverage).toBe(1.0);
    });

    it('should calculate partial coverage with mixed evidence', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        unknownEvidence('NOT_CONFIGURED'),
        unknownEvidence('NOT_CONFIGURED'),
        healthyEvidence({}, new Date()),
      ];

      const coverage = calculateEvidenceCoverage(controls);

      expect(coverage).toBe(0.5); // 2 out of 4 have live evidence
    });

    it('should return 0 coverage when no controls have live evidence', () => {
      const controls = [
        unknownEvidence('NOT_CONFIGURED'),
        unknownEvidence('NOT_SUPPORTED'),
      ];

      const coverage = calculateEvidenceCoverage(controls);

      expect(coverage).toBe(0);
    });

    it('should return 0 coverage for empty controls', () => {
      const coverage = calculateEvidenceCoverage([]);

      expect(coverage).toBe(0);
    });

    it('should not count simulated evidence as live', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        {
          state: 'HEALTHY' as const,
          available: true,
          source: 'SIMULATED' as const,
          confidence: 1.0,
          observedAt: new Date(),
          reason: 'VERIFIED' as const,
          evidence: {},
        },
      ];

      const coverage = calculateEvidenceCoverage(controls);

      expect(coverage).toBe(0.5); // Only 1 out of 2 is LIVE
    });
  });

  describe('Posture Summary', () => {
    it('should calculate correct summary for mixed controls', () => {
      const controls = {
        secureBoot: healthyEvidence({}, new Date()),
        ransomware: unhealthyEvidence({}, new Date()),
        tamperProtection: unknownEvidence('NOT_CONFIGURED'),
        tamperCondition: healthyEvidence({}, new Date()),
      };

      const summary = calculatePostureSummary(controls);

      expect(summary.overallState).toBe('UNHEALTHY');
      expect(summary.controlCount).toBe(4);
      expect(summary.healthyControls).toBe(2);
      expect(summary.unhealthyControls).toBe(1);
      expect(summary.unknownControls).toBe(1);
      expect(summary.evidenceCoverage).toBe(0.75); // 3 out of 4 have live evidence
    });

    it('should show low coverage despite healthy controls', () => {
      const controls = {
        control1: healthyEvidence({}, new Date()),
        control2: unknownEvidence('NOT_CONFIGURED'),
        control3: unknownEvidence('NOT_CONFIGURED'),
        control4: unknownEvidence('NOT_CONFIGURED'),
      };

      const summary = calculatePostureSummary(controls);

      expect(summary.overallState).toBe('UNKNOWN'); // Not healthy due to unknowns
      expect(summary.evidenceCoverage).toBe(0.25); // Only 25% coverage
    });
  });

  describe('Critical Safety Properties', () => {
    it('should NEVER convert missing evidence to HEALTHY', () => {
      const unknown = unknownEvidence('NOT_CONFIGURED');

      // Even with high confidence somehow set
      expect(unknown.state).not.toBe('HEALTHY');
      expect(unknown.available).toBe(false);
    });

    it('should NEVER allow HEALTHY state without evidence data', () => {
      const healthy = healthyEvidence({ data: 'required' }, new Date());

      expect(healthy.evidence).toBeDefined();
      expect(healthy.available).toBe(true);
      expect(healthy.source).toBe('LIVE');
    });

    it('should NEVER allow UNKNOWN state with evidence data', () => {
      const unknown = unknownEvidence('NOT_CONFIGURED');

      expect(unknown.evidence).toBeUndefined();
    });

    it('should ensure stale HEALTHY evidence becomes UNKNOWN, not UNHEALTHY', () => {
      const staleHealthy = healthyEvidence({}, new Date(Date.now() - 100000));
      const validated = enforceFreshness(staleHealthy, 1000);

      expect(validated.state).toBe('UNKNOWN');
      expect(validated.reason).toBe('STALE_EVIDENCE');
      // Should not be UNHEALTHY - we don't know current state
    });

    it('should prevent confidence from affecting state determination', () => {
      const lowConfidenceHealthy = healthyEvidence({}, new Date(), 0.1);
      const highConfidenceUnknown = unknownEvidence('NOT_CONFIGURED');

      // State is determined by evidence presence, not confidence
      expect(lowConfidenceHealthy.state).toBe('HEALTHY');
      expect(highConfidenceUnknown.state).toBe('UNKNOWN');
    });
  });

  describe('Regression Tests - Placeholder Bug', () => {
    it('should not return true for unconfigured collectors', () => {
      const notConfigured = unknownEvidence('NOT_CONFIGURED');

      // The old bug: secureBoot: true when not configured
      expect(notConfigured.state).not.toBe('HEALTHY');
      expect(notConfigured.available).toBe(false);
    });

    it('should not convert simulation to production healthy', () => {
      const simulated = {
        state: 'HEALTHY' as const,
        available: true,
        source: 'SIMULATED' as const,
        confidence: 1.0,
        observedAt: new Date(),
        reason: 'VERIFIED' as const,
        evidence: { test: 'data' },
      };

      const productionValidated = evaluateEvidenceSource(simulated, 'production');

      expect(productionValidated.state).toBe('UNKNOWN');
      expect(productionValidated.reason).toBe('SIMULATED_DATA');
    });

    it('should not aggregate unknown as healthy', () => {
      const controls = [
        healthyEvidence({}, new Date()),
        unknownEvidence('NOT_CONFIGURED'),
      ];

      const state = aggregateSecurityState(controls);

      // Old bug would treat this as healthy
      expect(state).not.toBe('HEALTHY');
      expect(state).toBe('UNKNOWN');
    });
  });
});
