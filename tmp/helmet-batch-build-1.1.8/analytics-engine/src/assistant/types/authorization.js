/**
 * Authorization types for assistant commands
 *
 * Authorization must occur AFTER resource resolution
 * to enable resource-specific permission checks.
 */
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
};
