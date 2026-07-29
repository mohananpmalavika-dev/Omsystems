# Camera Health Monitoring

## Overview

Comprehensive real-time camera health monitoring system with automatic detection of hardware failures, stream quality degradation, and video anomalies.

## Features

### Implemented Metrics

#### 1. **FPS (Frames Per Second)** ✅
- **Method**: FFprobe stream analysis
- **Update Frequency**: Every health check cycle (60s for stable cameras)
- **Storage**: `camera_health_history.current_fps`
- **Detection**: Compares actual FPS against expected FPS from camera profile
- **Alerts**: Triggered when FPS drops below 80% of expected value

#### 2. **Bitrate** ✅
- **Method**: FFprobe stream analysis
- **Unit**: kbps (kilobits per second)
- **Storage**: `camera_health_history.current_bitrate`
- **Detection**: Compares actual bitrate against expected bitrate
- **Alerts**: Triggered when bitrate drops below 70% of expected value

#### 3. **Packet Loss** ✅
- **Method**: Calculated from packet timing analysis via FFprobe
- **Unit**: Percentage (0-100%)
- **Storage**: `camera_health_history.packet_loss`
- **Calculation**: `((expected_packets - actual_packets) / expected_packets) * 100`
- **Alerts**: Triggered when packet loss exceeds 5%

#### 4. **Freeze Detection** ✅
- **Method**: MD5 hash comparison of consecutive frames
- **Storage**: `camera_health_history.image_frozen`
- **Detection**: When 3+ consecutive frames have identical hash
- **Implementation**: `StreamHealthAnalyzerService.detectFrozenFrame()`
- **Alerts**: Triggered after 3 consecutive frozen frames

#### 5. **Black Screen Detection** ✅
- **Method**: Pixel brightness analysis
- **Storage**: `camera_health_history.black_screen`
- **Threshold**: Average brightness < 10 (0-255 scale)
- **Implementation**: `StreamHealthAnalyzerService.analyzePixels()`
- **Alerts**: Triggered after 3 consecutive black frames

#### 6. **Additional Metrics**
- **Resolution**: Width × height in pixels
- **Codec**: Video codec (H264, H265, etc.)
- **Latency**: Network jitter/variance (milliseconds)
- **White Screen Detection**: Average brightness > 245
- **Motion Detection**: Brightness delta threshold
- **Response Time**: Camera ping/connectivity check

## Architecture

### Services

#### CameraMonitorService
- **File**: `backend/src/services/camera-monitor.service.ts`
- **Role**: Main orchestration, adaptive polling intervals
- **Polling Strategy**:
  - Normal: 60s (stable cameras)
  - Warning: 30s (cameras with issues)
  - Critical: 15s (offline cameras)

#### StreamHealthAnalyzerService
- **File**: `backend/src/services/stream-health-analyzer.service.ts`
- **Role**: Frame-level analysis (freeze, black screen, motion)
- **Methods**:
  - `analyzeStream()`: Full stream health check
  - `extractFrame()`: FFmpeg frame extraction
  - `analyzePixels()`: Brightness and variance calculation
  - `detectFrozenFrame()`: Hash-based freeze detection

#### Quality Metrics Implementation
- **Method**: `getQualityMetrics()` in `CameraMonitorService`
- **Tool**: FFprobe with 2-second stream capture
- **Output**: JSON with stream metadata and packet timing

### Database Schema

```sql
-- camera_health_history table
CREATE TABLE camera_health_history (
  id UUID PRIMARY KEY,
  camera_id UUID NOT NULL REFERENCES cameras(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status camera_status NOT NULL,
  response_time_ms INT,
  
  -- Quality metrics
  current_fps NUMERIC(5,2),
  current_bitrate INT, -- kbps
  current_resolution JSONB, -- {width: int, height: int}
  packet_loss NUMERIC(5,2), -- percentage
  latency_ms INT,
  
  -- Stream health
  stream_active BOOLEAN DEFAULT true,
  video_loss BOOLEAN DEFAULT false,
  image_frozen BOOLEAN DEFAULT false,
  black_screen BOOLEAN DEFAULT false,
  tampering_detected BOOLEAN DEFAULT false,
  
  -- Diagnostics
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_camera_health_camera_time ON camera_health_history(camera_id, timestamp DESC);
```

## API Endpoints

### 1. Get Camera Status
```http
GET /api/v1/cameras/:cameraId/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "cameraName": "Branch 01 - Entry",
    "status": "online",
    "lastSeen": "2026-07-29T10:30:00Z",
    "currentFps": 24.8,
    "currentBitrate": 2048,
    "currentResolution": {"width": 1920, "height": 1080},
    "packetLoss": 0.5,
    "latencyMs": 45,
    "streamActive": true,
    "videoLoss": false,
    "imageFrozen": false,
    "blackScreen": false,
    "lastCheck": "2026-07-29T10:29:30Z"
  }
}
```

### 2. Get Quality Metrics
```http
GET /api/v1/cameras/:cameraId/quality-metrics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentFps": 24.8,
    "currentBitrate": 2048,
    "currentResolution": {"width": 1920, "height": 1080},
    "packetLoss": 0.5,
    "latencyMs": 45,
    "fpsQuality": 100,
    "packetLossQuality": 100,
    "latencyQuality": 100,
    "overallQuality": 100
  }
}
```

### 3. Trigger Manual Health Check
```http
POST /api/v1/cameras/:cameraId/health-check
```

## Configuration

### Environment Variables

```bash
# FFmpeg/FFprobe paths
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# Monitoring intervals (seconds)
CAMERA_MONITOR_NORMAL_INTERVAL=60
CAMERA_MONITOR_WARNING_INTERVAL=30
CAMERA_MONITOR_CRITICAL_INTERVAL=15

# Health check settings
CAMERA_MONITOR_MAX_CONCURRENT=20
CAMERA_MONITOR_BATCH_SIZE=50
CAMERA_MONITOR_MAX_CONSECUTIVE_FAILURES=3

# Stream health thresholds
STREAM_HEALTH_FROZEN_THRESHOLD=3
STREAM_HEALTH_BLACK_THRESHOLD=10
STREAM_HEALTH_WHITE_THRESHOLD=245
STREAM_HEALTH_MOTION_THRESHOLD=15
```

## Alert Generation

### Quality Alert Conditions
- **Low FPS**: Actual < 80% of expected
- **Low Bitrate**: Actual < 70% of expected
- **High Packet Loss**: > 5%
- **High Latency**: > 500ms
- **Frozen Stream**: 3+ consecutive frozen frames
- **Black Screen**: 3+ consecutive black frames

### Alert Severity
- **High**: Camera offline, video loss
- **Medium**: Quality degradation (FPS, bitrate, packet loss)
- **Low**: Warnings (approaching thresholds)

## Performance

### Optimization Strategies
1. **Adaptive Polling**: Adjust intervals based on camera health
2. **Batch Processing**: Check multiple cameras in parallel (max 20 concurrent)
3. **FFprobe Sampling**: Analyze only 2 seconds of stream
4. **Frame Downscaling**: Analyze at 320×240 for faster processing
5. **History Pruning**: Keep only last 10 frame analyses per camera

### Resource Usage
- **FFprobe per check**: ~2-5s, ~20MB RAM
- **Frame extraction**: ~1-3s, ~5MB RAM
- **Database writes**: 1 row per check per camera
- **Estimated load**: 1000 cameras = ~20-30 health checks/second

## Troubleshooting

### Common Issues

#### 1. Metrics Return Null/Unavailable
**Cause**: FFprobe not installed or stream inaccessible
**Solution**: 
```bash
# Install FFmpeg
apt-get install ffmpeg

# Test stream manually
ffprobe -v error rtsp://camera-url
```

#### 2. False Positive Freeze Detection
**Cause**: Static scene (security camera pointing at wall)
**Solution**: Increase `STREAM_HEALTH_FROZEN_THRESHOLD` to 5-10 frames

#### 3. High Packet Loss Reported
**Cause**: Network congestion or camera overload
**Solution**: 
- Check network bandwidth
- Reduce camera bitrate/resolution
- Enable substream for analysis

## Future Enhancements

### Planned Features
- [ ] GPU-accelerated frame analysis (CUDA/OpenVINO)
- [ ] Advanced tampering detection (lens obstruction, spray paint)
- [ ] Audio quality monitoring
- [ ] PTZ position verification
- [ ] Predictive failure analysis (ML-based)

### Integration Points
- [ ] Webhook notifications for quality degradation
- [ ] Grafana dashboard for real-time metrics
- [ ] Automated camera reboot on persistent failures
- [ ] Quality-based recording bitrate adjustment
