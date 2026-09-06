import { describe, it, expect, beforeEach } from "vitest";
import { EvidenceRepository, appendCustodyEventTx } from "../../src/database/evidence-repository.js";
import type { Pool } from "pg";

/**
 * Creates an in-memory transactional mock pool for chain of custody testing
 */
function createCustodyMockPool() {
  const tables = {
    chain_of_custody_events: [] as any[],
  };

  const advisoryLocks = new Set<string>();

  const executeQuery = async (text: string, params: any[] = []) => {
    const cleanSql = text.trim();

    if (cleanSql === "BEGIN" || cleanSql === "COMMIT" || cleanSql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    // Advisory lock
    if (cleanSql.includes("pg_advisory_xact_lock")) {
      advisoryLocks.add(String(params[0]));
      return { rows: [{ locked: true }], rowCount: 1 };
    }

    // SELECT sequence, event_hash FROM chain_of_custody_events (for previous event)
    if (cleanSql.includes("chain_of_custody_events") && cleanSql.includes("ORDER BY sequence DESC")) {
      const evidenceId = params[0];
      const events = tables.chain_of_custody_events.filter((e) => e.evidence_id === evidenceId);
      if (events.length === 0) {
        return { rows: [], rowCount: 0 };
      }
      const sorted = [...events].sort((a, b) => b.sequence - a.sequence);
      return {
        rows: [{ sequence: sorted[0].sequence, event_hash: sorted[0].event_hash }],
        rowCount: 1,
      };
    }

    // INSERT INTO chain_of_custody_events
    if (cleanSql.includes("INSERT INTO chain_of_custody_events")) {
      const evidenceId = params[1];
      const sequence = Number(params[2]);

      const record = {
        id: params[0],
        evidence_id: evidenceId,
        sequence,
        action: params[3],
        performed_by: params[4],
        actor_type: params[5] || "USER",
        reason: params[6] || null,
        source_ip: params[7] || null,
        workstation_id: params[8] || null,
        event_hash: params[9],
        previous_hash: params[10],
        created_at: new Date(params[11]),
      };
      tables.chain_of_custody_events.push(record);
      return { rows: [record], rowCount: 1 };
    }

    // SELECT * FROM chain_of_custody_events
    if (cleanSql.includes("FROM chain_of_custody_events")) {
      const evidenceId = params[0];
      const events = tables.chain_of_custody_events
        .filter((e) => e.evidence_id === evidenceId)
        .sort((a, b) => a.sequence - b.sequence);
      return { rows: events, rowCount: events.length };
    }

    return { rows: [], rowCount: 0 };
  };

  const createClient = () => {
    return {
      query: (text: string, params: any[] = []) => executeQuery(text, params),
      release: () => {},
    };
  };

  return {
    query: (text: string, params: any[] = []) => executeQuery(text, params),
    connect: async () => createClient(),
    tables,
  };
}

describe("Chain of Custody — Tamper Detection & Cryptographic Matrix", () => {
  let mockPool: ReturnType<typeof createCustodyMockPool>;
  let repo: EvidenceRepository;
  const evidenceId = "ev-investigation-9021";

  beforeEach(async () => {
    mockPool = createCustodyMockPool();
    repo = new EvidenceRepository(mockPool as unknown as Pool);

    // Append 5 sequential custody events in transactions
    const actions: Array<{
      action: any;
      performedBy: string;
      reason: string;
      sourceIp: string;
    }> = [
      { action: "EVIDENCE_CREATED", performedBy: "officer.jones", reason: "Incident reported at ATM 04", sourceIp: "10.0.1.10" },
      { action: "EVIDENCE_ACCESSED", performedBy: "detective.smith", reason: "Preliminary forensic review", sourceIp: "10.0.1.15" },
      { action: "LEGAL_HOLD_APPLIED", performedBy: "counsel.davis", reason: "Subpoena 2026-CV-882", sourceIp: "10.0.2.20" },
      { action: "EXPORT_REQUESTED", performedBy: "forensic.tech", reason: "Court submission package", sourceIp: "10.0.3.30" },
      { action: "HASH_VERIFIED", performedBy: "system.audit", reason: "Scheduled integrity audit", sourceIp: "127.0.0.1" },
    ];

    for (const item of actions) {
      const client = await mockPool.connect();
      await client.query("BEGIN");
      await appendCustodyEventTx(client as any, {
        evidenceId,
        action: item.action,
        performedBy: item.performedBy,
        reason: item.reason,
        sourceIp: item.sourceIp,
      });
      await client.query("COMMIT");
      client.release();
    }
  });

  it("successfully verifies an untampered 5-event custody chain", async () => {
    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(true);
    expect(result.eventCount).toBe(5);
    expect(result.brokenSequence).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("detects tampering with event reason (P0-05)", async () => {
    // Tamper event 3 reason
    mockPool.tables.chain_of_custody_events[2].reason = "Altered subpoena justification";

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(3);
    expect(result.error).toContain("payload tampered");
  });

  it("detects tampering with performed_by actor identity (P0-05)", async () => {
    // Tamper event 2 performer
    mockPool.tables.chain_of_custody_events[1].performed_by = "malicious.insider";

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(2);
    expect(result.error).toContain("payload tampered");
  });

  it("detects tampering with created_at / performedAt timestamp (P0-05)", async () => {
    // Tamper event 4 timestamp (backdating by 2 days)
    const originalTime = mockPool.tables.chain_of_custody_events[3].created_at;
    mockPool.tables.chain_of_custody_events[3].created_at = new Date(originalTime.getTime() - 2 * 86400000);

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(4);
    expect(result.error).toContain("payload tampered");
  });

  it("detects tampering with source_ip audit origin (P0-05)", async () => {
    // Tamper event 1 IP address
    mockPool.tables.chain_of_custody_events[0].source_ip = "192.168.1.99";

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(1);
    expect(result.error).toContain("payload tampered");
  });

  it("detects tampering with action / event_type (P0-05)", async () => {
    // Tamper event 5 action
    mockPool.tables.chain_of_custody_events[4].action = "EVIDENCE_DESTROYED";

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(5);
    expect(result.error).toContain("payload tampered");
  });

  it("detects tampering with cryptographic previous_hash linkage (P0-04)", async () => {
    // Corrupt previous_hash of event 3
    mockPool.tables.chain_of_custody_events[2].previous_hash = "deadbeef".repeat(8);

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(3);
    expect(result.error).toContain("Hash link broken");
  });

  it("detects broken sequence monotonicity (P0-04)", async () => {
    // Change sequence of event 5 to 99
    mockPool.tables.chain_of_custody_events[4].sequence = 99;

    const result = await repo.verifyCustodyChain(evidenceId);
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(99);
    expect(result.error).toContain("Sequence mismatch");
  });
});
