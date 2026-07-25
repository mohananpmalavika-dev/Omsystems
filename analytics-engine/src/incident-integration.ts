/**
 * Analytics Engine <-> Incident Management Integration
 * 
 * Bridges AI detection events to the incident management system.
 */

export interface IncidentAPIClient {
  processAIEvent(event: AIDetectionEvent): Promise<IncidentProcessingResult>;
  markFalsePositive(detectionId: string, reason: string, category: string): Promise<void>;
}

export interface AIDetectionEvent {
  tenantId: string;
  branchId?: string;
  cameraId: string;
  detectionType: string;
  detectionTime: string;
  confidence: number;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  zone?: string;
  trackedObjectId?: string;
  metadata?: Record<string, unknown>;
}

export interface IncidentProcessingResult {
  action: 'created' | 'updated' | 'buffered' | 'ignored' | 'verification-required';
  incidentId?: string;
  reason: string;
}

/**
 * HTTP Client for Incident Management API
 */
export class IncidentManagementClient implements IncidentAPIClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly logger?: Console
  ) {}
  
  async processAIEvent(event: AIDetectionEvent): Promise<IncidentProcessingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/incidents/ai-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(event),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      this.logger?.log(
        `AI event processed: ${event.detectionType} -> ${result.action} ${result.incidentId ? `(${result.incidentId})` : ''}`
      );
      
      return result;
    } catch (error) {
      this.logger?.error('Failed to process AI event:', error);
      throw error;
    }
  }
  
  async markFalsePositive(
    detectionId: string,
    reason: string,
    category: string
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/incidents/ai-events/${detectionId}/false-positive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ reason, category, improveModel: true }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.logger?.log(`False positive marked: ${detectionId} - ${reason}`);
    } catch (error) {
      this.logger?.error('Failed to mark false positive:', error);
      throw error;
    }
  }
}

/**
 * Integration hook for analytics pipeline
 */
export class IncidentIntegrationHook {
  constructor(
    private readonly client: IncidentAPIClient,
    private readonly logger?: Console
  ) {}
  
  /**
   * Process detection result and forward to incident system
   */
  async onDetection(detection: {
    type: string;
    confidence: number;
    cameraId: string;
    timestamp: string;
    tenantId: string;
    branchId?: string;
    zone?: string;
    trackedObjectId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Map detection to severity
      const severity = this.mapSeverity(detection.type, detection.confidence);
      
      // Create AI event
      const event: AIDetectionEvent = {
        tenantId: detection.tenantId,
        branchId: detection.branchId,
        cameraId: detection.cameraId,
        detectionType: detection.type,
        detectionTime: detection.timestamp,
        confidence: detection.confidence,
        severity,
        zone: detection.zone,
        trackedObjectId: detection.trackedObjectId,
        metadata: detection.metadata,
      };
      
      // Send to incident system
      const result = await this.client.processAIEvent(event);
      
      // Log result
      if (result.action === 'created') {
        this.logger?.log(`Incident created: ${result.incidentId}`);
      } else if (result.action === 'updated') {
        this.logger?.log(`Incident updated: ${result.incidentId}`);
      }
    } catch (error) {
      this.logger?.error('Failed to process detection for incident system:', error);
      // Don't throw - analytics pipeline should continue
    }
  }
  
  /**
   * Map detection type and confidence to severity
   */
  private mapSeverity(
    detectionType: string,
    confidence: number
  ): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
    // Critical detections
    const criticalTypes = ['fire', 'weapon', 'panic-alarm'];
    if (criticalTypes.includes(detectionType) && confidence >= 0.75) {
      return 'P1';
    }
    
    // High-risk detections
    const highRiskTypes = ['smoke', 'intrusion', 'restricted-area', 'atm-tampering'];
    if (highRiskTypes.includes(detectionType)) {
      if (confidence >= 0.85) return 'P1';
      if (confidence >= 0.75) return 'P2';
      return 'P3';
    }
    
    // Medium-risk detections
    const mediumRiskTypes = ['fall-detection', 'unattended-object', 'tailgating'];
    if (mediumRiskTypes.includes(detectionType)) {
      if (confidence >= 0.85) return 'P2';
      if (confidence >= 0.75) return 'P3';
      return 'P4';
    }
    
    // Low-risk / informational
    return 'P5';
  }
}

/**
 * Example usage in analytics pipeline
 */
export function createIncidentIntegration(config: {
  incidentApiUrl: string;
  apiKey: string;
}) {
  const client = new IncidentManagementClient(
    config.incidentApiUrl,
    config.apiKey,
    console
  );
  
  return new IncidentIntegrationHook(client, console);
}
