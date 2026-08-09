/**
 * Activity Tracking Hooks
 * React hooks for tracking employee activities
 */

import { useCallback } from 'react';
import { trackUserAction } from '@/components/activity-monitor';

/**
 * Hook for tracking user actions
 */
export function useActionTracking(moduleName: string) {
  const trackAction = useCallback((
    actionType: string,
    actionCategory: string,
    options?: {
      actionTarget?: string;
      actionDescription?: string;
      featureName?: string;
      actionMetadata?: Record<string, any>;
    }
  ) => {
    trackUserAction(actionType, actionCategory, moduleName, options);
  }, [moduleName]);

  return trackAction;
}

/**
 * Hook for tracking button clicks
 */
export function useButtonTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackButtonClick = useCallback((
    buttonName: string,
    options?: {
      featureName?: string;
      metadata?: Record<string, any>;
    }
  ) => {
    trackAction('button_click', 'navigation', {
      actionTarget: buttonName,
      actionDescription: `Clicked ${buttonName}`,
      featureName: options?.featureName,
      actionMetadata: options?.metadata,
    });
  }, [trackAction]);

  return trackButtonClick;
}

/**
 * Hook for tracking form submissions
 */
export function useFormTracking(moduleName: string, formName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackFormSubmit = useCallback((
    success: boolean,
    metadata?: Record<string, any>
  ) => {
    trackAction('form_submit', 'data_entry', {
      actionTarget: formName,
      actionDescription: `${formName} form ${success ? 'submitted successfully' : 'submission failed'}`,
      actionMetadata: { success, ...metadata },
    });
  }, [trackAction, formName]);

  const trackFormFieldChange = useCallback((
    fieldName: string
  ) => {
    trackAction('form_field_change', 'data_entry', {
      actionTarget: `${formName}.${fieldName}`,
      actionDescription: `Changed ${fieldName} in ${formName}`,
    });
  }, [trackAction, formName]);

  return { trackFormSubmit, trackFormFieldChange };
}

/**
 * Hook for tracking search queries
 */
export function useSearchTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackSearch = useCallback((
    query: string,
    resultsCount: number,
    featureName?: string
  ) => {
    trackAction('search', 'data_view', {
      actionDescription: `Searched for: ${query}`,
      featureName,
      actionMetadata: {
        query,
        resultsCount,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return trackSearch;
}

/**
 * Hook for tracking data exports
 */
export function useExportTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackExport = useCallback((
    exportType: string,
    recordCount: number,
    format: string
  ) => {
    trackAction('export', 'export', {
      actionTarget: exportType,
      actionDescription: `Exported ${recordCount} records as ${format}`,
      actionMetadata: {
        exportType,
        recordCount,
        format,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return trackExport;
}

/**
 * Hook for tracking filter changes
 */
export function useFilterTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackFilter = useCallback((
    filterName: string,
    filterValue: any
  ) => {
    trackAction('filter_change', 'data_view', {
      actionTarget: filterName,
      actionDescription: `Applied filter: ${filterName}`,
      actionMetadata: {
        filterName,
        filterValue,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return trackFilter;
}

/**
 * Hook for tracking camera operations
 */
export function useCameraTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackCameraView = useCallback((
    cameraId: string,
    cameraName: string
  ) => {
    trackAction('camera_view', 'monitoring', {
      actionTarget: cameraId,
      actionDescription: `Viewing camera: ${cameraName}`,
      featureName: 'camera_monitoring',
      actionMetadata: {
        cameraId,
        cameraName,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackCameraSwitch = useCallback((
    fromCameraId: string,
    toCameraId: string,
    toCameraName: string
  ) => {
    trackAction('camera_switch', 'monitoring', {
      actionTarget: toCameraId,
      actionDescription: `Switched to camera: ${toCameraName}`,
      featureName: 'camera_monitoring',
      actionMetadata: {
        fromCameraId,
        toCameraId,
        toCameraName,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackPTZControl = useCallback((
    cameraId: string,
    action: string
  ) => {
    trackAction('ptz_control', 'monitoring', {
      actionTarget: cameraId,
      actionDescription: `PTZ control: ${action}`,
      featureName: 'ptz_control',
      actionMetadata: {
        cameraId,
        ptzAction: action,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackSnapshot = useCallback((
    cameraId: string,
    cameraName: string
  ) => {
    trackAction('snapshot', 'monitoring', {
      actionTarget: cameraId,
      actionDescription: `Captured snapshot from: ${cameraName}`,
      featureName: 'snapshot',
      actionMetadata: {
        cameraId,
        cameraName,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return {
    trackCameraView,
    trackCameraSwitch,
    trackPTZControl,
    trackSnapshot,
  };
}

/**
 * Hook for tracking playback operations
 */
export function usePlaybackTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackPlaybackStart = useCallback((
    cameraId: string,
    startTime: string,
    endTime: string
  ) => {
    trackAction('playback_start', 'monitoring', {
      actionTarget: cameraId,
      actionDescription: `Started playback from ${startTime} to ${endTime}`,
      featureName: 'playback',
      actionMetadata: {
        cameraId,
        startTime,
        endTime,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackPlaybackExport = useCallback((
    cameraIds: string[],
    startTime: string,
    endTime: string,
    format: string
  ) => {
    trackAction('playback_export', 'export', {
      actionTarget: cameraIds.join(','),
      actionDescription: `Exported playback as ${format}`,
      featureName: 'playback_export',
      actionMetadata: {
        cameraIds,
        cameraCount: cameraIds.length,
        startTime,
        endTime,
        format,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return {
    trackPlaybackStart,
    trackPlaybackExport,
  };
}

/**
 * Hook for tracking incident operations
 */
export function useIncidentTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackIncidentCreate = useCallback((
    incidentId: string,
    incidentType: string
  ) => {
    trackAction('incident_create', 'incident_management', {
      actionTarget: incidentId,
      actionDescription: `Created incident: ${incidentType}`,
      featureName: 'incident_creation',
      actionMetadata: {
        incidentId,
        incidentType,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackIncidentUpdate = useCallback((
    incidentId: string,
    updateType: string
  ) => {
    trackAction('incident_update', 'incident_management', {
      actionTarget: incidentId,
      actionDescription: `Updated incident: ${updateType}`,
      featureName: 'incident_management',
      actionMetadata: {
        incidentId,
        updateType,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackIncidentClose = useCallback((
    incidentId: string,
    resolution: string
  ) => {
    trackAction('incident_close', 'incident_management', {
      actionTarget: incidentId,
      actionDescription: `Closed incident with resolution: ${resolution}`,
      featureName: 'incident_management',
      actionMetadata: {
        incidentId,
        resolution,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return {
    trackIncidentCreate,
    trackIncidentUpdate,
    trackIncidentClose,
  };
}

/**
 * Hook for tracking alert operations
 */
export function useAlertTracking(moduleName: string) {
  const trackAction = useActionTracking(moduleName);

  const trackAlertView = useCallback((
    alertId: string,
    alertType: string
  ) => {
    trackAction('alert_view', 'monitoring', {
      actionTarget: alertId,
      actionDescription: `Viewed alert: ${alertType}`,
      featureName: 'alert_monitoring',
      actionMetadata: {
        alertId,
        alertType,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackAlertAcknowledge = useCallback((
    alertId: string,
    alertType: string
  ) => {
    trackAction('alert_acknowledge', 'monitoring', {
      actionTarget: alertId,
      actionDescription: `Acknowledged alert: ${alertType}`,
      featureName: 'alert_response',
      actionMetadata: {
        alertId,
        alertType,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  const trackAlertDismiss = useCallback((
    alertId: string,
    reason: string
  ) => {
    trackAction('alert_dismiss', 'monitoring', {
      actionTarget: alertId,
      actionDescription: `Dismissed alert: ${reason}`,
      featureName: 'alert_response',
      actionMetadata: {
        alertId,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }, [trackAction]);

  return {
    trackAlertView,
    trackAlertAcknowledge,
    trackAlertDismiss,
  };
}
