import { describe, expect, it, vi } from "vitest";
import { executeMigration } from "../scripts/run-migrations.mjs";

describe("migration transaction truth", () => {
  it("never records a rolled-back duplicate-object migration as applied", async () => {
    const calls: string[] = [];
    const client = { query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes("CREATE TYPE resource_node_type")) throw Object.assign(new Error('type already exists'), { code: '42710' });
      return { rows: [] };
    }) };
    await expect(executeMigration(client, "001_initial.sql")).rejects.toThrow("Migration 001_initial.sql failed");
    expect(calls[0]).toBe("BEGIN");
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(calls.some(sql => sql.includes("INSERT INTO schema_migrations"))).toBe(false);
    expect(calls).not.toContain("COMMIT");
  });

  it("commits the schema and applied record in the same transaction", async () => {
    const calls: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { calls.push(sql); return { rows: [] }; }) };
    await executeMigration(client, "001_initial.sql");
    expect(calls[0]).toBe("BEGIN");
    expect(calls.at(-1)).toBe("COMMIT");
    expect(calls.at(-2)).toContain("INSERT INTO schema_migrations");
  });
});
