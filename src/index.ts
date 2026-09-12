import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./database/pool.js";
import { PostgresStore } from "./database/postgres-store.js";
import { MemoryStore } from "./store.js";
import type { ControlPlaneStore } from "./control-plane-store.js";
import { RedisEdgePresenceCache } from "./platform/edge-presence-cache.js";
import { CloudflareTunnelManager } from "./platform/cloudflare-tunnel-manager.js";
import { getEventBus } from "./infrastructure/event-bus/event-bus.js";
import { initializeTelemetry } from "./observability/telemetry.js";
import { applicationBootstrap } from "./bootstrap/index.js";

await initializeTelemetry();
const config = loadConfig();
const controlPlanePublicUrl = config.CONTROL_PLANE_PUBLIC_URL;

// Log critical configuration for debugging startup issues
console.log('🚀 KryptoVision Control Plane starting (KryptonLogic)...');
console.log('Configuration check:');
console.log('  - Database:', config.DATABASE_URL ? '✓ configured' : '✗ MISSING');
console.log('  - Redis:', config.REDIS_URL ? '✓ configured' : 'ℹ optional (not set)');
console.log('  - Auth mode:', config.AUTH_MODE);
console.log('  - Host:', config.HOST);
console.log('  - Port:', config.PORT);

// Verify database connectivity before building the app
if (config.DATABASE_URL) {
  console.log('Verifying database connectivity...');
  const testPool = createPool(config.DATABASE_URL);
  try {
    await testPool.query('SELECT 1');
    console.log('✓ Database connection verified');
  } catch (error) {
    console.error('✗ FATAL: Cannot connect to database');
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('The control plane requires a working database connection.');
    process.exit(1);
  } finally {
    await testPool.end();
  }
}

if (!config.DATABASE_URL && config.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production; refusing to start with the in-memory store");
}

const store: ControlPlaneStore = config.DATABASE_URL
  ? (new PostgresStore(createPool(config.DATABASE_URL)) as unknown as ControlPlaneStore)
  : (new MemoryStore() as unknown as ControlPlaneStore);

const eventBus = getEventBus({
  redisUrl: config.REDIS_URL,
  serviceName: "sentinel-control-plane",
  enablePersistence: true,
});
await eventBus.connect();

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
console.log('Initializing application bootstrap architecture...');
const dependencies = await applicationBootstrap.bootstrap({
  databaseUrl: config.DATABASE_URL,
  redisUrl: config.REDIS_URL,
});
console.log('✓ Application bootstrap architecture initialized');

const app = await buildApp({
  logger: true,
  store,
  dependencies,
  authMode: config.AUTH_MODE,
  maxInFlightRequests: config.MAX_IN_FLIGHT_REQUESTS,
  ...(edgePresenceCache ? { edgePresenceCache } : {}),
  ...(edgeTunnelProvider ? { edgeTunnelProvider } : {}),
  requireManagedEdgeTunnel: config.EDGE_MANAGED_TUNNEL_REQUIRED,
  ...(controlPlanePublicUrl
    ? { controlPlanePublicUrl }
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
  ...(config.ANALYTICS_SOURCE_SHARED_KEY
    ? { analyticsSourceSharedKey: config.ANALYTICS_SOURCE_SHARED_KEY }
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
  console.log(`✓ Control plane listening on ${config.HOST}:${config.PORT}`);
} catch (error) {
  console.error('✗ FATAL: Failed to start server');
  app.log.error(error);
  process.exit(1);
}

// Enterprise Graceful Termination Handling
let isShuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nInitiating graceful shutdown (signal: ${signal})...`);

  const shutdownTimeout = setTimeout(() => {
    console.error("Forceful shutdown: graceful period timed out after 10s");
    process.exit(1);
  }, 10000);

  try {
    console.log("  - Draining active HTTP connections...");
    await app.close();
    console.log("  - Closing event bus connections...");
    await eventBus.disconnect?.();
    if (edgePresenceCache && "disconnect" in edgePresenceCache) {
      console.log("  - Disconnecting edge presence cache...");
      await (edgePresenceCache as any).disconnect?.();
    }
    console.log("  - Shutting down application bootstrap modules...");
    await applicationBootstrap.shutdown();
    if (store && "close" in store && typeof (store as any).close === "function") {
      console.log("  - Closing database store pools...");
      await (store as any).close();
    }
    clearTimeout(shutdownTimeout);
    console.log("✓ KryptoVision Control Plane terminated cleanly.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

