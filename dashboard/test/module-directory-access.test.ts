import { describe, expect, it } from "vitest";
import { filterAuthorizedQuickActions } from "../lib/module-directory-access";

describe("module directory quick-action access", () => {
  it("shows an authorized descendant workflow under its parent module", () => {
    const actions = [{ href: "/maintenance/workorders/new", label: "Create work order" }];
    expect(filterAuthorizedQuickActions(actions, new Set(["/maintenance/workorders"]))).toEqual(actions);
  });

  it("does not grant a query-specific admin workflow from a different tab", () => {
    const actions = [{ href: "/admin/organization?tab=roles", label: "Manage roles" }];
    expect(filterAuthorizedQuickActions(actions, new Set(["/admin/organization?tab=hierarchy"]))).toEqual([]);
  });

  it("keeps exact query navigation actions available", () => {
    const actions = [{ href: "/analytics/anpr?create=watchlist", label: "Create watchlist" }];
    expect(filterAuthorizedQuickActions(actions, new Set(["/analytics/anpr?create=watchlist"]))).toEqual(actions);
  });
});
