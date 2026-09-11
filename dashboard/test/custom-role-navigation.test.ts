import { describe, expect, it } from "vitest";
import { getVisibleNavigation, hasCustomMenuConfiguration } from "../components/app-layout";

describe("custom role navigation & menu permissions", () => {
  it("preserves explicitly assigned menus for custom roles without stripping against legacy base workspace", () => {
    const customUser = {
      username: "soc-analyst",
      role: "operator",
      customRoleId: "550e8400-e29b-41d4-a716-446655440000",
      customRoleName: "Surveillance Specialist",
      menuAccess: [
        "/operations/cameras",
        "/operations/recording",
        "/video-search",
        "/operations/alert-command-center",
      ],
    };

    expect(hasCustomMenuConfiguration(customUser)).toBe(true);

    const visibleNav = getVisibleNavigation(customUser);
    const visibleHrefs = visibleNav.flatMap((group) => group.items.map((item) => item.href));

    // Must preserve explicitly assigned menus even though they are outside legacy operator paths
    expect(visibleHrefs).toContain("/operations/cameras");
    expect(visibleHrefs).toContain("/operations/recording");
    expect(visibleHrefs).toContain("/video-search");
    expect(visibleHrefs).toContain("/operations/alert-command-center");

    // Must not contain unassigned modules
    expect(visibleHrefs).not.toContain("/admin/system");
    expect(visibleHrefs).not.toContain("/maintenance/device-configuration");
  });

  it("keeps standard operator restricted to default operator workspace when no custom role is assigned", () => {
    const standardOperator = {
      username: "standard-op",
      role: "operator",
    };

    expect(hasCustomMenuConfiguration(standardOperator)).toBe(false);

    const visibleNav = getVisibleNavigation(standardOperator);
    const visibleHrefs = visibleNav.flatMap((group) => group.items.map((item) => item.href));

    expect(visibleHrefs).toContain("/control-room");
    expect(visibleHrefs).not.toContain("/admin/system");
    expect(visibleHrefs).not.toContain("/maintenance/device-configuration");
  });

  it("grants full navigation workspace to platform superadmin", () => {
    const superAdmin = {
      username: "admin-user",
      role: "super_admin",
    };

    const visibleNav = getVisibleNavigation(superAdmin);
    const visibleHrefs = visibleNav.flatMap((group) => group.items.map((item) => item.href));

    expect(visibleHrefs).toContain("/admin/system");
    expect(visibleHrefs).toContain("/maintenance/device-configuration");
    expect(visibleHrefs).toContain("/operations/cameras");
  });
});
