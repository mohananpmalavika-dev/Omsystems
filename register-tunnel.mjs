// Register tunnel URL with control plane
const EDGE_AGENT_ID = "6a570d4a-2c71-415f-b59a-643cf50d55c5";
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane-ocn1.onrender.com";
const EDGE_BRIDGE_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";
const TUNNEL_URL = process.argv[2];

if (!TUNNEL_URL) {
  console.error("Usage: node register-tunnel.mjs <tunnel-url>");
  console.error("Example: node register-tunnel.mjs https://apnic-deserve-evans-yarn.trycloudflare.com");
  process.exit(1);
}

console.log(`Registering tunnel URL: ${TUNNEL_URL}\n`);

try {
  // Send heartbeat with tunnel URL
  const response = await fetch(
    `${CONTROL_PLANE_URL}/v1/edge-agents/${EDGE_AGENT_ID}/heartbeat`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
      body: JSON.stringify({
        version: "0.1.0",
        publicMediaUrl: TUNNEL_URL,
      }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    console.log("✅ Tunnel URL registered successfully!");
    console.log(`   Status: ${data.status}`);
    console.log(`   Public Media URL: ${data.publicMediaUrl}`);
    console.log(`   Last seen: ${data.lastSeenAt}\n`);
    console.log("🎉 Edge agent is now accessible from anywhere!");
    console.log(`\nNext steps:`);
    console.log(`1. Update Render dashboard environment variable:`);
    console.log(`   MEDIA_GATEWAY_INTERNAL_URL=${TUNNEL_URL}`);
    console.log(`2. Restart the dashboard on Render`);
    console.log(`3. Test live streaming from https://sentinel-grid-monitoring-vhid.onrender.com`);
  } else {
    const error = await response.text();
    console.error("❌ Failed to register tunnel URL:", error);
    process.exit(1);
  }
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
