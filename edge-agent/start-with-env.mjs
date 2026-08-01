#!/usr/bin/env node
/**
 * Wrapper script to load .env file and start the edge agent
 * This ensures all environment variables are properly loaded into process.env
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");

try {
  const envContent = readFileSync(envPath, "utf8");
  
  // Parse .env file and set environment variables
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      // Only set if not already set (allows CLI overrides)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  
  console.log("✓ Environment variables loaded from .env");
  console.log(`✓ EDGE_AGENT_ID: ${process.env.EDGE_AGENT_ID || "(not set)"}`);
  console.log(`✓ CONTROL_PLANE_URL: ${process.env.CONTROL_PLANE_URL || "(not set)"}`);
  console.log(`✓ EDGE_BRIDGE_SHARED_KEY: ${process.env.EDGE_BRIDGE_SHARED_KEY ? "***" + process.env.EDGE_BRIDGE_SHARED_KEY.slice(-8) : "(not set)"}`);
  console.log(`✓ DEV_USER_ID: ${process.env.DEV_USER_ID || "(not set)"}`);
  console.log("");
  
  // Test authentication before starting
  console.log("Testing authentication...");
  const testUrl = `${process.env.CONTROL_PLANE_URL}/v1/edge-agents/${process.env.EDGE_AGENT_ID}/heartbeat`;
  const testResponse = await fetch(testUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-bridge-key": process.env.EDGE_BRIDGE_SHARED_KEY || "",
    },
    body: JSON.stringify({ version: process.env.EDGE_AGENT_VERSION || "0.1.0" }),
  });
  
  if (testResponse.ok) {
    console.log("✓ Authentication test passed");
  } else {
    console.error(`✗ Authentication test failed: ${testResponse.status} ${testResponse.statusText}`);
    const errorBody = await testResponse.text();
    console.error(`Response: ${errorBody}`);
  }
  console.log("");
  
  // Import and run the edge agent
  await import("./dist/src/index.js");
} catch (error) {
  console.error("Failed to load .env or start edge agent:", error.message);
  process.exit(1);
}
