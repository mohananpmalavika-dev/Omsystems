/**
 * Banking Analytics Workflow Tests
 * 
 * Tests for the complete cash van workflow including:
 * - State transitions
 * - Rule evaluation
 * - Violation detection
 * - Evidence tracking
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BankingEventBus } from '../events/banking-event-bus.js';
import { CashVanWorkflow } from '../workflow/cash-van-workflow.js';
import { BankingEventConsumer } from '../workflow/event-consumer.js';
import { CashVanRuleEngine } from '../rules/rule-engine.js';
import { CashVanSessionRepository } from '../repositories/cash-van-session.repository.js';
import { CashVanMonitorRepository } from '../repositories/cash-van-monitor.repository.js';
import { ExpectedVisitRepository } from '../repositories/expected-visit.repository.js';
import { PersonnelAuthorizationRepository } from '../repositories/personnel-authorization.repository.js';
import {
  AuthorizedVehicleRule,
  ScheduledArrivalRule,
  MinimumPersonnelRule,
  EscortVerificationRule,
  UnloadingDurationRule,
  AccessCorrelationRule,
} from '../rules.js';
import {
  MockEventGenerator,
  WorkflowScenarioBuilder,
  runScenario,
} from './test-utils.js';

describe('Banking Analytics Workflow', () => {
  let eventBus: BankingEventBus;
  let workflow: CashVanWorkflow;
  let consumer: BankingEventConsumer;
  let ruleEngine: CashVanRuleEngine;
  let sessionRepo: CashVanSessionRepository;
  let monitorRepo: CashVanMonitorRepository;
  let visitRepo: ExpectedVisitRepository;
  let personnelRepo: PersonnelAuthorizationRepository;

  beforeEach(async () => {
    // Create fresh instances for each test
    eventBus = new BankingEventBus();
    sessionRepo = new CashVanSessionRepository();
    monitorRepo = new CashVanMonitorRepository();
    visitRepo = new ExpectedVisitRepository();
    personnelRepo = new PersonnelAuthorizationRepository();
    
    ruleEngine = new CashVanRuleEngine();
    ruleEngine.registerRules([
      new AuthorizedVehicleRule(),
      new ScheduledArrivalRule(),
      new MinimumPersonnelRule(),
      new EscortVerificationRule(),
      new UnloadingDurationRule(),
      new AccessCorrelationRule(),
    ]);

    workflow = new CashVanWorkflow(
      sessionRepo,
      monitorRepo,
      visitRepo,
      personnelRepo,
      ruleEngine
    );

    consumer = new BankingEventConsumer(eventBus, workflow);
    consumer.start();

    // Create test monitor
    await monitorRepo.create({
      tenantId: 'test-tenant',
      branchId: 'test-branch',
      name: 'Test Monitor',
      arrivalZoneId: 'zone_arrival',
      unloadingZoneId: 'zone_unloading',
      secureEntryZoneId: 'zone_secure',
      approvedRouteZones: ['zone_arrival', 'zone_unloading', 'zone_secure'],
    });

    // Add authorized vehicle
    const monitors = await monitorRepo.findByBranch('test-tenant', 'test-branch');
    await monitorRepo.addVehicleRule(monitors[0].id, {
      plate: 'AUTH123',
      enabled: true,
    });

    // Add personnel authorizations
    await personnelRepo.create({
      identityId: 'guard_001',
      tenantId: 'test-tenant',
      firstName: 'John',
      lastName: 'Guard',
      roles: ['cash_guard'],
      validFrom: new Date('2020-01-01'),
    });

    await personnelRepo.create({
      identityId: 'guard_002',
      tenantId: 'test-tenant',
      firstName: 'Jane',
      lastName: 'Guard',
      roles: ['cash_guard'],
      validFrom: new Date('2020-01-01'),
    });
  });

  afterEach(() => {
    consumer.stop();
    eventBus.destroy();
  });

  describe('Compliant Workflow', () => {
    it('should process compliant cash van workflow without violations', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.compliantWorkflow();

      await runScenario(events, eventBus, 50);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check session was created
      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      expect(sessions.length).toBeGreaterThan(0);

      const session = sessions[0];
      expect(session.state).toBe('departed');
      expect(session.assessment).toBe('compliant');
      expect(session.vehicle?.authorized).toBe(true);
      expect(session.violations.filter(v => v.status === 'active').length).toBe(0);
    });

    it('should track personnel correctly', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.compliantWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      expect(session.personnel.length).toBeGreaterThanOrEqual(2);
      
      const identifiedPersonnel = session.personnel.filter(p => p.identityId);
      expect(identifiedPersonnel.length).toBeGreaterThanOrEqual(2);
    });

    it('should track transfer objects', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.compliantWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      expect(session.transferObjects.length).toBeGreaterThan(0);
      
      const cashCase = session.transferObjects[0];
      expect(cashCase.objectType).toBe('cash_case');
    });
  });

  describe('Unauthorized Vehicle', () => {
    it('should detect unauthorized vehicle violation', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.unauthorizedVehicleWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      expect(sessions.length).toBeGreaterThan(0);

      const session = sessions[0];
      expect(session.vehicle?.authorized).toBe(false);
      expect(session.assessment).toMatch(/non_compliant|suspicious/);
      
      const violations = session.violations.filter(v => v.status === 'active');
      expect(violations.length).toBeGreaterThan(0);
      
      const vehicleViolation = violations.find(v => v.ruleCode === 'authorized_vehicle');
      expect(vehicleViolation).toBeDefined();
    });
  });

  describe('Insufficient Escort', () => {
    it('should detect insufficient escort violation', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.insufficientEscortWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      
      const violations = session.violations.filter(v => v.status === 'active');
      const escortViolation = violations.find(
        v => v.ruleCode === 'escort_verification' || v.ruleCode === 'minimum_personnel'
      );
      
      expect(escortViolation).toBeDefined();
      expect(escortViolation?.severity).toMatch(/high|critical/);
    });
  });

  describe('Unattended Object', () => {
    it('should detect unattended object violation', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.unattendedObjectWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      
      const violations = session.violations.filter(v => v.status === 'active');
      const unattendedViolation = violations.find(v => v.ruleCode === 'object_escort');
      
      expect(unattendedViolation).toBeDefined();
    });
  });

  describe('Access Correlation', () => {
    it('should detect missing access correlation', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.noAccessCorrelationWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      
      const violations = session.violations.filter(v => v.status === 'active');
      const accessViolation = violations.find(v => v.ruleCode === 'access_correlation');
      
      expect(accessViolation).toBeDefined();
      expect(accessViolation?.severity).toBe('critical');
    });
  });

  describe('Unloading Timeout', () => {
    it('should detect unloading timeout violation', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.timeoutWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      
      const violations = session.violations.filter(v => v.status === 'active');
      const timeoutViolation = violations.find(v => v.ruleCode === 'unloading_duration');
      
      expect(timeoutViolation).toBeDefined();
    });
  });

  describe('State Transitions', () => {
    it('should transition through expected states', async () => {
      const generator = new MockEventGenerator('test-tenant', 'test-branch', 'test-camera');
      const vehicleTrack = 'veh_state_test';

      // Vehicle detected
      await eventBus.publish(
        generator.vehicleObserved(vehicleTrack, {
          zoneId: 'zone_arrival',
        }),
        'test'
      );
      await new Promise((resolve) => setTimeout(resolve, 100));

      let sessions = await sessionRepo.query({ tenantId: 'test-tenant' });
      expect(sessions[0].state).toBe('vehicle_detected');

      // Plate recognized
      await eventBus.publish(
        generator.plateRecognized(vehicleTrack, 'AUTH123'),
        'test'
      );
      await new Promise((resolve) => setTimeout(resolve, 100));

      sessions = await sessionRepo.query({ tenantId: 'test-tenant' });
      expect(sessions[0].state).toBe('vehicle_verified');
    });
  });

  describe('Evidence Tracking', () => {
    it('should track evidence availability', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.compliantWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      
      expect(session.evidenceAvailability.vehicleDetection).toBe(true);
      expect(session.evidenceAvailability.anpr).toBe(true);
      expect(session.evidenceAvailability.personTracking).toBe(true);
    });

    it('should attach evidence to violations', async () => {
      const builder = new WorkflowScenarioBuilder(
        new MockEventGenerator('test-tenant', 'test-branch', 'test-camera')
      );
      const events = builder.unauthorizedVehicleWorkflow();

      await runScenario(events, eventBus, 50);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await sessionRepo.query({
        tenantId: 'test-tenant',
        branchId: 'test-branch',
      });

      const session = sessions[0];
      const violations = session.violations.filter(v => v.status === 'active');
      
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].evidence.length).toBeGreaterThan(0);
    });
  });
});
