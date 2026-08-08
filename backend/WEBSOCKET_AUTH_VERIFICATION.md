# WebSocket Authentication Verification Checklist

## Pre-Deployment Verification

Use this checklist to verify the WebSocket authentication security implementation is correctly deployed and configured.

## 1. Configuration Verification

### 1.1 Environment Variables

```bash
# Check JWT_SECRET is configured (REQUIRED)
echo $JWT_SECRET  # Should NOT be empty or default value

# Verify it's not the development default
if [ "$JWT_SECRET" = "development-jwt-secret-change-me-in-production" ]; then
  echo "ERROR: Using development JWT secret in production!"
  exit 1
fi
```

**Checklist:**
- [ ] `JWT_SECRET` is set and non-empty
- [ ] `JWT_SECRET` is NOT the default development value
- [ ] `JWT_SECRET` is at least 64 characters (256 bits recommended)
- [ ] `FEDERATION_JWT_SECRET` is set (if using federation)
- [ ] `JWT_ISSUER` is set (default: sentinel-grid)
- [ ] `JWT_AUDIENCE` is set (default: sentinel-grid-api)
- [ ] `ALLOWED_ORIGINS` includes only trusted domains

### 1.2 Generate Secure Secret

```bash
# Generate a cryptographically secure JWT secret
openssl rand -hex 64

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 2. Database Verification

### 2.1 Check Tables Exist

```sql
-- Verify required tables exist
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'user_branch_assignments'
);

SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'global_user_sessions'
);
```

**Checklist:**
- [ ] `user_branch_assignments` table exists
- [ ] `global_user_sessions` table exists
- [ ] `users` table has `status` column
- [ ] `branches` table has `region` and `status` columns

### 2.2 Check Indexes

```sql
-- Verify critical indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('user_branch_assignments', 'global_user_sessions')
ORDER BY tablename, indexname;
```

**Expected indexes:**
- [ ] `idx_user_branch_assignments_user_id`
- [ ] `idx_user_branch_assignments_branch_id`
- [ ] `idx_global_user_sessions_id`
- [ ] `idx_global_user_sessions_user`
- [ ] `idx_global_user_sessions_expires`

### 2.3 Sample Data Verification

```sql
-- Check if user has branch assignments
SELECT 
  u.username,
  u.role,
  COUNT(uba.branch_id) as branch_count
FROM users u
LEFT JOIN user_branch_assignments uba ON uba.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id, u.username, u.role;

-- Check active sessions
SELECT 
  COUNT(*) as active_sessions,
  COUNT(DISTINCT global_user_id) as unique_users
FROM global_user_sessions
WHERE revoked_at IS NULL 
  AND expires_at > now();
```

## 3. Code Verification

### 3.1 WebSocket Manager Initialization

```typescript
// Verify WebSocketManager is initialized with JWT secret
const wsManager = new WebSocketManager(
  httpServer,
  pool,
  process.env.JWT_SECRET  // ✅ Must be present
);

// ❌ This will throw an error if JWT_SECRET is missing
```

**Checklist:**
- [ ] WebSocketManager constructor receives `jwtSecret` parameter
- [ ] Constructor throws error if `jwtSecret` is empty
- [ ] Logger is properly imported and used

### 3.2 Import Verification

```typescript
// Check required imports in websocket-manager.service.ts
import { verify } from 'jsonwebtoken';  // ✅ Required
import { logger } from '../utils/logger';  // ✅ Required
```

**Checklist:**
- [ ] `jsonwebtoken` package is imported
- [ ] `logger` utility is imported
- [ ] No console.log statements remain (should use logger)

## 4. Functional Testing

### 4.1 Connection Without Token (Should Fail)

```typescript
// Test: Connection without token
const socket = io('http://localhost:3000', {
  auth: {}
});

socket.on('connect_error', (error) => {
  console.log('✅ Correctly rejected:', error.message);
  // Expected: "Authentication token required"
});
```

**Checklist:**
- [ ] Connection without token is rejected
- [ ] Error message is "Authentication token required"
- [ ] Connection failure is logged

### 4.2 Connection With Invalid Token (Should Fail)

```typescript
// Test: Connection with invalid token
const socket = io('http://localhost:3000', {
  auth: {
    token: 'invalid-token'
  }
});

socket.on('connect_error', (error) => {
  console.log('✅ Correctly rejected:', error.message);
  // Expected: "Invalid or expired authentication token"
});
```

**Checklist:**
- [ ] Invalid token is rejected
- [ ] Error message indicates invalid token
- [ ] Rejection is logged with context

### 4.3 Connection With Valid Token (Should Succeed)

```typescript
// Test: Connection with valid token
import { sign } from 'jsonwebtoken';

const token = sign(
  {
    userId: 'test-user-id',
    tenantId: 'test-tenant-id',
    username: 'testuser',
    email: 'test@example.com',
    role: 'operator',
    iss: 'sentinel-grid',
    aud: 'sentinel-grid-api',
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  process.env.JWT_SECRET
);

const socket = io('http://localhost:3000', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('✅ Connection successful');
});
```

**Checklist:**
- [ ] Valid token allows connection
- [ ] `connected` event is emitted
- [ ] Connection is logged with user context

### 4.4 Channel Subscription Tests

```typescript
// Test: Operator tries to access admin channel (Should Fail)
socket.emit('subscribe', ['global-dashboard']);

socket.on('subscribed', (data) => {
  console.log('Subscribed channels:', data.channels);
  // Should NOT include 'global-dashboard' for operator role
});

// Test: Operator accesses allowed channel (Should Succeed)
socket.emit('subscribe', ['cameras']);

socket.on('subscribed', (data) => {
  console.log('Subscribed channels:', data.channels);
  // Should include 'cameras' for operator role
});
```

**Checklist:**
- [ ] Role-based channel restrictions are enforced
- [ ] Denied subscriptions are logged
- [ ] Allowed subscriptions succeed
- [ ] Client receives only allowed channels in response

### 4.5 Branch-Specific Channel Test

```typescript
// Test: User tries to access unassigned branch (Should Fail)
socket.emit('subscribe', ['branch:unauthorized-branch-id']);

socket.on('subscribed', (data) => {
  // Should NOT include unauthorized branch
  console.log('Subscribed channels:', data.channels);
});
```

**Checklist:**
- [ ] Users can only access assigned branches
- [ ] Global admins can access all branches
- [ ] Unauthorized branch access is denied and logged

## 5. Security Audit

### 5.1 Code Review Checklist

- [ ] No hardcoded credentials or tokens
- [ ] No `console.log` statements (use logger instead)
- [ ] No TODO comments related to authentication
- [ ] All permission checks validate against database
- [ ] Channel names are never trusted from client
- [ ] Failed auth attempts are logged
- [ ] JWT validation uses only HMAC algorithms

### 5.2 Configuration Security

```bash
# Check file permissions on .env (should not be world-readable)
ls -la .env

# Should be: -rw------- (600) or -rw-r----- (640)
```

**Checklist:**
- [ ] `.env` file has restricted permissions (not world-readable)
- [ ] `.env` is in `.gitignore`
- [ ] Secrets are not committed to version control
- [ ] Production uses different secrets than development

### 5.3 Network Security

**Checklist:**
- [ ] WebSocket connections use TLS/SSL in production (wss://)
- [ ] CORS origins are restricted to known domains
- [ ] Rate limiting is configured
- [ ] Firewall rules restrict WebSocket port access

## 6. Monitoring Setup

### 6.1 Log Monitoring

```bash
# Monitor authentication failures
tail -f logs/app.log | grep "WebSocket connection attempt with invalid token"

# Monitor channel denials
tail -f logs/app.log | grep "Channel subscription denied"

# Monitor successful connections
tail -f logs/app.log | grep "WebSocket authentication successful"
```

**Checklist:**
- [ ] Log aggregation is configured (e.g., CloudWatch, ELK)
- [ ] Alerts set up for repeated auth failures
- [ ] Dashboard shows WebSocket connection metrics
- [ ] Audit logs are retained per compliance requirements

### 6.2 Metrics to Track

**Key Metrics:**
- [ ] WebSocket connections per minute
- [ ] Authentication failure rate
- [ ] Channel subscription denial rate
- [ ] Active connections by tenant
- [ ] Average connection duration
- [ ] Token expiry events

### 6.3 Alerting Rules

**Configure alerts for:**
- [ ] Authentication failure rate > 10% for 5 minutes
- [ ] Repeated failures from same IP (> 5 in 1 minute)
- [ ] Zero active WebSocket connections (service down)
- [ ] Unusual connection spike (> 2x normal)
- [ ] Channel denial rate spike

## 7. Performance Verification

### 7.1 Database Query Performance

```sql
-- Check user permission query performance
EXPLAIN ANALYZE
SELECT DISTINCT b.id::text as branch_id
FROM branches b
INNER JOIN user_branch_assignments uba ON uba.branch_id = b.id
WHERE uba.user_id = 'test-user-id'::uuid
  AND b.tenant_id = 'test-tenant-id'::uuid
  AND b.status = 'active';

-- Should use indexes and complete in < 10ms
```

**Checklist:**
- [ ] User permission query uses indexes
- [ ] Query completes in < 10ms
- [ ] Session validation query uses indexes
- [ ] No sequential scans on large tables

### 7.2 Load Testing

```bash
# Test concurrent WebSocket connections
# Use a load testing tool to simulate 100+ concurrent connections
```

**Checklist:**
- [ ] System handles expected concurrent connection load
- [ ] Authentication latency < 100ms at peak load
- [ ] No connection drops under load
- [ ] Database connection pool is appropriately sized

## 8. Disaster Recovery

### 8.1 JWT Secret Rotation Plan

**Checklist:**
- [ ] Documented procedure for rotating JWT_SECRET
- [ ] Grace period strategy for old token acceptance
- [ ] Notification plan for connected clients
- [ ] Rollback procedure if issues occur

### 8.2 Backup Verification

**Checklist:**
- [ ] Database backups include auth tables
- [ ] Backup includes environment variables
- [ ] Restore procedure documented
- [ ] Restore tested recently

## 9. Compliance

### 9.1 Audit Log Requirements

**Checklist:**
- [ ] All authentication attempts logged (success/failure)
- [ ] User identity captured in logs
- [ ] Timestamp and IP address recorded
- [ ] Channel access attempts logged
- [ ] Logs retained per compliance requirements (e.g., 90 days)

### 9.2 Security Documentation

**Checklist:**
- [ ] Authentication flow documented
- [ ] Permission model documented
- [ ] Security controls documented
- [ ] Incident response plan includes WebSocket security

## 10. Sign-Off

**Deployment Approved By:**

- [ ] Security Team: _________________ Date: _______
- [ ] DevOps Team: __________________ Date: _______
- [ ] Engineering Lead: _____________ Date: _______

**Production Deployment Date:** _________________

**Post-Deployment Verification Completed:** [ ] Yes [ ] No

**Issues Identified:** _________________________________

**Resolution Plan:** _________________________________

---

## Quick Verification Commands

```bash
# 1. Check JWT secret is configured
[ -z "$JWT_SECRET" ] && echo "❌ JWT_SECRET not set" || echo "✅ JWT_SECRET configured"

# 2. Check dependencies installed
npm list jsonwebtoken || echo "❌ jsonwebtoken not installed"

# 3. Check migration applied
psql -d sentinel_grid -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_branch_assignments');"

# 4. Check WebSocket server running
curl -I http://localhost:3000 || echo "❌ Server not responding"

# 5. Check logs for errors
tail -100 logs/app.log | grep -i error

# 6. Test WebSocket connection
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:3000', {
  auth: {}
});
socket.on('connect_error', (err) => {
  console.log('✅ Auth protection working:', err.message);
  process.exit(0);
});
setTimeout(() => process.exit(1), 5000);
"
```

## Final Checklist Summary

- [ ] All environment variables configured
- [ ] Database migration applied successfully
- [ ] Dependencies installed (jsonwebtoken)
- [ ] Code changes deployed
- [ ] Tests passing
- [ ] Security audit completed
- [ ] Monitoring configured
- [ ] Documentation updated
- [ ] Team trained on new requirements
- [ ] Production deployment approved

**Status:** [ ] Ready for Production [ ] Requires Remediation

**Notes:** _________________________________________________
