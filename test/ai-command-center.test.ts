import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { OperationalTelemetryEnvelope, TelemetryDeviceType } from "../src/operational-health/types.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };

describe("AI Command Center", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let agentId: string;

  beforeEach(async () => {
    store = new MemoryStore();
    const agent = await store.registerEdgeAgent("branch-blr-001", "Branch edge", "1.0.0");
    agentId = agent.id;
    app = await buildApp({ store });
  });

  afterEach(async () => app.close());

  it("builds an evidence-bound causal chain without inventing actions or an ETA", async () => {
    const base = Date.now() - 60_000;
    await ingest("ups", "ups-1", base, { utilityPowerAvailable: false, onBattery: true, batteryChargePercent: 74 });
    await ingest("network", "wan-primary", base + 10_000, { status: "offline", connectivity: false, role: "primary" });
    await ingest("recorder", "nvr-1", base + 20_000, { status: "offline", reachable: false, recordingStatus: "unknown" });
    await ingest("camera", "cam-001", base + 30_000, { status: "offline", reachable: false, recorderId: "nvr-1" });
    await ingest("camera", "cam-002", base + 31_000, { status: "offline", reachable: false, recorderId: "nvr-1" });

    const response = await app.inject({
      method: "POST", url: "/v1/command-center/query", headers: admin,
      payload: { question: "What is the current health of Bengaluru Branch 001?" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diagnosis.rootCause).toMatchObject({ code: "utility_power_unavailable", certainty: "confirmed", confidence: 0.98 });
    expect(body.diagnosis.evidence[0].raw.metrics.utilityPowerAvailable).toBe(false);
    expect(body.diagnosis.impact).toMatchObject({ unavailableCameras: 2, totalCameras: 2, offlineRecorders: 1 });
    expect(body.diagnosis.graph.dependencies).toContainEqual(expect.objectContaining({
      fromEntityId: "camera:cam-001", toEntityId: "recorder:nvr-1", relationship: "records_to",
    }));
    expect(body.diagnosis.recoveryEstimate).toMatchObject({ available: false, confidence: "insufficient" });
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("recorder restarted");
    expect(serialized).not.toContain("engineer dispatched");
  });

  it("returns unknown when unhealthy inventory lacks an authoritative causal signal", async () => {
    const response = await app.inject({
      method: "GET", url: "/v1/command-center/branches/branch-blr-001/diagnosis", headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().rootCause).toMatchObject({ code: "insufficient_evidence", certainty: "unknown", confidence: 0 });
    expect(response.json().missingEvidence).toContain("UPS input and battery telemetry");
    expect(response.json().recoveryEstimate.available).toBe(false);
  });

  it("retains authorized branch context for conversational follow-ups", async () => {
    await ingest("network", "wan-primary", Date.now() - 1_000, { status: "offline", connectivity: false });
    const first = await app.inject({
      method: "POST", url: "/v1/command-center/query", headers: admin,
      payload: { question: "Diagnose Bengaluru Branch 001" },
    });
    const conversationId = first.json().conversationId;
    const followUp = await app.inject({
      method: "POST", url: "/v1/command-center/query", headers: admin,
      payload: { conversationId, question: "Show the evidence and explain why" },
    });
    expect(followUp.statusCode).toBe(200);
    expect(followUp.json()).toMatchObject({ conversationId, intent: "evidence", diagnosis: { branch: { id: "branch-blr-001" } } });
  });

  it("requires approval and permission before creating a real work order", async () => {
    await ingest("recorder", "nvr-1", Date.now() - 1_000, { status: "offline", reachable: false });
    const query = await app.inject({
      method: "POST", url: "/v1/command-center/query", headers: admin,
      payload: { branchId: "branch-blr-001", question: "Why is the recorder unavailable?" },
    });
    const action = query.json().diagnosis.recommendedActions.find((item: { actionType: string }) => item.actionType === "create_work_order");

    const premature = await app.inject({ method: "POST", url: `/v1/command-center/actions/${action.id}/execute`, headers: admin });
    expect(premature.statusCode).toBe(409);
    expect(store.workOrders).toHaveLength(0);

    const denied = await app.inject({
      method: "POST", url: `/v1/command-center/actions/${action.id}/approve`,
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(denied.statusCode).toBe(404);

    const approved = await app.inject({ method: "POST", url: `/v1/command-center/actions/${action.id}/approve`, headers: admin });
    expect(approved.json().action.status).toBe("approved");
    const executed = await app.inject({ method: "POST", url: `/v1/command-center/actions/${action.id}/execute`, headers: admin });
    expect(executed.statusCode).toBe(200);
    expect(executed.json().action).toMatchObject({ status: "completed", executionResult: { status: "open" } });
    expect(store.workOrders).toHaveLength(1);
    expect(store.workOrders[0]).toMatchObject({ branchNodeId: "branch-blr-001", status: "open", createdBy: "user-global-admin" });
    expect(store.auditEvents.map((event) => event.action)).toEqual(expect.arrayContaining([
      "command_center.query", "command_center.action.approve", "command_center.action.execute",
    ]));
  });

  it("does not execute a recorder retry when no adapter is configured", async () => {
    await ingest("recorder", "nvr-1", Date.now() - 1_000, { status: "offline", reachable: false });
    const query = await app.inject({
      method: "POST", url: "/v1/command-center/query", headers: admin,
      payload: { branchId: "branch-blr-001", question: "Diagnose recorder" },
    });
    const action = query.json().diagnosis.recommendedActions.find((item: { actionType: string }) => item.actionType === "retry_recorder");
    await app.inject({ method: "POST", url: `/v1/command-center/actions/${action.id}/approve`, headers: admin });
    const executed = await app.inject({ method: "POST", url: `/v1/command-center/actions/${action.id}/execute`, headers: admin });
    expect(executed.statusCode).toBe(409);
    expect(executed.json().error).toBe("action_integration_not_configured");
  });

  it("correlates real unhealthy signals across multiple authorized branches", async () => {
    const secondBranchId = "A005";
    const secondAgent = await store.registerEdgeAgent(secondBranchId, "Second edge", "1.0.0");
    const observedAt = new Date(Date.now() - 1_000).toISOString();
    await store.ingestOperationalTelemetry({
      tenantId: "omsystems", branchId: "branch-blr-001", edgeAgentId: agentId,
      deviceType: "network", deviceId: "wan-primary", observedAt, receivedAt: observedAt,
      source: "system", quality: "verified", idempotencyKey: `wan-1:${observedAt}`,
      metrics: { status: "offline", connectivity: false }, reasonCodes: ["wan_unreachable"],
    });
    await store.ingestOperationalTelemetry({
      tenantId: "omsystems", branchId: secondBranchId, edgeAgentId: secondAgent.id,
      deviceType: "network", deviceId: "wan-primary", observedAt, receivedAt: observedAt,
      source: "system", quality: "verified", idempotencyKey: `wan-2:${observedAt}`,
      metrics: { status: "offline", connectivity: false }, reasonCodes: ["wan_unreachable"],
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/command-center/rca/multi-branch-analysis?branchIds=branch-blr-001,${secondBranchId}`,
      headers: admin,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().branches).toHaveLength(2);
    expect(response.json().rootCauseClusters).toContainEqual(expect.objectContaining({ branchCount: 2 }));
    expect(response.json().crossBranchSignals).toContainEqual(expect.objectContaining({
      entityType: "network", signal: "wan_unreachable", branchCount: 2,
    }));
  });

  async function ingest(deviceType: TelemetryDeviceType, deviceId: string, observed: number, metrics: OperationalTelemetryEnvelope["metrics"]) {
    const observedAt = new Date(observed).toISOString();
    await store.ingestOperationalTelemetry({
      tenantId: "omsystems", branchId: "branch-blr-001", edgeAgentId: agentId,
      deviceType, deviceId, observedAt, receivedAt: observedAt, source: "system", quality: "verified",
      idempotencyKey: `${deviceType}:${deviceId}:${observed}`, metrics, reasonCodes: [],
    });
  }
});
