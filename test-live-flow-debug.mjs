// Test the complete live streaming flow with debug info
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane-zcli.onrender.com";
const EDGE_BRIDGE_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";
const CAMERA_ID = "e3d027f8-9c42-4c8b-bbf2-39c91eb756fb"; // Your camera ID
const SESSION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiZ2xvYmFsX2FkbWluIiwiaWF0IjoxNzM4NDMyNzQ5fQ.v7s1KXP_E1WmOOL7zCJVx3Aw4dxiW5XMCeQzRBTfCmc"; // Your session token

console.log("🔍 Testing Complete Live Streaming Flow\n");
console.log("=" .repeat(60));

// Step 1: Request live session from control plane
console.log("\n📡 Step 1: Requesting live session from control plane...");
console.log(`   Camera ID: ${CAMERA_ID}`);
console.log(`   URL: ${CONTROL_PLANE_URL}/v1/cameras/${CAMERA_ID}/live-sessions`);

try {
  const controlResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/cameras/${CAMERA_ID}/live-sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${SESSION_TOKEN}`,
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
      body: "{}",
    }
  );

  console.log(`   Status: ${controlResponse.status}`);

  if (!controlResponse.ok) {
    const errorText = await controlResponse.text();
    console.error(`   ❌ Error: ${errorText}`);
    process.exit(1);
  }

  const controlSession = await controlResponse.json();
  console.log(`   ✅ Control session created`);
  console.log(`   Token: ${controlSession.token?.substring(0, 20)}...`);
  console.log(`   Media Gateway URL: ${controlSession.mediaGatewayUrl || "(not specified - will use default)"}`);

  // Step 2: Start live stream on media gateway
  const mediaGatewayUrl = controlSession.mediaGatewayUrl || "http://localhost:8090";
  console.log(`\n📹 Step 2: Starting live stream on media gateway...`);
  console.log(`   Gateway URL: ${mediaGatewayUrl}`);
  console.log(`   Endpoint: ${mediaGatewayUrl}/v1/live/start`);

  const mediaResponse = await fetch(
    `${mediaGatewayUrl}/v1/live/start`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
      body: JSON.stringify({ controlPlaneToken: controlSession.token }),
    }
  );

  console.log(`   Status: ${mediaResponse.status}`);

  if (!mediaResponse.ok) {
    const errorText = await mediaResponse.text();
    console.error(`   ❌ Error: ${errorText}`);
    
    // Additional debugging
    console.log(`\n🔍 Debugging Info:`);
    console.log(`   - Is media gateway reachable?`);
    try {
      const healthCheck = await fetch(`${mediaGatewayUrl}/health`);
      console.log(`   - Health check: ${healthCheck.status} ${await healthCheck.text()}`);
    } catch (err) {
      console.log(`   - Health check failed: ${err.message}`);
    }
    
    process.exit(1);
  }

  const liveSession = await mediaResponse.json();
  console.log(`   ✅ Live stream started!`);
  console.log(`\n📺 Stream Details:`);
  console.log(`   HLS URL: ${liveSession.hlsUrl}`);
  if (liveSession.webRtcUrl) {
    console.log(`   WebRTC URL: ${liveSession.webRtcUrl}`);
  }
  console.log(`   Expires: ${new Date(liveSession.expiresAt).toLocaleString()}`);

  console.log(`\n🎉 SUCCESS! Live streaming is working!`);
  console.log(`\nYou can test the stream by opening this URL in VLC or a browser:`);
  console.log(`${liveSession.hlsUrl}`);

} catch (error) {
  console.error(`\n❌ Fatal Error: ${error.message}`);
  if (error.cause) {
    console.error(`   Cause: ${error.cause.message}`);
  }
  process.exit(1);
}
