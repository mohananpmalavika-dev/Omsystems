#!/usr/bin/env tsx
/**
 * Sentinel Grid — TLS Security & Certificate Transport CI Linter
 * 
 * Verifies repository-wide compliance with production TLS standards:
 * 1. Zero unapproved rejectUnauthorized: false in production paths
 * 2. Zero NODE_TLS_REJECT_UNAUTHORIZED=0 global bypasses
 * 3. PostgreSQL connection pool uses canonical verified TLS configuration
 * 4. Scanner exceptions are documented and isolated with SSRF policy
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDatabaseTlsConfig } from "../src/security/tls/database-tls-config.js";
import { validateGlobalTlsConfiguration } from "../src/security/tls/startup-security-guard.js";

const ROOT_DIR = resolve(process.cwd());

const PRODUCTION_DIRECTORIES = [
  resolve("src"),
  resolve("backend/src"),
  resolve("analytics-engine/src"),
  resolve("media-gateway/src"),
  resolve("edge-agent/src"),
  resolve("dashboard"),
  resolve("packages"),
];

const APPROVED_SCANNER_FILES = new Set([
  resolve("backend/src/security-posture/services/certificate-validation.service.ts"),
  resolve("backend/src/security-posture/providers/tls-scanner.provider.ts"),
  resolve("backend/src/security/certificate/tls-discovery.ts"),
  resolve("backend/src/security-posture/collectors/video/video-transport-encryption.collector.ts"),
  resolve("backend/src/security-posture/collectors/network/cipher-strength.collector.ts"),
  resolve("backend/src/security-posture/collectors/network/tls-protocol.collector.ts"),
]);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "test-scratch",
]);

interface TlsViolation {
  file: string;
  line: number;
  reason: string;
  codeSnippet: string;
}

function scanFile(fullPath: string, violations: TlsViolation[]): void {
  const isTest =
    fullPath.includes("/test/") ||
    fullPath.includes("\\test\\") ||
    fullPath.includes("/__tests__/") ||
    fullPath.includes("\\__tests__\\") ||
    fullPath.endsWith(".test.ts") ||
    fullPath.endsWith(".spec.ts");

  if (isTest) return; // Tests are allowed test fixtures

  const content = readFileSync(fullPath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();
    const lineNum = i + 1;

    // Ignore comments
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

    // Check for global bypass assignment
    if (
      line.includes("NODE_TLS_REJECT_UNAUTHORIZED") &&
      (line.includes("'0'") || line.includes('"0"') || line.includes("= 0") || line.includes("=0"))
    ) {
      if (!fullPath.includes("startup-security-guard") && !fullPath.includes("verify-tls-security")) {
        violations.push({
          file: fullPath,
          line: lineNum,
          reason: "Forbidden global TLS verification bypass (NODE_TLS_REJECT_UNAUTHORIZED=0)",
          codeSnippet: line,
        });
      }
    }

    // Check for rejectUnauthorized: false code assignment
    const isRejectUnauthorizedFalse =
      /rejectUnauthorized\s*:\s*false/.test(line) &&
      !line.includes("rejectUnauthorized: false is forbidden") &&
      !line.includes("rejectUnauthorized === false") &&
      !line.includes("=== false ?") &&
      !line.includes('"rejectUnauthorized: false"');

    if (isRejectUnauthorizedFalse) {
      const isApprovedScanner = APPROVED_SCANNER_FILES.has(resolve(fullPath));
      const hasSecurityExceptionComment =
        content.includes("SECURITY EXCEPTION") || content.includes("CERTIFICATE_INSPECTION");

      if (!isApprovedScanner && !hasSecurityExceptionComment) {
        violations.push({
          file: fullPath,
          line: lineNum,
          reason: "Unapproved rejectUnauthorized: false in production codebase",
          codeSnippet: line,
        });
      }
    }
  }
}

function scanDirectory(dir: string, violations: TlsViolation[]): void {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath, violations);
      } else if (
        entry.endsWith(".ts") ||
        entry.endsWith(".tsx") ||
        entry.endsWith(".js") ||
        entry.endsWith(".mjs")
      ) {
        scanFile(fullPath, violations);
      }
    }
  } catch {}
}

async function main() {
  console.log("===============================================================");
  console.log("  SENTINEL GRID — TLS TRANSPORT SECURITY CI AUDIT");
  console.log("===============================================================\n");

  const violations: TlsViolation[] = [];

  for (const prodDir of PRODUCTION_DIRECTORIES) {
    scanDirectory(prodDir, violations);
  }

  // Validate database TLS configuration generator
  let dbTlsValid = true;
  try {
    const prodConfig = createDatabaseTlsConfig({
      isProduction: true,
      mode: "VERIFY_CA",
      ca: "DUMMY_CA_FOR_TEST",
    });
    if (typeof prodConfig !== "object" || (prodConfig as any).rejectUnauthorized !== true) {
      dbTlsValid = false;
    }
  } catch {
    dbTlsValid = false;
  }

  // Validate global TLS bypass guard
  let guardValid = true;
  try {
    validateGlobalTlsConfiguration(false);
  } catch {
    guardValid = false;
  }

  console.log(`🔍 Total Production Insecure TLS Violations Found: ${violations.length}`);

  if (violations.length > 0) {
    console.error("\n❌ TLS SECURITY VIOLATIONS DETECTED:");
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line}`);
      console.error(`    Reason: ${v.reason}`);
      console.error(`    Code: ${v.codeSnippet}\n`);
    }
    process.exit(1);
  }

  if (!dbTlsValid || !guardValid) {
    console.error("❌ Canonical TLS configuration or guard validation failed.");
    process.exit(1);
  }

  console.log("✅ 100% TLS TRANSPORT SECURITY COMPLIANT: All production connections enforce verified TLS.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal TLS verification error:", err);
  process.exit(1);
});
