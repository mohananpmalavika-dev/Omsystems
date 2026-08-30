/**
 * RCA-Incident Integration Service
 * 
 * Integrates autonomous root cause analysis with incident management,
 * providing RCA-driven remediation recommendations and automated actions.
 */

import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { User } from "../domain/models.js";
import { RCAStore } from "./command-center/rca-store.js";
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
  statusNotes?: string;
  
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
  
  predictedResolutionTimeMinutes: number | null;
  
  generatedAt: string;
}

export class RCAIncidentIntegrationService {
  private rcaStore: RCAStore;
  
  constructor(
    private readonly store: ControlPlaneStore,
  ) {
    this.rcaStore = new RCAStore(store);
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
      await this.storeRemediationAction(action);
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
      predictedResolutionTimeMinutes: null,
      generatedAt: new Date().toISOString(),
    };
    
    // Persist structured RCA metadata through the incident-note store shared by
    // both the in-memory and PostgreSQL implementations.
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
            id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
          id: `rca-action-${randomUUID()}`,
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
        id: `rca-action-${randomUUID()}`,
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
   * Store a structured remediation action in the incident-note store.
   */
  private async storeRemediationAction(action: RCARemediationAction): Promise<void> {
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
    const incident = await this.store.getIncident(incidentId);
    if (!incident || incident.tenantId !== tenantId) throw new Error("incident_not_found");
    const [notes, enrichment] = await Promise.all([
      this.store.listIncidentNotes(incidentId, "rca_remediation_action"),
      this.getEnrichment(incidentId, tenantId),
    ]);
    const actions = notes
      .map((note) => parseNote<RCARemediationAction>(note))
      .filter((action): action is RCARemediationAction => Boolean(action))
      .filter((action) => !enrichment || action.diagnosisId === enrichment.diagnosisId);
    const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  async getEnrichment(
    incidentId: string,
    tenantId: string,
  ): Promise<RCAIncidentEnrichment | null> {
    const incident = await this.store.getIncident(incidentId);
    if (!incident || incident.tenantId !== tenantId) throw new Error("incident_not_found");
    const notes = await this.store.listIncidentNotes(incidentId, "rca_enrichment");
    const newestFirst = [...notes].sort((left, right) => noteTime(right) - noteTime(left));
    for (const note of newestFirst) {
      const enrichment = parseNote<RCAIncidentEnrichment>(note);
      if (enrichment?.incidentId === incidentId) return enrichment;
    }
    return null;
  }

  async getRemediationAction(
    actionId: string,
    tenantId: string,
  ): Promise<RCARemediationAction | null> {
    const found = await this.findActionNote(actionId, tenantId);
    return found?.action ?? null;
  }

  async updateActionStatus(
    actionId: string,
    tenantId: string,
    status: RCARemediationAction["status"],
    notes?: string
  ): Promise<RCARemediationAction> {
    const found = await this.findActionNote(actionId, tenantId);
    if (!found) throw new Error("remediation_action_not_found");
    if (found.action.status === status) return found.action;
    if (!validTransition(found.action, status)) throw new Error("invalid_remediation_action_transition");
    const updated: RCARemediationAction = {
      ...found.action,
      status,
      ...(notes?.trim() ? { statusNotes: notes.trim() } : {}),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.store.updateIncidentNote(found.note.id, JSON.stringify(updated));
    if (!saved) throw new Error("remediation_action_update_failed");
    return updated;
  }

  async getSummary(
    tenantId: string,
    filters: {
      from?: string;
      to?: string;
      rootCauseCode?: string;
      allowedBranchIds: Set<string>;
    },
  ) {
    const incidents = await this.store.listIncidents(tenantId, {
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      limit: 10_000,
    });
    const accessible = incidents
      .filter((incident) => incident.branchId && filters.allowedBranchIds.has(incident.branchId));
    const enrichments: RCAIncidentEnrichment[] = [];
    for (let index = 0; index < accessible.length; index += 25) {
      const batch = await Promise.all(accessible.slice(index, index + 25)
        .map((incident) => this.getEnrichment(incident.id, tenantId)));
      for (const enrichment of batch) {
        if (enrichment && (!filters.rootCauseCode || enrichment.rootCauseCode === filters.rootCauseCode)) {
          enrichments.push(enrichment);
        }
      }
    }
    const byRootCause: Record<string, number> = {};
    for (const enrichment of enrichments) {
      byRootCause[enrichment.rootCauseCode] = (byRootCause[enrichment.rootCauseCode] ?? 0) + 1;
    }
    return {
      totalIncidentsEnriched: enrichments.length,
      byRootCause,
      averageConfidence: enrichments.length
        ? enrichments.reduce((sum, item) => sum + item.confidence, 0) / enrichments.length
        : null,
      multiBranchIncidents: enrichments.filter((item) => item.isMultiBranchFailure).length,
      truncated: incidents.length === 10_000,
    };
  }

  private async findActionNote(actionId: string, tenantId: string) {
    const incidents = await this.store.listIncidents(tenantId, { limit: 10_000 });
    for (const incident of incidents) {
      const [enrichment, notes] = await Promise.all([
        this.getEnrichment(incident.id, tenantId),
        this.store.listIncidentNotes(incident.id, "rca_remediation_action"),
      ]);
      for (const note of notes) {
        const action = parseNote<RCARemediationAction>(note);
        if (action?.id === actionId && (!enrichment || action.diagnosisId === enrichment.diagnosisId)) {
          return { action, note };
        }
      }
    }
    return null;
  }
}

function parseNote<T>(note: { content?: unknown }): T | null {
  if (typeof note.content !== "string") return null;
  try {
    return JSON.parse(note.content) as T;
  } catch {
    return null;
  }
}

function noteTime(note: Record<string, unknown>) {
  const value = note.editedAt ?? note.edited_at ?? note.createdAt ?? note.created_at;
  return typeof value === "string" ? Date.parse(value) || 0 : 0;
}

function validTransition(
  action: RCARemediationAction,
  next: RCARemediationAction["status"],
) {
  if (next === "approved") return action.status === "proposed";
  if (next === "in_progress") {
    return action.status === "approved" || (action.status === "proposed" && !action.requiresApproval);
  }
  if (next === "completed" || next === "failed") return action.status === "in_progress";
  return false;
}
