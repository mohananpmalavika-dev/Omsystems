import { describe, expect, it, vi } from "vitest";
import {
  AlertSuppressionService,
  type ToggleSuppressionInput,
} from "../../src/alerts/services/alert-suppression.service.js";

describe("Alert Suppression Service & Scoped Toggle System", () => {
  function createMockDb(initialRows: any[] = []) {
    let rows = [...initialRows];
    const auditLogs: any[] = [];

    const mockPool: any = {
      query: vi.fn(async (sql: string, params: any[]) => {
        const trimmed = sql.trim().toUpperCase();

        // 1. SELECT query in isSuppressed
        if (trimmed.startsWith("SELECT *") && sql.includes("FROM alert_suppression_config") && sql.includes("LIMIT 1")) {
          const [tenantId, branchId, cameraId, detectionType] = params;

          const candidates = rows.filter((r) => {
            if (r.tenant_id !== tenantId) return false;
            if (r.branch_id !== null && r.branch_id !== branchId) return false;
            if (r.camera_id !== null && r.camera_id !== cameraId) return false;
            if (r.detection_type !== null && r.detection_type !== detectionType) return false;
            return true;
          });

          // Sort by specificity: camera (0) > branch (1) > global (2), then specific detection_type (0) > null (1)
          candidates.sort((a, b) => {
            const scopeA = a.camera_id ? 0 : a.branch_id ? 1 : 2;
            const scopeB = b.camera_id ? 0 : b.branch_id ? 1 : 2;
            if (scopeA !== scopeB) return scopeA - scopeB;

            const dtA = a.detection_type ? 0 : 1;
            const dtB = b.detection_type ? 0 : 1;
            return dtA - dtB;
          });

          return { rows: candidates.slice(0, 1) };
        }

        // 2. SELECT listConfigs
        if (trimmed.startsWith("SELECT *") && sql.includes("FROM alert_suppression_config") && !sql.includes("LIMIT 1") && !sql.includes("WHERE id =")) {
          const tenantId = params[0];
          return { rows: rows.filter((r) => r.tenant_id === tenantId) };
        }

        // 3. SELECT getConfig by id
        if (trimmed.startsWith("SELECT *") && sql.includes("FROM alert_suppression_config WHERE id =")) {
          const id = params[0];
          return { rows: rows.filter((r) => r.id === id) };
        }

        // 4. INSERT / UPSERT into alert_suppression_config
        if (trimmed.startsWith("INSERT INTO ALERT_SUPPRESSION_CONFIG")) {
          const [id, tenant_id, branch_id, camera_id, detection_type, suppressed, label, updated_by, updated_at] = params;

          const existingIdx = rows.findIndex(
            (r) =>
              r.tenant_id === tenant_id &&
              r.branch_id === branch_id &&
              r.camera_id === camera_id &&
              r.detection_type === detection_type
          );

          const row = {
            id: existingIdx >= 0 ? rows[existingIdx].id : id,
            tenant_id,
            branch_id,
            camera_id,
            detection_type,
            suppressed,
            label,
            updated_by,
            updated_at,
            created_at: existingIdx >= 0 ? rows[existingIdx].created_at : updated_at,
          };

          if (existingIdx >= 0) {
            rows[existingIdx] = row;
          } else {
            rows.push(row);
          }

          return { rows: [row] };
        }

        // 5. INSERT into alert_suppression_audit
        if (trimmed.startsWith("INSERT INTO ALERT_SUPPRESSION_AUDIT")) {
          auditLogs.push(params);
          return { rows: [] };
        }

        // 6. DELETE from alert_suppression_config
        if (trimmed.startsWith("DELETE FROM ALERT_SUPPRESSION_CONFIG")) {
          const [id, tenantId] = params;
          const initialLen = rows.length;
          rows = rows.filter((r) => !(r.id === id && r.tenant_id === tenantId));
          return { rowCount: initialLen - rows.length };
        }

        // 7. SELECT audit log
        if (trimmed.startsWith("SELECT *") && sql.includes("FROM ALERT_SUPPRESSION_AUDIT")) {
          return { rows: auditLogs };
        }

        return { rows: [] };
      }),
    };

    return { mockPool, getRows: () => rows, getAuditLogs: () => auditLogs };
  }

  it("permits all alerts when no suppression config exists (default active)", async () => {
    const { mockPool } = createMockDb([]);
    const service = new AlertSuppressionService(mockPool);

    const result = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");

    expect(result.suppressed).toBe(false);
    expect(result.matchedScope).toBe("none");
  });

  it("suppresses all alerts globally when global master toggle is muted", async () => {
    const { mockPool } = createMockDb([
      {
        id: "cfg-1",
        tenant_id: "tenant-1",
        branch_id: null,
        camera_id: null,
        detection_type: null,
        suppressed: true,
        label: "All alerts (global)",
        updated_by: "admin",
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    const service = new AlertSuppressionService(mockPool);

    const intrusionCheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");
    const fireCheck = await service.isSuppressed("tenant-1", "branch-b", "cam-202", "FIRE");

    expect(intrusionCheck.suppressed).toBe(true);
    expect(intrusionCheck.matchedScope).toBe("global");

    expect(fireCheck.suppressed).toBe(true);
    expect(fireCheck.matchedScope).toBe("global");
  });

  it("suppresses only specific detection type globally when configured", async () => {
    const { mockPool } = createMockDb([
      {
        id: "cfg-1",
        tenant_id: "tenant-1",
        branch_id: null,
        camera_id: null,
        detection_type: "LOITERING",
        suppressed: true,
        label: "Loitering",
        updated_by: "admin",
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    const service = new AlertSuppressionService(mockPool);

    const loiteringCheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "LOITERING");
    const intrusionCheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");

    expect(loiteringCheck.suppressed).toBe(true);
    expect(loiteringCheck.matchedScope).toBe("global");
    expect(loiteringCheck.matchedDetectionType).toBe("LOITERING");

    expect(intrusionCheck.suppressed).toBe(false);
  });

  it("evaluates Branch-level suppression over Global rules", async () => {
    const { mockPool } = createMockDb([
      // Global is active (suppressed = false)
      {
        id: "cfg-global",
        tenant_id: "tenant-1",
        branch_id: null,
        camera_id: null,
        detection_type: null,
        suppressed: false,
        label: "Global Active",
        updated_by: "admin",
      },
      // Branch-A is suppressed (suppressed = true)
      {
        id: "cfg-branch-a",
        tenant_id: "tenant-1",
        branch_id: "branch-a",
        camera_id: null,
        detection_type: null,
        suppressed: true,
        label: "Branch A Muted",
        updated_by: "admin",
      },
    ]);
    const service = new AlertSuppressionService(mockPool);

    // Branch A camera should be suppressed
    const branchACheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");
    expect(branchACheck.suppressed).toBe(true);
    expect(branchACheck.matchedScope).toBe("branch");

    // Branch B camera should be active (falls back to global)
    const branchBCheck = await service.isSuppressed("tenant-1", "branch-b", "cam-201", "INTRUSION");
    expect(branchBCheck.suppressed).toBe(false);
  });

  it("evaluates Camera-level suppression over Branch-level rules (Most specific wins)", async () => {
    const { mockPool } = createMockDb([
      // Branch-A is suppressed
      {
        id: "cfg-branch-a",
        tenant_id: "tenant-1",
        branch_id: "branch-a",
        camera_id: null,
        detection_type: null,
        suppressed: true,
        label: "Branch A Muted",
        updated_by: "admin",
      },
      // Cam-101 in Branch-A is explicitly ACTIVATED (suppressed = false)
      {
        id: "cfg-cam-101",
        tenant_id: "tenant-1",
        branch_id: "branch-a",
        camera_id: "cam-101",
        detection_type: null,
        suppressed: false,
        label: "Cam 101 Explicitly Active",
        updated_by: "admin",
      },
    ]);
    const service = new AlertSuppressionService(mockPool);

    // Cam 101 should be active because camera-level rule overrides branch rule!
    const cam101Check = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");
    expect(cam101Check.suppressed).toBe(false);
    expect(cam101Check.matchedScope).toBe("camera");

    // Cam 102 (no camera rule) should still be suppressed by the branch rule
    const cam102Check = await service.isSuppressed("tenant-1", "branch-a", "cam-102", "INTRUSION");
    expect(cam102Check.suppressed).toBe(true);
    expect(cam102Check.matchedScope).toBe("branch");
  });

  it("evaluates camera-specific detection-type toggle over camera all-types toggle", async () => {
    const { mockPool } = createMockDb([
      // Camera is muted for all alerts
      {
        id: "cfg-cam-all",
        tenant_id: "tenant-1",
        branch_id: "branch-a",
        camera_id: "cam-101",
        detection_type: null,
        suppressed: true,
        label: "Cam 101 All Muted",
        updated_by: "admin",
      },
      // BUT Fire detection is explicitly ACTIVE on Camera 101
      {
        id: "cfg-cam-fire",
        tenant_id: "tenant-1",
        branch_id: "branch-a",
        camera_id: "cam-101",
        detection_type: "FIRE",
        suppressed: false,
        label: "Fire Detection Active",
        updated_by: "admin",
      },
    ]);
    const service = new AlertSuppressionService(mockPool);

    // Intrusion on Cam 101 -> suppressed by camera all-types rule
    const intrusionCheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "INTRUSION");
    expect(intrusionCheck.suppressed).toBe(true);

    // Fire on Cam 101 -> ACTIVE because specific detection type overrides all-types
    const fireCheck = await service.isSuppressed("tenant-1", "branch-a", "cam-101", "FIRE");
    expect(fireCheck.suppressed).toBe(false);
    expect(fireCheck.matchedScope).toBe("camera");
    expect(fireCheck.matchedDetectionType).toBe("FIRE");
  });

  it("upserts toggle cleanly and creates audit log record", async () => {
    const { mockPool, getRows, getAuditLogs } = createMockDb([]);
    const service = new AlertSuppressionService(mockPool);

    const input: ToggleSuppressionInput = {
      tenantId: "tenant-1",
      branchId: "branch-x",
      cameraId: "cam-555",
      detectionType: "CAMERA_TAMPER",
      suppressed: true,
      label: "Camera Tamper — Entrance",
      updatedBy: "user-admin",
      reason: "Maintenance scheduled on camera housing",
    };

    const saved = await service.upsertSuppression(input);

    expect(saved.tenantId).toBe("tenant-1");
    expect(saved.branchId).toBe("branch-x");
    expect(saved.cameraId).toBe("cam-555");
    expect(saved.detectionType).toBe("CAMERA_TAMPER");
    expect(saved.suppressed).toBe(true);

    // Verify row was stored in DB
    const allRows = getRows();
    expect(allRows.length).toBe(1);

    // Verify audit log was written
    const audit = getAuditLogs();
    expect(audit.length).toBe(1);
    expect(audit[0][8]).toBe("Maintenance scheduled on camera housing"); // reason
  });

  it("handles bulk toggle for a branch or camera", async () => {
    const { mockPool, getRows } = createMockDb([]);
    const service = new AlertSuppressionService(mockPool);

    const branchBulk = await service.bulkToggle("tenant-1", true, "user-soc", {
      branchId: "branch-south",
    });

    expect(branchBulk.branchId).toBe("branch-south");
    expect(branchBulk.cameraId).toBeNull();
    expect(branchBulk.detectionType).toBeNull();
    expect(branchBulk.suppressed).toBe(true);

    const camBulk = await service.bulkToggle("tenant-1", false, "user-soc", {
      branchId: "branch-south",
      cameraId: "cam-vault",
    });

    expect(camBulk.branchId).toBe("branch-south");
    expect(camBulk.cameraId).toBe("cam-vault");
    expect(camBulk.detectionType).toBeNull();
    expect(camBulk.suppressed).toBe(false);

    expect(getRows().length).toBe(2);
  });
});
