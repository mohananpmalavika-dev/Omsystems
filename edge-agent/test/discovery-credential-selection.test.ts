import { describe, expect, it } from "vitest";
import { newestDiscoveryCredential } from "../src/security/discovery-credential-selection.js";

describe("discovery credential selection", () => {
  it("retains a newer scanner login after the targeted scan", () => {
    const database = { username: "old", password: "old-password", updatedAt: "2026-09-30T00:00:00.000Z" };
    const local = { username: "new", password: "new-password", updatedAt: "2026-10-01T00:00:00.000Z" };
    expect(newestDiscoveryCredential(database, local)).toEqual(local);
    expect(newestDiscoveryCredential(local, database)).toEqual(local);
  });
});
