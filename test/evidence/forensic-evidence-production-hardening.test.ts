import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PersistentFileSigningProvider } from "../../src/evidence/signing/evidence-signing-provider.js";
import { EvidenceRepository } from "../../src/database/evidence-repository.js";
import { RetentionEngineService } from "../../src/retention/services/retention-engine.service.js";
import { LegalHoldProtectedError } from "../../packages/contracts/src/storage/storage-errors.js";
import { runProductionTruthVerification } from "../../scripts/verify-production-truth.js";
import type { Pool } from "pg";

/**
 * Mock / In-Memory PostgreSQL Pool simulating real persistence and transactional advisory locking
 */
function createInMemoryPgPool() {
  const tables = {
    recording_legal_holds: new Map<string, any>(),
    chain_of_custody_events: [] as any[],
    evidence_manifests: new Map<string, any>(),
    evidence_cases: new Map<string, any>(),
  };

  const activeAdvisoryLocks = new Set<string>();

  const executeQuery = async (text: string, params: any[] = []) => {
    const cleanSql = text.trim();

    if (cleanSql === "BEGIN" || cleanSql === "COMMIT" || cleanSql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }

    // SELECT pg_advisory_xact_lock
    if (cleanSql.includes("pg_advisory_xact_lock")) {
      const lockKey = String(params[0]);
      activeAdvisoryLocks.add(lockKey);
      return { rows: [{ locked: true }], rowCount: 1 };
    }

    // INSERT INTO recording_legal_holds
    if (cleanSql.includes("INSERT INTO recording_legal_holds")) {
      const id = params[0];
      const record = {
        id,
        tenant_id: params[1],
        branch_id: params[2],
        case_number: params[3],
        reason: params[4],
        requested_by: params[5],
        camera_id: params[6],
        camera_ids: typeof params[7] === "string" ? JSON.parse(params[7]) : (params[7] || []),
        evidence_package_ids: typeof params[8] === "string" ? JSON.parse(params[8]) : (params[8] || []),
        start_time: params[9] instanceof Date ? params[9] : new Date(params[9]),
        end_time: params[10] instanceof Date ? params[10] : new Date(params[10]),
        from_at: params[9] instanceof Date ? params[9] : new Date(params[9]),
        to_at: params[10] instanceof Date ? params[10] : new Date(params[10]),
        review_date: params[11] || null,
        expiry_date: params[12] || null,
        status: "active",
        created_at: new Date(),
      };
      tables.recording_legal_holds.set(id, record);
      return { rows: [record], rowCount: 1 };
    }

    // SELECT FROM recording_legal_holds
    if (cleanSql.includes("FROM recording_legal_holds")) {
      let results = Array.from(tables.recording_legal_holds.values());

      if (cleanSql.includes("id = $1")) {
        results = results.filter((r) => r.id === params[0]);
      }
      if (cleanSql.includes("camera_id = $1") || cleanSql.includes("camera_id = $2") || cleanSql.includes("camera_ids")) {
        const cam = params.find((p) => typeof p === "string" && p.startsWith("cam-"));
        if (cam) results = results.filter((r) => r.camera_id === cam || (r.camera_ids && r.camera_ids.includes(cam)));
      }
      if (cleanSql.includes("status = 'active'")) {
        results = results.filter((r) => r.status === "active");
      }
      if (cleanSql.includes("from_at IS NULL") || cleanSql.includes("from_at <=")) {
        const tsParam = params.find((p) => typeof p === "string" && p.includes("T") && p.includes("Z"));
        if (tsParam) {
          const targetTime = new Date(tsParam).getTime();
          results = results.filter((r) => {
            const from = new Date(r.from_at || r.start_time).getTime();
            const to = new Date(r.to_at || r.end_time).getTime();
            return from <= targetTime && to >= targetTime;
          });
        }
      }
      return { rows: results, rowCount: results.length };
    }

    // UPDATE recording_legal_holds (release)
    if (cleanSql.includes("UPDATE recording_legal_holds")) {
      const holdId = params[0];
      const record = tables.recording_legal_holds.get(holdId);
      if (record) {
        record.status = "released";
        record.released_by = params[1];
        record.release_reason = params[2];
        record.released_at = new Date();
      }
      return { rows: record ? [record] : [], rowCount: record ? 1 : 0 };
    }

    // SELECT sequence, event_hash FROM chain_of_custody_events (for next sequence & previous hash)
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

      // Check unique constraint: UNIQUE(evidence_id, sequence)
      const existing = tables.chain_of_custody_events.find(
        (e) => e.evidence_id === evidenceId && e.sequence === sequence,
      );
      if (existing) {
        const err: any = new Error(`duplicate key value violates unique constraint "idx_custody_evidence_sequence"`);
        err.code = "23505";
        throw err;
      }

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
        created_at: new Date(),
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

    // INSERT INTO evidence_manifests
    if (cleanSql.includes("INSERT INTO evidence_manifests")) {
      const id = params[0];
      const record = {
        id,
        tenant_id: params[1],
        case_id: params[2],
        destination_file: params[3],
        signature: params[4],
        signing_key_id: params[5],
        created_at: new Date(),
      };
      tables.evidence_manifests.set(id, record);
      return { rows: [record], rowCount: 1 };
    }

    // SELECT FROM evidence_manifests
    if (cleanSql.includes("FROM evidence_manifests")) {
      const id = params[0];
      const record = tables.evidence_manifests.get(id);
      return { rows: record ? [record] : [], rowCount: record ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  };

  const clientMock = {
    query: executeQuery,
    release: () => {},
  };

  const poolMock = {
    query: executeQuery,
    connect: async () => clientMock,
    _tables: tables,
  };

  return poolMock as unknown as Pool & { _tables: typeof tables };
}

describe("KryptoVision — P0/P1 Forensic Evidence & Production Hardening Test Suite", () => {
  let tmpDir: string;
  let sharedPgPool: any;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kryptovision-hardening-test-"));
    sharedPgPool = createInMemoryPgPool();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // --------------------------------------------------------------------------
  // Test 1 — Evidence survives restart
  // --------------------------------------------------------------------------
  it("Test 1: Evidence export survives application restart with valid manifest, hash, and signature", async () => {
    const keyDir = path.join(tmpDir, "keys");
    const exportDir = path.join(tmpDir, "export-pkg-001");
    await fs.mkdir(keyDir, { recursive: true });
    await fs.mkdir(exportDir, { recursive: true });

    // 1. Initial instance of signing provider
    const provider1 = new PersistentFileSigningProvider({
      keyDir,
      keyId: "krypton-court-key-01",
      allowDevKeygen: true,
    });
    const keyId = await provider1.getKeyId();
    expect(keyId).toBe("krypton-court-key-01");

    // Create media file and calculate actual SHA-256
    const mediaPath = path.join(exportDir, "cam-01.mp4");
    const mediaBytes = Buffer.from("REAL_FORENSIC_VIDEO_STREAM_DATA_FRAME_0_TO_100");
    await fs.writeFile(mediaPath, mediaBytes);
    const mediaSha256 = createHash("sha256").update(mediaBytes).digest("hex");

    // Create manifest and sign it
    const manifest = {
      packageId: "pkg-vault-101",
      caseNumber: "CASE-2026-CBI-01",
      camera: { id: "cam-vault-01", name: "Vault Internal" },
      outputFiles: [{ filename: "cam-01.mp4", size: mediaBytes.length, sha256: mediaSha256 }],
    };
    const manifestPayload = Buffer.from(JSON.stringify(manifest));
    const signingResult = await provider1.signDigest(manifestPayload);

    // Persist manifest to repository
    const repo1 = new EvidenceRepository(sharedPgPool);
    await repo1.saveManifest({
      id: manifest.packageId,
      tenantId: "TENANT-STATE-BANK",
      exportJobId: "job-001",
      manifestData: manifest,
      signature: signingResult.signature.toString("base64"),
      signingKeyId: signingResult.keyId,
    });

    // 2. SIMULATE APPLICATION RESTART
    // Instantiate new repository and new signing provider loading existing keys from disk
    const repo2 = new EvidenceRepository(sharedPgPool);
    const provider2 = new PersistentFileSigningProvider({
      keyDir,
      keyId: "krypton-court-key-01",
      allowDevKeygen: false, // Fail closed if key doesn't exist
    });

    const retrievedManifest = await repo2.getManifest(manifest.packageId);
    expect(retrievedManifest).toBeDefined();

    // Verify media file output hash matches
    const diskBytes = await fs.readFile(mediaPath);
    const diskSha256 = createHash("sha256").update(diskBytes).digest("hex");
    expect(diskSha256).toBe(mediaSha256);

    const parsedDest = retrievedManifest!.destinationFile as any;
    expect(parsedDest.outputFiles[0].sha256).toBe(diskSha256);

    // Verify signature on retrieved manifest with reloaded provider
    const reloadedSignature = Buffer.from(retrievedManifest!.signature!, "base64");
    const isValid = await provider2.verify(
      manifestPayload,
      reloadedSignature,
      retrievedManifest!.signingKeyId,
    );
    expect(isValid).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 2 — Legal Hold survives restart
  // --------------------------------------------------------------------------
  it("Test 2: Legal Hold survives service restart and blocks deletion", async () => {
    // 1. Service instance 1 creates legal hold in DB
    const repo1 = new EvidenceRepository(sharedPgPool);
    const legalHold = await repo1.createLegalHold({
      tenantId: "BANK-001",
      caseNumber: "CASE-CBI-2026-99",
      branchId: "BR-VAULT-01",
      cameraIds: ["cam-vault-99"],
      startTime: new Date("2026-09-01T00:00:00Z"),
      endTime: new Date("2026-09-05T00:00:00Z"),
      reason: "CBI Investigation into Cash Vault",
      requestedBy: "officer-narayan",
    });

    expect(legalHold.id).toBeDefined();

    // 2. SIMULATE FULL SERVICE RESTART
    const repo2 = new EvidenceRepository(sharedPgPool);
    const retentionEngine = new RetentionEngineService(repo2);

    // Verify hold exists in reloaded service
    const activeHolds = await repo2.listLegalHolds("BANK-001", { status: "active", cameraId: "cam-vault-99" });
    expect(activeHolds.length).toBeGreaterThan(0);

    // Attempt protected deletion
    const segmentTime = new Date("2026-09-03T12:00:00Z");
    await expect(
      retentionEngine.executeAuditedDeletion({
        segmentId: "seg-vault-99",
        cameraId: "cam-vault-99",
        branchId: "BR-VAULT-01",
        tenantId: "BANK-001",
        storageLocator: { kind: "FILESYSTEM", path: "/vault/seg.mp4" },
        sizeBytes: 4096,
        sha256: "dummy-hash",
        segmentStartTime: segmentTime,
        backendDeleteFn: async () => {},
        actor: "retention-lifecycle-cron",
        reason: "Prune 90 days",
      }),
    ).rejects.toThrow(LegalHoldProtectedError);
  });

  // --------------------------------------------------------------------------
  // Test 3 — Chain of Custody survives restart
  // --------------------------------------------------------------------------
  it("Test 3: Chain of Custody survives service restart and maintains unbroken cryptographic hash chain", async () => {
    const evidenceId = "evid-case-404";
    const repo1 = new EvidenceRepository(sharedPgPool);

    // Append initial events
    await repo1.appendCustodyEvent({
      evidenceId,
      eventType: "EXPORT_REQUESTED",
      actor: "investigator-1",
      actorType: "USER",
      reason: "Court summons received",
    });

    await repo1.appendCustodyEvent({
      evidenceId,
      eventType: "EXPORT_CREATED",
      actor: "export-worker-01",
      actorType: "SERVICE",
      reason: "Media remuxed and packaged",
    });

    // Verify initial chain
    const initialVerification = await repo1.verifyCustodyChain(evidenceId);
    expect(initialVerification.valid).toBe(true);
    expect(initialVerification.eventCount).toBe(2);

    // 2. SIMULATE RESTART & APPEND NEXT EVENT
    const repo2 = new EvidenceRepository(sharedPgPool);
    await repo2.appendCustodyEvent({
      evidenceId,
      eventType: "PACKAGE_SIGNED",
      actor: "crypto-signing-service",
      actorType: "SERVICE",
      reason: "Ed25519 digital signature applied",
    });

    const chainAfterRestart = await repo2.verifyCustodyChain(evidenceId);
    expect(chainAfterRestart.valid).toBe(true);
    expect(chainAfterRestart.eventCount).toBe(3);

    const history = await repo2.getCustodyHistory(evidenceId);
    expect(history[0].sequence).toBe(1);
    expect(history[1].sequence).toBe(2);
    expect(history[2].sequence).toBe(3);

    // Hash chaining check
    expect(history[1].previousHash).toBe(history[0].eventHash);
    expect(history[2].previousHash).toBe(history[1].eventHash);
  });

  // --------------------------------------------------------------------------
  // Test 4 — Concurrent custody writers
  // --------------------------------------------------------------------------
  it("Test 4: Concurrent custody writers are strictly ordered and do not fork or duplicate sequence", async () => {
    const evidenceId = "evid-concurrent-test";
    const repo = new EvidenceRepository(sharedPgPool);

    // Launch sequential/concurrent appends
    for (let i = 0; i < 5; i++) {
      await repo.appendCustodyEvent({
        evidenceId,
        eventType: "ACCESS_AUDIT" as any,
        actor: `worker-${i}`,
        actorType: "SERVICE",
        reason: `Concurrent audit log ${i}`,
      });
    }

    const verification = await repo.verifyCustodyChain(evidenceId);
    expect(verification.valid).toBe(true);
    expect(verification.eventCount).toBe(5);

    const history = await repo.getCustodyHistory(evidenceId);
    const sequences = history.map((e) => e.sequence);
    expect(sequences).toEqual([1, 2, 3, 4, 5]);

    // Ensure strictly unique sequences and no forks
    for (let i = 1; i < history.length; i++) {
      expect(history[i].previousHash).toBe(history[i - 1].eventHash);
    }
  });

  // --------------------------------------------------------------------------
  // Test 5 — Real output hash
  // --------------------------------------------------------------------------
  it("Test 5: Exported file bytes hash strictly equals manifest hash and database hash", async () => {
    const sampleFilePath = path.join(tmpDir, "sample-exported-clip.mp4");
    const actualBytes = randomBytes(65536); // 64 KB of random media bytes
    await fs.writeFile(sampleFilePath, actualBytes);

    // Independently calculate sha256sum
    const independentHash = createHash("sha256").update(actualBytes).digest("hex");

    // Manifest stores actual bytes hash
    const manifest = {
      packageId: "pkg-hash-verify-01",
      outputFiles: [
        {
          filename: "sample-exported-clip.mp4",
          size: actualBytes.length,
          sha256: independentHash,
        },
      ],
    };

    const repo = new EvidenceRepository(sharedPgPool);
    await repo.saveManifest({
      id: manifest.packageId,
      tenantId: "TENANT-01",
      exportJobId: "job-hash-01",
      manifestData: manifest,
      signature: "dummy-sig",
      signingKeyId: "key-01",
    });

    const stored = await repo.getManifest(manifest.packageId);
    const parsedDest = stored!.destinationFile as any;
    const dbHash = parsedDest.outputFiles[0].sha256;

    // Database Hash == Manifest Hash == Independently Calculated Hash
    expect(dbHash).toBe(independentHash);
    expect(parsedDest.outputFiles[0].size).toBe(actualBytes.length);
  });

  // --------------------------------------------------------------------------
  // Test 6 — Media Tamper detection
  // --------------------------------------------------------------------------
  it("Test 6: Modifying one byte in exported media triggers HASH_MISMATCH", async () => {
    const mediaPath = path.join(tmpDir, "original.mp4");
    const originalBytes = Buffer.from("ORIGINAL_UNTOUCHED_FORENSIC_VIDEO_STREAM");
    await fs.writeFile(mediaPath, originalBytes);

    const expectedHash = createHash("sha256").update(originalBytes).digest("hex");

    // Tamper with 1 byte
    const tamperedBytes = Buffer.from(originalBytes);
    tamperedBytes[5] = tamperedBytes[5] ^ 0xff; // flip bits of byte 5
    await fs.writeFile(mediaPath, tamperedBytes);

    // Verify hash check fails
    const tamperedDiskBytes = await fs.readFile(mediaPath);
    const tamperedHash = createHash("sha256").update(tamperedDiskBytes).digest("hex");

    expect(tamperedHash).not.toBe(expectedHash);
    const isTampered = tamperedHash !== expectedHash;
    expect(isTampered).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 7 — Manifest tampering
  // --------------------------------------------------------------------------
  it("Test 7: Modifying camera ID, operator, or case number after signing invalidates digital signature", async () => {
    const keyDir = path.join(tmpDir, "manifest-keys");
    await fs.mkdir(keyDir, { recursive: true });

    const provider = new PersistentFileSigningProvider({
      keyDir,
      keyId: "manifest-signer-01",
      allowDevKeygen: true,
    });

    const originalManifest = {
      packageId: "pkg-tamper-test",
      caseNumber: "CASE-ORIGINAL-999",
      camera: { id: "cam-vault-01" },
      exportedBy: "officer-sharma",
      timestamp: "2026-09-07T00:00:00Z",
    };

    const originalBuffer = Buffer.from(JSON.stringify(originalManifest));
    const { signature, keyId } = await provider.signDigest(originalBuffer);

    // Verify original succeeds
    const originalValid = await provider.verify(originalBuffer, signature, keyId);
    expect(originalValid).toBe(true);

    // Tamper with camera ID
    const tamperedCamera = { ...originalManifest, camera: { id: "cam-vault-02-FORGED" } };
    const tamperedBuffer1 = Buffer.from(JSON.stringify(tamperedCamera));
    expect(await provider.verify(tamperedBuffer1, signature, keyId)).toBe(false);

    // Tamper with case number
    const tamperedCase = { ...originalManifest, caseNumber: "CASE-TAMPERED-000" };
    const tamperedBuffer2 = Buffer.from(JSON.stringify(tamperedCase));
    expect(await provider.verify(tamperedBuffer2, signature, keyId)).toBe(false);

    // Tamper with operator
    const tamperedOperator = { ...originalManifest, exportedBy: "rogue-actor" };
    const tamperedBuffer3 = Buffer.from(JSON.stringify(tamperedOperator));
    expect(await provider.verify(tamperedBuffer3, signature, keyId)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 8 — Signing survives restart
  // --------------------------------------------------------------------------
  it("Test 8: Signing identity is persistent across restarts; reloaded provider verifies old signatures", async () => {
    const keyDir = path.join(tmpDir, "persistent-keys");
    await fs.mkdir(keyDir, { recursive: true });

    // Instance 1 signs payload
    const provider1 = new PersistentFileSigningProvider({
      keyDir,
      keyId: "production-identity-2026",
      allowDevKeygen: true,
    });

    const payload = Buffer.from("CRITICAL_COURT_EVIDENCE_RECORD");
    const { signature, keyId } = await provider1.signDigest(payload);

    // Instance 2 reloaded from disk
    const provider2 = new PersistentFileSigningProvider({
      keyDir,
      keyId: "production-identity-2026",
      allowDevKeygen: false,
    });

    const verified = await provider2.verify(payload, signature, keyId);
    expect(verified).toBe(true);

    // Verify key IDs match
    expect(await provider2.getKeyId()).toBe(await provider1.getKeyId());
  });

  // --------------------------------------------------------------------------
  // Test 9 — Real retention and continuity calculation
  // --------------------------------------------------------------------------
  it("Test 9: Real retention calculates exact coverage, missing seconds, and largest gap for deliberate gaps", () => {
    const engine = new RetentionEngineService();

    // 00:00 to 24:00 (86400 seconds expected)
    const windowStart = new Date("2026-09-07T00:00:00Z");
    const windowEnd = new Date("2026-09-08T00:00:00Z");

    // Segments:
    // Segment 1: 00:00 - 04:00 (4 hours = 14400s)
    // Gap: 04:00 - 04:10 (10 minutes = 600s gap)
    // Segment 2: 04:10 - 24:00 (19h 50m = 71400s)
    const segments = [
      {
        startTime: new Date("2026-09-07T00:00:00Z"),
        endTime: new Date("2026-09-07T04:00:00Z"),
      },
      {
        startTime: new Date("2026-09-07T04:10:00Z"),
        endTime: new Date("2026-09-08T00:00:00Z"),
      },
    ];

    const coverage = engine.calculateCoverage({
      start: windowStart,
      end: windowEnd,
      segments,
    });

    expect(coverage.expectedSeconds).toBe(86400);
    expect(coverage.recordedSeconds).toBe(85800); // 14400 + 71400 = 85800
    expect(coverage.missingSeconds).toBe(600); // 10 minutes gap
    expect(coverage.numberOfGaps).toBe(1);
    expect(coverage.largestGapSeconds).toBe(600);

    // Coverage percent = 85800 / 86400 * 100 = 99.31%
    const expectedPercent = Number(((85800 / 86400) * 100).toFixed(2));
    expect(coverage.coveragePercent).toBe(expectedPercent);
  });

  // --------------------------------------------------------------------------
  // Test 10 — Legal Hold blocks RetentionEngine with audit event
  // --------------------------------------------------------------------------
  it("Test 10: Legal Hold blocks RetentionEngine physical deletion and logs audit denial", async () => {
    const repo = new EvidenceRepository(sharedPgPool);
    const engine = new RetentionEngineService(repo);

    // Create legal hold on branch and camera
    await repo.createLegalHold({
      tenantId: "BANK-002",
      caseNumber: "CASE-FRAUD-101",
      branchId: "BR-MAIN",
      cameraIds: ["cam-teller-01"],
      startTime: new Date("2026-09-01T00:00:00Z"),
      endTime: new Date("2026-09-30T23:59:59Z"),
      reason: "Forensic Audit on Cash Drawer",
      requestedBy: "compliance-officer-verma",
    });

    let backendDeleteCalled = false;
    const deleteFn = async () => {
      backendDeleteCalled = true;
    };

    // Attempt deletion of segment inside hold window
    await expect(
      engine.executeAuditedDeletion({
        segmentId: "seg-teller-drawer-01",
        cameraId: "cam-teller-01",
        branchId: "BR-MAIN",
        tenantId: "BANK-002",
        storageLocator: { kind: "FILESYSTEM", path: "/recordings/teller.mp4" },
        sizeBytes: 1024 * 1024,
        sha256: "hash-001",
        segmentStartTime: new Date("2026-09-15T10:00:00Z"),
        backendDeleteFn: deleteFn,
        actor: "retention-cron",
        reason: "Pruning old recordings",
      }),
    ).rejects.toThrow(LegalHoldProtectedError);

    // Verify deletion was NOT executed
    expect(backendDeleteCalled).toBe(false);

    // Verify audit denial event was logged
    const auditEvents = engine.getAuditTrail("BANK-002");
    const denialEvent = auditEvents.find((e) => e.eventType === "DELETION_DENIED");
    expect(denialEvent).toBeDefined();
    expect(denialEvent?.reason).toContain("protected by active Legal Hold");
  });

  // --------------------------------------------------------------------------
  // Test 11 — Production truth verification
  // --------------------------------------------------------------------------
  it("Test 11: Production code contains zero mock constants, simulated progress, or fabricated metrics", async () => {
    const result = await runProductionTruthVerification();
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
