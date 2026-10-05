/**
 * Analytics Engine <-> Incident Management Integration
 *
 * Bridges AI detection events to the incident management system.
 */
import { toDetectionEvent } from './events/to-detection-event.js';
/**
 * HTTP Client for Incident Management API
 */
export class IncidentManagementClient {
    baseUrl;
    apiKey;
    logger;
    constructor(baseUrl, apiKey, logger) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.logger = logger;
    }
    async processAIEvent(event) {
        try {
            // Map shared DetectionEvent to legacy AIDetectionEvent shape expected by API
            const payload = {
                tenantId: event.tenantId,
                branchId: event.branchId,
                cameraId: event.cameraId,
                detectionType: event.eventType || event.detectionType,
                detectionTime: event.timestamp,
                confidence: event.confidence,
                // Map severity back to platform P1..P5 if possible
                severity: typeof event.severity === 'string' && /^P[1-5]$/.test(String(event.severity)) ? event.severity : undefined,
                zone: event.zoneId,
                trackedObjectId: event.trackIds && event.trackIds.length > 0 ? event.trackIds[0] : undefined,
                metadata: event.metadata,
            };
            const response = await fetch(`${this.baseUrl}/v1/incidents/ai-events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            this.logger?.log(`AI event processed: ${payload.detectionType} -> ${result.action} ${result.incidentId ? `(${result.incidentId})` : ''}`);
            return result;
        }
        catch (error) {
            this.logger?.error('Failed to process AI event:', error);
            throw error;
        }
    }
    async markFalsePositive(detectionId, reason, category) {
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
        }
        catch (error) {
            this.logger?.error('Failed to mark false positive:', error);
            throw error;
        }
    }
}
/**
 * Integration hook for analytics pipeline
 */
export class IncidentIntegrationHook {
    client;
    logger;
    constructor(client, logger) {
        this.client = client;
        this.logger = logger;
    }
    /**
     * Process detection result and forward to incident system
     */
    async onDetection(detection) {
        try {
            // Map detection to severity
            const severity = this.mapSeverity(detection.type, detection.confidence);
            // Create shared DetectionEvent using helper
            const event = toDetectionEvent({
                tenantId: detection.tenantId,
                branchId: detection.branchId,
                cameraId: detection.cameraId,
                type: detection.type,
                timestamp: detection.timestamp,
                confidence: detection.confidence,
                zone: detection.zone,
                trackedObjectId: detection.trackedObjectId,
                metadata: { ...(detection.metadata ?? {}), severity },
            });
            // Send to incident system
            const result = await this.client.processAIEvent(event);
            // Log result
            if (result.action === 'created') {
                this.logger?.log(`Incident created: ${result.incidentId}`);
            }
            else if (result.action === 'updated') {
                this.logger?.log(`Incident updated: ${result.incidentId}`);
            }
        }
        catch (error) {
            this.logger?.error('Failed to process detection for incident system:', error);
            // Don't throw - analytics pipeline should continue
        }
    }
    /**
     * Map detection type and confidence to severity
     */
    mapSeverity(detectionType, confidence) {
        // Critical detections
        const criticalTypes = ['fire', 'weapon', 'panic-alarm'];
        if (criticalTypes.includes(detectionType) && confidence >= 0.75) {
            return 'P1';
        }
        // High-risk detections
        const highRiskTypes = ['smoke', 'intrusion', 'restricted-area', 'atm-tampering'];
        if (highRiskTypes.includes(detectionType)) {
            if (confidence >= 0.85)
                return 'P1';
            if (confidence >= 0.75)
                return 'P2';
            return 'P3';
        }
        // Medium-risk detections
        const mediumRiskTypes = ['fall-detection', 'unattended-object', 'tailgating'];
        if (mediumRiskTypes.includes(detectionType)) {
            if (confidence >= 0.85)
                return 'P2';
            if (confidence >= 0.75)
                return 'P3';
            return 'P4';
        }
        // Low-risk / informational
        return 'P5';
    }
}
/**
 * Example usage in analytics pipeline
 */
export function createIncidentIntegration(config) {
    const client = new IncidentManagementClient(config.incidentApiUrl, config.apiKey, console);
    return new IncidentIntegrationHook(client, console);
}
