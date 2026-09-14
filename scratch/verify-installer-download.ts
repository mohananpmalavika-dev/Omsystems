import Fastify from "fastify";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerEdgeAgentPackageRoutes } from "../src/routes/edge-agent-package.routes.js";

process.env.NODE_ENV = "production";
const app = Fastify();
app.addHook("onRequest", async (request) => {
  request.currentUser = { id: "installer-smoke-test" } as typeof request.currentUser;
});
await registerEdgeAgentPackageRoutes(app, {
  getNode: async () => ({ id: "test-branch", type: "branch", name: "Download Verification", tenantId: "test" }),
  checkAccess: async () => ({ allowed: true }),
  getActiveEdgeActivation: async () => ({ agentName: "Download Verification" }),
  writeAudit: async () => {},
} as never, { artifactRoot: resolve("edge-agent"), controlPlanePublicUrl: "https://example.invalid" });
try {
  const start = performance.now();
  const response = await app.inject({ method: "POST", url: "/v1/branches/test-branch/edge-agent-installer", payload: {
    activationId: "00000000-0000-4000-8000-000000000104", activationCode: `sgact_${"a".repeat(48)}`, agentName: "Download Verification",
  } });
  if (response.statusCode !== 200) throw new Error(response.body);
  await writeFile("scratch/installer-verified.zip", response.rawPayload);
  console.log(JSON.stringify({ status: response.statusCode, bytes: response.rawPayload.length, milliseconds: Math.round(performance.now() - start), sha256: createHash("sha256").update(response.rawPayload).digest("hex") }));
} finally { await app.close(); }
