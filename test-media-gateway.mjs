// Test media gateway connection
const MEDIA_GATEWAY_URL = "https://sentinel-grid-media-gateway1.onrender.com";
const EDGE_BRIDGE_SHARED_KEY = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa";
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com";

// First, get a live session token from control plane
async function testMediaGateway() {
  console.log("Step 1: Creating live session token from control plane...\n");
  
  // You need to be logged in and have a session token for this
  // For now, let's just test if media gateway is accessible
  
  console.log("Testing media gateway health endpoint:");
  const healthResponse = await fetch(`${MEDIA_GATEWAY_URL}/health`);
  const health = await healthResponse.json();
  console.log("Health:", health);
  console.log("");
  
  console.log("Testing /v1/live/start endpoint (will fail without token):");
  const testResponse = await fetch(`${MEDIA_GATEWAY_URL}/v1/live/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY,
    },
    body: JSON.stringify({
      controlPlaneToken: "fake-token-for-testing",
    }),
  });
  
  console.log("Status:", testResponse.status);
  const responseText = await testResponse.text();
  console.log("Response:", responseText);
  
  if (testResponse.status === 401) {
    console.log("\n❌ PROBLEM: Media gateway rejected the edge bridge key!");
    console.log("This means the EDGE_BRIDGE_SHARED_KEY environment variable");
    console.log("is not set correctly in the Render media gateway service.");
  } else if (testResponse.status === 502 || testResponse.status === 503) {
    console.log("\n✅ Bridge key accepted! The error is from an invalid token,");
    console.log("which is expected. The media gateway authentication is working.");
  }
}

testMediaGateway().catch(console.error);
