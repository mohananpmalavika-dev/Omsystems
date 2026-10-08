/**
 * Event Correlation Engine
 * Combines multiple safety signals for higher confidence incident detection
 */

import { randomUUID } from 'node:crypto';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SafetySignal {
  id: string;
  type: 
    | 'fire' | 'smoke' | 'arc_flash' | 'spill'
    | 'person' | 'restricted_zone' | 'missing_ppe'
    | 'exit_blocked' | 'equipment_missing' | 'occupancy_exceeded';
  confidence: number;
  location: { x: number; y: number };
  timestamp: Date;
  zoneId?: string;
  metadata?: Record<string, unknown>;
}

export interface CorrelationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  signals: Array<{
    type: SafetySignal['type'];
    required: boolean;
    minConfidence?: number;
    timeWindow?: number; // milliseconds
  }>;
  spatialProximity?: number; // Maximum distance for correlation
  timeWindow: number; // Maximum time between signals
  confidenceBoost: number; // Boost to combined confidence
  severity: 'low' | 'medium' | 'high' | 'critical';
  outputType: string; // Type of correlated event
  description: string;
}

export interface CorrelatedEvent {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  location: { x: number; y: number };
  timestamp: Date;
  signals: SafetySignal[];
  ruleId: string;
  ruleName: string;
  description: string;
  zoneId?: string;
  peopleAffected: string[];
  requiresImmediateAction: boolean;
  metadata?: Record<string, unknown>;
}

export interface CorrelationStatistics {
  totalSignals: number;
  correlatedSignals: number;
  correlatedEvents: number;
  falsePositivesReduced: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  averageConfidenceBoost: number;
  correlationRate: number; // Percentage of signals correlated
}

// ============================================================================
// Event Correlation Engine
// ============================================================================

export class EventCorrelationEngine {
  private rules = new Map<string, CorrelationRule>();
  private signalBuffer: SafetySignal[] = [];
  private correlatedEvents = new Map<string, CorrelatedEvent>();
  private eventHistory: CorrelatedEvent[] = [];
  private readonly maxBufferSize = 1000;
  private readonly maxHistorySize = 10000;
  private readonly bufferRetentionTime = 60000; // 1 minute
  private statisticsCounter = {
    totalSignals: 0,
    correlatedSignals: 0,
    falsePositivesReduced: 0,
  };

  constructor() {
    this.initializeDefaultRules();
    this.startCorrelationMonitoring();
  }

  // ============================================================================
  // Rule Management
  // ============================================================================

  /**
   * Initialize default correlation rules
   */
  private initializeDefaultRules(): void {
    // Fire + Smoke = Confirmed Fire
    this.addRule({
      name: 'Fire Confirmation',
      enabled: true,
      priority: 100,
      signals: [
        { type: 'fire', required: true, minConfidence: 0.6 },
        { type: 'smoke', required: true, minConfidence: 0.5 },
      ],
      spatialProximity: 5.0,
      timeWindow: 30000,
      confidenceBoost: 0.3,
      severity: 'critical',
      outputType: 'confirmed_fire',
      description: 'Fire detected with smoke confirmation',
    });

    // Arc Flash + Smoke = Electrical Fire
    this.addRule({
      name: 'Electrical Fire',
      enabled: true,
      priority: 95,
      signals: [
        { type: 'arc_flash', required: true, minConfidence: 0.7 },
        { type: 'smoke', required: true, minConfidence: 0.5 },
      ],
      spatialProximity: 3.0,
      timeWindow: 20000,
      confidenceBoost: 0.35,
      severity: 'critical',
      outputType: 'electrical_fire',
      description: 'Electrical fire from arc flash',
    });

    // Person + Restricted Zone + No PPE = Critical Violation
    this.addRule({
      name: 'Critical Safety Violation',
      enabled: true,
      priority: 90,
      signals: [
        { type: 'person', required: true },
        { type: 'restricted_zone', required: true },
        { type: 'missing_ppe', required: true },
      ],
      spatialProximity: 1.0,
      timeWindow: 5000,
      confidenceBoost: 0.2,
      severity: 'critical',
      outputType: 'critical_safety_violation',
      description: 'Person in restricted zone without required PPE',
    });

    // Arc Flash + Person Nearby = Emergency
    this.addRule({
      name: 'Arc Flash Emergency',
      enabled: true,
      priority: 95,
      signals: [
        { type: 'arc_flash', required: true, minConfidence: 0.7 },
        { type: 'person', required: true },
      ],
      spatialProximity: 3.0,
      timeWindow: 5000,
      confidenceBoost: 0.25,
      severity: 'critical',
      outputType: 'arc_flash_emergency',
      description: 'Arc flash with person in danger zone',
    });

    // Spill + Person = Slip Hazard
    this.addRule({
      name: 'Slip Hazard',
      enabled: true,
      priority: 75,
      signals: [
        { type: 'spill', required: true, minConfidence: 0.6 },
        { type: 'person', required: true },
      ],
      spatialProximity: 2.0,
      timeWindow: 10000,
      confidenceBoost: 0.2,
      severity: 'high',
      outputType: 'slip_hazard',
      description: 'Person near spill - slip hazard',
    });

    // Exit Blocked + Fire = Evacuation Risk
    this.addRule({
      name: 'Evacuation Risk',
      enabled: true,
      priority: 100,
      signals: [
        { type: 'exit_blocked', required: true },
        { type: 'fire', required: true },
      ],
      timeWindow: 60000,
      confidenceBoost: 0.4,
      severity: 'critical',
      outputType: 'evacuation_risk',
      description: 'Fire with blocked emergency exit',
    });

    // Equipment Missing + Fire = Fire Safety Compromise
    this.addRule({
      name: 'Fire Safety Compromise',
      enabled: true,
      priority: 85,
      signals: [
        { type: 'equipment_missing', required: true },
        { type: 'fire', required: true },
      ],
      spatialProximity: 10.0,
      timeWindow: 120000,
      confidenceBoost: 0.3,
      severity: 'critical',
      outputType: 'fire_safety_compromise',
      description: 'Fire with missing safety equipment',
    });

    console.log(`✓ Initialized ${this.rules.size} default correlation rules`);
  }

  /**
   * Add correlation rule
   */
  addRule(rule: Omit<CorrelationRule, 'id'>): CorrelationRule {
    const id = `rule_${randomUUID().substring(0, 8)}`;
    const correlationRule: CorrelationRule = { id, ...rule };
    this.rules.set(id, correlationRule);
    console.log(`✓ Added correlation rule: ${rule.name} (${id})`);
    return correlationRule;
  }

  /**
   * Update rule
   */
  updateRule(ruleId: string, updates: Partial<CorrelationRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule not found: ${ruleId}`);
    Object.assign(rule, updates);
  }

  /**
   * Remove rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get rule
   */
  getRule(ruleId: string): CorrelationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getAllRules(): CorrelationRule[] {
    return Array.from(this.rules.values())
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): CorrelationRule[] {
    return this.getAllRules().filter(r => r.enabled);
  }

  // ============================================================================
  // Signal Processing
  // ============================================================================

  /**
   * Process incoming safety signal
   */
  processSignal(signal: Omit<SafetySignal, 'id'>): CorrelatedEvent[] {
    // Add ID and store signal
    const safetySignal: SafetySignal = {
      id: `signal_${randomUUID().substring(0, 8)}`,
      ...signal,
    };

    this.signalBuffer.push(safetySignal);
    this.statisticsCounter.totalSignals++;

    // Limit buffer size
    if (this.signalBuffer.length > this.maxBufferSize) {
      this.signalBuffer.shift();
    }

    // Try to correlate with existing signals
    const correlatedEvents = this.correlateSignals(safetySignal);

    return correlatedEvents;
  }

  /**
   * Process multiple signals
   */
  processSignals(signals: Array<Omit<SafetySignal, 'id'>>): CorrelatedEvent[] {
    const allCorrelatedEvents: CorrelatedEvent[] = [];

    for (const signal of signals) {
      const events = this.processSignal(signal);
      allCorrelatedEvents.push(...events);
    }

    return allCorrelatedEvents;
  }

  /**
   * Correlate signal with existing signals
   */
  private correlateSignals(newSignal: SafetySignal): CorrelatedEvent[] {
    const correlatedEvents: CorrelatedEvent[] = [];
    const enabledRules = this.getEnabledRules();

    for (const rule of enabledRules) {
      const correlation = this.evaluateRule(rule, newSignal);
      if (correlation) {
        correlatedEvents.push(correlation);
        this.statisticsCounter.correlatedSignals++;
      }
    }

    return correlatedEvents;
  }

  /**
   * Evaluate correlation rule against signals
   */
  private evaluateRule(
    rule: CorrelationRule,
    newSignal: SafetySignal
  ): CorrelatedEvent | null {
    const matchingSignals: SafetySignal[] = [];
    const now = newSignal.timestamp.getTime();

    // Check if new signal matches any required signal type
    const newSignalMatches = rule.signals.find(s => s.type === newSignal.type);
    if (!newSignalMatches) return null;

    // Check confidence threshold
    if (newSignalMatches.minConfidence && 
        newSignal.confidence < newSignalMatches.minConfidence) {
      return null;
    }

    matchingSignals.push(newSignal);

    // Find matching signals in buffer
    for (const bufferedSignal of this.signalBuffer) {
      if (bufferedSignal.id === newSignal.id) continue;

      // Check time window
      const timeDiff = Math.abs(now - bufferedSignal.timestamp.getTime());
      if (timeDiff > rule.timeWindow) continue;

      // Check if signal type matches rule requirements
      const signalSpec = rule.signals.find(s => s.type === bufferedSignal.type);
      if (!signalSpec) continue;

      // Check confidence threshold
      if (signalSpec.minConfidence && 
          bufferedSignal.confidence < signalSpec.minConfidence) {
        continue;
      }

      // Check spatial proximity if required
      if (rule.spatialProximity !== undefined) {
        const distance = this.calculateDistance(
          newSignal.location,
          bufferedSignal.location
        );
        if (distance > rule.spatialProximity) continue;
      }

      // Signal matches
      matchingSignals.push(bufferedSignal);
    }

    // Check if all required signals are present
    const requiredSignals = rule.signals.filter(s => s.required);
    const hasAllRequired = requiredSignals.every(reqSignal =>
      matchingSignals.some(ms => ms.type === reqSignal.type)
    );

    if (!hasAllRequired) return null;

    // Check if minimum number of signals met
    if (matchingSignals.length < rule.signals.length) {
      // Allow if all required are present
      if (!hasAllRequired) return null;
    }

    // Create correlated event
    return this.createCorrelatedEvent(rule, matchingSignals);
  }

  /**
   * Create correlated event from matched signals
   */
  private createCorrelatedEvent(
    rule: CorrelationRule,
    signals: SafetySignal[]
  ): CorrelatedEvent {
    // Calculate combined confidence
    const baseConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    const boostedConfidence = Math.min(baseConfidence + rule.confidenceBoost, 1.0);

    // Calculate average location
    const avgLocation = {
      x: signals.reduce((sum, s) => sum + s.location.x, 0) / signals.length,
      y: signals.reduce((sum, s) => sum + s.location.y, 0) / signals.length,
    };

    // Get most recent timestamp
    const mostRecent = signals.reduce((latest, s) => 
      s.timestamp > latest.timestamp ? s : latest
    );

    // Extract people affected from metadata
    const peopleAffected = new Set<string>();
    for (const signal of signals) {
      if (signal.metadata?.personId) {
        peopleAffected.add(signal.metadata.personId as string);
      }
      if (signal.metadata?.peopleNearby) {
        const nearby = signal.metadata.peopleNearby as string[];
        nearby.forEach(id => peopleAffected.add(id));
      }
    }

    const event: CorrelatedEvent = {
      id: `corr_${randomUUID().substring(0, 8)}`,
      type: rule.outputType,
      severity: rule.severity,
      confidence: boostedConfidence,
      location: avgLocation,
      timestamp: mostRecent.timestamp,
      signals,
      ruleId: rule.id,
      ruleName: rule.name,
      description: rule.description,
      zoneId: mostRecent.zoneId,
      peopleAffected: Array.from(peopleAffected),
      requiresImmediateAction: rule.severity === 'critical' || rule.severity === 'high',
      metadata: {
        signalCount: signals.length,
        confidenceBoost: rule.confidenceBoost,
        baseConfidence,
      },
    };

    // Store event
    this.correlatedEvents.set(event.id, event);
    this.eventHistory.push(event);

    // Limit history
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    console.log(`✓ Correlated event: ${rule.name} (confidence: ${Math.round(boostedConfidence * 100)}%)`);

    return event;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get active correlated events
   */
  getActiveEvents(): CorrelatedEvent[] {
    return Array.from(this.correlatedEvents.values());
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): CorrelatedEvent | undefined {
    return this.correlatedEvents.get(eventId);
  }

  /**
   * Get all events (including history)
   */
  getAllEvents(): CorrelatedEvent[] {
    return this.eventHistory;
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: CorrelatedEvent['severity']): CorrelatedEvent[] {
    return this.getActiveEvents().filter(e => e.severity === severity);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string): CorrelatedEvent[] {
    return this.getActiveEvents().filter(e => e.type === type);
  }

  /**
   * Get critical events requiring immediate action
   */
  getCriticalEvents(): CorrelatedEvent[] {
    return this.getActiveEvents().filter(e => e.requiresImmediateAction);
  }

  /**
   * Get recent signal buffer
   */
  getSignalBuffer(): SafetySignal[] {
    return [...this.signalBuffer];
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get correlation statistics
   */
  getStatistics(): CorrelationStatistics {
    const activeEvents = this.getActiveEvents();
    
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {
      low: 0, medium: 0, high: 0, critical: 0,
    };

    let totalConfidenceBoost = 0;

    for (const event of activeEvents) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity]++;
      
      const boost = event.metadata?.confidenceBoost as number || 0;
      totalConfidenceBoost += boost;
    }

    const correlationRate = this.statisticsCounter.totalSignals > 0
      ? (this.statisticsCounter.correlatedSignals / this.statisticsCounter.totalSignals) * 100
      : 0;

    const averageConfidenceBoost = activeEvents.length > 0
      ? totalConfidenceBoost / activeEvents.length
      : 0;

    return {
      totalSignals: this.statisticsCounter.totalSignals,
      correlatedSignals: this.statisticsCounter.correlatedSignals,
      correlatedEvents: this.eventHistory.length,
      falsePositivesReduced: this.statisticsCounter.falsePositivesReduced,
      byType,
      bySeverity,
      averageConfidenceBoost: Math.round(averageConfidenceBoost * 100) / 100,
      correlationRate: Math.round(correlationRate * 10) / 10,
    };
  }

  /**
   * Record false positive reduction
   */
  recordFalsePositiveReduction(): void {
    this.statisticsCounter.falsePositivesReduced++;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate distance between two points
   */
  private calculateDistance(
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Resolve correlated event
   */
  resolveEvent(eventId: string): void {
    this.correlatedEvents.delete(eventId);
  }

  /**
   * Acknowledge event
   */
  acknowledgeEvent(eventId: string, acknowledgedBy: string): void {
    const event = this.correlatedEvents.get(eventId);
    if (event) {
      event.metadata = {
        ...event.metadata,
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date(),
      };
    }
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic monitoring
   */
  private startCorrelationMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up old signals from buffer
      this.signalBuffer = this.signalBuffer.filter(signal => 
        now - signal.timestamp.getTime() < this.bufferRetentionTime
      );

      // Clean up old events
      this.cleanupOldEvents();
    }, 10000); // Every 10 seconds
  }

  /**
   * Clean up old events
   */
  private cleanupOldEvents(): void {
    const maxAge = 300000; // 5 minutes for active events
    const now = Date.now();

    const toRemove: string[] = [];
    for (const [id, event] of this.correlatedEvents.entries()) {
      const age = now - event.timestamp.getTime();
      if (age > maxAge) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.correlatedEvents.delete(id);
    }
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeEvents: number;
    criticalEvents: number;
    signalBufferSize: number;
    enabledRules: number;
  } {
    const activeEvents = this.getActiveEvents();
    const criticalEvents = this.getCriticalEvents().length;
    const enabledRules = this.getEnabledRules().length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalEvents > 0) status = 'unhealthy';
    else if (activeEvents.length > 5) status = 'degraded';

    return {
      status,
      activeEvents: activeEvents.length,
      criticalEvents,
      signalBufferSize: this.signalBuffer.length,
      enabledRules,
    };
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.signalBuffer = [];
    this.correlatedEvents.clear();
    this.eventHistory = [];
    this.statisticsCounter = {
      totalSignals: 0,
      correlatedSignals: 0,
      falsePositivesReduced: 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statisticsCounter = {
      totalSignals: 0,
      correlatedSignals: 0,
      falsePositivesReduced: 0,
    };
  }

  /**
   * Export configuration
   */
  exportConfiguration(): {
    rules: CorrelationRule[];
    version: string;
  } {
    return {
      rules: this.getAllRules(),
      version: '1.0.0',
    };
  }

  /**
   * Import configuration
   */
  importConfiguration(config: { rules: CorrelationRule[] }): void {
    for (const rule of config.rules) {
      this.rules.set(rule.id, rule);
    }
    console.log(`✓ Imported ${config.rules.length} correlation rules`);
  }
}
