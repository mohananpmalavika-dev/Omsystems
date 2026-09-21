/**
 * AI Analytics Dashboard Integration Tests
 * 
 * Tests for ROI calculator, comparison tool, and metrics collection.
 * Validates complete end-to-end functionality of the AI analytics dashboard.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerAiAnalyticsDashboardRoutes } from '../src/routes/ai-analytics-dashboard.routes.js';
import { aiMetricsCollectorService } from '../src/services/ai-metrics-collector.service.js';
import { pool } from '../src/database.js';

describe('AI Analytics Dashboard', () => {
  let app: FastifyInstance;
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testCameraId = '00000000-0000-0000-0000-000000000002';
  const testBranchId = '00000000-0000-0000-0000-000000000003';

  beforeAll(async () => {
    // Setup test app
    app = Fastify({ logger: false });
    
    // Mock authentication middleware
    app.decorateRequest('currentUser', null);
    app.addHook('onRequest', async (request) => {
      (request as any).currentUser = {
        id: 'test-user-id',
        tenantId: testTenantId,
        email: 'test@example.com',
        role: 'admin',
      };
    });

    await registerAiAnalyticsDashboardRoutes(app);
    await app.ready();

    // Setup test database
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await app.close();
    await aiMetricsCollectorService.shutdown();
  });

  async function setupTestDatabase() {
    // Create test tables if they don't exist (in-memory test or actual DB)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_capability_metrics (
          id BIGSERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          capability_type VARCHAR(100) NOT NULL,
          capability_domain VARCHAR(50) NOT NULL,
          capability_stage VARCHAR(20),
          camera_id UUID,
          branch_id UUID,
          zone_id UUID,
          region_id UUID,
          detections_count INT DEFAULT 0,
          true_positives INT DEFAULT 0,
          false_positives INT DEFAULT 0,
          false_negatives INT DEFAULT 0,
          true_negatives INT DEFAULT 0,
          accuracy_percent NUMERIC(5,2),
          precision_percent NUMERIC(5,2),
          recall_percent NUMERIC(5,2),
          f1_score NUMERIC(5,4),
          false_positive_rate NUMERIC(5,2),
          avg_inference_ms NUMERIC(10,2),
          min_inference_ms NUMERIC(10,2),
          max_inference_ms NUMERIC(10,2),
          p50_inference_ms NUMERIC(10,2),
          p95_inference_ms NUMERIC(10,2),
          p99_inference_ms NUMERIC(10,2),
          incidents_detected INT DEFAULT 0,
          incidents_prevented INT DEFAULT 0,
          investigation_time_saved_minutes INT DEFAULT 0,
          estimated_cost_avoided NUMERIC(12,2),
          model_name VARCHAR(100),
          model_version VARCHAR(50),
          measured_at TIMESTAMP NOT NULL,
          measurement_period_hours INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT uk_test_ai_metrics UNIQUE (tenant_id, capability_type, camera_id, measured_at)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_roi_configuration (
          tenant_id UUID PRIMARY KEY,
          manual_monitoring_cost_per_hour NUMERIC(10,2) DEFAULT 35.00,
          incident_prevention_value NUMERIC(10,2) DEFAULT 75.00,
          investigation_time_value_per_hour NUMERIC(10,2) DEFAULT 35.00,
          platform_license_annual NUMERIC(12,2) DEFAULT 120000.00,
          model_training_initial NUMERIC(12,2) DEFAULT 45000.00,
          infrastructure_initial NUMERIC(12,2) DEFAULT 80000.00,
          integration_initial NUMERIC(12,2) DEFAULT 35000.00,
          cloud_computing_annual NUMERIC(12,2) DEFAULT 36000.00,
          model_maintenance_annual NUMERIC(12,2) DEFAULT 24000.00,
          support_training_annual NUMERIC(12,2) DEFAULT 15000.00,
          discount_rate NUMERIC(5,4) DEFAULT 0.08,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Insert sample metrics for testing
      await insertSampleMetrics();
    } catch (error) {
      console.error('Failed to setup test database:', error);
    }
  }

  async function insertSampleMetrics() {
    const now = new Date();
    const capabilities = [
      { type: 'person', domain: 'human', accuracy: 96.8, fp_rate: 1.2, inference: 45, detections: 10000 },
      { type: 'vehicle', domain: 'vehicle', accuracy: 95.4, fp_rate: 2.1, inference: 52, detections: 8000 },
      { type: 'face', domain: 'face', accuracy: 87.5, fp_rate: 5.8, inference: 68, detections: 5000 },
      { type: 'anpr', domain: 'vehicle', accuracy: 91.8, fp_rate: 4.2, inference: 85, detections: 6000 },
    ];

    for (const cap of capabilities) {
      await pool.query(
        `INSERT INTO ai_capability_metrics (
          tenant_id, capability_type, capability_domain, camera_id, branch_id,
          detections_count, true_positives, false_positives, false_negatives,
          accuracy_percent, false_positive_rate, avg_inference_ms,
          min_inference_ms, max_inference_ms, p50_inference_ms,
          incidents_prevented, estimated_cost_avoided, measured_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (tenant_id, capability_type, camera_id, measured_at) DO NOTHING`,
        [
          testTenantId,
          cap.type,
          cap.domain,
          testCameraId,
          testBranchId,
          cap.detections,
          Math.floor(cap.detections * (cap.accuracy / 100)),
          Math.floor(cap.detections * (cap.fp_rate / 100)),
          Math.floor(cap.detections * ((100 - cap.accuracy) / 100)),
          cap.accuracy,
          cap.fp_rate,
          cap.inference,
          cap.inference * 0.8,
          cap.inference * 1.5,
          cap.inference,
          Math.floor(cap.detections * 0.02), // 2% incidents prevented
          cap.detections * 2.5, // $2.50 per detection prevented
          now,
        ],
      );
    }
  }

  async function cleanupTestDatabase() {
    try {
      await pool.query(
        `DELETE FROM ai_capability_metrics WHERE tenant_id = $1`,
        [testTenantId],
      );
      await pool.query(
        `DELETE FROM ai_roi_configuration WHERE tenant_id = $1`,
        [testTenantId],
      );
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
    }
  }

  describe('ROI Calculator', () => {
    it('should calculate ROI with default configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/roi',
        query: {
          start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          include_projections: 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Validate structure
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('investment');
      expect(data).toHaveProperty('benefits');
      expect(data).toHaveProperty('roi_calculation');
      expect(data).toHaveProperty('projections');
      expect(data).toHaveProperty('breakdown_by_domain');

      // Validate investment
      expect(data.investment.first_year_total).toBeGreaterThan(0);
      expect(data.investment.annual_recurring_total).toBeGreaterThan(0);

      // Validate ROI calculation
      expect(data.roi_calculation.year_1.roi_percent).toBeDefined();
      expect(data.roi_calculation.year_1.payback_period_months).toBeGreaterThan(0);
      expect(data.roi_calculation.three_year_npv).toBeDefined();
      expect(data.roi_calculation.three_year_irr).toBeDefined();

      // Validate projections
      expect(data.projections.year_1).toBeDefined();
      expect(data.projections.year_2).toBeDefined();
      expect(data.projections.year_3).toBeDefined();

      console.log('ROI Test Results:');
      console.log(`  Year 1 ROI: ${data.roi_calculation.year_1.roi_percent}%`);
      console.log(`  Payback: ${data.roi_calculation.year_1.payback_period_months} months`);
      console.log(`  3-Year NPV: $${data.roi_calculation.three_year_npv.toLocaleString()}`);
    });

    it('should handle date range queries', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/roi',
        query: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.period.months).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Capability Comparison', () => {
    it('should compare 2 capabilities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/control/v1/reports/ai-analytics/compare',
        payload: {
          capability_types: ['person', 'vehicle'],
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      // Validate structure
      expect(data.capabilities).toHaveLength(2);
      expect(data.comparison_matrix).toBeDefined();
      expect(data.insights).toBeDefined();
      expect(data.rankings).toBeDefined();
      expect(data.summary).toBeDefined();

      // Validate capabilities
      const personCap = data.capabilities.find((c: any) => c.capability_type === 'person');
      expect(personCap).toBeDefined();
      expect(personCap.metrics.accuracy).toBeGreaterThan(0);
      expect(personCap.metrics.false_positive_rate).toBeGreaterThanOrEqual(0);

      // Validate rankings
      expect(data.rankings.by_accuracy).toHaveLength(2);
      expect(data.rankings.by_speed).toHaveLength(2);

      // Validate summary
      expect(data.summary.best_overall).toBeDefined();
      expect(data.summary.fastest).toBeDefined();

      console.log('Comparison Test Results:');
      console.log(`  Best Overall: ${data.summary.best_overall}`);
      console.log(`  Insights: ${data.insights.length}`);
    });

    it('should compare 4 capabilities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/control/v1/reports/ai-analytics/compare',
        payload: {
          capability_types: ['person', 'vehicle', 'face', 'anpr'],
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.capabilities).toHaveLength(4);
      expect(data.insights.length).toBeGreaterThan(0);
    });

    it('should reject comparison with less than 2 capabilities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/control/v1/reports/ai-analytics/compare',
        payload: {
          capability_types: ['person'],
        },
      });

      expect(response.statusCode).toBe(500); // Validation error
    });

    it('should reject comparison with more than 4 capabilities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/control/v1/reports/ai-analytics/compare',
        payload: {
          capability_types: ['person', 'vehicle', 'face', 'anpr', 'fire'],
        },
      });

      expect(response.statusCode).toBe(500); // Validation error
    });
  });

  describe('Capability List', () => {
    it('should list all capabilities', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/capabilities',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.total).toBeGreaterThan(0);
      expect(data.domains).toBeDefined();
      expect(Array.isArray(data.domains)).toBe(true);
    });

    it('should filter capabilities by domain', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/capabilities',
        query: { domain: 'human' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.domains.length).toBeGreaterThan(0);
      data.domains.forEach((domain: any) => {
        expect(domain.domain).toBe('human');
      });
    });

    it('should filter capabilities by stage', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/capabilities',
        query: { stage: 'core' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.total).toBeGreaterThan(0);
    });

    it('should search capabilities', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/capabilities',
        query: { search: 'person' },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.total).toBeGreaterThan(0);
    });
  });

  describe('Metrics Ingestion', () => {
    it('should ingest AI metrics events', async () => {
      const events = [
        {
          tenant_id: testTenantId,
          capability_type: 'person',
          capability_domain: 'human',
          camera_id: testCameraId,
          branch_id: testBranchId,
          detection_result: {
            is_true_positive: true,
            is_false_positive: false,
            is_false_negative: false,
            confidence_score: 0.95,
            inference_time_ms: 45.5,
          },
          incident_prevented: true,
          estimated_cost_avoided: 75,
          timestamp: new Date().toISOString(),
        },
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/api/control/v1/ai-metrics/ingest',
        payload: { events },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.ingested).toBe(1);
    });

    it('should get metrics collector status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/control/v1/ai-metrics/status',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('bufferSize');
      expect(data).toHaveProperty('isActive');
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const unauthApp = Fastify({ logger: false });
      await registerAiAnalyticsDashboardRoutes(unauthApp);
      await unauthApp.ready();

      const response = await unauthApp.inject({
        method: 'GET',
        url: '/api/control/v1/reports/ai-analytics/roi',
      });

      expect(response.statusCode).toBe(401);
      await unauthApp.close();
    });
  });
});
