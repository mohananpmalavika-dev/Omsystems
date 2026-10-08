/**
 * Zone Compliance Detector
 * Enforces zone access rules, PPE requirements, and occupancy limits
 */

import { randomUUID } from 'node:crypto';
import type { ZoneEngine, SafetyZone, TrackedPerson, ZoneOccupancy } from './zone-engine.js';
import type { ObjectTracker, MultiObjectTracker, TrackedObject } from './object-tracker.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ZoneRule {
  id: string;
  zoneId: string;
  type: 'access' | 'ppe' | 'occupancy' | 'time' | 'behavior';
  enabled: boolean;
  priority: number;
  conditions: {
    allowedRoles?: string[];
    allowedPersons?: string[];
    deniedRoles?: string[];
    deniedPersons?: string[];
    requiredPPE?: string[];
    maxOccupancy?: number;
    allowedHours?: { start: number; end: number }; // 0-23
    allowedDaysOfWeek?: number[]; // 0=Sunday, 6=Saturday
    maxDwellTime?: number; // seconds
    minClearance?: number; // meters
  };
  actions: {
    alert?: boolean;
    alertSeverity?: 'low' | 'medium' | 'high' | 'critical';
    record?: boolean;
    block?: boolean;
    notify?: string[]; // User IDs to notify
  };
  metadata?: Record<string, unknown>;
}

export interface ComplianceViolation {
  id: string;
  type: 'unauthorized_access' | 'missing_ppe' | 'occupancy_exceeded' | 'restricted_time' | 'dwell_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  zoneId: string;
  zoneName: string;
  personId?: string;
  ruleId: string;
  description: string;
  timestamp: Date;
  duration: number; // seconds
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface PersonContext {
  personId: string;
  role?: string;
  name?: string;
  badgeId?: string;
  ppeWearing: string[]; // PPE items currently worn
  faceRecognitionId?: string;
  authorizations?: string[]; // Zone IDs they're authorized for
}

export interface ComplianceReport {
  period: { start: Date; end: Date };
  totalViolations: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byZone: Record<string, number>;
  topViolators: Array<{ personId: string; violations: number }>;
  complianceRate: number; // 0-100
  averageResolutionTime: number; // seconds
}

// ============================================================================
// Zone Compliance Detector
// ============================================================================

export class ZoneComplianceDetector {
  private zoneEngine: ZoneEngine;
  private objectTracker: ObjectTracker | MultiObjectTracker;
  private rules = new Map<string, ZoneRule>();
  private violations = new Map<string, ComplianceViolation>();
  private personContext = new Map<string, PersonContext>();
  private violationHistory: ComplianceViolation[] = [];
  private readonly maxHistorySize = 10000;

  constructor(zoneEngine: ZoneEngine, objectTracker: ObjectTracker | MultiObjectTracker) {
    this.zoneEngine = zoneEngine;
    this.objectTracker = objectTracker;
    this.startComplianceMonitoring();
  }

  // ============================================================================
  // Rule Management
  // ============================================================================

  /**
   * Add compliance rule
   */
  addRule(rule: Omit<ZoneRule, 'id'>): ZoneRule {
    const id = `rule_${randomUUID().substring(0, 8)}`;
    const completeRule: ZoneRule = { id, ...rule };
    this.rules.set(id, completeRule);
    console.log(`✓ Added zone compliance rule: ${id} for zone ${rule.zoneId}`);
    return completeRule;
  }

  /**
   * Update rule
   */
  updateRule(ruleId: string, updates: Partial<ZoneRule>): void {
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
  getRule(ruleId: string): ZoneRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules for a zone
   */
  getZoneRules(zoneId: string): ZoneRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.zoneId === zoneId && r.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  // ============================================================================
  // Person Context Management
  // ============================================================================

  /**
   * Register person context (role, authorizations, etc.)
   */
  registerPersonContext(context: PersonContext): void {
    this.personContext.set(context.personId, context);
  }

  /**
   * Update person context
   */
  updatePersonContext(personId: string, updates: Partial<PersonContext>): void {
    const context = this.personContext.get(personId);
    if (context) {
      Object.assign(context, updates);
    } else {
      this.personContext.set(personId, { personId, ...updates } as PersonContext);
    }
  }

  /**
   * Get person context
   */
  getPersonContext(personId: string): PersonContext | undefined {
    return this.personContext.get(personId);
  }

  // ============================================================================
  // Compliance Checking
  // ============================================================================

  /**
   * Check compliance for all tracked persons
   */
  checkCompliance(timestamp: Date = new Date()): ComplianceViolation[] {
    const newViolations: ComplianceViolation[] = [];
    const trackedPersons = this.zoneEngine.getAllTrackedPersons();

    for (const person of trackedPersons) {
      if (!person.zone) continue;

      const rules = this.getZoneRules(person.zone.id);
      const context = this.personContext.get(person.id);

      for (const rule of rules) {
        const violation = this.evaluateRule(person, rule, context, timestamp);
        if (violation) {
          newViolations.push(violation);
        }
      }
    }

    // Check occupancy compliance
    const occupancyViolations = this.checkOccupancyCompliance(timestamp);
    newViolations.push(...occupancyViolations);

    return newViolations;
  }

  /**
   * Evaluate a single rule against a person
   */
  private evaluateRule(
    person: TrackedPerson,
    rule: ZoneRule,
    context: PersonContext | undefined,
    timestamp: Date
  ): ComplianceViolation | null {
    const zone = person.zone!;

    switch (rule.type) {
      case 'access':
        return this.checkAccessRule(person, zone, rule, context, timestamp);
      
      case 'ppe':
        return this.checkPPERule(person, zone, rule, context, timestamp);
      
      case 'time':
        return this.checkTimeRule(person, zone, rule, timestamp);
      
      case 'behavior':
        return this.checkBehaviorRule(person, zone, rule, timestamp);
      
      default:
        return null;
    }
  }

  /**
   * Check access control rule
   */
  private checkAccessRule(
    person: TrackedPerson,
    zone: SafetyZone,
    rule: ZoneRule,
    context: PersonContext | undefined,
    timestamp: Date
  ): ComplianceViolation | null {
    const { allowedRoles, allowedPersons, deniedRoles, deniedPersons } = rule.conditions;

    // Check if person is explicitly denied
    if (deniedPersons && deniedPersons.includes(person.id)) {
      return this.createViolation({
        type: 'unauthorized_access',
        severity: rule.actions.alertSeverity || 'high',
        zoneId: zone.id,
        zoneName: zone.name,
        personId: person.id,
        ruleId: rule.id,
        description: `Person ${person.id} is explicitly denied access to ${zone.name}`,
        timestamp,
      });
    }

    // Check role-based access
    if (context?.role) {
      if (deniedRoles && deniedRoles.includes(context.role)) {
        return this.createViolation({
          type: 'unauthorized_access',
          severity: rule.actions.alertSeverity || 'high',
          zoneId: zone.id,
          zoneName: zone.name,
          personId: person.id,
          ruleId: rule.id,
          description: `Role ${context.role} is denied access to ${zone.name}`,
          timestamp,
        });
      }

      if (allowedRoles && !allowedRoles.includes(context.role)) {
        return this.createViolation({
          type: 'unauthorized_access',
          severity: rule.actions.alertSeverity || 'medium',
          zoneId: zone.id,
          zoneName: zone.name,
          personId: person.id,
          ruleId: rule.id,
          description: `Role ${context.role} not authorized for ${zone.name}`,
          timestamp,
        });
      }
    }

    // Check person-specific access
    if (allowedPersons && !allowedPersons.includes(person.id)) {
      // Check if person is authorized via context
      if (!context?.authorizations?.includes(zone.id)) {
        return this.createViolation({
          type: 'unauthorized_access',
          severity: rule.actions.alertSeverity || 'medium',
          zoneId: zone.id,
          zoneName: zone.name,
          personId: person.id,
          ruleId: rule.id,
          description: `Person ${person.id} not authorized for ${zone.name}`,
          timestamp,
        });
      }
    }

    return null;
  }

  /**
   * Check PPE compliance rule
   */
  private checkPPERule(
    person: TrackedPerson,
    zone: SafetyZone,
    rule: ZoneRule,
    context: PersonContext | undefined,
    timestamp: Date
  ): ComplianceViolation | null {
    const { requiredPPE } = rule.conditions;
    if (!requiredPPE || requiredPPE.length === 0) return null;

    const wearingPPE = context?.ppeWearing || [];
    const missingPPE = requiredPPE.filter(ppe => !wearingPPE.includes(ppe));

    if (missingPPE.length > 0) {
      return this.createViolation({
        type: 'missing_ppe',
        severity: this.calculatePPESeverity(missingPPE),
        zoneId: zone.id,
        zoneName: zone.name,
        personId: person.id,
        ruleId: rule.id,
        description: `Missing required PPE in ${zone.name}: ${missingPPE.join(', ')}`,
        timestamp,
        metadata: { missingPPE, requiredPPE },
      });
    }

    return null;
  }

  /**
   * Check time restriction rule
   */
  private checkTimeRule(
    person: TrackedPerson,
    zone: SafetyZone,
    rule: ZoneRule,
    timestamp: Date
  ): ComplianceViolation | null {
    const { allowedHours, allowedDaysOfWeek, maxDwellTime } = rule.conditions;

    // Check allowed hours
    if (allowedHours) {
      const hour = timestamp.getHours();
      if (hour < allowedHours.start || hour >= allowedHours.end) {
        return this.createViolation({
          type: 'restricted_time',
          severity: rule.actions.alertSeverity || 'medium',
          zoneId: zone.id,
          zoneName: zone.name,
          personId: person.id,
          ruleId: rule.id,
          description: `Access to ${zone.name} restricted to hours ${allowedHours.start}-${allowedHours.end}`,
          timestamp,
        });
      }
    }

    // Check allowed days of week
    if (allowedDaysOfWeek) {
      const dayOfWeek = timestamp.getDay();
      if (!allowedDaysOfWeek.includes(dayOfWeek)) {
        return this.createViolation({
          type: 'restricted_time',
          severity: rule.actions.alertSeverity || 'medium',
          zoneId: zone.id,
          zoneName: zone.name,
          personId: person.id,
          ruleId: rule.id,
          description: `Access to ${zone.name} restricted on this day of week`,
          timestamp,
        });
      }
    }

    // Check max dwell time
    if (maxDwellTime && person.duration && person.duration > maxDwellTime) {
      return this.createViolation({
        type: 'dwell_exceeded',
        severity: rule.actions.alertSeverity || 'low',
        zoneId: zone.id,
        zoneName: zone.name,
        personId: person.id,
        ruleId: rule.id,
        description: `Exceeded maximum dwell time in ${zone.name}: ${Math.round(person.duration)}s / ${maxDwellTime}s`,
        timestamp,
        metadata: { duration: person.duration, maxDwellTime },
      });
    }

    return null;
  }

  /**
   * Check behavior rule (speed, direction, etc.)
   */
  private checkBehaviorRule(
    person: TrackedPerson,
    zone: SafetyZone,
    rule: ZoneRule,
    timestamp: Date
  ): ComplianceViolation | null {
    // Future: Check for running, loitering, wrong direction, etc.
    return null;
  }

  /**
   * Check occupancy compliance
   */
  private checkOccupancyCompliance(timestamp: Date): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];
    const occupancies = this.zoneEngine.getAllOccupancies();

    for (const occupancy of occupancies) {
      if (occupancy.isOverCapacity) {
        const zone = this.zoneEngine.getZone(occupancy.zoneId);
        if (!zone) continue;

        // Check if we already have an active violation for this zone
        const existingViolation = Array.from(this.violations.values())
          .find(v => v.zoneId === occupancy.zoneId && v.type === 'occupancy_exceeded' && !v.resolved);

        if (existingViolation) {
          // Update duration
          existingViolation.duration = (timestamp.getTime() - existingViolation.timestamp.getTime()) / 1000;
        } else {
          // Create new violation
          const violation = this.createViolation({
            type: 'occupancy_exceeded',
            severity: this.calculateOccupancySeverity(occupancy),
            zoneId: occupancy.zoneId,
            zoneName: occupancy.zoneName,
            ruleId: 'occupancy_rule',
            description: `Occupancy exceeded in ${occupancy.zoneName}: ${occupancy.current} / ${occupancy.maximum}`,
            timestamp,
            metadata: {
              current: occupancy.current,
              maximum: occupancy.maximum,
              occupants: occupancy.occupants,
            },
          });
          violations.push(violation);
        }
      } else {
        // Resolve any existing occupancy violations for this zone
        const existingViolation = Array.from(this.violations.values())
          .find(v => v.zoneId === occupancy.zoneId && v.type === 'occupancy_exceeded' && !v.resolved);
        
        if (existingViolation) {
          this.resolveViolation(existingViolation.id, timestamp);
        }
      }
    }

    return violations;
  }

  // ============================================================================
  // Violation Management
  // ============================================================================

  /**
   * Create and register violation
   */
  private createViolation(params: {
    type: ComplianceViolation['type'];
    severity: ComplianceViolation['severity'];
    zoneId: string;
    zoneName: string;
    personId?: string;
    ruleId: string;
    description: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }): ComplianceViolation {
    // Check if similar violation already exists (within 10 seconds)
    const existingKey = `${params.zoneId}_${params.personId}_${params.type}`;
    const existingViolation = this.violations.get(existingKey);

    if (existingViolation && !existingViolation.resolved) {
      // Update existing violation duration
      existingViolation.duration = (params.timestamp.getTime() - existingViolation.timestamp.getTime()) / 1000;
      return existingViolation;
    }

    // Create new violation
    const violation: ComplianceViolation = {
      id: `violation_${randomUUID().substring(0, 8)}`,
      ...params,
      duration: 0,
      resolved: false,
    };

    this.violations.set(existingKey, violation);
    this.violationHistory.push(violation);

    // Limit history size
    if (this.violationHistory.length > this.maxHistorySize) {
      this.violationHistory.shift();
    }

    return violation;
  }

  /**
   * Resolve violation
   */
  resolveViolation(violationId: string, resolvedAt: Date = new Date()): void {
    for (const [key, violation] of this.violations.entries()) {
      if (violation.id === violationId && !violation.resolved) {
        violation.resolved = true;
        violation.resolvedAt = resolvedAt;
        violation.duration = (resolvedAt.getTime() - violation.timestamp.getTime()) / 1000;
        this.violations.delete(key);
        break;
      }
    }
  }

  /**
   * Get active violations
   */
  getActiveViolations(): ComplianceViolation[] {
    return Array.from(this.violations.values()).filter(v => !v.resolved);
  }

  /**
   * Get violations by zone
   */
  getViolationsByZone(zoneId: string, includeResolved = false): ComplianceViolation[] {
    const source = includeResolved ? this.violationHistory : this.getActiveViolations();
    return source.filter(v => v.zoneId === zoneId);
  }

  /**
   * Get violations by person
   */
  getViolationsByPerson(personId: string, includeResolved = false): ComplianceViolation[] {
    const source = includeResolved ? this.violationHistory : this.getActiveViolations();
    return source.filter(v => v.personId === personId);
  }

  /**
   * Get violations by severity
   */
  getViolationsBySeverity(severity: ComplianceViolation['severity']): ComplianceViolation[] {
    return this.getActiveViolations().filter(v => v.severity === severity);
  }

  // ============================================================================
  // Analytics & Reporting
  // ============================================================================

  /**
   * Generate compliance report
   */
  generateReport(startDate: Date, endDate: Date): ComplianceReport {
    const periodViolations = this.violationHistory.filter(
      v => v.timestamp >= startDate && v.timestamp <= endDate
    );

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byZone: Record<string, number> = {};
    const personViolations = new Map<string, number>();
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const violation of periodViolations) {
      byType[violation.type] = (byType[violation.type] || 0) + 1;
      bySeverity[violation.severity]++;
      byZone[violation.zoneId] = (byZone[violation.zoneId] || 0) + 1;

      if (violation.personId) {
        personViolations.set(
          violation.personId,
          (personViolations.get(violation.personId) || 0) + 1
        );
      }

      if (violation.resolved && violation.resolvedAt) {
        totalResolutionTime += (violation.resolvedAt.getTime() - violation.timestamp.getTime()) / 1000;
        resolvedCount++;
      }
    }

    const topViolators = Array.from(personViolations.entries())
      .map(([personId, violations]) => ({ personId, violations }))
      .sort((a, b) => b.violations - a.violations)
      .slice(0, 10);

    // Calculate compliance rate (percentage of time without violations)
    const totalChecks = this.violationHistory.length;
    const complianceRate = totalChecks > 0 ? ((totalChecks - periodViolations.length) / totalChecks) * 100 : 100;

    return {
      period: { start: startDate, end: endDate },
      totalViolations: periodViolations.length,
      byType,
      bySeverity,
      byZone,
      topViolators,
      complianceRate: Math.round(complianceRate * 10) / 10,
      averageResolutionTime: resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0,
    };
  }

  /**
   * Get compliance statistics
   */
  getStatistics(): {
    activeViolations: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    byZone: Record<string, number>;
    totalRules: number;
    enabledRules: number;
  } {
    const activeViolations = this.getActiveViolations();
    const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byType: Record<string, number> = {};
    const byZone: Record<string, number> = {};

    for (const violation of activeViolations) {
      bySeverity[violation.severity]++;
      byType[violation.type] = (byType[violation.type] || 0) + 1;
      byZone[violation.zoneId] = (byZone[violation.zoneId] || 0) + 1;
    }

    const totalRules = this.rules.size;
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled).length;

    return {
      activeViolations: activeViolations.length,
      bySeverity,
      byType,
      byZone,
      totalRules,
      enabledRules,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate PPE violation severity
   */
  private calculatePPESeverity(missingPPE: string[]): ComplianceViolation['severity'] {
    const criticalPPE = ['helmet', 'hardhat', 'respirator', 'mask'];
    const hasCritical = missingPPE.some(ppe => criticalPPE.includes(ppe));

    if (hasCritical) return 'critical';
    if (missingPPE.length >= 3) return 'high';
    if (missingPPE.length >= 2) return 'medium';
    return 'low';
  }

  /**
   * Calculate occupancy violation severity
   */
  private calculateOccupancySeverity(occupancy: ZoneOccupancy): ComplianceViolation['severity'] {
    if (!occupancy.maximum) return 'medium';

    const overCapacityPercent = ((occupancy.current - occupancy.maximum) / occupancy.maximum) * 100;

    if (overCapacityPercent >= 50) return 'critical';
    if (overCapacityPercent >= 25) return 'high';
    if (overCapacityPercent >= 10) return 'medium';
    return 'low';
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic compliance monitoring
   */
  private startComplianceMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      // Check compliance
      this.checkCompliance(now);

      // Auto-resolve violations where person left zone
      this.autoResolveViolations(now);

      // Clean up old resolved violations from memory
      this.cleanupOldViolations();
    }, 5000); // Every 5 seconds
  }

  /**
   * Auto-resolve violations when person leaves zone
   */
  private autoResolveViolations(timestamp: Date): void {
    const trackedPersons = this.zoneEngine.getAllTrackedPersons();
    const trackedPersonIds = new Set(trackedPersons.map(p => p.id));

    for (const [key, violation] of this.violations.entries()) {
      if (violation.resolved) continue;
      if (!violation.personId) continue;

      // Check if person is still being tracked
      if (!trackedPersonIds.has(violation.personId)) {
        this.resolveViolation(violation.id, timestamp);
        continue;
      }

      // Check if person left the zone
      const person = trackedPersons.find(p => p.id === violation.personId);
      if (person && person.zoneId !== violation.zoneId) {
        this.resolveViolation(violation.id, timestamp);
      }
    }
  }

  /**
   * Clean up old resolved violations from memory
   */
  private cleanupOldViolations(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();

    this.violationHistory = this.violationHistory.filter(v => {
      if (!v.resolved) return true;
      if (!v.resolvedAt) return true;
      return (now - v.resolvedAt.getTime()) < maxAge;
    });
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeViolations: number;
    criticalViolations: number;
    totalRules: number;
  } {
    const activeViolations = this.getActiveViolations();
    const criticalViolations = activeViolations.filter(v => v.severity === 'critical').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalViolations > 0) status = 'unhealthy';
    else if (activeViolations.length > 10) status = 'degraded';

    return {
      status,
      activeViolations: activeViolations.length,
      criticalViolations,
      totalRules: this.rules.size,
    };
  }

  /**
   * Clear all violations and history
   */
  clearAll(): void {
    this.violations.clear();
    this.violationHistory = [];
  }
}
