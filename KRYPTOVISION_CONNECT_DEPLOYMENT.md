# KryptoVision Connect - Deployment Guide

Complete deployment and configuration guide for the KryptoVision Connect branch-VMS communication subsystem.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Migration](#database-migration)
4. [TURN Server Setup](#turn-server-setup)
5. [Application Integration](#application-integration)
6. [Push Notification Configuration](#push-notification-configuration)
7. [Deployment Verification](#deployment-verification)
8. [Operational Procedures](#operational-procedures)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Troubleshooting](#troubleshooting)
11. [Security Checklist](#security-checklist)

---

## Prerequisites

### Infrastructure Requirements

**Database:**
- PostgreSQL 15+
- Minimum: 10GB storage for communication tables
- Recommended indexes created automatically by migration

**Redis:**
- Redis 7+ with persistence enabled
- Used for: Presence tracking, call state coordination, first-answer-wins locks
- Recommended: Redis Cluster or Sentinel for HA

**WebRTC Infrastructure:**
- TURN server (coturn recommended)
- Public IP address with ports 3478 (STUN/TURN) and 49152-65535 (media)
- TLS certificates for secure TURN

**Application:**
- Node.js 18+
- Existing KryptoVision VMS deployment
- Socket.IO for WebSocket signaling

---

## Environment Variables

### Required Communication Variables

Add these to your `.env` or environment configuration:

```bash
# ============================================================================
# COMMUNICATION SUBSYSTEM CONFIGURATION
# ============================================================================

# WebRTC / TURN Configuration
COMM_TURN_SERVER_URL=turn:turn.yourdomain.com:3478
COMM_TURN_USERNAME=kryptovision-turn-user
COMM_TURN_CREDENTIAL=secure-turn-password-change-me

# Media Provider (default: self-hosted)
COMM_MEDIA_PROVIDER=self-hosted

# Device Token Configuration
COMM_DEVICE_TOKEN_EXPIRY=3600          # Access token: 1 hour (seconds)
COMM_DEVICE_REFRESH_EXPIRY=2592000    # Refresh token: 30 days (seconds)

# Presence Configuration
COMM_PRESENCE_TTL=300                  # Device presence TTL: 5 minutes (seconds)
COMM_PRESENCE_HEARTBEAT=60             # Heartbeat interval: 1 minute (seconds)

# Call Configuration
COMM_CALL_RING_TIMEOUT=45              # Ring timeout: 45 seconds
COMM_CALL_MAX_DURATION=3600            # Max call duration: 1 hour (seconds)

# Message Configuration
COMM_MESSAGE_MAX_LENGTH=4000           # Max message body length (characters)
COMM_MESSAGE_BATCH_SIZE=100            # Pagination batch size

# Redis Key Prefixes (optional, defaults shown)
COMM_REDIS_PREFIX=comm                 # Redis key prefix

# Feature Flags (optional)
COMM_ENABLE_CALL_RECORDING=false       # Call recording disabled by default
COMM_ENABLE_MESSAGE_ATTACHMENTS=false  # Attachments disabled initially
COMM_REQUIRE_DEVICE_APPROVAL=true      # Require admin approval for devices
```

### Optional Advanced Configuration

```bash
# Media Session Configuration
COMM_MEDIA_SESSION_TTL=7200            # Media session TTL: 2 hours
COMM_PARTICIPANT_TOKEN_TTL=3600        # Participant token TTL: 1 hour

# Rate Limiting
COMM_ENROLLMENT_RATE_LIMIT=10          # Max enrollments per hour per branch
COMM_MESSAGE_RATE_LIMIT=100            # Max messages per minute per device

# Monitoring
COMM_METRICS_ENABLED=true              # Enable Prometheus metrics
COMM_AUDIT_ENABLED=true                # Enable audit logging

# TURN Server Alternatives (if using managed service)
# COMM_TURN_SERVER_URL=turn:numb.viagenie.ca:3478
# COMM_TURN_USERNAME=managed-service-user
# COMM_TURN_CREDENTIAL=managed-service-credential
```

---

## Database Migration

### Step 1: Backup Existing Database

```bash
# Create backup before migration
pg_dump -h localhost -U postgres vms_production > backup_pre_comm_$(date +%Y%m%d).sql
```

### Step 2: Review Migration

```bash
# Review migration file
cat database/migrations/200_communication_subsystem.sql
```

The migration creates:
- 9 new tables (`communication_*` prefix)
- 12 custom enum types
- 20+ indexes for performance
- 3 triggers for automated updates
- Foreign key constraints for referential integrity

### Step 3: Run Migration

**Development:**
```bash
psql -h localhost -U postgres -d vms_dev -f database/migrations/200_communication_subsystem.sql
```

**Production:**
```bash
# Run in transaction for safety
psql -h prod-db.internal -U vms_admin -d vms_production << 'EOF'
BEGIN;
\i database/migrations/200_communication_subsystem.sql
-- Verify tables created
\dt communication_*
-- Verify no errors, then commit
COMMIT;
EOF
```

### Step 4: Verify Migration

```sql
-- Verify all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'communication_%'
ORDER BY table_name;

-- Expected tables:
-- communication_call_participants
-- communication_call_sessions
-- communication_conversation_members
-- communication_conversations
-- communication_device_employees
-- communication_devices
-- communication_enrollment_codes
-- communication_message_receipts
-- communication_messages

-- Verify indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename LIKE 'communication_%'
ORDER BY tablename, indexname;

-- Should see 20+ indexes
```

---

## TURN Server Setup

### Option 1: Self-Hosted coturn (Recommended)

#### Install coturn

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install coturn
```

**CentOS/RHEL:**
```bash
sudo yum install coturn
```

#### Configure coturn

Edit `/etc/turnserver.conf`:

```ini
# Listening IP and ports
listening-ip=0.0.0.0
listening-port=3478
tls-listening-port=5349

# External IP (your public IP)
external-ip=YOUR_PUBLIC_IP/YOUR_PRIVATE_IP

# Realm
realm=turn.yourdomain.com

# Authentication
lt-cred-mech
user=kryptovision-turn-user:secure-turn-password-change-me

# Relay IP (usually same as listening IP)
relay-ip=YOUR_PRIVATE_IP

# Port range for media
min-port=49152
max-port=65535

# TLS certificates (for secure TURN)
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem

# Logging
log-file=/var/log/turnserver.log
verbose

# Security
no-multicast-peers
no-cli
fingerprint
```

#### Start coturn

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

#### Firewall Rules

```bash
# TURN/STUN ports
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp

# Media relay ports
sudo ufw allow 49152:65535/udp
```

#### Test TURN Server

```bash
# Test STUN
turnutils_stunclient turn.yourdomain.com 3478

# Test TURN
turnutils_uclient -u kryptovision-turn-user -w secure-turn-password-change-me turn.yourdomain.com 3478
```

### Option 2: Managed TURN Service

If using a managed service (Twilio, numb.viagenie.ca, etc.):

```bash
COMM_TURN_SERVER_URL=turn:global.turn.twilio.com:3478?transport=udp
COMM_TURN_USERNAME=your-twilio-username
COMM_TURN_CREDENTIAL=your-twilio-credential
```

---

## Application Integration

### Step 1: Register Communication Routes

Edit `src/app.ts`:

```typescript
import { registerCommunicationsRoutes } from './communications/routes/communications.routes.js';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = fastify({ logger: pino(loggerConfig) });
  
  // ... existing middleware and routes ...
  
  // Register communication routes
  await registerCommunicationsRoutes(app, store);
  
  // ... rest of app setup ...
  
  return app;
}
```

### Step 2: Verify Socket.IO Integration

Ensure Socket.IO is attached to the app instance:

```typescript
// In src/app.ts or wherever Socket.IO is initialized
import { Server as SocketIOServer } from 'socket.io';

const io = new SocketIOServer(server, {
  cors: { origin: process.env.CORS_ORIGIN },
  transports: ['websocket', 'polling'],
});

// Attach to app for communications routes
(app as any).io = io;
```

### Step 3: Environment Validation

Add validation for required environment variables:

```typescript
// In src/bootstrap/environment.ts or similar
const requiredCommVars = [
  'COMM_TURN_SERVER_URL',
  'COMM_TURN_USERNAME',
  'COMM_TURN_CREDENTIAL',
];

for (const varName of requiredCommVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

### Step 4: Build and Deploy

```bash
# Install dependencies (if any new ones)
npm install

# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm run test:communications

# Start application
npm start
```

---

## Push Notification Configuration

### Android (Firebase Cloud Messaging)

1. **Create Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create project or use existing
   - Add Android app
   - Download `google-services.json`

2. **Configure Server:**
   ```bash
   COMM_PUSH_ANDROID_ENABLED=true
   COMM_FCM_SERVER_KEY=your-fcm-server-key
   ```

3. **Client Integration:**
   - Add `google-services.json` to Android app
   - Register device token on enrollment
   - Handle incoming call notifications

### iOS (Apple Push Notification Service)

1. **Generate APNs Certificate:**
   - Apple Developer Console → Certificates
   - Create APNs certificate
   - Download `.p12` file

2. **Configure Server:**
   ```bash
   COMM_PUSH_IOS_ENABLED=true
   COMM_APNS_KEY_ID=your-key-id
   COMM_APNS_TEAM_ID=your-team-id
   COMM_APNS_BUNDLE_ID=com.yourdomain.kryptovision.connect
   ```

3. **Client Integration:**
   - Request notification permissions
   - Register device token
   - Implement PushKit for VoIP notifications

---

## Deployment Verification

### 1. Health Check

```bash
# Check API health
curl http://localhost:8080/health

# Check Prometheus metrics
curl http://localhost:8080/metrics | grep comm_

# Check communication telemetry
curl http://localhost:8080/api/vms/observability/communications/summary
```

Expected response:
```json
{
  "success": true,
  "data": {
    "devices": { "online": 0, "total": 0 },
    "branches": { "online": 0 },
    "employees": { "online": 0 },
    "calls": { "active": 0, "started": 0, "connected": 0, "failed": 0 },
    "messages": { "sent": 0, "delivered": 0, "read": 0 },
    "timestamp": "2024-01-15T10:00:00.000Z"
  }
}
```

### 2. Database Verification

```sql
-- Verify tables exist and are empty (before first use)
SELECT 
  'communication_devices' as table_name, COUNT(*) as row_count 
FROM communication_devices
UNION ALL
SELECT 'communication_enrollment_codes', COUNT(*) FROM communication_enrollment_codes
UNION ALL
SELECT 'communication_call_sessions', COUNT(*) FROM communication_call_sessions
UNION ALL
SELECT 'communication_messages', COUNT(*) FROM communication_messages;

-- Verify indexes
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename LIKE 'communication_%'
ORDER BY tablename, indexname;
```

### 3. Redis Verification

```bash
# Connect to Redis
redis-cli

# Check for communication keys (should be empty initially)
KEYS comm:*

# Should return (empty list) or [] before first use
```

### 4. TURN Server Verification

```bash
# Test TURN connectivity from application server
npm install -g coturn-test

coturn-test \
  --turnServer=$COMM_TURN_SERVER_URL \
  --turnUsername=$COMM_TURN_USERNAME \
  --turnPassword=$COMM_TURN_CREDENTIAL
```

### 5. End-to-End Test

```bash
# Generate enrollment code (as admin via UI or API)
curl -X POST http://localhost:8080/v1/communications/enrollment-codes \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "test-branch-id",
    "expiresInMinutes": 30,
    "maxUses": 1
  }'

# Response should include enrollment code
# Use code in device registration flow
```

---

## Operational Procedures

### Creating Enrollment Codes

**Via VMS Dashboard:**
1. Navigate to Communications → Device Management
2. Select branch
3. Click "Generate Enrollment Code"
4. Configure device type and expiration
5. Share code with branch staff

**Via API:**
```bash
curl -X POST $VMS_API_URL/v1/communications/enrollment-codes \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "branchId": "branch-uuid",
    "expiresInMinutes": 30,
    "maxUses": 1,
    "allowedDeviceType": "BRANCH_SHARED"
  }'
```

### Device Approval Workflow

```bash
# List pending devices
curl $VMS_API_URL/v1/communications/devices?status=PENDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Approve device
curl -X POST $VMS_API_URL/v1/communications/devices/$DEVICE_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Device Revocation

```bash
# Revoke lost/stolen device
curl -X POST $VMS_API_URL/v1/communications/devices/$DEVICE_ID/revoke \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Device lost or stolen"}'
```

### Linking Employees

```bash
# Link employee to device
curl -X POST $VMS_API_URL/v1/communications/devices/$DEVICE_ID/employees \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "employeeId": "employee-uuid",
    "isPrimary": true,
    "canReceiveCalls": true,
    "canMakeCalls": true
  }'
```

---

## Monitoring & Alerting

### Prometheus Metrics

**Key Metrics to Monitor:**
- `comm_devices_online` - Online device count
- `comm_calls_active` - Active call sessions
- `comm_calls_started_total` - Total calls initiated
- `comm_calls_connected_total` - Successful call connections
- `comm_calls_failed_total` - Failed calls (alert threshold)
- `comm_messages_sent_total` - Message throughput
- `comm_call_rtt_ms` - WebRTC round-trip time (quality)

### Grafana Dashboard

Import dashboard JSON (create as needed):
```json
{
  "dashboard": {
    "title": "KryptoVision Connect - Communication Health",
    "panels": [
      {
        "title": "Active Calls",
        "targets": [{ "expr": "comm_calls_active" }]
      },
      {
        "title": "Call Success Rate",
        "targets": [{
          "expr": "rate(comm_calls_connected_total[5m]) / rate(comm_calls_started_total[5m])"
        }]
      },
      {
        "title": "Devices Online by Branch",
        "targets": [{ "expr": "comm_devices_online" }]
      }
    ]
  }
}
```

### Alerting Rules

**Prometheus AlertManager:**

```yaml
groups:
  - name: kryptovision_connect
    interval: 30s
    rules:
      - alert: HighCallFailureRate
        expr: rate(comm_calls_failed_total[5m]) / rate(comm_calls_started_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High call failure rate detected"
          description: "{{ $labels.tenant_id }} has {{ $value | humanizePercentage }} call failure rate"
      
      - alert: AllBranchDevicesOffline
        expr: comm_devices_online{branch_id=~".+"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "All devices offline for branch"
          description: "Branch {{ $labels.branch_id }} has no online devices"
      
      - alert: PoorCallQuality
        expr: comm_call_quality_status >= 3
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Poor call quality detected"
          description: "Call {{ $labels.call_id }} has POOR quality"
      
      - alert: HighMessageLatency
        expr: histogram_quantile(0.95, rate(comm_message_delivery_latency_ms_bucket[5m])) > 5000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High message delivery latency"
          description: "P95 latency is {{ $value }}ms"
```

### Log Monitoring

**Search for errors:**
```bash
# Check application logs for communication errors
tail -f /var/log/vms/app.log | grep -i "comm\|communication"

# Check for device authentication failures
tail -f /var/log/vms/app.log | grep "device_credential_required\|invalid_or_revoked_device"

# Check for call failures
tail -f /var/log/vms/app.log | grep "call_failed\|call_already_accepted"
```

---

## Troubleshooting

### Issue: Devices Cannot Enroll

**Symptoms:**
- Enrollment code validation fails
- "Enrollment code expired" error

**Solutions:**
```bash
# Check enrollment code in database
SELECT * FROM communication_enrollment_codes 
WHERE code = 'YOUR-CODE-HERE';

# Verify not expired
SELECT * FROM communication_enrollment_codes 
WHERE code = 'YOUR-CODE' AND expires_at > NOW();

# Check if already used
SELECT * FROM communication_enrollment_codes 
WHERE code = 'YOUR-CODE' AND used_at IS NOT NULL;
```

### Issue: Calls Not Connecting

**Symptoms:**
- Call stays in RINGING state
- "No online devices" error

**Solutions:**
```bash
# Check device presence in Redis
redis-cli
KEYS comm:presence:device:*

# Check if devices are online
curl $VMS_API_URL/v1/communications/presence/branch/$BRANCH_ID

# Verify TURN server connectivity
turnutils_uclient -u $COMM_TURN_USERNAME -w $COMM_TURN_CREDENTIAL $COMM_TURN_SERVER_URL
```

### Issue: Messages Not Delivered

**Symptoms:**
- Messages sent but not delivered
- Undelivered count increasing

**Solutions:**
```sql
-- Check undelivered messages
SELECT m.id, m.body, m.created_at, r.device_id, r.delivered_at
FROM communication_messages m
JOIN communication_message_receipts r ON m.id = r.message_id
WHERE r.delivered_at IS NULL
ORDER BY m.created_at DESC
LIMIT 10;

-- Check device online status
SELECT id, device_name, status, last_seen_at
FROM communication_devices
WHERE branch_id = 'branch-uuid'
ORDER BY last_seen_at DESC;
```

### Issue: First-Answer-Wins Race Condition

**Symptoms:**
- Multiple devices report accepting same call
- Call state inconsistent

**Solutions:**
```bash
# Check Redis locks
redis-cli
KEYS comm:call:*:answer-lock

# Verify call state
redis-cli GET comm:call:$TENANT_ID:$CALL_ID:state

# Check PostgreSQL state
SELECT id, status, answered_device_id, answered_at
FROM communication_call_sessions
WHERE id = 'call-id';
```

### Issue: High Memory Usage (Redis)

**Symptoms:**
- Redis memory growing
- Presence keys not expiring

**Solutions:**
```bash
# Check Redis memory usage
redis-cli INFO memory

# Check key count
redis-cli DBSIZE

# Find keys without TTL
redis-cli --scan --pattern "comm:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" = "-1" ]; then
    echo "No TTL: $key"
  fi
done

# Manually cleanup stale keys
redis-cli KEYS "comm:presence:*" | xargs redis-cli DEL
```

---

## Security Checklist

### Pre-Deployment

- [ ] Change all default passwords (TURN, database)
- [ ] Use strong encryption for TURN credentials
- [ ] Enable TLS for TURN server (port 5349)
- [ ] Restrict database access to application servers only
- [ ] Enable Redis password authentication
- [ ] Configure firewall rules (allow only necessary ports)
- [ ] Use environment variables (never hardcode secrets)
- [ ] Enable audit logging
- [ ] Review and restrict API permissions
- [ ] Test cross-tenant isolation

### Post-Deployment

- [ ] Verify device authentication works
- [ ] Test device revocation blocks access
- [ ] Confirm audit events are logged
- [ ] Check Prometheus metrics are collected
- [ ] Verify TURN server is not open relay
- [ ] Test enrollment code expiration
- [ ] Confirm message body is not logged
- [ ] Verify tenant isolation in queries
- [ ] Test expired credential rejection
- [ ] Validate WebRTC media encryption (DTLS-SRTP)

### Ongoing

- [ ] Rotate TURN credentials quarterly
- [ ] Review audit logs monthly
- [ ] Update enrollment code patterns if leaked
- [ ] Monitor for unusual device enrollment patterns
- [ ] Review device approvals before activation
- [ ] Check for stale/inactive devices
- [ ] Audit employee-device linkages
- [ ] Review call failure rates
- [ ] Monitor for suspicious cross-tenant attempts

---

## Production Deployment Checklist

### Before Deployment

- [ ] All tests passing (`npm run test:communications`)
- [ ] Database migration tested on staging
- [ ] TURN server configured and tested
- [ ] Environment variables set
- [ ] Backup database before migration
- [ ] Review security checklist
- [ ] Monitoring and alerting configured
- [ ] Documentation reviewed by operations team

### During Deployment

- [ ] Run database migration in transaction
- [ ] Verify migration successful
- [ ] Deploy application code
- [ ] Restart application services
- [ ] Verify health checks pass
- [ ] Check Prometheus metrics endpoint
- [ ] Test device enrollment end-to-end
- [ ] Verify WebSocket connectivity

### After Deployment

- [ ] Monitor logs for errors
- [ ] Check call success rate
- [ ] Verify message delivery
- [ ] Test device revocation
- [ ] Confirm audit events logging
- [ ] Review Grafana dashboards
- [ ] Document any issues encountered
- [ ] Update runbook if needed

---

## Rollback Procedure

If deployment fails:

### Step 1: Stop Application

```bash
sudo systemctl stop vms-app
```

### Step 2: Rollback Database (if needed)

```bash
# Restore from backup
psql -h localhost -U postgres -d vms_production < backup_pre_comm_YYYYMMDD.sql
```

**Alternative: Drop communication tables only**

```sql
BEGIN;
DROP TABLE IF EXISTS communication_message_receipts CASCADE;
DROP TABLE IF EXISTS communication_messages CASCADE;
DROP TABLE IF EXISTS communication_conversation_members CASCADE;
DROP TABLE IF EXISTS communication_conversations CASCADE;
DROP TABLE IF EXISTS communication_call_participants CASCADE;
DROP TABLE IF EXISTS communication_call_sessions CASCADE;
DROP TABLE IF EXISTS communication_device_employees CASCADE;
DROP TABLE IF EXISTS communication_devices CASCADE;
DROP TABLE IF EXISTS communication_enrollment_codes CASCADE;
-- Drop enum types
DROP TYPE IF EXISTS comm_device_type CASCADE;
DROP TYPE IF EXISTS comm_device_status CASCADE;
DROP TYPE IF EXISTS comm_platform CASCADE;
-- ... (all enum types)
COMMIT;
```

### Step 3: Deploy Previous Version

```bash
git checkout previous-stable-tag
npm install
npm run build
sudo systemctl start vms-app
```

### Step 4: Verify Rollback

```bash
curl http://localhost:8080/health
```

---

## Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Check call success rate
- Monitor device online counts
- Review critical alerts

**Weekly:**
- Review pending device approvals
- Check for stale enrollment codes
- Analyze call quality metrics
- Review audit logs for anomalies

**Monthly:**
- Rotate TURN credentials
- Clean up revoked devices (archive old records)
- Review and optimize database indexes
- Update TURN server TLS certificates (if needed)
- Capacity planning review

### Performance Tuning

**PostgreSQL:**
```sql
-- Add additional indexes if queries are slow
CREATE INDEX CONCURRENTLY idx_call_sessions_branch_recent
ON communication_call_sessions(tenant_id, source_branch_id, created_at DESC)
WHERE created_at > NOW() - INTERVAL '30 days';

-- Vacuum tables periodically
VACUUM ANALYZE communication_messages;
VACUUM ANALYZE communication_call_sessions;
```

**Redis:**
```bash
# Monitor Redis performance
redis-cli --latency

# Check slow log
redis-cli SLOWLOG GET 10
```

---

## File Manifest

All new/modified files for this deployment:

### Database
- `database/migrations/200_communication_subsystem.sql` - NEW

### Source Code
- `src/communications/domain/types.ts` - NEW
- `src/communications/domain/constants.ts` - NEW
- `src/communications/services/device-enrollment.service.ts` - NEW
- `src/communications/services/device-credential.service.ts` - NEW
- `src/communications/services/presence.service.ts` - NEW
- `src/communications/services/call-state-machine.service.ts` - NEW
- `src/communications/services/call.service.ts` - NEW
- `src/communications/services/messaging.service.ts` - NEW
- `src/communications/services/communication-telemetry.service.ts` - NEW
- `src/communications/services/communication-audit.service.ts` - NEW
- `src/communications/services/index.ts` - NEW
- `src/communications/gateways/signaling.gateway.ts` - NEW
- `src/communications/providers/voice-media.provider.ts` - NEW
- `src/communications/routes/communications.routes.ts` - NEW
- `src/observability/observability.routes.ts` - MODIFIED

### Tests
- `test/communications/device-enrollment.test.ts` - NEW
- `test/communications/call-first-answer-wins.test.ts` - NEW
- `test/communications/messaging-offline.test.ts` - NEW
- `test/communications/security-isolation.test.ts` - NEW
- `test/communications/README.md` - NEW

### Documentation
- `KRYPTOVISION_CONNECT_REQUIREMENTS.md` - NEW
- `KRYPTOVISION_CONNECT_DESIGN.md` - NEW
- `KRYPTOVISION_CONNECT_TELEMETRY.md` - NEW
- `KRYPTOVISION_CONNECT_DEPLOYMENT.md` - NEW (this file)

---

## Contact & Support

For deployment assistance:
- Operations Team: ops@yourdomain.com
- Security Team: security@yourdomain.com
- Development Team: dev@yourdomain.com

---

**End of Deployment Guide**
