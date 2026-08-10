/**
 * Authorization types for assistant commands
 * 
 * Authorization must occur AFTER resource resolution
 * to enable resource-specific permission checks.
 */

/**
 * Authorization request
 */
export interface AuthorizationRequest {
  /** User making the request */
  actor: {
    id: string;
    roles: string[];
    siteIds: string[];
  };
  
  /** Action being performed */
  action: string;
  
  /** Resource being acted upon */
  resource?: {
    type: string;
    id: string;
    siteId?: string;
    [key: string]: unknown;
  };
}

/**
 * Authorization decision
 */
export interface AuthorizationDecision {
  /** Is the action allowed? */
  allowed: boolean;
  
  /** Reason if denied */
  reason?: string;
  
  /** Specific permission that was missing */
  missingPermission?: string;
}

/**
 * Authorization service interface
 */
export interface AuthorizationService {
  /**
   * Check if an action is allowed
   */
  can(request: AuthorizationRequest): Promise<AuthorizationDecision>;
  
  /**
   * Assert that an action is allowed (throws if not)
   */
  assert(request: AuthorizationRequest): Promise<void>;
}

/**
 * Standard assistant actions
 */
export const AssistantActions = {
  // Camera actions
  CAMERA_START: 'camera.start',
  CAMERA_STOP: 'camera.stop',
  CAMERA_VIEW: 'camera.view',
  CAMERA_CONFIGURE: 'camera.configure',
  
  // Detection/event actions
  DETECTION_SEARCH: 'detection.search',
  DETECTION_VIEW: 'detection.view',
  EVENT_VIEW: 'event.view',
  
  // Investigation actions
  INVESTIGATION_CREATE: 'investigation.create',
  INVESTIGATION_VIEW: 'investigation.view',
  REID_SEARCH: 'reid.search',
  
  // Report actions
  REPORT_GENERATE: 'report.generate',
  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',
  
  // Analytics actions
  ANALYTICS_VIEW: 'analytics.view',
  ANALYTICS_QUERY: 'analytics.query',
  
  // System actions
  SYSTEM_HEALTH_VIEW: 'system.health.view',
  SYSTEM_STATUS_VIEW: 'system.status.view'
} as const;
