/**
 * Banking Analytics Service
 *
 * Main service that integrates the workflow engine with the analytics pipeline.
 * Replaces the TODO-filled implementation in detectors/banking-analytics.ts
 */
import { getCashVanSessionRepository, } from './repositories/cash-van-session.repository.js';
import { getCashVanMonitorRepository, } from './repositories/cash-van-monitor.repository.js';
import { getExpectedVisitRepository, } from './repositories/expected-visit.repository.js';
import { getCashVanRuleEngine, } from './rules/rule-engine.js';
import { AuthorizedVehicleRule, ScheduledArrivalRule, MinimumPersonnelRule, EscortVerificationRule, UnloadingDurationRule, TransferRouteRule, AccessCorrelationRule, ObjectEscortRule, DepartureCompletionRule, } from './rules.js';
import { getCashVanWorkflow, } from './workflow/cash-van-workflow.js';
import { getBankingEventConsumer, } from './workflow/event-consumer.js';
import { getBankingEventBus, } from './events/banking-event-bus.js';
/**
 * Banking Analytics Service
 */
export class BankingAnalyticsService {
    sessionRepo;
    monitorRepo;
    visitRepo;
    ruleEngine;
    workflow;
    eventConsumer;
    eventBus;
    initialized = false;
    constructor(sessionRepo = getCashVanSessionRepository(), monitorRepo = getCashVanMonitorRepository(), visitRepo = getExpectedVisitRepository(), ruleEngine = getCashVanRuleEngine(), workflow = getCashVanWorkflow(), eventConsumer = getBankingEventConsumer(), eventBus = getBankingEventBus()) {
        this.sessionRepo = sessionRepo;
        this.monitorRepo = monitorRepo;
        this.visitRepo = visitRepo;
        this.ruleEngine = ruleEngine;
        this.workflow = workflow;
        this.eventConsumer = eventConsumer;
        this.eventBus = eventBus;
    }
    /**
     * Initialize the banking analytics service
     */
    async initialize() {
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
    registerRules() {
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
    async monitorCashVans(tenantId, branchId) {
        if (!this.initialized) {
            await this.initialize();
        }
        // Get all active monitors for this branch
        const monitors = await this.monitorRepo.findByBranch(tenantId, branchId);
        if (monitors.length === 0) {
            return [];
        }
        const findings = [];
        // Get active sessions for each monitor
        for (const monitor of monitors) {
            const sessions = await this.sessionRepo.findActiveForMonitor(tenantId, branchId, monitor.id);
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
    async getSession(sessionId) {
        return this.sessionRepo.findById(sessionId);
    }
    /**
     * Get all sessions for a branch
     */
    async getSessions(tenantId, branchId, options = {}) {
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
    async getSummary(tenantId, branchId) {
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
            criticalViolations += session.violations.filter(v => v.status === 'active' && v.severity === 'critical').length;
            highViolations += session.violations.filter(v => v.status === 'active' && v.severity === 'high').length;
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
    async getMonitors(tenantId, branchId) {
        return this.monitorRepo.findByBranch(tenantId, branchId);
    }
    /**
     * Create a new monitor configuration
     */
    async createMonitor(input) {
        return this.monitorRepo.create(input);
    }
    /**
     * Get monitor repository
     */
    getMonitorRepository() {
        return this.monitorRepo;
    }
    /**
     * Get a specific monitor
     */
    async getMonitor(monitorId) {
        return this.monitorRepo.findById(monitorId);
    }
    /**
     * Get event bus for publishing events
     */
    getEventBus() {
        return this.eventBus;
    }
    /**
     * Get workflow engine for advanced operations
     */
    getWorkflow() {
        return this.workflow;
    }
    /**
     * Get rule engine for rule management
     */
    getRuleEngine() {
        return this.ruleEngine;
    }
    /**
     * Shutdown the service
     */
    async shutdown() {
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
    sessionToFinding(session) {
        const identifiedPersonnel = session.personnel.filter(p => p.identityId);
        const guards = session.personnel.filter(p => p.roles?.includes('cash_guard'));
        const evidenceAvailable = [];
        if (session.evidenceAvailability.vehicleDetection)
            evidenceAvailable.push('vehicle_detection');
        if (session.evidenceAvailability.anpr)
            evidenceAvailable.push('anpr');
        if (session.evidenceAvailability.personTracking)
            evidenceAvailable.push('person_tracking');
        if (session.evidenceAvailability.faceRecognition)
            evidenceAvailable.push('face_recognition');
        if (session.evidenceAvailability.accessControl)
            evidenceAvailable.push('access_control');
        if (session.evidenceAvailability.transferObjectDetection)
            evidenceAvailable.push('transfer_object_detection');
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
let service = null;
export function getBankingAnalyticsService() {
    if (!service) {
        service = new BankingAnalyticsService();
    }
    return service;
}
export function setBankingAnalyticsService(svc) {
    service = svc;
}
