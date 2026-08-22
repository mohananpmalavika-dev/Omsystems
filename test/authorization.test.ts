import { describe, expect, it } from "vitest";
import { authorize } from "../src/domain/authorization.js";
import { MemoryStore } from "../src/store.js";

describe("hierarchical authorization", () => {
  const store = new MemoryStore();

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
});
