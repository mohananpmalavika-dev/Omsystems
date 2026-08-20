# Production Environment Variables - Required Configuration

**⚠️ CRITICAL: All variables marked REQUIRED must be set for production deployment**

This document lists all environment variables that MUST be configured for production.  
The config schema has been hardened to fail-fast if required variables are missing.

---

## 🔴 REQUIRED - No Defaults (Will Fail if Missing)

These variables have NO defaults and MUST be explicitly set:

```bash
# Authentication Mode - MUST be "session" or "oidc" (NOT "development")
AUTH_MODE=session

# Media Gateway Authentication - Minimum 32 characters
MEDIA_GATEWAY_SHARED_KEY=<GENERATE_64_CHAR_HEX>

# Report Download Token Generation - Minimum 32 characters
REPORT_DOWNLOAD_SECRET=<GENERATE_64_CHAR_HEX>
```

---

## 🟡 REQUIRED in Production (Checked by Validation)

These variables are checked by production validation:

```bash
# Environment - MUST be set to "production"
NODE_ENV=production

# JWT Signing Secret - Minimum 64 characters
JWT_SECRET=<GENERATE_64_CHAR_HEX>

# Database Connection
DATABASE_URL=postgresql://user:password@host:port/database

# Public URL for Browser/Mobile Access
CONTROL_PLANE_PUBLIC_URL=https://your-domain.com

# Report Base URL (for email links and downloads)
REPORT_PUBLIC_BASE_URL=https://your-domain.com
```

---

## 🟢 Optional but Recommended

### Redis (Required for distributed deployments)
```bash
REDIS_URL=redis://localhost:6379
```

### Analytics Engine Integration
```bash
ANALYTICS_ENGINE_URL=https://analytics.your-domain.com
ANALYTICS_ENGINE_SHARED_KEY=<GENERATE_64_CHAR_HEX>
ANALYTICS_SOURCE_SHARED_KEY=<GENERATE_64_CHAR_HEX>
```

### Recording Engine Integration
```bash
RECORDING_ENGINE_URL=https://recording.your-domain.com
RECORDING_ENGINE_SHARED_KEY=<GENERATE_64_CHAR_HEX>
```

### Edge Bridge (for managed tunnels)
```bash
EDGE_BRIDGE_SHARED_KEY=<GENERATE_64_CHAR_HEX>
EDGE_MANAGED_TUNNEL_REQUIRED=false  # Set to "true" if using Cloudflare tunnels
```

### Cloudflare Tunnels (Required if EDGE_MANAGED_TUNNEL_REQUIRED=true)
```bash
CLOUDFLARE_ACCOUNT_ID=<32_HEX_CHARS>
CLOUDFLARE_ZONE_ID=<32_HEX_CHARS>
CLOUDFLARE_API_TOKEN=<YOUR_TOKEN>
EDGE_MEDIA_BASE_DOMAIN=cameras.your-domain.com
```

### Report Worker (if using background report generation)
```bash
REPORT_WORKER_SHARED_KEY=<GENERATE_64_CHAR_HEX>
```

### Federation (for multi-region deployments)
```bash
FEDERATION_SHARED_KEY=<GENERATE_64_CHAR_HEX>
FEDERATION_PEER_URLS=https://region2.your-domain.com,https://region3.your-domain.com
```

### Alert Voice/SMS Providers
```bash
# Voice Alerts
ALERT_VOICE_PROVIDER=twilio  # or exotel
ALERT_PUBLIC_BASE_URL=https://your-domain.com
ALERT_VOICE_CALLBACK_SECRET=<GENERATE_64_CHAR_HEX>

# Twilio Configuration
TWILIO_ACCOUNT_SID=<YOUR_SID>
TWILIO_AUTH_TOKEN=<YOUR_TOKEN>
TWILIO_FROM_NUMBER=+1234567890

# SMS Alerts
ALERT_SMS_PROVIDER=msg91  # or textlocal or twilio
MSG91_AUTH_KEY=<YOUR_KEY>

# Email Alerts
ALERT_EMAIL_PROVIDER=ses  # or sendgrid or smtp
ALERT_EMAIL_FROM=alerts@your-domain.com
ALERT_AWS_REGION=us-east-1  # if using SES
```

### Object Storage (for evidence archiving)
```bash
EVIDENCE_ARCHIVE_REQUIRED=true
EVIDENCE_S3_BUCKET=sentinel-evidence
EVIDENCE_S3_REGION=us-east-1
EVIDENCE_S3_ENDPOINT=https://s3.amazonaws.com  # or MinIO/R2 endpoint
EVIDENCE_S3_ACCESS_KEY_ID=<YOUR_KEY>
EVIDENCE_S3_SECRET_ACCESS_KEY=<YOUR_SECRET>
EVIDENCE_S3_ENCRYPTION=AES256
EVIDENCE_S3_OBJECT_LOCK_DAYS=365
```

### Edge Agent Updates
```bash
EDGE_UPDATE_SIGNING_PRIVATE_KEY=<YOUR_PRIVATE_KEY>
EDGE_UPDATE_MANIFEST_URL=https://updates.your-domain.com/manifest.json
```

### Data Encryption at Rest
```bash
ENCRYPTION_ENABLED=true
ENCRYPTION_MASTER_KEY=<GENERATE_64_CHAR_HEX>
```

---

## 🔧 Configuration Settings (Have Sensible Defaults)

```bash
# Server Configuration
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=info

# Database Pool
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_STATEMENT_TIMEOUT_MS=15000
DB_QUERY_TIMEOUT_MS=20000

# Request Handling
MAX_IN_FLIGHT_REQUESTS=500

# Edge Agent Presence
EDGE_PRESENCE_TTL_SECONDS=90

# Report Archiving
REPORT_ARCHIVE_RETENTION_DAYS=365

# Federation Timeouts
FEDERATION_PEER_TIMEOUT_MS=8000
FEDERATION_HEARTBEAT_TTL_SECONDS=90

# Alert Evidence
ALERT_EVIDENCE_CLIP_SECONDS=20
ALERT_EVIDENCE_MAX_CONCURRENT=4

# Dashboard Mode
DASHBOARD_DEMO_MODE=false

# Digital Twin Assets
DIGITAL_TWIN_ASSET_ROOT=/app/digital-twin-assets  # Use persistent volume in production
```

---

## 🛠️ How to Generate Secure Secrets

### Generate 64-character hex key (recommended for all secrets):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Generate 128-character hex key (for extra security):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Generate base64-encoded key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## ✅ Validation Checklist

Before deploying to production, verify:

- [ ] `NODE_ENV=production` is set
- [ ] `AUTH_MODE` is NOT "development"
- [ ] `MEDIA_GATEWAY_SHARED_KEY` is set and NOT a placeholder
- [ ] `REPORT_DOWNLOAD_SECRET` is set and NOT a placeholder
- [ ] `JWT_SECRET` is set and NOT a placeholder
- [ ] `DATABASE_URL` points to production database
- [ ] `CONTROL_PLANE_PUBLIC_URL` is publicly accessible
- [ ] All secrets are cryptographically secure (64+ characters)
- [ ] No secrets contain "development", "change-me", or "placeholder"
- [ ] All inter-service shared keys are synchronized across services

---

## 🚨 What Happens if Required Variables are Missing?

The application will **FAIL TO START** with a clear error message:

```
ZodError: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["AUTH_MODE"],
    "message": "Required"
  }
]
```

This fail-fast behavior prevents accidental deployment with insecure configuration.

---

## 📝 Docker Secrets Support

All sensitive variables support `_FILE` variants for Docker/Kubernetes secrets:

```bash
# Instead of:
JWT_SECRET=mysecret

# You can use:
JWT_SECRET_FILE=/run/secrets/jwt_secret
```

Supported `_FILE` variants:
- `DATABASE_URL_FILE`
- `REDIS_URL_FILE`
- `MEDIA_GATEWAY_SHARED_KEY_FILE`
- `EDGE_BRIDGE_SHARED_KEY_FILE`
- `RECORDING_ENGINE_SHARED_KEY_FILE`
- `ANALYTICS_ENGINE_SHARED_KEY_FILE`
- `ANALYTICS_SOURCE_SHARED_KEY_FILE`
- `FEDERATION_SHARED_KEY_FILE`
- `REPORT_DOWNLOAD_SECRET_FILE`
- `REPORT_WORKER_SHARED_KEY_FILE`
- `CLOUDFLARE_API_TOKEN_FILE`
- `EDGE_UPDATE_SIGNING_PRIVATE_KEY_FILE`

---

## 🔗 Related Documentation

- `BUG_FIX_SUMMARY.md` - Complete list of bugs fixed
- `.env.example` - Development environment template
- `docs/security/secret-management.md` - Security best practices

---

**Last Updated:** August 18, 2026  
**Version:** 2.0 (Post-Configuration Hardening)
