// Test the media gateway /v1/live/start endpoint
const MEDIA_GATEWAY_URL = "https://apnic-deserve-evans-yarn.trycloudflare.com";
const EDGE_BRIDGE_KEY = process.env.EDGE_BRIDGE_SHARED_KEY ?? "";

console.log("🔍 Testing Media Gateway Live Start Endpoint\n");
console.log("Gateway URL:", MEDIA_GATEWAY_URL);
console.log("Endpoint:", `${MEDIA_GATEWAY_URL}/v1/live/start`);
console.log("\n" + "=".repeat(60) + "\n");

// First, test health endpoint
console.log("1. Testing health endpoint...");
try {
  const healthResponse = await fetch(`${MEDIA_GATEWAY_URL}/health`);
  console.log(`   Status: ${healthResponse.status}`);
  const healthData = await healthResponse.json();
  console.log(`   ✅ Health check passed:`, healthData);
} catch (error) {
  console.log(`   ❌ Health check failed:`, error.message);
  process.exit(1);
}

// Now test the live start endpoint with a dummy token
console.log("\n2. Testing /v1/live/start endpoint (with test token)...");
try {
  const liveResponse = await fetch(`${MEDIA_GATEWAY_URL}/v1/live/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-bridge-key": EDGE_BRIDGE_KEY,
    },
    body: JSON.stringify({ 
      controlPlaneToken: "test-token-12345" 
    }),
  });

  console.log(`   Status: ${liveResponse.status}`);
  const responseText = await liveResponse.text();
  console.log(`   Response:`, responseText);

  if (liveResponse.status === 404) {
    console.log(`\n   ⚠️  Endpoint not found! This means:`);
    console.log(`   - The media gateway doesn't have the /v1/live/start route`);
    console.log(`   - Or the edge agent's live gateway is not properly started`);
  } else if (liveResponse.status === 400 || liveResponse.status === 401) {
    console.log(`\n   ✅ Endpoint exists but rejected our test token (expected)`);
  } else if (liveResponse.status === 200 || liveResponse.status === 201) {
    console.log(`\n   ✅ Endpoint is working!`);
  }

} catch (error) {
  console.log(`   ❌ Failed:`, error.message);
  process.exit(1);
}

console.log("\n" + "=".repeat(60));
console.log("\n✅ Test complete!");
