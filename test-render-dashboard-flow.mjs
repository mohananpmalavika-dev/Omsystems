// Test live streaming exactly as Render dashboard does it
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane-zcli.onrender.com";
const EDGE_BRIDGE_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";
const MEDIA_GATEWAY_URL = "https://apnic-deserve-evans-yarn.trycloudflare.com";
const CAMERA_ID = "e3d027f8-9c42-4c8b-bbf2-39c91eb756fb";

// Simulate what the dashboard does
console.log("🎬 Simulating Render Dashboard Live Streaming Flow");
console.log("=" .repeat(60));
console.log(`Camera ID: ${CAMERA_ID}`);
console.log(`Control Plane: ${CONTROL_PLANE_URL}`);
console.log(`Media Gateway: ${MEDIA_GATEWAY_URL}\n`);

// Step 1: Login to get session token (simulating user login)
console.log("📝 Step 1: Getting admin session token...");
try {
  const loginResponse = await fetch(`${CONTROL_PLANE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@sentinel.local",
      password: "admin123",
    }),
  });

  if (!loginResponse.ok) {
    console.error(`❌ Login failed: ${loginResponse.status}`);
    const error = await loginResponse.text();
    console.error(error);
    process.exit(1);
  }

  const loginData = await loginResponse.json();
  const sessionToken = loginData.token;
  console.log(`✅ Logged in successfully`);
  console.log(`   Token: ${sessionToken.substring(0, 30)}...\n`);

  // Step 2: Request live session from control plane (what dashboard does)
  console.log("📡 Step 2: Requesting live session from control plane...");
  const controlResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/cameras/${CAMERA_ID}/live-sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${sessionToken}`,
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
      body: "{}",
    }
  );

  console.log(`   Status: ${controlResponse.status}`);

  if (!controlResponse.ok) {
    const errorText = await controlResponse.text();
    console.error(`   ❌ Control plane error: ${errorText}`);
    process.exit(1);
  }

  const controlSession = await controlResponse.json();
  console.log(`   ✅ Control session created`);
  console.log(`   Token: ${controlSession.token?.substring(0, 20)}...`);
  console.log(`   Returned media gateway: ${controlSession.mediaGatewayUrl || "(none - using env default)"}\n`);

  // Step 3: Start live stream on media gateway (what dashboard does)
  const gatewayUrl = controlSession.mediaGatewayUrl || MEDIA_GATEWAY_URL;
  console.log("📹 Step 3: Starting live stream on media gateway...");
  console.log(`   Using gateway: ${gatewayUrl}`);

  const mediaResponse = await fetch(
    `${gatewayUrl}/v1/live/start`,
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
    console.error(`   ❌ Media gateway error: ${errorText}`);
    
    // Try health check
    console.log(`\n🔍 Checking media gateway health...`);
    try {
      const health = await fetch(`${gatewayUrl}/health`);
      console.log(`   Health: ${health.status} - ${await health.text()}`);
    } catch (err) {
      console.log(`   Health check failed: ${err.message}`);
    }
    
    process.exit(1);
  }

  const liveSession = await mediaResponse.json();
  console.log(`   ✅ Live stream started!\n`);

  console.log("📺 Stream Information:");
  console.log("=" .repeat(60));
  console.log(`HLS URL: ${liveSession.hlsUrl}`);
  if (liveSession.webRtcUrl) {
    console.log(`WebRTC URL: ${liveSession.webRtcUrl}`);
  }
  console.log(`Expires: ${new Date(liveSession.expiresAt).toLocaleString()}`);
  console.log(`Session ID: ${liveSession.sessionId || "(not provided)"}`);

  console.log(`\n🎉 SUCCESS! The Render dashboard should now be able to stream!`);
  console.log(`\nTest the stream URL in VLC or browser:`);
  console.log(`${liveSession.hlsUrl}`);

} catch (error) {
  console.error(`\n❌ Fatal Error: ${error.message}`);
  if (error.cause) {
    console.error(`   Cause: ${error.cause.message}`);
  }
  console.error(error.stack);
  process.exit(1);
}
