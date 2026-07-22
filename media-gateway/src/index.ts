import { buildMediaGateway } from "./app.js";
import { loadMediaConfig } from "./config.js";
import { HttpControlPlaneClient } from "./control-plane-client.js";
import { MediaMtxRouter } from "./media-router.js";
import { EnvironmentSecretProvider, HttpStreamSecretProvider } from "./secret-provider.js";

const config = loadMediaConfig();
const app = await buildMediaGateway({
  controlPlane: new HttpControlPlaneClient(
    config.CONTROL_PLANE_URL,
    config.MEDIA_GATEWAY_SHARED_KEY,
  ),
  router: new MediaMtxRouter(config.MEDIAMTX_API_URL),
  secrets: config.STREAM_SECRET_PROVIDER_URL
    ? new HttpStreamSecretProvider(
        config.STREAM_SECRET_PROVIDER_URL,
        config.STREAM_SECRET_PROVIDER_KEY!,
      )
    : new EnvironmentSecretProvider(config.STREAM_SECRETS_JSON),
  mediaMtxHlsUrl: config.MEDIAMTX_HLS_URL,
  publicHlsBaseUrl: config.PUBLIC_HLS_BASE_URL,
  publicWebRtcBaseUrl: config.PUBLIC_WEBRTC_BASE_URL,
  accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1000,
  ...(config.EDGE_BRIDGE_SHARED_KEY
    ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY }
    : {}),
  logger: true,
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
