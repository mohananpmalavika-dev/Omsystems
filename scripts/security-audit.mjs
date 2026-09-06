#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

// Never suppress a whole package: newly published advisories must fail the gate.
export function evaluateAudit(report) {
  if (report?.error || report?.auditReportVersion !== 2 ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      Array.isArray(report.vulnerabilities) || !report.metadata?.vulnerabilities) {
    throw new Error("Dependency audit failed or returned an invalid report; security status is unknown.");
  }
  const blocking = Object.values(report.vulnerabilities)
    .filter((item) => ["high", "critical"].includes(item.severity))
    .map((item) => ({
      name: item.name,
      severity: item.severity,
      fixAvailable: item.fixAvailable,
      advisories: (item.via ?? []).filter((via) => typeof via === "object").map((via) => via.url),
    }));
  return { total: report.metadata.vulnerabilities, blocking };
}

async function main() {
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd audit --omit=dev --json --fetch-timeout=20000 --fetch-retries=1"]
    : ["audit", "--omit=dev", "--json", "--fetch-timeout=20000", "--fetch-retries=1"];
  const { stdout, code } = await command(executable, args);
  if (code !== 0 && code !== 1) throw new Error(`npm audit failed with exit code ${code}`);
  const result = evaluateAudit(JSON.parse(stdout));
  console.log(JSON.stringify(result, null, 2));
  if (result.blocking.length) process.exitCode = 1;
}

function command(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    // Registry failures can contain URLs with credentials; report a generic failure instead.
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, code }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof SyntaxError ? "npm audit returned invalid JSON; security status is unknown." : error.message);
    process.exitCode = 1;
  });
}
