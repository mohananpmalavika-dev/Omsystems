import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./database/pool.js";
import { PostgresStore } from "./database/postgres-store.js";
import { MemoryStore } from "./store.js";

const config = loadConfig();
const store = config.DATABASE_URL
  ? new PostgresStore(createPool(config.DATABASE_URL))
  : new MemoryStore();
const app = await buildApp({
  logger: true,
  store,
  authMode: config.AUTH_MODE,
  mediaGatewaySharedKey: config.MEDIA_GATEWAY_SHARED_KEY,
  ...(config.RECORDING_ENGINE_URL && config.RECORDING_ENGINE_SHARED_KEY ? {
    recordingEngineUrl: config.RECORDING_ENGINE_URL,
    recordingEngineSharedKey: config.RECORDING_ENGINE_SHARED_KEY,
  } : {}),
  ...(config.EDGE_BRIDGE_SHARED_KEY
    ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY }
    : {}),
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
