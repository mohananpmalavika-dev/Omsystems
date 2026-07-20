import { buildMediaGateway } from "./app.js";
import { loadMediaConfig } from "./config.js";
import { HttpControlPlaneClient } from "./control-plane-client.js";
import { MediaMtxRouter } from "./media-router.js";
import { EnvironmentSecretProvider } from "./secret-provider.js";

const config = loadMediaConfig();
const app = await buildMediaGateway({
  controlPlane: new HttpControlPlaneClient(
    config.CONTROL_PLANE_URL,
    config.MEDIA_GATEWAY_SHARED_KEY,
  ),
  router: new MediaMtxRouter(config.MEDIAMTX_API_URL),
  secrets: new EnvironmentSecretProvider(config.STREAM_SECRETS_JSON),
  publicHlsBaseUrl: config.PUBLIC_HLS_BASE_URL,
  publicWebRtcBaseUrl: config.PUBLIC_WEBRTC_BASE_URL,
  accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1000,
  logger: true,
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
