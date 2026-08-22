// Test edge agent configuration
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve("edge-agent/.env");
const envContent = readFileSync(envPath, "utf8");

const config = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (match) {
    config[match[1].trim()] = match[2].trim();
  }
}

console.log("Edge Agent Configuration:");
console.log("========================\n");
console.log(`EDGE_AGENT_ID: ${config.EDGE_AGENT_ID}`);
console.log(`CONTROL_PLANE_URL: ${config.CONTROL_PLANE_URL}`);
console.log(`LIVE_MEDIA_ENABLED: ${config.LIVE_MEDIA_ENABLED}`);
console.log(`EDGE_LIVE_GATEWAY_PORT: ${config.EDGE_LIVE_GATEWAY_PORT}`);
console.log(`MEDIAMTX_PATH: ${config.MEDIAMTX_PATH}`);
console.log(`MEDIAMTX_API_URL: ${config.MEDIAMTX_API_URL}`);
console.log(`MEDIAMTX_HLS_URL: ${config.MEDIAMTX_HLS_URL}`);
console.log(`PUBLIC_MEDIA_GATEWAY_URL: ${config.PUBLIC_MEDIA_GATEWAY_URL}`);
console.log(`MEDIA_TUNNEL_MODE: ${config.MEDIA_TUNNEL_MODE}`);
console.log(`EDGE_BRIDGE_SHARED_KEY: ${config.EDGE_BRIDGE_SHARED_KEY ? "SET" : "NOT SET"}`);
console.log("\nValidation:");
console.log("===========\n");

const issues = [];
if (config.LIVE_MEDIA_ENABLED !== "true") {
  issues.push("❌ LIVE_MEDIA_ENABLED is not 'true'");
} else {
  console.log("✅ LIVE_MEDIA_ENABLED is 'true'");
}

if (!config.EDGE_BRIDGE_SHARED_KEY) {
  issues.push("❌ EDGE_BRIDGE_SHARED_KEY is not set");
} else {
  console.log("✅ EDGE_BRIDGE_SHARED_KEY is set");
}

if (!config.PUBLIC_MEDIA_GATEWAY_URL) {
  issues.push("⚠️  PUBLIC_MEDIA_GATEWAY_URL is not set (required for MEDIA_TUNNEL_MODE=disabled)");
} else {
  console.log(`✅ PUBLIC_MEDIA_GATEWAY_URL is set: ${config.PUBLIC_MEDIA_GATEWAY_URL}`);
}

if (issues.length > 0) {
  console.log("\n❌ Configuration Issues:");
  issues.forEach((issue) => console.log(`   ${issue}`));
} else {
  console.log("\n✅ Configuration looks good!");
}
