# Alert Identity Fix - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the alert action identity security fix to production.

## Pre-Deployment Checklist

- [ ] Review all code changes in PR
- [ ] Run full test suite locally
- [ ] Test in staging environment
- [ ] Backup production database
- [ ] Schedule maintenance window (if needed)
- [ ] Notify operations team
- [ ] Prepare rollback plan

## Deployment Steps

### Step 1: Database Migration

**Run the migration to create the `operational_alert_events` table:**

```bash
# For PostgreSQL
psql -U your_db_user -d your_database -f src/database/migrations/015_operational_alert_events.sql

# Verify table was created
psql -U your_db_user -d your_database -c "\d operational_alert_events"
```

**Expected output:**
```sql
Table "public.operational_alert_events"
Column              | Type                        | Modifiers
--------------------+-----------------------------+-----------
id                  | uuid                        | not null default gen_random_uuid()
alert_id            | character varying(200)      | not null
tenant_id           | uuid                        | not null
event_type          | character varying(50)       | not null
actor_type          | character varying(20)       | not null default 'USER'
actor_user_id       | uuid                        |
...
```

**Verify indexes:**
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'operational_alert_events';
```

### Step 2: Implement Store Methods

**Add methods to your database store implementation:**

```typescript
// In your store implementation file (e.g., src/database/control-plane-store-impl.ts)

async recordOperationalAlertEvent(event: {
  id: string | undefined;
  alertId: string;
  tenantId: string;
  branchId?: string;
  eventType: string;
  actorType: string;
  actorUserId?: string;
  actorUserName?: string;
  actorService?: string;
  targetUserId?: string;
  targetUserName?: string;
  previousStatus?: string;
  newStatus?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  createdAt: Date;
}): Promise<void> {
  await this.db.query(
    `INSERT INTO operational_alert_events (
      id, alert_id, tenant_id, branch_id, event_type,
      actor_type, actor_user_id, actor_user_name, actor_service,
      target_user_id, target_user_name,
      previous_status, new_status, metadata,
      request_id, correlation_id, session_id,
      ip_address, user_agent, occurred_at, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )`,
    [
      event.id || undefined, // Let DB generate if not provided
      event.alertId,
      event.tenantId,
      event.branchId || null,
      event.eventType,
      event.actorType,
      event.actorUserId || null,
      event.actorUserName || null,
      event.actorService || null,
      event.targetUserId || null,
      event.targetUserName || null,
      event.previousStatus || null,
      event.newStatus || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.requestId || null,
      event.correlationId || null,
      event.sessionId || null,
      event.ipAddress || null,
      event.userAgent || null,
      event.occurredAt,
      event.createdAt,
    ]
  );
}

async listOperationalAlertEvents(
  alertId: string,
  tenantId: string
): Promise<any[]> {
  const result = await this.db.query(
    `SELECT * FROM operational_alert_events
     WHERE alert_id = $1 AND tenant_id = $2
     ORDER BY occurred_at DESC`,
    [alertId, tenantId]
  );
  return result.rows;
}
```

### Step 3: Deploy Backend Changes

**Build and deploy backend:**

```bash
# Build backend
cd src
npm run build

# Run tests
npm test

# Deploy (adjust for your deployment method)
npm run deploy:production
# OR
docker build -t your-app:latest .
docker push your-app:latest
kubectl apply -f k8s/deployment.yaml
```

**Verify backend deployment:**

```bash
# Check API health
curl https://api.example.com/health

# Test acknowledge endpoint (requires authentication)
curl -X POST https://api.example.com/v1/operations/alerts/test-alert-id/acknowledge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment": "Test acknowledge"}'

# Expected: 200 OK (or 404 if alert doesn't exist)
```

### Step 4: Deploy Frontend Changes

**Build and deploy dashboard:**

```bash
# Build dashboard
cd dashboard
npm run build

# Deploy static assets
npm run deploy
# OR
aws s3 sync out/ s3://your-bucket/dashboard/ --delete
```

**Verify frontend deployment:**

1. Open dashboard in browser
2. Navigate to Operations → Alerts
3. Open browser DevTools Network tab
4. Acknowledge an alert
5. Verify request payload does NOT contain `userId` or `acknowledgedBy`
6. Verify request includes `credentials: 'include'`

### Step 5: Verify Integration

**Test the complete flow:**

```bash
# 1. Acknowledge alert
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/acknowledge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment": "Investigating"}'

# 2. Verify event was recorded
psql -U user -d database -c \
  "SELECT event_type, actor_user_id, actor_user_name, occurred_at 
   FROM operational_alert_events 
   WHERE alert_id = 'alert-123' 
   ORDER BY occurred_at DESC 
   LIMIT 1;"

# Expected output:
#  event_type        | actor_user_id | actor_user_name |      occurred_at
# -------------------+---------------+-----------------+------------------------
#  ALERT_ACKNOWLEDGED| abc-123-def   | John Doe        | 2026-08-11 10:15:32+00

# 3. Assign alert
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignedTo": "user-456", "note": "Reassigning to specialist"}'

# 4. Resolve alert
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolutionCode": "FALSE_POSITIVE", "comment": "Shadow triggered detector"}'

# 5. Get alert timeline
curl https://api.example.com/v1/operations/alerts/alert-123/timeline \
  -H "Authorization: Bearer $TOKEN"

# Expected: Array of events showing complete history
```

### Step 6: Security Validation Tests

**Test that security boundaries are enforced:**

```bash
# Test 1: Reject forged identity
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/resolve \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resolutionCode": "FALSE_POSITIVE",
    "userId": "admin-user-id",
    "resolvedBy": "admin-user-id"
  }'

# Expected: 422 Unprocessable Entity (unknown properties rejected)

# Test 2: Cross-tenant access denied
curl -X POST https://api.example.com/v1/operations/alerts/tenant-b-alert/resolve \
  -H "Authorization: Bearer $TENANT_A_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolutionCode": "FALSE_POSITIVE"}'

# Expected: 403 Forbidden or 404 Not Found

# Test 3: Insufficient permissions
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/suppress \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing"}'

# Expected: 403 Forbidden (operators can't suppress)

# Test 4: Invalid state transition
# First resolve an alert
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolutionCode": "DUPLICATE"}'

# Then try to acknowledge it
curl -X POST https://api.example.com/v1/operations/alerts/alert-123/acknowledge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 409 Conflict (can't acknowledge resolved alert)
```

### Step 7: Monitor and Verify

**Check application logs:**

```bash
# Look for any errors
kubectl logs -l app=api-server --tail=100 | grep -i error

# Check alert events are being recorded
kubectl logs -l app=api-server --tail=100 | grep "ALERT_"
```

**Monitor database:**

```sql
-- Check events are being recorded
SELECT event_type, COUNT(*) 
FROM operational_alert_events 
WHERE occurred_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;

-- Verify actor IDs are populated (not null)
SELECT COUNT(*) as events_with_actor
FROM operational_alert_events
WHERE actor_user_id IS NOT NULL
  AND occurred_at > NOW() - INTERVAL '1 hour';

-- Check for any anomalies
SELECT actor_user_id, COUNT(*) as action_count
FROM operational_alert_events
WHERE occurred_at > NOW() - INTERVAL '1 hour'
GROUP BY actor_user_id
ORDER BY action_count DESC
LIMIT 10;
```

## Post-Deployment Verification

### Functional Tests

- [ ] Alert acknowledgement works
- [ ] Alert assignment works
- [ ] Alert resolution works with all resolution codes
- [ ] Alert escalation works
- [ ] Alert comments work
- [ ] Alert timeline displays correctly
- [ ] All actions show correct user names in UI

### Security Tests

- [ ] Client-supplied `userId` is rejected (422 error)
- [ ] Client-supplied `assignedBy` is rejected (422 error)
- [ ] Cross-tenant access is denied (403 or 404)
- [ ] Permission checks are enforced
- [ ] Audit events contain correct actor IDs
- [ ] Actor IDs match authenticated user, not request body

### Performance Tests

- [ ] Alert action response times < 500ms
- [ ] Database insert performance acceptable
- [ ] No N+1 query issues
- [ ] Indexes are being used (check EXPLAIN ANALYZE)

## Rollback Plan

If issues are discovered:

### Option 1: Quick Rollback (Frontend Only)

```bash
# Revert frontend to previous version
aws s3 sync s3://your-bucket/dashboard-backup/ s3://your-bucket/dashboard/ --delete

# Clear CDN cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Option 2: Full Rollback (Backend + Frontend)

```bash
# Rollback backend deployment
kubectl rollout undo deployment/api-server

# Rollback frontend
aws s3 sync s3://your-bucket/dashboard-backup/ s3://your-bucket/dashboard/ --delete

# Database migration is safe to keep (append-only table)
# No need to drop operational_alert_events table
```

### Option 3: Disable New Features

If you need to disable the new endpoints temporarily:

```typescript
// Comment out the new routes in src/routes/operational-health.routes.ts
// app.post("/v1/operations/alerts/:alertId/acknowledge", ...);
// app.post("/v1/operations/alerts/:alertId/assign", ...);
// app.post("/v1/operations/alerts/:alertId/resolve", ...);

// Redeploy backend
```

## Monitoring

**Set up alerts for:**

1. **High error rates** on alert action endpoints (> 5% errors)
2. **Slow response times** (> 1s for p95)
3. **Missing audit events** (check events are being inserted)
4. **Authentication failures** (401 responses increasing)
5. **Authorization failures** (403 responses for legitimate users)

**Dashboard queries:**

```sql
-- Alert actions per hour
SELECT 
  DATE_TRUNC('hour', occurred_at) as hour,
  event_type,
  COUNT(*) as count
FROM operational_alert_events
WHERE occurred_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, event_type
ORDER BY hour DESC, event_type;

-- Most active users
SELECT 
  actor_user_name,
  COUNT(*) as actions,
  ARRAY_AGG(DISTINCT event_type) as action_types
FROM operational_alert_events
WHERE occurred_at > NOW() - INTERVAL '7 days'
  AND actor_type = 'USER'
GROUP BY actor_user_name
ORDER BY actions DESC
LIMIT 20;

-- Alerts with most activity
SELECT 
  alert_id,
  COUNT(*) as event_count,
  MIN(occurred_at) as first_event,
  MAX(occurred_at) as last_event
FROM operational_alert_events
WHERE occurred_at > NOW() - INTERVAL '7 days'
GROUP BY alert_id
HAVING COUNT(*) > 5
ORDER BY event_count DESC
LIMIT 20;
```

## Troubleshooting

### Issue: 422 errors for valid requests

**Symptom:** Dashboard shows "Failed to acknowledge alert"

**Diagnosis:**
```bash
# Check request payload
# Browser DevTools → Network → acknowledge request → Payload
```

**Fix:** Ensure frontend is sending correct payload format without identity fields

### Issue: 403 Forbidden for all users

**Symptom:** All users get "Not authorized"

**Diagnosis:**
```sql
-- Check if permissions exist
SELECT id, role, permissions FROM users LIMIT 5;
```

**Fix:** Ensure permission system is properly configured

### Issue: Audit events not recorded

**Symptom:** Timeline is empty

**Diagnosis:**
```sql
-- Check if events table has any records
SELECT COUNT(*) FROM operational_alert_events;

-- Check recent events
SELECT * FROM operational_alert_events 
ORDER BY created_at DESC 
LIMIT 5;
```

**Fix:** Verify `recordOperationalAlertEvent` is implemented correctly

### Issue: Actor ID is null

**Symptom:** `actor_user_id` is NULL in audit events

**Diagnosis:**
```typescript
// Check request.currentUser is populated
console.log('Current user:', request.currentUser);
```

**Fix:** Ensure authentication middleware is running before alert routes

## Success Criteria

Deployment is successful when:

✅ All alert actions work correctly in production  
✅ No client-supplied identity fields are accepted  
✅ Audit events are recorded with correct actor IDs  
✅ Cross-tenant access is properly blocked  
✅ Permission checks are enforced  
✅ State machine prevents invalid transitions  
✅ Response times are acceptable (< 500ms p95)  
✅ Error rates are normal (< 1%)  
✅ No security vulnerabilities detected  
✅ Operations team has verified functionality  

## Next Steps

After successful deployment:

1. **Monitor for 24 hours** - Watch for any issues
2. **Collect feedback** from operations team
3. **Apply same pattern** to other subsystems (incidents, evidence, etc.)
4. **Update documentation** with new API contracts
5. **Train operations team** on new audit capabilities
6. **Schedule cleanup** of old hardcoded patterns in codebase

## Support

If issues arise during deployment:

- **Slack:** #ops-alerts-deployment
- **On-call:** +1-XXX-XXX-XXXX
- **Escalation:** engineering-leads@example.com
- **Rollback decision:** Requires approval from Engineering Manager

## References

- [ALERT_IDENTITY_FIX_SUMMARY.md](./ALERT_IDENTITY_FIX_SUMMARY.md) - Complete implementation details
- [API Documentation](./docs/api/operational-health.md) - API reference
- [Security Architecture](./docs/security/authentication.md) - Auth architecture
