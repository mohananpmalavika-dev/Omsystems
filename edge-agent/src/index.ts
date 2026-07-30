import { loadEdgeConfig } from "./config.js";
import { discoverOnvifDevices } from "./discovery/onvif-discovery.js";
import { attachCredentials, OnvifClient } from "./devices/onvif-client.js";
import { compatibilityNotes, normalizeVendor } from "./devices/compatibility-registry.js";
import { GatewayClient } from "./registration/gateway-client.js";
import { probeRtsp } from "./streaming/rtsp-probe.js";
import { LocalStreamSecretStore, startSecretProvider } from "./streaming/secret-store.js";
import { uptime } from "node:os";
import { NetworkCounterSampler, probeInternetLink } from "./monitoring/internet-probe.js";
import { EdgeResourceSampler } from "./monitoring/edge-resource-probe.js";
import { looksLikeRecorder, probeRecorder } from "./monitoring/recorder-probe.js";
import { initializeCameraHeartbeat } from "./monitoring/camera-heartbeat.js";

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
const networkCounterSampler = new NetworkCounterSampler();
const edgeResourceSampler = new EdgeResourceSampler();
let lastRecorderProbeAt = 0;
let lastRecorderArchiveScanAt = 0;
await secrets.load();
const cameraHeartbeat = initializeCameraHeartbeat(
  config.CONTROL_PLANE_URL,
  config.BRANCH_ID,
  agentId,
  config.DEV_USER_ID,
  config.FFPROBE_PATH,
  config.FFMPEG_PATH,
  config.EDGE_BRIDGE_SHARED_KEY,
);
let lastCameraConfigSyncAt = 0;
await syncCameraHeartbeatConfig();
cameraHeartbeat.start(config.CAMERA_HEARTBEAT_INTERVAL_MS);
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
await heartbeatAndReport();

let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    await heartbeatAndReport();
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

cameraHeartbeat.stop();

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
      if (looksLikeRecorder(device, endpoint.scopes)) {
        const discoveredId = `recorder-${device.serialNumber || endpoint.remoteAddress}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
        const observedAt = new Date().toISOString();
        await gateway.submitTelemetry(agentId, {
          branchId: config.BRANCH_ID, edgeAgentId: agentId, deviceType: "recorder", deviceId: discoveredId,
          observedAt, source: "onvif", quality: "verified", idempotencyKey: `${agentId}:recorder-discovery:${discoveredId}:${observedAt}`,
          metrics: {
            name: `${device.manufacturer} ${device.model}`, deviceType: /dvr|xvr|uvr/i.test(device.model) ? "dvr" : "nvr",
            vendor, model: device.model, serialNumber: device.serialNumber ?? "", firmwareVersion: device.firmwareVersion ?? "",
            ipAddress: endpoint.remoteAddress, protocol: "onvif", reachable: true, status: "online",
            totalCameras: device.profiles.length || null, connectedCameras: null, recordingStatus: "unknown",
          },
          reasonCodes: ["onvif_auto_discovered", "recording_state_vendor_specific"],
        });
        submitted += 1;
        console.log(`Auto-provisioned recorder ${device.manufacturer} ${device.model} as ${discoveredId}`);
        continue;
      }
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
        discoveryMethod: "onvif-ws-discovery",
        vendor,
        manufacturer: device.manufacturer,
        model: device.model,
        ipAddress: endpoint.remoteAddress,
        serialNumber: device.serialNumber,
        firmwareVersion: device.firmwareVersion,
        displayName: `${device.manufacturer} ${device.model}`,
        credentialsRequired: false,
        streamVerified: Boolean(primarySourceUri && profiles.length > 0),
        rtspValidated: Boolean(primarySourceUri && profiles.length > 0),
        compatibility: "compatible",
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        onvifSupport: true,
        onvifServices: device.services,
        onvifCapabilityTests: device.capabilityTests,
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
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to inspect ${endpoint.remoteAddress}: ${message}`);
      try {
        const serviceUrl = endpoint.xaddrs[0];
        if (!serviceUrl) continue;
        const parsedServiceUrl = new URL(serviceUrl);
        await gateway.submitDiscovery(config.BRANCH_ID, {
          edgeAgentId: agentId,
          discoveryMethod: "onvif-ws-discovery",
          vendor: "other",
          manufacturer: "ONVIF",
          model: `Camera ${endpoint.remoteAddress}`,
          displayName: `Camera ${endpoint.remoteAddress}`,
          ipAddress: endpoint.remoteAddress,
          onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
          rtspPort: 554,
          onvifSupport: true,
          credentialsRequired: /401|403|unauthori|forbidden|credential|auth/i.test(message),
          streamVerified: false,
          rtspValidated: false,
          compatibility: "review-required",
          duplicateStatus: "unique",
          compatibilityStatus: "review-required",
          statusReason: message.slice(0, 500),
          profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
          capabilities: { ptz: false, audio: false, events: false },
        });
        submitted += 1;
      } catch (submissionError) {
        console.error(`Failed to report ${endpoint.remoteAddress}: ${submissionError instanceof Error ? submissionError.message : submissionError}`);
      }
    }
  }
  return submitted;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function heartbeatAndReport() {
  const startedAt = Date.now();
  await gateway.heartbeat(agentId, config.EDGE_AGENT_VERSION, config.PUBLIC_MEDIA_GATEWAY_URL);
  if (Date.now() - lastCameraConfigSyncAt >= config.CAMERA_CONFIG_REFRESH_MS) {
    await syncCameraHeartbeatConfig().catch((error) => {
      console.error("Camera monitoring configuration refresh failed:", error instanceof Error ? error.message : error);
    });
  }
  const observedAt = new Date().toISOString();
  const latencyMs = Date.now() - startedAt;
  const { reasonCodes: edgeResourceReasonCodes, ...edgeResourceMetrics } = await edgeResourceSampler.sample(config.EDGE_HEALTH_DISK_PATH);
  const configuredLinks = config.INTERNET_LINKS_JSON.length ? config.INTERNET_LINKS_JSON : [{
    id: "primary", role: "primary" as const, ispName: "Primary ISP",
    targets: [config.CONTROL_PLANE_URL],
  }];
  const linkResults = await Promise.all(configuredLinks.map((link) => probeInternetLink(link, {
    timeoutMs: config.INTERNET_PROBE_TIMEOUT_MS, attempts: config.INTERNET_PROBE_ATTEMPTS,
    counterSampler: networkCounterSampler,
  })));
  const primaryAvailable = linkResults.some((link) => link.role === "primary" && link.connectivity);
  const scanRecorderArchives = Date.now() - lastRecorderArchiveScanAt >= config.RECORDER_ARCHIVE_SCAN_INTERVAL_MS;
  const recorderReports = Date.now() - lastRecorderProbeAt >= config.RECORDER_POLL_INTERVAL_MS
    ? await collectRecorderReports(observedAt, scanRecorderArchives) : [];
  if (recorderReports.length) lastRecorderProbeAt = Date.now();
  if (scanRecorderArchives && recorderReports.length) lastRecorderArchiveScanAt = Date.now();
  await Promise.all([
    gateway.submitTelemetry(agentId, {
      branchId: config.BRANCH_ID, edgeAgentId: agentId,
      deviceType: "edge-agent", deviceId: agentId, observedAt, source: "system",
      quality: "verified", idempotencyKey: `${agentId}:edge-agent:${observedAt}`,
      metrics: {
        status: "online", version: config.EDGE_AGENT_VERSION,
        uptimeSeconds: Math.round(uptime()),
        ...edgeResourceMetrics,
      },
      reasonCodes: edgeResourceReasonCodes,
    }),
    ...linkResults.map((link) => {
      const { reasonCodes, ...linkMetrics } = link;
      return gateway.submitTelemetry(agentId, {
      branchId: config.BRANCH_ID, edgeAgentId: agentId,
      deviceType: "network", deviceId: `${config.BRANCH_ID}:internet:${link.linkId}`, observedAt, source: "system",
      quality: "verified", idempotencyKey: `${agentId}:network:${link.linkId}:${observedAt}`,
      metrics: {
        ...linkMetrics, active: link.role === "primary" ? primaryAvailable : !primaryAvailable && link.connectivity,
        controlPlaneLatencyMs: latencyMs, lastOnlineAt: link.connectivity ? observedAt : null,
      },
      reasonCodes,
    }); }),
    ...recorderReports.flatMap(({ recorder, probe }) => {
      const source = recorder.vendor === "cp-plus" ? "cp-plus-adapter" as const : recorder.vendor === "onvif" ? "onvif" as const : "system" as const;
      const submissions: Array<Promise<unknown>> = [gateway.submitTelemetry(agentId, {
        branchId: config.BRANCH_ID, edgeAgentId: agentId, deviceType: "recorder", deviceId: recorder.id,
        observedAt, source, quality: "verified", idempotencyKey: `${agentId}:recorder:${recorder.id}:${observedAt}`,
        metrics: probe.metrics, reasonCodes: probe.reasonCodes,
      })];
      submissions.push(...probe.channelHealth.map((channel) => gateway.submitTelemetry(agentId, {
        branchId: config.BRANCH_ID, edgeAgentId: agentId,
        deviceType: "recorder-channel", deviceId: `${recorder.id}:channel:${channel.sourceChannel}`,
        observedAt, source, quality: channel.status === "unknown" ? "unavailable" : "verified",
        idempotencyKey: `${agentId}:recorder-channel:${recorder.id}:${channel.sourceChannel}:${observedAt}`,
        metrics: {
          recorderId: recorder.id, sourceChannel: channel.sourceChannel, status: channel.status,
          connected: channel.connected, lastRecordedAt: channel.lastRecordedAt,
          recordingStatusSource: channel.recordingStatusSource,
        },
        reasonCodes: channel.reasonCodes,
      })));
      if (probe.hddStatus.length) submissions.push(gateway.submitRecorderHdd(agentId, {
        branchId: config.BRANCH_ID, recorderId: recorder.id, observedAt, source,
        quality: "verified", idempotencyKey: `${agentId}:recorder-hdd:${recorder.id}:${observedAt}`,
        hddStatus: probe.hddStatus,
      }));
      if (probe.archiveEvidence.length) submissions.push(gateway.submitRecorderArchive(agentId, {
        branchId: config.BRANCH_ID, recorderId: recorder.id, observedAt, source,
        quality: "verified", idempotencyKey: `${agentId}:recorder-archive:${recorder.id}:${observedAt}`,
        entries: probe.archiveEvidence,
      }));
      return submissions;
    }),
  ]);
}

async function syncCameraHeartbeatConfig() {
  const cameras = await gateway.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION);
  cameraHeartbeat.replaceCameras(cameras.map((camera) => {
    const rtspUrl = secrets.get(camera.connectionSecretRef);
    return {
      id: camera.id,
      name: camera.name,
      ...(rtspUrl ? { rtspUrl } : {}),
      enabled: true,
    };
  }));
  lastCameraConfigSyncAt = Date.now();
}

async function collectRecorderReports(observedAt: string, includeArchive: boolean) {
  return Promise.all(config.RECORDERS_JSON.map(async (recorder) => ({
    recorder, observedAt, probe: await probeRecorder(recorder, config.RECORDER_PROBE_TIMEOUT_MS, { includeArchive }),
  })));
}
