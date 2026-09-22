# Sentinel Grid: Comprehensive API Specification (OpenAPI Core)

**Document Version:** 1.0.0-PROD  
**API Specification:** RESTful JSON / OpenAPI 3.0  
**Base URL:** `https://api.sentinelgrid.bankdomain.com`  
**Authentication:** Bearer JWT in `Authorization: Bearer <TOKEN>` or Secure Session Cookie  

---

## 1. Authentication & Identity Endpoints

### `POST /api/v1/auth/login`
- **Description:** Authenticates user credentials with tenant scope.
- **Request Body:**
  ```json
  {
    "username": "soc_lead@bank.com",
    "password": "SecurePassword123!",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_991823",
      "username": "soc_lead@bank.com",
      "role": "soc_operator",
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "mfaRequired": false
    }
  }
  ```

---

## 2. Camera & Live Streaming Endpoints

### `POST /api/v1/live-sessions`
- **Description:** Creates an authorized, time-limited live stream token. Never exposes camera credentials.
- **Request Body:**
  ```json
  {
    "cameraId": "b6a3e144-88d3-48b0-a517-109283746520",
    "protocol": "webrtc"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "sessionId": "ses_489102",
    "streamUrl": "https://media.sentinelgrid.bankdomain.com/webrtc/stream_b6a3e144?token=mst_99182",
    "expiresAt": "2026-09-22T22:45:00.000Z",
    "protocol": "webrtc"
  }
  ```

---

## 3. Banking Security Integrations

### `POST /api/v1/integrations/banking/access-event`
- **Description:** Correlates door access swipe events with real-time camera visual detections.
- **Request Body:**
  ```json
  {
    "doorId": "DOOR-VAULT-01",
    "doorName": "Strong Room Outer Vault Door",
    "branchId": "110e8400-e29b-41d4-a716-446655440001",
    "credentialType": "BIOMETRIC",
    "userId": "EMP-9402",
    "userName": "Deepak Sharma",
    "authorized": true,
    "timestamp": "2026-09-22T22:30:00Z"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "correlationId": "cor_9918204",
      "classification": "OBSERVATION",
      "mismatchType": "NORMAL_ACCESS",
      "severity": "P4",
      "summary": "Normal authorized access recorded and visually verified.",
      "details": {
        "badgeHolder": "Deepak Sharma",
        "detectedPersonsCount": 1,
        "visualConfidence": 0.94
      }
    }
  }
  ```

### `POST /api/v1/integrations/banking/transaction-event`
- **Description:** Ingests Core Banking System / POS cash events and correlates CCTV footage (±10 min).
- **Request Body:**
  ```json
  {
    "transactionId": "TXN-20260922-99812",
    "branchId": "110e8400-e29b-41d4-a716-446655440001",
    "tellerId": "TLR-04",
    "terminalId": "TERM-CASH-02",
    "transactionType": "CASH_WITHDRAWAL",
    "amountBucket": "10L-50L",
    "riskFlag": true,
    "riskReason": "Large cash withdrawal exceeding branch daily velocity limit",
    "timestamp": "2026-09-22T22:25:00Z"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "packageId": "pkg_771829",
      "classification": "INVESTIGATION LEAD",
      "severity": "P1",
      "primaryCameraId": "b6a3e144-88d3-48b0-a517-109283746520",
      "timeWindow": {
        "startTime": "2026-09-22T22:15:00.000Z",
        "transactionTime": "2026-09-22T22:25:00Z",
        "endTime": "2026-09-22T22:35:00.000Z"
      },
      "recordingSegments": [
        {
          "segmentId": "seg_10492",
          "startTime": "2026-09-22T22:15:00.000Z",
          "endTime": "2026-09-22T22:35:00.000Z",
          "storageTier": "hot"
        }
      ],
      "summary": "High-value flagged transaction (10L-50L): Large cash withdrawal exceeding velocity limit. Evidence window ±10m isolated.",
      "caseTimelineReference": "CASE-REF-99812"
    }
  }
  ```

---

## 4. Forensic Search & Evidence Endpoints

### `POST /api/v1/ai/video-search/natural-language`
- **Description:** Translates natural language queries into structured multi-attribute database filters.
- **Request Body:**
  ```json
  {
    "query": "Show people entering the vault after 8 PM yesterday",
    "branchId": "110e8400-e29b-41d4-a716-446655440001",
    "limit": 20
  }
  ```

### `POST /api/v1/evidence/legal-hold`
- **Description:** Applies or releases a legal preservation hold on video segments.
- **Request Body:**
  ```json
  {
    "caseId": "CASE-2026-0819",
    "evidenceItemId": "evi_881920",
    "holdEnabled": true,
    "reason": "FIR #402/2026 Judicial Inquiry"
  }
  ```
