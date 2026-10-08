/**
 * Prometheus Metrics Registry for Analytics Engine
 * Tracks detections, performance, system health, and API metrics
 */

import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create separate registry for analytics metrics
export const metricsRegistry = register;

// Enable default system metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ 
  register: metricsRegistry,
  prefix: 'analytics_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// =============================================================================
// DETECTION METRICS
// =============================================================================

export const detectionCounter = new Counter({
  name: 'analytics_detections_total',
  help: 'Total number of detections by detector type',
  labelNames: ['detector', 'camera_id', 'status'] as const,
  registers: [metricsRegistry]
});

export const detectionDuration = new Histogram({
  name: 'analytics_detection_duration_seconds',
  help: 'Time taken to process detection',
  labelNames: ['detector'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry]
});

export const detectionConfidence = new Histogram({
  name: 'analytics_detection_confidence',
  help: 'Confidence scores of detections',
  labelNames: ['detector', 'class'] as const,
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0],
  registers: [metricsRegistry]
});

// =============================================================================
// FRAME PROCESSING METRICS
// =============================================================================

export const frameProcessingCounter = new Counter({
  name: 'analytics_frames_processed_total',
  help: 'Total number of frames processed',
  labelNames: ['camera_id', 'status'] as const,
  registers: [metricsRegistry]
});

export const frameProcessingDuration = new Histogram({
  name: 'analytics_frame_processing_duration_seconds',
  help: 'Time taken to process a single frame',
  labelNames: ['camera_id'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

export const frameProcessingFPS = new Gauge({
  name: 'analytics_frame_processing_fps',
  help: 'Current frames per second',
  labelNames: ['camera_id'] as const,
  registers: [metricsRegistry]
});

export const frameQueueSize = new Gauge({
  name: 'analytics_frame_queue_size',
  help: 'Number of frames waiting to be processed',
  labelNames: ['camera_id'] as const,
  registers: [metricsRegistry]
});

// =============================================================================
// MODEL METRICS
// =============================================================================

export const modelLoadCounter = new Counter({
  name: 'analytics_model_loads_total',
  help: 'Total number of model load operations',
  labelNames: ['model', 'status'] as const,
  registers: [metricsRegistry]
});

export const modelLoadDuration = new Histogram({
  name: 'analytics_model_load_duration_seconds',
  help: 'Time taken to load a model',
  labelNames: ['model'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry]
});

export const modelInferenceCounter = new Counter({
  name: 'analytics_model_inferences_total',
  help: 'Total number of model inferences',
  labelNames: ['model', 'status'] as const,
  registers: [metricsRegistry]
});

export const modelInferenceDuration = new Histogram({
  name: 'analytics_model_inference_duration_seconds',
  help: 'Time taken for model inference',
  labelNames: ['model'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [metricsRegistry]
});

export const modelCacheHits = new Counter({
  name: 'analytics_model_cache_hits_total',
  help: 'Number of model cache hits',
  labelNames: ['model'] as const,
  registers: [metricsRegistry]
});

export const modelCacheMisses = new Counter({
  name: 'analytics_model_cache_misses_total',
  help: 'Number of model cache misses',
  labelNames: ['model'] as const,
  registers: [metricsRegistry]
});

export const modelMemoryUsage = new Gauge({
  name: 'analytics_model_memory_bytes',
  help: 'Memory used by loaded models',
  labelNames: ['model'] as const,
  registers: [metricsRegistry]
});

export const modelCacheSize = new Gauge({
  name: 'analytics_model_cache_size',
  help: 'Number of models currently cached',
  registers: [metricsRegistry]
});

// =============================================================================
// TRACKING METRICS
// =============================================================================

export const trackingActiveObjects = new Gauge({
  name: 'analytics_tracking_active_objects',
  help: 'Number of currently tracked objects',
  labelNames: ['camera_id', 'type'] as const,
  registers: [metricsRegistry]
});

export const trackingObjectsCreated = new Counter({
  name: 'analytics_tracking_objects_created_total',
  help: 'Total number of tracked objects created',
  labelNames: ['camera_id', 'type'] as const,
  registers: [metricsRegistry]
});

export const trackingObjectsLost = new Counter({
  name: 'analytics_tracking_objects_lost_total',
  help: 'Total number of tracked objects lost',
  labelNames: ['camera_id', 'type'] as const,
  registers: [metricsRegistry]
});

export const trackingDuration = new Histogram({
  name: 'analytics_tracking_duration_seconds',
  help: 'Duration objects were tracked',
  labelNames: ['camera_id', 'type'] as const,
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
  registers: [metricsRegistry]
});

// =============================================================================
// ALERT METRICS
// =============================================================================

export const alertsGenerated = new Counter({
  name: 'analytics_alerts_generated_total',
  help: 'Total number of alerts generated',
  labelNames: ['alert_type', 'severity', 'camera_id'] as const,
  registers: [metricsRegistry]
});

export const alertsNotificationsSent = new Counter({
  name: 'analytics_alert_notifications_sent_total',
  help: 'Total number of alert notifications sent',
  labelNames: ['channel', 'status'] as const,
  registers: [metricsRegistry]
});

export const alertNotificationDuration = new Histogram({
  name: 'analytics_alert_notification_duration_seconds',
  help: 'Time taken to send alert notification',
  labelNames: ['channel'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

// =============================================================================
// SYSTEM METRICS
// =============================================================================

export const systemCPUUsage = new Gauge({
  name: 'analytics_system_cpu_usage_percent',
  help: 'Current CPU usage percentage',
  registers: [metricsRegistry]
});

export const systemMemoryUsage = new Gauge({
  name: 'analytics_system_memory_usage_bytes',
  help: 'Current memory usage in bytes',
  registers: [metricsRegistry]
});

export const systemMemoryTotal = new Gauge({
  name: 'analytics_system_memory_total_bytes',
  help: 'Total system memory in bytes',
  registers: [metricsRegistry]
});

export const systemGPUUsage = new Gauge({
  name: 'analytics_system_gpu_usage_percent',
  help: 'Current GPU usage percentage',
  labelNames: ['gpu_id'] as const,
  registers: [metricsRegistry]
});

export const systemGPUMemory = new Gauge({
  name: 'analytics_system_gpu_memory_bytes',
  help: 'Current GPU memory usage in bytes',
  labelNames: ['gpu_id'] as const,
  registers: [metricsRegistry]
});

export const systemDiskUsage = new Gauge({
  name: 'analytics_system_disk_usage_bytes',
  help: 'Current disk usage in bytes',
  labelNames: ['mount_point'] as const,
  registers: [metricsRegistry]
});

// =============================================================================
// HEALTH METRICS
// =============================================================================

export const detectorHealthStatus = new Gauge({
  name: 'analytics_detector_health_status',
  help: 'Health status of detectors (1=healthy, 0=unhealthy)',
  labelNames: ['detector'] as const,
  registers: [metricsRegistry]
});

export const cameraHealthStatus = new Gauge({
  name: 'analytics_camera_health_status',
  help: 'Health status of cameras (1=healthy, 0=unhealthy)',
  labelNames: ['camera_id'] as const,
  registers: [metricsRegistry]
});

export const streamHealthStatus = new Gauge({
  name: 'analytics_stream_health_status',
  help: 'Health status of video streams (1=healthy, 0=unhealthy)',
  labelNames: ['camera_id', 'stream_type'] as const,
  registers: [metricsRegistry]
});

export const serviceUptime = new Gauge({
  name: 'analytics_service_uptime_seconds',
  help: 'Service uptime in seconds',
  registers: [metricsRegistry]
});

// =============================================================================
// API METRICS
// =============================================================================

export const httpRequestsTotal = new Counter({
  name: 'analytics_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry]
});

export const httpRequestDuration = new Histogram({
  name: 'analytics_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry]
});

export const httpRequestSize = new Histogram({
  name: 'analytics_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
  registers: [metricsRegistry]
});

export const httpResponseSize = new Histogram({
  name: 'analytics_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
  registers: [metricsRegistry]
});

export const activeConnections = new Gauge({
  name: 'analytics_active_connections',
  help: 'Number of active connections',
  registers: [metricsRegistry]
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Record a detection event
 */
export function recordDetection(detector: string, cameraId: string, status: 'success' | 'failure', duration: number, confidence?: number, className?: string): void {
  detectionCounter.inc({ detector, camera_id: cameraId, status });
  detectionDuration.observe({ detector }, duration);
  
  if (confidence !== undefined && className) {
    detectionConfidence.observe({ detector, class: className }, confidence);
  }
}

/**
 * Record frame processing
 */
export function recordFrameProcessing(cameraId: string, status: 'success' | 'failure', duration: number): void {
  frameProcessingCounter.inc({ camera_id: cameraId, status });
  frameProcessingDuration.observe({ camera_id: cameraId }, duration);
}

/**
 * Update FPS metric
 */
export function updateFPS(cameraId: string, fps: number): void {
  frameProcessingFPS.set({ camera_id: cameraId }, fps);
}

/**
 * Record model load
 */
export function recordModelLoad(model: string, status: 'success' | 'failure', duration: number): void {
  modelLoadCounter.inc({ model, status });
  modelLoadDuration.observe({ model }, duration);
}

/**
 * Record model inference
 */
export function recordModelInference(model: string, status: 'success' | 'failure', duration: number): void {
  modelInferenceCounter.inc({ model, status });
  modelInferenceDuration.observe({ model }, duration);
}

/**
 * Record cache hit/miss
 */
export function recordCacheAccess(model: string, hit: boolean): void {
  if (hit) {
    modelCacheHits.inc({ model });
  } else {
    modelCacheMisses.inc({ model });
  }
}

/**
 * Record tracking event
 */
export function recordTracking(cameraId: string, type: string, event: 'created' | 'lost', duration?: number): void {
  if (event === 'created') {
    trackingObjectsCreated.inc({ camera_id: cameraId, type });
  } else if (event === 'lost' && duration !== undefined) {
    trackingObjectsLost.inc({ camera_id: cameraId, type });
    trackingDuration.observe({ camera_id: cameraId, type }, duration);
  }
}

/**
 * Update active tracking count
 */
export function updateActiveTracking(cameraId: string, type: string, count: number): void {
  trackingActiveObjects.set({ camera_id: cameraId, type }, count);
}

/**
 * Record alert generation
 */
export function recordAlert(alertType: string, severity: string, cameraId: string): void {
  alertsGenerated.inc({ alert_type: alertType, severity, camera_id: cameraId });
}

/**
 * Record alert notification
 */
export function recordAlertNotification(channel: string, status: 'success' | 'failure', duration: number): void {
  alertsNotificationsSent.inc({ channel, status });
  alertNotificationDuration.observe({ channel }, duration);
}

/**
 * Update system metrics
 */
export function updateSystemMetrics(metrics: {
  cpuUsage?: number;
  memoryUsage?: number;
  memoryTotal?: number;
  gpuUsage?: Array<{ id: string; usage: number; memory: number }>;
  diskUsage?: Array<{ mountPoint: string; usage: number }>;
}): void {
  if (metrics.cpuUsage !== undefined) {
    systemCPUUsage.set(metrics.cpuUsage);
  }
  if (metrics.memoryUsage !== undefined) {
    systemMemoryUsage.set(metrics.memoryUsage);
  }
  if (metrics.memoryTotal !== undefined) {
    systemMemoryTotal.set(metrics.memoryTotal);
  }
  if (metrics.gpuUsage) {
    metrics.gpuUsage.forEach(gpu => {
      systemGPUUsage.set({ gpu_id: gpu.id }, gpu.usage);
      systemGPUMemory.set({ gpu_id: gpu.id }, gpu.memory);
    });
  }
  if (metrics.diskUsage) {
    metrics.diskUsage.forEach(disk => {
      systemDiskUsage.set({ mount_point: disk.mountPoint }, disk.usage);
    });
  }
}

/**
 * Update health status
 */
export function updateHealthStatus(type: 'detector' | 'camera' | 'stream', id: string, healthy: boolean, streamType?: string): void {
  const status = healthy ? 1 : 0;
  
  if (type === 'detector') {
    detectorHealthStatus.set({ detector: id }, status);
  } else if (type === 'camera') {
    cameraHealthStatus.set({ camera_id: id }, status);
  } else if (type === 'stream' && streamType) {
    streamHealthStatus.set({ camera_id: id, stream_type: streamType }, status);
  }
}

/**
 * Record HTTP request
 */
export function recordHTTPRequest(method: string, route: string, status: number, duration: number, requestSize?: number, responseSize?: number): void {
  const statusLabel = status.toString();
  
  httpRequestsTotal.inc({ method, route, status: statusLabel });
  httpRequestDuration.observe({ method, route, status: statusLabel }, duration);
  
  if (requestSize !== undefined) {
    httpRequestSize.observe({ method, route }, requestSize);
  }
  if (responseSize !== undefined) {
    httpResponseSize.observe({ method, route }, responseSize);
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetricsText(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Get metrics in JSON format
 */
export async function getMetricsJSON(): Promise<any> {
  const metrics = await metricsRegistry.getMetricsAsJSON();
  return metrics;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  metricsRegistry.resetMetrics();
}
