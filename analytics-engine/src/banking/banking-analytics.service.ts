/**
 * Banking Analytics Service
 * 
 * Main service that integrates the workflow engine with the analytics pipeline.
 * Replaces the TODO-filled implementation in detectors/banking-analytics.ts
 */

import {
  CashVanSessionRepository,
  getCashVanSessionRepository,
} from './repositories/cash-van-session.repository.js';

import {
  CashVanMonitorRepository,
  getCashVanMonitorRepository,
} from './repositories/cash-van-monitor.repository.js';

import {
  ExpectedVisitRepository,
  getExpectedVisitRepository,
} from './repositories/expected-visit.repository.js';

import {
  CashVanRuleEngine,
  getCashVanRuleEngine,
} from './rules/rule-engine.js';

import {
  AuthorizedVehicleRule,
  ScheduledArrivalRule,
  MinimumPersonnelRule,
  EscortVerificationRule,
  UnloadingDurationRule,
  TransferRouteRule,
  AccessCorrelationRule,
  ObjectEscortRule,
  DepartureCompletionRule,
} from './rules.js';

import {
  CashVanWorkflow,
  getCashVanWorkflow,
} from './workflow/cash-van-workflow.js';

import {
  BankingEventConsumer,
  getBankingEventConsumer,
} from './workflow/event-consumer.js';

import {
  BankingEventBus,
  getBankingEventBus,
} from './events/banking-event-bus.js';

import {
  CashVanSession,
  CashVanMonitorConfig,
  WorkflowAssessment,
} from './models/cash-van-session.js';

/**
 * Banking Analytics Findings
 */
export interface BankingAnalyticsFinding {
  sessionId: string;
  tenantId: string;
  branchId: string;
  monitorId: string;
  
  // Session state
  state: string;
  assessment: WorkflowAssessment;
  confidence: number;
  
  // Vehicle info
  vehicle?: {
    trackId: string;
    plate?: string;
    authorized: boolean;
  };
  
  // Personnel info
  personnel: {
    observed: number;
    identified: number;
    guards: number;
  };
  
  // Violations
  violations: Array<{
    code: string;
    name: string;
    severity: string;
    message: string;
    detectedAt: Date;
  }>;
  
  // Timestamps
  startedAt: Date;
  lastUpdatedAt: Date;
  
  // Evidence
  evidenceAvailable: string[];
}

/**
 * Banking Analytics Summary
 */
export interface BankingAnalyticsSummary {
  tenantId: string;
  branchId?: string;
  
  activeSessions: number;
  completedSessions: number;
  
  compliantSessions: number;
  suspiciousSessions: number;
  nonCompliantSessions: number;
  
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
  
  generatedAt: Date;
}

/**
 * Banking Analytics Service
 */
export class BankingAnalyticsService {
  private initialized = false;

  constructor(
    private sessionRepo: CashVanSessionRepository = getCashVanSessionRepository(),
    private monitorRepo: CashVanMonitorRepository = getCashVanMonitorRepository(),
    private visitRepo: ExpectedVisitRepository = getExpectedVisitRepository(),
    private ruleEngine: CashVanRuleEngine = getCashVanRuleEngine(),
    private workflow: CashVanWorkflow = getCashVanWorkflow(),
    private eventConsumer: BankingEventConsumer = getBankingEventConsumer(),
    private eventBus: BankingEventBus = getBankingEventBus()
  ) {}

  /**
   * Initialize the banking analytics service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[BankingAnalytics] Initializing banking analytics service...');

    // Register all rules
    this.registerRules();

    // Start event consumer
    this.eventConsumer.start();

    this.initialized = true;
    console.log('[BankingAnalytics] Banking analytics service initialized');
  }

  /**
   * Register all banking rules with the rule engine
   */
  private registerRules(): void {
    const rules = [
      new AuthorizedVehicleRule(),
      new ScheduledArrivalRule(),
      new MinimumPersonnelRule(),
      new EscortVerificationRule(),
      new UnloadingDurationRule(),
      new TransferRouteRule(),
      new AccessCorrelationRule(),
      new ObjectEscortRule(),
      new DepartureCompletionRule(),
    ];

    this.ruleEngine.registerRules(rules);
    console.log(`[BankingAnalytics] Registered ${rules.length} banking rules`);
  }

  /**
   * Monitor cash van operations for a branch
   * This is called periodically by the analytics pipeline
   */
  async monitorCashVans(tenantId: string, branchId: string): Promise<BankingAnalyticsFinding[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Get all active monitors for this branch
    const monitors = await this.monitorRepo.findByBranch(tenantId, branchId);
    if (monitors.length === 0) {
      return [];
    }

    const findings: BankingAnalyticsFinding[] = [];

    // Get active sessions for each monitor
    for (const monitor of monitors) {
      const sessions = await this.sessionRepo.findActiveForMonitor(
        tenantId,
        branchId,
        monitor.id
      );

      for (const session of sessions) {
        const finding = this.sessionToFinding(session);
        findings.push(finding);
      }
    }

    // Clean up expired sessions
    await this.sessionRepo.cleanupExpired();
    await this.visitRepo.markMissedVisits();

    return findings;
  }

  /**
   * Get a specific session
   */
  async getSession(sessionId: string): Promise<CashVanSession | null> {
    return this.sessionRepo.findById(sessionId);
  }

  /**
   * Get all sessions for a branch
   */
  async getSessions(
    tenantId: string,
    branchId: string,
    options: {
      activeOnly?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<CashVanSession[]> {
    return this.sessionRepo.query({
      tenantId,
      branchId,
      activeOnly: options.activeOnly,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  /**
   * Get summary statistics
   */
  async getSummary(tenantId: string, branchId?: string): Promise<BankingAnalyticsSummary> {
    const stats = await this.sessionRepo.getStats(tenantId, branchId);

    const activeSessions = stats.active;
    const completedSessions = (stats.byState['departed'] || 0) + (stats.byState['transfer_complete'] || 0);

    const compliantSessions = stats.byAssessment['compliant'] || 0;
    const suspiciousSessions = stats.byAssessment['suspicious'] || 0;
    const nonCompliantSessions = stats.byAssessment['non_compliant'] || 0;

    // Count violations
    const allSessions = await this.sessionRepo.query({ tenantId, branchId });
    let totalViolations = 0;
    let criticalViolations = 0;
    let highViolations = 0;

    for (const session of allSessions) {
      totalViolations += session.violations.filter(v => v.status === 'active').length;
      criticalViolations += session.violations.filter(
        v => v.status === 'active' && v.severity === 'critical'
      ).length;
      highViolations += session.violations.filter(
        v => v.status === 'active' && v.severity === 'high'
      ).length;
    }

    return {
      tenantId,
      branchId,
      activeSessions,
      completedSessions,
      compliantSessions,
      suspiciousSessions,
      nonCompliantSessions,
      totalViolations,
      criticalViolations,
      highViolations,
      generatedAt: new Date(),
    };
  }

  /**
   * Get monitors for a branch
   */
  async getMonitors(tenantId: string, branchId: string): Promise<CashVanMonitorConfig[]> {
    return this.monitorRepo.findByBranch(tenantId, branchId);
  }

  /**
   * Get a specific monitor
   */
  async getMonitor(monitorId: string): Promise<CashVanMonitorConfig | null> {
    return this.monitorRepo.findById(monitorId);
  }

  /**
   * Get event bus for publishing events
   */
  getEventBus(): BankingEventBus {
    return this.eventBus;
  }

  /**
   * Get workflow engine for advanced operations
   */
  getWorkflow(): CashVanWorkflow {
    return this.workflow;
  }

  /**
   * Get rule engine for rule management
   */
  getRuleEngine(): CashVanRuleEngine {
    return this.ruleEngine;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.eventConsumer.stop();
    this.initialized = false;
    console.log('[BankingAnalytics] Banking analytics service shut down');
  }

  /**
   * Convert session to finding for external consumption
   */
  private sessionToFinding(session: CashVanSession): BankingAnalyticsFinding {
    const identifiedPersonnel = session.personnel.filter(p => p.identityId);
    const guards = session.personnel.filter(
      p => p.roles?.includes('cash_guard')
    );

    const evidenceAvailable: string[] = [];
    if (session.evidenceAvailability.vehicleDetection) evidenceAvailable.push('vehicle_detection');
    if (session.evidenceAvailability.anpr) evidenceAvailable.push('anpr');
    if (session.evidenceAvailability.personTracking) evidenceAvailable.push('person_tracking');
    if (session.evidenceAvailability.faceRecognition) evidenceAvailable.push('face_recognition');
    if (session.evidenceAvailability.accessControl) evidenceAvailable.push('access_control');
    if (session.evidenceAvailability.transferObjectDetection) evidenceAvailable.push('transfer_object_detection');

    return {
      sessionId: session.id,
      tenantId: session.tenantId,
      branchId: session.branchId,
      monitorId: session.monitorId,
      state: session.state,
      assessment: session.assessment,
      confidence: session.overallConfidence,
      vehicle: session.vehicle ? {
        trackId: session.vehicle.trackId,
        plate: session.vehicle.plate,
        authorized: session.vehicle.authorized,
      } : undefined,
      personnel: {
        observed: session.personnel.length,
        identified: identifiedPersonnel.length,
        guards: guards.length,
      },
      violations: session.violations
        .filter(v => v.status === 'active')
        .map(v => ({
          code: v.ruleCode,
          name: v.ruleName,
          severity: v.severity,
          message: v.description,
          detectedAt: v.firstDetectedAt,
        })),
      startedAt: session.startedAt,
      lastUpdatedAt: session.lastUpdatedAt,
      evidenceAvailable,
    };
  }
}

/**
 * Singleton instance
 */
let service: BankingAnalyticsService | null = null;

export function getBankingAnalyticsService(): BankingAnalyticsService {
  if (!service) {
    service = new BankingAnalyticsService();
  }
  return service;
}

export function setBankingAnalyticsService(svc: BankingAnalyticsService): void {
  service = svc;
}
