/**
 * Incidents API Routes Integration Tests
 * 
 * Tests for API endpoints including authentication, authorization,
 * tenant isolation, filtering, and pagination.
 */

import { Pool } from 'pg';
import express, { Express } from 'express';
import request from 'supertest';
import { createIncidentsRouter } from '../incidents.routes';
import { IncidentRepository } from '../../repositories/incident.repository';
import { CreateIncidentInput } from '../../types/incident.types';

describe('Incidents API Routes', () => {
  let app: Express;
  let pool: Pool;
  let repository: IncidentRepository;

  const TENANT_A = '00000000-0000-0000-0000-000000000001';
  const TENANT_B = '00000000-0000-0000-0000-000000000002';
  const USER_A = '10000000-0000-0000-0000-000000000001';
  const USER_B = '20000000-0000-0000-0000-000000000002';

  // Mock tokens
  const TOKEN_TENANT_A = 'mock-token-tenant-a';
  const TOKEN_TENANT_B = 'mock-token-tenant-b';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    });

    repository = new IncidentRepository(pool);

    // Setup Express app with middleware
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (token === TOKEN_TENANT_A) {
        (req as any).currentUser = {
          id: USER_A,
          tenantId: TENANT_A,
          role: 'admin',
        };
      } else if (token === TOKEN_TENANT_B) {
        (req as any).currentUser = {
          id: USER_B,
          tenantId: TENANT_B,
          role: 'admin',
        };
      }

      next();
    });

    // Mount incidents routes
    app.use('/api/incidents', createIncidentsRouter(pool));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM incident_alerts');
    await pool.query('DELETE FROM incidents');
  });

  describe('GET /api/incidents', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return incidents for authenticated tenant only', async () => {
      // Create incidents for both tenants
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Tenant A Incident',
      });

      await createTestIncident(repository, {
        tenantId: TENANT_B,
        title: 'Tenant B Incident',
      });

      // Request as Tenant A
      const response = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.incidents).toHaveLength(1);
      expect(response.body.data.incidents[0].title).toBe('Tenant A Incident');
    });

    it('should filter by status', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Open Incident',
      });

      const resolved = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Resolved Incident',
      });

      await repository.update(TENANT_A, resolved.id, { status: 'RESOLVED' });

      const response = await request(app)
        .get('/api/incidents')
        .query({ status: 'OPEN' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.incidents).toHaveLength(1);
      expect(response.body.data.incidents[0].status).toBe('OPEN');
    });

    it('should filter by severity', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Critical',
        severity: 'CRITICAL',
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Low',
        severity: 'LOW',
      });

      const response = await request(app)
        .get('/api/incidents')
        .query({ severity: 'CRITICAL' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.incidents).toHaveLength(1);
      expect(response.body.data.incidents[0].severity).toBe('CRITICAL');
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .query({ status: 'INVALID_STATUS' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid query parameters');
    });

    it('should validate date range', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .query({
          from: '2026-08-15T00:00:00Z',
          to: '2026-08-10T00:00:00Z', // to before from
        })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cannot be later than');
    });

    it('should paginate results', async () => {
      // Create 10 incidents
      for (let i = 0; i < 10; i++) {
        await createTestIncident(repository, {
          tenantId: TENANT_A,
          title: `Incident ${i}`,
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Get first page
      const page1 = await request(app)
        .get('/api/incidents')
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(page1.body.data.incidents).toHaveLength(5);
      expect(page1.body.pagination.hasMore).toBe(true);
      expect(page1.body.pagination.nextCursor).toBeTruthy();

      // Get second page
      const page2 = await request(app)
        .get('/api/incidents')
        .query({
          limit: 5,
          cursor: page1.body.pagination.nextCursor,
        })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(page2.body.data.incidents).toHaveLength(5);
      expect(page2.body.pagination.hasMore).toBe(false);

      // Verify no duplicates
      const page1Ids = page1.body.data.incidents.map((i: any) => i.id);
      const page2Ids = page2.body.data.incidents.map((i: any) => i.id);
      const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should return statistics', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Active',
        alertCount: 5,
      });

      const resolved = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Resolved',
        alertCount: 3,
      });

      await repository.update(TENANT_A, resolved.id, { status: 'RESOLVED' });

      const response = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.activeIncidents).toBe(1);
      expect(response.body.data.totalIncidents).toBe(2);
      expect(response.body.data.alertsCorrelated).toBe(8);
    });

    it('should reject invalid cursor', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .query({ cursor: 'invalid-cursor' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid pagination cursor');
    });

    it('should search incidents', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Fire Emergency in Building A',
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Intrusion Detection',
      });

      const response = await request(app)
        .get('/api/incidents')
        .query({ search: 'fire' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.incidents.length).toBeGreaterThan(0);
      expect(
        response.body.data.incidents[0].title.toLowerCase()
      ).toContain('fire');
    });

    it('should filter by multiple criteria', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Critical Fire',
        severity: 'CRITICAL',
        incidentType: 'fire_emergency',
      });

      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Critical Intrusion',
        severity: 'CRITICAL',
        incidentType: 'intrusion',
      });

      const response = await request(app)
        .get('/api/incidents')
        .query({
          severity: 'CRITICAL',
          type: 'fire_emergency',
        })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.incidents).toHaveLength(1);
      expect(response.body.data.incidents[0].severity).toBe('CRITICAL');
      expect(response.body.data.incidents[0].incidentType).toBe('fire_emergency');
    });
  });

  describe('GET /api/incidents/:id', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/api/incidents/00000000-0000-0000-0000-000000000001')
        .expect(401);
    });

    it('should return incident details', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Test Incident',
      });

      const response = await request(app)
        .get(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(incident.id);
      expect(response.body.data.title).toBe('Test Incident');
    });

    it('should not allow accessing incident from another tenant', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Tenant A Incident',
      });

      const response = await request(app)
        .get(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_B}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent incident', async () => {
      const response = await request(app)
        .get('/api/incidents/00000000-0000-0000-0000-999999999999')
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/incidents/invalid-uuid')
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(400);

      expect(response.body.error).toContain('Invalid incident ID format');
    });
  });

  describe('PATCH /api/incidents/:id', () => {
    it('should update incident', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Original Title',
      });

      const response = await request(app)
        .patch(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .send({
          title: 'Updated Title',
          status: 'ACKNOWLEDGED',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.status).toBe('ACKNOWLEDGED');
    });

    it('should not allow updating incident from another tenant', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Protected',
      });

      const response = await request(app)
        .patch(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_B}`)
        .send({ title: 'Hacked' })
        .expect(404);

      expect(response.body.success).toBe(false);

      // Verify unchanged
      const verified = await repository.getById(TENANT_A, incident.id);
      expect(verified?.title).toBe('Protected');
    });

    it('should validate update data', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Test',
      });

      const response = await request(app)
        .patch(`/api/incidents/${incident.id}`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .send({
          status: 'INVALID_STATUS',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/incidents/:id/acknowledge', () => {
    it('should acknowledge incident', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'To Acknowledge',
      });

      const response = await request(app)
        .post(`/api/incidents/${incident.id}/acknowledge`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACKNOWLEDGED');
      expect(response.body.data.acknowledgedBy).toBe(USER_A);
      expect(response.body.data.acknowledgedAt).toBeTruthy();
    });

    it('should not allow acknowledging incident from another tenant', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Protected',
      });

      await request(app)
        .post(`/api/incidents/${incident.id}/acknowledge`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_B}`)
        .expect(404);

      // Verify still OPEN
      const verified = await repository.getById(TENANT_A, incident.id);
      expect(verified?.status).toBe('OPEN');
    });
  });

  describe('POST /api/incidents/:id/assign', () => {
    it('should assign incident to user', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'To Assign',
      });

      const response = await request(app)
        .post(`/api/incidents/${incident.id}/assign`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .send({ userId: USER_A })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.assignedTo).toBe(USER_A);
    });

    it('should validate user ID format', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Test',
      });

      const response = await request(app)
        .post(`/api/incidents/${incident.id}/assign`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .send({ userId: 'invalid-uuid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/incidents/:id/resolve', () => {
    it('should resolve incident', async () => {
      const incident = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'To Resolve',
      });

      const response = await request(app)
        .post(`/api/incidents/${incident.id}/resolve`)
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('RESOLVED');
      expect(response.body.data.resolvedBy).toBe(USER_A);
      expect(response.body.data.resolvedAt).toBeTruthy();
    });
  });

  describe('GET /api/incidents/stats', () => {
    it('should return statistics', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Active',
        severity: 'CRITICAL',
      });

      const resolved = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Resolved',
      });

      await repository.update(TENANT_A, resolved.id, { status: 'RESOLVED' });

      const response = await request(app)
        .get('/api/incidents/stats')
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.active).toBe(1);
      expect(response.body.data.critical).toBe(1);
    });

    it('should filter statistics', async () => {
      await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Open',
      });

      const resolved = await createTestIncident(repository, {
        tenantId: TENANT_A,
        title: 'Resolved',
      });

      await repository.update(TENANT_A, resolved.id, { status: 'RESOLVED' });

      const response = await request(app)
        .get('/api/incidents/stats')
        .query({ status: 'RESOLVED' })
        .set('Authorization', `Bearer ${TOKEN_TENANT_A}`)
        .expect(200);

      expect(response.body.data.total).toBe(1);
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
