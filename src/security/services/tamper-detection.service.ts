/**
 * Tamper Detection Service
 * Physical and logical tampering detection across infrastructure
 */

import { ITamperDetectionService, TamperFilters } from '../interfaces.js';
import { TamperEvent, TamperEventType, TamperSensor } from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

export class TamperDetectionService extends EventEmitter implements ITamperDetectionService {
  private monitoredDevices: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Report tamper event
   */
  async reportTamper(event: Omit<TamperEvent, 'id' | 'timestamp' | 'verified' | 'acknowledged'>): Promise<TamperEvent> {
    const db = getDatabase();

    const tamperEvent: TamperEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      verified: false,
      acknowledged: false,
      ...event
    };

    await db.collection('tamper_events').insertOne(tamperEvent);

    this.emit('tamper:detected', {
      eventId: tamperEvent.id,
      type: tamperEvent.type,
      deviceId: tamperEvent.deviceId,
      severity: tamperEvent.severity
    });

    // Auto-escalate critical events
    if (tamperEvent.severity === 'critical') {
      this.emit('tamper:critical', tamperEvent);
    }

    return tamperEvent;
  }

  /**
   * Get tamper event by ID
   */
  async getTamperEvent(id: string): Promise<TamperEvent> {
    const db = getDatabase();
    
    const event = await db.collection('tamper_events').findOne({ id });
    
    if (!event) {
      throw new Error('Tamper event not found');
    }
    
    return event;
  }

  /**
   * List tamper events with filters
   */
  async listTamperEvents(filters: TamperFilters = {}): Promise<TamperEvent[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.deviceType) {
      query.deviceType = filters.deviceType;
    }
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.severity) {
      query.severity = filters.severity;
    }
    
    if (filters.acknowledged !== undefined) {
      query.acknowledged = filters.acknowledged;
    }
    
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }
    
    const events = await db.collection('tamper_events')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    
    return events;
  }

  /**
   * Acknowledge tamper event
   */
  async acknowledgeTamperEvent(id: string, userId: string, resolution: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('tamper_events').updateOne(
      { id },
      {
        $set: {
          acknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date(),
          resolution
        }
      }
    );

    this.emit('tamper:acknowledged', { eventId: id, userId });
  }

  /**
   * Start monitoring a device
   */
  async monitorDevice(deviceId: string, deviceType: string): Promise<void> {
    if (this.monitoredDevices.has(deviceId)) {
      return; // Already monitoring
    }

    // Poll device for tamper indicators
    const interval = setInterval(async () => {
      try {
        await this.checkDeviceTamper(deviceId, deviceType);
      } catch (error) {
        console.error(`Error monitoring device ${deviceId}:`, error);
      }
    }, 60000); // Check every minute

    this.monitoredDevices.set(deviceId, interval);

    this.emit('monitoring:started', { deviceId, deviceType });
  }

  /**
   * Stop monitoring a device
   */
  async stopMonitoring(deviceId: string): Promise<void> {
    const interval = this.monitoredDevices.get(deviceId);
    
    if (interval) {
      clearInterval(interval);
      this.monitoredDevices.delete(deviceId);
      this.emit('monitoring:stopped', { deviceId });
    }
  }

  /**
   * Verify tamper event
   */
  async verifyTamperEvent(eventId: string): Promise<boolean> {
    const db = getDatabase();
    const event = await this.getTamperEvent(eventId);

    // Verify evidence
    let verified = false;
    
    if (event.evidence.length > 0) {
      // Check evidence integrity
      verified = await this.verifyEvidence(event.evidence);
    }

    // Update event
    await db.collection('tamper_events').updateOne(
      { id: eventId },
      {
        $set: {
          verified,
          verifiedAt: new Date()
        }
      }
    );

    return verified;
  }

  /**
   * Register tamper sensor
   */
  async registerSensor(deviceId: string, sensorType: string): Promise<void> {
    const db = getDatabase();

    const sensor: TamperSensor = {
      deviceId,
      sensorType: sensorType as any,
      enabled: true
    };

    await db.collection('tamper_sensors').insertOne(sensor);

    this.emit('sensor:registered', { deviceId, sensorType });
  }

  /**
   * Get sensor status for device
   */
  async getSensorStatus(deviceId: string): Promise<TamperSensor[]> {
    const db = getDatabase();
    
    return await db.collection('tamper_sensors')
      .find({ deviceId })
      .toArray();
  }

  /**
   * Check device for tamper indicators
   */
  private async checkDeviceTamper(deviceId: string, deviceType: string): Promise<void> {
    const db = getDatabase();
    
    // Get sensors for device
    const sensors = await this.getSensorStatus(deviceId);
    
    for (const sensor of sensors) {
      if (!sensor.enabled) continue;
      
      // Check sensor readings
      const reading = await this.readSensor(deviceId, sensor.sensorType);
      
      if (sensor.threshold && reading > sensor.threshold) {
        // Threshold exceeded - possible tamper
        await this.reportTamper({
          type: this.mapSensorToEventType(sensor.sensorType),
          severity: 'medium',
          deviceType: deviceType as any,
          deviceId,
          deviceName: deviceId,
          description: `${sensor.sensorType} sensor threshold exceeded`,
          evidence: [{
            type: 'sensor',
            source: sensor.sensorType,
            timestamp: new Date(),
            data: { reading, threshold: sensor.threshold }
          }],
          metadata: {}
        });
      }
    }
  }

  /**
   * Read sensor value
   */
  private async readSensor(deviceId: string, sensorType: string): Promise<number> {
    // Placeholder - would integrate with actual sensor APIs
    return Math.random() * 100;
  }

  /**
   * Map sensor type to event type
   */
  private mapSensorToEventType(sensorType: string): TamperEventType {
    switch (sensorType) {
      case 'door':
        return TamperEventType.CHASSIS_OPENED;
      case 'motion':
        return TamperEventType.PHYSICAL_TAMPER;
      default:
        return TamperEventType.PHYSICAL_TAMPER;
    }
  }

  /**
   * Verify evidence integrity
   */
  private async verifyEvidence(evidence: any[]): Promise<boolean> {
    for (const item of evidence) {
      if (item.checksum) {
        // Verify checksum
        // Placeholder logic
      }
    }
    return true;
  }

  private generateId(): string {
    return `tamper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      const monitoredCount = this.monitoredDevices.size;
      const recentEvents = await db.collection('tamper_events')
        .countDocuments({
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
      
      return {
        status: 'healthy',
        details: {
          monitoredDevices: monitoredCount,
          recentEvents24h: recentEvents
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
