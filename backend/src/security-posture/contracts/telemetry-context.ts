/**
 * Context for security telemetry collection
 * 
 * Provides scope and targeting information for collectors.
 */

export interface SecurityTelemetryContext {
  /** Tenant/organization identifier */
  tenantId: string;
  
  /** Site identifier (optional) */
  siteId?: string;
  
  /** Device identifier (optional) */
  deviceId?: string;
  
  /** Recorder identifier (optional) */
  recorderId?: string;
  
  /** Camera identifier (optional) */
  cameraId?: string;
  
  /** Server/host identifier (optional) */
  serverId?: string;
  
  /** Network segment identifier (optional) */
  networkId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create context for tenant-wide collection
 */
export function createTenantContext(tenantId: string): SecurityTelemetryContext {
  return { tenantId };
}

/**
 * Create context for site-specific collection
 */
export function createSiteContext(tenantId: string, siteId: string): SecurityTelemetryContext {
  return { tenantId, siteId };
}

/**
 * Create context for device-specific collection
 */
export function createDeviceContext(
  tenantId: string,
  deviceId: string,
  metadata?: Record<string, unknown>
): SecurityTelemetryContext {
  return { tenantId, deviceId, metadata };
}
