import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/security/password.js";

describe("employee password hashing", () => {
  it("stores a salted scrypt hash and verifies only the correct password", async () => {
    const encoded = await hashPassword("Correct Horse Battery Staple");

    expect(encoded).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    expect(encoded).not.toContain("Correct Horse Battery Staple");
    await expect(
      verifyPassword("Correct Horse Battery Staple", encoded),
    ).resolves.toBe(true);
    await expect(verifyPassword("incorrect", encoded)).resolves.toBe(false);
  });

  it("rejects missing and unsupported password records", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(
      verifyPassword("anything", "bcrypt$not-supported"),
    ).resolves.toBe(false);
  });
});
