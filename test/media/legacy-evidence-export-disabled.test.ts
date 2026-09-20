import { describe, expect, it, vi } from "vitest";
import { EvidenceExportPipelineService } from "../../src/media/pipeline/evidence-export-pipeline.service.js";

describe("legacy metadata-only evidence export", () => {
  it("fails closed instead of returning fabricated forensic metadata", async () => {
    const recordingIndex = {
      queryTimeline: vi.fn().mockResolvedValue([]),
    };
    const service = new EvidenceExportPipelineService(recordingIndex as any);

    await expect(service.exportIncidentEvidence({
      incidentId: "incident-1",
      branchId: "branch-1",
      cameraId: "camera-1",
      incidentTime: "2026-09-20T10:00:00.000Z",
      requestedBy: "user-1",
    })).rejects.toThrow("EVIDENCE_EXPORT_PIPELINE_UNAVAILABLE");

    expect(service.getPackage("anything")).toBeUndefined();
  });
});
