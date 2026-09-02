import { describe, it, expect } from "vitest";
import { redactConnectionString } from "../../src/config/loopback-guard.js";

describe("Credential Redaction Tests", () => {
  it("redacts passwords in PostgreSQL connection URLs", () => {
    const raw = "postgresql://sentinel_user:SuperSecretPassword123@postgres.service.internal:5432/sentinel_db";
    const redacted = redactConnectionString(raw);
    expect(redacted).not.toContain("SuperSecretPassword123");
    expect(redacted).toContain("sentinel_user:***@postgres.service.internal");
  });

  it("redacts passwords in Redis URLs", () => {
    const raw = "redis://:SuperSecretRedisToken@redis.service.internal:6379/0";
    const redacted = redactConnectionString(raw);
    expect(redacted).not.toContain("SuperSecretRedisToken");
    expect(redacted).toContain("***@redis.service.internal");
  });

  it("leaves URLs without passwords unchanged", () => {
    const raw = "https://control.sentinel.internal:443/api/v1";
    expect(redactConnectionString(raw)).toBe(raw);
  });
});
