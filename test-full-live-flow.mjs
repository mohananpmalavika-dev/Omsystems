// Test the complete live session flow
import { createHash } from "node:crypto";

const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane-zcli.onrender.com";
const MEDIA_GATEWAY_URL = "https://sentinel-grid-media-gateway-ogqi.onrender.com";
const EDGE_BRIDGE_SHARED_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const BRANCH_ID = "00000000-0000-4000-8000-000000000104";

async function testFullFlow() {
  console.log("=== Testing Complete Live Session Flow ===\n");
  
  // Step 1: Get list of cameras
  console.log("Step 1: Fetching cameras from branch...");
  const camerasResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/branches/${BRANCH_ID}/cameras`,
    {
      headers: {
        "x-user-id": DEV_USER_ID,
      },
    },
  );
  
  if (!camerasResponse.ok) {
    console.error("Failed to fetch cameras:", await camerasResponse.text());
    return;
  }
  
  const camerasData = await camerasResponse.json();
  console.log(`Found ${camerasData.data?.length || 0} camera(s)`);
  
  if (!camerasData.data || camerasData.data.length === 0) {
    console.log("\n❌ No cameras found! You need to:");
    console.log("1. Run the scanner to discover cameras");
    console.log("2. Approve discovered cameras in the dashboard");
    return;
  }
  
  const camera = camerasData.data[0];
  console.log(`\nUsing camera: ${camera.name} (${camera.id})`);
  console.log(`Connection secret: ${camera.connectionSecretRef}`);
  console.log(`Status: ${camera.status}`);
  
  // Step 2: Create live session
  console.log("\nStep 2: Creating live session...");
  const sessionResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/cameras/${camera.id}/live-sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": DEV_USER_ID,
      },
      body: "{}",
    },
  );
  
  if (!sessionResponse.ok) {
    console.error("Failed to create session:", await sessionResponse.text());
    return;
  }
  
  const session = await sessionResponse.json();
  console.log(`Session created: ${session.id}`);
  console.log(`Token length: ${session.token.length}`);
  console.log(`Media gateway URL: ${session.mediaGatewayUrl || "not set"}`);
  console.log(`Expires at: ${session.expiresAt}`);
  
  // Step 3: Start live stream on media gateway
  console.log("\nStep 3: Starting stream on media gateway...");
  const gatewayUrl = session.mediaGatewayUrl || MEDIA_GATEWAY_URL;
  console.log(`Calling: ${gatewayUrl}/v1/live/start`);
  
  const streamResponse = await fetch(
    `${gatewayUrl}/v1/live/start`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY,
      },
      body: JSON.stringify({
        controlPlaneToken: session.token,
      }),
    },
  );
  
  console.log(`Response status: ${streamResponse.status}`);
  const streamData = await streamResponse.text();
  
  if (!streamResponse.ok) {
    console.log(`\n❌ Media gateway error: ${streamData}`);
    
    // Try to parse error details
    try {
      const error = JSON.parse(streamData);
      console.log("\nError details:", error);
      
      if (error.error === "stream_secret_unavailable") {
        console.log("\n🔍 The issue is: Camera connection secret cannot be resolved");
        console.log("This usually means:");
        console.log("1. The connection secret reference is invalid");
        console.log("2. The stream secret provider is not accessible");
        console.log("3. The camera is not actually streaming to the media gateway");
        console.log(`\nCamera secret ref: ${camera.connectionSecretRef}`);
      }
    } catch {
      console.log("Could not parse error:", streamData);
    }
  } else {
    console.log("\n✅ Stream started successfully!");
    const stream = JSON.parse(streamData);
    console.log("Stream details:", JSON.stringify(stream, null, 2));
  }
}

testFullFlow().catch(console.error);
