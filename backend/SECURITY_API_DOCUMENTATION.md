# Security API Documentation

Comprehensive API documentation for Sentinel Grid Enterprise Security Features.

## Table of Contents

1. [Authentication](#authentication)
2. [Security Operations Center (SOC)](#security-operations-center-soc)
3. [Zero Trust Architecture](#zero-trust-architecture)
4. [Certificate Management](#certificate-management)
5. [Password Rotation](#password-rotation)
6. [Tamper Detection](#tamper-detection)
7. [Video Encryption](#video-encryption)
8. [Immutable Storage](#immutable-storage)
9. [Ransomware Detection](#ransomware-detection)
10. [Supply Chain Verification](#supply-chain-verification)
11. [Secure Boot & TPM](#secure-boot--tpm)

---

## Authentication

All API endpoints require authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <token>
```

---

## Security Operations Center (SOC)

### Get Security Posture

Get the current overall security posture with scores and metrics.

```http
GET /api/security/posture
```

**Response:**
```json
{
  "overallScore": 95,
  "timestamp": "2026-07-31T12:00:00Z",
  "metrics": {
    "zeroTrust": {
      "score": 96,
      "devicesCompliant": 398,
      "devicesTotal": 400,
      "highRiskSessions": 2
    },
    "encryption": {
      "score": 100,
      "videosEncrypted": 5000,
      "videosTotal": 5000
    },
    "certificates": {
      "score": 98,
      "healthy": 498,
      "expiringSoon": 12,
      "expired": 1,
      "revoked": 0
    },
    "ransomware": {
      "activeThreats": 0,
      "eventsToday": 0,
      "riskLevel": "NONE"
    }
  }
}
```

### Get Active Alerts

```http
GET /api/security/alerts
```

### Acknowledge Alert

```http
POST /api/security/alerts/:id/acknowledge
```

### Resolve Alert

```http
POST /api/security/alerts/:id/resolve
```

### Security Health Check

```http
GET /api/security/health
```

**Response:**
```json
{
  "overall": "HEALTHY",
  "checks": [
    {
      "name": "Certificates",
      "status": "PASS",
      "message": "498/500 healthy, 1 expired, 12 expiring soon"
    },
    {
      "name": "Zero Trust Compliance",
      "status": "PASS",
      "message": "99.5% devices compliant (398/400)"
    }
  ]
}
```

### Security Report

```http
GET /api/security/report?startDate=2026-07-01&endDate=2026-07-31
```

---

## Zero Trust Architecture

### Evaluate Access Request

Evaluate an access request using Zero Trust principles.

```http
POST /api/security/zero-trust/evaluate
```

**Request Body:**
```json
{
  "context": {
    "userId": "user-123",
    "deviceId": "device-456",
    "deviceFingerprint": "abc123",
    "ipAddress": "192.168.1.100",
    "location": {
      "country": "US",
      "city": "New York",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 100
    },
    "timestamp": "2026-07-31T12:00:00Z",
    "sessionId": "session-789",
    "userAgent": "Mozilla/5.0..."
  },
  "resource": "/api/cameras/branch-01",
  "action": "view"
}
```

**Response:**
```json
{
  "allowed": true,
  "reason": "Low risk - access granted",
  "riskScore": 25,
  "requiredActions": [],
  "conditions": [
    {
      "type": "MFA",
      "required": true,
      "satisfied": true,
      "details": "Multi-factor authentication required"
    }
  ],
  "expiresAt": "2026-07-31T13:00:00Z"
}
```

### Register Device

```http
POST /api/security/zero-trust/devices/register
```

**Request Body:**
```json
{
  "deviceId": "device-123",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "tpmAttestation": { ... },
  "secureBootStatus": true
}
```

### Get Device Trust Status

```http
GET /api/security/zero-trust/devices/:id
```

### List Devices

```http
GET /api/security/zero-trust/devices?trustLevel=HIGH&complianceStatus=COMPLIANT
```

### Get Metrics

```http
GET /api/security/zero-trust/metrics
```

---

## Certificate Management

### Add Certificate

```http
POST /api/security/certificates
```

**Request Body:**
```json
{
  "certPem": "-----BEGIN CERTIFICATE-----\n...",
  "deviceId": "camera-123",
  "deviceType": "camera",
  "autoRenew": true
}
```

### List Certificates

```http
GET /api/security/certificates?status=EXPIRING_SOON&deviceType=camera
```

### Get Certificate

```http
GET /api/security/certificates/:id
```

### Get Certificate Health

```http
GET /api/security/certificates/health
```

**Response:**
```json
{
  "totalCertificates": 500,
  "healthy": 485,
  "expiringSoon": 12,
  "expired": 2,
  "revoked": 1,
  "invalid": 0
}
```

### Renew Certificate

```http
POST /api/security/certificates/:id/renew
```

### Revoke Certificate

```http
POST /api/security/certificates/:id/revoke
```

**Request Body:**
```json
{
  "reason": "Device compromised"
}
```

---

## Password Rotation

### Schedule Password Rotation

```http
POST /api/security/password-rotation/schedule
```

**Request Body:**
```json
{
  "targetType": "CAMERA",
  "targetId": "camera-123",
  "targetName": "Branch 01 - Camera 001",
  "scheduledAt": "2026-08-01T02:00:00Z"
}
```

### Execute Rotation

```http
POST /api/security/password-rotation/:id/execute
```

### List Rotation Jobs

```http
GET /api/security/password-rotation/jobs?status=COMPLETED&targetType=CAMERA
```

### Get Statistics

```http
GET /api/security/password-rotation/statistics
```

**Response:**
```json
{
  "total": 1500,
  "completed": 1450,
  "failed": 25,
  "inProgress": 15,
  "scheduled": 10
}
```

---

## Tamper Detection

### Report Tamper Event

```http
POST /api/security/tamper/report
```

**Request Body:**
```json
{
  "deviceId": "camera-123",
  "deviceType": "camera",
  "deviceName": "Branch 01 - Camera 001",
  "tamperType": "CAMERA_COVERED",
  "description": "Camera appears to be covered. Brightness dropped significantly.",
  "evidenceUrls": ["/evidence/camera-123/snapshot-001.jpg"]
}
```

### List Tamper Events

```http
GET /api/security/tamper/events?severity=CRITICAL&resolved=false
```

### Get Tamper Event

```http
GET /api/security/tamper/events/:id
```

### Acknowledge Event

```http
POST /api/security/tamper/events/:id/acknowledge
```

**Request Body:**
```json
{
  "acknowledgedBy": "security-officer-1"
}
```

### Get Statistics

```http
GET /api/security/tamper/statistics
```

---

## Video Encryption

### Encrypt Video

```http
POST /api/security/video-encryption/encrypt
```

**Request Body:**
```json
{
  "videoPath": "/recordings/camera-123/2026-07-31-120000.mp4",
  "outputPath": "/recordings/camera-123/2026-07-31-120000.encrypted"
}
```

### Decrypt Video

```http
POST /api/security/video-encryption/decrypt
```

**Request Body:**
```json
{
  "encryptedVideoId": "video-encrypted-123",
  "outputPath": "/temp/decrypted-video.mp4"
}
```

### List Encrypted Videos

```http
GET /api/security/video-encryption/videos
```

---

## Immutable Storage

### Create Immutable Object

```http
POST /api/security/immutable-storage/objects
```

**Request Body:**
```json
{
  "objectType": "EVIDENCE",
  "objectId": "evidence-123",
  "objectPath": "/evidence/case-456/video.mp4",
  "retentionPolicy": {
    "retentionDays": 2555,
    "wormEnabled": true,
    "deleteAfterRetention": false,
    "extendable": true
  },
  "metadata": {
    "caseNumber": "CASE-456",
    "officer": "Officer Smith"
  }
}
```

**Response:**
```json
{
  "id": "immutable-789",
  "objectType": "EVIDENCE",
  "objectId": "evidence-123",
  "locked": true,
  "lockedUntil": "2033-07-31T00:00:00Z",
  "legalHold": false,
  "checksum": "abc123..."
}
```

### Apply Legal Hold

```http
POST /api/security/immutable-storage/objects/:id/legal-hold
```

**Request Body:**
```json
{
  "reason": "Ongoing investigation - Case #12345"
}
```

### List Immutable Objects

```http
GET /api/security/immutable-storage/objects?objectType=EVIDENCE&legalHold=true
```

### Get Statistics

```http
GET /api/security/immutable-storage/statistics
```

---

## Ransomware Detection

### Report Ransomware Event

```http
POST /api/security/ransomware/report
```

**Request Body:**
```json
{
  "affectedDevices": ["recorder-1", "recorder-2"],
  "indicators": [
    {
      "type": "MASS_ENCRYPTION",
      "description": "150 files encrypted in 60 seconds",
      "confidence": 0.95,
      "timestamp": "2026-07-31T12:00:00Z",
      "details": {
        "filesEncrypted": 150,
        "timeWindow": 60
      }
    }
  ]
}
```

### List Ransomware Events

```http
GET /api/security/ransomware/events?severity=CRITICAL&resolved=false
```

### Get Statistics

```http
GET /api/security/ransomware/statistics
```

**Response:**
```json
{
  "totalEvents": 5,
  "activeThreats": 0,
  "resolvedEvents": 5,
  "bySeverity": {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 1,
    "CRITICAL": 1
  },
  "byClassification": {
    "FALSE_POSITIVE": 2,
    "SUSPICIOUS_ACTIVITY": 2,
    "LIKELY_RANSOMWARE": 0,
    "CONFIRMED_ATTACK": 1
  }
}
```

---

## Supply Chain Verification

### Verify Package

```http
POST /api/security/supply-chain/verify
```

**Request Body:**
```json
{
  "name": "camera-firmware",
  "version": "5.7.2",
  "vendor": "Axis Communications",
  "downloadUrl": "https://vendor.com/firmware.bin",
  "filePath": "/downloads/firmware-5.7.2.bin"
}
```

**Response:**
```json
{
  "id": "Axis Communications:camera-firmware:5.7.2",
  "name": "camera-firmware",
  "version": "5.7.2",
  "vendor": "Axis Communications",
  "sha256": "abc123...",
  "sha512": "def456...",
  "digitalSignature": "VALID",
  "verified": true,
  "verifiedAt": "2026-07-31T12:00:00Z",
  "trustLevel": 4,
  "vulnerabilities": []
}
```

### List Packages

```http
GET /api/security/supply-chain/packages?vendor=Axis&verified=true
```

### Get Statistics

```http
GET /api/security/supply-chain/statistics
```

---

## Secure Boot & TPM

### Verify Secure Boot

```http
POST /api/security/secure-boot/verify
```

**Request Body:**
```json
{
  "deviceId": "recorder-123"
}
```

**Response:**
```json
{
  "deviceId": "recorder-123",
  "enabled": true,
  "bootChainValid": true,
  "lastValidated": "2026-07-31T12:00:00Z",
  "stages": [
    {
      "name": "UEFI",
      "hash": "abc123...",
      "valid": true,
      "timestamp": "2026-07-31T12:00:00Z"
    }
  ],
  "issues": []
}
```

### Register TPM Device

```http
POST /api/security/tpm/register
```

**Request Body:**
```json
{
  "deviceId": "recorder-123",
  "tpmVersion": "2.0",
  "manufacturer": "Intel",
  "firmwareVersion": "1.4.0",
  "ekCertificate": "-----BEGIN CERTIFICATE-----\n..."
}
```

### Perform TPM Attestation

```http
POST /api/security/tpm/attest
```

**Request Body:**
```json
{
  "deviceId": "recorder-123",
  "quote": {
    "pcrValues": {
      "0": "abc123...",
      "1": "def456..."
    },
    "timestamp": "2026-07-31T12:00:00Z"
  },
  "signature": "..."
}
```

**Response:**
```json
{
  "valid": true
}
```

### List TPM Devices

```http
GET /api/security/tpm/devices?status=HEALTHY
```

### Get Statistics

```http
GET /api/security/secure-boot/statistics
```

**Response:**
```json
{
  "totalTPMDevices": 100,
  "healthyTPM": 98,
  "failedAttestations": 2,
  "missingTPM": 0,
  "totalSecureBoot": 100,
  "validSecureBoot": 99,
  "invalidSecureBoot": 1
}
```

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200 OK` - Request successful
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- General endpoints: 100 requests per minute
- Security-critical endpoints: 30 requests per minute

---

## Webhooks

Configure webhooks to receive real-time security alerts:

```http
POST /api/security/webhooks
```

**Request Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["CRITICAL_ALERT", "RANSOMWARE_DETECTED", "TAMPER_EVENT"],
  "secret": "your-webhook-secret"
}
```

Webhook payload example:
```json
{
  "event": "CRITICAL_ALERT",
  "timestamp": "2026-07-31T12:00:00Z",
  "data": {
    "alertId": "alert-123",
    "severity": "CRITICAL",
    "title": "Ransomware detected on Recorder-5",
    "description": "..."
  }
}
```

---

## SDK Examples

### Node.js

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.sentinelgrid.com',
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`
  }
});

// Get security posture
const posture = await api.get('/api/security/posture');
console.log('Security Score:', posture.data.overallScore);

// Report tamper event
await api.post('/api/security/tamper/report', {
  deviceId: 'camera-123',
  deviceType: 'camera',
  deviceName: 'Branch 01 - Camera 001',
  tamperType: 'CAMERA_COVERED',
  description: 'Camera covered detected'
});
```

### Python

```python
import requests

api_token = os.environ['API_TOKEN']
headers = {'Authorization': f'Bearer {api_token}'}

# Get security posture
response = requests.get(
    'https://api.sentinelgrid.com/api/security/posture',
    headers=headers
)
posture = response.json()
print(f"Security Score: {posture['overallScore']}")

# Schedule password rotation
requests.post(
    'https://api.sentinelgrid.com/api/security/password-rotation/schedule',
    headers=headers,
    json={
        'targetType': 'CAMERA',
        'targetId': 'camera-123',
        'targetName': 'Branch 01 - Camera 001'
    }
)
```

---

## Best Practices

1. **Authentication**: Always use HTTPS and rotate API tokens regularly
2. **Rate Limiting**: Implement exponential backoff for failed requests
3. **Error Handling**: Handle all error responses gracefully
4. **Webhooks**: Verify webhook signatures before processing
5. **Monitoring**: Monitor API health and response times
6. **Logging**: Log all security-related API calls for audit
7. **Encryption**: Encrypt sensitive data in transit and at rest

---

## Support

For API support, contact:
- Email: security@sentinelgrid.com
- Documentation: https://docs.sentinelgrid.com/security
- Status Page: https://status.sentinelgrid.com
