import { describe, expect, it } from "vitest";
import {
  defaultMenuAccessForRole,
  getAuthorizedNavigation,
  getVisibleNavigation,
  menuKey,
  navigation,
} from "../components/app-layout.js";

describe("role-focused workspaces", () => {
  it("gives operators a focused monitor-to-proof workspace", () => {
    const paths = defaultMenuAccessForRole("operator");
    expect(paths).toEqual(expect.arrayContaining(["/", "/control-room", "/operations/alerts", "/incidents", "/video-search", "/playback/synced"]));
    expect(paths).not.toContain("/admin/database");
    expect(paths).not.toContain("/compliance/controls");
  });

  it("keeps branch managers focused on health and response", () => {
    const paths = defaultMenuAccessForRole("branch_manager");
    expect(paths).toEqual(expect.arrayContaining(["/operations/branches", "/operations/cameras", "/operations/recording", "/maintenance/workorders"]));
    expect(paths).not.toContain("/analytics/face-recognition");
  });

  it("gives auditors evidence, compliance, and access review", () => {
    const paths = defaultMenuAccessForRole("auditor");
    expect(paths).toEqual(expect.arrayContaining(["/evidence", "/compliance", "/activity-report", "/audit/health"]));
    expect(paths).not.toContain("/admin/system");
  });

  it("keeps the full authorized catalog available separately", () => {
    const user = { role: "operator" };
    const focusedCount = getVisibleNavigation(user).reduce((sum, group) => sum + group.items.length, 0);
    const catalogCount = getAuthorizedNavigation(user).reduce((sum, group) => sum + group.items.length, 0);
    const allCount = navigation.reduce((sum, group) => sum + group.items.length, 0);
    expect(catalogCount).toBe(allCount);
    expect(focusedCount).toBeLessThan(catalogCount);
    expect(getAuthorizedNavigation(user).flatMap((group) => group.items.map(menuKey))).toContain("/admin/database");
  });
});
