// Test what the control plane returns for live session request
const CONTROL_PLANE_URL = "https://sentinel-grid-control-plane1.onrender.com";
const EDGE_BRIDGE_KEY = "WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa";
const CAMERA_ID = "e3d027f8-9c42-4c8b-bbf2-39c91eb756fb";

// First, let's check what the edge agent info shows
console.log("1. Checking edge agent info from control plane...\n");

try {
  const agentResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/edge-agents/6a570d4a-2c71-415f-b59a-643cf50d55c5`,
    {
      headers: {
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
    }
  );

  if (agentResponse.ok) {
    const agentData = await agentResponse.json();
    console.log("Edge Agent Info:");
    console.log(`  ID: ${agentData.id}`);
    console.log(`  Name: ${agentData.name}`);
    console.log(`  Status: ${agentData.status}`);
    console.log(`  Public Media URL: ${agentData.publicMediaUrl}`);
    console.log(`  Last Seen: ${agentData.lastSeenAt}`);
  } else {
    console.log(`Failed to get edge agent: ${agentResponse.status}`);
  }
} catch (error) {
  console.error(`Error getting edge agent: ${error.message}`);
}

console.log("\n2. Checking what URL the camera's edge agent has...\n");

try {
  const cameraResponse = await fetch(
    `${CONTROL_PLANE_URL}/v1/cameras/${CAMERA_ID}`,
    {
      headers: {
        "x-edge-bridge-key": EDGE_BRIDGE_KEY,
      },
    }
  );

  if (cameraResponse.ok) {
    const cameraData = await cameraResponse.json();
    console.log("Camera Info:");
    console.log(`  ID: ${cameraData.id}`);
    console.log(`  Name: ${cameraData.name}`);
    console.log(`  Status: ${cameraData.status}`);
    console.log(`  Gateway ID: ${cameraData.gatewayId}`);
    console.log(`  Edge Agent ID: ${cameraData.edgeAgentId || "(not set)"}`);
  } else {
    console.log(`Failed to get camera: ${cameraResponse.status}`);
  }
} catch (error) {
  console.error(`Error getting camera: ${error.message}`);
}

console.log("\n3. Testing what control plane returns for live session request...\n");
console.log("(This requires authentication, so may fail without a valid session token)");
