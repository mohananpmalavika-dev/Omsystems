import { DeviceIdentityStore } from "../edge-agent/src/security/device-identity.js";

const store = new DeviceIdentityStore(
  "C:\\Program Files\\Sentinel Grid\\Edge Agent\\data\\device-identity.enc",
  "C:\\Program Files\\Sentinel Grid\\Edge Agent\\data\\device-identity.key",
);
const identity = await store.load();
if (!identity) throw new Error("installed_identity_unavailable");
const response = await fetch(
  `https://sentinel-grid-monitoring1.onrender.com/api/control/v1/edge-agents/${encodeURIComponent(identity.agentId)}/heartbeat`,
  {
    method: "POST",
    headers: { "content-type": "application/json", "x-edge-agent-token": identity.credential },
    body: JSON.stringify({ version: "0.1.4", publicMediaUrl: "auto" }),
  },
);
const body = await response.json().catch(() => ({})) as { error?: unknown };
process.stdout.write(JSON.stringify({ status: response.status, error: typeof body.error === "string" ? body.error : null }));
