import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  VideoRedactionService,
  type RedactionExportConfig,
} from "../../src/evidence/services/video-redaction.service.js";
import {
  RedactionFilterGraphBuilder,
  HardwareEncoderDetector,
} from "../../src/recording/hardware-encoder.js";
import { PersistentFileSigningProvider } from "../../src/evidence/signing/evidence-signing-provider.js";
import type { Pool } from "pg";

const execFileAsync = promisify(execFile);

describe("AI Video Redaction & Face Blurring (evidence.redacted_export)", () => {
  let tempDir: string;
  let signingProvider: PersistentFileSigningProvider;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "redaction-test-"));
    signingProvider = new PersistentFileSigningProvider({
      keyDir: path.join(tempDir, "keys"),
      allowDevKeygen: true,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("Coordinate Normalization & Bounds Clamping", () => {
    it("normalizes relative 0.0-1.0 bounding box to even-dimensioned pixel coordinates", () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const normalized = service.normalizePixelBox(
        { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        1920,
        1080,
      );

      // 1920 * 0.1 = 192, 1080 * 0.2 = 216, 1920 * 0.3 = 576, 1080 * 0.4 = 432
      expect(normalized.x).toBe(192);
      expect(normalized.y).toBe(216);
      expect(normalized.width).toBe(576);
      expect(normalized.height).toBe(432);
      // Dimensions must be even for H.264 / YUV420P encoders
      expect(normalized.width % 2).toBe(0);
      expect(normalized.height % 2).toBe(0);
    });

    it("clamps out-of-bounds coordinates to safe video boundaries", () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const clamped = service.normalizePixelBox(
        { x: -50, y: -20, width: 3000, height: 2000 },
        1280,
        720,
      );

      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(0);
      expect(clamped.width).toBeLessThanOrEqual(1280);
      expect(clamped.height).toBeLessThanOrEqual(720);
      expect(clamped.width % 2).toBe(0);
      expect(clamped.height % 2).toBe(0);
    });
  });

  describe("Compliance Plan Preparation & Corridor Fallback", () => {
    it("prepares redaction plan with automated face corridor when no discrete detections exist", async () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const plan = await service.prepareRedactionPlan({
        cameraId: "cam-privacy-corridor-01",
        fromTime: "2026-09-11T10:00:00.000Z",
        toTime: "2026-09-11T10:05:00.000Z",
        videoWidth: 1920,
        videoHeight: 1080,
        config: {
          complianceStandard: "GDPR",
          faceBlur: true,
          plateBlur: true,
          mode: "blur",
          blurStrength: 28,
        },
      });

      expect(plan.complianceNotice).toContain("GDPR 2016/679 ART 32");
      expect(plan.resolvedBoxes.length).toBeGreaterThan(0);
      expect(plan.filterOptions.watermarkText).toContain("PRIVACY REDACTED");
      expect(plan.filterOptions.blurStrength).toBe(28);
    });

    it("supports DPDP compliance standard with Indian data protection notice", async () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const plan = await service.prepareRedactionPlan({
        cameraId: "cam-dpdp-compliance-02",
        fromTime: "2026-09-11T10:00:00.000Z",
        toTime: "2026-09-11T10:05:00.000Z",
        videoWidth: 1280,
        videoHeight: 720,
        config: {
          complianceStandard: "DPDP",
          faceBlur: true,
          mode: "pixelate",
          blurStrength: 16,
        },
      });

      expect(plan.complianceNotice).toContain("DPDP ACT 2023 SEC 8");
      expect(plan.filterOptions.watermarkText).toContain("DPDP ACT 2023");
    });
  });

  describe("Cryptographic Redaction Compliance Certificate", () => {
    it("generates a verifiable ED25519 digital signature and verifies it", async () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const cert = await service.generateComplianceCertificate({
        caseNumber: "CASE-2026-GDPR-001",
        caseId: "case-uuid-7788",
        exportJobId: "job-export-9900",
        complianceStandard: "GDPR",
        issuedBy: "compliance.officer@kryptovision.com",
        sourceSha256: "a".repeat(64),
        redactedSha256: "b".repeat(64),
        transforms: {
          faceBlur: true,
          plateBlur: true,
          staticZonesCount: 2,
          customBoxesCount: 1,
          totalZonesBlurred: 3,
          audioAction: "REMOVE_TRACK",
          mode: "blur",
          blurStrength: 24,
          watermarkApplied: true,
        },
      });

      expect(cert.certificateId).toMatch(/^REDACT-CERT-/);
      expect(cert.complianceStandard).toBe("GDPR");
      expect(cert.signature).toBeDefined();
      expect(cert.signature.length).toBeGreaterThan(32);

      // Verify certificate mathematically
      const isValid = await service.verifyComplianceCertificate(cert);
      expect(isValid).toBe(true);
    });

    it("rejects tampered certificate data", async () => {
      const service = new VideoRedactionService(undefined, signingProvider);
      const cert = await service.generateComplianceCertificate({
        caseNumber: "CASE-2026-TAMPER-002",
        caseId: "case-uuid-8899",
        exportJobId: "job-export-1122",
        complianceStandard: "DPDP",
        issuedBy: "dpo@kryptovision.com",
        redactedSha256: "c".repeat(64),
        transforms: {
          faceBlur: true,
          plateBlur: false,
          staticZonesCount: 0,
          customBoxesCount: 1,
          totalZonesBlurred: 1,
          audioAction: "MUTE",
          mode: "pixelate",
          blurStrength: 20,
          watermarkApplied: true,
        },
      });

      // Tamper with redacted hash
      const tamperedCert = {
        ...cert,
        redactedSha256: "d".repeat(64),
      };

      const isValid = await service.verifyComplianceCertificate(tamperedCert);
      expect(isValid).toBe(false);
    });
  });

  describe("Real FFmpeg Filter Graph Transcoding Integration", () => {
    it("transcodes a real video applying boxblur, pixelate, solid masks and watermark via FFmpeg", async () => {
      const inputVideo = path.join(tempDir, "source_evidence.mp4");
      const outputVideo = path.join(tempDir, "redacted_export.mp4");

      // 1. Generate real synthetic 320x240 test video with audio using FFmpeg
      await execFileAsync("ffmpeg", [
        "-v", "error",
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=2:size=320x240:rate=10",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=2",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        inputVideo,
      ]);

      expect(await fs.stat(inputVideo)).toBeDefined();

      // 2. Build multi-zone redaction filter graph
      const filterGraph = RedactionFilterGraphBuilder.buildFilterComplex({
        videoWidth: 320,
        videoHeight: 240,
        blurStrength: 16,
        watermarkText: "GDPR REDACTION COMPLIANCE TEST",
        boundingBoxes: [
          { x: 20, y: 20, width: 60, height: 60, mode: "blur", blurRadius: 16, label: "Face 1" },
          { x: 120, y: 40, width: 50, height: 40, mode: "pixelate", label: "Plate 1" },
          { x: 200, y: 100, width: 40, height: 40, mode: "solid", label: "Sensitive Area" },
        ],
      });

      expect(filterGraph).toBeDefined();
      expect(filterGraph).toContain("boxblur");
      expect(filterGraph).toContain("luma_power=3");
      expect(filterGraph).toContain("drawbox=");
      expect(filterGraph).toContain("drawtext=");

      // 3. Execute real FFmpeg transcode with filter_complex
      await execFileAsync("ffmpeg", [
        "-v", "error",
        "-y",
        "-i", inputVideo,
        "-filter_complex", filterGraph!,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-an", // Strip audio as required by privacy policy
        outputVideo,
      ]);

      const stat = await fs.stat(outputVideo);
      expect(stat.size).toBeGreaterThan(1000);

      // 4. Verify output with ffprobe
      const probeResult = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=width,height,codec_name",
        "-of", "json",
        outputVideo,
      ]);

      const probe = JSON.parse(probeResult.stdout);
      expect(probe.streams.length).toBeGreaterThan(0);
      const vStream = probe.streams[0];
      expect(vStream.width).toBe(320);
      expect(vStream.height).toBe(240);
      expect(vStream.codec_name).toBe("h264");
    });
  });

  describe("Audit Ledger & Database Interoperability", () => {
    it("persists redaction audit record to database and retrieves it", async () => {
      const mockRows: any[] = [];
      const mockEvents: any[] = [];

      const mockPool = {
        connect: async () => ({
          query: async (sql: string, params: any[] = []) => {
            if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT") || sql.startsWith("ROLLBACK")) {
              return { rows: [], rowCount: 0 };
            }
            if (sql.includes("INSERT INTO evidence_redaction_logs")) {
              mockRows.push({
                id: "log-1",
                export_job_id: params[0],
                case_id: params[1],
                tenant_id: params[2],
                performed_by: params[3],
                compliance_standard: params[4],
                targets: params[5],
                bounding_box_count: params[6],
                face_blur_applied: params[7],
                plate_blur_applied: params[8],
                static_zones_applied: params[9],
                audio_action: params[10],
                redacted_sha256: params[12],
                certificate_id: params[13],
                signature: params[14],
              });
              return { rows: [], rowCount: 1 };
            }
            if (sql.includes("SELECT * FROM evidence_redaction_logs")) {
              const exportJobId = params[0];
              const match = mockRows.find((r) => r.export_job_id === exportJobId);
              return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
            }
            if (sql.includes("chain_of_custody_events")) {
              mockEvents.push(params);
              return {
                rows: [
                  {
                    id: "custody-1",
                    evidence_id: params[0],
                    action: params[1],
                    actor_id: params[2],
                    performed_by: params[2],
                    actor_type: "USER",
                    reason: params[3],
                    created_at: new Date(),
                    performed_at: new Date(),
                    details: params[4],
                    sequence_number: 1,
                    hash: "0".repeat(64),
                  },
                ],
                rowCount: 1,
              };
            }
            return { rows: [], rowCount: 0 };
          },
          release: () => {},
        }),
        query: async (sql: string, params: any[] = []) => {
          if (sql.includes("SELECT * FROM evidence_redaction_logs")) {
            const exportJobId = params[0];
            const match = mockRows.find((r) => r.export_job_id === exportJobId);
            return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
          }
          return { rows: [], rowCount: 0 };
        },
      } as unknown as Pool;

      const service = new VideoRedactionService(mockPool, signingProvider);

      await service.recordRedactionAudit({
        exportJobId: "export-test-5566",
        caseId: "case-test-7788",
        tenantId: "tenant-default",
        performedBy: "dpo@corp.com",
        complianceStandard: "GDPR",
        targets: ["FACES", "LICENSE_PLATES"],
        boundingBoxCount: 4,
        faceBlurApplied: true,
        plateBlurApplied: true,
        staticZonesApplied: 1,
        audioAction: "REMOVE_TRACK",
        redactedSha256: "e".repeat(64),
        certificateId: "REDACT-CERT-5566",
      });

      expect(mockRows.length).toBe(1);
      expect(mockRows[0].export_job_id).toBe("export-test-5566");
      expect(mockRows[0].compliance_standard).toBe("GDPR");

      const retrieved = await service.getRedactionAudit("export-test-5566", "tenant-default");
      expect(retrieved).toBeDefined();
      expect(retrieved.certificate_id).toBe("REDACT-CERT-5566");
    });
  });
});
