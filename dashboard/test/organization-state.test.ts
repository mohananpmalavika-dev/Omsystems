import { describe, expect, it } from "vitest";
import { getOrganizationAvailability } from "../lib/organization-state.js";

describe("organization availability", () => {
  it("distinguishes an existing but inaccessible organization from an empty tenant", () => {
    expect(getOrganizationAvailability({
      meta: { organizationExists: true, accessRestricted: true },
    })).toBe("restricted");
  });

  it("allows setup only when the tenant is confirmed empty", () => {
    expect(getOrganizationAvailability({
      meta: { organizationExists: false, accessRestricted: false },
    })).toBe("empty");
  });

  it("enters the administration workspace when nodes are visible", () => {
    expect(getOrganizationAvailability({
      meta: { organizationExists: true, accessRestricted: false },
    })).toBe("ready");
  });
});
