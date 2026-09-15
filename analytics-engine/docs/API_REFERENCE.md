# Analytics Engine API Reference

**Version:** 2.0.0  
**Base URL:** `http://localhost:8092` (development) | `https://analytics.sentinelgrid.com` (production)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Face Recognition API](#face-recognition-api)
3. [Human Analytics API](#human-analytics-api)
4. [Vehicle Analytics API](#vehicle-analytics-api)
5. [Industrial Analytics API](#industrial-analytics-api)
6. [Detection Processing API](#detection-processing-api)
7. [Error Handling](#error-handling)
8. [Rate Limits](#rate-limits)
9. [Webhooks](#webhooks)
10. [Code Examples](#code-examples)

---

## Authentication

All API endpoints require authentication using an API key in the request header:

```http
x-analytics-source-key: your-api-key-here
```

or for control plane endpoints:

```http
x-analytics-engine-key: your-engine-key-here
```

### Obtaining API Keys

API keys are generated during system initialization. Store them securely in environment variables:

```bash
ANALYTICS_SOURCE_SHARED_KEY=your-source-key-min-32-chars
ANALYTICS_ENGINE_SHARED_KEY=your-engine-key-min-32-chars
```

---

## Face Recognition API

### Watchlist Management

#### List Watchlists

```http
GET /v1/analytics/face-watchlists
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Security Watchlist",
      "list_type": "security",
      "enabled": true,
      "person_count": 45,
      "match_threshold": 0.70,
      "temporal_confirmation_frames": 3
    }
  ],
  "count": 1
}
```

#### Create Watchlist

```http
POST /v1/analytics/face-watchlists
Content-Type: application/json

{
  "name": "VIP Watchlist",
  "description": "VIP guests and dignitaries",
  "listType": "vip",
  "alertOnMatch": true,
  "alertSeverity": "P2",
  "matchThreshold": 0.75,
  "reviewThreshold": 0.65,
  "temporalConfirmationFrames": 3
}
```

### Person Enrollment

#### Enroll Person with Images

```http
POST /v1/analytics/face-watchlists/{watchlistId}/persons
Content-Type: application/json

{
  "fullName": "John Doe",
  "externalId": "EMP-12345",
  "dateOfBirth": "1985-06-15",
  "gender": "male",
  "images": [
    "base64-encoded-image-1",
    "base64-encoded-image-2",
    "base64-encoded-image-3"
  ],
  "metadata": {
    "department": "Security",
    "employeeId": "12345"
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "person-uuid",
    "full_name": "John Doe",
    "watchlist_id": "watchlist-uuid",
    "enrolled_at": "2026-09-15T10:30:00Z"
  },
  "enrollment": {
    "acceptedImages": 3,
    "rejectedImages": 0,
    "failures": []
  }
}
```

### Face Matching

#### Match Face Embedding

```http
POST /v1/analytics/face-match
Content-Type: application/json

{
  "embedding": [0.123, -0.456, ...], // 512-dimensional array
  "minSimilarity": 0.70,
  "watchlistIds": ["watchlist-uuid"],
  "limit": 10
}
```

**Response:**
```json
{
  "data": {
    "matched": true,
    "bestMatch": {
      "personId": "person-uuid",
      "personName": "John Doe",
      "watchlistId": "watchlist-uuid",
      "watchlistName": "Security Watchlist",
      "similarity": 0.87,
      "confidence": 5,
      "meanSimilarity": 0.85
    },
    "allCandidates": [...],
    "count": 3
  }
}
```

### Recognition Events

#### Record Recognition Event

```http
POST /v1/analytics/face-events
Content-Type: application/json

{
  "cameraId": "camera-uuid",
  "watchlistId": "watchlist-uuid",
  "personId": "person-uuid",
  "similarityScore": 0.87,
  "faceBbox": {
    "x": 0.3,
    "y": 0.2,
    "width": 0.15,
    "height": 0.25
  },
  "faceQuality": 0.92,
  "livenessScore": 0.97,
  "occurredAt": "2026-09-15T10:30:00Z"
}
```

**BFSI Compliance Notes:**
- `livenessScore` must be ≥ 0.95
- Requires 3-frame temporal confirmation
- Automatic consent validation
- P1/P2 alerts require human review

### Biometric Consent

#### Register Consent

```http
POST /v1/analytics/face/consent
Content-Type: application/json

{
  "personId": "person-uuid",
  "role": "EMPLOYEE",
  "documentReference": "CONSENT-2026-12345",
  "consentExpiryAt": "2027-09-15T00:00:00Z"
}
```

---

## Human Analytics API

### Person Tracking

#### Get Active Person Tracks

```http
GET /v1/detections/persons/tracks?cameraId=camera-uuid
```

**Response:**
```json
{
  "count": 5,
  "tracks": [
    {
      "trackId": "track-123",
      "firstSeen": "2026-09-15T10:30:00Z",
      "lastSeen": "2026-09-15T10:30:45Z",
      "dwellTimeSeconds": 45,
      "isStationary": false,
      "positionHistory": [
        {
          "x": 0.5,
          "y": 0.3,
          "timestamp": "2026-09-15T10:30:40Z"
        }
      ]
    }
  ]
}
```

### Occupancy Monitoring

#### Get Current Occupancy

```http
GET /v1/analytics/human/occupancy?cameraId=camera-uuid
```

**Response:**
```json
{
  "cameras": [
    {
      "cameraId": "camera-uuid",
      "occupancy": 23,
      "confidence": 0.92,
      "lastUpdated": "2026-09-15T10:30:00Z"
    }
  ]
}
```

#### Get Occupancy History

```http
GET /v1/analytics/human/occupancy/history
  ?cameraId=camera-uuid
  &startDate=2026-09-15T00:00:00Z
  &endDate=2026-09-15T23:59:59Z
  &interval=15min
```

**Response:**
```json
{
  "data": [
    {
      "timestamp": "2026-09-15T10:00:00Z",
      "occupancy": 18,
      "confidence": 0.89
    },
    {
      "timestamp": "2026-09-15T10:15:00Z",
      "occupancy": 23,
      "confidence": 0.92
    }
  ]
}
```

---

## Industrial Analytics API

### Safety Zone Management

#### Create Industrial Zone

```http
POST /v1/analytics/industrial/zones
Content-Type: application/json

{
  "cameraId": "camera-uuid",
  "zoneName": "Equipment Operation Area",
  "zoneType": "equipment-only",
  "polygonPoints": [
    {"x": 0.1, "y": 0.1},
    {"x": 0.9, "y": 0.1},
    {"x": 0.9, "y": 0.9},
    {"x": 0.1, "y": 0.9}
  ],
  "enabled": true
}
```

#### List Safety Violations

```http
GET /v1/analytics/industrial/violations
  ?cameraId=camera-uuid
  &severity=P1
  &reviewStatus=unreviewed
  &limit=50
```

**Response:**
```json
{
  "data": [
    {
      "id": "violation-uuid",
      "zone_id": "zone-uuid",
      "violation_type": "person-equipment-zone",
      "severity": "P1",
      "description": "Person detected in equipment-only zone",
      "occurred_at": "2026-09-15T10:30:00Z",
      "review_status": "unreviewed"
    }
  ]
}
```

---

## Detection Processing API

### Frame Processing

#### Submit RGB24 Frame for Inference

```http
POST /internal/frames
Content-Type: application/json
x-analytics-source-key: your-key

{
  "tenantId": "tenant-uuid",
  "cameraId": "camera-uuid",
  "capturedAt": "2026-09-15T10:30:00.000Z",
  "width": 1920,
  "height": 1080,
  "imageBase64": "base64-rgb24-data",
  "rules": [
    {
      "id": "rule-1",
      "cameraId": "camera-uuid",
      "detectionType": "person",
      "enabled": true,
      "minConfidence": 0.65
    }
  ]
}
```

**Response:**
```json
{
  "cameraId": "camera-uuid",
  "inferenceMode": "local-onnx",
  "detectionsReceived": 0,
  "eventsGenerated": 3,
  "accepted": 3,
  "failed": 0
}
```

#### Submit Pre-computed Detections

```http
POST /internal/frames
Content-Type: application/json

{
  "tenantId": "tenant-uuid",
  "cameraId": "camera-uuid",
  "width": 1920,
  "height": 1080,
  "detections": [
    {
      "label": "person",
      "confidence": 0.87,
      "trackId": "track-123",
      "boundingBox": {
        "x": 0.3,
        "y": 0.2,
        "width": 0.15,
        "height": 0.4
      }
    }
  ]
}
```

### Batch Detection Submission

```http
POST /internal/detections/batch
Content-Type: application/json

[
  {
    "tenantId": "tenant-uuid",
    "cameraId": "camera-1",
    "detectionType": "person",
    "confidence": 0.85,
    "modelVersion": "1.0.0",
    "occurredAt": "2026-09-15T10:30:00Z"
  },
  {
    "tenantId": "tenant-uuid",
    "cameraId": "camera-2",
    "detectionType": "vehicle",
    "confidence": 0.92,
    "modelVersion": "1.0.0",
    "occurredAt": "2026-09-15T10:30:01Z"
  }
]
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_analytics_source_identity` | 401 | Invalid or missing API key |
| `invalid_request` | 400 | Malformed request body |
| `watchlist_not_found` | 404 | Watchlist does not exist |
| `person_not_found` | 404 | Person does not exist |
| `governance_validation_failed` | 400 | BFSI compliance check failed |
| `control_plane_unavailable` | 502 | Control plane connection failed |
| `model_not_loaded` | 503 | AI model not available |

### BFSI Governance Errors

When a face recognition event fails governance validation:

```json
{
  "error": "governance_validation_failed",
  "reason": "LIVENESS_REJECTED: liveness score 0.85 below threshold 0.95",
  "observationCount": 2,
  "livenessScore": 0.85
}
```

Common rejection reasons:
- `TEMPORAL_CONFIRMATION_INSUFFICIENT` - Less than 3 observations
- `LIVENESS_REJECTED` - Liveness score < 0.95
- `UNLAWFUL_PROCESSING` - No active biometric consent
- `INVALID_EMBEDDING_DIMENSION` - Embedding not 512-dimensional

---

## Rate Limits

| Endpoint Category | Limit | Period |
|-------------------|-------|--------|
| Face Recognition API | 1000 requests | 1 minute |
| Frame Submission | 100 frames | 1 second |
| Detection Events | 1000 events | 1 minute |
| Health Check | Unlimited | - |

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1694779200
```

**Rate Limit Exceeded Response:**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retryAfter": 60
}
```

---

## Webhooks

Configure webhooks to receive real-time notifications:

### Webhook Configuration

```bash
NOTIFICATION_WEBHOOK_URL=https://your-server.com/webhook
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_RETRY_ATTEMPTS=3
```

### Webhook Payload

```json
{
  "eventType": "face_recognition_match",
  "eventId": "event-uuid",
  "tenantId": "tenant-uuid",
  "cameraId": "camera-uuid",
  "timestamp": "2026-09-15T10:30:00Z",
  "data": {
    "personId": "person-uuid",
    "personName": "John Doe",
    "watchlistId": "watchlist-uuid",
    "similarity": 0.87,
    "severity": "P2",
    "requiresReview": true
  }
}
```

### Webhook Verification

Webhooks include an HMAC signature for verification:

```http
X-Webhook-Signature: sha256=...
X-Webhook-Timestamp: 1694779200
```

---

## Code Examples

### Python: Face Recognition

```python
import requests
import base64

API_BASE = "http://localhost:8092"
API_KEY = "your-api-key"

# Enroll person with image
with open("person.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

response = requests.post(
    f"{API_BASE}/v1/analytics/face-watchlists/{watchlist_id}/persons",
    headers={
        "x-analytics-source-key": API_KEY,
        "Content-Type": "application/json"
    },
    json={
        "fullName": "John Doe",
        "images": [image_data],
        "metadata": {"department": "Security"}
    }
)

person = response.json()["data"]
print(f"Enrolled person: {person['id']}")
```

### Node.js: Submit Detection Event

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:8092';
const API_KEY = 'your-api-key';

async function submitDetection() {
  const response = await axios.post(
    `${API_BASE}/internal/detections`,
    {
      tenantId: 'tenant-uuid',
      cameraId: 'camera-uuid',
      detectionType: 'person',
      confidence: 0.87,
      modelVersion: '1.0.0',
      occurredAt: new Date().toISOString(),
      objects: [
        {
          label: 'person',
          confidence: 0.87,
          trackId: 'track-123',
          boundingBox: { x: 0.3, y: 0.2, width: 0.15, height: 0.4 }
        }
      ]
    },
    {
      headers: {
        'x-analytics-source-key': API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log('Detection submitted:', response.status);
}

submitDetection();
```

### cURL: Get Camera Status

```bash
curl -X GET \
  "http://localhost:8092/v1/analytics/cameras/camera-uuid/status" \
  -H "x-analytics-source-key: your-api-key"
```

---

## OpenAPI Specifications

Full OpenAPI 3.0 specifications are available:

- **Face Recognition API:** `analytics-engine/openapi/face-recognition-api.yaml`
- **Analytics Engine API:** `analytics-engine/openapi/analytics-engine-api.yaml`

Import these into:
- **Swagger UI:** Interactive API documentation
- **Postman:** Pre-configured API collections
- **API Clients:** Auto-generate SDKs

---

## Support & Contact

- **Documentation:** https://docs.sentinelgrid.com
- **GitHub Issues:** https://github.com/sentinel-grid/analytics-engine/issues
- **Email Support:** support@sentinelgrid.com
- **Community Forum:** https://community.sentinelgrid.com

---

**Last Updated:** 2026-09-15  
**API Version:** 2.0.0  
**Engine Version:** 2.0.0
