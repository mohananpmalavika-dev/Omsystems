import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneStore } from "../src/control-plane-store.js";
import { MemoryStore } from "../src/store.js";
import { registerMobileOperationsRoutes } from "../src/routes/mobile-operations.routes.js";
import type { Action, User } from "../src/domain/models.js";

const permissions: Action[] = ["incident:view", "incident:update", "incident:assign", "incident:escalate"];
const headers = { "x-test-user": "mobile-operator" };
describe("mobile persistent operations and authorization", () => {
  let app: FastifyInstance;
  let store: MemoryStore;
  let incident: any;
  beforeEach(async () => {
    store = new MemoryStore();
    for (const id of ["mobile-branch", "mobile-other-branch"]) store.nodes.set(id, {
      id, tenantId: "omsystems", parentId: null, type: "branch", path: [id], name: id,
    });
    for (const [id, role, tenantId] of [
      ["mobile-operator", "operator", "omsystems"], ["mobile-viewer", "viewer", "omsystems"],
      ["mobile-assignee", "operator", "omsystems"], ["mobile-foreign", "operator", "foreign"],
    ] as const) {
      store.users.set(id, { id, displayName: id, tenantId, role, status: "active" });
      store.grants.push({ userId: id, scopeNodeId: "mobile-branch", actions: permissions, effect: "allow" });
    }
    incident = await store.createIncident({ tenantId: "omsystems", branchId: "mobile-branch",
      title: "Camera incident", incidentType: "intrusion", severity: "P1", detectionSource: "manual", occurredAt: new Date().toISOString() });
    app = Fastify();
    app.decorateRequest("currentUser", null);
    app.addHook("preHandler", async request => {
      request.currentUser = await store.getUser(String(request.headers["x-test-user"])) as User;
    });
    await registerMobileOperationsRoutes(app, store as unknown as ControlPlaneStore);
    await app.ready();
  });
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); });

  const post = (id: string, operation: string, payload: any = {}, identity = headers) =>
    app.inject({ method: "POST", url: `/api/mobile/v1/incidents/${id}/${operation}`, headers: identity, payload });

  it("requires authentication on every mobile endpoint", async () => {
    expect((await app.inject({ url: "/api/mobile/v1/home" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/mobile/v1/events" })).statusCode).toBe(401);
    for (const operation of ["acknowledge", "escalate", "assign", "notes", "call-branch"]) {
      expect((await post(incident.id, operation, {}, {} as any)).statusCode).toBe(401);
    }
  });

  it("denies foreign tenant, wrong branch, readonly role and suspended users without writes", async () => {
    const wrongBranch = await store.createIncident({ tenantId: "omsystems", branchId: "mobile-other-branch", title: "Other",
      incidentType: "other", severity: "P1", detectionSource: "manual", occurredAt: new Date().toISOString() });
    expect((await post(wrongBranch.id, "acknowledge")).statusCode).toBe(404);
    expect((await post(incident.id, "acknowledge", {}, { "x-test-user": "mobile-foreign" })).statusCode).toBe(404);
    expect((await post(incident.id, "acknowledge", {}, { "x-test-user": "mobile-viewer" })).statusCode).toBe(403);
    store.users.get("mobile-operator")!.status = "suspended";
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(401);
    expect((await store.getIncident(incident.id)).status).toBe("new");
  });

  it("saves actions and notes, and keeps repeated acknowledgement from reversing escalation", async () => {
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(200);
    expect((await store.getIncident(incident.id)).status).toBe("acknowledged");
    expect((await post(incident.id, "escalate", { reason: "Operator needs supervisor review" })).statusCode).toBe(200);
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(200);
    expect((await store.getIncident(incident.id)).status).toBe("escalated");
    expect((await post(incident.id, "assign", { userId: "mobile-assignee" })).statusCode).toBe(200);
    expect((await store.getIncident(incident.id)).assignedTo).toBe("mobile-assignee");
    expect((await post(incident.id, "notes", { noteType: "CUSTOM_NOTE", text: "Checked the branch footage." })).statusCode).toBe(200);
    expect(await store.listIncidentNotes(incident.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "Checked the branch footage.", createdBy: "mobile-operator" }),
    ]));
  });

  it("rejects invalid input, missing incidents, closed actions and unauthorized assignees", async () => {
    expect((await post(incident.id, "notes")).statusCode).toBe(400);
    expect((await post(incident.id, "escalate", { reason: "short" })).statusCode).toBe(400);
    expect((await post("missing", "acknowledge")).statusCode).toBe(404);
    expect((await post(incident.id, "assign", { userId: "mobile-foreign" })).statusCode).toBe(400);
    store.grants.splice(store.grants.findIndex(grant => grant.userId === "mobile-assignee"), 1);
    expect((await post(incident.id, "assign", { userId: "mobile-assignee" })).statusCode).toBe(404);
    await store.updateIncidentStatus(incident.id, "closed", "mobile-operator");
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(409);
  });

  it("reports write and audit failures rather than successful actions", async () => {
    const update = vi.spyOn(store, "updateIncidentStatus").mockRejectedValueOnce(new Error("db_down"));
    const failed = await post(incident.id, "acknowledge");
    expect(failed.statusCode).toBe(503);
    expect(failed.json().success).toBe(false);
    expect((await store.getIncident(incident.id)).status).toBe("new");
    update.mockResolvedValueOnce(undefined);
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(409);
    vi.spyOn(store, "writeAudit").mockRejectedValueOnce(new Error("audit_down"));
    expect((await post(incident.id, "acknowledge")).json().success).toBe(false);
  });

  it("loads scoped incidents, actual critical counts and unknown health without fabricated values", async () => {
    await store.createIncident({ tenantId: "omsystems", branchId: "mobile-other-branch", title: "Hidden incident",
      incidentType: "other", severity: "P1", detectionSource: "manual", occurredAt: new Date().toISOString() });
    const response = await app.inject({ url: "/api/mobile/v1/home", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ criticalIncidentCount: 1, countsComplete: true,
      branchHealthSummary: { total: 1, healthy: 0, unknown: 1 } });
    expect(response.json().data.incidents.map((item: any) => item.id)).toEqual([incident.id]);
    vi.spyOn(store, "listIncidents").mockRejectedValueOnce(new Error("unavailable"));
    const unavailable = await app.inject({ url: "/api/mobile/v1/home", headers });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().data).toBeUndefined();
  });

  it("makes capped counts explicit", async () => {
    const records = Array.from({ length: 501 }, (_, index) => ({ ...incident, id: `incident-${index}` }));
    vi.spyOn(store, "listIncidents").mockResolvedValueOnce(records);
    const response = await app.inject({ url: "/api/mobile/v1/home", headers });
    expect(response.json().data).toMatchObject({ countsComplete: false, criticalIncidentCount: 500 });
  });

  it("does not count an incident twice when a recorder query joins multiple cameras", async () => {
    vi.spyOn(store, "listIncidents").mockResolvedValueOnce([incident, { ...incident }]);
    const response = await app.inject({ url: "/api/mobile/v1/home", headers });
    expect(response.json().data.criticalIncidentCount).toBe(1);
  });

  it("rejects stale acknowledgements when another operator escalates concurrently", async () => {
    const persist = store.updateIncidentStatus.bind(store);
    vi.spyOn(store, "updateIncidentStatus").mockImplementationOnce(async (...args) => {
      await store.escalateIncident(incident.id, "other-operator", "Concurrent escalation", []);
      return persist(...args);
    });
    expect((await post(incident.id, "acknowledge")).statusCode).toBe(409);
    expect((await store.getIncident(incident.id)).status).toBe("escalated");
  });

  it("uses only a configured branch contact and does not fabricate a completed call", async () => {
    expect((await post(incident.id, "call-branch")).statusCode).toBe(404);
    (store.nodes.get("mobile-branch") as any).metadata = { contactPhone: "+91 98765 43210", managerName: "Duty manager" };
    const response = await post(incident.id, "call-branch");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ dialerUrl: "tel:+919876543210", phone: "+919876543210" });
    expect(response.json().message).toContain("does not confirm");
  });

  it("streams scoped reconciliation over HTTP and closes cleanly on disconnect", async () => {
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const response = await fetch(`${base}/api/mobile/v1/events`, { headers, signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    const content = new TextDecoder().decode(chunk.value);
    expect(content).toContain("event: HEARTBEAT");
    expect(content).toContain("event: RECONCILE");
    expect(content).not.toContain("mobile-other-branch");
    controller.abort();
    await reader.cancel().catch(() => {});
  });
});
