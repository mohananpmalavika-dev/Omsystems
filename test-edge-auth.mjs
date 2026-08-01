// Test edge agent authentication
const EDGE_AGENT_ID = "6a570d4a-2c71-415f-b59a-643cf50d55c5";
const EDGE_BRIDGE_SHARED_KEY = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa";
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com";

async function testHeartbeat() {
  console.log("Testing edge agent heartbeat authentication...\n");
  
  const url = `${CONTROL_PLANE_URL}/v1/edge-agents/${EDGE_AGENT_ID}/heartbeat`;
  console.log("URL:", url);
  console.log("Method: POST");
  console.log("Headers:");
  console.log("  content-type: application/json");
  console.log("  x-edge-bridge-key: " + EDGE_BRIDGE_SHARED_KEY.substring(0, 20) + "...");
  console.log("\nSending request...\n");
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY,
      },
      body: JSON.stringify({
        version: "0.1.0",
      }),
    });
    
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    
    console.log("Response Status:", response.status, response.statusText);
    console.log("Response Body:", JSON.stringify(body, null, 2));
    
    if (response.ok) {
      console.log("\n✅ SUCCESS! Edge agent authentication is working.");
    } else {
      console.log("\n❌ FAILED! Authentication error.");
      if (response.status === 401) {
        console.log("\nPossible causes:");
        console.log("1. EDGE_BRIDGE_SHARED_KEY mismatch between scanner .env and Render");
        console.log("2. Backend code not deployed yet (check Render dashboard)");
        console.log("3. Authentication logic issue in backend");
      }
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
  }
}

testHeartbeat();
