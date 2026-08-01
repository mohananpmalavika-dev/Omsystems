// Test edge agent listMonitoringCameras endpoint
const EDGE_AGENT_ID = "6a570d4a-2c71-415f-b59a-643cf50d55c5";
const EDGE_BRIDGE_SHARED_KEY = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa";
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com";

async function testMonitoringCameras() {
  console.log("Testing listMonitoringCameras endpoint...\n");
  
  const url = `${CONTROL_PLANE_URL}/v1/edge-agents/${EDGE_AGENT_ID}/cameras/monitoring`;
  console.log("URL:", url);
  console.log("Method: GET");
  console.log("Headers:");
  console.log("  x-edge-bridge-key: " + EDGE_BRIDGE_SHARED_KEY.substring(0, 20) + "...");
  console.log("  x-user-id: " + DEV_USER_ID);
  console.log("\nSending request...\n");
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-edge-bridge-key": EDGE_BRIDGE_SHARED_KEY,
        "x-user-id": DEV_USER_ID,
        "x-edge-agent-version": "0.1.0",
      },
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
      console.log("\n✅ SUCCESS! listMonitoringCameras works.");
    } else {
      console.log("\n❌ FAILED! This endpoint is failing.");
      if (response.status === 401) {
        console.log("\nThe problem is that listMonitoringCameras is not recognized as an edge agent ingress route!");
        console.log("Or the backend auth middleware has a bug.");
      }
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
  }
}

testMonitoringCameras();
