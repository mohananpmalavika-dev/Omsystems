import { describe, expect, it, vi } from "vitest";
import { RecordingIndexRepository } from "../src/recording-index/recording-index.repository.js";

describe("recording vault isolation", () => {
  it("scopes overlapping segment searches to the authenticated tenant's cameras", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const repository = new RecordingIndexRepository(pool);

    await repository.findOverlappingSegments({
      tenantId: "11111111-1111-4111-8111-111111111111",
      cameraIds: ["22222222-2222-4222-8222-222222222222"],
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-01T01:00:00.000Z"),
    });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("c.tenant_id = $4");
    expect(params[3]).toBe("11111111-1111-4111-8111-111111111111");
  });
});
