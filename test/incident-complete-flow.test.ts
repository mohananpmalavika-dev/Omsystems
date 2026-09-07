import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const adminHeaders = {
  "x-user-id": "user-global-admin",
};

describe("Complete Production-Ready Incident Management Lifecycle", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("executes the complete incident lifecycle: create, get workspace, update, task, report, transition, close, reopen, false-positive", async () => {
    // 1. Create Incident
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      headers: adminHeaders,
      payload: {
        title: "Unauthorized Perimeter Intrusion at ATM",
        description: "Motion detected after hours near cash dispenser",
        severity: "P2",
        incidentType: "intrusion",
        confidentialityLevel: "confidential",
        policeRequired: true,
        insuranceRequired: false,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdIncident = createRes.json();
    expect(createdIncident.id).toBeDefined();
    expect(createdIncident.incidentNumber).toMatch(/^INC-/);
    expect(createdIncident.status).toBe("new");
    const incidentId = createdIncident.id;

    // 2. Fetch Investigation Workspace
    const wsRes = await app.inject({
      method: "GET",
      url: `/v1/incidents/${incidentId}/workspace`,
      headers: adminHeaders,
    });

    expect(wsRes.statusCode).toBe(200);
    const ws = wsRes.json();
    const workspaceData = ws.data || ws;
    expect(workspaceData.incident).toBeDefined();
    expect(workspaceData.incident.id).toBe(incidentId);
    expect(Array.isArray(workspaceData.availableTransitions)).toBe(true);
    expect(Array.isArray(workspaceData.tasks)).toBe(true);
    expect(Array.isArray(workspaceData.timeline)).toBe(true);

    // 3. Update Incident Details (PATCH /v1/incidents/:id)
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/incidents/${incidentId}`,
      headers: adminHeaders,
      payload: {
        title: "Unauthorized Perimeter Intrusion - Confirmed Breach",
        severity: "P1",
        estimatedLoss: 5000,
        description: "Verified suspicious individual tampered with external camera housing",
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updatedIncident = updateRes.json();
    expect(updatedIncident.title).toBe("Unauthorized Perimeter Intrusion - Confirmed Breach");
    expect(updatedIncident.severity).toBe("P1");
    expect(updatedIncident.estimatedLoss).toBe(5000);

    // 4. Add Investigation Task
    const addTaskRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/tasks`,
      headers: adminHeaders,
      payload: {
        taskName: "Review security guard shift log",
        description: "Check physical logbook for guard rounds between 02:00 and 03:00",
        priority: "high",
        isMandatory: true,
      },
    });

    expect(addTaskRes.statusCode).toBe(201);
    const createdTask = addTaskRes.json();
    expect(createdTask.id).toBeDefined();
    expect(createdTask.isMandatory).toBe(true);
    expect(createdTask.status).toBe("pending");

    // 5. Complete Task
    const completeTaskRes = await app.inject({
      method: "POST",
      url: `/v1/tasks/${createdTask.id}/complete`,
      headers: adminHeaders,
      payload: {
        completionNotes: "Guard was not present on post during the incident window.",
      },
    });

    expect(completeTaskRes.statusCode).toBe(200);
    const completedTask = completeTaskRes.json();
    expect(completedTask.status).toBe("completed");

    // 6. Generate Investigation Report
    const reportRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/generate-report`,
      headers: adminHeaders,
      payload: {
        reportType: "investigation",
        autoGenerateSummary: true,
      },
    });

    expect(reportRes.statusCode).toBe(201);
    const generatedReport = reportRes.json();
    expect(generatedReport.id).toBeDefined();
    expect(generatedReport.reportType).toBe("investigation");
    expect(generatedReport.executiveSummary).toContain("Incident");

    // 7. Approve Report
    const approveReportRes = await app.inject({
      method: "POST",
      url: `/v1/incident-reports/${generatedReport.id}/approve`,
      headers: adminHeaders,
      payload: {},
    });

    expect(approveReportRes.statusCode).toBe(200);
    const approvedReport = approveReportRes.json();
    expect(approvedReport.status).toBe("approved");

    // 8. Transition Status
    const transitionRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/transition`,
      headers: adminHeaders,
      payload: {
        toStatus: "awaiting-verification",
        notes: "Moving to verification phase",
      },
    });

    expect(transitionRes.statusCode).toBe(200);
    expect(transitionRes.json().success).toBe(true);

    // 9. Close Incident
    const closeRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/close`,
      headers: adminHeaders,
      payload: {
        notes: "Intruder identified, police informed, perimeter repaired.",
      },
    });

    expect(closeRes.statusCode).toBe(200);
    const closedIncident = closeRes.json();
    expect(closedIncident.status).toBe("closed");

    // 10. Reopen Incident
    const reopenRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${incidentId}/reopen`,
      headers: adminHeaders,
      payload: {
        reason: "Police requested supplemental high-resolution video exports for suspect.",
      },
    });

    expect(reopenRes.statusCode).toBe(200);
    const reopenedIncident = reopenRes.json();
    expect(reopenedIncident.status).toBe("reopened");

    // 11. Create a second incident and mark as false positive
    const secondIncRes = await app.inject({
      method: "POST",
      url: "/v1/incidents",
      headers: adminHeaders,
      payload: {
        title: "Perimeter Beam Alert Zone B",
        severity: "P4",
        incidentType: "other",
      },
    });
    const secondId = secondIncRes.json().id;

    const fpRes = await app.inject({
      method: "POST",
      url: `/v1/incidents/${secondId}/mark-false-positive`,
      headers: adminHeaders,
      payload: {
        category: "weather",
        reason: "Heavy rainfall and wind triggered motion boundary",
        improveModel: true,
      },
    });

    expect(fpRes.statusCode).toBe(200);
    expect(fpRes.json().success).toBe(true);

    const secondCheck = await app.inject({
      method: "GET",
      url: `/v1/incidents/${secondId}`,
      headers: adminHeaders,
    });
    expect(secondCheck.json().status).toBe("false-positive");
  });
});
