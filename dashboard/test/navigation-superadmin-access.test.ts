import { describe, expect, it } from "vitest";
import { hasUnrestrictedMenuAccess } from "../lib/navigation-access.js";

describe("super-admin navigation access", () => {
  it.each([
    { username: "platform-admin", role: "super_admin" },
    { username: "krypton", role: "super_admin" },
  ])("recognizes $username as an unrestricted platform administrator", (user) => {
    expect(hasUnrestrictedMenuAccess(user)).toBe(true);
  });

  it("keeps normal operational roles scoped to their workspace", () => {
    expect(hasUnrestrictedMenuAccess({ username: "operator-1", role: "operator" })).toBe(false);
    expect(hasUnrestrictedMenuAccess({ username: "krypton", role: "viewer" })).toBe(false);
  });

  it("does not grant access based on a username", () => {
    expect(hasUnrestrictedMenuAccess({ username: "mgdhanyamohan", role: "viewer" })).toBe(false);
  });
});
