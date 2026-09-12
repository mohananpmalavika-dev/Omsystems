import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

function scanDirectory(dir: string, extensions: string[] = [".ts"]): string[] {
  let results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", "coverage"].includes(entry.name)) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanDirectory(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("P1-9 Architecture Authority and Anti-Drift Verification", () => {
  it("must not have .ts and .js source siblings in src/", () => {
    const srcDir = join(process.cwd(), "src");
    const allFiles = scanDirectory(srcDir, [".ts", ".js"]);
    const fileSet = new Set(allFiles);

    const siblings: string[] = [];
    for (const file of allFiles) {
      if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
        const jsSibling = file.slice(0, -3) + ".js";
        if (fileSet.has(jsSibling)) {
          siblings.push(`${basename(file)} <=> ${basename(jsSibling)}`);
        }
      }
    }

    expect(siblings).toEqual([]);
  });

  it("must not have active imports from legacy backend/src inside src/", () => {
    const srcFiles = scanDirectory(join(process.cwd(), "src"));

    const forbiddenBackendImports: string[] = [];
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf-8");
      if (/(?:from|import)\s+['"][^'"]*backend\/src/i.test(content)) {
        forbiddenBackendImports.push(file);
      }
    }

    expect(forbiddenBackendImports).toEqual([]);
  });

  it("must enforce single authoritative composition root in src/bootstrap/index.ts", () => {
    const bootstrapIndex = join(process.cwd(), "src", "bootstrap", "index.ts");
    expect(existsSync(bootstrapIndex)).toBe(true);

    const content = readFileSync(bootstrapIndex, "utf-8");
    expect(content).toContain("class ApplicationBootstrap");
    expect(content).toContain("export const applicationBootstrap");
    expect(content).toContain("interface ApplicationDependencies");
    expect(content).toContain("playbookEngine");
    expect(content).toContain("evidencePipeline");
    expect(content).toContain("privacyService");
    expect(content).toContain("aiQuality");
    expect(content).toContain("mediaOrchestrator");
  });

  it("must reject in-memory fallback in production for critical services", () => {
    const privacyServicePath = join(process.cwd(), "src", "privacy", "services", "privacy-override.service.ts");
    const privacyContent = readFileSync(privacyServicePath, "utf-8");
    expect(privacyContent).toContain("PRIVACY_AUDIT_STORE_UNAVAILABLE");

    const appPath = join(process.cwd(), "src", "app.ts");
    const appContent = readFileSync(appPath, "utf-8");
    expect(appContent).toContain("INCIDENT_STORE_UNAVAILABLE: PlaybookEngineService requires PostgreSQL pool in production");
    expect(appContent).toContain("AI_QUALITY_STORE_UNAVAILABLE: AIQualityPlatformFacade requires PostgreSQL pool in production");
  });

  it("must strictly enforce cryptographic evidence manifests without fake signatures", () => {
    const evidenceFiles = scanDirectory(join(process.cwd(), "src", "evidence"));
    for (const file of evidenceFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).not.toContain("sig-mock");
      expect(content).not.toContain("mock signature");
      expect(content).not.toContain("fake signature");
    }
  });

  it("must strictly enforce real recorder adapter state without fabricated health", () => {
    const recorderFiles = scanDirectory(join(process.cwd(), "src", "recorders"));
    for (const file of recorderFiles) {
      const content = readFileSync(file, "utf-8");
      expect(content).not.toContain("HIKVISION_SNAPSHOT_JPEG_BYTES");
      expect(content).not.toContain("CPPLUS_SNAPSHOT_JPEG_BYTES");
      expect(content).not.toContain("SMART PASS");
    }
  });
});
