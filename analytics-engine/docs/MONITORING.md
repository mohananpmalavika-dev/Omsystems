# Analytics Engine Monitoring and Observability Guide

## Overview

The Analytics Engine includes a comprehensive monitoring and observability system built on industry-standard tools:

- **Prometheus Metrics**: 40+ metrics tracking detections, performance, system health, and API requests
- **Structured Logging**: JSON-formatted logs with 5 severity levels and automatic rotation
- **Request Tracking**: Unique request IDs for distributed tracing
- **Performance Profiling**: Automatic identification of slow endpoints
- **System Metrics**: Real-time CPU, memory, and resource usage monitoring
- **Health Checks**: Kubernetes-compatible health, readiness, and liveness probes

## Table of Contents

1. [Quick Start](#quick-start)
2. [Metrics](#metrics)
3. [Logging](#logging)
4. [Health Checks](#health-checks)
5. [API Endpoints](#api-endpoints)
6. [Integration Examples](#integration-examples)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=INFO                    # DEBUG, INFO, WARN, ERROR, FATAL
LOG_TO_FILE=true                  # Enable file logging
LOG_DIR=./logs                    # Log directory path

# Metrics Configuration
METRICS_ENABLED=true              # Enable Prometheus metrics
METRICS_COLLECTION_INTERVAL=10000 # System metrics interval (ms)
```

### Starting the Service

The monitoring system starts automatically when the analytics engine initializes:

```typescript
import { buildAnalyticsEngine } from './app';

const app = buildAnalyticsEngine({
  sourceSharedKey: process.env.ANALYTICS_SOURCE_KEY,
  controlPlaneSharedKey: process.env.CONTROL_PLANE_KEY,
  controlPlaneUrl: process.env.CONTROL_PLANE_URL,
  submit: submitFunction,
  logger: true
});

await app.listen({ port: 3000, host: '0.0.0.0' });
```

---

## Metrics

### Available Metrics

#### Detection Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_detections_total` | Counter | Total detections by type | `detector`, `camera_id`, `status` |
| `analytics_detection_duration_seconds` | Histogram | Detection processing time | `detector` |
| `analytics_detection_confidence` | Histogram | Detection confidence scores | `detector`, `class` |

#### Frame Processing Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_frames_processed_total` | Counter | Total frames processed | `camera_id`, `status` |
| `analytics_frame_processing_duration_seconds` | Histogram | Frame processing time | `camera_id` |
| `analytics_frame_processing_fps` | Gauge | Current frames per second | `camera_id` |
| `analytics_frame_queue_size` | Gauge | Frames waiting to be processed | `camera_id` |

#### Model Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_model_loads_total` | Counter | Model load operations | `model`, `status` |
| `analytics_model_load_duration_seconds` | Histogram | Model load time | `model` |
| `analytics_model_inferences_total` | Counter | Model inference operations | `model`, `status` |
| `analytics_model_inference_duration_seconds` | Histogram | Model inference time | `model` |
| `analytics_model_cache_hits_total` | Counter | Model cache hits | `model` |
| `analytics_model_cache_misses_total` | Counter | Model cache misses | `model` |
| `analytics_model_memory_bytes` | Gauge | Memory used by models | `model` |
| `analytics_model_cache_size` | Gauge | Number of cached models | - |

#### Tracking Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_tracking_active_objects` | Gauge | Currently tracked objects | `camera_id`, `type` |
| `analytics_tracking_objects_created_total` | Counter | Tracked objects created | `camera_id`, `type` |
| `analytics_tracking_objects_lost_total` | Counter | Tracked objects lost | `camera_id`, `type` |
| `analytics_tracking_duration_seconds` | Histogram | Object tracking duration | `camera_id`, `type` |

#### Alert Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_alerts_generated_total` | Counter | Alerts generated | `alert_type`, `severity`, `camera_id` |
| `analytics_alert_notifications_sent_total` | Counter | Notifications sent | `channel`, `status` |
| `analytics_alert_notification_duration_seconds` | Histogram | Notification send time | `channel` |

#### System Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_system_cpu_usage_percent` | Gauge | CPU usage percentage | - |
| `analytics_system_memory_usage_bytes` | Gauge | Memory usage | - |
| `analytics_system_memory_total_bytes` | Gauge | Total system memory | - |
| `analytics_system_gpu_usage_percent` | Gauge | GPU usage percentage | `gpu_id` |
| `analytics_system_gpu_memory_bytes` | Gauge | GPU memory usage | `gpu_id` |
| `analytics_system_disk_usage_bytes` | Gauge | Disk usage | `mount_point` |

#### Health Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_detector_health_status` | Gauge | Detector health (1=healthy, 0=unhealthy) | `detector` |
| `analytics_camera_health_status` | Gauge | Camera health | `camera_id` |
| `analytics_stream_health_status` | Gauge | Stream health | `camera_id`, `stream_type` |
| `analytics_service_uptime_seconds` | Gauge | Service uptime | - |

#### HTTP Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `analytics_http_requests_total` | Counter | Total HTTP requests | `method`, `route`, `status` |
| `analytics_http_request_duration_seconds` | Histogram | Request duration | `method`, `route`, `status` |
| `analytics_http_request_size_bytes` | Histogram | Request size | `method`, `route` |
| `analytics_http_response_size_bytes` | Histogram | Response size | `method`, `route` |
| `analytics_active_connections` | Gauge | Active connections | - |

### Recording Metrics in Code

```typescript
import { 
  recordDetection, 
  recordFrameProcessing, 
  recordModelInference,
  updateFPS,
  recordAlert
} from './monitoring/metrics';

// Record a detection
recordDetection(
  'person-detector',    // detector name
  'camera-01',          // camera ID
  'success',            // status
  0.045,                // duration in seconds
  0.92,                 // confidence (optional)
  'person'              // class name (optional)
);

// Record frame processing
recordFrameProcessing('camera-01', 'success', 0.120);

// Update FPS
updateFPS('camera-01', 25.5);

// Record model inference
recordModelInference('yolov8n', 'success', 0.023);

// Record alert
recordAlert('intrusion', 'high', 'camera-01');
```

---

## Logging

### Log Levels

| Level | Numeric | Use Case |
|-------|---------|----------|
| `DEBUG` | 0 | Detailed diagnostic information |
| `INFO` | 1 | General informational messages |
| `WARN` | 2 | Warning messages (non-critical issues) |
| `ERROR` | 3 | Error messages (operation failed) |
| `FATAL` | 4 | Fatal errors (system shutdown required) |

### Log Format

Logs are output in structured JSON format:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "Detection completed",
  "component": "detector",
  "context": {
    "cameraId": "camera-01",
    "detector": "person-detector",
    "requestId": "req-123"
  },
  "metadata": {
    "duration": 45,
    "objectsDetected": 3
  }
}
```

### Logging in Code

```typescript
import { logger, LogLevel } from './monitoring/logger';

// Set log level
logger.setLogLevel(LogLevel.DEBUG);

// Basic logging
logger.info('Processing frame', { cameraId: 'camera-01' });
logger.warn('Low confidence detection', { confidence: 0.45 });
logger.error('Model load failed', error, { model: 'yolov8n' });

// Logging with metadata
logger.info(
  'Detection completed',
  { cameraId: 'camera-01', detector: 'person' },
  { duration: 45, count: 3 },
  'detector'  // component name
);

// Child logger with inherited context
const cameraLogger = logger.child({ cameraId: 'camera-01' });
cameraLogger.info('Frame received');  // Automatically includes cameraId

// Performance timing
const end = logger.time('model-inference', { model: 'yolov8n' });
// ... perform inference ...
end();  // Logs duration automatically

// Async timing
const result = await logger.timeAsync(
  'load-model',
  () => loadModel('yolov8n'),
  { model: 'yolov8n' }
);
```

### File Logging

```typescript
import { enableFileLogging, disableFileLogging } from './monitoring/logger';

// Enable file logging
enableFileLogging('./logs');

// Logs will be written to: ./logs/analytics-YYYY-MM-DDTHH-MM-SS.log
// Automatic rotation at 100MB per file
// Maximum 10 log files kept

// Disable file logging
disableFileLogging();
```

---

## Health Checks

### Kubernetes Probes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: analytics-engine
spec:
  containers:
  - name: analytics
    image: analytics-engine:latest
    ports:
    - containerPort: 3000
    livenessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 3
```

### Health Check Responses

#### Health Endpoint (`/health`)

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:45.123Z",
  "service": "analytics-engine",
  "version": "1.0.0",
  "memory": {
    "heapUsed": "512MB",
    "heapTotal": "1024MB",
    "rss": "1536MB"
  },
  "system": {
    "cpus": 8,
    "totalMemory": "16GB",
    "freeMemory": "8GB",
    "platform": "linux",
    "arch": "x64",
    "nodeVersion": "v20.10.0"
  }
}
```

---

## API Endpoints

### Metrics Endpoints

#### `GET /metrics`

Returns Prometheus-formatted metrics for scraping.

**Response**: `text/plain`

```
# HELP analytics_detections_total Total number of detections by detector type
# TYPE analytics_detections_total counter
analytics_detections_total{detector="person-detector",camera_id="camera-01",status="success"} 1234

# HELP analytics_detection_duration_seconds Time taken to process detection
# TYPE analytics_detection_duration_seconds histogram
analytics_detection_duration_seconds_bucket{detector="person-detector",le="0.01"} 450
analytics_detection_duration_seconds_bucket{detector="person-detector",le="0.05"} 890
...
```

#### `GET /metrics/json`

Returns metrics in JSON format.

**Response**: `application/json`

```json
[
  {
    "name": "analytics_detections_total",
    "type": "counter",
    "help": "Total number of detections by detector type",
    "values": [
      {
        "labels": {
          "detector": "person-detector",
          "camera_id": "camera-01",
          "status": "success"
        },
        "value": 1234
      }
    ]
  }
]
```

### Health Check Endpoints

#### `GET /health`

Comprehensive health check with system information.

#### `GET /health/ready`

Readiness check (service ready to accept traffic).

#### `GET /health/live`

Liveness check (service is alive).

---

## Integration Examples

### Prometheus Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'analytics-engine'
    scrape_interval: 15s
    static_configs:
      - targets: ['analytics-engine:3000']
    metrics_path: /metrics
```

### Grafana Dashboard

Create a dashboard with these queries:

```promql
# Detection Rate
rate(analytics_detections_total[5m])

# Average Detection Duration
rate(analytics_detection_duration_seconds_sum[5m]) / 
rate(analytics_detection_duration_seconds_count[5m])

# Model Cache Hit Rate
rate(analytics_model_cache_hits_total[5m]) / 
(rate(analytics_model_cache_hits_total[5m]) + 
 rate(analytics_model_cache_misses_total[5m]))

# CPU Usage
analytics_system_cpu_usage_percent

# Active Tracks
sum(analytics_tracking_active_objects) by (camera_id)

# Request Rate by Status Code
rate(analytics_http_requests_total[5m]) by (status)

# 95th Percentile Response Time
histogram_quantile(0.95, 
  rate(analytics_http_request_duration_seconds_bucket[5m])
)
```

### ELK Stack Integration

Forward logs to Elasticsearch:

```bash
# Using Filebeat
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/analytics/*.log
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "analytics-logs-%{+yyyy.MM.dd}"
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  analytics-engine:
    image: analytics-engine:latest
    environment:
      - LOG_LEVEL=INFO
      - LOG_TO_FILE=true
      - LOG_DIR=/var/log/analytics
    volumes:
      - ./logs:/var/log/analytics
    ports:
      - "3000:3000"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

---

## Best Practices

### 1. Log Level Configuration

- **Development**: Use `DEBUG` level for detailed diagnostics
- **Staging**: Use `INFO` level for operational visibility
- **Production**: Use `WARN` level to reduce noise

### 2. Metric Cardinality

Be cautious with high-cardinality labels (e.g., request IDs, timestamps). Use these labels sparingly:

```typescript
// ❌ Bad - High cardinality
recordDetection(detector, requestId, 'success', duration);

// ✅ Good - Low cardinality
recordDetection(detector, cameraId, 'success', duration);
```

### 3. Context Propagation

Use child loggers to propagate context:

```typescript
// Create logger for camera processing
const cameraLogger = logger.child({ cameraId: 'camera-01' });

// All logs automatically include cameraId
cameraLogger.info('Processing started');
cameraLogger.debug('Frame received', { frameId: 123 });
cameraLogger.error('Processing failed', error);
```

### 4. Performance Monitoring

Monitor slow endpoints regularly:

```typescript
import { performanceProfiler } from './monitoring/middleware';

// Get slow endpoints (avg > 1 second)
const slowEndpoints = performanceProfiler.getSlowEndpoints(1000);
console.log('Slow endpoints:', slowEndpoints);
```

### 5. Alert Thresholds

Set up alerts for critical metrics:

```yaml
# Prometheus alerting rules
groups:
  - name: analytics_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(analytics_detections_total{status="failure"}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High detection error rate"
          
      - alert: SlowFrameProcessing
        expr: analytics_frame_processing_fps < 10
        for: 2m
        annotations:
          summary: "Frame processing too slow"
          
      - alert: HighMemoryUsage
        expr: analytics_system_memory_usage_bytes / analytics_system_memory_total_bytes > 0.9
        for: 5m
        annotations:
          summary: "Memory usage above 90%"
```

### 6. Log Sampling

For high-frequency events, use sampling:

```typescript
let frameCount = 0;

function processFrame(frame: Frame) {
  frameCount++;
  
  // Log every 100th frame only
  if (frameCount % 100 === 0) {
    logger.debug('Frame processed', { frameCount });
  }
}
```

---

## Troubleshooting

### Issue: Metrics not appearing

**Solution**:
1. Check Prometheus scrape configuration
2. Verify `/metrics` endpoint is accessible
3. Check for firewall/network issues
4. Ensure metrics are being recorded in code

```bash
# Test metrics endpoint
curl http://localhost:3000/metrics

# Check Prometheus targets
# Visit: http://localhost:9090/targets
```

### Issue: Logs not being written

**Solution**:
1. Verify `LOG_TO_FILE=true` environment variable
2. Check log directory permissions
3. Ensure sufficient disk space
4. Verify log level configuration

```typescript
import { logger, LogLevel } from './monitoring/logger';

// Enable debug logging temporarily
logger.setLogLevel(LogLevel.DEBUG);

// Test logging
logger.info('Test log message');
```

### Issue: High memory usage

**Solution**:
1. Check model cache size
2. Review log rotation settings
3. Monitor metric cardinality
4. Check for memory leaks

```typescript
// Get current memory usage
const usage = process.memoryUsage();
console.log({
  heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
  heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
});
```

### Issue: Slow API responses

**Solution**:
1. Check performance profiler for slow endpoints
2. Review model inference times
3. Check system resource usage
4. Analyze histogram metrics

```typescript
import { performanceProfiler } from './monitoring/middleware';

// Identify slow endpoints
const slow = performanceProfiler.getSlowEndpoints(500); // > 500ms
console.log('Slow endpoints:', slow);
```

### Issue: Missing request IDs in logs

**Solution**:
Ensure monitoring hooks are registered before routes:

```typescript
import { registerMonitoringHooks } from './monitoring/middleware';

const app = Fastify({ logger: true });

// Register monitoring FIRST
registerMonitoringHooks(app);

// Then register routes
app.register(yourRoutes);
```

---

## Advanced Configuration

### Custom Metrics

Add your own metrics:

```typescript
import { Counter, Gauge, Histogram, metricsRegistry } from './monitoring/metrics';

// Create custom counter
const customCounter = new Counter({
  name: 'analytics_custom_events_total',
  help: 'Total custom events',
  labelNames: ['event_type'],
  registers: [metricsRegistry]
});

// Use it
customCounter.inc({ event_type: 'my_event' });
```

### Custom Log Formatting

Extend the logger for custom formats:

```typescript
import { Logger, LogContext } from './monitoring/logger';

class CustomLogger extends Logger {
  // Override consoleLog for custom formatting
  protected consoleLog(level: LogLevel, entry: LogEntry): void {
    // Your custom formatting logic
    console.log(`[${entry.level}] ${entry.message}`);
  }
}
```

### Performance Profiling

Track custom operations:

```typescript
import { performanceProfiler } from './monitoring/middleware';

const start = Date.now();
await performExpensiveOperation();
const duration = Date.now() - start;

performanceProfiler.record('/custom/operation', duration);
```

---

## Maintenance

### Log Rotation

Logs automatically rotate when:
- File size exceeds 100MB
- Maximum 10 log files are kept
- Old files are deleted automatically

### Metric Cleanup

Reset metrics for testing:

```typescript
import { resetMetrics } from './monitoring/metrics';

// Reset all metrics (testing only!)
resetMetrics();
```

### System Metrics Collection

Control the collection interval:

```typescript
import { systemMetricsCollector } from './monitoring/middleware';

// Stop collection
systemMetricsCollector.stop();

// Start with custom interval (30 seconds)
const collector = new SystemMetricsCollector(30000);
collector.start();
```

---

## Summary

The Analytics Engine monitoring system provides:

✅ **40+ Prometheus metrics** for comprehensive observability  
✅ **Structured JSON logging** with automatic rotation  
✅ **Request tracking** with unique IDs  
✅ **Performance profiling** for slow endpoint detection  
✅ **System metrics** for resource monitoring  
✅ **Health checks** for Kubernetes integration  
✅ **Zero configuration** - works out of the box  

For more information, see:
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/)
- [Kubernetes Health Checks](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
