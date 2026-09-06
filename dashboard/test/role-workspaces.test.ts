import { describe, expect, it } from "vitest";
import { defaultRoleWorkspace, roleWorkspacePaths } from "../lib/role-workspaces.js";

describe("role-focused workspaces", () => {
  it("gives operators a focused monitor-to-proof workspace", () => {
    const paths = defaultRoleWorkspace("operator");
    expect(paths).toEqual(expect.arrayContaining(["/", "/control-room", "/operations/alerts", "/incidents", "/video-search", "/playback/synced"]));
    expect(paths).not.toContain("/admin/database");
    expect(paths).not.toContain("/compliance/controls");
  });

  it("keeps branch managers focused on health and response", () => {
    const paths = defaultRoleWorkspace("branch_manager");
    expect(paths).toEqual(expect.arrayContaining(["/operations/branches", "/operations/cameras", "/operations/recording", "/maintenance/workorders"]));
    expect(paths).not.toContain("/analytics/face-recognition");
  });

  it("gives auditors evidence, compliance, and access review", () => {
    const paths = defaultRoleWorkspace("auditor");
    expect(paths).toEqual(expect.arrayContaining(["/evidence", "/compliance", "/activity-report", "/audit/health"]));
    expect(paths).not.toContain("/admin/system");
  });

  it("keeps role workspaces materially smaller than the full policy surface", () => {
    const focusedCount = defaultRoleWorkspace("operator").length;
    const fullPolicyCount = Object.values(roleWorkspacePaths).flat().length;
    expect(focusedCount).toBeLessThan(fullPolicyCount);
    expect(defaultRoleWorkspace("admin")).toContain("/integrations");
  });
});
