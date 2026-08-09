import { loadEdgeConfig } from "./config.js";
import { discoverOnvifDevices } from "./discovery/onvif-discovery.js";
import { onvifServiceCandidates } from "./discovery/onvif-service-candidates.js";
import { createDeviceFingerprint } from "./discovery/device-fingerprint.js";
import { discoverRtspDevices } from "./discovery/rtsp-network-scan.js";
import { attachCredentials, OnvifClient } from "./devices/onvif-client.js";
import { compatibilityNotes, normalizeVendor } from "./devices/compatibility-registry.js";
import { GatewayClient, type DiscoveredCameraPayload } from "./registration/gateway-client.js";
import { captureRtspRgbFrame, probeRtsp } from "./streaming/rtsp-probe.js";
import { LocalStreamSecretStore, startSecretProvider } from "./streaming/secret-store.js";
import { uptime } from "node:os";
import { NetworkCounterSampler, NetworkPathTracker, probeInternetLink } from "./monitoring/internet-probe.js";
import { EdgeResourceSampler } from "./monitoring/edge-resource-probe.js";
import { looksLikeRecorder, probeRecorder, recorderPlaybackUri } from "./monitoring/recorder-probe.js";
import { initializeCameraHeartbeat } from "./monitoring/camera-heartbeat.js";
import { hasArgument, prepareEdgeRuntime } from "./runtime.js";
import { logger } from "./utils/logger.js";
import { startEdgeMediaRuntime, startEdgeMediaRuntimeIfAvailable, type EdgeMediaRuntime } from "./streaming/edge-live-gateway.js";
import { inspectBundledWindowsRuntime, launchWindowsSelfInstaller } from "./windows/self-installer.js";
import { DeviceIdentityStore } from "./security/device-identity.js";
import { EncryptedOutbox } from "./offline/encrypted-outbox.js";
import { stageSignedUpdate } from "./updates/signed-update.js";
import { readFile } from "node:fs/promises";
import { CameraCredentialVault, openSealedCommand, type SealedCommandEnvelope } from "./security/camera-credential-vault.js";
import { DatabaseCredentialProvider } from "./security/database-credential-provider.js";
import {
  discoverRecorderChannels,
  discoverVendorRecorderChannels,
  recorderAdapterVendor,
} from "./recorders/dvr-adapter.js";
import { identifyVendorFamily, probeVendorStream } from "./devices/vendor-stream-adapter.js";
import type { RecorderConfig } from "./monitoring/recorder-probe.js";
import { recoverCamera } from "./recovery/camera-recovery.js";

async function main() {
const argv = process.argv.slice(2);
const scanOnce = hasArgument(argv, "--scan-once");
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
  process.stdout.write("Sentinel Grid Edge Agent 0.1.4\n");
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
    ...(activated.media ? { media: activated.media } : {}),
    ...(activated.updatePublicKey ? { updatePublicKey: activated.updatePublicKey } : {}),
    enrolledAt: new Date().toISOString(),
  };
  // A temporary local scan must not turn the operator's laptop into a
  // permanently enrolled branch appliance. It can use its activation/bridge
  // credential in memory for this one process and exits when the scan ends.
  if (!scanOnce) await identityStore.save(identity);
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
if (identity && config.EDGE_MANAGED_MEDIA_BOOTSTRAP) {
  try {
    const bootstrap = await control.getBootstrap(agentId);
    if (bootstrap.media) {
      identity.media = bootstrap.media;
      await identityStore.save(identity);
    }
  } catch (error) {
    logger.warn("Managed media bootstrap refresh failed; using the last encrypted configuration", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
if (config.EDGE_MANAGED_MEDIA_BOOTSTRAP && identity?.media) {
  Object.assign(config, {
    LIVE_MEDIA_ENABLED: true,
    MEDIA_RUNTIME_MANAGED: true,
    MEDIA_TUNNEL_MODE: "named" as const,
    PUBLIC_MEDIA_GATEWAY_URL: identity.media.publicUrl,
    CLOUDFLARED_TUNNEL_TOKEN: identity.media.tunnelToken,
  });
}
const credentialVault = new CameraCredentialVault(
  config.EDGE_CAMERA_CREDENTIAL_VAULT_PATH,
  config.EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH,
);
await credentialVault.load();

const dbCredentialProvider = new DatabaseCredentialProvider(control, agentId);
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
const activeRecorders = new Map<string, RecorderConfig>(
  config.RECORDERS_JSON.map((recorder) => [recorder.id, recorder]),
);
await secrets.load();
if (scanOnce) {
  const discovered = await scanBranch({ persistStreamSecrets: false });
  process.stdout.write(`${JSON.stringify({
    completed: true,
    mode: "local-network-scan",
    branchId,
    edgeAgentId: agentId,
    discovered,
    message: "IP cameras and DVR/NVR channels were submitted for review. No service, tunnel, or local stream credential was installed.",
  }, null, 2)}\n`);
  process.exit(0);
}
if (config.LIVE_MEDIA_ENABLED) {
  edgeMediaRuntime = await startEdgeMediaRuntimeIfAvailable({ config, gateway: control, agentId, secrets });
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
  async ({ cameraId, consecutiveFailures }) => {
    const recovery = await recoverCameraAtEdge(cameraId, "automatic", consecutiveFailures);
    logger.info("Automatic camera recovery completed", {
      cameraId,
      recovered: recovery.recovered,
      steps: recovery.steps.map((step) => `${step.step}:${step.status}`),
    });
  },
);
let lastCameraConfigSyncAt = 0;
let lastDiscoveryAt = 0;
await syncCameraHeartbeatConfig();
if (config.AUTO_DISCOVERY_ENABLED) {
  await runAutomaticDiscovery();
}
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
    if (config.AUTO_DISCOVERY_ENABLED && Date.now() - lastDiscoveryAt >= config.AUTO_DISCOVERY_INTERVAL_MS) {
      await runAutomaticDiscovery();
    }
    const command = await control.claimCommand(agentId);
    if (command) {
      try {
        const outcome = await executeEdgeCommand(command.type, command.payload);
        const recoveryFailed = command.type === "recover-camera" &&
          (outcome.result as { recovered?: unknown }).recovered !== true;
        await control.completeCommand(agentId, command.id, {
          status: recoveryFailed ? "failed" : "succeeded",
          result: outcome.result as Record<string, unknown>,
          ...(recoveryFailed ? { error: "camera_recovery_not_completed" } : {}),
        });
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
        dbCredentialProvider.invalidate();
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

async function discoveryCredentials(host: string) {
  try {
    const databaseCredentials = await dbCredentialProvider.get(host);
    if (databaseCredentials) return databaseCredentials;
  } catch (error) {
    logger.warn("Unable to load discovery credentials from the control plane", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return credentialVault.get(host) ?? {
    username: "",
    password: "",
    updatedAt: "not-configured",
  };
}

async function scanBranch(options: { persistStreamSecrets?: boolean } = {}) {
  const persistStreamSecrets = options.persistStreamSecrets ?? true;
  const configuredEndpoints = config.ONVIF_ENDPOINTS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const endpoints = configuredEndpoints.length > 0
    ? configuredEndpoints.map((serviceUrl) => ({
        endpointReference: null,
        xaddrs: [serviceUrl],
        scopes: [],
        types: [],
        remoteAddress: new URL(serviceUrl).hostname,
      }))
    : await discoverOnvifDevices(config.DISCOVERY_TIMEOUT_MS);
  logger.info(`Discovered ${endpoints.length} ONVIF endpoint(s)`);
  let submitted = 0;

  for (const endpoint of endpoints) {
    const serviceUrls = onvifServiceCandidates(endpoint);
    if (!serviceUrls.length) continue;
    const credentials = await discoveryCredentials(endpoint.remoteAddress);
    let serviceUrl = serviceUrls[0]!;
    const inspectionFailures: string[] = [];
    try {
      let client: OnvifClient | undefined;
      let device: Awaited<ReturnType<OnvifClient["inspect"]>> | undefined;
      for (const candidate of serviceUrls) {
        try {
          const candidateClient = new OnvifClient(candidate, credentials, config.ONVIF_TIMEOUT_MS);
          device = await candidateClient.inspect();
          client = candidateClient;
          serviceUrl = candidate;
          break;
        } catch (error) {
          inspectionFailures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!client || !device) {
        throw new Error(`All ONVIF service candidates failed: ${inspectionFailures.join(" | ").slice(0, 1500)}`);
      }
      const vendor = normalizeVendor(device.manufacturer);
      const discoveryKinds = [...endpoint.scopes, ...endpoint.types];
      const baseDiscoveryLayers: DiscoveryLayers = [
        { layer: "network-discovery", status: "passed", detail: "Camera host discovered on the branch network" },
        { layer: "onvif-discovery", status: "passed", detail: `ONVIF service selected over ${new URL(serviceUrl).protocol}` },
        ...device.inspectionLayers,
      ];
      if (looksLikeRecorder(device, discoveryKinds)) {
        const recorderFingerprint = createDeviceFingerprint({
          onvifEndpointReference: endpoint.endpointReference,
          serialNumber: device.serialNumber,
          manufacturer: device.manufacturer,
          model: device.model,
        });
        const recorderIdentity = knownValue(device.serialNumber) ?? recorderFingerprint ?? endpoint.remoteAddress;
        const recorderSerialNumber = knownValue(device.serialNumber);
        const discoveredId = `recorder-${recorderIdentity}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
        const observedAt = new Date().toISOString();
        const parsedServiceUrl = new URL(serviceUrl);
        const recorderVendor = recorderAdapterVendor(device.manufacturer);
        const recorderType = /dvr|xvr|uvr/i.test(`${device.model} ${discoveryKinds.join(" ")}`) ? "dvr" as const : "nvr" as const;
        let channels = await discoverRecorderChannels({
          manufacturer: device.manufacturer,
          model: device.model,
          profiles: device.profiles,
          credentials,
          getStreamUri: (profileToken) => client.getStreamUri(device.mediaServiceUrl, profileToken),
          probeStream: (uri) => probeRtsp(uri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS),
        });
        const vendorChannels = await discoverVendorRecorderChannels({
          manufacturer: device.manufacturer,
          model: device.model,
          host: endpoint.remoteAddress,
          credentials,
          existingChannels: channels.filter((channel) => channel.streamVerified).map((channel) => channel.sourceChannel),
          probeStream: (uri) => probeRtsp(uri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS),
        });
        const channelsByNumber = new Map(channels.map((channel) => [channel.sourceChannel, channel]));
        for (const vendorChannel of vendorChannels) {
          const current = channelsByNumber.get(vendorChannel.sourceChannel);
          if (!current?.streamVerified) channelsByNumber.set(vendorChannel.sourceChannel, vendorChannel);
        }
        channels = [...channelsByNumber.values()].sort((left, right) => left.sourceChannel - right.sourceChannel);
        activeRecorders.set(discoveredId, {
          id: discoveredId,
          name: `${device.manufacturer} ${device.model}`,
          deviceType: recorderType,
          vendor: recorderVendor,
          model: device.model,
          host: endpoint.remoteAddress,
          port: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
          secure: parsedServiceUrl.protocol === "https:",
          rtspPort: 554,
          username: credentials.username,
          password: credentials.password,
          ...(recorderVendor === "hikvision" || recorderVendor === "dahua" || recorderVendor === "cp-plus"
            ? {}
            : { systemPath: `${parsedServiceUrl.pathname}${parsedServiceUrl.search}` }),
        });
        await control.submitTelemetry(agentId, {
          branchId, edgeAgentId: agentId, deviceType: "recorder", deviceId: discoveredId,
          observedAt, source: "onvif", quality: "verified", idempotencyKey: `${agentId}:recorder-discovery:${discoveredId}:${observedAt}`,
          metrics: {
            name: `${device.manufacturer} ${device.model}`, deviceType: recorderType,
            vendor, model: device.model, serialNumber: device.serialNumber ?? "", firmwareVersion: device.firmwareVersion ?? "",
            ipAddress: endpoint.remoteAddress, protocol: "onvif", reachable: true, status: "online",
            totalCameras: channels.length || null,
            connectedCameras: channels.length ? channels.filter((channel) => channel.streamVerified).length : null,
            recordingStatus: "unknown",
          },
          reasonCodes: ["onvif_auto_discovered", "recorder_channels_enumerated", "recording_state_vendor_specific"],
        });
        submitted += 1;
        for (const channel of channels) {
          const channelFingerprint = createDeviceFingerprint({
            onvifEndpointReference: endpoint.endpointReference,
            manufacturer: device.manufacturer,
            model: device.model,
            ...(recorderSerialNumber ? { recorderSerialNumber } : {}),
            recorderChannel: channel.sourceChannel,
          });
          const usedVendorFallback = channel.reasonCodes.includes("vendor_adapter_fallback");
          const channelLayers: DiscoveryLayers = [
            ...baseDiscoveryLayers,
            {
              layer: "get-stream-uri",
              status: usedVendorFallback ? "fallback" : channel.primaryStreamUri ? "passed" : "failed",
              detail: usedVendorFallback
                ? "Recorder channel URI resolved with a vendor RTSP adapter"
                : channel.primaryStreamUri
                  ? "Recorder channel returned an RTSP URI"
                  : "Recorder channel did not return an RTSP URI",
            },
            {
              layer: "rtsp-verification",
              status: channel.streamVerified ? "passed" : "failed",
              detail: channel.streamVerified
                ? "Recorder channel video stream decoded successfully"
                : channel.probe?.error ?? "Recorder channel video stream could not be decoded",
            },
            {
              layer: "vendor-adapter",
              status: usedVendorFallback ? (channel.streamVerified ? "fallback" : "failed") : "skipped",
              detail: usedVendorFallback
                ? channel.streamVerified
                  ? "Vendor RTSP path recovered the recorder channel"
                  : "Vendor RTSP paths did not produce a reachable stream"
                : "ONVIF supplied the recorder channel URI",
            },
            {
              layer: "fingerprint",
              status: channelFingerprint ? "passed" : "failed",
              detail: channelFingerprint
                ? "Stable recorder-channel fingerprint generated without using its IP address"
                : "No stable recorder serial or ONVIF UUID was available",
            },
          ];
          const channelDiscovery = await control.submitDiscovery(branchId, {
            edgeAgentId: agentId,
            discoveryMethod: "nvr-dvr-channel-discovery",
            vendor,
            manufacturer: device.manufacturer,
            model: `${device.model} channel`,
            ipAddress: endpoint.remoteAddress,
            firmwareVersion: device.firmwareVersion,
            displayName: channel.name === `Channel ${channel.sourceChannel}`
              ? `${device.manufacturer} ${device.model} - Channel ${channel.sourceChannel}`
              : channel.name,
            credentialsRequired: channel.reasonCodes.includes("recorder_channel_credentials_rejected"),
            streamVerified: channel.streamVerified,
            rtspValidated: channel.streamVerified,
            compatibility: channel.streamVerified ? "compatible" : "review-required",
            duplicateStatus: "unique",
            compatibilityStatus: channel.streamVerified ? "compatible" : "review-required",
            onvifSupport: true,
            onvifServices: device.services,
            onvifCapabilityTests: device.capabilityTests,
            onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
            rtspPort: 554,
            profiles: (channel.profiles.length ? channel.profiles : [{
              name: "unverified", codec: "unknown" as const, width: 1, height: 1,
              role: "unknown" as const, preferredFor: [],
            }]).map((profile) => ({
              name: profile.name,
              codec: profile.codec,
              width: Math.max(1, channel.probe?.width ?? profile.width),
              height: Math.max(1, channel.probe?.height ?? profile.height),
              role: profile.role,
              preferredFor: profile.preferredFor,
            })),
            capabilities: device.capabilities,
            statusReason: channel.reasonCodes.join(",").slice(0, 200),
            ...(channelFingerprint ? { hardwareId: channelFingerprint } : {}),
            discoveryLayers: channelLayers,
            existingDeviceAssociation: discoveredId,
            sourceType: channel.sourceType,
            recorderId: discoveredId,
            recorderChannel: channel.sourceChannel,
            ...(recorderSerialNumber ? { recorderSerialNumber } : {}),
          });
          if (persistStreamSecrets && channel.primaryStreamUri) {
            await secrets.set(`edge://${agentId}/${channelDiscovery.id}`, channel.primaryStreamUri);
          }
          submitted += 1;
        }
        logger.info(`Auto-provisioned recorder ${device.manufacturer} ${device.model} as ${discoveredId}`, {
          channels: channels.length,
          verifiedChannels: channels.filter((channel) => channel.streamVerified).length,
        });
        continue;
      }
      const profiles: DiscoveredCameraPayload["profiles"] = [];
      let primarySourceUri: string | undefined;
      let streamVerified = false;
      let streamValidationError: string | undefined;
      let streamUriCount = 0;
      const streamUriErrors: string[] = [];
      for (const profile of device.profiles) {
        let result: Awaited<ReturnType<typeof probeRtsp>> | undefined;
        try {
          const uri = await client.getStreamUri(device.mediaServiceUrl, profile.token);
          streamUriCount += 1;
          const sourceUri = attachCredentials(uri, credentials);
          result = await probeRtsp(sourceUri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS);
          if (result.reachable) {
            primarySourceUri ??= sourceUri;
            streamVerified = true;
          } else {
            streamValidationError ??= result.error;
          }
        } catch (error) {
          const detail = errorMessage(error);
          streamUriErrors.push(detail);
          streamValidationError ??= detail;
        }
        profiles.push({
          name: profile.name,
          codec: profile.codec,
          width: Math.max(1, result?.width ?? profile.width),
          height: Math.max(1, result?.height ?? profile.height),
        });
      }
      const vendorFamily = identifyVendorFamily(device.manufacturer, device.model, ...discoveryKinds);
      const vendorFallback = !streamVerified
        ? await probeVendorStream({
            host: endpoint.remoteAddress,
            vendor: vendorFamily,
            credentials,
            probe: (uri) => probeRtsp(uri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS),
          })
        : undefined;
      if (vendorFallback?.candidate && vendorFallback.probe.reachable) {
        primarySourceUri = vendorFallback.candidate.uri;
        streamVerified = true;
        profiles.unshift({
          name: `Vendor ${vendorFallback.candidate.role}`,
          codec: discoveryCodec(vendorFallback.probe.codec),
          width: Math.max(1, vendorFallback.probe.width ?? 1),
          height: Math.max(1, vendorFallback.probe.height ?? 1),
        });
      }
      if (!profiles.length) profiles.push({ name: "unverified", codec: "unknown", width: 1, height: 1 });
      const deviceFingerprint = createDeviceFingerprint({
        onvifEndpointReference: endpoint.endpointReference,
        serialNumber: device.serialNumber,
        manufacturer: device.manufacturer,
        model: device.model,
      });
      const discoveryLayers: DiscoveryLayers = [
        ...baseDiscoveryLayers,
        {
          layer: "get-stream-uri",
          status: streamUriCount > 0 ? "passed" : "failed",
          detail: streamUriCount > 0
            ? `${streamUriCount} ONVIF profile URI(s) returned`
            : streamUriErrors[0] ?? "No ONVIF profile returned a stream URI",
        },
        {
          layer: "rtsp-verification",
          status: streamVerified ? "passed" : "failed",
          detail: streamVerified ? "A live RTSP video stream decoded successfully" : streamValidationError ?? vendorFallback?.probe?.error ?? "No live RTSP video stream decoded",
        },
        {
          layer: "vendor-adapter",
          status: vendorFallback ? (vendorFallback.candidate ? "fallback" : "failed") : "skipped",
          detail: vendorFallback
            ? vendorFallback.candidate
              ? `${vendorFamily} RTSP adapter supplied a working stream URI`
              : `${vendorFamily} RTSP adapter did not find a working stream URI`
            : "ONVIF and RTSP verification completed without vendor fallback",
        },
        {
          layer: "fingerprint",
          status: deviceFingerprint ? "passed" : "failed",
          detail: deviceFingerprint
            ? "Stable device fingerprint generated without using its IP address"
            : "No stable ONVIF UUID or trustworthy hardware serial was available",
        },
      ];
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
        ...(endpoint.endpointReference ? { onvifEndpointReference: endpoint.endpointReference } : {}),
        ...(deviceFingerprint ? { hardwareId: deviceFingerprint } : {}),
        displayName: `${device.manufacturer} ${device.model}`,
        credentialsRequired: streamUriErrors.some(isCredentialFailure),
        streamVerified,
        rtspValidated: streamVerified,
        compatibility: streamVerified ? "compatible" : "review-required",
        duplicateStatus: "unique",
        compatibilityStatus: streamVerified ? "compatible" : "review-required",
        onvifSupport: true,
        onvifServices: device.services,
        onvifCapabilityTests: [
          ...device.capabilityTests.filter((test) => test.name !== "RTSP URI" && test.name !== "GetStreamUri" && test.name !== "RTSP verification"),
          {
            name: "GetStreamUri",
            status: streamUriCount > 0 ? "pass" : "fail",
            detail: streamUriCount > 0 ? `${streamUriCount} URI(s) returned` : streamUriErrors[0] ?? "No URI returned",
          },
          {
            name: "RTSP verification",
            status: streamVerified ? "pass" : "fail",
            detail: streamVerified ? "Live video decoded" : streamValidationError ?? "Stream unavailable",
          },
        ],
        onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
        rtspPort: 554,
        profiles,
        capabilities: device.capabilities,
        discoveryLayers,
        ...(streamVerified ? {} : { statusReason: "rtsp_stream_unverified" }),
      });
      if (persistStreamSecrets && primarySourceUri) {
        await secrets.set(`edge://${agentId}/${discovery.id}`, primarySourceUri);
      }
      submitted += 1;
      logger.info(`Submitted ${device.manufacturer} ${device.model} as discovery ${discovery.id}`, {
        compatibility: compatibilityNotes(vendor),
        streamVerified,
        ...(streamValidationError ? { streamValidation: "failed" } : {}),
      });
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`Failed to inspect ${endpoint.remoteAddress}`, { error: message });
      try {
        const parsedServiceUrl = new URL(serviceUrl);
        const vendorFamily = identifyVendorFamily(...endpoint.scopes, ...endpoint.types);
        const vendorFallback = await probeVendorStream({
          host: endpoint.remoteAddress,
          vendor: vendorFamily,
          credentials,
          probe: (uri) => probeRtsp(uri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS),
        });
        const streamVerified = Boolean(vendorFallback.candidate && vendorFallback.probe.reachable);
        const deviceFingerprint = createDeviceFingerprint({ onvifEndpointReference: endpoint.endpointReference });
        const discovery = await control.submitDiscovery(branchId, {
          edgeAgentId: agentId,
          discoveryMethod: "onvif-ws-discovery",
          vendor: vendorFamily === "hikvision" ? "hikvision" : vendorFamily === "cp-plus" ? "cp-plus" : "other",
          manufacturer: vendorFamily === "generic" ? "ONVIF/RTSP" : vendorFamily,
          model: `Camera ${endpoint.remoteAddress}`,
          displayName: `Camera ${endpoint.remoteAddress}`,
          ipAddress: endpoint.remoteAddress,
          ...(endpoint.endpointReference ? { onvifEndpointReference: endpoint.endpointReference } : {}),
          ...(deviceFingerprint ? { hardwareId: deviceFingerprint } : {}),
          onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
          rtspPort: 554,
          onvifSupport: true,
          credentialsRequired: isCredentialFailure(message) || isCredentialFailure(vendorFallback.probe?.error),
          streamVerified,
          rtspValidated: streamVerified,
          compatibility: streamVerified ? "compatible" : "review-required",
          duplicateStatus: "unique",
          compatibilityStatus: streamVerified ? "compatible" : "review-required",
          statusReason: (streamVerified ? "onvif_failed_vendor_rtsp_verified" : message).slice(0, 200),
          profiles: [{
            name: vendorFallback.candidate ? `Vendor ${vendorFallback.candidate.role}` : "unverified",
            codec: discoveryCodec(vendorFallback.probe?.codec),
            width: Math.max(1, vendorFallback.probe?.width ?? 1),
            height: Math.max(1, vendorFallback.probe?.height ?? 1),
          }],
          capabilities: { ptz: false, audio: false, events: false },
          discoveryLayers: [
            { layer: "network-discovery", status: "passed", detail: "Camera host discovered on the branch network" },
            { layer: "onvif-discovery", status: "passed", detail: `${serviceUrls.length} ONVIF service candidate(s) were identified` },
            { layer: "onvif-authentication", status: "failed", detail: message.slice(0, 500) },
            { layer: "get-capabilities", status: "skipped", detail: "Skipped because ONVIF authentication did not complete" },
            { layer: "get-profiles", status: "skipped", detail: "Skipped because ONVIF authentication did not complete" },
            { layer: "get-stream-uri", status: "skipped", detail: "Skipped because ONVIF media profiles were unavailable" },
            {
              layer: "rtsp-verification",
              status: streamVerified ? "passed" : "failed",
              detail: streamVerified ? "Vendor RTSP stream decoded successfully" : vendorFallback.probe?.error ?? "No RTSP stream decoded",
            },
            {
              layer: "vendor-adapter",
              status: streamVerified ? "fallback" : "failed",
              detail: streamVerified ? `${vendorFamily} RTSP adapter recovered the camera` : `${vendorFamily} RTSP paths did not respond`,
            },
            {
              layer: "fingerprint",
              status: deviceFingerprint ? "passed" : "failed",
              detail: deviceFingerprint ? "Stable ONVIF UUID fingerprint generated" : "No stable hardware identity was advertised",
            },
          ],
        });
        if (persistStreamSecrets && streamVerified && vendorFallback.candidate) {
          await secrets.set(`edge://${agentId}/${discovery.id}`, vendorFallback.candidate.uri);
        }
        submitted += 1;
      } catch (submissionError) {
        logger.error(`Failed to report ${endpoint.remoteAddress}`, { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
      }
    }
  }
  if (config.RTSP_SCAN_ENABLED) {
    try {
      const ports = String(config.RTSP_SCAN_PORTS).split(",").map((p) => Number(p.trim())).filter(Boolean);
      const paths = String(config.RTSP_SCAN_PATHS).split(",").map((p) => p.trim()).filter(Boolean);
      const cidr = config.RTSP_SCAN_CIDR ? String(config.RTSP_SCAN_CIDR).trim() : undefined;
      const vpnScanNetworks = cidr ? [] : await dbCredentialProvider.getVpnScanNetworks().catch((error) => {
        logger.warn("Unable to load VPN scan networks from the control plane", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      });
      const knownHosts = await dbCredentialProvider.getKnownHosts().catch((error) => {
        logger.warn("Unable to load saved camera addresses from the control plane", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      });
      const options = {
        ports,
        paths,
        ffprobePath: config.FFPROBE_PATH,
        timeoutMs: config.RTSP_SCAN_TIMEOUT_MS,
        concurrency: config.RTSP_SCAN_CONCURRENCY,
        username: "",
        password: "",
        credentialsForHost: (host: string) => dbCredentialProvider.get(host).catch(() => undefined),
        hosts: knownHosts,
        excludeHosts: endpoints.map((endpoint) => endpoint.remoteAddress),
      } satisfies Omit<import("./discovery/rtsp-network-scan.js").RtspScanOptions, "cidr" | "cidrs">;
      if (cidr) {
        (options as import("./discovery/rtsp-network-scan.js").RtspScanOptions).cidr = cidr;
      } else if (vpnScanNetworks.length > 0) {
        (options as import("./discovery/rtsp-network-scan.js").RtspScanOptions).cidrs = vpnScanNetworks;
      }
      const added = await discoverRtspDevices(branchId, agentId, options as import("./discovery/rtsp-network-scan.js").RtspScanOptions, control, secrets, persistStreamSecrets);
      submitted += added;
      logger.info("RTSP network scan completed", { discovered: added });
    } catch (error) {
      logger.error("RTSP network scan failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return submitted;
}

type DiscoveryLayers = NonNullable<DiscoveredCameraPayload["discoveryLayers"]>;

function knownValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && !/^(unknown|n\/a|none|null|0+)$/i.test(normalized) ? normalized : undefined;
}

function discoveryCodec(value: string | null | undefined): DiscoveredCameraPayload["profiles"][number]["codec"] {
  const normalized = value?.toUpperCase();
  if (normalized === "H264" || normalized === "H265" || normalized === "MJPEG") return normalized;
  return "unknown";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isCredentialFailure(value: string | null | undefined) {
  return /401|403|unauthori|forbidden|credential|authentication|digest|ws-security/i.test(value ?? "");
}

async function runAutomaticDiscovery() {
  // Set the timestamp before scanning so a failed/slow branch cannot create a
  // tight retry loop. Credential updates and explicit scan jobs still trigger
  // immediate rediscovery outside this schedule.
  lastDiscoveryAt = Date.now();
  try {
    const discovered = await scanBranch();
    logger.info("Automatic ONVIF discovery completed", { discovered });
  } catch (error) {
    logger.error("Automatic ONVIF discovery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
        liveMediaEnabled: config.LIVE_MEDIA_ENABLED,
        mediaRuntimeReady: Boolean(edgeMediaRuntime),
        mediaTunnelMode: config.MEDIA_TUNNEL_MODE,
        publicMediaUrl: edgeMediaRuntime?.publicUrl ?? config.PUBLIC_MEDIA_GATEWAY_URL ?? null,
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
  const channelsByRecorder = new Map<string, Array<{ cameraId: string; channel: number }>>();
  for (const camera of cameras) {
    if (!camera.recorderId || !camera.recorderChannel) continue;
    const channels = channelsByRecorder.get(camera.recorderId) ?? [];
    channels.push({ cameraId: camera.id, channel: camera.recorderChannel });
    channelsByRecorder.set(camera.recorderId, channels);
  }
  for (const [recorderId, channels] of channelsByRecorder) {
    const recorder = activeRecorders.get(recorderId);
    if (!recorder) continue;
    recorder.archiveRetention = recorder.archiveRetention ?? {
      lookbackDays: 1,
      maxResults: 1_000,
      continuityGapSeconds: 300,
      verifyPlayback: true,
      channels,
    };
    recorder.archiveRetention.channels = channels;
  }
  lastCameraConfigSyncAt = Date.now();
}

async function collectRecorderReports(observedAt: string, includeArchive: boolean) {
  return Promise.all([...activeRecorders.values()].map(async (recorder) => {
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
        const decodedFrame = playback.reachable
          ? await captureRtspRgbFrame(uri, config.FFMPEG_PATH, config.RECORDER_PROBE_TIMEOUT_MS)
          : null;
        evidence.playbackFrameDecoded = Boolean(decodedFrame);
        evidence.playbackVerified = playback.reachable && Boolean(decodedFrame);
        evidence.playbackCodec = playback.codec;
        if (evidence.playbackVerified) evidence.reasonCodes.push("latest_clip_playback_verified", "latest_clip_frame_decoded");
        else {
          evidence.playbackError = playback.reachable
            ? "playback_frame_decode_failed"
            : playback.error?.slice(0, 300) ?? "playback_failed";
          evidence.reasonCodes.push(playback.reachable ? "latest_clip_frame_decode_failed" : "latest_clip_playback_failed");
        }
      }
    }
    return { recorder: resolvedRecorder, observedAt, probe };
  }));
}

async function executeEdgeCommand(type: string, payload: Record<string, unknown>) {
  switch (type) {
    case "rediscover":
      dbCredentialProvider.invalidate();
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
    case "recover-camera": {
      const cameraId = typeof payload.cameraId === "string" ? payload.cameraId : "";
      if (!cameraId) throw new Error("cameraId_required");
      return { result: await recoverCameraAtEdge(cameraId, "operator") };
    }
    case "probe-recorder": {
      const recorderId = typeof payload.recorderId === "string" ? payload.recorderId : "";
      const recorder = activeRecorders.get(recorderId);
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
        username?: unknown; password?: unknown; scope?: { host?: unknown };
      }>(envelope, identity.commandPrivateKey);
      if (typeof decrypted.username !== "string" || !decrypted.username ||
          typeof decrypted.password !== "string" || !decrypted.scope ||
          typeof decrypted.scope.host !== "string" || !decrypted.scope.host) {
        throw new Error("invalid_camera_credential_payload");
      }
      const saved = await credentialVault.set({
        username: decrypted.username,
        password: decrypted.password,
        host: decrypted.scope.host,
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

async function recoverCameraAtEdge(cameraId: string, trigger: "automatic" | "operator", consecutiveFailures?: number) {
  const camera = (await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION))
    .find((item) => item.id === cameraId);
  const source = camera ? secrets.get(camera.connectionSecretRef) : undefined;
  if (!camera || !source) throw new Error("camera_stream_secret_unavailable");

  const startedAt = new Date().toISOString();
  await control.submitTelemetry(agentId, {
    branchId,
    edgeAgentId: agentId,
    deviceType: "camera",
    deviceId: cameraId,
    observedAt: startedAt,
    source: "rtsp",
    quality: "verified",
    idempotencyKey: `${agentId}:camera-recovery:${cameraId}:${startedAt}:started`,
    metrics: {
      status: "offline",
      recoveryInProgress: true,
      currentRecoveryAction: "edge_agent_safe_recovery",
      recoveryTrigger: trigger,
      ...(consecutiveFailures === undefined ? {} : { consecutiveFailures }),
    },
    reasonCodes: ["camera_recovery_started"],
  });

  const recovery = await recoverCamera({
    cameraId,
    rtspUrl: source,
    onvifDeviceServiceUrls: configuredOnvifEndpointsFor(source),
    allowOnvif: camera.sourceType === undefined || camera.sourceType === "ip-camera",
  }, {
    ffprobePath: config.FFPROBE_PATH,
    timeoutMs: config.ONVIF_TIMEOUT_MS,
  });
  await control.submitTelemetry(agentId, {
    branchId,
    edgeAgentId: agentId,
    deviceType: "camera",
    deviceId: cameraId,
    observedAt: recovery.completedAt,
    source: "rtsp",
    quality: "verified",
    idempotencyKey: `${agentId}:camera-recovery:${cameraId}:${recovery.startedAt}:completed`,
    metrics: {
      status: recovery.recovered ? "online" : "offline",
      recoveryInProgress: false,
      recoverySucceeded: recovery.recovered,
      recoveryTrigger: trigger,
      recoverySteps: recovery.steps.length,
    },
    reasonCodes: recovery.reasonCodes,
  });
  return recovery;
}

function configuredOnvifEndpointsFor(source: string) {
  let sourceHost = "";
  try { sourceHost = new URL(source).hostname; }
  catch { return []; }
  return config.ONVIF_ENDPOINTS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try { return new URL(value).hostname === sourceHost; }
      catch { return false; }
    });
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
