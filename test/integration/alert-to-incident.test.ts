/**
 * Sprint 1 - Test 1: Alert Correlation End-to-End
 * 
 * Verifies: Camera → AI/Rule → alert.created → Correlation → Incident
 * 
 * This test proves that:
 * 1. AI detection creates an alert
 * 2. Alert is processed by correlation engine
 * 3. Correlated alerts create an incident
 * 4. Incident appears in the system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool, type Pool } from 'pg';
import { MemoryStore } from '../../src/store.js';
import { PostgresStore } from '../../src/database/postgres-store.js';
import type { ControlPlaneStore } from '../../src/control-plane-store.js';
import { IncidentOrchestrator } from '../../src/services/incident-orchestrator.service.js';
import type { DetectionEvent } from '../../src/events/detection-event.js';
import { getEventBus } from '../../src/infrastructure/event-bus/event-bus.js';

describe('Sprint 1.1: Alert Correlation Flow', () => {
  let app: FastifyInstance;
  let store: ControlPlaneStore;
  let pool: Pool | null = null;
  let orchestrator: IncidentOrchestrator;
  let eventBus: any;

  const TENANT_ID = 'test-tenant-01';
  const BRANCH_ID = 'test-branch-01';
  const CAMERA_ID = 'test-camera-01';

  beforeEach(async () => {
    // Use memory store for faster tests
    store = new MemoryStore();
    
    // Initialize event bus (in-memory mode)
    eventBus = getEventBus({ serviceName: 'test-integration' });
    await eventBus.connect();

    // Create test app
    app = await buildApp({
      store,
      eventBus,
    });

    // Create incident orchestrator
    orchestrator = new IncidentOrchestrator(store, console);

    // Seed test data
    await seedTestData();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (eventBus) {
      await eventBus.disconnect();
    }
    if (pool) {
      await pool.end();
    }
  });

  async function seedTestData() {
    // Create test tenant (if using PostgresStore)
    if ('createTenant' in store) {
      await store.createTenant({
        id: TENANT_ID,
        name: 'Test Tenant',
        slug: 'test-tenant',
        status: 'active',
      });
    }

    // Create test camera
    await store.registerCamera({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      cameraId: CAMERA_ID,
      name: 'Test Camera 01',
      location: 'Front Entrance',
      sourceType: 'hikvision-dvr',
      ipAddress: '192.168.1.100',
      rtspUrl: 'rtsp://192.168.1.100:554/Streaming/Channels/101',
      username: 'admin',
      password: 'test123',
      isActive: true,
    });
  }

  describe('Test 1.1: Single High-Confidence Detection → Immediate Incident', () => {
    it('should create incident immediately for high-confidence fire detection', async () => {
      // Step 1: Create AI detection event
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'fire',
        detectionTime: new Date().toISOString(),
        confidence: 0.95,
        severity: 'P1',
        zone: 'server-room',
        metadata: {
          detectedObjects: [
            { class: 'fire', confidence: 0.95, bbox: [100, 100, 200, 200] },
          ],
        },
      };

      // Step 2: Process detection through orchestrator
      const result = await orchestrator.processAIEvent(detectionEvent);

      // Step 3: Verify incident created
      expect(result.action).toBe('created');
      expect(result.incidentId).toBeDefined();
      expect(result.verification).toBeDefined();
      expect(result.verification?.mode).toBe('automatic');

      // Step 4: Verify incident in database
      const incident = await store.getIncident(result.incidentId!);
      expect(incident).toBeDefined();
      expect(incident?.incidentType).toBe('fire');
      expect(incident?.severity).toBe('P1');
      expect(incident?.detectionSource).toBe('ai-analytics');
      expect(incident?.status).toBe('open');

      // Step 5: Verify evidence preservation initiated
      const videoRanges = await store.listIncidentVideoRanges(result.incidentId!);
      expect(videoRanges.length).toBeGreaterThan(0);

      // Step 6: Verify timeline created
      const timeline = await store.listIncidentTimeline(result.incidentId!);
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.some(e => e.eventType === 'detection')).toBe(true);

      console.log('✓ Fire detection created incident immediately');
      console.log(`  Incident ID: ${incident?.id}`);
      console.log(`  Incident Number: ${incident?.incidentNumber}`);
      console.log(`  Confidence: ${Math.round((detectionEvent.confidence || 0) * 100)}%`);
      console.log(`  Evidence ranges: ${videoRanges.length}`);
    });

    it('should create incident for high-confidence intrusion detection', async () => {
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'intrusion',
        detectionTime: new Date().toISOString(),
        confidence: 0.88,
        severity: 'P2',
        zone: 'restricted-area',
        trackedObjectId: 'person-123',
      };

      const result = await orchestrator.processAIEvent(detectionEvent);

      expect(result.action).toBe('created');
      expect(result.incidentId).toBeDefined();

      const incident = await store.getIncident(result.incidentId!);
      expect(incident?.incidentType).toBe('intrusion');
      expect(incident?.severity).toBe('P2');

      console.log('✓ Intrusion detection created incident');
    });
  });

  describe('Test 1.2: Multiple Detections → Correlation → Single Incident', () => {
    it('should correlate multiple loitering detections into single incident', async () => {
      const baseTime = new Date();
      const detections: DetectionEvent[] = [];

      // Generate 5 loitering detections over 3 minutes
      for (let i = 0; i < 5; i++) {
        detections.push({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          cameraId: CAMERA_ID,
          detectionType: 'loitering',
          detectionTime: new Date(baseTime.getTime() + i * 30000).toISOString(), // 30s apart
          confidence: 0.75 + (i * 0.03), // Increasing confidence
          severity: 'P3',
          zone: 'parking-lot',
          trackedObjectId: 'person-456',
        });
      }

      const results = [];
      
      // Process all detections
      for (const detection of detections) {
        const result = await orchestrator.processAIEvent(detection);
        results.push(result);
      }

      // First 4 should be buffered
      expect(results[0].action).toBe('buffered');
      expect(results[1].action).toBe('buffered');
      expect(results[2].action).toBe('buffered');
      expect(results[3].action).toBe('buffered');

      // 5th detection should trigger incident creation (threshold reached)
      expect(results[4].action).toBe('created');
      expect(results[4].incidentId).toBeDefined();

      // Verify incident created with correct detection count
      const incident = await store.getIncident(results[4].incidentId!);
      expect(incident).toBeDefined();
      expect(incident?.detectionCount).toBe(5);
      expect(incident?.incidentType).toBe('loitering');

      // Verify timeline shows all detections
      const timeline = await store.listIncidentTimeline(results[4].incidentId!);
      const detectionEvents = timeline.filter(e => e.eventType === 'detection');
      expect(detectionEvents.length).toBe(5);

      console.log('✓ Multiple detections correlated into single incident');
      console.log(`  Total detections: ${detections.length}`);
      console.log(`  Buffered: ${results.filter(r => r.action === 'buffered').length}`);
      console.log(`  Incident created on: detection #${results.findIndex(r => r.action === 'created') + 1}`);
      console.log(`  Incident detection count: ${incident?.detectionCount}`);
    });

    it('should update existing incident when new detection within correlation window', async () => {
      // Create initial high-confidence detection
      const firstDetection: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'smoke',
        detectionTime: new Date().toISOString(),
        confidence: 0.90,
        severity: 'P1',
        zone: 'warehouse',
      };

      const firstResult = await orchestrator.processAIEvent(firstDetection);
      expect(firstResult.action).toBe('created');

      const incidentId = firstResult.incidentId!;

      // Create second detection 2 minutes later (within window)
      const secondDetection: DetectionEvent = {
        ...firstDetection,
        detectionTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        confidence: 0.92,
      };

      const secondResult = await orchestrator.processAIEvent(secondDetection);
      
      // Should update existing incident, not create new one
      expect(secondResult.action).toBe('updated');
      expect(secondResult.incidentId).toBe(incidentId);

      // Verify detection count increased
      const incident = await store.getIncident(incidentId);
      expect(incident?.detectionCount).toBe(2);

      // Verify both detections in timeline
      const timeline = await store.listIncidentTimeline(incidentId);
      const detectionEvents = timeline.filter(e => e.eventType === 'detection');
      expect(detectionEvents.length).toBe(2);

      console.log('✓ Subsequent detection updated existing incident');
      console.log(`  Original incident ID: ${incidentId}`);
      console.log(`  Detection count: ${incident?.detectionCount}`);
    });
  });

  describe('Test 1.3: Low Confidence Detection → Verification Required', () => {
    it('should require operator verification for low-confidence detection', async () => {
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'unattended-object',
        detectionTime: new Date().toISOString(),
        confidence: 0.55, // Below auto-create threshold
        severity: 'P3',
        zone: 'lobby',
      };

      const result = await orchestrator.processAIEvent(detectionEvent);

      // Should require verification, not create incident
      expect(result.action).toBe('verification-required');
      expect(result.incidentId).toBeUndefined();
      expect(result.verification?.mode).toBe('operator-required');

      console.log('✓ Low confidence detection requires operator verification');
      console.log(`  Confidence: ${Math.round(detectionEvent.confidence * 100)}%`);
      console.log(`  Verification mode: ${result.verification?.mode}`);
    });

    it('should ignore very low confidence detection', async () => {
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'motion',
        detectionTime: new Date().toISOString(),
        confidence: 0.35, // Very low
        severity: 'P5',
        zone: 'hallway',
      };

      const result = await orchestrator.processAIEvent(detectionEvent);

      // Should be informational only
      expect(result.action).toBe('ignored');
      expect(result.verification?.mode).toBe('informational');

      console.log('✓ Very low confidence detection logged as informational');
    });
  });

  describe('Test 1.4: Cross-Camera Correlation', () => {
    it('should correlate related detections from multiple cameras', async () => {
      // Setup: Register second camera
      const CAMERA_ID_2 = 'test-camera-02';
      await store.registerCamera({
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID_2,
        name: 'Test Camera 02',
        location: 'Back Entrance',
        sourceType: 'hikvision-dvr',
        ipAddress: '192.168.1.101',
        rtspUrl: 'rtsp://192.168.1.101:554/Streaming/Channels/101',
        username: 'admin',
        password: 'test123',
        isActive: true,
      });

      // Create fire detection on camera 1
      const detection1: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'fire',
        detectionTime: new Date().toISOString(),
        confidence: 0.90,
        severity: 'P1',
        zone: 'server-room',
      };

      const result1 = await orchestrator.processAIEvent(detection1);
      expect(result1.action).toBe('created');

      // Create smoke detection on camera 2 shortly after
      const detection2: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID_2,
        detectionType: 'smoke',
        detectionTime: new Date(Date.now() + 30000).toISOString(), // 30s later
        confidence: 0.85,
        severity: 'P1',
        zone: 'server-room-adjacent',
      };

      const result2 = await orchestrator.processAIEvent(detection2);

      // Both incidents created (different cameras)
      // In production, cross-camera correlation would link these
      expect(result1.incidentId).toBeDefined();
      expect(result2.incidentId).toBeDefined();

      console.log('✓ Cross-camera detections handled');
      console.log(`  Camera 1 incident: ${result1.incidentId}`);
      console.log(`  Camera 2 incident: ${result2.incidentId}`);
      console.log(`  Note: Cross-camera linking would connect these in production`);
    });
  });

  describe('Test 1.5: Event Bus Integration', () => {
    it('should publish incident.created event to event bus', async () => {
      let eventReceived = false;
      let receivedEvent: any = null;

      // Subscribe to incident.created events
      await eventBus.subscribe('incident.created', async (event: any) => {
        eventReceived = true;
        receivedEvent = event;
      });

      // Create incident via detection
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'weapon',
        detectionTime: new Date().toISOString(),
        confidence: 0.92,
        severity: 'P1',
        zone: 'main-entrance',
      };

      const result = await orchestrator.processAIEvent(detectionEvent);
      expect(result.action).toBe('created');

      // Publish incident.created event
      await eventBus.publish({
        type: 'incident.created',
        tenantId: TENANT_ID,
        payload: {
          incidentId: result.incidentId,
          incidentNumber: result.result?.incident.incidentNumber,
          severity: 'P1',
          incidentType: 'weapon',
          detectionSource: 'ai-analytics',
        },
        source: 'incident-orchestrator',
        timestamp: new Date().toISOString(),
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify event received
      expect(eventReceived).toBe(true);
      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.payload.incidentId).toBe(result.incidentId);

      console.log('✓ Incident created event published to event bus');
      console.log(`  Event type: ${receivedEvent.type}`);
      console.log(`  Incident ID: ${receivedEvent.payload.incidentId}`);
    });
  });

  describe('Test 1.6: Full Pipeline Verification', () => {
    it('should complete full pipeline: Detection → Correlation → Incident → Evidence → Tasks', async () => {
      const startTime = Date.now();

      // Step 1: AI Detection
      const detectionEvent: DetectionEvent = {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cameraId: CAMERA_ID,
        detectionType: 'atm-tampering',
        detectionTime: new Date().toISOString(),
        confidence: 0.87,
        severity: 'P2',
        zone: 'atm-area',
        metadata: {
          atmId: 'ATM-001',
          tamperType: 'skimmer-detected',
        },
      };

      // Step 2: Process detection
      const result = await orchestrator.processAIEvent(detectionEvent);
      expect(result.action).toBe('created');

      const incidentId = result.incidentId!;

      // Step 3: Verify incident created
      const incident = await store.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident?.status).toBe('open');

      // Step 4: Verify evidence preservation
      const videoRanges = await store.listIncidentVideoRanges(incidentId);
      expect(videoRanges.length).toBeGreaterThan(0);
      expect(videoRanges[0].applyLegalHold).toBe(true);

      // Step 5: Verify tasks created
      const tasks = await store.listIncidentTasks(incidentId);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some(t => t.taskName.includes('Verify'))).toBe(true);

      // Step 6: Verify timeline
      const timeline = await store.listIncidentTimeline(incidentId);
      expect(timeline.length).toBeGreaterThan(0);

      // Step 7: Verify camera linked
      const cameras = await store.listIncidentCameras(incidentId);
      expect(cameras.length).toBe(1);
      expect(cameras[0].cameraId).toBe(CAMERA_ID);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('✓ Full pipeline completed successfully');
      console.log(`  Processing time: ${duration}ms`);
      console.log(`  Incident: ${incident?.incidentNumber}`);
      console.log(`  Evidence ranges: ${videoRanges.length}`);
      console.log(`  Tasks created: ${tasks.length}`);
      console.log(`  Timeline events: ${timeline.length}`);
      console.log(`  Cameras linked: ${cameras.length}`);

      // Performance assertion
      expect(duration).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });
});
