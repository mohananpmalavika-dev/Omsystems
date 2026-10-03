import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };
const applications: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(applications.splice(0).map(app => app.close())); });

async function setup(version = "0.1.47") {
  const store = new MemoryStore();
  store.nodes.clear(); store.users.clear(); store.grants.length = 0;
  store.edgeAgents.clear(); store.cameras.clear();
  for (const [id, type, path] of [
    ["company", "company", ["company"]],
    ["home", "branch", ["company", "home"]],
    ["zone", "zone", ["company", "zone"]],
    ["region", "region", ["company", "zone", "region"]],
    ["a", "branch", ["company", "zone", "region", "a"]],
    ["b", "branch", ["company", "zone", "region", "b"]],
    ["outside", "branch", ["company", "outside"]],
  ] as const) store.nodes.set(id, { id, type, path: [...path], tenantId: "omsystems", name: id, parentId: path.at(-2) ?? null });
  store.nodes.set("foreign", { id: "foreign", type: "branch", tenantId: "other", name: "foreign", path: ["foreign"] });
  for (const id of ["user-global-admin", "regional", "partial"]) store.users.set(id, {
    id, tenantId: "omsystems", displayName: id, role: "admin", status: "active",
  });
  store.grants.push(
    { userId: "user-global-admin", scopeNodeId: "company", actions: ["device:configure", "recording:view"], effect: "allow" },
    { userId: "regional", scopeNodeId: "region", actions: ["device:configure"], effect: "allow" },
    { userId: "partial", scopeNodeId: "company", actions: ["device:configure"], effect: "allow" },
    { userId: "partial", scopeNodeId: "b", actions: ["device:configure"], effect: "deny" },
  );
  const app = await buildApp({ store, logger: false, controlPlanePublicUrl: "https://control.example" });
  applications.push(app);
  const activation = await app.inject({ method: "POST", url: "/v1/branches/home/edge-activations", headers: admin, payload: { agentName: "HO VPN agent" } });
  expect(activation.statusCode).toBe(201);
  const enrollment = await app.inject({ method: "POST", url: "/v1/edge-enrollment/activate", payload: {
    activationCode: activation.json().activationCode, deviceUuid: "11111111-1111-4111-8111-111111111111", version,
  } });
  expect(enrollment.statusCode).toBe(201);
  const identity = enrollment.json();
  const edge = { "x-edge-agent-token": identity.credential, "x-edge-agent-version": version };
  await app.inject({ method: "POST", url: `/v1/edge-agents/${identity.agentId}/heartbeat`, headers: edge, payload: { version } });
  const assignmentUrl = `/v1/edge-agents/${identity.agentId}/branches`;
  const assign = (scopeNodeId = "region", branches = [
    { branchId: "a", vpnNetworks: ["10.20.1.42/24"] }, { branchId: "b", vpnNetworks: ["10.20.2.0/24"] },
  ], headers = admin) => app.inject({ method: "POST", url: assignmentUrl, headers, payload: { scopeNodeId, branches } });
  return { store, app, identity, edge, assignmentUrl, assign };
}

describe("existing VPN edge agent serving multiple branches", () => {
  it("assigns a region without enrolling extra agents and isolates each branch bootstrap", async () => {
    const { app, store, identity, edge, assign } = await setup();
    expect((await assign()).statusCode).toBe(200);
    expect((await store.listEdgeAgents("omsystems"))).toHaveLength(1);
    expect((await store.getEdgeAgent(identity.agentId))?.branchId).toBe("home");
    for (const branch of ["home", "a", "b"]) expect((await store.listEdgeAgentsByBranch(branch)).map(a => a.id)).toContain(identity.agentId);
    const bootstrap = await app.inject({ url: `/v1/edge-agents/${identity.agentId}/discovery-bootstrap?branchId=a`, headers: edge });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toMatchObject({ branchId: "a", branchIds: ["home", "a", "b"], vpnScanNetworks: ["10.20.1.0/24"], transport: "vpn" });
    const wrongDiscovery = await app.inject({ method: "POST", url: "/v1/branches/home/cameras/discovered", headers: edge, payload: {
      edgeAgentId: identity.agentId, model: "Remote device", ipAddress: "10.20.1.10", onvifPort: 80, rtspPort: 554,
    } });
    expect(wrongDiscovery.json()).toMatchObject({ error: "discovery_outside_branch_networks" });
    expect(await store.listDiscoveredCameras("home")).toHaveLength(0);
    const forbidden = await app.inject({ url: `/v1/edge-agents/${identity.agentId}/discovery-bootstrap?branchId=outside`, headers: edge });
    expect(forbidden.statusCode).toBe(403);
    const catalog = await app.inject({ url: "/v1/edge-agent-branches", headers: admin });
    expect(catalog.json().data.agents[0]).toMatchObject({ branchId: "home", supportsSharedBranches: true, branchAssignments: expect.arrayContaining([expect.objectContaining({ branchId: "a" })]) });
  });

  it("claims and completes a remote branch scan under its own branch", async () => {
    const { app, store, identity, edge, assign } = await setup();
    await assign();
    const scan = await app.inject({ method: "POST", url: "/v1/branches/a/scan-jobs", headers: admin, payload: { edgeAgentId: identity.agentId } });
    expect(scan.statusCode).toBe(202);
    const claim = await app.inject({ url: `/v1/edge-agents/${identity.agentId}/scan-jobs/next`, headers: edge });
    expect(claim.json()).toMatchObject({ id: scan.json().id, branchId: "a", status: "running" });
    const discovery = await app.inject({ method: "POST", url: "/v1/branches/a/cameras/discovered", headers: edge, payload: {
      edgeAgentId: identity.agentId, vendor: "hikvision", model: "VPN camera", ipAddress: "10.20.1.10", onvifPort: 80, rtspPort: 554,
      credentialsRequired: true, streamVerified: false, profiles: [], capabilities: { ptz: false, audio: false, events: false },
    } });
    expect(discovery.statusCode).toBe(202);
    expect(await store.listDiscoveredCameras("a")).toHaveLength(1);
    expect(await store.listDiscoveredCameras("home")).toHaveLength(0);
    const complete = await app.inject({ method: "POST", url: `/v1/edge-agents/${identity.agentId}/scan-jobs/${scan.json().id}/complete`, headers: edge, payload: { status: "completed", resultCount: 1 } });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({ branchId: "a", status: "completed", credentialsRequiredCount: 1 });
    const [found] = await store.listDiscoveredCameras("a");
    const camera = await store.approveCamera("a", { discoveryId: found!.id, name: "Remote camera", channel: 1, protocol: "rtsp", connectionSecretRef: `edge://${identity.agentId}/${found!.id}` });
    const monitoring = await app.inject({ url: `/v1/edge-agents/${identity.agentId}/cameras/monitoring`, headers: edge });
    expect(monitoring.json().data).toContainEqual(expect.objectContaining({ id: camera.id, branchId: "a" }));
    const telemetry = { branchId: "a", edgeAgentId: identity.agentId, deviceType: "camera", deviceId: camera.id, observedAt: new Date().toISOString(), source: "rtsp", quality: "verified", idempotencyKey: "remote-camera:1", metrics: { status: "online" }, reasonCodes: [] };
    expect((await app.inject({ method: "POST", url: `/v1/edge-agents/${identity.agentId}/telemetry`, headers: edge, payload: telemetry })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: `/v1/edge-agents/${identity.agentId}/telemetry`, headers: edge, payload: { ...telemetry, branchId: "outside", idempotencyKey: "outside:1" } })).statusCode).toBe(403);
  });

  it("requires home and all target branch permissions before a bulk write", async () => {
    const { app, store, identity, assign } = await setup();
    expect((await assign("region", undefined, { "x-user-id": "regional" })).statusCode).toBe(403);
    expect((await assign("region", undefined, { "x-user-id": "partial" })).statusCode).toBe(403);
    expect((await store.getEdgeAgent(identity.agentId))?.branchAssignments ?? []).toEqual([]);
    const hidden = await app.inject({ url: "/v1/edge-agent-branches", headers: { "x-user-id": "regional" } });
    expect(hidden.json().data.agents).toEqual([]);
  });

  it("uses the shared agent's verified home media endpoint for remote branch readiness", async () => {
    const { app, store, identity, assign } = await setup();
    await assign();
    await store.upsertEdgeManagedTunnel({ branchId: "home", tenantId: "omsystems", provider: "cloudflare", providerTunnelId: "home-tunnel", hostname: "ho.media.example", status: "healthy" });
    await store.heartbeatEdgeAgent(identity.agentId, "0.1.47", "https://ho.media.example");
    const observedAt = new Date().toISOString();
    await store.ingestOperationalTelemetry({ tenantId: "omsystems", branchId: "home", edgeAgentId: identity.agentId, deviceType: "edge-agent", deviceId: identity.agentId, observedAt, receivedAt: observedAt, source: "system", quality: "verified", idempotencyKey: "home:media-ready", metrics: { status: "online", mediaRuntimeReady: true }, reasonCodes: [] });
    const response = await app.inject({ url: "/v1/operations/health/branches?branchId=a", headers: admin });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.branches[0]).toMatchObject({ gatewayCount: 1, gatewayOnlineCount: 1, gatewayReadiness: "ready", gatewayTunnelReady: true });
  });

  it("rejects overlapping ranges, outside-scope branches, and unsafe network input atomically", async () => {
    const { store, identity, assign } = await setup();
    expect((await assign("region", [{ branchId: "a", vpnNetworks: ["10.20.1.0/24"] }, { branchId: "b", vpnNetworks: ["10.20.1.12"] }])).json().error).toBe("overlapping_branch_networks");
    expect((await assign("region", [{ branchId: "outside", vpnNetworks: ["10.20.3.0/24"] }])).statusCode).toBe(400);
    expect((await assign("region", [{ branchId: "foreign", vpnNetworks: ["10.20.3.0/24"] }])).statusCode).toBe(400);
    for (const input of ["8.8.8.8", "10.0.0.0/8", "10.20.1.0/33", "invalid"]) {
      expect((await assign("a", [{ branchId: "a", vpnNetworks: [input] }])).statusCode).toBe(400);
    }
    expect((await store.getEdgeAgent(identity.agentId))?.branchAssignments ?? []).toEqual([]);
  });

  it("allows zone assignment but requires a one-time update of an older installed agent", async () => {
    const { store, identity, assign } = await setup("0.1.46");
    expect((await assign("zone")).json()).toMatchObject({ error: "edge_agent_update_required", minimumVersion: "0.1.47" });
    await store.heartbeatEdgeAgent(identity.agentId, "0.1.47");
    expect((await assign("zone")).statusCode).toBe(200);
    expect((await store.getEdgeAgent(identity.agentId))?.branchAssignments?.every(a => a.scopeNodeId === "zone")).toBe(true);
    store.edgeAgents.get(identity.agentId)!.credentialStatus = "not-enrolled";
    expect((await assign("zone")).json().error).toBe("edge_agent_enrollment_required");
  });

  it("removes only empty secondary branches and cancels their pending work", async () => {
    const { app, store, identity, edge, assignmentUrl, assign } = await setup();
    await assign();
    const scan = await store.createEdgeScanJob("a", identity.agentId);
    const command = await app.inject({ method: "POST", url: `/v1/branches/a/edge-agents/${identity.agentId}/commands`, headers: admin, payload: { type: "rediscover", payload: {} } });
    expect(command.statusCode).toBe(202);
    expect(command.json()).toMatchObject({ branchId: "a", payload: { branchId: "a" } });
    expect(await store.listEdgeCommands("a")).toHaveLength(1);
    const remove = await app.inject({ method: "DELETE", url: `${assignmentUrl}/a`, headers: admin });
    expect(remove.statusCode).toBe(204);
    expect((await store.getEdgeScanJob("a", scan.id))?.status).toBe("failed");
    expect(await store.claimEdgeScanJob(identity.agentId)).toBeUndefined();
    expect(await store.claimEdgeCommand(identity.agentId)).toBeUndefined();
    expect((await app.inject({ url: `/v1/edge-agents/${identity.agentId}/discovery-bootstrap?branchId=a`, headers: edge })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `${assignmentUrl}/home`, headers: admin })).json().error).toBe("cannot_unassign_home_branch");
    store.cameras.set("camera-b", { id: "camera-b", branchId: "b", edgeAgentId: identity.agentId } as never);
    expect((await app.inject({ method: "DELETE", url: `${assignmentUrl}/b`, headers: admin })).json().error).toBe("branch_has_agent_cameras");
    const wrongCamera = await app.inject({ method: "POST", url: `/v1/branches/home/edge-agents/${identity.agentId}/commands`, headers: admin, payload: { type: "recover-camera", payload: { cameraId: "camera-b" } } });
    expect(wrongCamera.statusCode).toBe(404);
  });
});
