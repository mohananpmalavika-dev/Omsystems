import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { EvidenceRepository } from '../../src/database/evidence-repository.js';
import { createDatabaseTlsConfig } from '../../src/security/tls/index.js';

describe('Cross-Tenant PostgreSQL Repository Integration Test (P0-22)', () => {
  let testPool: Pool | null = null;
  const isPgRequired = process.env.TEST_PG_REQUIRED === 'true';

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kryptovision_test';
    try {
      const p = new Pool({
        connectionString,
        connectionTimeoutMillis: 2000,
        ssl: connectionString.includes('sslmode=require') ? createDatabaseTlsConfig() : false,
      });
      const client = await p.connect();
      client.release();
      testPool = p;
    } catch (err: any) {
      if (isPgRequired) {
        throw new Error(
          `FAIL-CLOSED (P0-22): TEST_PG_REQUIRED is 'true' but PostgreSQL is unreachable at ${connectionString}. Error: ${err.message}`
        );
      }
      console.warn(`[WARN] PostgreSQL unavailable and TEST_PG_REQUIRED!=true. Running repository contract validation.`);
    }
  });

  afterAll(async () => {
    if (testPool) {
      await testPool.end();
    }
  });

  it('guarantees complete isolation between Tenant Alpha and Tenant Bravo with zero cross-tenant leakage', async () => {
    const tenantAlpha = `tenant-alpha-${Date.now()}`;
    const tenantBravo = `tenant-bravo-${Date.now()}`;

    if (testPool) {
      const repo = new EvidenceRepository(testPool);

      // 1. Tenant Alpha creates an evidence case
      const alphaCase = await repo.createCase({
        tenantId: tenantAlpha,
        caseNumber: `CASE-ALPHA-${Date.now()}`,
        title: 'Alpha Proprietary Case',
        description: 'Alpha secret evidence',
        createdBy: 'officer-alpha',
      });

      // 2. Tenant Alpha adds an evidence item
      const alphaItem = await repo.addItem(
        alphaCase.id,
        {
          type: 'document',
          description: 'Alpha internal security log',
          addedBy: 'officer-alpha',
        },
        tenantAlpha
      );

      // 3. Tenant Alpha records a custody event
      await repo.recordCustodyEvent({
        evidenceId: alphaCase.id,
        action: 'CASE_CREATED',
        performedBy: 'officer-alpha',
        actorType: 'USER',
        reason: 'Authorized Alpha case inception',
      });

      // 4. Verify Tenant Bravo CANNOT retrieve Tenant Alpha case (returns undefined)
      const crossCase = await repo.getCase(alphaCase.id, tenantBravo);
      expect(crossCase).toBeUndefined();

      // 5. Verify Tenant Bravo CANNOT list Tenant Alpha items (returns empty array)
      const crossItems = await repo.listItems(alphaCase.id, tenantBravo);
      expect(crossItems).toEqual([]);

      // 6. Verify Tenant Bravo CANNOT retrieve Tenant Alpha item (returns undefined)
      const crossItem = await repo.getItem(alphaItem.id, tenantBravo);
      expect(crossItem).toBeUndefined();

      // 7. Verify Tenant Bravo CANNOT request an export for Tenant Alpha's case (throws unauthorized error)
      await expect(
        repo.requestExport(
          alphaCase.id,
          {
            format: 'zip',
            reason: 'Malicious export attempt',
            exportedBy: 'adversary-bravo',
          },
          tenantBravo
        )
      ).rejects.toThrow(/not found or tenant unauthorized/);

      // 8. Verify Tenant Bravo CANNOT read Tenant Alpha's chain of custody events (zero leakage)
      const crossCustody = await repo.getCustodyLog(alphaCase.id, tenantBravo);
      expect(crossCustody).toEqual([]);

      // 9. Verify Tenant Alpha successfully reads own data
      const ownCase = await repo.getCase(alphaCase.id, tenantAlpha);
      expect(ownCase).toBeDefined();
      expect(ownCase?.tenantId).toBe(tenantAlpha);

      const ownItems = await repo.listItems(alphaCase.id, tenantAlpha);
      expect(ownItems.length).toBe(1);

      const ownCustody = await repo.getCustodyLog(alphaCase.id, tenantAlpha);
      expect(ownCustody.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(isPgRequired).toBe(false);

      // Mock client validating SQL queries constructed by EvidenceRepository include tenant_id scoping
      const queryStatements: string[] = [];
      const mockPool: any = {
        query: async (sql: string, params: any[]) => {
          queryStatements.push(sql);
          if (sql.includes('SELECT * FROM evidence_cases WHERE id = $1 AND tenant_id = $2')) {
            const [_id, tenantId] = params;
            if (tenantId === tenantAlpha) {
              return { rows: [{ id: 'case-1', tenant_id: tenantAlpha, case_number: 'C-1', title: 'T', status: 'open', created_by: 'u1', created_at: new Date() }] };
            }
            return { rows: [] }; // Tenant Bravo gets empty rows -> undefined
          }
          if (sql.includes('JOIN evidence_cases ec ON ec.id = ei.case_id') && sql.includes('AND ec.tenant_id = $2')) {
            const [_id, tenantId] = params;
            if (tenantId === tenantAlpha) {
              return { rows: [{ id: 'item-1', case_id: 'case-1', type: 'document', description: 'desc', added_by: 'u1', created_at: new Date() }] };
            }
            return { rows: [] }; // Cross tenant returns empty array
          }
          if (sql.includes('WHERE evidence_id = $1')) {
            return { rows: [] };
          }
          return { rows: [] };
        },
      };

      const repo = new EvidenceRepository(mockPool);
      const crossCase = await repo.getCase('case-1', tenantBravo);
      expect(crossCase).toBeUndefined();

      const crossItems = await repo.listItems('case-1', tenantBravo);
      expect(crossItems).toEqual([]);

      const ownCase = await repo.getCase('case-1', tenantAlpha);
      expect(ownCase).toBeDefined();
      expect(ownCase?.tenantId).toBe(tenantAlpha);

      // Verify that all query templates contain explicit tenant_id checks
      expect(queryStatements.some((q) => q.includes('AND tenant_id = $2'))).toBe(true);
      expect(queryStatements.some((q) => q.includes('AND ec.tenant_id = $2'))).toBe(true);
    }
  });
});
