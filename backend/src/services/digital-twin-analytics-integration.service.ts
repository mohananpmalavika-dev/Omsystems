/**
 * Digital Twin Analytics Integration Service
 * Connects analytics engine detections to Digital Twin spatial alerts
 */

import digitalTwinEventMapper from './digital-twin-event-mapper.service';
import spatialAlertService from './spatial-alert.service';
import { AlertSeverity } from '../types/digital-twin';

export class DigitalTwinAnalyticsIntegration {
  // Map analytics detections to Digital Twin alerts
  async handleAnalyticsDetection(detection: {
    cameraId: string;
    detectionType: string;
    confidence: number;
    timestamp: Date;
    metadata?: any;
  }): Promise<void> {
    const severity = this.calculateSeverity(detection.detectionType, detection.confidence);
    const title = this.formatDetectionTitle(detection.detectionType);
    const description = this.formatDetectionDescription(detection);

    await digitalTwinEventMapper.onAIDetection(
      detection.cameraId,
      detection.detectionType,
      severity,
      title,
      description,
      {
        confidence: detection.confidence,
        timestamp: detection.timestamp,
        ...detection.metadata,
      }
    );
  }

  // Handle intrusion detection
  async handleIntrusionDetection(
    cameraId: string,
    zone: string,
    personCount: number,
    confidence: number
  ): Promise<void> {
    await this.handleAnalyticsDetection({
      cameraId,
      detectionType: 'intrusion',
      confidence,
      timestamp: new Date(),
      metadata: { zone, personCount },
    });
  }

  // Handle loitering detection
  async handleLoiteringDetection(
    cameraId: string,
    dwellTime: number,
    location: string
  ): Promise<void> {
    await this.handleAnalyticsDetection({
      cameraId,
      detectionType: 'loitering',
      confidence: 0.9,
      timestamp: new Date(),
      metadata: { dwellTime, location },
    });
  }

  // Handle perimeter breach
  async handlePerimeterBreach(
    cameraId: string,
    direction: string,
    crossingPoint: { x: number; y: number }
  ): Promise<void> {
    await this.handleAnalyticsDetection({
      cameraId,
      detectionType: 'perimeter_breach',
      confidence: 0.95,
      timestamp: new Date(),
      metadata: { direction, crossingPoint },
    });
  }

  // Handle restricted area violation
  async handleRestrictedAreaViolation(
    cameraId: string,
    zoneId: string,
    zoneName: string,
    personCount: number
  ): Promise<void> {
    await this.handleAnalyticsDetection({
      cameraId,
      detectionType: 'restricted_area',
      confidence: 0.9,
      timestamp: new Date(),
      metadata: { zoneId, zoneName, personCount },
    });
  }

  // Handle fire/smoke detection
  async handleFireSmokeDetection(
    cameraId: string,
    type: 'fire' | 'smoke',
    confidence: number,
    location: { x: number; y: number }
  ): Promise<void> {
    await this.handleAnalyticsDetection({
      cameraId,
      detectionType: `${type}_detected`,
      confidence,
      timestamp: new Date(),
      metadata: { type, location },
    });
  }

  // Handle crowd density alert
  async handleCrowdDensityAlert(
    cameraId: string,
    density: number,
    threshold: number,
    area: string
  ): Promise<void> {
    const severity = density > threshold * 1.5 ? 'critical' : 'high';
    
    await digitalTwinEventMapper.onAIDetection(
      cameraId,
      'crowd_density',
      severity as AlertSeverity,
      'High Crowd Density Detected',
      `Density ${density.toFixed(0)}% in ${area} (threshold: ${threshold}%)`,
      { density, threshold, area }
    );
  }

  // Handle weapon detection (if enabled)
  async handleWeaponDetection(
    cameraId: string,
    weaponType: string,
    confidence: number,
    boundingBox: any
  ): Promise<void> {
    await digitalTwinEventMapper.onAIDetection(
      cameraId,
      'weapon_detected',
      'critical',
      '⚠️ Weapon Detected',
      `${weaponType} detected with ${(confidence * 100).toFixed(0)}% confidence`,
      { weaponType, confidence, boundingBox }
    );
  }

  private calculateSeverity(detectionType: string, confidence: number): AlertSeverity {
    // Critical detections
    if (['weapon_detected', 'fire_detected', 'perimeter_breach'].includes(detectionType)) {
      return 'critical';
    }

    // High severity
    if (['intrusion', 'restricted_area', 'smoke_detected'].includes(detectionType)) {
      return confidence > 0.8 ? 'high' : 'medium';
    }

    // Medium severity
    if (['loitering', 'crowd_density'].includes(detectionType)) {
      return confidence > 0.85 ? 'medium' : 'low';
    }

    return 'low';
  }

  private formatDetectionTitle(detectionType: string): string {
    const titles: Record<string, string> = {
      intrusion: '🚨 Intrusion Detected',
      loitering: '⏱️ Loitering Detected',
      perimeter_breach: '🚧 Perimeter Breach',
      restricted_area: '⛔ Restricted Area Violation',
      fire_detected: '🔥 Fire Detected',
      smoke_detected: '💨 Smoke Detected',
      crowd_density: '👥 High Crowd Density',
      weapon_detected: '⚠️ Weapon Detected',
    };

    return titles[detectionType] || '⚠️ Security Alert';
  }

  private formatDetectionDescription(detection: any): string {
    const { detectionType, confidence, metadata } = detection;

    let desc = `Detection confidence: ${(confidence * 100).toFixed(0)}%`;

    if (metadata) {
      if (metadata.zone) desc += ` | Zone: ${metadata.zone}`;
      if (metadata.personCount) desc += ` | ${metadata.personCount} person(s)`;
      if (metadata.dwellTime) desc += ` | Dwell time: ${metadata.dwellTime}s`;
      if (metadata.direction) desc += ` | Direction: ${metadata.direction}`;
    }

    return desc;
  }

  // Initialize integration hooks with analytics engine
  initializeIntegration() {
    // This would be called when analytics engine detections occur
    console.log('Digital Twin Analytics Integration initialized');
  }
}

export default new DigitalTwinAnalyticsIntegration();
