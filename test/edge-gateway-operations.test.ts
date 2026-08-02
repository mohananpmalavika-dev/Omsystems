import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { verifyEdgeUpdateManifest } from "../src/security/edge-update-signing.js";
import { openSealedCommand } from "../edge-agent/src/security/camera-credential-vault.js";

describe("secure edge gateway operations", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it("consumes a one-time activation and authenticates with a unique revocable credential", async () => {
    const store = new MemoryStore();
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

  it("delivers remote commands once and records their result", async () => {
    const app = await buildApp({ store: new MemoryStore() });
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

  it("queues camera credentials as gateway-only ciphertext", async () => {
    const app = await buildApp({ store: new MemoryStore() });
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
    expect(openSealedCommand(command.payload.envelope, privateKey.export({ type: "pkcs8", format: "pem" }).toString()))
      .toMatchObject({ username: "operator", password: "top-secret", scope: { host: "192.168.1.20" } });
  });

  it("signs staged OTA manifests and assigns them by rollout", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const app = await buildApp({ store: new MemoryStore(), edgeUpdateSigningPrivateKey: privatePem });
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
