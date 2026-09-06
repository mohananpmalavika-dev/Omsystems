/**
 * Client-side performance monitoring for Core Web Vitals and page-level metrics.
 * Collects LCP, FID, CLS, TTFB and sends to observability backend.
 */

export interface WebVitalMetric {
  name: string;
  value: number;
  unit: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  id?: string;
  navigationType?: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache';
  attribution?: Record<string, any>;
}

export interface PagePerformanceMetrics {
  url: string;
  timestamp: string;
  metrics: {
    lcp?: number;
    fid?: number;
    cls?: number;
    ttfb?: number;
    fcp?: number;
    inp?: number;
  };
  navigation?: {
    dnsDuration: number;
    tcpDuration: number;
    tlsDuration: number;
    requestDuration: number;
    responseDuration: number;
    domInteractiveDuration: number;
    domContentLoadedDuration: number;
    loadDuration: number;
  };
  memory?: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  };
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
}

class PerformanceMonitor {
  private metrics: Map<string, WebVitalMetric> = new Map();
  private pageMetrics: PagePerformanceMetrics | null = null;
  private beaconUrl = '/api/observability/web-vitals';
  private reportThresholdMs = 5000; // Report after 5 seconds of inactivity
  private reportTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Only run in browser
    if (typeof window === 'undefined') return;

    // Collect navigation timing
    this.collectNavigationTiming();

    // Collect Core Web Vitals using PerformanceObserver
    this.collectCoreWebVitals();

    // Collect memory metrics if available
    this.collectMemoryMetrics();

    // Collect connection info
    this.collectConnectionInfo();

    // Set up automatic reporting
    this.scheduleReport();

    // Report on page unload
    window.addEventListener('beforeunload', () => this.flush());
  }

  private collectNavigationTiming() {
    if (typeof window === 'undefined' || !window.performance) return;

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!nav) return;

    if (!this.pageMetrics) {
      this.pageMetrics = {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        metrics: {},
        navigation: {
          dnsDuration: nav.domainLookupEnd - nav.domainLookupStart,
          tcpDuration: nav.connectEnd - nav.connectStart,
          tlsDuration: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
          requestDuration: nav.responseStart - nav.requestStart,
          responseDuration: nav.responseEnd - nav.responseStart,
          domInteractiveDuration: nav.domInteractive - nav.responseEnd,
          domContentLoadedDuration: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadDuration: nav.loadEventEnd - nav.loadEventStart,
        },
      };
    }

    // Calculate derived metrics
    if (nav.firstPaint) {
      this.pageMetrics.metrics.ttfb = nav.responseStart - nav.fetchStart;
      this.pageMetrics.metrics.fcp = (performance.getEntriesByName('first-contentful-paint')[0] as PerformancePaintTiming)?.startTime ?? 0;
    }
  }

  private collectCoreWebVitals() {
    if (typeof window === 'undefined') return;

    // LCP (Largest Contentful Paint)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          const lcp = (lastEntry as any).renderTime || (lastEntry as any).loadTime || lastEntry.startTime;
          
          if (this.pageMetrics) {
            this.pageMetrics.metrics.lcp = lcp;
          }
          
          this.recordMetric({
            name: 'LCP',
            value: lcp,
            unit: 'ms',
            rating: lcp < 2500 ? 'good' : lcp < 4000 ? 'needs-improvement' : 'poor',
          });
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        // LCP not supported
      }

      // FID / INP (First Input Delay / Interaction to Next Paint)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const fid = (entry as any).processingDuration;
            if (this.pageMetrics) {
              this.pageMetrics.metrics.fid = fid;
            }
            this.recordMetric({
              name: 'FID',
              value: fid,
              unit: 'ms',
              rating: fid < 100 ? 'good' : fid < 300 ? 'needs-improvement' : 'poor',
            });
          }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
      } catch (e) {
        // FID not supported, try INP
        try {
          const inpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const maxINP = Math.max(...entries.map((e) => (e as any).duration));
            if (this.pageMetrics) {
              this.pageMetrics.metrics.inp = maxINP;
            }
            this.recordMetric({
              name: 'INP',
              value: maxINP,
              unit: 'ms',
              rating: maxINP < 200 ? 'good' : maxINP < 500 ? 'needs-improvement' : 'poor',
            });
          });
          inpObserver.observe({ type: 'event', buffered: true });
        } catch (e2) {
          // INP not supported
        }
      }

      // CLS (Cumulative Layout Shift)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
          if (this.pageMetrics) {
            this.pageMetrics.metrics.cls = clsValue;
          }
          this.recordMetric({
            name: 'CLS',
            value: clsValue,
            unit: '',
            rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
          });
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        // CLS not supported
      }
    }
  }

  private collectMemoryMetrics() {
    if (typeof window === 'undefined' || !(performance as any).memory) return;

    const memory = (performance as any).memory;
    if (!this.pageMetrics) {
      this.pageMetrics = {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        metrics: {},
      };
    }

    this.pageMetrics.memory = {
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
    };
  }

  private collectConnectionInfo() {
    if (typeof window === 'undefined') return;

    const connection = (navigator as any).connection;
    if (!connection) return;

    if (!this.pageMetrics) {
      this.pageMetrics = {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        metrics: {},
      };
    }

    this.pageMetrics.connection = {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    };
  }

  private recordMetric(metric: WebVitalMetric) {
    this.metrics.set(metric.name, metric);
    
    // Schedule report on new metric
    if (this.reportTimeout) {
      clearTimeout(this.reportTimeout);
    }
    this.scheduleReport();
  }

  private scheduleReport() {
    if (typeof window === 'undefined') return;

    this.reportTimeout = setTimeout(() => {
      this.report();
    }, this.reportThresholdMs);
  }

  async report() {
    if (!this.pageMetrics && this.metrics.size === 0) return;

    try {
      const payload = {
        pageMetrics: this.pageMetrics,
        webVitals: Array.from(this.metrics.values()),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: new Date().toISOString(),
      };

      // Send via beacon or fetch
      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.beaconUrl, JSON.stringify(payload));
      } else {
        await fetch(this.beaconUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      }
    } catch (e) {
      console.debug('Performance metrics reporting failed:', e);
    }
  }

  flush() {
    if (this.reportTimeout) {
      clearTimeout(this.reportTimeout);
    }
    return this.report();
  }

  getMetrics() {
    return {
      pageMetrics: this.pageMetrics,
      webVitals: Array.from(this.metrics.values()),
    };
  }
}

// Singleton instance
let instance: PerformanceMonitor | null = null;

export function initializePerformanceMonitoring() {
  if (typeof window === 'undefined') return null;
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

export function getPerformanceMetrics() {
  if (!instance) return null;
  return instance.getMetrics();
}
