import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { AlertEvidencePipelineService } from "../src/alerts/services/alert-evidence-pipeline.service.js";
import { evidenceCapturePipeline } from "../src/evidence/services/evidence-capture-pipeline.service.js";

function getSourceFiles(dir: string, extensions = [".ts"]): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      if (file === "node_modules" || file === "dist" || file === ".next" || file === "build") {
        continue;
      }
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getSourceFiles(fullPath, extensions));
      } else if (extensions.some((ext) => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist in test env
  }
  return results;
}

describe("Surveillance Platform Architectural Boundaries", () => {
  it("Analytics Engine must not directly import raw notification providers (SMTP, Twilio, FCM)", () => {
    const analyticsFiles = getSourceFiles(resolve(process.cwd(), "analytics-engine/src"));
    
    for (const filePath of analyticsFiles) {
      const content = readFileSync(filePath, "utf-8");
      
      // Analytics must not directly construct or import provider SDKs
      expect(content).not.toMatch(/from\s+["']@sendgrid/i);
      expect(content).not.toMatch(/from\s+["']nodemailer/i);
      expect(content).not.toMatch(/from\s+["']twilio/i);
      expect(content).not.toMatch(/from\s+["']firebase-admin/i);
    }
  });

  it("Alert Services must delegate evidence capture to canonical EvidenceCapturePipelineService", async () => {
    const pipeline = new AlertEvidencePipelineService();
    const result = await pipeline.initiateCapture({
      alertId: "arch-test-alert-001",
      tenantId: "tenant-bank-01",
      branchId: "branch-01",
      cameraId: "cam-01",
      occurredAt: new Date(),
    });

    expect(result.state).toBe("READY");
    expect(result.snapshotState).toBe("READY");
    expect(result.clipState).toBe("READY");
    expect(result.snapshotUrl).toBeDefined();
    expect(result.clipUrl).toBeDefined();

    // Verify evidence record exists in the authoritative evidence capture pipeline
    const record = await evidenceCapturePipeline.getEvidenceForAlert("arch-test-alert-001");
    expect(record).toBeDefined();
    expect(record?.status).toBe("READY");
    expect(record?.manifestHash).toBeDefined();
  });

  it("Evidence Pipeline generates tamper-evident SHA-256 cryptographic manifests", async () => {
    const record = await evidenceCapturePipeline.getEvidenceForAlert("arch-test-alert-001");
    expect(record).toBeDefined();
    
    if (record) {
      const manifest = await evidenceCapturePipeline.getManifest(record.id);
      expect(manifest).toBeDefined();
      expect(manifest?.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest?.snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest?.video.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("Evidence Pipeline enforces idempotency for duplicate alert capture requests", async () => {
    const first = await evidenceCapturePipeline.enqueueEvidenceCapture({
      alertId: "arch-idempotency-test",
      tenantId: "tenant-bank-01",
      branchId: "branch-01",
      cameraId: "cam-01",
      alertType: "intrusion",
      severity: "P1",
      detectedAt: new Date(),
    });

    const second = await evidenceCapturePipeline.enqueueEvidenceCapture({
      alertId: "arch-idempotency-test",
      tenantId: "tenant-bank-01",
      branchId: "branch-01",
      cameraId: "cam-01",
      alertType: "intrusion",
      severity: "P1",
      detectedAt: new Date(),
    });

    // Should return the exact same evidence record ID without duplicate generation
    expect(first.id).toBe(second.id);
  });
});
