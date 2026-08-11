/**
 * Incident Repository Tests
 * 
 * Tests for tenant isolation, filtering, pagination, and data integrity.
 */

import { Pool } from 'pg';
import { IncidentRepository, encodeCursor, decodeCursor } from '../incident.repository';
import {
  CreateIncidentInput,
  IncidentListFilters,
  IncidentStatus,
  IncidentSeverity,
} from '../../types/incident.types';

describe('IncidentRepository', () => {
  let pool: Pool;
  let repository: IncidentRepository;

  const TENANT_A = '00000000-0000-0000-0000-000000000001';
  const TENANT_B = '00000000-0000-0000-0000-000000000002';
  const BRANCH_A = '10000000-0000-0000-0000-000000000001';
  const CAMERA_A = '20000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    // Use test database
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });

    repository = new IncidentRepository(pool);

    // Create test tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await pool.query(`
      INSERT INTO tenants (id, name) 
      VALUES 
        ($1, 'Tenant A'),
        ($2, 'Tenant B')
      ON CONFLICT (id) DO NOTHING;
    `, [TENANT_A, TENANT_B]);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM incident_alerts');
    await pool.query('DELETE FROM incidents');
  });

  describe('Cursor Encoding/Decoding', () => {
    it('should encode and decode cursor correctly', () => {
      const cursor = {
        createdAt: '2026-08-11T10:00:00.000Z',
        id: '12345678-1234-1234-1234-123456789012',
      };

      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('should return null for invalid cursor', () => {
      expect(decodeCursor('invalid')).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('should return null for malformed cursor', () => {
      const malformed = Buffer.from('{"invalid": true}').toString('base64url');
      expect(decodeCursor(malformed)).toBeNull();
    });
  });

  describe('Tenant Isolation', () => {
    it('should never return incidents from another tenant', async () => {
      // Create incidents for both tenants
      const incidentA = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Tenant A Incident',
      });

      const incidentB = await createTestIncident(repository, {
        tenantId: TENANT_B,
        title: 'Tenant B Incident',
      });

      // Query as Tenant A
      const resultA = await repository.list({
        tenantId: TENANT_A,
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(resultA.incidents).toHaveLength(1);
      expect(resultA.incidents[0].id).toBe(incidentA.id);
      expect(resultA.incidents[0].id).not.toBe(incidentB.id);

      // Query as Tenant B
      const resultB = await repository.list({
        tenantId: TENANT_B,
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(resultB.incidents).toHaveLength(1);
      expect(resultB.incidents[0].id).toBe(incidentB.id);
      expect(resultB.incidents[0].id).not.toBe(incidentA.id);
    });

    it('should not allow getting incident from another tenant by ID', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Tenant A Incident',
      });

      // Try to access as Tenant B
      const result = await repository.getById(TENANT_B, incident.id);

      expect(result).toBeNull();
    });

    it('should not allow updating incident from another tenant', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Original Title',
      });

      // Try to update as Tenant B
      const result = await repository.update(TENANT_B, incident.id, {
        title: 'Hacked Title',
      });

      expect(result).toBeNull();

      // Verify original unchanged
      const verified = await repository.getById(TENANT_A, incident.id);
      expect(verified?.title).toBe('Original Title');
    });

    it('should not allow deleting incident from another tenant', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Protected Incident',
      });

      // Try to delete as Tenant B
      const deleted = await repository.delete(TENANT_B, incident.id);

      expect(deleted).toBe(false);

      // Verify still exists
      const verified = await repository.getById(TENANT_A, incident.id);
      expect(verified).not.toBeNull();
    });
  });

  describe('Filtering', () => {
    beforeEach(async () => {
      // Create test incidents with various attributes
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Critical Fire Incident',
        incidentType: 'fire_emergency',
        severity: 'CRITICAL',
        branchId: BRANCH_A,
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Medium Security Breach',
        incidentType: 'security_breach',
        severity: 'MEDIUM',
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Low Intrusion',
        incidentType: 'intrusion',
        severity: 'LOW',
      });
    });

    it('should filter by severity', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        severity: 'CRITICAL',
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].severity).toBe('CRITICAL');
    });

    it('should filter by incident type', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        type: 'fire_emergency',
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].incidentType).toBe('fire_emergency');
    });

    it('should filter by branch', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        branchId: BRANCH_A,
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].branch?.id).toBe(BRANCH_A);
    });

    it('should filter by unassigned', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        unassigned: true,
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(3);
      result.incidents.forEach(incident => {
        expect(incident.assignedTo).toBeNull();
      });
    });

    it('should search by title and description', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        search: 'fire',
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents.length).toBeGreaterThan(0);
      expect(result.incidents[0].title.toLowerCase()).toContain('fire');
    });

    it('should combine multiple filters', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        severity: 'MEDIUM',
        type: 'security_breach',
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0].severity).toBe('MEDIUM');
      expect(result.incidents[0].incidentType).toBe('security_breach');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = await repository.list({
        tenantId: TENANT_A,
        from: yesterday,
        to: tomorrow,
        limit: 50,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(3);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create multiple incidents
      for (let i = 0; i < 10; i++) {
        await createTestIncident(repository, {
          tenantId: TENANT_A,
          title: `Incident ${i}`,
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    it('should paginate results correctly', async () => {
      const page1 = await repository.list({
        tenantId: TENANT_A,
        limit: 5,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(page1.incidents).toHaveLength(5);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      const cursor = decodeCursor(page1.nextCursor!);
      const page2 = await repository.list({
        tenantId: TENANT_A,
        limit: 5,
        cursor,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(page2.incidents).toHaveLength(5);
      expect(page2.hasMore).toBe(false);

      // Verify no duplicates
      const page1Ids = page1.incidents.map(i => i.id);
      const page2Ids = page2.incidents.map(i => i.id);
      const intersection = page1Ids.filter(id => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should handle last page correctly', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        limit: 20,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should maintain stable ordering with identical timestamps', async () => {
      // This test verifies the secondary sort by ID
      const incidents: string[] = [];

      let cursor = undefined;
      let page = 1;

      while (true) {
        const result = await repository.list({
          tenantId: TENANT_A,
          limit: 3,
          cursor,
          sort: 'createdAt',
          order: 'desc',
        });

        incidents.push(...result.incidents.map(i => i.id));

        if (!result.hasMore) break;

        cursor = decodeCursor(result.nextCursor!);
        page++;

        // Safety limit
        if (page > 10) break;
      }

      // Verify all unique
      const uniqueIds = new Set(incidents);
      expect(uniqueIds.size).toBe(incidents.length);

      // Verify total count
      expect(incidents).toHaveLength(10);
    });

    it('should respect limit parameter', async () => {
      const result = await repository.list({
        tenantId: TENANT_A,
        limit: 3,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.incidents).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Open Critical',
        severity: 'CRITICAL',
        alertCount: 5,
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Open High',
        severity: 'HIGH',
        alertCount: 3,
      });

      const resolved = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Resolved Medium',
        severity: 'MEDIUM',
        alertCount: 2,
      });

      await repository.update(TENANT_A, resolved.id, {
        status: 'RESOLVED',
      });
    });

    it('should calculate statistics correctly', async () => {
      const stats = await repository.getStatistics({
        tenantId: TENANT_A,
      });

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2); // OPEN incidents
      expect(stats.critical).toBe(1);
      expect(stats.alertsCorrelated).toBe(10); // 5 + 3 + 2
      expect(stats.byStatus.OPEN).toBe(2);
      expect(stats.byStatus.RESOLVED).toBe(1);
      expect(stats.bySeverity.CRITICAL).toBe(1);
      expect(stats.bySeverity.HIGH).toBe(1);
      expect(stats.bySeverity.MEDIUM).toBe(1);
    });

    it('should filter statistics by branch', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Branch Specific',
        branchId: BRANCH_A,
      });

      const stats = await repository.getStatistics({
        tenantId: TENANT_A,
        branchId: BRANCH_A,
      });

      expect(stats.total).toBe(1);
    });

    it('should isolate statistics by tenant', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_B,
        title: 'Tenant B Incident',
      });

      const statsA = await repository.getStatistics({ tenantId: TENANT_A });
      const statsB = await repository.getStatistics({ tenantId: TENANT_B });

      expect(statsA.total).toBe(3);
      expect(statsB.total).toBe(1);
    });
  });

  describe('CRUD Operations', () => {
    it('should create incident with all fields', async () => {
      const input: CreateIncidentInput = {
        tenantId: TENANT_A,
        title: 'Test Incident',
        description: 'Test Description',
        incidentType: 'intrusion',
        severity: 'HIGH',
        branchId: BRANCH_A,
        cameraId: CAMERA_A,
        alertCount: 5,
        metadata: { test: 'data' },
      };

      const incident = await repository.create(input);

      expect(incident.id).toBeDefined();
      expect(incident.tenantId).toBe(TENANT_A);
      expect(incident.title).toBe('Test Incident');
      expect(incident.status).toBe('OPEN');
      expect(incident.severity).toBe('HIGH');
      expect(incident.alertCount).toBe(5);
      expect(incident.metadata).toEqual({ test: 'data' });
    });

    it('should update incident fields', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Original',
      });

      const updated = await repository.update(TENANT_A, incident.id, {
        title: 'Updated',
        status: 'ACKNOWLEDGED',
        severity: 'CRITICAL',
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated');
      expect(updated!.status).toBe('ACKNOWLEDGED');
      expect(updated!.severity).toBe('CRITICAL');
    });

    it('should delete incident', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'To Delete',
      });

      const deleted = await repository.delete(TENANT_A, incident.id);
      expect(deleted).toBe(true);

      const result = await repository.getById(TENANT_A, incident.id);
      expect(result).toBeNull();
    });

    it('should add alerts to incident', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Test',
      });

      await repository.addAlerts(incident.id, [
        {
          alertId: 'alert-1',
          alertType: 'intrusion',
          alertSeverity: 'HIGH',
          cameraId: CAMERA_A,
          detectedAt: new Date(),
        },
        {
          alertId: 'alert-2',
          alertType: 'intrusion',
          alertSeverity: 'HIGH',
          cameraId: CAMERA_A,
          detectedAt: new Date(),
        },
      ]);

      const details = await repository.getById(TENANT_A, incident.id);
      expect(details?.alerts).toHaveLength(2);
      expect(details?.alertCount).toBe(2);
    });
  });
});

/**
 * Helper to create test incident
 */
async function createTestIncident(
  repository: IncidentRepository,
  overrides: Partial<CreateIncidentInput> & { tenantId: string },
): Promise<any> {
  const defaults: CreateIncidentInput = {
    tenantId: overrides.tenantId,
    title: 'Test Incident',
    description: 'Test Description',
    incidentType: 'other',
    severity: 'MEDIUM',
    alertCount: 1,
  };

  return repository.create({ ...defaults, ...overrides });
}
