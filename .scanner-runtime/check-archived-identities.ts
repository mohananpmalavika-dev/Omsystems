import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DeviceIdentityStore } from "../edge-agent/src/security/device-identity.js";
import { GatewayClient } from "../edge-agent/src/registration/gateway-client.js";

const archiveRoot = "C:/Program Files/KryptonVision/Edge Agent/data/identity-archive";
const controlPlaneUrl = "https://sentinel-grid-control-plane-zcli.onrender.com";
const directories = (await readdir(archiveRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .reverse();

const results: Array<Record<string, unknown>> = [];
for (const directory of directories) {
  const root = join(archiveRoot, directory);
  const identity = await new DeviceIdentityStore(
    join(root, "device-identity.enc"),
    join(root, "device-identity.key"),
  ).load().catch(() => undefined);
  if (!identity) {
    results.push({ archive: directory, readable: false, valid: false });
    continue;
  }

  const gateway = new GatewayClient(controlPlaneUrl);
  gateway.useEdgeCredential(identity.credential);
  try {
    await gateway.heartbeat(identity.agentId, "0.1.2");
    results.push({
      archive: directory,
      readable: true,
      valid: true,
      agentId: identity.agentId,
      branchId: identity.branchId,
    });
  } catch (error) {
    results.push({
      archive: directory,
      readable: true,
      valid: false,
      agentId: identity.agentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

process.stdout.write(JSON.stringify(results, null, 2));
