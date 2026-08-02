import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./database/pool.js";
import { PostgresStore } from "./database/postgres-store.js";
import { MemoryStore } from "./store.js";
import type { ControlPlaneStore } from "./control-plane-store.js";
import { RedisEdgePresenceCache } from "./platform/edge-presence-cache.js";
import { CloudflareTunnelManager } from "./platform/cloudflare-tunnel-manager.js";

const config = loadConfig();
const store = config.DATABASE_URL
  ? (new PostgresStore(createPool(config.DATABASE_URL)) as unknown as ControlPlaneStore)
  : new MemoryStore();
const edgePresenceCache = config.REDIS_URL
  ? await new RedisEdgePresenceCache(config.REDIS_URL, config.EDGE_PRESENCE_TTL_SECONDS).connect()
  : undefined;
const edgeTunnelProvider = config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_ZONE_ID &&
  config.CLOUDFLARE_API_TOKEN && config.EDGE_MEDIA_BASE_DOMAIN
  ? new CloudflareTunnelManager({
      accountId: config.CLOUDFLARE_ACCOUNT_ID,
      zoneId: config.CLOUDFLARE_ZONE_ID,
      apiToken: config.CLOUDFLARE_API_TOKEN,
      mediaBaseDomain: config.EDGE_MEDIA_BASE_DOMAIN,
    })
  : undefined;
const app = await buildApp({
  logger: true,
  store,
  authMode: config.AUTH_MODE,
  maxInFlightRequests: config.MAX_IN_FLIGHT_REQUESTS,
  ...(edgePresenceCache ? { edgePresenceCache } : {}),
  ...(edgeTunnelProvider ? { edgeTunnelProvider } : {}),
  requireManagedEdgeTunnel: config.EDGE_MANAGED_TUNNEL_REQUIRED,
  ...(config.CONTROL_PLANE_PUBLIC_URL
    ? { controlPlanePublicUrl: config.CONTROL_PLANE_PUBLIC_URL }
    : {}),
  mediaGatewaySharedKey: config.MEDIA_GATEWAY_SHARED_KEY,
  ...(config.RECORDING_ENGINE_URL && config.RECORDING_ENGINE_SHARED_KEY ? {
    recordingEngineUrl: config.RECORDING_ENGINE_URL,
    recordingEngineSharedKey: config.RECORDING_ENGINE_SHARED_KEY,
  } : {}),
  ...(config.EDGE_BRIDGE_SHARED_KEY
    ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY }
    : {}),
  allowLegacyEdgeBridgeKey: config.EDGE_LEGACY_SHARED_KEY_ENABLED,
  ...(config.EDGE_UPDATE_SIGNING_PRIVATE_KEY
    ? { edgeUpdateSigningPrivateKey: config.EDGE_UPDATE_SIGNING_PRIVATE_KEY }
    : {}),
  ...(config.ANALYTICS_ENGINE_SHARED_KEY
    ? { analyticsEngineSharedKey: config.ANALYTICS_ENGINE_SHARED_KEY }
    : {}),
  ...(config.ANALYTICS_ENGINE_URL
    ? { analyticsEngineUrl: config.ANALYTICS_ENGINE_URL }
    : {}),
  ...(config.FEDERATION_SHARED_KEY
    ? { federationSharedKey: config.FEDERATION_SHARED_KEY }
    : {}),
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
