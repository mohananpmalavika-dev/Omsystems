import type { ControlPlaneStore } from '../control-plane-store.js';

/**
 * SLA Management and Auto-Assignment Service
 * 
 * Manages incident SLAs, auto-assignment rules, and escalation workflows.
 */

export interface SLAConfig {
  // Time to acknowledge incident (minutes)
  acknowledgeWithinMinutes: number;
  // Time to start investigation (minutes)
  investigateWithinMinutes: number;
  // Time to resolve incident (minutes)
  resolveWithinMinutes: number;
  // Time to close incident (minutes)
  closeWithinMinutes: number;
  // Auto-escalate on breach
  autoEscalate: boolean;
  // Escalation recipients
  escalationRecipients?: string[];
}

const SLA_CONFIGS: Record<string, SLAConfig> = {
  'P1': {
    acknowledgeWithinMinutes: 2,
    investigateWithinMinutes: 5,
    resolveWithinMinutes: 60,
    closeWithinMinutes: 120,
    autoEscalate: true,
  },
  'P2': {
    acknowledgeWithinMinutes: 5,
    investigateWithinMinutes: 15,
    resolveWithinMinutes: 240,
    closeWithinMinutes: 480,
    autoEscalate: true,
  },
  'P3': {
    acknowledgeWithinMinutes: 15,
    investigateWithinMinutes: 30,
    resolveWithinMinutes: 1440,
    closeWithinMinutes: 2880,
    autoEscalate: false,
  },
  'P4': {
    acknowledgeWithinMinutes: 60,
    investigateWithinMinutes: 240,
    resolveWithinMinutes: 4320,
    closeWithinMinutes: 7200,
    autoEscalate: false,
  },
  'P5': {
    acknowledgeWithinMinutes: 240,
    investigateWithinMinutes: 1440,
    resolveWithinMinutes: 10080,
    closeWithinMinutes: 20160,
    autoEscalate: false,
  },
};

export interface AssignmentRule {
  priority: number;
  conditions: {
    incidentType?: string[];
    severity?: string[];
    branchId?: string;
    timeRange?: { start: string; end: string };
  };
  assignTo: 'specific-user' | 'round-robin' | 'least-loaded' | 'on-call' | 'skill-based';
  targetUsers?: string[];
  targetRole?: string;
  escalationGroup?: string;
}

export interface SLAStatus {
  incidentId: string;
  severity: string;
  status: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  investigationStartedAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  slaConfig: SLAConfig;
  breaches: {
    acknowledge?: { breachedAt: Date; breachDurationMinutes: number };
    investigate?: { breachedAt: Date; breachDurationMinutes: number };
    resolve?: { breachedAt: Date; breachDurationMinutes: number };
    close?: { breachedAt: Date; breachDurationMinutes: number };
  };
  nextDeadline?: {
    type: 'acknowledge' | 'investigate' | 'resolve' | 'close';
    deadlineAt: Date;
    minutesRemaining: number;
  };
}

export class IncidentSLAService {
  private assignmentRules: AssignmentRule[] = [];
  private slaTimers = new Map<string, NodeJS.Timeout>();
  private userWorkload = new Map<string, number>();
  private roundRobinIndex = new Map<string, number>();
  
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly logger?: Console
  ) {
    // Check SLA breaches every minute
    setInterval(() => this.checkSLABreaches(), 60 * 1000);
    
    // Initialize default assignment rules
    this.initializeDefaultRules();
  }
  
  /**
   * Auto-assign incident based on rules
   */
  async autoAssign(input: {
    incidentId: string;
    tenantId: string;
    branchId?: string;
    incidentType: string;
    severity: string;
  }): Promise<{ assigned: boolean; userId?: string; reason: string }> {
    try {
      const incident = await this.store.getIncident(input.incidentId);
      if (!incident) {
        return { assigned: false, reason: 'incident_not_found' };
      }
      
      // Find matching assignment rule
      const rule = this.findMatchingRule(input);
      
      if (!rule) {
        return { assigned: false, reason: 'no_matching_rule' };
      }
      
      // Get target user based on assignment strategy
      const userId = await this.selectUser(rule, input);
      
      if (!userId) {
        return { assigned: false, reason: 'no_available_user' };
      }
      
      // Assign incident
      await this.store.assignIncident(input.incidentId, userId, 'system');
      
      // Update workload tracking
      this.incrementUserWorkload(userId);
      
      // Start SLA timers
      await this.startSLATimers(input.incidentId, input.severity);
      
      // Add assignment event
      await this.store.addIncidentEvent({
        incidentId: input.incidentId,
        eventType: 'assigned',
        description: `Auto-assigned using ${rule.assignTo} strategy`,
        details: { userId, rule: rule.conditions },
        performedBy: 'system',
      });
      
      this.logger?.log(`Incident ${input.incidentId} auto-assigned to user ${userId}`);
      
      return { assigned: true, userId, reason: `assigned_via_${rule.assignTo}` };
    } catch (error) {
      this.logger?.error(`Failed to auto-assign incident ${input.incidentId}:`, error);
      return { assigned: false, reason: 'assignment_failed' };
    }
  }
  
  /**
   * Find matching assignment rule
   */
  private findMatchingRule(input: {
    incidentType: string;
    severity: string;
    branchId?: string;
  }): AssignmentRule | undefined {
    const sortedRules = [...this.assignmentRules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      const { conditions } = rule;
      
      // Check incident type
      if (conditions.incidentType && !conditions.incidentType.includes(input.incidentType)) {
        continue;
      }
      
      // Check severity
      if (conditions.severity && !conditions.severity.includes(input.severity)) {
        continue;
      }
      
      // Check branch
      if (conditions.branchId && conditions.branchId !== input.branchId) {
        continue;
      }
      
      // Check time range
      if (conditions.timeRange) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        if (currentTime < conditions.timeRange.start || currentTime > conditions.timeRange.end) {
          continue;
        }
      }
      
      return rule;
    }
    
    return undefined;
  }
  
  /**
   * Select user based on assignment strategy
   */
  private async selectUser(
    rule: AssignmentRule,
    context: { tenantId: string; branchId?: string }
  ): Promise<string | undefined> {
    switch (rule.assignTo) {
      case 'specific-user':
        return rule.targetUsers?.[0];
        
      case 'round-robin':
        return this.selectRoundRobin(rule.targetUsers || []);
        
      case 'least-loaded':
        return this.selectLeastLoaded(rule.targetUsers || []);
        
      case 'on-call':
        return await this.selectOnCall(context.tenantId, rule.targetRole);
        
      case 'skill-based':
        return await this.selectSkillBased(context.tenantId, rule.targetRole);
        
      default:
        return undefined;
    }
  }
  
  /**
   * Round-robin assignment
   */
  private selectRoundRobin(users: string[]): string | undefined {
    if (users.length === 0) return undefined;
    
    const key = users.join(',');
    const currentIndex = this.roundRobinIndex.get(key) || 0;
    const nextIndex = (currentIndex + 1) % users.length;
    
    this.roundRobinIndex.set(key, nextIndex);
    
    return users[currentIndex];
  }
  
  /**
   * Least-loaded assignment
   */
  private selectLeastLoaded(users: string[]): string | undefined {
    if (users.length === 0) return undefined;
    
    let minLoad = Number.POSITIVE_INFINITY;
    let selectedUser: string | undefined;
    
    for (const userId of users) {
      const load = this.userWorkload.get(userId) || 0;
      if (load < minLoad) {
        minLoad = load;
        selectedUser = userId;
      }
    }
    
    return selectedUser;
  }
  
  /**
   * On-call assignment (simplified)
   */
  private async selectOnCall(tenantId: string, role?: string): Promise<string | undefined> {
    // In production, this would query on-call schedule
    // For now, return first available user with role
    return 'on-call-user-placeholder';
  }
  
  /**
   * Skill-based assignment (simplified)
   */
  private async selectSkillBased(tenantId: string, role?: string): Promise<string | undefined> {
    // In production, this would match user skills to incident requirements
    return 'skilled-user-placeholder';
  }
  
  /**
   * Increment user workload
   */
  private incrementUserWorkload(userId: string): void {
    const current = this.userWorkload.get(userId) || 0;
    this.userWorkload.set(userId, current + 1);
  }
  
  /**
   * Decrement user workload
   */
  private decrementUserWorkload(userId: string): void {
    const current = this.userWorkload.get(userId) || 0;
    if (current > 0) {
      this.userWorkload.set(userId, current - 1);
    }
  }
  
  /**
   * Start SLA timers for an incident
   */
  async startSLATimers(incidentId: string, severity: string): Promise<void> {
    const config = SLA_CONFIGS[severity] || SLA_CONFIGS['P3'];
    const now = Date.now();
    
    // Schedule acknowledgement check
    const acknowledgeTimer = setTimeout(
      () => this.checkAcknowledgement(incidentId),
      config.acknowledgeWithinMinutes * 60 * 1000
    );
    
    this.slaTimers.set(`${incidentId}:acknowledge`, acknowledgeTimer);
    
    // Schedule investigation check
    const investigateTimer = setTimeout(
      () => this.checkInvestigation(incidentId),
      config.investigateWithinMinutes * 60 * 1000
    );
    
    this.slaTimers.set(`${incidentId}:investigate`, investigateTimer);
    
    this.logger?.log(`SLA timers started for incident ${incidentId} (${severity})`);
  }
  
  /**
   * Check acknowledgement SLA
   */
  private async checkAcknowledgement(incidentId: string): Promise<void> {
    try {
      const incident = await this.store.getIncident(incidentId);
      if (!incident) return;
      
      const config = SLA_CONFIGS[incident.severity];
      if (!config) return;
      
      // Check if acknowledged
      if (incident.status === 'acknowledged' || incident.status === 'under-investigation') {
        return;
      }
      
      // SLA breached
      await this.handleSLABreach(incidentId, 'acknowledge', incident.severity);
    } catch (error) {
      this.logger?.error(`Failed to check acknowledgement SLA for incident ${incidentId}:`, error);
    }
  }
  
  /**
   * Check investigation SLA
   */
  private async checkInvestigation(incidentId: string): Promise<void> {
    try {
      const incident = await this.store.getIncident(incidentId);
      if (!incident) return;
      
      const config = SLA_CONFIGS[incident.severity];
      if (!config) return;
      
      // Check if investigation started
      if (incident.status === 'under-investigation' || incident.status === 'resolved') {
        return;
      }
      
      // SLA breached
      await this.handleSLABreach(incidentId, 'investigate', incident.severity);
    } catch (error) {
      this.logger?.error(`Failed to check investigation SLA for incident ${incidentId}:`, error);
    }
  }
  
  /**
   * Handle SLA breach
   */
  private async handleSLABreach(
    incidentId: string,
    breachType: 'acknowledge' | 'investigate' | 'resolve' | 'close',
    severity: string
  ): Promise<void> {
    try {
      const config = SLA_CONFIGS[severity];
      if (!config) return;
      
      // Add breach event
      await this.store.addIncidentEvent({
        incidentId,
        eventType: 'sla_breach',
        description: `SLA breach: ${breachType} deadline missed`,
        details: { breachType, severity, config },
        performedBy: 'system',
      });
      
      // Auto-escalate if configured
      if (config.autoEscalate) {
        await this.store.escalateIncident(
          incidentId,
          'system',
          `SLA breach: ${breachType} deadline exceeded`,
          config.escalationRecipients || []
        );
        
        this.logger?.log(`Incident ${incidentId} auto-escalated due to ${breachType} SLA breach`);
      }
      
      // Send notifications (would integrate with notification service)
      this.logger?.warn(`SLA breach for incident ${incidentId}: ${breachType}`);
    } catch (error) {
      this.logger?.error(`Failed to handle SLA breach for incident ${incidentId}:`, error);
    }
  }
  
  /**
   * Check all active incidents for SLA breaches
   */
  private async checkSLABreaches(): Promise<void> {
    try {
      // This would query all open incidents and check their SLAs
      // Implementation depends on having tenant context
    } catch (error) {
      this.logger?.error('Failed to check SLA breaches:', error);
    }
  }
  
  /**
   * Get SLA status for an incident
   */
  async getSLAStatus(incidentId: string): Promise<SLAStatus | null> {
    try {
      const incident = await this.store.getIncident(incidentId);
      if (!incident) return null;
      
      const config = SLA_CONFIGS[incident.severity];
      if (!config) {
        const defaultConfig = SLA_CONFIGS['P3'];
        if (!defaultConfig) {
          // This should never happen, but TypeScript needs the check
          throw new Error('Default SLA config P3 not found');
        }
        return {
          incidentId: incident.id ?? '',
          severity: incident.severity,
          status: incident.status,
          createdAt: new Date(incident.createdAt),
          slaConfig: defaultConfig,
          breaches: {},
        };
      }
      
      const createdAt = new Date(incident.createdAt);
      const now = new Date();
      
      const breaches: SLAStatus['breaches'] = {};
      
      // Check acknowledge breach
      const acknowledgeDeadline = new Date(createdAt.getTime() + config.acknowledgeWithinMinutes * 60 * 1000);
      if (!incident.acknowledgedAt && now > acknowledgeDeadline) {
        breaches.acknowledge = {
          breachedAt: acknowledgeDeadline,
          breachDurationMinutes: Math.round((now.getTime() - acknowledgeDeadline.getTime()) / 60000),
        };
      }
      
      // Determine next deadline
      let nextDeadline: SLAStatus['nextDeadline'];
      
      if (!incident.acknowledgedAt) {
        const minutesRemaining = Math.round((acknowledgeDeadline.getTime() - now.getTime()) / 60000);
        if (minutesRemaining > 0) {
          nextDeadline = {
            type: 'acknowledge',
            deadlineAt: acknowledgeDeadline,
            minutesRemaining,
          };
        }
      }
      
      return {
        incidentId: incident.id ?? '',
        severity: incident.severity,
        status: incident.status,
        createdAt,
        slaConfig: config,
        breaches,
        nextDeadline,
      };
    } catch (error) {
      this.logger?.error(`Failed to get SLA status for incident ${incidentId}:`, error);
      return null;
    }
  }
  
  /**
   * Add custom assignment rule
   */
  addAssignmentRule(rule: AssignmentRule): void {
    this.assignmentRules.push(rule);
    this.assignmentRules.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Initialize default assignment rules
   */
  private initializeDefaultRules(): void {
    // Critical incidents to senior security officer
    this.addAssignmentRule({
      priority: 1,
      conditions: { severity: ['P1'] },
      assignTo: 'on-call',
      targetRole: 'senior-security-officer',
      escalationGroup: 'security-leadership',
    });
    
    // High priority incidents during business hours
    this.addAssignmentRule({
      priority: 2,
      conditions: { 
        severity: ['P2'],
        timeRange: { start: '09:00', end: '18:00' },
      },
      assignTo: 'round-robin',
      targetRole: 'security-officer',
    });
    
    // Fire and safety incidents
    this.addAssignmentRule({
      priority: 3,
      conditions: { incidentType: ['fire', 'smoke'] },
      assignTo: 'on-call',
      targetRole: 'fire-safety-officer',
    });
    
    // ATM and fraud incidents
    this.addAssignmentRule({
      priority: 4,
      conditions: { incidentType: ['atm-tampering', 'fraud'] },
      assignTo: 'skill-based',
      targetRole: 'fraud-investigator',
    });
    
    // Default rule - least loaded operator
    this.addAssignmentRule({
      priority: 100,
      conditions: {},
      assignTo: 'least-loaded',
      targetRole: 'security-operator',
    });
  }
  
  /**
   * Stop SLA timers for an incident
   */
  stopSLATimers(incidentId: string): void {
    const timerKeys = Array.from(this.slaTimers.keys()).filter(key => key.startsWith(`${incidentId}:`));
    
    for (const key of timerKeys) {
      const timer = this.slaTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.slaTimers.delete(key);
      }
    }
  }
  
  /**
   * Clean up on service shutdown
   */
  destroy(): void {
    for (const timer of this.slaTimers.values()) {
      clearTimeout(timer);
    }
    this.slaTimers.clear();
  }
}
