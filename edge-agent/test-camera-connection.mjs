#!/usr/bin/env node
/**
 * Quick camera connection test - bypasses control plane
 */

import { discoverOnvifDevices } from "./build/tsc/discovery/onvif-discovery.js";
import { OnvifClient } from "./build/tsc/devices/onvif-client.js";

console.log("🔍 Starting camera discovery...\n");

try {
  // Discover cameras on the network
  const endpoints = await discoverOnvifDevices(5000);
  
  console.log(`✅ Discovered ${endpoints.length} ONVIF endpoint(s)\n`);
  
  if (endpoints.length === 0) {
    console.log("❌ No cameras found. Make sure cameras are on the same network.\n");
    process.exit(0);
  }
  
  // Test different credentials
  const credentialSets = [
    { username: "admin", password: "admin" },
    { username: "admin", password: "" },
    { username: "admin", password: "12345" },
    { username: "admin", password: "admin123" },
    { username: "root", password: "admin" },
  ];
  
  for (const endpoint of endpoints) {
    const ip = endpoint.remoteAddress;
    const serviceUrl = endpoint.xaddrs[0];
    
    console.log(`\n📹 Testing camera at ${ip}`);
    console.log(`   Service URL: ${serviceUrl}`);
    console.log(`   Scopes: ${endpoint.scopes.slice(0, 3).join(", ")}${endpoint.scopes.length > 3 ? "..." : ""}`);
    
    let connected = false;
    
    for (const creds of credentialSets) {
      try {
        console.log(`   Trying ${creds.username}/${creds.password || "(empty)"} ...`);
        
        const client = new OnvifClient(serviceUrl, creds, 5000);
        const device = await client.inspect();
        
        console.log(`   ✅ SUCCESS! Connected with ${creds.username}/${creds.password || "(empty)"}`);
        console.log(`      Manufacturer: ${device.manufacturer}`);
        console.log(`      Model: ${device.model}`);
        console.log(`      Serial: ${device.serialNumber || "N/A"}`);
        console.log(`      Firmware: ${device.firmwareVersion || "N/A"}`);
        console.log(`      Profiles: ${device.profiles.length}`);
        
        connected = true;
        break;
      } catch (error) {
        const msg = error.message;
        if (msg.includes("NotAuthorized") || msg.includes("401")) {
          console.log(`      ❌ Wrong credentials`);
        } else if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
          console.log(`      ⏱️  Timeout`);
        } else {
          console.log(`      ❌ Error: ${msg.substring(0, 60)}...`);
        }
      }
    }
    
    if (!connected) {
      console.log(`   ⚠️  Could not authenticate with any common credentials`);
      console.log(`   💡 You may need to reset this camera or check its manual for default credentials`);
    }
  }
  
  console.log("\n✅ Camera discovery test complete!\n");
  
} catch (error) {
  console.error("❌ Discovery failed:", error.message);
  process.exit(1);
}
