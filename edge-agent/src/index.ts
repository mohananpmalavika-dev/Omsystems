import { loadEdgeConfig } from "./config.js";
import { discoverOnvifDevices } from "./discovery/onvif-discovery.js";
import {
  attachCredentials,
  OnvifClient,
} from "./devices/onvif-client.js";
import { compatibilityNotes, normalizeVendor } from "./devices/compatibility-registry.js";
import { GatewayClient } from "./registration/gateway-client.js";
import { probeRtsp } from "./streaming/rtsp-probe.js";

const config = loadEdgeConfig();
const gateway = new GatewayClient(
  config.CONTROL_PLANE_URL,
  config.DEV_USER_ID,
  config.EDGE_BRIDGE_SHARED_KEY,
);
const agent = await gateway.register(
  config.BRANCH_ID,
  config.EDGE_AGENT_NAME,
  config.EDGE_AGENT_VERSION,
);
await gateway.heartbeat(agent.id, config.EDGE_AGENT_VERSION);

console.log(`Edge agent ${agent.id} registered; scanning the branch LAN`);
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

    for (const profile of device.profiles) {
      const uri = await client.getStreamUri(device.mediaServiceUrl, profile.token);
      const result = await probeRtsp(
        attachCredentials(uri, credentials),
        config.FFPROBE_PATH,
      );
      profiles.push({
        name: profile.name,
        codec: profile.codec,
        width: result.width ?? profile.width,
        height: result.height ?? profile.height,
      });
    }

    const parsedServiceUrl = new URL(serviceUrl);
    const discovery = await gateway.submitDiscovery(config.BRANCH_ID, {
      edgeAgentId: agent.id,
      vendor,
      model: device.model,
      ipAddress: endpoint.remoteAddress,
      onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
      rtspPort: 554,
      profiles,
      capabilities: device.capabilities,
    });
    console.log(
      `Submitted ${device.manufacturer} ${device.model} as discovery ${discovery.id}`,
      compatibilityNotes(vendor),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to inspect ${endpoint.remoteAddress}: ${message}`);
  }
}
