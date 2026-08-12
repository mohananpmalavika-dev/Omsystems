import type { ControlPlaneStore } from '../control-plane-store.js';
import { IncidentCorrelationService } from './incident-correlation.service.js';
import type { DetectionEvent } from '../events/detection-event.js';
import { EvidencePreservationService } from './evidence-preservation.service.js';
import { IncidentSLAService } from './incident-sla.service.js';
import { IncidentWorkflowService } from './incident-workflow.service.js';
import { AIVerificationService } from './ai-verification.service.js';
import { RCAIncidentIntegrationService } from './rca-incident-integration.service.js';

/**
 * Incident Management Orchestrator
 * 
 * Coordinates all incident services and provides a unified interface
 * for AI event processing, incident creation, and workflow management.
 * Now integrated with autonomous RCA for enhanced diagnostics.
 */

export interface IncidentCreationResult {
  incident: any;
  assignment?: { assigned: boolean; userId?: string; reason: string };
  preservation?: any;
  slaStatus?: any;
  correlation?: { action: string; reason: string };
  rcaEnrichment?: any; // RCA diagnosis if enabled
}

export class IncidentOrchestrator {
  private correlationService: IncidentCorrelationService;
  private preservationService: EvidencePreservationService;
  private slaService: IncidentSLAService;
  private workflowService: IncidentWorkflowService;
  private verificationService: AIVerificationService;
  private rcaService: RCAIncidentIntegrationService;
  
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly logger?: Console,
    private readonly options: {
      enableRCAEnrichment?: boolean;
    } = {}
  ) {
    this.correlationService = new IncidentCorrelationService(store);
    this.preservationService = new EvidencePreservationService(store, logger);
    this.slaService = new IncidentSLAService(store, logger);
    this.workflowService = new IncidentWorkflowService(store, logger);
    this.verificationService = new AIVerificationService(store, logger);
    this.rcaService = new RCAIncidentIntegrationService(store);
  }
  
  /**
   * Process AI detection event and create/update incident as needed
   */
  async processAIEvent(event: DetectionEvent): Promise<{
    action: 'created' | 'updated' | 'buffered' | 'ignored' | 'verification-required';
    incidentId?: string;
    verification?: any;
    result?: IncidentCreationResult;
    reason: string;
  }> {
    try {
      // Step 1: AI Verification
      const verification = await this.verificationService.verifyDetection(event);
      
      this.logger?.log(
        `AI Verification: ${event.detectionType} - ${verification.mode} (confidence: ${Math.round(verification.confidence * 100)}%, score: ${verification.score.toFixed(2)})`
      );
      
      // Handle verification modes
      if (verification.mode === 'informational') {
        // Just log, no incident
        await this.logInformationalAlert(event, verification);
        return {
          action: 'ignored',
          verification,
          reason: 'Informational alert - confidence too low for incident creation',
        };
      }
      
      if (verification.mode === 'operator-required') {
        // Create alert for operator verification
        await this.createVerificationAlert(event, verification);
        return {
          action: 'verification-required',
          verification,
          reason: 'Operator verification required before incident creation',
        };
      }
      
      // Step 2: Correlation Check (automatic mode)
      const correlation = await this.correlationService.processDetection(event);
      
      if (correlation.action === 'update') {
        return {
          action: 'updated',
          incidentId: correlation.incidentId,
          verification,
          reason: correlation.reason,
        };
      }
      
      if (correlation.action === 'buffer') {
        return {
          action: 'buffered',
          verification,
          reason: correlation.reason,
        };
      }
      
      if (correlation.action === 'ignore') {
        return {
          action: 'ignored',
          verification,
          reason: correlation.reason,
        };
      }
      
      // Step 3: Create new incident (correlation returned 'create')
      const result = await this.createIncidentFromAI(event, verification);
      
      return {
        action: 'created',
        incidentId: result.incident.id,
        verification,
        result,
        reason: 'New incident created from AI detection',
      };
    } catch (error) {
      this.logger?.error('Failed to process AI event:', error);
      throw error;
    }
  }
  
  /**
   * Create incident from AI detection with full workflow
   */
  async createIncidentFromAI(
    event: DetectionEvent,
    verification: any
  ): Promise<IncidentCreationResult> {
    const startTime = Date.now();
    
    try {
      // Generate incident number
      const incidentNumber = await this.generateIncidentNumber(event.tenantId, event.branchId);
      
      // Create incident
      const incident = await this.store.createIncident({
        tenantId: event.tenantId,
        branchId: event.branchId,
        incidentNumber,
        title: this.generateIncidentTitle(event),
        description: this.generateIncidentDescription(event, verification),
        incidentType: event.detectionType,
        severity: verification.recommendedSeverity,
        detectionSource: 'ai-analytics',
        occurredAt: event.detectionTime,
        reportedBy: 'system',
        aiConfidence: event.confidence,
        detectionCount: 1,
      });
      
      this.logger?.log(`Incident ${incident.incidentNumber} created from AI detection`);
      
      // Step 1: Preserve Evidence (critical - do immediately)
      let preservation;
      try {
        preservation = await this.preservationService.preserveEvidence({
          incidentId: incident.id,
          tenantId: event.tenantId,
          branchId: event.branchId,
          primaryCameraId: event.cameraId,
          incidentTime: event.detectionTime,
          severity: verification.recommendedSeverity,
          detectionType: event.detectionType,
          preservedBy: 'system',
        });
        
        this.logger?.log(`Evidence preserved for incident ${incident.id}`);
      } catch (error) {
        this.logger?.error(`Failed to preserve evidence for incident ${incident.id}:`, error);
        // Continue - don't fail incident creation
      }
      
      // Step 2: Auto-assign
      let assignment;
      try {
        assignment = await this.slaService.autoAssign({
          incidentId: incident.id,
          tenantId: event.tenantId,
          branchId: event.branchId,
          incidentType: event.detectionType,
          severity: verification.recommendedSeverity,
        });
        
        if (assignment.assigned) {
          this.logger?.log(`Incident ${incident.id} assigned to user ${assignment.userId}`);
        }
      } catch (error) {
        this.logger?.error(`Failed to auto-assign incident ${incident.id}:`, error);
        // Continue - manual assignment can happen later
      }
      
      // Step 3: Create default tasks based on incident type
      await this.createDefaultTasks(incident.id, event.detectionType, verification.recommendedSeverity);
      
      // Step 4: Get SLA status
      const slaStatus = await this.slaService.getSLAStatus(incident.id);
      
      // Log performance
      const duration = Date.now() - startTime;
      this.logger?.log(`Incident ${incident.id} fully processed in ${duration}ms`);
      
      // Step 5: RCA Enrichment (optional, controlled by flag)
      let rcaEnrichment;
      if (this.options.enableRCAEnrichment && incident.branchId) {
        try {
          const enrichmentResult = await this.rcaService.enrichIncidentWithRCA(
            incident.id,
            { 
              id: 'system',
              tenantId: event.tenantId,
              email: 'system@sentinel.local',
              role: 'system',
              name: 'System'
            } as any // Minimal user for system-triggered RCA
          );
          
          rcaEnrichment = enrichmentResult.enrichment;
          
          this.logger?.log(
            `RCA enrichment completed for incident ${incident.id}: ${enrichmentResult.diagnosis.primaryCause.label} (${Math.round(enrichmentResult.diagnosis.confidenceScore * 100)}% confidence)`
          );
        } catch (error) {
          this.logger?.error(`Failed to enrich incident ${incident.id} with RCA:`, error);
          // Continue - RCA enrichment failure shouldn't block incident creation
        }
      }
      
      // Send notifications if immediate action required
      if (verification.requiresImmediate) {
        await this.sendImmediateNotifications(incident, event, verification);
      }
      
      return {
        incident,
        assignment,
        preservation,
        slaStatus,
        correlation: { action: 'create', reason: 'New incident from AI detection' },
        rcaEnrichment,
      };
    } catch (error) {
      this.logger?.error('Failed to create incident from AI event:', error);
      throw error;
    }
  }
  
  /**
   * Manually create incident with operator verification
   */
  async createIncidentManual(input: {
    tenantId: string;
    branchId?: string;
    title: string;
    description?: string;
    incidentType: string;
    severity: string;
    cameraId?: string;
    occurredAt?: string;
    createdBy: string;
  }): Promise<IncidentCreationResult> {
    const incidentNumber = await this.generateIncidentNumber(input.tenantId, input.branchId);
    
    const incident = await this.store.createIncident({
      ...input,
      incidentNumber,
      detectionSource: 'manual-operator',
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      reportedBy: input.createdBy,
    });
    
    // Preserve evidence if camera provided
    let preservation;
    if (input.cameraId && input.occurredAt) {
      preservation = await this.preservationService.preserveEvidence({
        incidentId: incident.id,
        tenantId: input.tenantId,
        branchId: input.branchId,
        primaryCameraId: input.cameraId,
        incidentTime: input.occurredAt,
        severity: input.severity,
        detectionType: input.incidentType,
        preservedBy: input.createdBy,
      });
    }
    
    // Auto-assign
    const assignment = await this.slaService.autoAssign({
      incidentId: incident.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      incidentType: input.incidentType,
      severity: input.severity,
    });
    
    // Create default tasks
    await this.createDefaultTasks(incident.id, input.incidentType, input.severity);
    
    return {
      incident,
      assignment,
      preservation,
    };
  }
  
  /**
   * Transition incident status with validation
   */
  async transitionIncident(input: {
    incidentId: string;
    toStatus: string;
    performedBy: string;
    userRole?: string;
    notes?: string;
  }) {
    const result = await this.workflowService.transition({
      incidentId: input.incidentId,
      toStatus: input.toStatus as any,
      performedBy: input.performedBy,
      userRole: input.userRole,
      notes: input.notes,
    });
    
    // Handle post-transition actions
    if (result.success && result.incident) {
      // Update SLA timers based on new status
      if (input.toStatus === 'closed' || input.toStatus === 'resolved') {
        this.slaService.stopSLATimers(input.incidentId);
        await this.correlationService.closeCorrelation(input.incidentId);
      }
    }
    
    return result;
  }
  
  /**
   * Mark detection as false positive
   */
  async markFalsePositive(input: {
    incidentId?: string;
    detectionEventId?: string;
    reason: string;
    category: string;
    markedBy: string;
    improveModel?: boolean;
  }): Promise<void> {
    // Record false positive
    await this.store.addIncidentEvent({
      incidentId: input.incidentId || 'system',
      eventType: 'false_positive',
      description: `Marked as false positive: ${input.reason}`,
      details: {
        reason: input.reason,
        category: input.category,
        detectionEventId: input.detectionEventId,
        improveModel: input.improveModel,
      },
      performedBy: input.markedBy,
    });
    
    // If incident exists, transition to false-positive status
    if (input.incidentId) {
      await this.workflowService.transition({
        incidentId: input.incidentId,
        toStatus: 'false-positive',
        performedBy: input.markedBy,
        notes: input.reason,
      });
    }
    
    this.logger?.log(`False positive recorded: ${input.reason} (category: ${input.category})`);
  }
  
  /**
   * Trigger RCA analysis for an existing incident
   */
  async triggerRCAAnalysis(
    incidentId: string,
    user: any
  ): Promise<{
    diagnosis: any;
    enrichment: any;
    remediationActions: any[];
  }> {
    const incident = await this.store.getIncident(incidentId);
    if (!incident) {
      throw new Error('incident_not_found');
    }
    
    if (!incident.branchId) {
      throw new Error('incident_missing_branch');
    }
    
    const result = await this.rcaService.enrichIncidentWithRCA(incidentId, user);
    
    this.logger?.log(
      `RCA analysis triggered for incident ${incidentId}: ${result.diagnosis.primaryCause.label} (${Math.round(result.diagnosis.confidenceScore * 100)}% confidence)`
    );
    
    return result;
  }
  
  /**
   * Get investigation workspace data
   */
  async getInvestigationWorkspace(incidentId: string) {
    const incident = await this.store.getIncident(incidentId);
    if (!incident) {
      throw new Error('incident_not_found');
    }
    
    const [
      participants,
      cameras,
      videoRanges,
      clips,
      snapshots,
      evidenceItems,
      evidencePackages,
      tasks,
      notes,
      timeline,
      policeIntimations,
      insuranceClaims,
      reports,
      slaStatus,
      availableTransitions,
      rcaEnrichment,
      remediationActions,
    ] = await Promise.all([
      this.store.listIncidentParticipants(incidentId),
      this.store.listIncidentCameras(incidentId),
      this.store.listIncidentVideoRanges(incidentId),
      this.store.listIncidentClips(incidentId),
      this.store.listIncidentSnapshots(incidentId),
      this.store.listIncidentEvidenceItems(incidentId),
      this.store.listIncidentEvidencePackages(incidentId),
      this.store.listIncidentTasks(incidentId),
      this.store.listIncidentNotes(incidentId),
      this.store.listIncidentTimeline(incidentId),
      this.store.listPoliceIntimations(incidentId),
      this.store.listInsuranceClaims(incidentId),
      this.store.listIncidentReports(incidentId),
      this.slaService.getSLAStatus(incidentId),
      this.workflowService.getAvailableTransitions(incident.status as any),
      Promise.resolve(null), // RCA enrichment metadata - to be implemented
      this.rcaService.getRemediationActions(incidentId, incident.tenantId).catch(() => []),
    ]);
    
    return {
      incident,
      participants,
      cameras,
      videoRanges,
      clips,
      snapshots,
      evidenceItems,
      evidencePackages,
      tasks,
      notes,
      timeline,
      policeIntimations,
      insuranceClaims,
      reports,
      slaStatus,
      availableTransitions,
      rcaEnrichment,
      remediationActions,
    };
  }
  
  /**
   * Generate incident number
   */
  private async generateIncidentNumber(tenantId: string, branchId?: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Get branch code (simplified - would use actual branch data)
    const branchCode = branchId ? branchId.substring(0, 3).toUpperCase() : 'SYS';
    
    // Get count for this month (simplified - would query database)
    const sequence = Math.floor(Math.random() * 10000);
    
    return `INC-${branchCode}-${year}${month}-${String(sequence).padStart(6, '0')}`;
  }
  
  /**
   * Generate incident title from event
   */
  private generateIncidentTitle(event: DetectionEvent): string {
    const titleMap: Record<string, string> = {
      'fire': 'Fire Detected',
      'smoke': 'Smoke Detected',
      'weapon': 'Weapon Detected',
      'intrusion': 'Intrusion Detected',
      'restricted-area': 'Restricted Area Violation',
      'atm-tampering': 'ATM Tampering',
      'fall-detection': 'Person Fall Detected',
      'tailgating': 'Tailgating Detected',
    };
    
    return titleMap[event.detectionType] || `${event.detectionType} Detection`;
  }
  
  /**
   * Generate incident description
   */
  private generateIncidentDescription(event: DetectionEvent, verification: any): string {
    const lines = [
      `AI-detected ${event.detectionType} event.`,
      `Detection confidence: ${Math.round(event.confidence * 100)}%`,
      `Verification score: ${Math.round(verification.score * 100)}%`,
      `Verification mode: ${verification.mode}`,
      ``,
      `Video evidence has been automatically preserved with legal hold.`,
      `Investigation should be started within SLA timeframe.`,
    ];
    
    if (event.zone) {
      lines.splice(3, 0, `Location: ${event.zone}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Create default tasks for incident
   */
  private async createDefaultTasks(
    incidentId: string,
    incidentType: string,
    severity: string
  ): Promise<void> {
    const tasks = [];
    
    // All incidents
    tasks.push({
      taskName: 'Verify Detection',
      description: 'Review camera footage and confirm the detection',
      priority: 'high' as const,
      isMandatory: true,
    });
    
    tasks.push({
      taskName: 'Preserve Additional Evidence',
      description: 'Capture snapshots and review related camera footage',
      priority: 'high' as const,
      isMandatory: false,
    });
    
    // Critical incidents
    if (['P1', 'P2'].includes(severity)) {
      tasks.push({
        taskName: 'Notify Management',
        description: 'Inform security management and branch manager',
        priority: 'critical' as const,
        isMandatory: true,
      });
      
      tasks.push({
        taskName: 'Prepare Investigation Report',
        description: 'Document findings and create investigation report',
        priority: 'high' as const,
        isMandatory: true,
      });
    }
    
    // Type-specific tasks
    if (['fire', 'smoke'].includes(incidentType)) {
      tasks.push({
        taskName: 'Verify Fire Safety Response',
        description: 'Confirm fire alarm activation and evacuation if needed',
        priority: 'critical' as const,
        isMandatory: true,
      });
    }
    
    if (incidentType === 'atm-tampering') {
      tasks.push({
        taskName: 'Check ATM Transaction Logs',
        description: 'Review ATM logs for suspicious transactions',
        priority: 'high' as const,
        isMandatory: true,
      });
    }
    
    // Create tasks
    for (const task of tasks) {
      await this.store.createIncidentTask({
        incidentId,
        ...task,
        createdBy: 'system',
      });
    }
  }
  
  /**
   * Log informational alert
   */
  private async logInformationalAlert(event: DetectionEvent, verification: any): Promise<void> {
    // In production, this would create an analytics alert instead of incident
    this.logger?.log(
      `Informational alert: ${event.detectionType} (confidence: ${Math.round(event.confidence * 100)}%)`
    );
  }
  
  /**
   * Create verification alert for operator
   */
  private async createVerificationAlert(event: DetectionEvent, verification: any): Promise<void> {
    // In production, this would create an alert in the analytics system
    // for operator verification before incident creation
    await this.store.processAnalyticsEvent({
      tenantId: event.tenantId,
      cameraId: event.cameraId,
      sourceEventId: `verification:${event.cameraId}:${event.detectionTime}:${event.detectionType}`,
      detectionType: event.detectionType,
      occurredAt: event.detectionTime,
      confidence: event.confidence,
      durationSeconds: 0,
      modelVersion: 'incident-orchestrator',
      objects: [],
      metadata: {
        requiresVerification: true,
        verificationReason: verification.reason,
      },
    });
  }
  
  /**
   * Send immediate notifications
   */
  private async sendImmediateNotifications(
    incident: any,
    event: DetectionEvent,
    verification: any
  ): Promise<void> {
    this.logger?.warn(
      `IMMEDIATE ACTION REQUIRED: Incident ${incident.incidentNumber} - ${event.detectionType}`
    );
    
    // In production, integrate with notification service
    // - Send SMS to on-call security officer
    // - Send email to security manager
    // - Create push notification in mobile app
    // - Trigger alarm in control room
  }
  
  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      correlation: this.correlationService.getStatistics(),
      workflow: this.workflowService.getWorkflowDiagram(),
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    this.slaService.destroy();
  }
}
