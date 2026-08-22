/**
 * Event Bus Type Definitions
 * Types for NATS event bus integration
 */

import type { SecurityEvent } from '../types';

// NATS subject patterns
export const EVENT_SUBJECTS = {
  // Security events
  SECURITY_ALL: 'security.>',
  SECURITY_CAMERA: 'security.camera.>',
  SECURITY_ACCESS: 'security.access.>',
  SECURITY_NETWORK: 'security.network.>',
  SECURITY_STORAGE: 'security.storage.>',
  SECURITY_AI: 'security.ai.>',
  
  // Specific event types
  CAMERA_OFFLINE: 'security.camera.offline',
  CAMERA_TAMPER: 'security.camera.tamper',
  UNAUTHORIZED_ACCESS: 'security.access.unauthorized',
  MOTION_DETECTED: 'security.ai.motion',
  PERSON_DETECTED: 'security.ai.person',
  FIRE_DETECTED: 'security.ai.fire',
  NETWORK_DOWN: 'security.network.down',
  
  // Investigation events
  INVESTIGATION_CREATED: 'commander.investigation.created',
  INCIDENT_CREATED: 'commander.incident.created',
  EVIDENCE_COLLECTED: 'commander.evidence.collected',
} as const;

// Event payload structure
export interface EventBusMessage<T = any> {
  id: string;
  subject: string;
  timestamp: Date;
  source: string;
  data: T;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    version?: string;
    [key: string]: any;
  };
}

// Camera event payload
export interface CameraEventPayload {
  cameraId: string;
  eventType: string;
  timestamp: Date;
  severity: number;
  description?: string;
  metadata?: {
    location?: string;
    zone?: string;
    [key: string]: any;
  };
}

// Access control event payload
export interface AccessEventPayload {
  doorId: string;
  userId?: string;
  badgeId?: string;
  eventType: string;
  timestamp: Date;
  allowed: boolean;
  reason?: string;
  metadata?: {
    location?: string;
    [key: string]: any;
  };
}

// Network event payload
export interface NetworkEventPayload {
  deviceId: string;
  deviceType: 'switch' | 'router' | 'gateway' | 'camera' | 'recorder';
  eventType: string;
  timestamp: Date;
  status: 'up' | 'down' | 'degraded';
  metadata?: {
    ipAddress?: string;
    port?: number;
    [key: string]: any;
  };
}

// AI detection event payload
export interface AIDetectionPayload {
  detectionId: string;
  cameraId: string;
  detectionType: string;
  timestamp: Date;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, any>;
  metadata?: {
    modelVersion?: string;
    [key: string]: any;
  };
}

// Event handler function type
export type EventHandler<T = any> = (message: EventBusMessage<T>) => Promise<void>;

// Subscription configuration
export interface SubscriptionConfig {
  subject: string;
  queue?: string;
  durable?: boolean;
  ackWait?: number;
  maxDeliver?: number;
}

// Event bus statistics
export interface EventBusStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesFailed: number;
  averageProcessingTime: number;
  subscriptions: {
    subject: string;
    queue?: string;
    messageCount: number;
    lastMessage?: Date;
  }[];
}
