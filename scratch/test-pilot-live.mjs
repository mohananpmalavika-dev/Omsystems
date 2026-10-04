import fetch from "node-fetch";

const cameraId = "0494e750-b4b2-49a6-9dbc-9d97a086df1f";
const agentId = "aaeda07f-01ce-4361-afd3-a54e4ca114f3";
const relayBase = `https://34-14-220-41.sslip.io/v1/edge-media/${agentId}`;

async function main() {
  console.log("1. Requesting live session from dashboard /api/live...");
  const dashRes = await fetch("https://34-14-220-41.sslip.io/api/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cameraId, profile: "sub", routePreference: "auto" }),
  });
  console.log("Dashboard response status:", dashRes.status);
  const dashData = await dashRes.json();
  console.log("Dashboard response body:", dashData);

  if (dashData.direct) {
    console.log("2. Attempting direct URL:", dashData.direct.url);
    try {
      const dirRes = await fetch(dashData.direct.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controlPlaneToken: dashData.direct.controlPlaneToken }),
      });
      console.log("Direct start status:", dirRes.status);
      const dirData = await dirRes.json();
      console.log("Direct start body:", dirData);
    } catch (e) {
      console.error("Direct start failed:", e.message);
    }
  }

  console.log("3. Testing with routePreference=public...");
  const pubRes = await fetch("https://34-14-220-41.sslip.io/api/live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cameraId, profile: "sub", routePreference: "public" }),
  });
  console.log("Public route status:", pubRes.status);
  const pubData = await pubRes.json();
  console.log("Public route body:", pubData);
}

main().catch(console.error);
