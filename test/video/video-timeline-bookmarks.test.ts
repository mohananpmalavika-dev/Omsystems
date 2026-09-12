/**
 * Automated Test Suite for Video Timeline Bookmarks (video.bookmarks)
 * 
 * Verifies operator timestamp tagging, priority levels (low/medium/high/critical),
 * rich notes, bi-directional multi-incident associations, legal hold promotion,
 * forensic verification, Fastify REST APIs, and evidentiary export with SHA-256 integrity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  VideoBookmarkRepository,
  VideoBookmarkService,
} from '../../src/video/bookmarks/index.js';
import { registerVideoBookmarkRoutes } from '../../src/routes/video-bookmark.routes.js';
import type { CreateBookmarkInput } from '../../src/video/bookmarks/types.js';

const pastTs = (offsetSec = 60) => new Date(Date.now() - offsetSec * 1000).toISOString();

class MockPool {
  bookmarks: any[] = [];
  associations: any[] = [];
  auditLogs: any[] = [];
  incidents: any[] = [];
  legalHolds: any[] = [];

  async query(sql: string, params: any[] = []): Promise<any> {
    const s = sql.trim();

    // 1. Transaction controls
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
      return { rows: [] };
    }

    // 2. INSERT into live_bookmarks
    if (s.includes('INSERT INTO live_bookmarks')) {
      const bm = {
        id: params[0],
        tenant_id: params[1],
        camera_id: params[2],
        operator_id: params[3],
        bookmarked_at: params[4],
        timestamp: params[5],
        title: params[6],
        notes: params[7],
        reason: params[8],
        priority: params[9],
        tags: params[10] || [],
        incident_id: params[11] || null,
        recording_segment_id: params[12] || null,
        snapshot_reference: params[13] || null,
        evidence_case_id: params[14] || null,
        frame_offset_ms: params[15] || null,
        metadata: typeof params[16] === 'string' ? JSON.parse(params[16]) : params[16],
        verified_by: null,
        verified_at: null,
        review_status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        export_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.bookmarks.push(bm);
      return { rows: [bm] };
    }

    // 3. INSERT into video_bookmark_incident_associations
    if (s.includes('INSERT INTO video_bookmark_incident_associations')) {
      const existing = this.associations.find(
        (a) => a.bookmark_id === params[1] && a.incident_id === params[3]
      );
      if (existing) {
        if (params[6]) existing.association_notes = params[6];
        return { rows: [existing] };
      }
      const assoc = {
        id: params[0] || 'assoc_' + Math.random().toString(36).substring(2, 9),
        bookmark_id: params[1],
        tenant_id: params[2],
        incident_id: params[3],
        incident_table: params[4] || 'incidents',
        associated_by: params[5],
        association_notes: params[6] || null,
        created_at: new Date(),
      };
      this.associations.push(assoc);
      return { rows: [assoc] };
    }

    // 4. INSERT into video_bookmark_audit_logs
    if (s.includes('INSERT INTO video_bookmark_audit_logs')) {
      const actionMatch = s.match(/'(created|updated|deleted|incident_associated|incident_disassociated|verified)'/);
      const action = actionMatch ? actionMatch[1] : (params[3] || 'audit');
      const detailsRaw = actionMatch ? params[3] : params[4];
      const details = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
      const log = {
        id: 'log_' + Math.random().toString(36).substring(2, 9),
        bookmark_id: params[0],
        tenant_id: params[1],
        operator_id: params[2],
        action,
        details,
        created_at: new Date(),
      };
      this.auditLogs.push(log);
      return { rows: [log] };
    }

    // 5. INSERT into live_incidents (for promote)
    if (s.includes('INSERT INTO live_incidents')) {
      const inc = {
        id: params[0],
        tenant_id: params[1],
        camera_id: params[2],
        created_by: params[3],
        title: params[4],
        notes: params[5],
        priority: params[6],
        occurred_at: params[7],
        recording_from: params[8],
        recording_to: params[9],
        pre_roll_seconds: params[10],
        post_roll_seconds: params[11],
        primary_bookmark_id: params[12],
        legal_hold_id: params[13],
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.incidents.push(inc);
      return { rows: [inc] };
    }

    // 6. INSERT into recording_legal_holds
    if (s.includes('INSERT INTO recording_legal_holds')) {
      const hold = {
        id: params[0],
        tenant_id: params[1],
        camera_id: params[2],
        from_at: params[3],
        to_at: params[4],
        reason: params[5],
        created_by: params[6],
        incident_id: params[7],
        created_at: new Date(),
      };
      this.legalHolds.push(hold);
      return { rows: [hold] };
    }

    // 7. SELECT b.* FROM live_bookmarks b WHERE b.id = $1 AND b.tenant_id = $2
    if (s.includes('FROM live_bookmarks b') && s.includes('WHERE b.id = $1 AND b.tenant_id = $2')) {
      const bm = this.bookmarks.find((b) => b.id === params[0] && b.tenant_id === params[1]);
      if (!bm) return { rows: [] };
      return {
        rows: [
          {
            ...bm,
            camera_name: 'Main Entrance PTZ',
            operator_name: 'Operator Arun',
          },
        ],
      };
    }

    // 8. SELECT a.* FROM video_bookmark_incident_associations a WHERE a.bookmark_id = ANY($1::uuid[])
    if (s.includes('SELECT a.*') && s.includes('FROM video_bookmark_incident_associations a')) {
      const bIds = Array.isArray(params[0]) ? params[0] : [params[0]];
      const tId = params[1];
      const matched = this.associations
        .filter((a) => bIds.includes(a.bookmark_id) && a.tenant_id === tId)
        .map((a) => ({
          ...a,
          associated_by_name: 'Operator Arun',
          incident_number: 'INC-2026-081',
          incident_title: 'Perimeter Alert Vault Hallway',
          incident_severity: 'P2',
          incident_status: 'investigating',
        }));
      return { rows: matched };
    }

    // 9. COUNT(*) AS total FROM live_bookmarks b
    if (s.includes('SELECT COUNT(*) AS total FROM live_bookmarks b')) {
      let filtered = this.bookmarks.filter((b) => b.tenant_id === params[0]);
      if (s.includes('b.camera_id = $')) {
        filtered = filtered.filter((b) => b.camera_id === params[1]);
      }
      if (s.includes('b.priority = $')) {
        const pIdx = params.findIndex((val, i) => i > 0 && ['low', 'medium', 'high', 'critical'].includes(val));
        if (pIdx !== -1) filtered = filtered.filter((b) => b.priority === params[pIdx]);
      }
      return { rows: [{ total: String(filtered.length) }] };
    }

    // 10. SELECT b.* FROM live_bookmarks b ... ORDER BY
    if (s.includes('SELECT b.*') && s.includes('FROM live_bookmarks b')) {
      let filtered = this.bookmarks.filter((b) => b.tenant_id === params[0]);
      if (s.includes('b.camera_id = $')) {
        filtered = filtered.filter((b) => b.camera_id === params[1]);
      }
      if (s.includes('b.priority = $')) {
        const pIdx = params.findIndex((val, i) => i > 0 && ['low', 'medium', 'high', 'critical'].includes(val));
        if (pIdx !== -1) filtered = filtered.filter((b) => b.priority === params[pIdx]);
      }
      if (s.includes('b.incident_id = $') && params.length >= 2) {
        const incId = params[params.length - 3] || params[1];
        filtered = filtered.filter((b) => b.incident_id === incId);
      }
      const mapped = filtered.map((b) => ({
        ...b,
        camera_name: 'Main Entrance PTZ',
        operator_name: 'Operator Arun',
      }));
      return { rows: mapped };
    }

    // 11. UPDATE live_bookmarks SET ... WHERE id = $1 AND tenant_id = $2
    if (s.includes('UPDATE live_bookmarks') && s.includes('WHERE id = $1 AND tenant_id = $2')) {
      const bm = this.bookmarks.find((b) => b.id === params[0] && b.tenant_id === params[1]);
      if (bm) {
        if (s.includes('title = $')) {
          const tIdx = s.match(/title = \$(\d+)/)?.[1];
          if (tIdx) bm.title = params[parseInt(tIdx, 10) - 1];
        }
        if (s.includes('notes = $')) {
          const nIdx = s.match(/notes = \$(\d+)/)?.[1];
          if (nIdx) bm.notes = params[parseInt(nIdx, 10) - 1];
        }
        if (s.includes('priority = $')) {
          const prIdx = s.match(/priority = \$(\d+)/)?.[1];
          if (prIdx) bm.priority = params[parseInt(prIdx, 10) - 1];
        }
        if (s.includes('verified_by = $3')) {
          bm.verified_by = params[2];
          bm.verified_at = new Date();
          bm.review_status = 'approved';
        }
        if (s.includes('export_count = export_count + 1')) {
          bm.export_count = (bm.export_count || 0) + 1;
        }
        bm.updated_at = new Date();
        return { rows: [bm] };
      }
      return { rows: [] };
    }

    // 12. UPDATE live_bookmarks SET incident_id = COALESCE(incident_id, $2)
    if (s.includes('UPDATE live_bookmarks') && s.includes('SET incident_id = COALESCE(incident_id, $2)')) {
      const bm = this.bookmarks.find((b) => b.id === params[0] && b.tenant_id === params[2]);
      if (bm) {
        bm.incident_id = bm.incident_id || params[1];
        bm.updated_at = new Date();
        return { rows: [bm] };
      }
      return { rows: [] };
    }

    // 13. DELETE FROM live_bookmarks WHERE id = $1 AND tenant_id = $2
    if (s.includes('DELETE FROM live_bookmarks WHERE id = $1 AND tenant_id = $2')) {
      const idx = this.bookmarks.findIndex((b) => b.id === params[0] && b.tenant_id === params[1]);
      if (idx !== -1) {
        const deleted = this.bookmarks.splice(idx, 1);
        return { rows: deleted };
      }
      return { rows: [] };
    }

    // 14. DELETE FROM video_bookmark_incident_associations
    if (s.includes('DELETE FROM video_bookmark_incident_associations')) {
      const idx = this.associations.findIndex(
        (a) => a.bookmark_id === params[0] && a.incident_id === params[1] && a.tenant_id === params[2]
      );
      if (idx !== -1) {
        const deleted = this.associations.splice(idx, 1);
        return { rows: deleted };
      }
      return { rows: [] };
    }

    // 15. SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE priority = 'critical') ...
    if (s.includes('FILTER')) {
      const tId = params[0];
      const bms = this.bookmarks.filter((b) => b.tenant_id === tId);
      const crit = bms.filter((b) => b.priority === 'critical').length;
      const high = bms.filter((b) => b.priority === 'high').length;
      const med = bms.filter((b) => b.priority === 'medium').length;
      const low = bms.filter((b) => b.priority === 'low').length;
      const incLinked = bms.filter((b) => b.incident_id !== null).length;
      const ver = bms.filter((b) => b.verified_at !== null).length;

      return {
        rows: [
          {
            total: String(bms.length),
            critical: String(crit),
            high: String(high),
            medium: String(med),
            low: String(low),
            incident_linked: String(incLinked),
            verified: String(ver),
            recent: String(bms.length),
          },
        ],
      };
    }

    return { rows: [] };
  }

  async connect() {
    return {
      query: (sql: string, params: any[] = []) => this.query(sql, params),
      release: () => {},
    };
  }
}

describe('VideoTimelineBookmarks - Core Repository & Service', () => {
  let pool: MockPool;
  let service: VideoBookmarkService;
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const operatorId = '00000000-0000-4000-8000-000000000002';
  const cameraId = '11111111-1111-4000-8000-111111111111';

  beforeEach(() => {
    pool = new MockPool();
    service = new VideoBookmarkService(pool as any);
  });

  it('creates an operator-tagged timeline bookmark with notes, priority, and tags', async () => {
    const input: CreateBookmarkInput = {
      cameraId,
      timestamp: pastTs(180),
      title: 'Customer dispute at Cash Counter 3',
      notes: 'Customer raised voice over denomination discrepancy; supervisor alerted.',
      priority: 'high',
      reason: 'customer-dispute',
      tags: ['cash-counter', 'dispute', 'counter-3'],
      metadata: { registerId: 'REG-03', currency: 'INR' },
    };

    const bookmark = await service.createBookmark(tenantId, operatorId, input);

    expect(bookmark).toBeDefined();
    expect(bookmark.id).toBeDefined();
    expect(bookmark.title).toBe('Customer dispute at Cash Counter 3');
    expect(bookmark.priority).toBe('high');
    expect(bookmark.reason).toBe('customer-dispute');
    expect(bookmark.tags).toContain('cash-counter');
    expect(bookmark.notes).toContain('denomination discrepancy');
    expect(bookmark.metadata).toEqual({ registerId: 'REG-03', currency: 'INR' });
    expect(pool.auditLogs.length).toBe(1);
    expect(pool.auditLogs[0].action).toBe('created');
  });

  it('rejects futuristic timestamps beyond clock tolerance (> 5 min in future)', async () => {
    const farFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await expect(
      service.createBookmark(tenantId, operatorId, {
        cameraId,
        timestamp: farFuture,
        title: 'Future anomaly',
        priority: 'critical',
        reason: 'other',
        tags: [],
      })
    ).rejects.toThrow('Bookmark timestamp cannot be set in the future');
  });

  it('supports four-tier priority levels (low, medium, high, critical)', async () => {
    const priorities = ['low', 'medium', 'high', 'critical'] as const;

    for (const p of priorities) {
      const bm = await service.createBookmark(tenantId, operatorId, {
        cameraId,
        timestamp: pastTs(120),
        title: `Bookmark with priority ${p}`,
        priority: p,
        reason: 'suspicious-activity',
        tags: ['audit'],
      });
      expect(bm.priority).toBe(p);
    }

    const metrics = await service.getBookmarkMetrics(tenantId);
    expect(metrics.total).toBe(4);
    expect(metrics.critical).toBe(1);
    expect(metrics.high).toBe(1);
    expect(metrics.medium).toBe(1);
    expect(metrics.low).toBe(1);
  });

  it('associates and disassociates incidents bi-directionally', async () => {
    const bookmark = await service.createBookmark(tenantId, operatorId, {
      cameraId,
      timestamp: pastTs(240),
      title: 'Unattended bag in strongroom hallway',
      priority: 'critical',
      reason: 'suspicious-activity',
      tags: ['vault', 'security-breach'],
    });

    const incidentId = '22222222-2222-4000-8000-222222222222';

    // Associate
    const assoc = await service.associateIncident(
      bookmark.id,
      tenantId,
      incidentId,
      'incidents',
      operatorId,
      'Linked to Vault perimeter trigger investigation'
    );

    expect(assoc).toBeDefined();
    expect(assoc.incidentId).toBe(incidentId);
    expect(assoc.associationNotes).toContain('Vault perimeter trigger');

    // Verify bookmark now reflects association
    const updated = await service.getBookmarkById(bookmark.id, tenantId);
    expect(updated?.incidentAssociations.length).toBe(1);
    expect(updated?.incidentAssociations[0].incidentId).toBe(incidentId);

    // Disassociate
    const disassociated = await service.disassociateIncident(
      bookmark.id,
      tenantId,
      incidentId,
      operatorId
    );
    expect(disassociated).toBe(true);
  });

  it('promotes bookmark directly to Incident with automated Legal Hold', async () => {
    const bookmark = await service.createBookmark(tenantId, operatorId, {
      cameraId,
      timestamp: pastTs(300),
      title: 'Forced entry attempt at Cash Sorting Room',
      notes: 'Subject attempted badge bypass; magnetic lock triggered alarm.',
      priority: 'critical',
      reason: 'unauthorized-entry',
      tags: ['intrusion', 'badge-bypass'],
    });

    const promotion = await service.createIncidentFromBookmark(
      bookmark.id,
      tenantId,
      operatorId,
      {
        severity: 'P1',
        applyLegalHold: true,
        preRollSeconds: 120,
        postRollSeconds: 240,
        title: 'Emergency P1 Incident - Cash Room Intrusion',
      }
    );

    expect(promotion.incidentId).toBeDefined();
    expect(promotion.legalHoldId).toBeDefined();
    expect(pool.incidents.length).toBe(1);
    expect(pool.legalHolds.length).toBe(1);

    // Verify legal hold parameters
    const hold = pool.legalHolds[0];
    expect(hold.incident_id).toBe(promotion.incidentId);
    expect(hold.reason).toContain('Emergency P1 Incident');
  });

  it('signs and verifies bookmark for legal evidence admissibility', async () => {
    const bookmark = await service.createBookmark(tenantId, operatorId, {
      cameraId,
      timestamp: pastTs(360),
      title: 'Suspect observed tampering with ATM dispenser',
      priority: 'high',
      reason: 'theft-attempt',
      tags: ['atm', 'skimming'],
    });

    expect(bookmark.verifiedAt).toBeUndefined();

    const verified = await service.verifyBookmark(bookmark.id, tenantId, operatorId);
    expect(verified).toBeDefined();
    expect(verified?.verifiedBy).toBe(operatorId);
    expect(verified?.verifiedAt).toBeDefined();
    expect(verified?.reviewStatus).toBe('approved');
  });

  it('exports bookmarks as CSV and JSON with SHA-256 cryptographic seal', async () => {
    await service.createBookmark(tenantId, operatorId, {
      cameraId,
      timestamp: pastTs(400),
      title: 'Branch Open Vault Audit',
      priority: 'low',
      reason: 'audit',
      tags: ['vault', 'audit-trail'],
    });

    // CSV Export
    const csvExport = await service.exportBookmarks(tenantId, 'csv', {});
    expect(csvExport.mimeType).toBe('text/csv');
    expect(csvExport.data).toContain('Branch Open Vault Audit');
    expect(csvExport.sha256).toBeDefined();
    expect(csvExport.sha256.length).toBe(64); // SHA-256 hex string

    // JSON Export
    const jsonExport = await service.exportBookmarks(tenantId, 'json', {});
    expect(jsonExport.mimeType).toBe('application/json');
    const parsed = JSON.parse(jsonExport.data);
    expect(parsed.metadata.sha256Checksum).toBe(jsonExport.sha256);
    expect(parsed.bookmarks.length).toBeGreaterThanOrEqual(1);
  });

  it('generates timeline visualizer scrub markers with color-coding', async () => {
    await service.createBookmark(tenantId, operatorId, {
      cameraId,
      timestamp: pastTs(500),
      title: 'Critical Alarm',
      priority: 'critical',
      reason: 'safety-incident',
      tags: ['fire'],
    });

    const markers = await service.getTimelineMarkers(tenantId, cameraId);
    expect(markers.length).toBe(1);
    expect(markers[0].type).toBe('bookmark');
    expect(markers[0].priority).toBe('critical');
    expect(markers[0].color).toBe('#ef4444'); // Red for critical
  });
});

describe('VideoTimelineBookmarks - Fastify REST Endpoints', () => {
  let app: FastifyInstance;
  let pool: MockPool;
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const operatorId = '00000000-0000-4000-8000-000000000002';
  const cameraId = '11111111-1111-4000-8000-111111111111';

  beforeEach(async () => {
    pool = new MockPool();
    app = Fastify();

    // Attach mock store with pool
    const mockStore: any = { pool };
    await registerVideoBookmarkRoutes(app, mockStore);
    await app.ready();
  });

  it('POST /v1/video/bookmarks creates a bookmark and returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: {
        'x-tenant-id': tenantId,
        'x-user-id': operatorId,
      },
      payload: {
        cameraId,
        timestamp: pastTs(60),
        title: 'Teller Drawer Shortage Event',
        notes: 'Discrepancy observed at Teller Counter 2.',
        priority: 'high',
        reason: 'cash-discrepancy',
        tags: ['teller-2', 'audit'],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Teller Drawer Shortage Event');
    expect(body.data.priority).toBe('high');
  });

  it('POST /v1/video/bookmarks returns 400 on invalid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: {
        'x-tenant-id': tenantId,
        'x-user-id': operatorId,
      },
      payload: {
        cameraId: 'not-a-uuid',
        title: '',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
  });

  it('GET /v1/video/bookmarks lists bookmarks with pagination', async () => {
    // Seed
    await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        cameraId,
        timestamp: pastTs(120),
        title: 'Access Door Prop Warning',
        priority: 'medium',
        reason: 'unauthorized-entry',
        tags: ['door'],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/video/bookmarks',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /v1/video/bookmarks/:id updates an existing bookmark', async () => {
    // Seed
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        cameraId,
        timestamp: pastTs(180),
        title: 'Initial Title',
        priority: 'low',
        reason: 'other',
        tags: ['test'],
      },
    });

    const bmId = createRes.json().data.id;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/video/bookmarks/${bmId}`,
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        title: 'Updated Title After Investigation',
        priority: 'critical',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = patchRes.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Updated Title After Investigation');
    expect(body.data.priority).toBe('critical');
  });

  it('POST /v1/video/bookmarks/:id/incidents links an incident', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        cameraId,
        timestamp: pastTs(240),
        title: 'ATM Tamper Sensor Trip',
        priority: 'high',
        reason: 'equipment-failure',
        tags: ['atm'],
      },
    });

    const bmId = createRes.json().data.id;
    const incidentId = '33333333-3333-4000-8000-333333333333';

    const assocRes = await app.inject({
      method: 'POST',
      url: `/v1/video/bookmarks/${bmId}/incidents`,
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        incidentId,
        incidentTable: 'incidents',
        associationNotes: 'Confirmed physical tamper alert from branch',
      },
    });

    expect(assocRes.statusCode).toBe(201);
    expect(assocRes.json().success).toBe(true);
    expect(assocRes.json().data.incidentId).toBe(incidentId);
  });

  it('POST /v1/video/bookmarks/:id/create-incident promotes bookmark to incident', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/video/bookmarks',
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        cameraId,
        timestamp: pastTs(300),
        title: 'Smoke Detector Optical Flash',
        priority: 'critical',
        reason: 'safety-incident',
        tags: ['fire-alarm'],
      },
    });

    const bmId = createRes.json().data.id;

    const promoteRes = await app.inject({
      method: 'POST',
      url: `/v1/video/bookmarks/${bmId}/create-incident`,
      headers: { 'x-tenant-id': tenantId, 'x-user-id': operatorId },
      payload: {
        severity: 'P1',
        applyLegalHold: true,
        preRollSeconds: 120,
        postRollSeconds: 300,
        title: 'P1 Smoke & Fire Detection',
      },
    });

    expect(promoteRes.statusCode).toBe(201);
    const body = promoteRes.json();
    expect(body.success).toBe(true);
    expect(body.data.incidentId).toBeDefined();
    expect(body.data.legalHoldId).toBeDefined();
  });

  it('GET /v1/video/bookmarks/metrics returns priority telemetry', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/video/bookmarks/metrics',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBeDefined();
    expect(body.data.critical).toBeDefined();
    expect(body.data.high).toBeDefined();
  });

  it('GET /v1/video/bookmarks/export exports CSV with SHA-256 header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/video/bookmarks/export?format=csv',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['x-checksum-sha256']).toBeDefined();
  });
});
