import { loadEdgeConfig } from "./config.js";
import { discoverOnvifDevices } from "./discovery/onvif-discovery.js";
import { attachCredentials, OnvifClient } from "./devices/onvif-client.js";
import { compatibilityNotes, normalizeVendor } from "./devices/compatibility-registry.js";
import { GatewayClient } from "./registration/gateway-client.js";
import { probeRtsp } from "./streaming/rtsp-probe.js";
import { LocalStreamSecretStore, startSecretProvider } from "./streaming/secret-store.js";
import { uptime } from "node:os";
import { NetworkCounterSampler, NetworkPathTracker, probeInternetLink } from "./monitoring/internet-probe.js";
import { EdgeResourceSampler } from "./monitoring/edge-resource-probe.js";
import { looksLikeRecorder, probeRecorder, recorderPlaybackUri } from "./monitoring/recorder-probe.js";
import { initializeCameraHeartbeat } from "./monitoring/camera-heartbeat.js";
import { hasArgument, prepareEdgeRuntime } from "./runtime.js";
import { logger } from "./utils/logger.js";
import { startEdgeMediaRuntime, type EdgeMediaRuntime } from "./streaming/edge-live-gateway.js";
import { inspectBundledWindowsRuntime, launchWindowsSelfInstaller } from "./windows/self-installer.js";
import { DeviceIdentityStore } from "./security/device-identity.js";
import { EncryptedOutbox } from "./offline/encrypted-outbox.js";
import { stageSignedUpdate } from "./updates/signed-update.js";
import { readFile } from "node:fs/promises";
import { CameraCredentialVault, openSealedCommand, type SealedCommandEnvelope } from "./security/camera-credential-vault.js";

async function main() {
const argv = process.argv.slice(2);
if (hasArgument(argv, "--verify-bundle")) {
  process.stdout.write(`${JSON.stringify({ valid: true, assets: inspectBundledWindowsRuntime() }, null, 2)}\n`);
  process.exit(0);
}
const runtime = prepareRuntimeOrExit(argv);
if (runtime.embeddedEnvironmentFile && (argv.length === 0 || hasArgument(argv, "--install"))) {
  launchWindowsSelfInstaller(runtime.embeddedEnvironmentFile);
  process.exit(0);
}
if (hasArgument(argv, "--version")) {
  process.stdout.write("Sentinel Grid Edge Agent 0.1.0\n");
  process.exit(0);
}
const config = loadConfigOrExit();
process.env.EDGE_LOG_PATH = config.EDGE_LOG_PATH;
if (hasArgument(argv, "--check-config")) {
  process.stdout.write(`${JSON.stringify({
    valid: true,
    configPath: runtime.configPath,
    homeDirectory: runtime.homeDirectory,
    controlPlaneUrl: config.CONTROL_PLANE_URL,
    branchId: config.BRANCH_ID,
    edgeAgentId: config.EDGE_AGENT_ID ?? null,
    edgeAgentName: config.EDGE_AGENT_NAME,
    onvifEndpointCount: config.ONVIF_ENDPOINTS.split(",").filter(Boolean).length,
    recorderCount: config.RECORDERS_JSON.length,
  }, null, 2)}\n`);
  process.exit(0);
}
const gateway = new GatewayClient(
  config.CONTROL_PLANE_URL,
  config.DEV_USER_ID,
  config.EDGE_BRIDGE_SHARED_KEY,
  config.CONTROL_PLANE_TIMEOUT_MS,
  undefined,
);
const identityStore = new DeviceIdentityStore(config.EDGE_IDENTITY_PATH, config.EDGE_IDENTITY_KEY_PATH);
const outbox = new EncryptedOutbox(
  config.EDGE_OFFLINE_OUTBOX_PATH,
  config.EDGE_OFFLINE_OUTBOX_KEY_PATH,
  config.EDGE_OFFLINE_OUTBOX_MAX_ITEMS,
);
await outbox.load();
let identity = await identityStore.load();
if (!identity && config.EDGE_ACTIVATION_CODE) {
  const deviceUuid = DeviceIdentityStore.newDeviceUuid();
  const commandKeys = DeviceIdentityStore.newCommandKeyPair();
  const activated = await gateway.activate(
    config.EDGE_ACTIVATION_CODE,
    deviceUuid,
    config.EDGE_AGENT_VERSION,
    commandKeys.publicKey,
  );
  identity = {
    deviceUuid,
    agentId: activated.agentId,
    branchId: activated.branchId,
    credential: activated.credential,
    commandPublicKey: commandKeys.publicKey,
    commandPrivateKey: commandKeys.privateKey,
    ...(activated.updatePublicKey ? { updatePublicKey: activated.updatePublicKey } : {}),
    enrolledAt: new Date().toISOString(),
  };
  await identityStore.save(identity);
}
if (identity) gateway.useEdgeCredential(identity.credential);
const legacyAgentId = !identity && config.EDGE_AGENT_ID && config.BRANCH_ID
  ? config.EDGE_AGENT_ID
  : !identity && config.BRANCH_ID
    ? (await gateway.register(config.BRANCH_ID, config.EDGE_AGENT_NAME, config.EDGE_AGENT_VERSION)).id
    : undefined;
const resolvedAgentId = identity?.agentId ?? legacyAgentId;
const resolvedBranchId = identity?.branchId ?? config.BRANCH_ID;
if (!resolvedAgentId || !resolvedBranchId) throw new Error("edge_gateway_identity_unavailable");
const agentId: string = resolvedAgentId;
const branchId: string = resolvedBranchId;
// Attach the outbox only after activation so a one-time enrollment request is never queued.
const authenticatedGateway = new GatewayClient(
  config.CONTROL_PLANE_URL,
  config.DEV_USER_ID,
  config.EDGE_BRIDGE_SHARED_KEY,
  config.CONTROL_PLANE_TIMEOUT_MS,
  outbox,
);
if (identity) authenticatedGateway.useEdgeCredential(identity.credential);
const control = authenticatedGateway;
const credentialVault = new CameraCredentialVault(
  config.EDGE_CAMERA_CREDENTIAL_VAULT_PATH,
  config.EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH,
);
await credentialVault.load();
if (hasArgument(argv, "--diagnose")) {
  await control.heartbeat(agentId, config.EDGE_AGENT_VERSION, config.PUBLIC_MEDIA_GATEWAY_URL);
  process.stdout.write(`Connected to ${config.CONTROL_PLANE_URL} as edge agent ${agentId}.\n`);
  process.exit(0);
}
const secrets = new LocalStreamSecretStore(config.STREAM_SECRET_STORE_PATH);
const networkCounterSampler = new NetworkCounterSampler();
const networkPathTracker = new NetworkPathTracker(config.INTERNET_PATH_WINDOW_MS);
const edgeResourceSampler = new EdgeResourceSampler();
let edgeMediaRuntime: EdgeMediaRuntime | undefined;
let lastRecorderProbeAt = 0;
let lastRecorderArchiveScanAt = 0;
await secrets.load();
if (config.LIVE_MEDIA_ENABLED) {
  edgeMediaRuntime = await startEdgeMediaRuntime({ config, gateway: control, agentId, secrets });
}
const cameraHeartbeat = initializeCameraHeartbeat(
  config.CONTROL_PLANE_URL,
  branchId,
  agentId,
  config.DEV_USER_ID,
  config.FFPROBE_PATH,
  config.FFMPEG_PATH,
  identity?.credential ?? config.EDGE_BRIDGE_SHARED_KEY,
  (payload) => control.submitTelemetry(agentId, payload),
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
  logger.info(`Local stream-secret provider listening on ${config.STREAM_SECRET_PROVIDER_HOST}:${config.STREAM_SECRET_PROVIDER_PORT}`);
}

logger.info(`Edge agent ${agentId} registered; waiting for branch commands`, { branchId, version: config.EDGE_AGENT_VERSION });
await heartbeatAndReport();

let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    await heartbeatAndReport();
    const replay = await control.flushOutbox();
    if (replay.delivered > 0) logger.info("Replayed offline telemetry", replay);
    const command = await control.claimCommand(agentId);
    if (command) {
      try {
        const outcome = await executeEdgeCommand(command.type, command.payload);
        await control.completeCommand(agentId, command.id, { status: "succeeded", result: outcome.result });
        if (outcome.restartAgent) {
          logger.info("Restarting edge agent after acknowledged remote command", { commandId: command.id });
          process.exit(75);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await control.completeCommand(agentId, command.id, { status: "failed", error: message.slice(0, 2_000) });
      }
    }
    const job = await control.claimScanJob(agentId, config.EDGE_AGENT_VERSION);
    if (job) {
      try {
        const resultCount = await scanBranch();
        await control.completeScanJob(agentId, job.id, {
          status: "completed",
          resultCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await control.completeScanJob(agentId, job.id, {
          status: "failed",
          resultCount: 0,
          error: message.slice(0, 2_000),
        });
      }
    }
  } catch (error) {
    logger.error("Edge command poll failed", { error: error instanceof Error ? error.message : String(error) });
  }
  await delay(5_000);
}

cameraHeartbeat.stop();
await edgeMediaRuntime?.stop();

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
  logger.info(`Discovered ${endpoints.length} ONVIF endpoint(s)`);
  let submitted = 0;

  for (const endpoint of endpoints) {
    const serviceUrl = endpoint.xaddrs[0];
    if (!serviceUrl) continue;
    try {
      const credentials = credentialVault.get(endpoint.remoteAddress) ?? {
        username: config.CAMERA_USERNAME,
        password: config.CAMERA_PASSWORD,
        updatedAt: "configuration",
      };
      const client = new OnvifClient(serviceUrl, credentials, config.ONVIF_TIMEOUT_MS);
      const device = await client.inspect();
      const vendor = normalizeVendor(device.manufacturer);
      if (looksLikeRecorder(device, endpoint.scopes)) {
        const discoveredId = `recorder-${device.serialNumber || endpoint.remoteAddress}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
        const observedAt = new Date().toISOString();
        await control.submitTelemetry(agentId, {
          branchId, edgeAgentId: agentId, deviceType: "recorder", deviceId: discoveredId,
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
        logger.info(`Auto-provisioned recorder ${device.manufacturer} ${device.model} as ${discoveredId}`);
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
      const discovery = await control.submitDiscovery(branchId, {
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
      logger.info(`Submitted ${device.manufacturer} ${device.model} as discovery ${discovery.id}`, { compatibility: compatibilityNotes(vendor) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to inspect ${endpoint.remoteAddress}`, { error: message });
      try {
        const serviceUrl = endpoint.xaddrs[0];
        if (!serviceUrl) continue;
        const parsedServiceUrl = new URL(serviceUrl);
        await control.submitDiscovery(branchId, {
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
          statusReason: message.slice(0, 200),
          profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
          capabilities: { ptz: false, audio: false, events: false },
        });
        submitted += 1;
      } catch (submissionError) {
        logger.error(`Failed to report ${endpoint.remoteAddress}`, { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
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
  await control.heartbeat(agentId, config.EDGE_AGENT_VERSION, edgeMediaRuntime?.publicUrl ?? config.PUBLIC_MEDIA_GATEWAY_URL);
  if (Date.now() - lastCameraConfigSyncAt >= config.CAMERA_CONFIG_REFRESH_MS) {
    await syncCameraHeartbeatConfig().catch((error) => {
      logger.error("Camera monitoring configuration refresh failed", { error: error instanceof Error ? error.message : String(error) });
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
    counterSampler: networkCounterSampler, pathTracker: networkPathTracker,
  })));
  const primaryAvailable = linkResults.some((link) => link.role === "primary" && link.connectivity);
  const scanRecorderArchives = Date.now() - lastRecorderArchiveScanAt >= config.RECORDER_ARCHIVE_SCAN_INTERVAL_MS;
  const recorderReports = Date.now() - lastRecorderProbeAt >= config.RECORDER_POLL_INTERVAL_MS
    ? await collectRecorderReports(observedAt, scanRecorderArchives) : [];
  if (recorderReports.length) lastRecorderProbeAt = Date.now();
  if (scanRecorderArchives && recorderReports.length) lastRecorderArchiveScanAt = Date.now();
  await Promise.all([
    control.submitTelemetry(agentId, {
      branchId, edgeAgentId: agentId,
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
      return control.submitTelemetry(agentId, {
      branchId, edgeAgentId: agentId,
      deviceType: "network", deviceId: `${branchId}:internet:${link.linkId}`, observedAt, source: "system",
      quality: "verified", idempotencyKey: `${agentId}:network:${link.linkId}:${observedAt}`,
      metrics: {
        ...linkMetrics, active: link.role === "primary" ? primaryAvailable : !primaryAvailable && link.connectivity,
        controlPlaneLatencyMs: latencyMs, lastOnlineAt: link.connectivity ? observedAt : null,
      },
      reasonCodes,
    }); }),
    ...recorderReports.flatMap(({ recorder, probe }) => {
      const source = recorder.vendor === "cp-plus" ? "cp-plus-adapter" as const : recorder.vendor === "onvif" ? "onvif" as const : "system" as const;
      const submissions: Array<Promise<unknown>> = [control.submitTelemetry(agentId, {
        branchId, edgeAgentId: agentId, deviceType: "recorder", deviceId: recorder.id,
        observedAt, source, quality: "verified", idempotencyKey: `${agentId}:recorder:${recorder.id}:${observedAt}`,
        metrics: probe.metrics, reasonCodes: probe.reasonCodes,
      })];
      submissions.push(...probe.channelHealth.map((channel) => control.submitTelemetry(agentId, {
        branchId, edgeAgentId: agentId,
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
      if (probe.hddStatus.length) submissions.push(control.submitRecorderHdd(agentId, {
        branchId, recorderId: recorder.id, observedAt, source,
        quality: "verified", idempotencyKey: `${agentId}:recorder-hdd:${recorder.id}:${observedAt}`,
        hddStatus: probe.hddStatus,
      }));
      if (probe.archiveEvidence.length) submissions.push(control.submitRecorderArchive(agentId, {
        branchId, recorderId: recorder.id, observedAt, source,
        quality: "verified", idempotencyKey: `${agentId}:recorder-archive:${recorder.id}:${observedAt}`,
        entries: probe.archiveEvidence,
      }));
      return submissions;
    }),
  ]);
}

async function syncCameraHeartbeatConfig() {
  const cameras = await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION);
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
  return Promise.all(config.RECORDERS_JSON.map(async (recorder) => {
    const secureCredential = credentialVault.get(recorder.host);
    const resolvedRecorder = secureCredential
      ? { ...recorder, username: secureCredential.username, password: secureCredential.password }
      : recorder;
    const probe = await probeRecorder(resolvedRecorder, config.RECORDER_PROBE_TIMEOUT_MS, { includeArchive });
    if (includeArchive && resolvedRecorder.archiveRetention?.verifyPlayback !== false) {
      for (const evidence of probe.archiveEvidence) {
        if (evidence.status !== "available" || !evidence.newestPlayableAt) continue;
        const uri = recorderPlaybackUri(resolvedRecorder, evidence.sourceChannel, evidence.newestPlayableAt);
        if (!uri) {
          evidence.reasonCodes.push("playback_probe_not_supported");
          continue;
        }
        const playback = await probeRtsp(uri, config.FFPROBE_PATH, config.RECORDER_PROBE_TIMEOUT_MS);
        evidence.playbackVerified = playback.reachable;
        evidence.playbackCodec = playback.codec;
        if (playback.reachable) evidence.reasonCodes.push("latest_clip_playback_verified");
        else {
          evidence.playbackError = playback.error?.slice(0, 300) ?? "playback_failed";
          evidence.reasonCodes.push("latest_clip_playback_failed");
        }
      }
    }
    return { recorder: resolvedRecorder, observedAt, probe };
  }));
}

async function executeEdgeCommand(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case "rediscover":
      return { result: { discovered: await scanBranch() } };
    case "restart-media":
      if (!config.LIVE_MEDIA_ENABLED) throw new Error("live_media_disabled");
      await edgeMediaRuntime?.stop();
      edgeMediaRuntime = await startEdgeMediaRuntime({ config, gateway: control, agentId, secrets });
      return { result: { status: "restarted", publicUrl: edgeMediaRuntime.publicUrl } };
    case "restart-agent":
      return { result: { status: "restart_acknowledged" }, restartAgent: true };
    case "probe-camera": {
      const cameraId = typeof payload.cameraId === "string" ? payload.cameraId : "";
      if (!cameraId) throw new Error("cameraId_required");
      const camera = (await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION))
        .find((item) => item.id === cameraId);
      const source = camera ? secrets.get(camera.connectionSecretRef) : undefined;
      if (!source) throw new Error("camera_stream_secret_unavailable");
      const probe = await probeRtsp(source, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS);
      return { result: { cameraId, ...probe } };
    }
    case "probe-recorder": {
      const recorderId = typeof payload.recorderId === "string" ? payload.recorderId : "";
      const recorder = config.RECORDERS_JSON.find((item) => item.id === recorderId);
      if (!recorder) throw new Error("recorder_not_configured");
      const probe = await probeRecorder(recorder, config.RECORDER_PROBE_TIMEOUT_MS, { includeArchive: true });
      return { result: {
        recorderId, metrics: probe.metrics, reasonCodes: probe.reasonCodes,
        hddCount: probe.hddStatus.length, channelHealth: probe.channelHealth,
        archiveEvidence: probe.archiveEvidence,
      } };
    }
    case "collect-logs": {
      const data = await readFile(config.EDGE_LOG_PATH, "utf8").catch(() => "");
      const tail = redactDiagnosticText(data.slice(-64 * 1024));
      return { result: { collectedAt: new Date().toISOString(), bytes: Buffer.byteLength(tail), tail } };
    }
    case "update-credentials": {
      if (!identity?.commandPrivateKey) throw new Error("gateway_secure_command_key_unavailable");
      const envelope = payload.envelope as SealedCommandEnvelope | undefined;
      if (!envelope || typeof envelope !== "object") throw new Error("credential_envelope_required");
      const decrypted = openSealedCommand<{
        username?: unknown; password?: unknown; scope?: { host?: unknown; default?: unknown };
      }>(envelope, identity.commandPrivateKey);
      if (typeof decrypted.username !== "string" || !decrypted.username ||
          typeof decrypted.password !== "string" || !decrypted.scope ||
          (decrypted.scope.host !== undefined && typeof decrypted.scope.host !== "string")) {
        throw new Error("invalid_camera_credential_payload");
      }
      const saved = await credentialVault.set({
        username: decrypted.username,
        password: decrypted.password,
        ...(typeof decrypted.scope.host === "string" ? { host: decrypted.scope.host } : {}),
      });
      const discovered = await scanBranch();
      return { result: { ...saved, rediscovered: discovered } };
    }
    case "apply-update": {
      const release = await control.getUpdate(agentId, config.EDGE_AGENT_VERSION);
      if (!release) throw new Error("no_update_assigned");
      const publicKey = identity?.updatePublicKey ?? config.EDGE_UPDATE_PUBLIC_KEY;
      if (!publicKey) throw new Error("edge_update_public_key_unavailable");
      const staged = await stageSignedUpdate(release, publicKey, config.EDGE_UPDATE_STAGING_PATH);
      return { result: { ...staged, status: "verified_and_staged", supervisorActivationRequired: true } };
    }
    default:
      throw new Error("unsupported_edge_command");
  }
}

function redactDiagnosticText(value: string) {
  return value
    .replace(/(rtsp:\/\/)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/(password|secret|token|credential|authorization)["'=:\s]+[^\s,}"']+/gi, "$1=[redacted]");
}

function prepareRuntimeOrExit(input: string[]) {
  try { return prepareEdgeRuntime(input); }
  catch (error) {
    process.stderr.write(`Edge agent startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

function loadConfigOrExit() {
  try { return loadEdgeConfig(); }
  catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    logger.error("Configuration is invalid", { configPath: runtime.configPath, error: details });
    process.stderr.write(`Edge-agent configuration is invalid (${runtime.configPath ?? "no configuration file found"}).\n${details}\n`);
    process.exit(2);
  }
}
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Edge agent stopped after an unrecoverable startup error", { error: message });
  process.stderr.write(`Edge agent failed to start: ${message}\n`);
  process.exitCode = 1;
});
