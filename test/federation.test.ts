import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { FederationManager, type FederationLocalSearchProvider, type FederationPeerClient } from "../src/federation/manager.js";
import { MemoryFederationRepository } from "../src/federation/repository.js";
import type { FederatedSearchItem, FederatedServer, FederationSearchQuery } from "../src/federation/types.js";
import { MemoryStore } from "../src/store.js";

const admin = { "x-user-id": "user-global-admin" };
const federationKey = "global-federation-peer-key-for-contract-tests";
const southKey = "south-regional-server-key-for-tests";
const northKey = "north-regional-server-key-for-tests";
const backupKey = "south-backup-server-key-for-tests";
const observedAt = new Date("2026-07-30T10:00:00.000Z");

describe("federation control plane", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("aggregates regional health, isolates search failures, and reroutes a branch after failover", async () => {
    const repository = new MemoryFederationRepository();
    const peer: FederationPeerClient = {
      async search(server) {
        if (server.externalId === "north-primary") throw new Error("regional_timeout");
        return [{
          id: "vehicle-south-1",
          type: "vehicle",
          occurredAt: "2026-07-30T09:45:00.000Z",
          cameraId: "cam-001",
          title: "White Swift",
          confidence: 0.94,
        }];
      },
    };
    const manager = new FederationManager(repository, peer, 90_000, () => observedAt);
    const localSearch: FederationLocalSearchProvider = {
      async search(_tenantId, query) {
        return [{ id: "local-1", type: query.type, occurredAt: query.from, title: query.term }];
      },
    };
    const store = new MemoryStore();
    app = await buildApp({
      store,
      federationManager: manager,
      federationSharedKey: federationKey,
      federationLocalSearchProvider: localSearch,
    });

    const south = await register(app, {
      externalId: "south-primary",
      name: "South Regional Control Center",
      role: "regional_control_center",
      countryCode: "IN",
      region: "South",
      sharedSecret: southKey,
      scopeNodeIds: ["branch-blr-001"],
    });
    const backup = await register(app, {
      externalId: "south-backup",
      name: "South Disaster Recovery",
      role: "backup_server",
      countryCode: "IN",
      region: "South",
      sharedSecret: backupKey,
      primaryServerId: south.id,
    });
    const north = await register(app, {
      externalId: "north-primary",
      name: "North Regional Control Center",
      role: "regional_control_center",
      countryCode: "IN",
      region: "North",
      sharedSecret: northKey,
    });

    await heartbeat(app, "south-primary", southKey, { totalCameras: 150, onlineCameras: 145, totalBranches: 12, healthScore: 96 });
    await heartbeat(app, "north-primary", northKey, { totalCameras: 120, onlineCameras: 110, totalBranches: 10, healthScore: 84 });

    const dashboard = await app.inject({ method: "GET", url: "/v1/global/dashboard", headers: admin });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toMatchObject({
      totalServers: 3,
      onlineServers: 2,
      offlineServers: 1,
      totalRegions: 2,
      totalCountries: 1,
      totalCameras: 270,
      onlineCameras: 255,
      totalBranches: 22,
    });
    expect(dashboard.json().regions).toEqual(expect.arrayContaining([
      expect.objectContaining({ region: "South", branches: 12, cameras: 150 }),
      expect.objectContaining({ region: "North", branches: 10, cameras: 120 }),
    ]));

    const search = await app.inject({
      method: "GET",
      url: "/v1/federation/search?type=vehicle&term=White%20Swift&from=2026-07-29T00%3A00%3A00.000Z&to=2026-07-30T10%3A00%3A00.000Z",
      headers: admin,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({
      status: "partial",
      searchedServers: 2,
      successfulServers: 1,
      failedServers: 1,
      total: 1,
      data: [expect.objectContaining({ serverId: south.id, region: "South", title: "White Swift" })],
    });
    expect(search.json().sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ serverId: north.id, status: "failed", error: "regional_timeout" }),
    ]));

    const routeBefore = await app.inject({ method: "GET", url: "/v1/federation/route/branch-blr-001", headers: admin });
    expect(routeBefore.json().server.id).toBe(south.id);
    const failover = await app.inject({
      method: "POST",
      url: "/v1/federation/failover",
      headers: admin,
      payload: { failedServerId: south.id, activeServerId: backup.id, reason: "Primary regional database unavailable" },
    });
    expect(failover.statusCode).toBe(202);
    expect(failover.json()).toMatchObject({ status: "completed", success: true, affectedBranches: 12, affectedCameras: 150 });
    const routeAfter = await app.inject({ method: "GET", url: "/v1/federation/route/branch-blr-001", headers: admin });
    expect(routeAfter.json().server).toMatchObject({ id: backup.id, status: "failover_active" });

    const peerSearch = await app.inject({
      method: "POST",
      url: "/internal/federation/search",
      headers: { "x-federation-key": federationKey },
      payload: {
        tenantId: "tenant-omsystems",
        query: {
          type: "vehicle", term: "White Swift",
          from: "2026-07-29T00:00:00.000Z", to: "2026-07-30T10:00:00.000Z", limit: 10,
        },
      },
    });
    expect(peerSearch.statusCode).toBe(200);
    expect(peerSearch.json().data[0]).toMatchObject({ id: "local-1", title: "White Swift" });
    expect(store.auditEvents.map((event) => event.action)).toEqual(expect.arrayContaining([
      "federation.server_registered", "federation.search", "federation.failover_activated",
    ]));
  });

  it("rejects untrusted servers, unauthorized managers, and stale heartbeats", async () => {
    let clock = new Date(observedAt);
    const repository = new MemoryFederationRepository();
    const peer: FederationPeerClient = { async search() { return []; } };
    const manager = new FederationManager(repository, peer, 90_000, () => clock);
    app = await buildApp({ store: new MemoryStore(), federationManager: manager, federationSharedKey: federationKey });
    await register(app, {
      externalId: "south-primary",
      name: "South Regional Control Center",
      role: "regional_control_center",
      countryCode: "IN",
      region: "South",
      sharedSecret: southKey,
    });

    const badHeartbeat = await app.inject({
      method: "POST", url: "/internal/federation/heartbeat",
      headers: { "x-federation-server-id": "south-primary", "x-federation-server-key": "wrong-secret-that-is-long-enough" },
      payload: health(),
    });
    expect(badHeartbeat.statusCode).toBe(401);
    await heartbeat(app, "south-primary", southKey, { totalCameras: 10, onlineCameras: 10, totalBranches: 1, healthScore: 100 });
    clock = new Date("2026-07-30T10:02:00.001Z");
    const healthResponse = await app.inject({ method: "GET", url: "/v1/federation/health", headers: admin });
    expect(healthResponse.json()).toMatchObject({ onlineServers: 0, offlineServers: 1 });

    const unauthorized = await app.inject({
      method: "POST", url: "/v1/federation/register", headers: { "x-user-id": "user-branch-manager" },
      payload: serverPayload({
        externalId: "west-primary", name: "West", role: "regional_control_center",
        countryCode: "IN", region: "West", sharedSecret: southKey,
      }),
    });
    expect(unauthorized.statusCode).toBe(403);
    const untrustedPeer = await app.inject({
      method: "POST", url: "/internal/federation/search", headers: { "x-federation-key": "invalid" },
      payload: {
        tenantId: "tenant-omsystems",
        query: { type: "object", term: "person", from: "2026-07-29T00:00:00.000Z", to: "2026-07-30T10:00:00.000Z", limit: 10 },
      },
    });
    expect(untrustedPeer.statusCode).toBe(401);
  });
});

async function register(app: FastifyInstance, input: Record<string, unknown>) {
  const response = await app.inject({ method: "POST", url: "/v1/federation/register", headers: admin, payload: serverPayload(input) });
  expect(response.statusCode, response.body).toBe(201);
  expect(response.json()).not.toHaveProperty("sharedSecretHash");
  return response.json() as FederatedServer;
}

function serverPayload(input: Record<string, unknown>) {
  return {
    timezone: "Asia/Kolkata",
    baseUrl: `https://${String(input.externalId)}.example.test`,
    apiUrl: `https://${String(input.externalId)}.example.test/api/`,
    ...input,
  };
}

async function heartbeat(
  app: FastifyInstance,
  externalId: string,
  secret: string,
  input: { totalCameras: number; onlineCameras: number; totalBranches: number; healthScore: number },
) {
  const response = await app.inject({
    method: "POST", url: "/internal/federation/heartbeat",
    headers: { "x-federation-server-id": externalId, "x-federation-server-key": secret },
    payload: health(input),
  });
  expect(response.statusCode, response.body).toBe(200);
}

function health(input: Partial<{ totalCameras: number; onlineCameras: number; totalBranches: number; healthScore: number }> = {}) {
  return { status: "online", totalCameras: 1, onlineCameras: 1, totalBranches: 1, healthScore: 100, ...input };
}

