import { hashPassword, verifyPassword } from "../security/password.js";
import type { FederationRepository } from "./repository.js";
import { publicServer } from "./repository.js";
import type {
  FederatedSearchItem,
  FederatedServer,
  FederatedServerRecord,
  FederationDashboardSummary,
  FederationFailoverEvent,
  FederationHeartbeatInput,
  FederationSearchQuery,
  FederationSearchResponse,
  GlobalAlertCorrelation,
  RegisterFederatedServerInput,
} from "./types.js";

export interface FederationPeerClient {
  search(
    server: FederatedServer,
    tenantId: string,
    query: FederationSearchQuery,
  ): Promise<FederatedSearchItem[]>;
}

export interface FederationLocalSearchProvider {
  search(tenantId: string, query: FederationSearchQuery): Promise<FederatedSearchItem[]>;
}

export class EmptyFederationLocalSearchProvider implements FederationLocalSearchProvider {
  async search() { return []; }
}

export class HttpFederationPeerClient implements FederationPeerClient {
  constructor(
    private readonly sharedKey: string | undefined,
    private readonly timeoutMs = 8_000,
  ) {}

  async search(server: FederatedServer, tenantId: string, query: FederationSearchQuery) {
    if (!this.sharedKey) throw new Error("federation_peer_key_not_configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();
    try {
      const response = await fetch(new URL("internal/federation/search", ensureTrailingSlash(server.apiUrl)), {
        method: "POST",
        // Peer endpoints are administrator-configured. Never follow a redirect
        // from one: doing so could forward the federation credential to an
        // unrelated host.
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "x-federation-key": this.sharedKey,
        },
        body: JSON.stringify({ tenantId, query }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`peer_http_${response.status}`);
      const body = await response.json() as { data?: FederatedSearchItem[] };
      if (!Array.isArray(body.data)) throw new Error("peer_invalid_response");
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class FederationManager {
  constructor(
    private readonly repository: FederationRepository,
    private readonly peers: FederationPeerClient,
    private readonly heartbeatTtlMs = 90_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async register(input: Omit<RegisterFederatedServerInput, "sharedSecretHash"> & { sharedSecret: string }) {
    const { sharedSecret, ...registration } = input;
    if (registration.primaryServerId === registration.backupServerId && registration.primaryServerId) {
      throw new Error("invalid_federation_relationship");
    }
    const existing = await this.repository.getServerByExternalId(registration.externalId);
    if (existing?.tenantId === registration.tenantId &&
      [registration.primaryServerId, registration.backupServerId].includes(existing.id)) {
      throw new Error("invalid_federation_relationship");
    }
    if (registration.primaryServerId || registration.backupServerId) {
      const relatedIds = [registration.primaryServerId, registration.backupServerId].filter(
        (id): id is string => Boolean(id),
      );
      const related = await Promise.all(relatedIds.map((id) => this.repository.getServer(registration.tenantId, id)));
      if (related.some((server) => !server)) throw new Error("federation_server_not_found");
    }
    return publicServer(await this.repository.registerServer({
      ...registration,
      sharedSecretHash: await hashPassword(sharedSecret),
    }));
  }

  async heartbeat(externalId: string, sharedSecret: string, input: FederationHeartbeatInput) {
    const server = await this.repository.getServerByExternalId(externalId);
    if (!server || !(await verifyPassword(sharedSecret, server.sharedSecretHash))) {
      throw new Error("invalid_federation_identity");
    }
    return publicServer(await this.repository.recordHeartbeat(server, input, this.now().toISOString()));
  }

  async listServers(tenantId: string, filters: { region?: string; countryCode?: string } = {}) {
    const servers = await this.repository.listServers(tenantId, filters);
    return servers.map((server) => publicServer(this.withEffectiveStatus(server)));
  }

  async getDashboard(tenantId: string): Promise<FederationDashboardSummary> {
    const servers = (await this.repository.listServers(tenantId)).map((server) => this.withEffectiveStatus(server));
    // A standby usually mirrors its primary's camera/branch inventory. Counting
    // it before activation doubles fleet capacity in a multi-site dashboard.
    const resourceOwners = servers.filter((server) => server.role !== "backup_server" || server.status === "failover_active");
    const regions = new Map<string, FederationDashboardSummary["regions"][number] & { healthTotal: number }>();
    for (const server of servers) {
      const key = `${server.countryCode}:${server.region}`;
      const current = regions.get(key) ?? {
        countryCode: server.countryCode,
        region: server.region,
        servers: 0,
        onlineServers: 0,
        branches: 0,
        cameras: 0,
        onlineCameras: 0,
        healthScore: 0,
        healthTotal: 0,
      };
      current.servers += 1;
      current.onlineServers += isAvailable(server) ? 1 : 0;
      const ownsResources = resourceOwners.some((owner) => owner.id === server.id);
      current.branches += ownsResources ? server.totalBranches : 0;
      current.cameras += ownsResources ? server.totalCameras : 0;
      current.onlineCameras += ownsResources ? server.onlineCameras : 0;
      current.healthTotal += server.healthScore;
      current.healthScore = Number((current.healthTotal / current.servers).toFixed(2));
      regions.set(key, current);
    }
    const heartbeatTimes = servers.flatMap((server) => server.lastHeartbeat ? [server.lastHeartbeat] : []);
    return {
      totalServers: servers.length,
      onlineServers: servers.filter((server) => server.status === "online").length,
      offlineServers: servers.filter((server) => server.status === "offline").length,
      degradedServers: servers.filter((server) => server.status === "degraded").length,
      failoverActiveServers: servers.filter((server) => server.status === "failover_active").length,
      totalRegions: new Set(servers.map((server) => `${server.countryCode}:${server.region}`)).size,
      totalCountries: new Set(servers.map((server) => server.countryCode)).size,
      totalCameras: sum(resourceOwners, "totalCameras"),
      onlineCameras: sum(resourceOwners, "onlineCameras"),
      totalBranches: sum(resourceOwners, "totalBranches"),
      totalStorageGb: nullableSum(resourceOwners, "storageCapacityGb"),
      usedStorageGb: nullableSum(resourceOwners, "storageUsedGb"),
      avgHealthScore: servers.length
        ? Number((servers.reduce((total, server) => total + server.healthScore, 0) / servers.length).toFixed(2))
        : 0,
      lastHeartbeat: heartbeatTimes.sort().at(-1) ?? null,
      regions: [...regions.values()].map(({ healthTotal: _healthTotal, ...region }) => region)
        .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.region.localeCompare(b.region)),
    };
  }

  async search(tenantId: string, query: FederationSearchQuery): Promise<FederationSearchResponse> {
    const all = (await this.repository.listServers(tenantId)).map((server) => this.withEffectiveStatus(server));
    const candidates = all.filter((server) =>
      (["regional_control_center", "edge_server"].includes(server.role) || server.status === "failover_active")
      && isAvailable(server)
      && server.syncEnabled
      && (!query.regions?.length || query.regions.includes(server.region))
      && (!query.countryCodes?.length || query.countryCodes.includes(server.countryCode))
    );
    const attempts = await Promise.all(candidates.map(async (record) => {
      const server = publicServer(record);
      const started = Date.now();
      try {
        const items = await this.peers.search(server, tenantId, query);
        return {
          source: {
            serverId: server.id, serverName: server.name, region: server.region,
            status: "success" as const, resultCount: items.length, durationMs: Date.now() - started,
          },
          items: items.map((item) => ({
            ...item,
            serverId: server.id,
            serverName: server.name,
            region: server.region,
            countryCode: server.countryCode,
          })),
        };
      } catch (error) {
        return {
          source: {
            serverId: server.id, serverName: server.name, region: server.region,
            status: "failed" as const, resultCount: 0, durationMs: Date.now() - started,
            error: error instanceof Error ? error.message : "peer_search_failed",
          },
          items: [] as FederatedSearchItem[],
        };
      }
    }));
    const sources = attempts.map((attempt) => attempt.source);
    const data = attempts.flatMap((attempt) => attempt.items)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, query.limit);
    const failedServers = sources.filter((source) => source.status === "failed").length;
    return {
      status: failedServers ? "partial" : "complete",
      query,
      data,
      total: data.length,
      searchedServers: candidates.length,
      successfulServers: candidates.length - failedServers,
      failedServers,
      sources,
    };
  }

  async resolveServer(tenantId: string, scopeNodeId: string) {
    const server = await this.repository.resolveServerForResource(tenantId, scopeNodeId);
    return server ? publicServer(this.withEffectiveStatus(server)) : undefined;
  }

  async failover(input: {
    tenantId: string;
    failedServerId: string;
    activeServerId: string;
    eventType: "automatic" | "manual" | "planned";
    reason: string;
    triggeredBy: string;
  }): Promise<FederationFailoverEvent> {
    if (input.failedServerId === input.activeServerId) throw new Error("invalid_failover_pair");
    const [failed, active] = await Promise.all([
      this.repository.getServer(input.tenantId, input.failedServerId),
      this.repository.getServer(input.tenantId, input.activeServerId),
    ]);
    if (!failed || !active) throw new Error("federation_server_not_found");
    const validPair = active.role === "backup_server"
      && (active.primaryServerId === failed.id || failed.backupServerId === active.id);
    if (!validPair) throw new Error("invalid_failover_pair");
    if (!isAvailable(this.withEffectiveStatus(active))) throw new Error("failover_target_unavailable");
    return this.repository.activateFailover({ ...input, now: this.now().toISOString() });
  }

  async listCorrelations(tenantId: string, limit: number): Promise<GlobalAlertCorrelation[]> {
    return this.repository.listActiveCorrelations(tenantId, limit);
  }

  private withEffectiveStatus(server: FederatedServerRecord): FederatedServerRecord {
    if (!server.lastHeartbeat || ["maintenance", "failover_active"].includes(server.status)) return server;
    const stale = this.now().getTime() - new Date(server.lastHeartbeat).getTime() > this.heartbeatTtlMs;
    return stale ? { ...server, status: "offline" } : server;
  }
}

function isAvailable(server: FederatedServerRecord) {
  return ["online", "degraded", "failover_active"].includes(server.status);
}

function sum(servers: FederatedServerRecord[], key: "totalCameras" | "onlineCameras" | "totalBranches") {
  return servers.reduce((total, server) => total + server[key], 0);
}

function nullableSum(servers: FederatedServerRecord[], key: "storageCapacityGb" | "storageUsedGb") {
  return servers.reduce((total, server) => total + (server[key] ?? 0), 0);
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
