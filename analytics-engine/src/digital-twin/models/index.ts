/**
 * Digital Twin Models
 * 
 * Export all digital twin model types.
 */

export * from './asset';
export * from './relationship';
export * from './topology';
export * from './blast-radius';
export * from './security-posture';

/**
 * Historical state snapshot
 */
export interface TwinStateSnapshot {
  id: string;
  assetId: string;
  
  timestamp: Date;
  
  status: string;
  healthScore: number;
  securityScore: number;
  
  metrics: Record<string, number>;
  
  metadata?: Record<string, unknown>;
}

/**
 * Event representing a change in the digital twin
 */
export interface TwinEvent {
  id: string;
  
  eventType: 
    | 'asset_created'
    | 'asset_updated'
    | 'asset_deleted'
    | 'asset_status_changed'
    | 'relationship_created'
    | 'relationship_deleted'
    | 'health_changed'
    | 'security_changed'
    | 'issue_detected'
    | 'issue_resolved';
  
  assetId: string;
  assetName?: string;
  
  timestamp: Date;
  
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  
  metadata?: Record<string, unknown>;
}

/**
 * Collector result from infrastructure discovery
 */
export interface CollectorResult {
  assets: Array<any>;
  relationships: Array<any>;
  errors?: Array<{
    message: string;
    assetId?: string;
  }>;
  collectedAt: Date;
}
