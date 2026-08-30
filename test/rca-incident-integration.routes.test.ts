import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import type {
  RCAIncidentEnrichment,
  RCARemediationAction,
} from "../src/services/rca-incident-integration.service.js";

describe("RCA incident integration routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let incidentId: string;
  const actionId = "rca-route-action";
  const admin = { "x-user-id": "user-global-admin" };

  beforeEach(async () => {
    store = new MemoryStore();
    const incident = await store.createIncident({
      tenantId: "omsystems", branchId: "A005", title: "WAN outage",
      incidentType: "network-outage", severity: "P1",
      detectionSource: "operational-telemetry", occurredAt: new Date().toISOString(),
      reportedBy: "user-global-admin",
    });
    incidentId = incident.id;
    const enrichment: RCAIncidentEnrichment = {
      incidentId, diagnosisId: "route-diagnosis", rootCauseCode: "wan_unavailable",
      rootCauseLabel: "WAN unavailable", confidence: 0.8,
      affectedInfrastructure: { branches: 1, cameras: 9, dvrs: 1, networks: 1 },
      isMultiBranchFailure: false, commonCause: false,
      predictedResolutionTimeMinutes: null, generatedAt: new Date().toISOString(),
    };
    const action: RCARemediationAction = {
      id: actionId, diagnosisId: enrichment.diagnosisId, incidentId,
      actionType: "investigate_network", title: "Investigate WAN",
      description: "Verify the observed WAN failure.", priority: "immediate", risk: "low",
      requiresApproval: true, estimatedTimeMinutes: 15,
      expectedOutcome: "The WAN fault is confirmed.", status: "proposed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await store.addIncidentNote({
      incidentId, noteType: "rca_enrichment", content: JSON.stringify(enrichment),
      createdBy: "system:rca",
    });
    await store.addIncidentNote({
      incidentId, noteType: "rca_remediation_action", content: JSON.stringify(action),
      createdBy: "system:rca",
    });
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("returns persisted enrichment, enforces branch access, and updates actions", async () => {
    const denied = await app.inject({
      method: "GET", url: `/v1/incidents/${incidentId}/rca-enrichment`,
      headers: { "x-user-id": "user-west-operator" },
    });
    expect(denied.statusCode).toBe(403);

    const enrichment = await app.inject({
      method: "GET", url: `/v1/incidents/${incidentId}/rca-enrichment`, headers: admin,
    });
    expect(enrichment.statusCode).toBe(200);
    expect(enrichment.json()).toMatchObject({
      incidentId,
      enrichment: { diagnosisId: "route-diagnosis", predictedResolutionTimeMinutes: null },
      remediationActions: [{ id: actionId, status: "proposed" }],
    });

    const approved = await app.inject({
      method: "POST", url: `/v1/incidents/remediation-actions/${actionId}/approve`, headers: admin,
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().action.status).toBe("approved");
    const started = await app.inject({
      method: "POST", url: `/v1/incidents/remediation-actions/${actionId}/start`, headers: admin,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().action.status).toBe("in_progress");
    const completed = await app.inject({
      method: "POST", url: `/v1/incidents/remediation-actions/${actionId}/complete`, headers: admin,
      payload: { notes: "WAN restored", successful: true },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().action).toMatchObject({
      status: "completed", statusNotes: "WAN restored",
    });

    const summary = await app.inject({
      method: "GET", url: "/v1/incidents/rca-summary", headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().summary).toMatchObject({
      totalIncidentsEnriched: 1,
      byRootCause: { wan_unavailable: 1 },
      averageConfidence: 0.8,
      multiBranchIncidents: 0,
    });
    const invalidRange = await app.inject({
      method: "GET",
      url: "/v1/incidents/rca-summary?from=2026-09-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z",
      headers: admin,
    });
    expect(invalidRange.statusCode).toBe(400);
  });
});
