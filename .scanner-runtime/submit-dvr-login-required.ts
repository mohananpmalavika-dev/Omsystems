import { DeviceIdentityStore } from "../../tmp/sentinel-grid-publish-virtual-scan/edge-agent/src/security/device-identity.ts";
import { GatewayClient } from "../../tmp/sentinel-grid-publish-virtual-scan/edge-agent/src/registration/gateway-client.ts";

const identity = await new DeviceIdentityStore(
  "C:/Program Files/Sentinel Grid/Edge Agent/data/device-identity.enc",
  "C:/Program Files/Sentinel Grid/Edge Agent/data/device-identity.key",
).load();

if (!identity) throw new Error("scanner_identity_missing");

const gateway = new GatewayClient(
  "https://sentinel-grid-monitoring1.onrender.com/api/control",
  undefined,
);
gateway.useEdgeCredential(identity.credential);

const discovery = await gateway.submitDiscovery(identity.branchId, {
  edgeAgentId: identity.agentId,
  discoveryMethod: "edge-agent-reported-inventory",
  vendor: "cp-plus",
  manufacturer: "CP PLUS",
  model: "CPPLUS DVR - Web View",
  ipAddress: "192.168.29.171",
  onvifSupport: false,
  onvifPort: 80,
  rtspPort: 554,
  displayName: "CP PLUS DVR 192.168.29.171",
  statusReason: "recorder_credentials_required",
  credentialsRequired: true,
  streamVerified: false,
  rtspValidated: false,
  compatibility: "review-required",
  duplicateStatus: "unique",
  compatibilityStatus: "review-required",
  profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
  capabilities: { ptz: false, audio: false, events: false },
});

process.stdout.write(JSON.stringify({
  submitted: true,
  discoveryId: discovery.id,
  branchId: identity.branchId,
  edgeAgentId: identity.agentId,
  ipAddress: "192.168.29.171",
  credentialsRequired: true,
}, null, 2));
