import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { InvestigationWorkspaceService } from "../../src/incidents/services/investigation-workspace.service.js";
import type { Pool } from "pg";

describe("Investigation Workspace Persistence & Restart Recovery (P0-08, P0-09)", () => {
  let mockDb: Map<string, any>;
  let mockPool: Pool;

  beforeEach(() => {
    mockDb = new Map();

    const executeQuery = async (text: string, params: any[] = []) => {
      const sql = text.trim().replace(/\s+/g, " ");

      if (sql.startsWith("INSERT INTO evidence_cases")) {
        const id = params[0];
        const record = {
          id,
          tenant_id: params[1],
          branch_id: params[2],
          incident_id: params[3],
          case_number: params[4],
          title: params[5],
          description: params[6],
          status: params[7],
          lead_investigator: params[8],
          assigned_users: typeof params[9] === "string" ? JSON.parse(params[9]) : params[9],
          camera_ids: typeof params[10] === "string" ? JSON.parse(params[10]) : params[10],
          time_range_start: params[11],
          time_range_end: params[12],
          evidence_package_ids: typeof params[13] === "string" ? JSON.parse(params[13]) : params[13],
          notes: typeof params[14] === "string" ? JSON.parse(params[14]) : params[14],
          bookmarks: typeof params[15] === "string" ? JSON.parse(params[15]) : params[15],
          sop_progress: typeof params[16] === "string" ? JSON.parse(params[16]) : params[16],
          created_at: new Date(params[17]),
          updated_at: new Date(params[18]),
        };
        mockDb.set(id, record);
        mockDb.set(record.case_number, record);
        return { rows: [record], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE evidence_cases SET notes")) {
        const caseId = params[0];
        const notes = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const record = mockDb.get(caseId);
        if (record) {
          record.notes = notes;
          record.updated_at = new Date();
        }
        return { rows: [record], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE evidence_cases SET assigned_users")) {
        const caseId = params[0];
        const users = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const record = mockDb.get(caseId);
        if (record) {
          record.assigned_users = users;
          record.updated_at = new Date();
        }
        return { rows: [record], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE evidence_cases SET evidence_package_ids")) {
        const caseId = params[0];
        const pkgs = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const record = mockDb.get(caseId);
        if (record) {
          record.evidence_package_ids = pkgs;
          record.updated_at = new Date();
        }
        return { rows: [record], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE evidence_cases SET status")) {
        const caseId = params[0];
        const record = mockDb.get(caseId);
        if (record) {
          record.status = "investigating";
          record.updated_at = new Date();
        }
        return { rows: [record], rowCount: 1 };
      }

      if (sql.includes("FROM evidence_cases WHERE id = $1 OR case_number = $1")) {
        const key = params[0];
        const record = mockDb.get(key);
        return { rows: record ? [record] : [], rowCount: record ? 1 : 0 };
      }

      if (sql.includes("FROM evidence_cases")) {
        const records = Array.from(new Set(mockDb.values()));
        return { rows: records, rowCount: records.length };
      }

      return { rows: [], rowCount: 0 };
    };

    mockPool = {
      query: executeQuery,
    } as unknown as Pool;
  });

  it("investigation dossier survives complete service restart without in-memory state leakage (P0-08, P0-09)", async () => {
    // 1. Initial service instance
    const service1 = new InvestigationWorkspaceService(mockPool);

    const createdCase = await service1.createCase({
      tenantId: "TENANT-RECOVERY-01",
      branchId: "BRANCH-NORTH-01",
      title: "Vault Discrepancy Investigation",
      description: "Audit trail investigation into vault door sensor event",
      leadInvestigator: "officer.sharma",
      incidentIds: ["INC-9001"],
      cameraIds: ["CAM-VAULT-01", "CAM-LOBBY-02"],
      timeRangeStart: "2026-09-07T08:00:00.000Z",
      timeRangeEnd: "2026-09-07T10:00:00.000Z",
    });

    expect(createdCase.caseId).toBeDefined();
    expect(createdCase.caseNumber).toMatch(/^CASE-2026-\d{4}$/);
    expect(createdCase.status).toBe("OPEN");

    // 2. Add investigator notes
    await service1.addNote(createdCase.caseId, "officer.sharma", "Verified physical sensor logs.");
    await service1.addNote(createdCase.caseId, "auditor.patel", "Cross-checked vault badge logs.");

    // 3. Assign operator
    await service1.assignOperator(createdCase.caseId, "operator.verma");

    // 4. Place under legal hold
    await service1.placeUnderLegalHold(createdCase.caseId);

    // ------------------------------------------------------------------------
    // SERVICE RESTART SIMULATION: Destroy service1, create completely new instance
    // ------------------------------------------------------------------------
    const service2 = new InvestigationWorkspaceService(mockPool);

    // 5. Reload investigation from new service instance without prior memory state
    const reloadedCase = await service2.getCase(createdCase.caseId);

    expect(reloadedCase).not.toBeNull();
    expect(reloadedCase!.caseId).toBe(createdCase.caseId);
    expect(reloadedCase!.caseNumber).toBe(createdCase.caseNumber);
    expect(reloadedCase!.tenantId).toBe("TENANT-RECOVERY-01");
    expect(reloadedCase!.branchId).toBe("BRANCH-NORTH-01");
    expect(reloadedCase!.title).toBe("Vault Discrepancy Investigation");
    expect(reloadedCase!.leadInvestigator).toBe("officer.sharma");

    // Notes must remain intact
    expect(reloadedCase!.notes).toHaveLength(2);
    expect(reloadedCase!.notes[0]!.author).toBe("officer.sharma");
    expect(reloadedCase!.notes[0]!.content).toBe("Verified physical sensor logs.");
    expect(reloadedCase!.notes[1]!.author).toBe("auditor.patel");

    // Assigned operators must remain intact
    expect(reloadedCase!.assignedUsers).toContain("operator.verma");

    // Legal hold status must remain intact
    expect(reloadedCase!.status).toBe("IN_REVIEW");

    // Camera scope and time window must remain intact
    expect(reloadedCase!.cameraIds).toEqual(["CAM-VAULT-01", "CAM-LOBBY-02"]);
    expect(reloadedCase!.timeRangeStart).toBe("2026-09-07T08:00:00.000Z");
    expect(reloadedCase!.timeRangeEnd).toBe("2026-09-07T10:00:00.000Z");
  });
});
