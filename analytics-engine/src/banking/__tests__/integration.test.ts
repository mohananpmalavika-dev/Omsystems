/**
 * Banking Analytics Integration Tests
 * 
 * End-to-end tests for the complete banking analytics system
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BankingAnalyticsService } from '../banking-analytics.service.js';
import { BankingEventBus } from '../events/banking-event-bus.js';
import { MockEventGenerator, WorkflowScenarioBuilder, runScenario } from './test-utils.js';

describe('Banking Analytics Integration', () => {
  let service: BankingAnalyticsService;
  let eventBus: BankingEventBus;

  beforeEach(async () => {
    eventBus = new BankingEventBus();
    service = new BankingAnalyticsService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
    eventBus.destroy();
  });

  it('should initialize successfully', async () => {
    expect(service).toBeDefined();
    const rules = service.getRuleEngine().getRules();
    expect(rules.length).toBeGreaterThan(0);
  });

  it('should process complete workflow end-to-end', async () => {
    const generator = new MockEventGenerator();
    const builder = new WorkflowScenarioBuilder(generator);
    const events = builder.compliantWorkflow();

    await runScenario(events, service.getEventBus(), 50);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const sessions = await service.getSessions('test-tenant', 'test-branch');
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('should generate summary statistics', async () => {
    const summary = await service.getSummary('test-tenant', 'test-branch');
    
    expect(summary).toBeDefined();
    expect(summary.tenantId).toBe('test-tenant');
    expect(typeof summary.activeSessions).toBe('number');
    expect(typeof summary.completedSessions).toBe('number');
  });
});
