import { describe, expect, it } from "vitest";
import { authorize } from "../src/domain/authorization.js";
import { MemoryStore } from "../src/store.js";

describe("hierarchical authorization", () => {
  const store = new MemoryStore();

  it.each(["mgdhanyamohan", "krypton", "kryptonlogic"])("does not grant administrator privileges from username %s", username => {
    const resource = store.nodes.get("camera-entrance")!;
    const user = { id: "unprivileged", displayName: "Viewer", tenantId: "other-tenant", role: "viewer", status: "active", username } as const;
    expect(authorize(user, "device:configure", resource, store.nodes, [])).toMatchObject({ allowed: false });
  });

  it("ignores magic IDs and stale administrator flags and denies inactive accounts", () => {
    const resource = store.nodes.get("camera-entrance")!;
    for (const id of ["user-superadmin-mgdhanyamohan", "00000000-0000-4000-8000-000000000001"]) {
      expect(authorize({ id, tenantId: "other", displayName: "Viewer", role: "viewer", isSuperAdmin: true } as any,
        "device:configure", resource, store.nodes, [])).toMatchObject({ allowed: false });
    }
    expect(authorize({ id: "admin", tenantId: "omsystems", displayName: "Admin", role: "super_admin", status: "suspended" },
      "live:view", resource, store.nodes, [])).toMatchObject({ allowed: false });
  });

  it("inherits an allow grant from a region to its cameras", () => {
    const user = store.users.get("user-south-operator")!;
    const camera = store.nodes.get("camera-entrance")!;

    expect(
      authorize(user, "live:view", camera, store.nodes, store.grants),
    ).toMatchObject({ allowed: true, reason: "allowed_by_grant" });
  });

  it("denies an action that was not granted", () => {
    const user = store.users.get("user-south-operator")!;
    const camera = store.nodes.get("camera-entrance")!;

    expect(
      authorize(user, "device:configure", camera, store.nodes, store.grants),
    ).toEqual({ allowed: false, reason: "no_matching_grant" });
  });

  it("lets a narrower explicit deny override an inherited allow", () => {
    const user = store.users.get("user-branch-manager")!;
    const sensitiveCamera = store.nodes.get("camera-cash-room")!;

    expect(
      authorize(
        user,
        "live:view",
        sensitiveCamera,
        store.nodes,
        store.grants,
      ),
    ).toMatchObject({ allowed: false, reason: "explicitly_denied" });
  });

  it("authorizes access via assigned organization scopeNodeId", () => {
    const user = {
      id: "test-user-multi-scope",
      tenantId: "omsystems",
      role: "operator",
      organizations: [
        { id: "uoa-1", scopeNodeId: "A005", isPrimary: true, scopeType: "branch" },
        { id: "uoa-2", scopeNodeId: "A008", isPrimary: false, scopeType: "branch" },
      ],
    } as any;
    const camera = store.nodes.get("camera-entrance")!;

    expect(
      authorize(user, "live:view", camera, store.nodes, store.grants),
    ).toMatchObject({ allowed: true, reason: "allowed_by_grant", matchingScopeId: "A005" });
  });
});

