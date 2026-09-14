import Fastify from "/app/node_modules/fastify/fastify.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerEdgeAgentPackageRoutes } from "/app/dist/src/routes/edge-agent-package.routes.js";

const app = Fastify();
app.addHook("onRequest", async request => { request.currentUser = { id: "isolated-installer-check" }; });
await registerEdgeAgentPackageRoutes(app, {
  getNode: async () => ({ id: "test", type: "branch", name: "Installer Verification", tenantId: "test" }),
  checkAccess: async () => ({ allowed: true }),
  getActiveEdgeActivation: async () => ({ agentName: "Installer Verification" }),
  writeAudit: async () => {},
}, { artifactRoot: "/app/edge-agent", controlPlanePublicUrl: "https://example.invalid" });
try {
  const start = performance.now();
  const response = await app.inject({ method: "POST", url: "/v1/branches/test/edge-agent-installer", payload: {
    activationId: "00000000-0000-4000-8000-000000000104", activationCode: `sgact_${"a".repeat(48)}`, agentName: "Installer Verification",
  } });
  if (response.statusCode !== 200) throw new Error(response.body);
  const zip = response.rawPayload;
  if (zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt16LE(8) !== 0) throw new Error("Invalid ZIP executable entry");
  const startOfExe = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  const exe = zip.subarray(startOfExe, startOfExe + zip.readUInt32LE(18));
  const manifest = JSON.parse(await readFile("/app/edge-agent/release/windows-release.json", "utf8"));
  if (createHash("sha256").update(exe).digest("hex") !== manifest.sha256) throw new Error("Packaged executable checksum mismatch");
  console.log(JSON.stringify({ verified: true, status: response.statusCode, bytes: zip.length, milliseconds: Math.round(performance.now() - start), signing: manifest.signing }));
} finally { await app.close(); }
