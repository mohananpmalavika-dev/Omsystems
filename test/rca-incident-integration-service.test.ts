import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.js";
import {
  RCAIncidentIntegrationService,
  type RCAIncidentEnrichment,
  type RCARemediationAction,
} from "../src/services/rca-incident-integration.service.js";

describe("RCA incident integration persistence", () => {
  it("loads tenant-scoped enrichment and persists validated action transitions", async () => {
    const store = new MemoryStore();
    const incident = await store.createIncident({
      tenantId: "omsystems",
      branchId: "A005",
      title: "Branch network unavailable",
      incidentType: "network-outage",
      severity: "P1",
      detectionSource: "operational-telemetry",
      occurredAt: new Date().toISOString(),
      reportedBy: "user-global-admin",
    });
    const enrichment: RCAIncidentEnrichment = {
      incidentId: incident.id,
      diagnosisId: "diagnosis-1",
      rootCauseCode: "wan_unavailable",
      rootCauseLabel: "WAN unavailable",
      confidence: 0.9,
      affectedInfrastructure: { branches: 2, cameras: 20, dvrs: 2, networks: 2 },
      isMultiBranchFailure: true,
      commonCause: true,
      predictedResolutionTimeMinutes: null,
      generatedAt: new Date().toISOString(),
    };
    const action: RCARemediationAction = {
      id: "rca-action-test",
      diagnosisId: enrichment.diagnosisId,
      incidentId: incident.id,
      actionType: "create_work_order",
      title: "Escalate WAN outage",
      description: "Create an evidence-backed ISP work order.",
      priority: "high",
      risk: "low",
      requiresApproval: true,
      estimatedTimeMinutes: 10,
      expectedOutcome: "A tracked work order is created.",
      status: "proposed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.addIncidentNote({
      incidentId: incident.id,
      noteType: "rca_enrichment",
      content: JSON.stringify(enrichment),
      createdBy: "system:rca",
    });
    await store.addIncidentNote({
      incidentId: incident.id,
      noteType: "rca_remediation_action",
      content: JSON.stringify(action),
      createdBy: "system:rca",
    });
    const service = new RCAIncidentIntegrationService(store);

    await expect(service.getEnrichment(incident.id, "another-tenant"))
      .rejects.toThrow("incident_not_found");
    await expect(service.updateActionStatus(action.id, "omsystems", "in_progress"))
      .rejects.toThrow("invalid_remediation_action_transition");

    expect(await service.getEnrichment(incident.id, "omsystems")).toEqual(enrichment);
    expect(await service.updateActionStatus(action.id, "omsystems", "approved"))
      .toMatchObject({ status: "approved" });
    expect(await service.updateActionStatus(action.id, "omsystems", "in_progress"))
      .toMatchObject({ status: "in_progress" });
    expect(await service.updateActionStatus(action.id, "omsystems", "completed", "ISP ticket opened"))
      .toMatchObject({ status: "completed", statusNotes: "ISP ticket opened" });
    expect(await service.getRemediationAction(action.id, "omsystems"))
      .toMatchObject({ status: "completed", statusNotes: "ISP ticket opened" });

    expect(await service.getSummary("omsystems", {
      allowedBranchIds: new Set(["A005"]),
    })).toMatchObject({
      totalIncidentsEnriched: 1,
      byRootCause: { wan_unavailable: 1 },
      averageConfidence: 0.9,
      multiBranchIncidents: 1,
      truncated: false,
    });
    expect((await service.getSummary("omsystems", {
      allowedBranchIds: new Set(),
    })).totalIncidentsEnriched).toBe(0);
  });
});
