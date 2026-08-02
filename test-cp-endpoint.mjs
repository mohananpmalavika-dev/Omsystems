// Test if the control plane endpoint exists
const response = await fetch(
  "https://sentinel-grid-control-plane1.onrender.com/v1/cameras/e3d027f8-9c42-4c8b-bbf2-39c91eb756fb/live-sessions",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-bridge-key": process.env.EDGE_BRIDGE_SHARED_KEY ?? "",
    },
    body: "{}",
  }
);

console.log(`Status: ${response.status}`);
console.log(`Body: ${await response.text()}`);
