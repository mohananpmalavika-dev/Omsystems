import { describe, expect, it } from "vitest";
import { normalizeDiscoveryCredentialsRequired } from "../src/database/edge-agent-repository.js";

describe("discovery credential state", () => {
  it("treats a decoded stream as authoritative login verification", () => {
    expect(normalizeDiscoveryCredentialsRequired({
      streamVerified: true,
      credentialsRequired: true,
    })).toBe(false);
  });

  it("retains a real credential failure until a stream is verified", () => {
    expect(normalizeDiscoveryCredentialsRequired({
      streamVerified: false,
      credentialsRequired: true,
    })).toBe(true);
    expect(normalizeDiscoveryCredentialsRequired({})).toBeNull();
  });
});
