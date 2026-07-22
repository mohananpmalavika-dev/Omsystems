import { loadEdgeConfig } from "./config.js";
import { discoverOnvifDevices } from "./discovery/onvif-discovery.js";
import { attachCredentials, OnvifClient } from "./devices/onvif-client.js";
import { compatibilityNotes, normalizeVendor } from "./devices/compatibility-registry.js";
import { GatewayClient } from "./registration/gateway-client.js";
import { probeRtsp } from "./streaming/rtsp-probe.js";
import { LocalStreamSecretStore, startSecretProvider } from "./streaming/secret-store.js";

const config = loadEdgeConfig();
const gateway = new GatewayClient(
  config.CONTROL_PLANE_URL,
  config.DEV_USER_ID,
  config.EDGE_BRIDGE_SHARED_KEY,
);
const agentId = config.EDGE_AGENT_ID ?? (await gateway.register(
  config.BRANCH_ID,
  config.EDGE_AGENT_NAME,
  config.EDGE_AGENT_VERSION,
)).id;
const secrets = new LocalStreamSecretStore(config.STREAM_SECRET_STORE_PATH);
await secrets.load();
if (config.EDGE_MEDIA_SHARED_KEY) {
  await startSecretProvider({
    store: secrets,
    host: config.STREAM_SECRET_PROVIDER_HOST,
    port: config.STREAM_SECRET_PROVIDER_PORT,
    sharedKey: config.EDGE_MEDIA_SHARED_KEY,
  });
  console.log(`Local stream-secret provider listening on ${config.STREAM_SECRET_PROVIDER_HOST}:${config.STREAM_SECRET_PROVIDER_PORT}`);
}

console.log(`Edge agent ${agentId} registered; waiting for branch commands`);
await gateway.heartbeat(agentId, config.EDGE_AGENT_VERSION, config.PUBLIC_MEDIA_GATEWAY_URL);

let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    await gateway.heartbeat(agentId, config.EDGE_AGENT_VERSION, config.PUBLIC_MEDIA_GATEWAY_URL);
    const job = await gateway.claimScanJob(agentId, config.EDGE_AGENT_VERSION);
    if (job) {
      try {
        const resultCount = await scanBranch();
        await gateway.completeScanJob(agentId, job.id, {
          status: "completed",
          resultCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await gateway.completeScanJob(agentId, job.id, {
          status: "failed",
          resultCount: 0,
          error: message.slice(0, 2_000),
        });
      }
    }
  } catch (error) {
    console.error("Edge command poll failed:", error instanceof Error ? error.message : error);
  }
  await delay(5_000);
}

async function scanBranch() {
  const configuredEndpoints = config.ONVIF_ENDPOINTS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const endpoints = configuredEndpoints.length > 0
    ? configuredEndpoints.map((serviceUrl) => ({
        endpointReference: null,
        xaddrs: [serviceUrl],
        scopes: [],
        remoteAddress: new URL(serviceUrl).hostname,
      }))
    : await discoverOnvifDevices(config.DISCOVERY_TIMEOUT_MS);
  console.log(`Discovered ${endpoints.length} ONVIF endpoint(s)`);
  let submitted = 0;

  for (const endpoint of endpoints) {
    const serviceUrl = endpoint.xaddrs[0];
    if (!serviceUrl) continue;
    try {
      const credentials = {
        username: config.CAMERA_USERNAME,
        password: config.CAMERA_PASSWORD,
      };
      const client = new OnvifClient(serviceUrl, credentials, config.ONVIF_TIMEOUT_MS);
      const device = await client.inspect();
      const vendor = normalizeVendor(device.manufacturer);
      const profiles = [];
      let primarySourceUri: string | undefined;
      for (const profile of device.profiles) {
        const uri = await client.getStreamUri(device.mediaServiceUrl, profile.token);
        const sourceUri = attachCredentials(uri, credentials);
        primarySourceUri ??= sourceUri;
        const result = await probeRtsp(sourceUri, config.FFPROBE_PATH);
        profiles.push({
          name: profile.name,
          codec: profile.codec,
          width: result.width ?? profile.width,
          height: result.height ?? profile.height,
        });
      }
      const parsedServiceUrl = new URL(serviceUrl);
      const discovery = await gateway.submitDiscovery(config.BRANCH_ID, {
        edgeAgentId: agentId,
        vendor,
        model: device.model,
        ipAddress: endpoint.remoteAddress,
        onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
        rtspPort: 554,
        profiles,
        capabilities: device.capabilities,
      });
      if (primarySourceUri) {
        await secrets.set(`edge://${agentId}/${discovery.id}`, primarySourceUri);
      }
      submitted += 1;
      console.log(`Submitted ${device.manufacturer} ${device.model} as discovery ${discovery.id}`, compatibilityNotes(vendor));
    } catch (error) {
      console.error(`Failed to inspect ${endpoint.remoteAddress}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return submitted;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
