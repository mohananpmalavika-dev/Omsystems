/**
 * Example: Camera Health Monitoring Integration with Event Bus
 * 
 * This demonstrates how to integrate the event bus into existing
 * camera monitoring services to decouple alert creation, analytics,
 * and reporting.
 */

import type { EventBus } from '../event-bus.js';
import { EventEmitters } from '../event-emitters.js';
import { EventType } from '../event-types.js';

/**
 * Camera Health Monitor
 * Emits events when camera health changes
 */
export class CameraHealthMonitor {
  private events: EventEmitters;
  
  constructor(private eventBus: EventBus) {
    this.events = new EventEmitters(eventBus);
  }

  /**
   * Check camera and emit status change events
   */
  async checkCameraHealth(
    tenantId: string,
    branchId: string,
    cameraId: string,
    previousStatus: string
  ): Promise<void> {
    try {
      // Perform health check (existing logic)
      const healthResult = await this.performHealthCheck(cameraId);
      const newStatus = healthResult.status;

      // If status changed, emit event instead of direct database update
      if (previousStatus !== newStatus) {
        await this.events.camera.statusChanged(
          tenantId,
          cameraId,
          previousStatus,
          newStatus,
          {
            branchId,
            reason: healthResult.reason,
            details: healthResult.details,
          }
        );
      }

      // Check for stream failures
      if (healthResult.streamFailed) {
        await this.events.camera.streamFailed(
          tenantId,
          cameraId,
          healthResult.streamUrl,
          {
            branchId,
            errorCode: healthResult.errorCode,
            errorMessage: healthResult.errorMessage,
            retryAttempt: healthResult.retryAttempt,
          }
        );
      }

      // Check for recovery
      if (newStatus === 'online' && previousStatus === 'offline') {
        await this.events.camera.recovered(
          tenantId,
          cameraId,
          healthResult.downDuration,
          {
            branchId,
            recoveryMethod: healthResult.recoveryMethod,
            previousIssue: healthResult.previousIssue,
          }
        );
      }
    } catch (error) {
      console.error('Camera health check failed:', error);
      throw error;
    }
  }

  private async performHealthCheck(cameraId: string) {
    // Existing health check logic
    return {
      status: 'online',
      reason: 'health_check_passed',
      details: { ping: 50, uptime: 3600 },
      streamFailed: false,
      streamUrl: '',
      errorCode: '',
      errorMessage: '',
      retryAttempt: 0,
      downDuration: 0,
      recoveryMethod: 'automatic' as const,
      previousIssue: '',
    };
  }
}

/**
 * Alert Service
 * Subscribes to camera events and creates alerts
 */
export class CameraAlertService {
  private events: EventEmitters;
  
  constructor(private eventBus: EventBus) {
    this.events = new EventEmitters(eventBus);
  }

  /**
   * Initialize subscriptions
   */
  async initialize(): Promise<void> {
    // Subscribe to camera status changes
    await this.eventBus.subscribe(
      EventType.CAMERA_STATUS_CHANGED,
      async (event) => {
        await this.handleCameraStatusChanged(event);
      },
      {
        retryOnFailure: true,
        maxRetries: 3,
      }
    );

    // Subscribe to stream failures
    await this.eventBus.subscribe(
      EventType.CAMERA_STREAM_FAILED,
      async (event) => {
        await this.handleStreamFailed(event);
      }
    );

    // Subscribe to camera recovery
    await this.eventBus.subscribe(
      EventType.CAMERA_RECOVERED,
      async (event) => {
        await this.handleCameraRecovered(event);
      }
    );

    console.log('[CameraAlertService] Initialized and subscribed to camera events');
  }

  private async handleCameraStatusChanged(event: any): Promise<void> {
    const { cameraId, previousStatus, newStatus } = event.payload;

    if (newStatus === 'offline') {
      // Camera went offline - create high priority alert
      const alertId = await this.createOfflineAlert(
        event.tenantId,
        event.branchId,
        cameraId
      );

      // Emit alert created event
      await this.events.alert.created(
        event.tenantId,
        alertId,
        'camera_offline',
        'high',
        'Camera Offline',
        `Camera ${cameraId} has gone offline`,
        {
          branchId: event.branchId,
          deviceId: cameraId,
          sourceEventId: event.eventId,
          affectedDevices: [cameraId],
          recommendedActions: [
            'Check camera power supply',
            'Verify network connectivity',
            'Restart camera if necessary',
          ],
        }
      );
    } else if (newStatus === 'degraded') {
      // Camera degraded - create medium priority alert
      const alertId = await this.createDegradedAlert(
        event.tenantId,
        event.branchId,
        cameraId
      );

      await this.events.alert.created(
        event.tenantId,
        alertId,
        'camera_degraded',
        'medium',
        'Camera Performance Degraded',
        `Camera ${cameraId} is experiencing performance issues`,
        {
          branchId: event.branchId,
          deviceId: cameraId,
          sourceEventId: event.eventId,
        }
      );
    }
  }

  private async handleStreamFailed(event: any): Promise<void> {
    const { cameraId, errorCode, retryAttempt } = event.payload;

    // Only create alert if multiple retries failed
    if (retryAttempt && retryAttempt >= 3) {
      const alertId = await this.createStreamFailureAlert(
        event.tenantId,
        event.branchId,
        cameraId,
        errorCode
      );

      await this.events.alert.created(
        event.tenantId,
        alertId,
        'stream_failure',
        'high',
        'Camera Stream Failure',
        `Camera ${cameraId} stream has failed after ${retryAttempt} attempts`,
        {
          branchId: event.branchId,
          deviceId: cameraId,
          sourceEventId: event.eventId,
        }
      );
    }
  }

  private async handleCameraRecovered(event: any): Promise<void> {
    const { cameraId, downDuration } = event.payload;

    // Find and resolve related alerts
    const openAlerts = await this.findOpenAlerts(event.tenantId, cameraId);
    
    for (const alert of openAlerts) {
      await this.events.alert.resolved(
        event.tenantId,
        alert.id,
        'system',
        {
          branchId: event.branchId,
          resolution: `Camera recovered automatically after ${Math.floor(downDuration / 1000)} seconds`,
        }
      );
    }
  }

  private async createOfflineAlert(
    tenantId: string,
    branchId: string,
    cameraId: string
  ): Promise<string> {
    // Database insertion logic
    return 'alert-' + Math.random().toString(36);
  }

  private async createDegradedAlert(
    tenantId: string,
    branchId: string,
    cameraId: string
  ): Promise<string> {
    return 'alert-' + Math.random().toString(36);
  }

  private async createStreamFailureAlert(
    tenantId: string,
    branchId: string,
    cameraId: string,
    errorCode: string
  ): Promise<string> {
    return 'alert-' + Math.random().toString(36);
  }

  private async findOpenAlerts(tenantId: string, cameraId: string): Promise<Array<{ id: string }>> {
    return [];
  }
}

/**
 * Analytics Service
 * Subscribes to camera events for metrics and reporting
 */
export class CameraAnalyticsService {
  constructor(private eventBus: EventBus) {}

  async initialize(): Promise<void> {
    // Subscribe to all camera events using pattern matching
    await this.eventBus.subscribePattern(
      'sentinel.camera.*',
      async (event) => {
        await this.recordMetric(event);
      }
    );

    console.log('[CameraAnalyticsService] Initialized and subscribed to camera patterns');
  }

  private async recordMetric(event: any): Promise<void> {
    // Record metrics for analytics
    console.log(`[Analytics] Recording metric for ${event.eventType}`);
    
    // Update time-series database
    // Calculate uptime percentages
    // Track MTBF (Mean Time Between Failures)
    // Generate availability reports
  }
}

/**
 * Branch Health Aggregator
 * Subscribes to camera events and updates branch health status
 */
export class BranchHealthAggregator {
  private events: EventEmitters;
  
  constructor(private eventBus: EventBus) {
    this.events = new EventEmitters(eventBus);
  }

  async initialize(): Promise<void> {
    // Subscribe to camera status changes
    await this.eventBus.subscribe(
      EventType.CAMERA_STATUS_CHANGED,
      async (event) => {
        await this.updateBranchHealth(event);
      }
    );

    console.log('[BranchHealthAggregator] Initialized');
  }

  private async updateBranchHealth(event: any): Promise<void> {
    if (!event.branchId) return;

    // Aggregate camera statuses for the branch
    const branchStats = await this.getBranchCameraStats(
      event.tenantId,
      event.branchId
    );

    // Determine branch health
    const previousHealth = await this.getCurrentBranchHealth(
      event.tenantId,
      event.branchId
    );
    
    const newHealth = this.calculateBranchHealth(branchStats);

    // If health changed, emit branch health event
    if (previousHealth !== newHealth) {
      await this.events.branch.healthChanged(
        event.tenantId,
        event.branchId,
        previousHealth,
        newHealth,
        {
          healthScore: branchStats.healthScore,
          affectedSystems: branchStats.affectedSystems,
          metrics: {
            camerasOnline: branchStats.camerasOnline,
            camerasTotal: branchStats.camerasTotal,
            recordingActive: branchStats.recordingActive,
            networkLatency: branchStats.networkLatency,
          },
        }
      );
    }
  }

  private async getBranchCameraStats(tenantId: string, branchId: string) {
    return {
      camerasOnline: 10,
      camerasTotal: 12,
      recordingActive: true,
      networkLatency: 50,
      healthScore: 85,
      affectedSystems: [],
    };
  }

  private async getCurrentBranchHealth(
    tenantId: string,
    branchId: string
  ): Promise<'healthy' | 'degraded' | 'critical' | 'offline'> {
    return 'healthy';
  }

  private calculateBranchHealth(
    stats: any
  ): 'healthy' | 'degraded' | 'critical' | 'offline' {
    const percentage = (stats.camerasOnline / stats.camerasTotal) * 100;
    
    if (percentage === 0) return 'offline';
    if (percentage < 50) return 'critical';
    if (percentage < 80) return 'degraded';
    return 'healthy';
  }
}

/**
 * Example: Complete Integration
 */
export async function setupCameraEventSystem(eventBus: EventBus): Promise<void> {
  // Initialize all services
  const alertService = new CameraAlertService(eventBus);
  await alertService.initialize();

  const analyticsService = new CameraAnalyticsService(eventBus);
  await analyticsService.initialize();

  const branchHealthAggregator = new BranchHealthAggregator(eventBus);
  await branchHealthAggregator.initialize();

  console.log('[EventSystem] Camera event system initialized');
}

/**
 * Example: Using the system
 */
export async function exampleUsage(eventBus: EventBus): Promise<void> {
  // Set up event system
  await setupCameraEventSystem(eventBus);

  // Monitor camera (this replaces direct alert creation)
  const monitor = new CameraHealthMonitor(eventBus);
  await monitor.checkCameraHealth(
    'tenant-123',
    'branch-456',
    'camera-789',
    'online'
  );

  // The event bus will automatically:
  // 1. Emit camera.status.changed event
  // 2. Alert service creates alert if needed
  // 3. Analytics service records metric
  // 4. Branch health aggregator updates branch status
  // 5. All without tight coupling!
}
