import type { ControlPlaneStore } from '../control-plane-store.js';

/**
 * Incident Workflow State Machine
 * 
 * Enforces valid state transitions, mandatory checks, and closure requirements.
 */

export type IncidentStatus =
  | 'new'
  | 'awaiting-verification'
  | 'verified'
  | 'false-positive'
  | 'assigned'
  | 'acknowledged'
  | 'under-investigation'
  | 'evidence-collection'
  | 'escalated'
  | 'awaiting-external-action'
  | 'report-preparation'
  | 'pending-review'
  | 'resolved'
  | 'closed'
  | 'reopened'
  | 'cancelled';

export interface StateTransition {
  from: IncidentStatus[];
  to: IncidentStatus;
  requiredActions?: string[];
  requiredChecks?: ((incident: any) => Promise<ValidationResult>)[];
  allowedRoles?: string[];
  notifyRoles?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface WorkflowConfig {
  allowDirectClosure?: boolean;
  requireEvidenceForClosure?: boolean;
  requireReportForClosure?: boolean;
  requireSupervisorApproval?: boolean;
  requirePoliceIntimationForTypes?: string[];
  requireInsuranceForTypes?: string[];
}

export class IncidentWorkflowService {
  private transitions: Map<string, StateTransition> = new Map();
  
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly logger?: Console
  ) {
    this.initializeTransitions();
  }
  
  /**
   * Validate and execute state transition
   */
  async transition(input: {
    incidentId: string;
    toStatus: IncidentStatus;
    performedBy: string;
    userRole?: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    incident?: any;
    errors?: string[];
    warnings?: string[];
  }> {
    try {
      // Get current incident
      const incident = await this.store.getIncident(input.incidentId);
      if (!incident) {
        return { success: false, errors: ['incident_not_found'] };
      }
      
      const currentStatus = incident.status as IncidentStatus;
      const targetStatus = input.toStatus;
      
      // Find valid transition
      const transition = this.findTransition(currentStatus, targetStatus);
      if (!transition) {
        return {
          success: false,
          errors: [`Invalid transition from ${currentStatus} to ${targetStatus}`],
        };
      }
      
      // Validate role permissions
      if (transition.allowedRoles && input.userRole) {
        if (!transition.allowedRoles.includes(input.userRole)) {
          return {
            success: false,
            errors: [`Role ${input.userRole} not allowed to perform this transition`],
          };
        }
      }
      
      // Run required checks
      const validation = await this.validateTransition(incident, transition);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      
      // Execute transition
      const updated = await this.store.updateIncidentStatus(
        input.incidentId,
        targetStatus,
        input.performedBy,
        input.notes
      );
      
      // Post-transition actions
      await this.executePostTransitionActions(incident, transition, input.performedBy);
      
      this.logger?.log(`Incident ${input.incidentId} transitioned from ${currentStatus} to ${targetStatus}`);
      
      return {
        success: true,
        incident: updated,
        warnings: validation.warnings,
      };
    } catch (error) {
      this.logger?.error(`Failed to transition incident ${input.incidentId}:`, error);
      return {
        success: false,
        errors: ['transition_failed'],
      };
    }
  }
  
  /**
   * Find valid transition
   */
  private findTransition(from: IncidentStatus, to: IncidentStatus): StateTransition | undefined {
    const key = `${from}->${to}`;
    const transition = this.transitions.get(key);
    
    if (transition) return transition;
    
    // Check wildcard transitions
    for (const [transKey, trans] of this.transitions.entries()) {
      if (trans.to === to && trans.from.includes(from)) {
        return trans;
      }
    }
    
    return undefined;
  }
  
  /**
   * Validate transition requirements
   */
  private async validateTransition(
    incident: any,
    transition: StateTransition
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Run custom checks
    if (transition.requiredChecks) {
      for (const check of transition.requiredChecks) {
        const result = await check(incident);
        if (!result.valid) {
          errors.push(...(result.errors || []));
        }
        warnings.push(...(result.warnings || []));
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
  
  /**
   * Execute post-transition actions
   */
  private async executePostTransitionActions(
    incident: any,
    transition: StateTransition,
    performedBy: string
  ): Promise<void> {
    // Send notifications to required roles
    if (transition.notifyRoles) {
      // In production, integrate with notification service
      this.logger?.log(`Notifications would be sent to: ${transition.notifyRoles.join(', ')}`);
    }
    
    // Add workflow event to timeline
    await this.store.addIncidentEvent({
      incidentId: incident.id,
      eventType: 'status_changed',
      description: `Status changed to ${transition.to}`,
      details: { previousStatus: incident.status },
      performedBy,
    });
  }
  
  /**
   * Check if closure is allowed
   */
  async validateClosure(incidentId: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const incident = await this.store.getIncident(incidentId);
      if (!incident) {
        return { valid: false, errors: ['incident_not_found'] };
      }
      
      // Check mandatory tasks
      const tasks = await this.store.listIncidentTasks(incidentId);
      const mandatoryTasks = tasks.filter(t => t.isMandatory);
      const incompleteMandatory = mandatoryTasks.filter(t => t.status !== 'completed');
      
      if (incompleteMandatory.length > 0) {
        errors.push(
          `${incompleteMandatory.length} mandatory task(s) incomplete: ${incompleteMandatory.map(t => t.taskName).join(', ')}`
        );
      }
      
      // Check evidence preservation
      const videoRanges = await this.store.listIncidentVideoRanges(incidentId);
      if (videoRanges.length === 0) {
        warnings.push('No video evidence preserved');
      }
      
      // Check investigation report
      const reports = await this.store.listIncidentReports(incidentId);
      const approvedReport = reports.find(r => r.status === 'approved' || r.status === 'final');
      
      if (!approvedReport && ['P1', 'P2'].includes(incident.severity)) {
        errors.push('Approved investigation report required for P1/P2 incidents');
      }
      
      // Check police intimation for required types
      if (incident.policeRequired) {
        const policeIntimations = await this.store.listPoliceIntimations(incidentId);
        if (policeIntimations.length === 0) {
          errors.push('Police intimation required but not completed');
        }
      }
      
      // Check insurance claim for required types
      if (incident.insuranceRequired) {
        const claims = await this.store.listInsuranceClaims(incidentId);
        if (claims.length === 0) {
          errors.push('Insurance claim required but not initiated');
        }
      }
      
      // Check evidence package approval
      const evidencePackages = await this.store.listIncidentEvidencePackages(incidentId);
      const approvedPackages = evidencePackages.filter(p => p.status === 'approved');
      
      if (['P1', 'P2'].includes(incident.severity) && approvedPackages.length === 0) {
        warnings.push('No approved evidence packages for critical incident');
      }
      
      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      this.logger?.error(`Failed to validate closure for incident ${incidentId}:`, error);
      return { valid: false, errors: ['validation_failed'] };
    }
  }
  
  /**
   * Get available transitions for current state
   */
  getAvailableTransitions(currentStatus: IncidentStatus, userRole?: string): IncidentStatus[] {
    const available: IncidentStatus[] = [];
    
    for (const [key, transition] of this.transitions.entries()) {
      if (transition.from.includes(currentStatus)) {
        // Check role restrictions
        if (transition.allowedRoles && userRole) {
          if (transition.allowedRoles.includes(userRole)) {
            available.push(transition.to);
          }
        } else {
          available.push(transition.to);
        }
      }
    }
    
    return [...new Set(available)];
  }
  
  /**
   * Initialize valid state transitions
   */
  private initializeTransitions(): void {
    // New -> Verification
    this.addTransition({
      from: ['new'],
      to: 'awaiting-verification',
      allowedRoles: ['operator', 'security-officer'],
    });
    
    // Verification -> Verified
    this.addTransition({
      from: ['awaiting-verification'],
      to: 'verified',
      allowedRoles: ['operator', 'security-officer'],
    });
    
    // Verification -> False Positive
    this.addTransition({
      from: ['awaiting-verification', 'new'],
      to: 'false-positive',
      allowedRoles: ['operator', 'security-officer', 'supervisor'],
    });
    
    // New/Verified -> Assigned
    this.addTransition({
      from: ['new', 'verified'],
      to: 'assigned',
    });
    
    // Assigned -> Acknowledged
    this.addTransition({
      from: ['assigned'],
      to: 'acknowledged',
      allowedRoles: ['security-officer', 'investigator'],
    });
    
    // Acknowledged -> Investigation
    this.addTransition({
      from: ['acknowledged'],
      to: 'under-investigation',
      allowedRoles: ['security-officer', 'investigator'],
    });
    
    // Investigation -> Evidence Collection
    this.addTransition({
      from: ['under-investigation'],
      to: 'evidence-collection',
      allowedRoles: ['investigator'],
    });
    
    // Any active state -> Escalated
    this.addTransition({
      from: ['assigned', 'acknowledged', 'under-investigation', 'evidence-collection'],
      to: 'escalated',
      notifyRoles: ['supervisor', 'security-manager'],
    });
    
    // Escalated -> Investigation
    this.addTransition({
      from: ['escalated'],
      to: 'under-investigation',
      allowedRoles: ['supervisor', 'security-manager'],
    });
    
    // Investigation/Evidence -> Awaiting External
    this.addTransition({
      from: ['under-investigation', 'evidence-collection'],
      to: 'awaiting-external-action',
      allowedRoles: ['investigator', 'security-officer'],
    });
    
    // Awaiting External -> Investigation
    this.addTransition({
      from: ['awaiting-external-action'],
      to: 'under-investigation',
      allowedRoles: ['investigator', 'security-officer'],
    });
    
    // Investigation -> Report Preparation
    this.addTransition({
      from: ['under-investigation', 'evidence-collection'],
      to: 'report-preparation',
      allowedRoles: ['investigator'],
    });
    
    // Report Preparation -> Pending Review
    this.addTransition({
      from: ['report-preparation'],
      to: 'pending-review',
      allowedRoles: ['investigator'],
      requiredChecks: [
        async (incident) => {
          const reports = await this.store.listIncidentReports(incident.id);
          if (reports.length === 0) {
            return { valid: false, errors: ['Investigation report must be created before review'] };
          }
          return { valid: true };
        },
      ],
    });
    
    // Pending Review -> Resolved
    this.addTransition({
      from: ['pending-review'],
      to: 'resolved',
      allowedRoles: ['supervisor', 'security-manager'],
      requiredChecks: [
        async (incident) => {
          const reports = await this.store.listIncidentReports(incident.id);
          const approvedReport = reports.find(r => r.status === 'approved');
          if (!approvedReport) {
            return { valid: false, errors: ['Report must be approved before resolution'] };
          }
          return { valid: true };
        },
      ],
    });
    
    // Resolved -> Closed
    this.addTransition({
      from: ['resolved'],
      to: 'closed',
      allowedRoles: ['supervisor', 'security-manager'],
      requiredChecks: [
        async (incident) => this.validateClosure(incident.id),
      ],
    });
    
    // Closed -> Reopened
    this.addTransition({
      from: ['closed'],
      to: 'reopened',
      allowedRoles: ['supervisor', 'security-manager', 'investigator'],
    });
    
    // Reopened -> Investigation
    this.addTransition({
      from: ['reopened'],
      to: 'under-investigation',
      allowedRoles: ['investigator', 'security-officer'],
    });
    
    // Any non-final state -> Cancelled
    this.addTransition({
      from: ['new', 'awaiting-verification', 'assigned', 'acknowledged'],
      to: 'cancelled',
      allowedRoles: ['supervisor', 'security-manager'],
    });
  }
  
  /**
   * Add custom transition
   */
  addTransition(transition: StateTransition): void {
    for (const from of transition.from) {
      const key = `${from}->${transition.to}`;
      this.transitions.set(key, transition);
    }
  }
  
  /**
   * Get workflow diagram (for documentation)
   */
  getWorkflowDiagram(): string {
    const lines: string[] = [
      'Incident Workflow State Machine',
      '================================',
      '',
    ];
    
    const states = new Set<IncidentStatus>();
    for (const transition of this.transitions.values()) {
      transition.from.forEach(s => states.add(s));
      states.add(transition.to);
    }
    
    lines.push('States:');
    Array.from(states).sort().forEach(state => {
      lines.push(`  - ${state}`);
    });
    
    lines.push('');
    lines.push('Transitions:');
    
    const transitionList = Array.from(this.transitions.entries())
      .map(([key, trans]) => ({ key, ...trans }))
      .sort((a, b) => a.key.localeCompare(b.key));
    
    for (const trans of transitionList) {
      const roles = trans.allowedRoles ? ` [${trans.allowedRoles.join(', ')}]` : '';
      lines.push(`  ${trans.key}${roles}`);
    }
    
    return lines.join('\n');
  }
}
