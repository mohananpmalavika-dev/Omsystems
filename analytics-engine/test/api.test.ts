/**
 * API Endpoint Tests
 * Tests for REST API endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { buildAnalyticsEngine } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('API Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildAnalyticsEngine({
      sourceSharedKey: 'test-source-key',
      controlPlaneSharedKey: 'test-control-plane-key',
      controlPlaneUrl: 'http://localhost:4000',
      submit: async () => {}, // Mock submit function
      logger: false
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('ok');
    });

    it('should return detector health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/detectors/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('initialized');
      expect(body).toHaveProperty('detectors');
    });

    it('should return specific detector health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/detectors/person/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('status');
    });
  });

  describe('Human Analytics Endpoints', () => {
    it('should get person Re-ID tracks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/human/reid'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('tracks');
      expect(Array.isArray(body.tracks)).toBe(true);
    });

    it('should get behavior detections', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/human/behaviors'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('behaviors');
    });

    it('should get occupancy metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/human/occupancy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('current');
      expect(body).toHaveProperty('unique');
    });
  });

  describe('Vehicle Analytics Endpoints', () => {
    it('should get ANPR detections', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/vehicles/anpr'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('detections');
    });

    it('should get traffic flow metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/vehicles/traffic-flow'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalVehicles');
      expect(body).toHaveProperty('avgSpeed');
    });

    it('should get parking violations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/vehicles/parking-violations'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('violations');
    });
  });

  describe('AI Search Engine Endpoints', () => {
    it('should perform natural language search', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/analytics/search/query',
        payload: {
          query: 'person wearing red shirt',
          limit: 10
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('query');
      expect(body).toHaveProperty('results');
    });

    it('should search by image', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/analytics/search/image',
        payload: {
          imageBase64: 'base64-encoded-image-data',
          searchType: 'person',
          limit: 10
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
    });
  });

  describe('AI Assistant Endpoints', () => {
    it('should process natural language query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/analytics/assistant/query',
        payload: {
          query: 'What is the system health?',
          sessionId: 'test-session-001'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('query');
      expect(body).toHaveProperty('response');
      expect(body).toHaveProperty('intent');
    });

    it('should get conversation history', async () => {
      const sessionId = 'test-session-001';
      
      // First, send a query
      await app.inject({
        method: 'POST',
        url: '/v1/analytics/assistant/query',
        payload: {
          query: 'Hello',
          sessionId
        }
      });

      // Then get history
      const response = await app.inject({
        method: 'GET',
        url: `/v1/analytics/assistant/history/${sessionId}`
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('messages');
    });
  });

  describe('Model Management Endpoints', () => {
    it('should get model statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/models/stats'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalLoads');
      expect(body).toHaveProperty('cacheHits');
      expect(body).toHaveProperty('cacheMisses');
    });

    it('should get memory usage report', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/models/memory'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('used');
      expect(body).toHaveProperty('available');
    });

    it('should get GPU information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/models/gpu-info'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('available');
      expect(body).toHaveProperty('type');
    });

    it('should get loaded models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/models/loaded'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('models');
    });
  });

  describe('Module Management Endpoints', () => {
    it('should get module status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/analytics/modules/status'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('coreModules');
      expect(body).toHaveProperty('optionalModules');
    });

    it('should enable optional modules', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/analytics/modules/enable',
        payload: {
          module: 'industrial'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent detector', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/detectors/nonexistent/health'
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate request payloads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/analytics/search/query',
        payload: {
          // Missing required 'query' field
          limit: 10
        }
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
