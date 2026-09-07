import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { appendCustodyEventTx, EvidenceRepository } from "../../src/database/evidence-repository.js";
import { canonicalJsonStringify } from "../../src/evidence-export/services/canonical-json.js";

describe("PostgreSQL Chain of Custody High-Concurrency Verification (P0-18)", () => {
  const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/sentinel_test";
  let pool: Pool | null = null;
  let isPgAvailable = false;

  beforeAll(async () => {
    try {
      pool = new Pool({
        connectionString: dbUrl,
        max: 25,
        connectionTimeoutMillis: 3000,
      });
      const client = await pool.connect();
      // Verify PostgreSQL connection and advisory lock capability
      const res = await client.query("SELECT version(), pg_advisory_xact_lock(1)");
      client.release();
      isPgAvailable = true;
      console.log(`Live PostgreSQL detected: ${res.rows[0].version}`);

      // Ensure test tables exist in test database
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chain_of_custody_events (
          id UUID PRIMARY KEY,
          evidence_id VARCHAR(255) NOT NULL,
          sequence INTEGER NOT NULL,
          action VARCHAR(100) NOT NULL,
          performed_by VARCHAR(255) NOT NULL,
          actor_type VARCHAR(50) DEFAULT 'USER',
          reason TEXT,
          source_ip VARCHAR(100),
          workstation_id VARCHAR(100),
          event_hash VARCHAR(64) NOT NULL,
          previous_hash VARCHAR(64),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_custody_evidence_sequence UNIQUE (evidence_id, sequence)
        );
        CREATE INDEX IF NOT EXISTS idx_custody_evidence_seq ON chain_of_custody_events (evidence_id, sequence DESC);
      `);
    } catch {
      isPgAvailable = false;
      console.warn("Live PostgreSQL not reachable on DATABASE_URL. Real concurrency integration test requires active PG container.");
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  it("proves 20 concurrent connections appending 1000 events produce strictly ordered 1..1000 sequence with zero forks or duplicate sequences", async () => {
    if (!isPgAvailable || !pool) {
      console.warn("Skipping real PG concurrency test: PostgreSQL container is not running in local environment.");
      return;
    }

    const evidenceId = `ev-concurrency-${randomUUID()}`;
    const totalEvents = 1000;
    const workerCount = 20;

    // Launch parallel concurrent workers targeting the EXACT same evidenceId
    const eventsPerWorker = totalEvents / workerCount;
    const workerPromises: Promise<any>[] = [];

    const startTime = Date.now();

    for (let w = 0; w < workerCount; w++) {
      const workerId = `worker-${w}`;
      const workerTask = async () => {
        for (let e = 0; e < eventsPerWorker; e++) {
          const client = await pool!.connect();
          try {
            await client.query("BEGIN");
            await appendCustodyEventTx(client, {
              evidenceId,
              action: "evidence_accessed",
              performedBy: `${workerId}-agent`,
              actorType: "SERVICE",
              reason: `High concurrency stress event ${w}-${e}`,
              sourceIp: `10.0.${w}.${e % 250}`,
              workstationId: `WS-STRESS-${w}`,
            });
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
          } finally {
            client.release();
          }
        }
      };
      workerPromises.push(workerTask());
    }

    // Await completion of all 20 parallel workers
    await Promise.all(workerPromises);
    const durationMs = Date.now() - startTime;
    console.log(`Appended ${totalEvents} concurrent custody events across ${workerCount} connections in ${durationMs}ms`);

    // Verify the committed ledger using EvidenceRepository
    const repo = new EvidenceRepository(pool);
    const verification = await repo.verifyCustodyChain(evidenceId);

    expect(verification.valid).toBe(true);
    expect(verification.eventCount).toBe(totalEvents);
    expect(verification.brokenSequence).toBeUndefined();

    // Query raw rows and verify exact sequence, hash linkage, and hash recomputations
    const rawRes = await pool.query(
      `SELECT * FROM chain_of_custody_events WHERE evidence_id = $1 ORDER BY sequence ASC`,
      [evidenceId],
    );

    expect(rawRes.rows.length).toBe(totalEvents);

    let prevHash = "0".repeat(64);
    for (let i = 0; i < totalEvents; i++) {
      const row = rawRes.rows[i];
      const expectedSeq = i + 1;

      // 1. Strict sequence monotonicity: no missing numbers, no duplicates
      expect(Number(row.sequence)).toBe(expectedSeq);

      // 2. Exact previous_hash linkage
      if (i === 0) {
        expect(row.previous_hash).toBeNull();
      } else {
        expect(row.previous_hash).toBe(prevHash);
      }

      // 3. Recompute SHA-256 event_hash independently
      const canonicalPayload = canonicalJsonStringify({
        action: row.action,
        actorType: row.actor_type,
        evidenceId: row.evidence_id,
        performedBy: row.performed_by,
        previousHash: row.previous_hash || "0".repeat(64),
        reason: row.reason,
        sequence: row.sequence,
        sourceIp: row.source_ip,
        timestamp: row.created_at.toISOString(),
        workstationId: row.workstation_id,
      });

      const recomputedHash = createHash("sha256")
        .update(canonicalPayload + (row.previous_hash || "0".repeat(64)))
        .digest("hex");

      expect(row.event_hash).toBe(recomputedHash);
      prevHash = row.event_hash;
    }
  });
});
