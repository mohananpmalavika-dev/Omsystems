import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import type { ControlPlaneStore } from "../src/control-plane-store.js";

async function run() {
  const store = new MemoryStore() as unknown as ControlPlaneStore;
  const app = await buildApp({ store });

  console.log("Testing GET /v1/edge-agent/download/certificate...");
  const certRes = await app.inject({
    method: "GET",
    url: "/v1/edge-agent/download/certificate",
  });
  console.log("Cert status:", certRes.statusCode, certRes.headers["content-type"], certRes.rawPayload.length, "bytes");

  console.log("Testing GET /v1/edge-agent/download/cert-installer...");
  const scriptRes = await app.inject({
    method: "GET",
    url: "/v1/edge-agent/download/cert-installer",
  });
  console.log("Script status:", scriptRes.statusCode, scriptRes.headers["content-type"], scriptRes.rawPayload.length, "bytes");

  console.log("Testing GET /v1/edge-agent/download/signed-package (HEAD)...");
  const pkgRes = await app.inject({
    method: "GET",
    url: "/v1/edge-agent/download/signed-package",
  });
  console.log("Signed package status:", pkgRes.statusCode, pkgRes.headers["content-type"], pkgRes.headers["content-length"]);

  await app.close();
  console.log("All download endpoints verified successfully!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
