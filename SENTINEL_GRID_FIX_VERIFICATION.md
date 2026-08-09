# Sentinel Grid Fix Verification Guide

## Executive Summary

This document provides comprehensive verification steps for the fixes applied to Sentinel Grid's Security Posture and Alert Command Center systems.

**Issues Fixed:**
1. ✅ Security Posture showing "Measurement unavailable – security_posture_collectors_not_configured"
2. ✅ Alert Command Center showing "0 alerts" despite stream being connected

**Root Causes Resolved:**
1. SecurityServicesFactory was never initialized in main app
2. SecurityMonitor was never started to collect metrics
3. Security dashboard API routes were not registered
4. Test endpoints were missing for verification

---

## Changes Made

### 1. Security Services Initialization (`src/app.ts`)

**Added:**
```typescript
// Initialize security services and collectors
const { SecurityServicesFactory } = await import("./security/services/index.js");
const { SecurityMonitor } = await import("./security/monitoring/security-monitor.js");

const securityServices = SecurityServicesFactory.getInstance();
await securityServices.initialize();

const securityMonitor = SecurityMonitor.getInstance();
await securityMonitor.startMonitoring();
```

**What this does:**
- Starts Certificate Collector (monitors TLS/SSH certificates)
- Starts Secret Vault Collector (tracks vault compliance)
- Starts Password Rotation Collector (monitors rotation schedules)
- Starts TPM/HSM Collector (queries hardware security modules)
- Starts Zero Trust Policy Engine (evaluates access decisions)
- Initializes Security Posture Service (calculates security score)
- Starts SecurityMonitor (orchestrates all collectors)

### 2. Security Dashboard Routes (`src/routes/security-dashboard.routes.ts`)

**Created new Fastify-native routes:**
- `GET /v1/security/posture` - Get current security posture with live collector data
- `POST /v1/security/posture/calculate` - Force recalculation of security score
- `GET /v1/security/posture/history` - Historical security scores (30 days default)
- `GET /v1/security/issues` - List active security issues
- `POST /v1/security/issues/:issueId/resolve` - Resolve security issues
- `GET /v1/security/certificates` - List all certificates
- `GET /v1/security/certificates/:id` - Get certificate details
- `GET /v1/security/health` - Health check for all security services
- `GET /v1/security/collectors/status` - Status of all 8 collectors

### 3. Test & Diagnostic Endpoints

**Added:**
- `POST /v1/security/test/generate-alert` - Generate synthetic security alerts (8 types)
- `GET /v1/security/test/sse-verify` - SSE connection verification instructions

---

## Verification Steps

### Step 1: Verify Security Posture is Now Available

**Before Fix:**
```json
{
  "available": false,
  "reason": "security_posture_collectors_not_configured",
  "overallScore": 0
}
```

**After Fix - Test Command:**
```bash
curl -X GET http://localhost:3000/api/control/v1/security/posture \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "available": true,
  "provenance": "LIVE",
  "overallScore": 75,
  "timestamp": "2026-08-09T...",
  "categories": [...],
  "collectors": {
    "certificate": true,
    "secretVault": true,
    "passwordRotation": true,
    "tpm": true,
    "zeroTrust": true,
    "secureBoot": false,
    "ransomware": false,
    "tamper": false
  },
  "criticalIssues": 0,
  "highIssues": 2,
  "mediumIssues": 5
}
```

**✅ Success Criteria:** `available: true` and `overallScore > 0`

---

### Step 2: Verify Collectors are Active

**Test Command:**
```bash
curl -X GET http://localhost:3000/api/control/v1/security/collectors/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "collectors": [
    {
      "name": "Certificate Collector",
      "type": "certificate",
      "enabled": true,
      "status": "active",
      "description": "Monitors TLS/SSH certificates for expiration and strength"
    },
    {
      "name": "Secret Vault Collector",
      "type": "secret_vault",
      "enabled": true,
      "status": "active",
      "description": "Tracks secrets and vault compliance"
    },
    // ... 6 more collectors
  ],
  "summary": {
    "total": 8,
    "active": 5,
    "inactive": 3
  }
}
```

**✅ Success Criteria:** At least 5 collectors showing `"status": "active"`

---

### Step 3: Verify Alert Pipeline End-to-End

#### 3.1 Open SSE Connection in Browser

**Browser Console:**
```javascript
const events = new EventSource("/api/control/v1/alerts/events", { withCredentials: true });
events.addEventListener("ready", () => console.log("SSE Connected!"));
events.addEventListener("alert.created", (e) => console.log("Alert:", JSON.parse(e.data)));
events.addEventListener("alert.updated", (e) => console.log("Updated:", JSON.parse(e.data)));
```

**Expected Output:**
```
SSE Connected!
```

#### 3.2 Generate Test Analytics Alert

**Command:**
```bash
curl -X POST http://localhost:3000/api/control/v1/alerts/command-center/demo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "P1",
    "detectionType": "camera-tampering"
  }'
```

**Expected Response:**
```json
{
  "alerts": [
    {
      "id": "uuid-here",
      "severity": "P1",
      "title": "Camera Tampering Detected",
      "status": "new",
      "firstDetectedAt": "2026-08-09T...",
      "cameraId": "..."
    }
  ]
}
```

**Browser Console Should Show:**
```javascript
Alert: {
  id: "event-uuid",
  tenantId: "...",
  type: "alert.created",
  alertId: "alert-uuid",
  occurredAt: "2026-08-09T..."
}
```

#### 3.3 Generate Security Alert

**Command:**
```bash
curl -X POST http://localhost:3000/api/control/v1/security/test/generate-alert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alertType": "certificate_expiring",
    "severity": "high"
  }'
```

**Expected Response:**
```json
{
  "message": "Test security alert generated",
  "alert": {
    "id": "test-sec-...",
    "type": "certificate_expiring",
    "severity": "high",
    "title": "Certificate Expiring Soon",
    "description": "SSL certificate for main-gateway.local expires in 7 days",
    "timestamp": "2026-08-09T...",
    "acknowledged": false
  },
  "note": "This is a synthetic alert for testing purposes"
}
```

---

### Step 4: Verify UI Updates

#### 4.1 Security Posture Page

**Navigate to:** `http://localhost:3000/operations/security/posture`

**Expected:**
- Security score displayed (e.g., "75/100")
- Collector metrics visible (certificates, secrets, TPM, etc.)
- ~~"Measurement unavailable"~~ message should be **GONE**
- Real-time metrics updating

#### 4.2 Alert Command Center Page

**Navigate to:** `http://localhost:3000/operations/alert-command-center`

**Before Generating Alerts:**
- Stream status: "Live event stream connected" ✅
- Counters: P1=0, P2=0, P3=0, P4=0
- Table: "No matching alerts"

**After Generating Test Alert (Step 3.2):**
- Counters: P1=1 (or higher depending on severity)
- Table: Shows alert row with:
  - Priority badge (P1 in red)
  - Detection type (camera-tampering)
  - Camera name
  - Branch name
  - Timestamp
  - Status (NEW)

**✅ Success Criteria:** 
1. Alert appears in table within 1 second
2. Counter increments automatically
3. Clicking alert shows details panel on right

---

### Step 5: Health Check Verification

**Test Command:**
```bash
curl -X GET http://localhost:3000/api/control/v1/security/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-08-09T...",
  "services": {
    "secretVault": { "status": "healthy" },
    "certificateManagement": { "status": "healthy" },
    "passwordRotation": { "status": "healthy" },
    "hsm": { "status": "healthy" },
    "zeroTrust": { "status": "healthy" }
  },
  "monitoring": {
    "running": true
  }
}
```

**✅ Success Criteria:** Overall status is "healthy" or "degraded" (not error)

---

## Test Alert Types

The system now supports generating 8 types of synthetic security alerts:

| Alert Type | Severity | Description |
|------------|----------|-------------|
| `certificate_expiring` | High | SSL certificate expires in 7 days |
| `certificate_expired` | Critical | SSL certificate has expired |
| `secret_rotation_failed` | High | Failed to rotate database credentials |
| `tpm_attestation_failed` | Critical | Device failed TPM attestation |
| `zero_trust_high_risk` | High | Access denied due to high risk score |
| `security_score_low` | Critical | Security score below threshold |
| `ransomware_detected` | Critical | Suspicious encryption activity |
| `tamper_detected` | Critical | Physical tampering detected |

**Generate Different Alert Types:**
```bash
# Certificate expiring alert
curl -X POST http://localhost:3000/api/control/v1/security/test/generate-alert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "certificate_expiring", "severity": "high"}'

# Ransomware detection alert
curl -X POST http://localhost:3000/api/control/v1/security/test/generate-alert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "ransomware_detected", "severity": "critical"}'

# TPM attestation failure
curl -X POST http://localhost:3000/api/control/v1/security/test/generate-alert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "tpm_attestation_failed", "severity": "critical"}'
```

---

## Troubleshooting

### Issue: Security Posture Still Shows "unavailable"

**Check server logs:**
```bash
# Look for initialization errors
grep "Security services" logs/server.log
grep "failed to initialize security" logs/server.log
```

**Common causes:**
1. Database connection failed (MongoDB required for posture history)
2. SecurityServicesFactory.initialize() threw error
3. Services started but no data collected yet (wait 5 minutes)

**Fix:**
```bash
# Restart server to reinitialize
npm run dev
# Check logs for "Security services initialized" message
```

### Issue: Alerts Not Appearing in UI

**Verify SSE connection:**
```bash
curl -N http://localhost:3000/api/control/v1/alerts/events \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected output:** Stream stays open, shows heartbeat comments

**If stream closes immediately:**
1. Check authentication token is valid
2. Check CORS configuration
3. Check reverse proxy buffering settings

**Check alert was created:**
```bash
curl -X GET http://localhost:3000/api/control/v1/alerts/command-center \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Issue: Collectors Show "inactive"

**Verify services initialized:**
```bash
# Check logs for these messages:
# - "Security services (Certificate, TPM, ...) initialized"
# - "Security monitoring started"
```

**If not found:**
1. Check if SecurityServicesFactory import succeeded
2. Check database connectivity (some services require MongoDB)
3. Restart server

---

## Server Logs to Monitor

**On Startup (Expected):**
```
INFO: Alert engine started
INFO: Scheduled reports service started
INFO: Security services (Certificate, TPM, Secure Boot, Vault, Ransomware, Tamper) initialized
INFO: Security monitoring started
INFO: Security dashboard routes registered
```

**On Alert Generation:**
```
INFO: Test security alert generated {"alertId":"test-sec-...","type":"certificate_expiring","severity":"high"}
INFO: Synthetic alert notification dispatch {"alerts":1}
```

**On Security Check (every 5 minutes):**
```
INFO: Running security checks...
INFO: Certificate health check completed
INFO: Secret vault health check completed
INFO: Security posture check completed
```

---

## API Reference Quick Guide

### Security Posture APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/security/posture` | Current security score & metrics |
| POST | `/v1/security/posture/calculate` | Force recalculation |
| GET | `/v1/security/posture/history?days=30` | Historical scores |
| GET | `/v1/security/issues` | List unresolved issues |
| POST | `/v1/security/issues/:id/resolve` | Mark issue resolved |

### Collector & Health APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/security/collectors/status` | Status of all 8 collectors |
| GET | `/v1/security/health` | Health check all services |
| GET | `/v1/security/certificates` | List certificates |
| GET | `/v1/security/certificates/:id` | Certificate details |

### Alert APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/alerts/command-center` | List alerts (filter by severity/status) |
| GET | `/v1/alerts/events` | SSE stream (real-time) |
| POST | `/v1/alerts/command-center/demo` | Generate test analytics alert |
| POST | `/v1/security/test/generate-alert` | Generate test security alert |

### Test & Diagnostic APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/security/test/generate-alert` | Generate synthetic security alert |
| GET | `/v1/security/test/sse-verify` | SSE verification instructions |

---

## Expected Behavior Summary

### Security Posture Page

**Before Fix:**
```
┌─────────────────────────────────────┐
│  Security Operations                │
├─────────────────────────────────────┤
│  ⚠️ MEASUREMENT UNAVAILABLE         │
│  No security score has been         │
│  calculated                         │
│                                     │
│  Reason:                            │
│  security_posture_collectors_       │
│  not_configured                     │
└─────────────────────────────────────┘
```

**After Fix:**
```
┌─────────────────────────────────────┐
│  Security Operations                │
├─────────────────────────────────────┤
│  Overall Score: 75/100 🟢           │
│                                     │
│  Certificate Management: ✅ 85      │
│  Secret Vault: ✅ 92                │
│  Zero Trust: ✅ 78                  │
│  TPM/HSM: ✅ 80                     │
│  Threat Detection: ⚠️ 60           │
│                                     │
│  Active Collectors: 5/8             │
│  Critical Issues: 0                 │
│  High Issues: 2                     │
└─────────────────────────────────────┘
```

### Alert Command Center Page

**Before Fix:**
```
┌─────────────────────────────────────┐
│  Real-time Alert Command Center     │
├─────────────────────────────────────┤
│  Live event stream connected ✅     │
│                                     │
│  P1: 0  P2: 0  P3: 0  P4: 0        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ No matching alerts          │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**After Fix (with alerts):**
```
┌─────────────────────────────────────┐
│  Real-time Alert Command Center     │
├─────────────────────────────────────┤
│  Live event stream connected ✅     │
│                                     │
│  P1: 2  P2: 1  P3: 5  P4: 3        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔴 P1 Camera-07 Tampering   │   │
│  │ 🔴 P1 DVR-01 Offline        │   │
│  │ 🟠 P2 Cert Expiring         │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Next Steps

1. **Generate Test Alerts:** Use the demo endpoints to populate the command center
2. **Monitor for 24 Hours:** Ensure security monitoring runs continuously
3. **Configure Real Collectors:** Replace placeholders with production integrations
4. **Set Up Notifications:** Configure email/SMS for P1/P2 alerts
5. **Create Dashboards:** Build operational dashboards using the new APIs

---

## Security Considerations

⚠️ **Important Notes:**

1. **Do NOT commit secrets** - All test endpoints use synthetic data only
2. **Production Deployment** - Disable test endpoints in production:
   ```typescript
   if (process.env.NODE_ENV === 'production') {
     // Skip test endpoint registration
   }
   ```
3. **Rate Limiting** - Test endpoints should be rate-limited to prevent abuse
4. **Audit Logging** - All security operations are logged to audit trail
5. **RBAC** - Ensure only authorized users can access security endpoints

---

## Success Metrics

✅ **Fix Verified When:**

1. Security Posture page shows live score (not "unavailable")
2. At least 5 collectors report "active" status
3. Test alert appears in Command Center within 1 second
4. SSE connection streams events without errors
5. Server logs show "Security services initialized" on startup
6. API health check returns `"status": "healthy"`

---

## Support

**If issues persist:**

1. Check server logs: `logs/server.log`
2. Verify database connectivity (MongoDB required)
3. Confirm environment variables are set
4. Review firewall/proxy settings for SSE
5. Contact: DevOps team or file issue on GitHub

**Related Documentation:**
- `src/security/README.md` - Security services architecture
- `src/security/DEPLOYMENT_GUIDE.md` - Production deployment
- `ACTIVITY_MONITORING_TEST_GUIDE.md` - Alert testing procedures

---

**Fix Applied:** 2026-08-09  
**Verification Status:** Ready for testing  
**Estimated Test Time:** 15 minutes
