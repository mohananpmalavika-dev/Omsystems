import { describe, it, expect, beforeEach } from "vitest";
import { AIInvestigationReportService } from "../src/services/ai-investigation-report.js";
import type { ControlPlaneStore } from "../src/control-plane-store.js";

function createMockStore(): ControlPlaneStore {
  return {
    getIncident: async (id: string) => ({
      id,
      incidentNumber: "INC-2026-901",
      incidentType: "Vault Intrusion",
      severity: "critical",
      occurredAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:15:00.000Z",
      branchId: "branch-kollam-01",
      aiConfidence: 0.97,
      policeRequired: true,
      status: "investigating",
    }),
    listIncidentTimeline: async () => [
      {
        occurredAt: "2026-09-10T10:00:00.000Z",
        eventType: "detection",
        description: "Person in vault foyer",
        performedBy: "AI-Model",
        details: {},
      },
      {
        occurredAt: "2026-09-10T10:01:00.000Z",
        eventType: "alert",
        description: "P1 Alert dispatched to SOC",
        performedBy: "System",
        details: {},
      },
    ],
    listIncidentCameras: async () => [
      { id: "cam-01", name: "Vault Camera 1", physicalType: "dome" },
      { id: "cam-02", name: "Vault Camera 2", physicalType: "bullet" },
    ],
    listIncidentVideoRanges: async () => [
      { fromAt: "2026-09-10T10:00:00.000Z", toAt: "2026-09-10T10:15:00.000Z", legalHoldApplied: true },
    ],
    listIncidentClips: async () => [{ id: "clip-01" }],
    listIncidentSnapshots: async () => [
      { id: "snap-01", enhancementDetails: null, annotations: [] },
      { id: "snap-02", enhancementDetails: {}, annotations: [{ label: "Suspect" }] },
    ],
    listIncidentParticipants: async () => [],
    listIncidentEvidenceItems: async () => [{ id: "item-01", itemType: "video" }],
    listIncidentEvidencePackages: async () => [{ id: "pkg-01" }],
    listIncidentTasks: async () => [{ id: "task-01", status: "completed" }],
    listIncidentNotes: async () => [],
  } as unknown as ControlPlaneStore;
}

describe("AIInvestigationReportService Lifecycle & Exports", () => {
  let service: AIInvestigationReportService;
  let mockStore: ControlPlaneStore;

  beforeEach(() => {
    mockStore = createMockStore();
    service = new AIInvestigationReportService(mockStore);
  });

  it("should generate and persist investigation report in draft state", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "detailed",
      "investigator-alice"
    );

    expect(report).toBeDefined();
    expect(report.id).toBeDefined();
    expect(report.status).toBe("draft");
    expect(report.reportNumber).toMatch(/^RPT-INC-2026-901-DET-/);
    expect(report.incidentSummary.severity).toBe("critical");

    // Retrieve by ID
    const retrieved = await service.getReport(report.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(report.id);
    expect(retrieved?.status).toBe("draft");

    // Retrieve by reportNumber
    const retrievedByNumber = await service.getReport(report.reportNumber);
    expect(retrievedByNumber).toBeDefined();
    expect(retrievedByNumber?.id).toBe(report.id);
  });

  it("should review report and update status to pending-review", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "detailed",
      "investigator-alice"
    );

    const reviewed = await service.reviewReport(report.id, "supervisor-bob");
    expect(reviewed.status).toBe("pending-review");
    expect(reviewed.reviewedBy).toBe("supervisor-bob");
    expect(reviewed.reviewedAt).toBeDefined();

    const stored = await service.getReport(report.id);
    expect(stored?.status).toBe("pending-review");
  });

  it("should approve report and update status to approved", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "detailed",
      "investigator-alice"
    );

    await service.reviewReport(report.id, "supervisor-bob");
    const approved = await service.approveReport(report.id, "director-carol");

    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("director-carol");
    expect(approved.approvedAt).toBeDefined();

    const stored = await service.getReport(report.id);
    expect(stored?.status).toBe("approved");
  });

  it("should finalize report and seal as immutable", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "detailed",
      "investigator-alice"
    );

    const finalized = await service.finalizeReport(report.id);
    expect(finalized.status).toBe("final");
    expect(finalized.finalizedAt).toBeDefined();
    expect(finalized.exportFormats).toContain("pdf");
    expect(finalized.exportFormats).toContain("json");

    // Cannot review or approve once finalized
    await expect(service.reviewReport(report.id, "someone")).rejects.toThrow("Cannot review a finalized report");
    await expect(service.approveReport(report.id, "someone")).rejects.toThrow("Cannot approve a finalized report");
  });

  it("should export report to JSON", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "executive",
      "investigator-alice"
    );

    const json = await service.exportToJSON(report);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(report.id);
    expect(parsed.reportNumber).toBe(report.reportNumber);
  });

  it("should export report to PDF buffer", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "court-evidence",
      "investigator-alice"
    );

    const pdfBuffer = await service.exportToPDF(report);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    // Verify PDF signature (%PDF-)
    const header = pdfBuffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("should export report by ID via exportReport", async () => {
    const report = await service.generateInvestigationReport(
      "tenant-001",
      "inc-001",
      "detailed",
      "investigator-alice"
    );

    const pdfRes = await service.exportReport(report.id, "pdf");
    expect(pdfRes.format).toBe("pdf");
    expect(pdfRes.data).toBeInstanceOf(Buffer);

    const jsonRes = await service.exportReport(report.id, "json");
    expect(jsonRes.format).toBe("json");
    expect(typeof jsonRes.data).toBe("string");

    const updated = await service.getReport(report.id);
    expect(updated?.exportedAt).toBeDefined();
  });
});
