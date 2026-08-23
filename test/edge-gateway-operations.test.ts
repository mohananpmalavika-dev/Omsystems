import { createHash, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { verifyEdgeUpdateManifest } from "../src/security/edge-update-signing.js";
import { openSealedCommand } from "../edge-agent/src/security/camera-credential-vault.js";

describe("secure edge gateway operations", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it("consumes a one-time activation and authenticates with a unique revocable credential", async () => {
    const store = testStore();
    const app = await buildApp({ store, controlPlanePublicUrl: "https://control.example" });
    apps.push(app);
    const activation = await createActivation(app);
    expect(activation.activationCode).toMatch(/^sgact_/);

    const enrolled = await app.inject({
      method: "POST", url: "/v1/edge-enrollment/activate",
      payload: { activationCode: activation.activationCode, deviceUuid: "11111111-1111-4111-8111-111111111111", version: "1.0.0" },
    });
    expect(enrolled.statusCode).toBe(201);
    const identity = enrolled.json();
    expect(identity.credential).toMatch(/^sggw_/);

    const reused = await app.inject({
      method: "POST", url: "/v1/edge-enrollment/activate",
      payload: { activationCode: activation.activationCode, deviceUuid: "22222222-2222-4222-8222-222222222222", version: "1.0.0" },
    });
    expect(reused.statusCode).toBe(401);

    const heartbeat = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/heartbeat`,
      headers: { "x-edge-agent-token": identity.credential }, payload: { version: "1.0.1" },
    });
    expect(heartbeat.statusCode).toBe(200);
    const installingHeartbeat = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/heartbeat`,
      headers: { "x-edge-agent-token": identity.credential },
      payload: { version: "1.0.1", publicMediaUrl: "auto" },
    });
    expect(installingHeartbeat.statusCode).toBe(200);
    expect((await store.getEdgeAgent(identity.agentId))?.publicMediaUrl).toBeUndefined();
    const denied = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/heartbeat`,
      headers: { "x-edge-agent-token": "sggw_wrong" }, payload: { version: "1.0.1" },
    });
    expect(denied.statusCode).toBe(401);

    const revoked = await app.inject({
      method: "POST", url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/revoke`,
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(revoked.statusCode).toBe(200);
    const afterRevocation = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/heartbeat`,
      headers: { "x-edge-agent-token": identity.credential }, payload: { version: "1.0.2" },
    });
    expect(afterRevocation.statusCode).toBe(401);
  });

  it("returns success after revocation even when ancillary cleanup fails", async () => {
    const store = testStore();
    const app = await buildApp({ store });
    apps.push(app);
    const identity = await enroll(app, await createActivation(app));

    vi.spyOn(store, "getEdgeManagedTunnel").mockRejectedValueOnce(
      new Error("managed tunnel metadata unavailable"),
    );
    vi.spyOn(store, "writeAudit").mockRejectedValueOnce(
      new Error("audit sink unavailable"),
    );

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/edge-agents/${identity.agentId}`,
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(removed.statusCode).toBe(204);
    expect((await store.getEdgeAgent(identity.agentId))?.credentialStatus).toBe("revoked");
    const heartbeat = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${identity.agentId}/heartbeat`,
      headers: { "x-edge-agent-token": identity.credential },
      payload: { version: "1.0.1" },
    });
    expect(heartbeat.statusCode).toBe(401);
  });

  it("supports enrollment and gateway bootstrap while employee session auth is enabled", async () => {
    const store = testStore();
    const activationCode = `sgact_${"a".repeat(48)}`;
    await store.createEdgeActivation({
      branchId: "branch-blr-001",
      agentName: "Session mode gateway",
      createdBy: "user-global-admin",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      tokenHash: createHash("sha256").update(activationCode).digest("hex"),
    });
    const app = await buildApp({ store, authMode: "session" });
    apps.push(app);

    const enrollment = await app.inject({
      method: "POST",
      url: "/v1/edge-enrollment/activate",
      payload: {
        activationCode,
        deviceUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        version: "1.0.0",
      },
    });
    expect(enrollment.statusCode).toBe(201);

    const identity = enrollment.json();
    const bootstrap = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${identity.agentId}/bootstrap`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(bootstrap.statusCode).toBe(200);

    const missingCredential = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${identity.agentId}/bootstrap`,
    });
    expect(missingCredential.statusCode).toBe(401);
    expect(missingCredential.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("provisions one managed tunnel and delivers its token only to the authenticated gateway", async () => {
    const store = testStore();
    const tunnelProvider = {
      provision: vi.fn(async () => ({
        provider: "cloudflare" as const,
        providerTunnelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        hostname: "branch-blr.media.example.com",
        status: "inactive" as const,
      })),
      getToken: vi.fn(async () => "eyJ-managed-gateway-token-with-sufficient-length"),
      getStatus: vi.fn(async () => "healthy" as const),
      revoke: vi.fn(async () => undefined),
    };
    const app = await buildApp({ store, edgeTunnelProvider: tunnelProvider, requireManagedEdgeTunnel: true });
    apps.push(app);

    const activation = await createActivation(app);
    expect(activation.bootstrap.media).toMatchObject({
      managed: true,
      mode: "named",
      publicUrl: "https://branch-blr.media.example.com",
      credentialsDeliveredTo: "gateway-only",
    });
    expect(JSON.stringify(await store.getEdgeManagedTunnel("branch-blr-001"))).not.toContain("gateway-token");

    const identity = await enroll(app, activation);
    expect(identity.media).toMatchObject({
      managed: true,
      mode: "named",
      publicUrl: "https://branch-blr.media.example.com",
      tunnelToken: "eyJ-managed-gateway-token-with-sufficient-length",
      status: "healthy",
    });
    const refreshed = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${identity.agentId}/bootstrap`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().media.tunnelToken).toBe("eyJ-managed-gateway-token-with-sufficient-length");

    const revoked = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/revoke`,
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(revoked.statusCode).toBe(200);
    expect(tunnelProvider.revoke).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "branch-blr.media.example.com",
    );
  });

  it("delivers remote commands once and records their result", async () => {
    const app = await buildApp({ store: testStore() });
    apps.push(app);
    const identity = await enroll(app, await createActivation(app));
    const created = await app.inject({
      method: "POST", url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/commands`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { type: "probe-camera", payload: { cameraId: "cam-001" } },
    });
    expect(created.statusCode).toBe(202);
    const command = created.json();

    const claimed = await app.inject({
      method: "GET", url: `/v1/edge-agents/${identity.agentId}/commands/next`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(claimed.json().id).toBe(command.id);
    const secondClaim = await app.inject({
      method: "GET", url: `/v1/edge-agents/${identity.agentId}/commands/next`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(secondClaim.json()).toBeNull();

    const completed = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/commands/${command.id}/complete`,
      headers: { "x-edge-agent-token": identity.credential },
      payload: { status: "succeeded", result: { reachable: true } },
    });
    expect(completed.json()).toMatchObject({ status: "succeeded", result: { reachable: true } });
    const duplicateCompletion = await app.inject({
      method: "POST", url: `/v1/edge-agents/${identity.agentId}/commands/${command.id}/complete`,
      headers: { "x-edge-agent-token": identity.credential },
      payload: { status: "succeeded", result: { reachable: true } },
    });
    expect(duplicateCompletion.statusCode).toBe(200);
    const history = await app.inject({
      method: "GET", url: "/v1/branches/branch-blr-001/edge-commands",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(history.json().data[0]).toMatchObject({ id: command.id, status: "succeeded" });

    const secretRejected = await app.inject({
      method: "POST", url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/commands`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { type: "collect-logs", payload: { password: "must-not-enter-queue" } },
    });
    expect(secretRejected.statusCode).toBe(400);
  });

  it("queues camera recovery for the branch edge agent", async () => {
    const app = await buildApp({ store: testStore() });
    apps.push(app);
    const identity = await enroll(app, await createActivation(app));
    const created = await app.inject({
      method: "POST", url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/commands`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { type: "recover-camera", payload: { cameraId: "cam-001" } },
    });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ type: "recover-camera", payload: { cameraId: "cam-001" } });
  });

  it("queues camera credentials as gateway-only ciphertext", async () => {
    const app = await buildApp({ store: testStore() });
    apps.push(app);
    const activation = await createActivation(app);
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const enrolledResponse = await app.inject({
      method: "POST", url: "/v1/edge-enrollment/activate",
      payload: {
        activationCode: activation.activationCode,
        deviceUuid: "33333333-3333-4333-8333-333333333333",
        version: "1.0.0",
        commandPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
    });
    const identity = enrolledResponse.json();
    const branchDefaultRejected = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/camera-credentials`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { username: "operator", password: "must-not-apply-to-every-device" },
    });
    expect(branchDefaultRejected.statusCode).toBe(400);
    const queued = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/edge-agents/${identity.agentId}/camera-credentials`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { username: "operator", password: "top-secret", cameraIp: "192.168.1.20" },
    });
    expect(queued.statusCode).toBe(202);
    const claimed = await app.inject({
      method: "GET", url: `/v1/edge-agents/${identity.agentId}/commands/next`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(claimed.body).not.toContain("top-secret");
    const command = claimed.json();
    expect(command.type).toBe("update-credentials");
    expect(command.payload.target).toEqual({ ipAddress: "192.168.1.20" });
    expect(openSealedCommand(command.payload.envelope, privateKey.export({ type: "pkcs8", format: "pem" }).toString()))
      .toMatchObject({ username: "operator", password: "top-secret", scope: { host: "192.168.1.20" } });
  });

  it("delivers recorder credentials only to the channel-capable installed scanner", async () => {
    const store = testStore();
    const app = await buildApp({ store });
    apps.push(app);
    const activation = await createActivation(app);
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const enrolled = await app.inject({
      method: "POST",
      url: "/v1/edge-enrollment/activate",
      payload: {
        activationCode: activation.activationCode,
        deviceUuid: "44444444-4444-4444-8444-444444444444",
        version: "0.1.12",
        commandPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      },
    });
    const identity = enrolled.json();
    await store.heartbeatEdgeAgent(identity.agentId, "0.1.12");
    const discovery = await store.createDiscovery("branch-blr-001", {
      edgeAgentId: identity.agentId,
      discoveryMethod: "rtsp-network-scan",
      vendor: "cp-plus",
      manufacturer: "CP PLUS",
      model: "CP PLUS DVR - Web View",
      ipAddress: "192.168.29.171",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [],
      capabilities: { ptz: false, audio: false, events: false },
      sourceType: "nvr-channel",
      streamVerified: false,
      credentialsRequired: true,
      duplicateStatus: "unique",
      compatibilityStatus: "review-required",
    });

    const queued = await app.inject({
      method: "POST",
      url: `/v1/branches/branch-blr-001/cameras/discovered/${discovery.id}/activate`,
      headers: { "x-user-id": "user-global-admin" },
      payload: { username: "admin", password: "dvr-secret" },
    });

    expect(queued.statusCode).toBe(202);
    expect(queued.json()).toMatchObject({ commandId: expect.any(String), scope: "device" });
    expect(queued.json()).not.toHaveProperty("scanId");
    const claimed = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${identity.agentId}/commands/next`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(claimed.body).not.toContain("dvr-secret");
    expect(claimed.json().payload.target).toEqual({ discoveryId: discovery.id, ipAddress: "192.168.29.171" });
    expect(openSealedCommand(
      claimed.json().payload.envelope,
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    )).toMatchObject({ username: "admin", password: "dvr-secret", scope: { host: "192.168.29.171" } });
  });

  it("automatically provisions verified streams when a credential command completes", async () => {
    const store = testStore();
    const app = await buildApp({ store });
    apps.push(app);
    const identity = await enroll(app, await createActivation(app));
    await store.createDiscovery("branch-blr-001", {
      edgeAgentId: identity.agentId,
      discoveryMethod: "nvr-dvr-channel-discovery",
      vendor: "cp-plus",
      manufacturer: "CP PLUS",
      model: "CP PLUS DVR channel",
      ipAddress: "192.168.29.171",
      onvifPort: 80,
      rtspPort: 554,
      profiles: [{ name: "sub", codec: "H265", width: 640, height: 360 }],
      capabilities: { ptz: false, audio: false, events: false },
      sourceType: "analog-dvr-channel",
      recorderId: "recorder-test",
      recorderChannel: 1,
      streamVerified: true,
      credentialsRequired: false,
      duplicateStatus: "unique",
      compatibilityStatus: "compatible",
    });
    const command = await store.createEdgeCommand({
      edgeAgentId: identity.agentId,
      type: "update-credentials",
      payload: { target: { ipAddress: "192.168.29.171" } },
      requestedBy: "user-global-admin",
    });
    await store.claimEdgeCommand(identity.agentId);

    const completed = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${identity.agentId}/commands/${command.id}/complete`,
      headers: { "x-edge-agent-token": identity.credential },
      payload: { status: "succeeded", result: { rediscovered: 1 } },
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.json().activation.summary.provisioned).toBe(1);
    expect(await store.listCamerasByEdgeAgent(identity.agentId)).toHaveLength(1);
  });

  it("signs staged OTA manifests and assigns them by rollout", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const app = await buildApp({ store: testStore(), edgeUpdateSigningPrivateKey: privatePem });
    apps.push(app);
    const identity = await enroll(app, await createActivation(app));
    const releaseResponse = await app.inject({
      method: "POST", url: "/v1/edge-updates/releases",
      headers: { "x-user-id": "user-global-admin" },
      payload: {
        version: "1.2.3", artifactUrl: "https://updates.example/edge-agent.bundle",
        sha256: "a".repeat(64), notes: "Pilot release", rolloutPercentage: 100, enabled: true,
      },
    });
    expect(releaseResponse.statusCode).toBe(201);
    const release = releaseResponse.json();
    expect(verifyEdgeUpdateManifest(release, release.signature, publicPem)).toBe(true);

    const assigned = await app.inject({
      method: "GET", url: `/v1/edge-agents/${identity.agentId}/updates/next?version=1.0.0`,
      headers: { "x-edge-agent-token": identity.credential },
    });
    expect(assigned.json()).toMatchObject({ version: "1.2.3", signature: release.signature });
  });
});

async function createActivation(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST", url: "/v1/branches/branch-blr-001/edge-activations",
    headers: { "x-user-id": "user-global-admin" },
    payload: { agentName: "Branch appliance", ttlMinutes: 30 },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function testStore() {
  const store = new MemoryStore();
  store.nodes.set("company-1", {
    id: "company-1",
    parentId: null,
    tenantId: "omsystems",
    type: "company",
    name: "Edge gateway test company",
    path: ["company-1"],
  });
  store.nodes.set("branch-blr-001", {
    id: "branch-blr-001",
    parentId: "company-1",
    tenantId: "omsystems",
    type: "branch",
    name: "Edge gateway test branch",
    path: ["company-1", "branch-blr-001"],
  });
  store.users.set("user-global-admin", {
    id: "user-global-admin",
    displayName: "Test administrator",
    tenantId: "omsystems",
    role: "super_admin",
    status: "active",
  });
  store.grants.push({
    userId: "user-global-admin",
    scopeNodeId: "company-1",
    actions: ["device:configure"],
    effect: "allow",
  });
  return store;
}

async function enroll(app: Awaited<ReturnType<typeof buildApp>>, activation: any) {
  const response = await app.inject({
    method: "POST", url: "/v1/edge-enrollment/activate",
    payload: {
      activationCode: activation.activationCode,
      deviceUuid: "11111111-1111-4111-8111-111111111111",
      version: "1.0.0",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}
