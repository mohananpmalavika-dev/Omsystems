/**
 * Analytics and monitoring instrumentation for Zero-Touch Provisioning
 * Tracks user interactions, performance metrics, and errors
 */

export interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "count";
  metadata?: Record<string, any>;
}

export interface ErrorEvent {
  error: Error | string;
  context: string;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, any>;
}

class AnalyticsService {
  private sessionId: string;
  private pageLoadTime: number;
  private eventQueue: AnalyticsEvent[] = [];
  private performanceQueue: PerformanceMetric[] = [];
  private errorQueue: ErrorEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.pageLoadTime = Date.now();
    this.startFlushInterval();
    this.trackPageLoad();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startFlushInterval() {
    // Flush queues every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 10000);
  }

  private async flush() {
    if (this.eventQueue.length === 0 && this.performanceQueue.length === 0 && this.errorQueue.length === 0) {
      return;
    }

    const payload = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      events: [...this.eventQueue],
      performance: [...this.performanceQueue],
      errors: [...this.errorQueue],
    };

    // Clear queues
    this.eventQueue = [];
    this.performanceQueue = [];
    this.errorQueue = [];

    try {
      // Send to analytics endpoint (could be your own backend, Google Analytics, etc.)
      if (typeof window !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        navigator.sendBeacon("/api/v1/analytics", blob);
      } else {
        // Fallback for environments without sendBeacon
        await fetch("/api/v1/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {
          // Silent fail for analytics
        });
      }
    } catch (err) {
      // Silent fail - don't let analytics break the app
      console.warn("Analytics flush failed:", err);
    }
  }

  /**
   * Track user interaction events
   */
  trackEvent(event: AnalyticsEvent) {
    this.eventQueue.push({
      ...event,
      metadata: {
        ...event.metadata,
        timestamp: Date.now(),
        sessionId: this.sessionId,
      },
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metric: PerformanceMetric) {
    this.performanceQueue.push({
      ...metric,
      metadata: {
        ...metric.metadata,
        timestamp: Date.now(),
        sessionId: this.sessionId,
      },
    });
  }

  /**
   * Track errors
   */
  trackError(errorEvent: ErrorEvent) {
    const errorMessage = errorEvent.error instanceof Error ? errorEvent.error.message : String(errorEvent.error);
    const errorStack = errorEvent.error instanceof Error ? errorEvent.error.stack : undefined;

    this.errorQueue.push({
      error: errorMessage,
      context: errorEvent.context,
      severity: errorEvent.severity,
      metadata: {
        ...errorEvent.metadata,
        stack: errorStack,
        timestamp: Date.now(),
        sessionId: this.sessionId,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      },
    });
  }

  /**
   * Track page load performance
   */
  private trackPageLoad() {
    if (typeof window === "undefined" || !window.performance) return;

    // Use Navigation Timing API
    window.addEventListener("load", () => {
      setTimeout(() => {
        const perfData = window.performance.timing;
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
        const domReadyTime = perfData.domContentLoadedEventEnd - perfData.navigationStart;
        const firstPaintTime = perfData.responseStart - perfData.navigationStart;

        this.trackPerformance({
          name: "page_load_time",
          value: pageLoadTime,
          unit: "ms",
          metadata: { page: "zero-touch-provisioning" },
        });

        this.trackPerformance({
          name: "dom_ready_time",
          value: domReadyTime,
          unit: "ms",
          metadata: { page: "zero-touch-provisioning" },
        });

        this.trackPerformance({
          name: "first_paint_time",
          value: firstPaintTime,
          unit: "ms",
          metadata: { page: "zero-touch-provisioning" },
        });
      }, 0);
    });
  }

  /**
   * Track API call performance
   */
  trackApiCall(endpoint: string, method: string, duration: number, success: boolean, statusCode?: number) {
    this.trackPerformance({
      name: "api_call_duration",
      value: duration,
      unit: "ms",
      metadata: {
        endpoint,
        method,
        success,
        statusCode,
      },
    });

    this.trackEvent({
      category: "api",
      action: success ? "success" : "error",
      label: `${method} ${endpoint}`,
      value: duration,
      metadata: { statusCode },
    });
  }

  /**
   * Track user flow completion
   */
  trackFlowComplete(flowName: string, duration: number, stepsCompleted: number) {
    this.trackEvent({
      category: "flow",
      action: "complete",
      label: flowName,
      value: duration,
      metadata: { stepsCompleted },
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName: string, metadata?: Record<string, any>) {
    this.trackEvent({
      category: "feature",
      action: "use",
      label: featureName,
      metadata,
    });
  }

  /**
   * Track search queries
   */
  trackSearch(query: string, resultsCount: number) {
    this.trackEvent({
      category: "search",
      action: "query",
      label: query.substring(0, 50), // Limit length for privacy
      value: resultsCount,
    });
  }

  /**
   * Clean up on unmount
   */
  cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush();
  }
}

// Singleton instance
let analyticsInstance: AnalyticsService | null = null;

export function getAnalytics(): AnalyticsService {
  if (!analyticsInstance) {
    analyticsInstance = new AnalyticsService();
  }
  return analyticsInstance;
}

export function cleanupAnalytics() {
  if (analyticsInstance) {
    analyticsInstance.cleanup();
    analyticsInstance = null;
  }
}

// Convenience functions
export function trackEvent(event: AnalyticsEvent) {
  getAnalytics().trackEvent(event);
}

export function trackPerformance(metric: PerformanceMetric) {
  getAnalytics().trackPerformance(metric);
}

export function trackError(errorEvent: ErrorEvent) {
  getAnalytics().trackError(errorEvent);
}

export function trackApiCall(endpoint: string, method: string, duration: number, success: boolean, statusCode?: number) {
  getAnalytics().trackApiCall(endpoint, method, duration, success, statusCode);
}

export function trackSearch(query: string, resultsCount: number) {
  getAnalytics().trackSearch(query, resultsCount);
}
