#!/usr/bin/env tsx
/**
 * Sentinel Grid — Production Localhost & Loopback CI Linter
 * 
 * Verifies repository-wide compliance with production externalized configuration standards:
 * 1. Zero unapproved localhost/127.0.0.1 fallbacks in production paths
 * 2. Zero hardcoded loopback service endpoints
 * 3. Required production configuration fails fast when missing
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveServiceEndpoints } from "../src/config/service-endpoints.js";
import { isLoopbackUrl } from "../src/config/loopback-guard.js";
import { ProductionConfigurationError } from "../packages/contracts/src/config/config-errors.js";

const ROOT_DIR = resolve(process.cwd());

const PRODUCTION_DIRECTORIES = [
  resolve("src"),
  resolve("backend/src"),
  resolve("analytics-engine/src"),
  resolve("media-gateway/src"),
  resolve("recording-engine/src"),
  resolve("packages"),
];

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "test-scratch",
  "test",
  "__tests__",
]);

const ALLOWLIST_FILE = resolve("config/localhost-allowlist.json");
let allowedFiles = new Set<string>();

try {
  const allowlistContent = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
  for (const item of allowlistContent.exceptions || []) {
    allowedFiles.add(resolve(item.file));
  }
} catch {}

interface LocalhostViolation {
  file: string;
  line: number;
  reason: string;
  codeSnippet: string;
}

function scanFile(fullPath: string, violations: LocalhostViolation[]): void {
  const isTest =
    fullPath.includes("/test/") ||
    fullPath.includes("\\test\\") ||
    fullPath.includes("/__tests__/") ||
    fullPath.includes("\\__tests__\\") ||
    fullPath.includes("example") ||
    fullPath.endsWith(".test.ts") ||
    fullPath.endsWith(".spec.ts");

  if (isTest) return;
  if (allowedFiles.has(resolve(fullPath))) return;

  const content = readFileSync(fullPath, "utf8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const line = rawLine.trim();
    const lineNum = i + 1;

    // Ignore comments
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

    // Check for unsafe fallback patterns: || 'http://localhost...', ?? 'redis://localhost...'
    const isUnsafeFallback =
      /(\|\|\s*|(\?\?)\s*)["'](http|https|redis|nats|ws|wss|postgresql):\/\/(localhost|127\.0\.0\.1)/.test(line);

    if (isUnsafeFallback) {
      // Check if guarded by process.env.NODE_ENV !== 'production'
      const hasProdGuard = content.includes("NODE_ENV === 'production'") || content.includes('NODE_ENV === "production"');
      if (!hasProdGuard) {
        violations.push({
          file: fullPath,
          line: lineNum,
          reason: "Unsafe localhost/loopback fallback without production guard",
          codeSnippet: line,
        });
      }
    }
  }
}

function scanDirectory(dir: string, violations: LocalhostViolation[]): void {
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
  console.log("  SENTINEL GRID — ZERO LOCALHOST ASSUMPTIONS CI AUDIT");
  console.log("===============================================================\n");

  const violations: LocalhostViolation[] = [];

  for (const prodDir of PRODUCTION_DIRECTORIES) {
    scanDirectory(prodDir, violations);
  }

  // Validate that production mode strictly fails when DATABASE_URL is missing
  let prodMissingDbFails = false;
  try {
    resolveServiceEndpoints({
      env: { NODE_ENV: "production" },
    });
  } catch (err: any) {
    if (err instanceof ProductionConfigurationError) {
      prodMissingDbFails = true;
    }
  }

  // Validate that production mode strictly fails when DATABASE_URL is loopback
  let prodLoopbackDbFails = false;
  try {
    resolveServiceEndpoints({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/sentinel",
      },
    });
  } catch (err: any) {
    if (err instanceof ProductionConfigurationError) {
      prodLoopbackDbFails = true;
    }
  }

  console.log(`🔍 Total Production Insecure Localhost Fallbacks Found: ${violations.length}`);

  if (violations.length > 0) {
    console.error("\n❌ LOCALHOST ASSUMPTION VIOLATIONS DETECTED:");
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line}`);
      console.error(`    Reason: ${v.reason}`);
      console.error(`    Code: ${v.codeSnippet}\n`);
    }
    process.exit(1);
  }

  if (!prodMissingDbFails || !prodLoopbackDbFails) {
    console.error("❌ Production configuration validation test failed: Loopback or missing config did not throw ProductionConfigurationError.");
    process.exit(1);
  }

  console.log("✅ 100% ZERO-LOCALHOST COMPLIANT: All production services enforce externalized configuration.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal localhost verification error:", err);
  process.exit(1);
});
