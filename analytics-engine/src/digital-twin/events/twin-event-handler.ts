/**
 * Digital Twin Event Handler
 * 
 * Listens to infrastructure events and updates the digital twin state in real-time.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { DigitalTwinService } from '../services/digital-twin.service.js';
import { AssetRepository } from '../repositories.js';
import { TwinEvent } from '../models.js';

export interface TwinEventPayload {
  assetId: string;
  assetName?: string;
  eventType: TwinEvent['eventType'];
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Event handler that updates digital twin based on infrastructure events
 */
export class TwinEventHandler extends EventEmitter {
  private assetRepo: AssetRepository;
  private twinService: DigitalTwinService;

  constructor(private readonly pool: Pool) {
    super();
    this.assetRepo = new AssetRepository(pool);
    this.twinService = new DigitalTwinService(pool);
  }

  /**
   * Initialize event listeners
   */
  initialize(eventBus: EventEmitter): void {
    // Camera events
    eventBus.on('camera.online', (data) => this.handleCameraOnline(data));
    eventBus.on('camera.offline', (data) => this.handleCameraOffline(data));
    eventBus.on('camera.status', (data) => this.handleCameraStatus(data));
    eventBus.on('camera.health', (data) => this.handleCameraHealth(data));
    
    // Network events
    eventBus.on('network.device.online', (data) => this.handleNetworkDeviceOnline(data));
    eventBus.on('network.device.offline', (data) => this.handleNetworkDeviceOffline(data));
    eventBus.on('network.device.degraded', (data) => this.handleNetworkDeviceDegraded(data));
    
    // Recorder events
    eventBus.on('recorder.online', (data) => this.handleRecorderOnline(data));
    eventBus.on('recorder.offline', (data) => this.handleRecorderOffline(data));
    eventBus.on('recorder.storage.warning', (data) => this.handleRecorderStorageWarning(data));
    
    // Storage events
    eventBus.on('storage.capacity.warning', (data) => this.handleStorageCapacityWarning(data));
    eventBus.on('storage.capacity.critical', (data) => this.handleStorageCapacityCritical(data));
    eventBus.on('storage.health', (data) => this.handleStorageHealth(data));

    console.log('[TwinEventHandler] Event listeners initialized');
  }

  /**
   * Handle camera online event
   */
  private async handleCameraOnline(data: any): Promise<void> {
    try {
      const assetId = `camera_${data.cameraId}`;
      
      await this.assetRepo.updateStatus(assetId, 'healthy');
      await this.assetRepo.updateHealth(assetId, 100, []);

      await this.emitTwinUpdate({
        assetId,
        assetName: data.cameraName,
        eventType: 'asset_status_changed',
        previousState: { status: 'offline' },
        newState: { status: 'healthy' },
        metadata: { source: 'camera.online' }
      });

      console.log(`[TwinEventHandler] Camera ${assetId} marked as online`);
    } catch (error) {
      console.error('[TwinEventHandler] Error handling camera online:', error);
    }
  }

  /**
   * Handle camera offline event
   */
  private async handleCameraOffline(data: any): Promise<void> {
    try {
      const assetId = `camera_${data.cameraId}`;
      
      await this.assetRepo.updateStatus(assetId, 'offline');
      await this.assetRepo.updateHealth(assetId, 0, [
        {
          id: `issue_${Date.now()}`,
          type: 'connectivity',
          severity: 'critical',
          title: 'Camera Offline',
          description: 'Camera is not responding',
          detectedAt: new Date()
        }
      ]);

      await this.emitTwinUpdate({
        assetId,
        assetName: data.cameraName,
        eventType: 'asset_status_changed',
        previousState: { status: 'healthy' },
        newState: { status: 'offline' },
        metadata: { source: 'camera.offline', reason: data.reason }
      });

      // Calculate blast radius when critical asset goes offline
      const asset = await this.assetRepo.findById(assetId);
      if (asset?.criticality === 'critical') {
        const blastRadius = await this.twinService.calculateBlastRadius(assetId);
        
        await this.emitTwinUpdate({
          assetId,
          eventType: 'issue_detected',
          metadata: {
            blastRadius: {
              totalAffected: blastRadius.totalAffected,
              criticalServices: blastRadius.criticalServices.length
            }
          }
        });
      }

      console.log(`[TwinEventHandler] Camera ${assetId} marked as offline`);
    } catch (error) {
      console.error('[TwinEventHandler] Error handling camera offline:', error);
    }
  }

  /**
   * Handle camera status update
   */
  private async handleCameraStatus(data: any): Promise<void> {
    try {
      const assetId = `camera_${data.cameraId}`;
      const status = this.mapCameraStatus(data.status);
      
      await this.assetRepo.updateStatus(assetId, status);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status },
        metadata: { source: 'camera.status' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling camera status:', error);
    }
  }

  /**
   * Handle camera health update
   */
  private async handleCameraHealth(data: any): Promise<void> {
    try {
      const assetId = `camera_${data.cameraId}`;
      const healthScore = data.healthScore || 100;
      
      await this.assetRepo.updateHealth(assetId, healthScore, data.issues || []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'health_changed',
        newState: { healthScore },
        metadata: { source: 'camera.health' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling camera health:', error);
    }
  }

  /**
   * Handle network device online
   */
  private async handleNetworkDeviceOnline(data: any): Promise<void> {
    try {
      const assetId = `${data.deviceType}_${data.deviceId}`;
      
      await this.assetRepo.updateStatus(assetId, 'healthy');
      await this.assetRepo.updateHealth(assetId, 100, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status: 'healthy' },
        metadata: { source: 'network.device.online' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling network device online:', error);
    }
  }

  /**
   * Handle network device offline
   */
  private async handleNetworkDeviceOffline(data: any): Promise<void> {
    try {
      const assetId = `${data.deviceType}_${data.deviceId}`;
      
      await this.assetRepo.updateStatus(assetId, 'offline');
      await this.assetRepo.updateHealth(assetId, 0, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status: 'offline' },
        metadata: { source: 'network.device.offline' }
      });

      // Network failures have high blast radius
      const blastRadius = await this.twinService.calculateBlastRadius(assetId);
      
      if (blastRadius.totalAffected > 0) {
        await this.emitTwinUpdate({
          assetId,
          eventType: 'issue_detected',
          metadata: {
            type: 'network_failure',
            blastRadius: {
              totalAffected: blastRadius.totalAffected,
              affectedCameras: blastRadius.byType.camera || 0
            }
          }
        });
      }
    } catch (error) {
      console.error('[TwinEventHandler] Error handling network device offline:', error);
    }
  }

  /**
   * Handle network device degraded
   */
  private async handleNetworkDeviceDegraded(data: any): Promise<void> {
    try {
      const assetId = `${data.deviceType}_${data.deviceId}`;
      
      await this.assetRepo.updateStatus(assetId, 'degraded');
      await this.assetRepo.updateHealth(assetId, 50, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status: 'degraded' },
        metadata: { source: 'network.device.degraded', reason: data.reason }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling network device degraded:', error);
    }
  }

  /**
   * Handle recorder online
   */
  private async handleRecorderOnline(data: any): Promise<void> {
    try {
      const assetId = `nvr_${data.recorderId}`;
      
      await this.assetRepo.updateStatus(assetId, 'healthy');
      await this.assetRepo.updateHealth(assetId, 100, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status: 'healthy' },
        metadata: { source: 'recorder.online' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling recorder online:', error);
    }
  }

  /**
   * Handle recorder offline
   */
  private async handleRecorderOffline(data: any): Promise<void> {
    try {
      const assetId = `nvr_${data.recorderId}`;
      
      await this.assetRepo.updateStatus(assetId, 'offline');
      await this.assetRepo.updateHealth(assetId, 0, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'asset_status_changed',
        newState: { status: 'offline' },
        metadata: { source: 'recorder.offline' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling recorder offline:', error);
    }
  }

  /**
   * Handle recorder storage warning
   */
  private async handleRecorderStorageWarning(data: any): Promise<void> {
    try {
      const assetId = `nvr_${data.recorderId}`;
      
      await this.assetRepo.updateStatus(assetId, 'warning');
      await this.assetRepo.updateHealth(assetId, 60, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'issue_detected',
        metadata: {
          type: 'storage_warning',
          utilization: data.utilization,
          source: 'recorder.storage.warning'
        }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling recorder storage warning:', error);
    }
  }

  /**
   * Handle storage capacity warning
   */
  private async handleStorageCapacityWarning(data: any): Promise<void> {
    try {
      const assetId = `storage_${data.storageId}`;
      
      await this.assetRepo.updateStatus(assetId, 'warning');
      await this.assetRepo.updateHealth(assetId, 65, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'issue_detected',
        metadata: {
          type: 'capacity_warning',
          utilization: data.utilization,
          source: 'storage.capacity.warning'
        }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling storage capacity warning:', error);
    }
  }

  /**
   * Handle storage capacity critical
   */
  private async handleStorageCapacityCritical(data: any): Promise<void> {
    try {
      const assetId = `storage_${data.storageId}`;
      
      await this.assetRepo.updateStatus(assetId, 'critical');
      await this.assetRepo.updateHealth(assetId, 20, []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'issue_detected',
        metadata: {
          type: 'capacity_critical',
          utilization: data.utilization,
          source: 'storage.capacity.critical'
        }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling storage capacity critical:', error);
    }
  }

  /**
   * Handle storage health update
   */
  private async handleStorageHealth(data: any): Promise<void> {
    try {
      const assetId = `storage_${data.storageId}`;
      
      await this.assetRepo.updateHealth(assetId, data.healthScore || 100, data.issues || []);

      await this.emitTwinUpdate({
        assetId,
        eventType: 'health_changed',
        newState: { healthScore: data.healthScore },
        metadata: { source: 'storage.health' }
      });
    } catch (error) {
      console.error('[TwinEventHandler] Error handling storage health:', error);
    }
  }

  /**
   * Emit twin update event for WebSocket broadcast
   */
  private async emitTwinUpdate(payload: TwinEventPayload): Promise<void> {
    this.emit('twin.updated', payload);
  }

  /**
   * Map camera status to twin status
   */
  private mapCameraStatus(status: string): any {
    switch (status) {
      case 'online':
        return 'healthy';
      case 'offline':
        return 'offline';
      case 'degraded':
        return 'degraded';
      case 'error':
        return 'critical';
      default:
        return 'unknown';
    }
  }
}
