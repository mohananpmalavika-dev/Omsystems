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
  console.log("");
  
  // Import and run the edge agent
  try {
    await import("./src/index.ts");
  } catch {
    await import("./build/tsc/index.js");
  }
} catch (error) {
  console.error("Failed to load .env or start edge agent:", error.message);
  process.exit(1);
}
