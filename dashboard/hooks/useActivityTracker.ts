/**
 * React hooks for activity tracking
 */

import { useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getActivityTracker } from '../lib/activity-tracker';

/**
 * Hook to initialize activity tracking
 */
export function useActivityTracking(apiBaseUrl: string, accessToken: string | null) {
  const tracker = useRef(getActivityTracker({ apiBaseUrl, enableDebugLogs: process.env.NODE_ENV === 'development' }));
  const sessionStarted = useRef(false);

  useEffect(() => {
    const initTracker = async () => {
      await tracker.current.initialize();
      
      // Start session if we have an access token
      if (accessToken && !sessionStarted.current) {
        await tracker.current.startSession('current-user', accessToken);
        sessionStarted.current = true;
      }
    };

    initTracker();

    // Cleanup on unmount or when access token changes
    return () => {
      if (sessionStarted.current && accessToken) {
        tracker.current.endSession(accessToken);
        sessionStarted.current = false;
      }
    };
  }, [apiBaseUrl, accessToken]);

  return tracker.current;
}

/**
 * Hook to track page visits automatically
 */
export function usePageTracking(
  pageModule: string,
  pageCategory?: string,
  options?: {
    pageTitle?: string;
    enabled?: boolean;
  }
) {
  const pathname = usePathname();
  const previousPath = useRef<string>('');
  const tracker = useRef(getActivityTracker({ apiBaseUrl: '' }));

  useEffect(() => {
    if (options?.enabled === false) return;

    const trackPage = async () => {
      const pageTitle = options?.pageTitle || document.title;
      const referrerPath = previousPath.current || undefined;
      
      await tracker.current.trackPageVisit(
        pathname,
        pageTitle,
        pageModule,
        pageCategory,
        referrerPath
      );

      previousPath.current = pathname;
    };

    trackPage();
  }, [pathname, pageModule, pageCategory, options?.pageTitle, options?.enabled]);
}

/**
 * Hook to track user actions
 */
export function useActionTracking(moduleName: string) {
  const tracker = useRef(getActivityTracker({ apiBaseUrl: '' }));

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
    tracker.current.trackAction(actionType, actionCategory, moduleName, options);
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

  const trackFilterChange = useCallback((
    filterName: string,
    filterValue: any,
    featureName?: string
  ) => {
    trackAction('filter_change', 'data_view', {
      actionTarget: filterName,
      actionDescription: `Applied filter: ${filterName}`,
      featureName,
      actionMetadata: {
        filterName,
        filterValue,
      },
    });
  }, [trackAction]);

  return trackFilterChange;
}
