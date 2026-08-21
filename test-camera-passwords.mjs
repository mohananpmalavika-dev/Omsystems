#!/usr/bin/env node

/** Probe one camera using runtime-supplied candidate passwords. */
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const cameraIp = process.env.CAMERA_IP;
const username = process.env.CAMERA_USERNAME || "admin";
const passwords = (process.env.CAMERA_TEST_PASSWORDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!cameraIp || passwords.length === 0) {
  console.error("Set CAMERA_IP and CAMERA_TEST_PASSWORDS at runtime.");
  process.exit(2);
}

console.log(`Testing ${username} against camera ${cameraIp}; passwords are redacted.`);
for (const password of passwords) {
  try {
    const cmd = `curl -s --connect-timeout 3 --digest --user "${username}:${password}" "http://${cameraIp}/onvif/device_service"`;
    const { stdout } = await execAsync(cmd, { timeout: 5000 });
    if (stdout && !stdout.includes("401") && !stdout.includes("Unauthorized") && stdout.length > 100) {
      console.log("SUCCESS: credentials accepted (password redacted).");
      process.exit(0);
    }
  } catch {
    // Try the next runtime-supplied candidate.
  }
  console.log("Failed candidate (redacted)");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.log("No supplied candidate worked.");
process.exitCode = 1;
