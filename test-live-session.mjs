// Test live session creation flow
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane-zcli.onrender.com";
const MEDIA_GATEWAY_URL = "https://sentinel-grid-media-gateway-ogqi.onrender.com";
const EDGE_BRIDGE_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";
const CAMERA_ID = "your-camera-id"; // Replace with actual camera ID
const USER_ID = "00000000-0000-4000-8000-000000000001";

console.log("🔍 Testing Live Session Flow\n");

// Step 1: Create live session token
console.log("Step 1: Creating live session from control plane...");
try {
  const sessionResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/cameras/${CAMERA_ID}/live-sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": USER_ID,
      },
      body: "{}",
    }
  );

  if (!sessionResponse.ok) {
    const error = await sessionResponse.text();
    console.error(`❌ Failed to create session: ${sessionResponse.status}`);
    console.error(`Response: ${error}`);
    process.exit(1);
  }

  const session = await sessionResponse.json();
  console.log(`✅ Session created: ${session.id}`);
  console.log(`Token: ${session.token.substring(0, 20)}...`);
  console.log(`Media Gateway URL: ${session.mediaGatewayUrl || "not provided"}`);
  console.log(`Expires at: ${session.expiresAt}`);

  // Step 2: Start live stream on media gateway
  console.log("\nStep 2: Starting live stream on media gateway...");
  const mediaUrl = session.mediaGatewayUrl || MEDIA_GATEWAY_URL;
  
  const startResponse = await fetch(`${mediaUrl}/v1/live/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-bridge-key": EDGE_BRIDGE_KEY,
    },
    body: JSON.stringify({
      controlPlaneToken: session.token,
    }),
  });

  if (!startResponse.ok) {
    const error = await startResponse.text();
    console.error(`❌ Failed to start stream: ${startResponse.status}`);
    console.error(`Response: ${error}`);
    
    // Check if media gateway is healthy
    console.log("\nChecking media gateway health...");
    const healthResponse = await fetch(`${MEDIA_GATEWAY_URL}/health`);
    const health = await healthResponse.json();
    console.log("Health:", health);
    
    process.exit(1);
  }

  const streamInfo = await startResponse.json();
  console.log(`✅ Stream started!`);
  console.log(`Session ID: ${streamInfo.sessionId}`);
  console.log(`HLS URL: ${streamInfo.hlsUrl}`);
  console.log(`MediaMTX Path: ${streamInfo.mediamtxPath}`);

  console.log("\n🎉 Live session test PASSED!");
  console.log(`\nYou can test the stream in a browser:`);
  console.log(`${streamInfo.hlsUrl}`);

} catch (error) {
  console.error("\n❌ Test failed with error:", error.message);
  process.exit(1);
}
