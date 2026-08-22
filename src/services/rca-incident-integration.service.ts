/**
 * RCA-Incident Integration Service
 * 
 * Integrates autonomous root cause analysis with incident management,
 * providing RCA-driven remediation recommendations and automated actions.
 */

import type { ControlPlaneStore } from "../control-plane-store.js";
import type { User } from "../domain/models.js";
import { RCAStore } from "./command-center/rca-store.js";
import { CommandCenterService } from "./command-center/service.js";
import type { RCADiagnosis } from "./command-center/rca/types.js";

export interface RCARemediationAction {
  id: string;
  diagnosisId: string;
  incidentId?: string;
  
  actionType: "investigate_network" | "check_power" | "restart_dvr" | "notify_branch" | 
               "create_work_order" | "escalate" | "manual_investigation";
  
  title: string;
  description: string;
  
  priority: "immediate" | "high" | "medium" | "low";
  risk: "low" | "medium" | "high";
  
  requiresApproval: boolean;
  estimatedTimeMinutes: number;
  
  expectedOutcome: string;
  rollbackProcedure?: string;
  
  status: "proposed" | "approved" | "in_progress" | "completed" | "failed";
  
  createdAt: string;
  updatedAt: string;
}

export interface RCAIncidentEnrichment {
  incidentId: string;
  diagnosisId: string;
  
  rootCauseCode: string;
  rootCauseLabel: string;
  confidence: number;
  
  affectedInfrastructure: {
    branches: number;
    cameras: number;
    dvrs: number;
    networks: number;
  };
  
  isMultiBranchFailure: boolean;
  commonCause: boolean;
  
  predictedResolutionTimeMinutes: number;
  
  generatedAt: string;
}

export class RCAIncidentIntegrationService {
  private rcaStore: RCAStore;
  private commandCenter: CommandCenterService;
  
  constructor(
    private readonly store: ControlPlaneStore,
    commandCenter?: CommandCenterService
  ) {
    this.rcaStore = new RCAStore(store);
    
    // Command center service requires state, will be lazy-loaded if needed
    this.commandCenter = commandCenter as any;
  }
  
  /**
   * Run RCA for an incident and generate remediation actions
   */
  async enrichIncidentWithRCA(
    incidentId: string,
    user: User
  ): Promise<{
    diagnosis: RCADiagnosis;
    enrichment: RCAIncidentEnrichment;
    remediationActions: RCARemediationAction[];
  }> {
    // Get incident details
    const incident = await this.store.getIncident(incidentId);
    
    if (!incident || incident.tenantId !== user.tenantId) {
      throw new Error("incident_not_found");
    }
    
    if (!incident.branchId) {
      throw new Error("incident_missing_branch");
    }
    
    // Run RCA analysis
    const diagnosis = await this.runRCAForIncident(incident, user);
    
    // Store diagnosis linked to incident
    await this.rcaStore.storeDiagnosis(diagnosis, {
      incidentId,
      status: "active",
    });
    
    // Generate remediation actions based on RCA
    const remediationActions = this.generateRemediationActions(diagnosis, incidentId);
    
    // Store remediation actions
    for (const action of remediationActions) {
      await this.storeRemediationAction(action, user.tenantId);
    }
    
    // Create enrichment record
    const enrichment: RCAIncidentEnrichment = {
      incidentId,
      diagnosisId: diagnosis.diagnosisId,
      rootCauseCode: diagnosis.primaryCause.code,
      rootCauseLabel: diagnosis.primaryCause.label,
      confidence: diagnosis.confidenceScore,
      affectedInfrastructure: {
        branches: diagnosis.blastRadius.summary.totalBranches,
        cameras: diagnosis.blastRadius.summary.totalCameras,
        dvrs: diagnosis.blastRadius.summary.totalDVRs,
        networks: diagnosis.blastRadius.summary.totalNetworks,
      },
      isMultiBranchFailure: diagnosis.blastRadius.summary.totalBranches >= 2,
      commonCause: diagnosis.blastRadius.summary.totalBranches >= 2 &&
                   diagnosis.temporalAnalysis.simultaneousFailures,
      predictedResolutionTimeMinutes: this.predictResolutionTime(diagnosis),
      generatedAt: new Date().toISOString(),
    };
    
    // Store enrichment (using incident notes as metadata storage is not available)
    await this.store.addIncidentNote({
      incidentId,
      noteType: "rca_enrichment",
      content: JSON.stringify(enrichment),
      createdBy: "system:rca",
    });
    
    return {
      diagnosis,
      enrichment,
      remediationActions,
    };
  }
  
  /**
   * Run RCA for an incident
   */
  private async runRCAForIncident(
    incident: any,
    user: User
  ): Promise<RCADiagnosis> {
    const { analyzeEnhanced } = await import("./command-center/rca.js");
    const { buildOperationalGraph } = await import("./command-center/operational-kg.js");
    const { buildTimeline } = await import("./command-center/timeline.js");
    
    // Define time window around incident
    const occurredAt = incident.occurredAt || incident.detectedAt || incident.createdAt;
    const incidentTime = Date.parse(occurredAt);
    const from = new Date(incidentTime - 6 * 60 * 60 * 1000).toISOString(); // 6 hours before
    const to = new Date(incidentTime + 1 * 60 * 60 * 1000).toISOString(); // 1 hour after
    
    // Build operational context
    const [graph, timeline] = await Promise.all([
      buildOperationalGraph(this.store, user, incident.branchId!),
      buildTimeline(this.store, user.tenantId, incident.branchId!, { from, to }),
    ]);
    
    // Run enhanced RCA
    const result = await analyzeEnhanced(graph, timeline, {
      tenantId: user.tenantId,
      branchId: incident.branchId!,
      includeHistorical: true,
    });
    
    if (!result.enhancedDiagnosis) {
      throw new Error("RCA analysis failed to produce diagnosis");
    }
    
    return result.enhancedDiagnosis;
  }
  
  /**
   * Generate remediation actions based on RCA diagnosis
   */
  private generateRemediationActions(
    diagnosis: RCADiagnosis,
    incidentId: string
  ): RCARemediationAction[] {
    const actions: RCARemediationAction[] = [];
    const now = new Date().toISOString();
    
    // Generate actions based on root cause
    switch (diagnosis.primaryCause.code) {
      case "wan_failure":
        actions.push({
          id: `rca-action-${Date.now()}-1`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "investigate_network",
          title: "Investigate WAN connectivity",
          description: `Check primary WAN connection and ISP status for ${diagnosis.blastRadius.summary.totalBranches} affected branches. Network telemetry indicates path unavailability.`,
          priority: "immediate",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 15,
          expectedOutcome: "Identify WAN circuit failure or ISP outage causing multi-branch impact",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        
        actions.push({
          id: `rca-action-${Date.now()}-2`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "notify_branch",
          title: "Notify affected branch managers",
          description: `Alert branch managers of ${diagnosis.blastRadius.summary.totalBranches} affected locations about network outage. Estimated impact: ${diagnosis.blastRadius.summary.totalCameras} cameras offline.`,
          priority: "high",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 5,
          expectedOutcome: "Branch staff aware of connectivity issue, can coordinate with ISP",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        
        if (diagnosis.confidenceScore >= 0.8) {
          actions.push({
            id: `rca-action-${Date.now()}-3`,
            diagnosisId: diagnosis.diagnosisId,
            incidentId,
            actionType: "create_work_order",
            title: "Create ISP escalation ticket",
            description: "Create work order for ISP escalation with RCA evidence and affected infrastructure details",
            priority: "high",
            risk: "low",
            requiresApproval: true,
            estimatedTimeMinutes: 10,
            expectedOutcome: "ISP ticket created with detailed impact assessment",
            status: "proposed",
            createdAt: now,
            updatedAt: now,
          });
        }
        break;
      
      case "power_failure":
        actions.push({
          id: `rca-action-${Date.now()}-1`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "check_power",
          title: "Verify UPS and utility power status",
          description: "Check UPS battery levels and utility power restoration ETA. Coordinate generator startup if available.",
          priority: "immediate",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 10,
          expectedOutcome: "Confirm power outage, assess battery runtime, initiate backup power if available",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        
        actions.push({
          id: `rca-action-${Date.now()}-2`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "notify_branch",
          title: "Alert facilities team",
          description: "Notify branch facilities team of power outage affecting surveillance infrastructure",
          priority: "immediate",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 5,
          expectedOutcome: "Facilities team coordinates utility power restoration",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        break;
      
      case "dvr_failure":
        actions.push({
          id: `rca-action-${Date.now()}-1`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "restart_dvr",
          title: "Attempt DVR remote restart",
          description: `Remotely restart ${diagnosis.blastRadius.summary.totalDVRs} affected DVR(s) to recover recording services.`,
          priority: "high",
          risk: "medium",
          requiresApproval: true,
          estimatedTimeMinutes: 15,
          expectedOutcome: "DVRs restart and resume recording",
          rollbackProcedure: "If DVR doesn't come online within 5 minutes, power cycle may be needed on-site",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        
        actions.push({
          id: `rca-action-${Date.now()}-2`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "create_work_order",
          title: "Schedule DVR maintenance",
          description: "Create work order for DVR hardware inspection and log analysis",
          priority: "medium",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 10,
          expectedOutcome: "Work order created for technician dispatch",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        break;
      
      case "insufficient_evidence":
        actions.push({
          id: `rca-action-${Date.now()}-1`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "manual_investigation",
          title: "Manual investigation required",
          description: "Insufficient telemetry data to determine root cause. Manual investigation by operations team needed.",
          priority: "high",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 30,
          expectedOutcome: "Operations team investigates and identifies root cause",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
        break;
      
      default:
        // Generic investigation for unknown root causes
        actions.push({
          id: `rca-action-${Date.now()}-1`,
          diagnosisId: diagnosis.diagnosisId,
          incidentId,
          actionType: "manual_investigation",
          title: `Investigate ${diagnosis.primaryCause.label}`,
          description: diagnosis.primaryCause.explanation,
          priority: "high",
          risk: "low",
          requiresApproval: false,
          estimatedTimeMinutes: 20,
          expectedOutcome: "Root cause confirmed and remediation initiated",
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        });
    }
    
    // Always add escalation action for high-impact incidents
    if (diagnosis.blastRadius.summary.totalBranches >= 3 || 
        diagnosis.blastRadius.summary.totalCameras >= 50) {
      actions.push({
        id: `rca-action-${Date.now()}-escalate`,
        diagnosisId: diagnosis.diagnosisId,
        incidentId,
        actionType: "escalate",
        title: "Escalate to senior operations",
        description: `High-impact incident affecting ${diagnosis.blastRadius.summary.totalBranches} branches and ${diagnosis.blastRadius.summary.totalCameras} cameras. Escalation recommended.`,
        priority: "high",
        risk: "low",
        requiresApproval: false,
        estimatedTimeMinutes: 5,
        expectedOutcome: "Senior operations team engaged for critical incident",
        status: "proposed",
        createdAt: now,
        updatedAt: now,
      });
    }
    
    return actions;
  }
  
  /**
   * Predict resolution time based on RCA diagnosis
   */
  private predictResolutionTime(diagnosis: RCADiagnosis): number {
    // Base times by root cause (in minutes)
    const baseTimes: Record<string, number> = {
      wan_failure: 120, // 2 hours - depends on ISP
      power_failure: 60, // 1 hour - depends on utility restoration
      dvr_failure: 30, // 30 minutes - restart or replace
      camera_hardware_failure: 45, // 45 minutes - individual camera issues
      insufficient_evidence: 90, // 1.5 hours - investigation needed
    };
    
    const baseTime = baseTimes[diagnosis.primaryCause.code] || 60;
    
    // Adjust for blast radius
    let multiplier = 1.0;
    
    if (diagnosis.blastRadius.summary.totalBranches >= 5) {
      multiplier += 0.5; // Multi-branch adds complexity
    }
    
    if (diagnosis.blastRadius.summary.totalCameras >= 100) {
      multiplier += 0.3; // Large camera count adds verification time
    }
    
    // Adjust for confidence - lower confidence means more investigation time
    if (diagnosis.confidenceScore < 0.6) {
      multiplier += 0.4;
    }
    
    return Math.round(baseTime * multiplier);
  }
  
  /**
   * Store remediation action (using incident notes as metadata storage)
   */
  private async storeRemediationAction(
    action: RCARemediationAction,
    tenantId: string
  ): Promise<void> {
    // Store action as incident note
    if (action.incidentId) {
      await this.store.addIncidentNote({
        incidentId: action.incidentId,
        noteType: "rca_remediation_action",
        content: JSON.stringify(action),
        createdBy: "system:rca",
      });
    }
  }
  
  /**
   * Get remediation actions for an incident (from incident notes)
   */
  async getRemediationActions(
    incidentId: string,
    tenantId: string
  ): Promise<RCARemediationAction[]> {
    const notes = await this.store.listIncidentNotes(incidentId, "rca_remediation_action");
    
    const actions: RCARemediationAction[] = [];
    
    for (const note of notes) {
      try {
        const action = JSON.parse(note.content) as RCARemediationAction;
        actions.push(action);
      } catch (error) {
        console.error("Failed to parse RCA action:", error);
      }
    }
    
    // Sort by priority
    const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }
  
  /**
   * Update remediation action status (find and update in incident notes)
   */
  async updateActionStatus(
    actionId: string,
    tenantId: string,
    status: RCARemediationAction["status"],
    notes?: string
  ): Promise<RCARemediationAction> {
    // Since we store actions as incident notes, we need to find the note containing this action
    // This is a limitation of the current approach - in production, use dedicated storage
    throw new Error("updateActionStatus not fully implemented - requires dedicated RCA action storage");
  }
}
