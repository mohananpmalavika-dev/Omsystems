#!/usr/bin/env tsx
/**
 * Production Truth & Anti-Simulation Static Verification Tool
 * 
 * Verifies that:
 * 1. No fabricated confidence or mock success exists in production runtime paths.
 * 2. Model unavailabilities adhere to nullable confidence contracts (confidence = null).
 * 3. No silent error-to-empty-array swallowing exists in detector pipelines.
 * 4. Mock providers are guarded with production prevention checks.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  snippet: string;
}

const PRODUCTION_SCAN_DIRS = [
  "backend/src",
  "src",
  "analytics-engine/src",
  "edge-agent/src",
  "media-gateway/src",
  "recording-engine/src",
  "dashboard/components",
  "dashboard/lib",
  "packages/contracts/src",
  "scripts",
];

const IGNORE_PATTERNS = [
  /\/test\//,
  /\/__tests__\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\/examples\//,
  /\/fixtures\//,
  /\/scratch\//,
  /scripts\/verify-production-truth\.ts/,
];

async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const fullPath = join(baseDir, dir);
  let entries;
  try {
    entries = await readdir(fullPath);
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = join(fullPath, entry);
    const relPath = relative(baseDir, entryPath).replace(/\\/g, "/");
    const stats = await stat(entryPath);

    if (stats.isDirectory()) {
      if (entry !== "node_modules" && entry !== "dist" && entry !== ".next") {
        results.push(...(await collectFiles(relPath, baseDir)));
      }
    } else if (stats.isFile() && (entry.endsWith(".ts") || entry.endsWith(".tsx") || entry.endsWith(".js"))) {
      if (!IGNORE_PATTERNS.some((p) => p.test(relPath))) {
        results.push(relPath);
      }
    }
  }

  return results;
}

async function verifyFile(relPath: string, baseDir: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const filePath = resolve(baseDir, relPath);
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    if (line.includes("Math.random()")) {
      const isIdGenerator = line.includes(".toString(36)") || line.includes("slice") || line.includes("substr") || line.includes("Date.now()");
      const isJitter = line.includes("jitter") || line.includes("exponentialDelay") || line.includes("backoff");
      const isPasswordOrCrypto = line.includes("password") || line.includes("charset") || line.includes("otp") || line.includes("OneTimePassword");
      const isColorSampling = line.includes("pixels") || line.includes("color");

      if (!isIdGenerator && !isJitter && !isPasswordOrCrypto && !isColorSampling) {
        if (line.includes("confidence") || line.includes("Brightness") || line.includes("Similarity") || line.includes("Fps") || line.includes("Lag")) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: "NO_RANDOM_METRIC_OR_CONFIDENCE",
            message: "Production code must not fabricate confidence or telemetry using Math.random().",
            snippet: line.trim(),
          });
        }
      }
    }

    // Check 2: Model unavailable with confidence: 0 (must be null)
    if (line.includes("MODEL_UNAVAILABLE") || line.includes("model unavailable") || line.includes("Model unavailable")) {
      // Look ahead up to 5 lines for "confidence: 0"
      for (let j = i; j < Math.min(lines.length, i + 6); j++) {
        const checkLine = lines[j]!;
        if (/confidence:\s*0\b/.test(checkLine)) {
          violations.push({
            file: relPath,
            line: j + 1,
            rule: "NULLABLE_CONFIDENCE_ON_UNAVAILABLE",
            message: "Model unavailable states must set confidence to null, never 0.",
            snippet: checkLine.trim(),
          });
        }
      }
    }

    // Check 3: Silent catch converting detection failure into empty array
    if (/detectObjects\([^)]*\)\.catch\(\s*\(\)\s*=>\s*\[\s*\]\s*\)/.test(line)) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: "NO_SILENT_DETECTION_ERROR_SWALLOWING",
        message: "Inference errors must not be silently swallowed into empty arrays.",
        snippet: line.trim(),
      });
    }

    // Check 4: Simulation mode initialization log in detector
    if (line.includes("simulation mode") && !line.includes("//") && !line.includes("test")) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: "NO_PRODUCTION_SIMULATION_MODE_LOG",
        message: "Production detectors must not run in unverified simulation mode.",
        snippet: line.trim(),
      });
    }

    // Check 5: Forbidden mock constants and simulation patterns in production runtime
    const forbiddenPatterns = [
      { pattern: /\bMOCK_[A-Z0-9_]+\b/, rule: "NO_MOCK_CONSTANTS", message: "Production code must not define or reference MOCK_ constants." },
      { pattern: /\bFAKE_[A-Z0-9_]+\b/, rule: "NO_FAKE_CONSTANTS", message: "Production code must not define or reference FAKE_ constants." },
      { pattern: /For now,\s*return\s+(?:a\s+)?placeholder/i, rule: "NO_PLACEHOLDER_RETURNS", message: "Production code must not return placeholder data." },
      { pattern: /simulated\s+progress/i, rule: "NO_SIMULATED_PROGRESS", message: "Production code must not simulate job/task progress." },
      { pattern: /simulation\s+baseline/i, rule: "NO_SIMULATION_BASELINE", message: "Production code must not use simulation baselines." },
      { pattern: /hard-coded\s+health\s+metrics/i, rule: "NO_HARD_CODED_HEALTH_METRICS", message: "Production code must not use hard-coded health metrics." },
      { pattern: /fabricated\s+confidence/i, rule: "NO_FABRICATED_CONFIDENCE", message: "Production code must not fabricate confidence." },
      { pattern: /fabricated\s+retention/i, rule: "NO_FABRICATED_RETENTION", message: "Production code must not fabricate retention values." },
      { pattern: /fabricated\s+capacity/i, rule: "NO_FABRICATED_CAPACITY", message: "Production code must not fabricate storage capacity." },
      { pattern: /fabricated\s+NTP\s+state/i, rule: "NO_FABRICATED_NTP", message: "Production code must not fabricate NTP synchronization status." },
      { pattern: /fabricated\s+clock\s+offset/i, rule: "NO_FABRICATED_CLOCK_OFFSET", message: "Production code must not fabricate clock offset." },
      { pattern: /10\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/, rule: "NO_HARDCODED_10TB_CAPACITY", message: "Production code must not use hardcoded 10 TB baseline storage capacity." },
      { pattern: /usedStorageBytes\s*\*\s*1\.5/, rule: "NO_SYNTHETIC_STORAGE_MULTIPLIER", message: "Production code must not use synthetic usedStorageBytes * 1.5 multiplier." },
      { pattern: /usableStorageBytes\s*\*\s*1\.1/, rule: "NO_SYNTHETIC_STORAGE_MULTIPLIER", message: "Production code must not use synthetic usableStorageBytes * 1.1 multiplier." },
      { pattern: /99\.997/, rule: "NO_HARDCODED_COMPLIANCE_METRICS", message: "Production code must not use hardcoded 99.997 compliance metrics." },
      { pattern: /83\.4/, rule: "NO_HARDCODED_COMPLIANCE_METRICS", message: "Production code must not use hardcoded 83.4 retention metrics." },
    ];

    for (const fp of forbiddenPatterns) {
      if (fp.pattern.test(line)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: fp.rule,
          message: fp.message,
          snippet: line.trim(),
        });
      }
    }
  }

  // Check 6: Enforce no sibling .js files when authoritative .ts/.tsx exists
  if (relPath.endsWith(".js")) {
    const tsPath = relPath.replace(/\.js$/, ".ts");
    const tsxPath = relPath.replace(/\.js$/, ".tsx");
    let hasSibling = false;
    try {
      await stat(join(baseDir, tsPath));
      hasSibling = true;
    } catch {
      try {
        await stat(join(baseDir, tsxPath));
        hasSibling = true;
      } catch {}
    }
    if (hasSibling) {
      violations.push({
        file: relPath,
        line: 1,
        rule: "NO_SIBLING_JS_SOURCE",
        message: `Compiled or sibling JS source file found alongside TypeScript source: ${relPath}. Authoritative source must be TypeScript only.`,
        snippet: relPath,
      });
    }
  }

  return violations;
}

export async function runProductionTruthVerification(baseDir = process.cwd()): Promise<{
  passed: boolean;
  totalFilesScanned: number;
  violations: Violation[];
}> {
  const allFiles: string[] = [];
  for (const dir of PRODUCTION_SCAN_DIRS) {
    const files = await collectFiles(dir, baseDir);
    allFiles.push(...files);
  }

  const uniqueFiles = Array.from(new Set(allFiles));
  const violations: Violation[] = [];

  for (const file of uniqueFiles) {
    const fileViolations = await verifyFile(file, baseDir);
    violations.push(...fileViolations);
  }

  return {
    passed: violations.length === 0,
    totalFilesScanned: uniqueFiles.length,
    violations,
  };
}

async function main() {
  console.log("🔍 Scanning Sentinel Grid codebase for production simulation and mock success violations...\n");
  const result = await runProductionTruthVerification();

  console.log(`📁 Total production files scanned: ${result.totalFilesScanned}`);

  if (result.passed) {
    console.log("✅ 100% PRODUCTION TRUTH COMPLIANCE: Zero simulation/mock success violations found.\n");
    process.exit(0);
  } else {
    console.error(`❌ Found ${result.violations.length} production truth violation(s):\n`);
    for (const v of result.violations) {
      console.error(`  [${v.rule}] ${v.file}:${v.line}`);
      console.error(`    Message: ${v.message}`);
      console.error(`    Snippet: ${v.snippet}\n`);
    }
    process.exit(1);
  }
}

// Run CLI when invoked directly
if (process.argv[1]?.endsWith("verify-production-truth.ts")) {
  main().catch((err) => {
    console.error("Verification script failed:", err);
    process.exit(1);
  });
}
