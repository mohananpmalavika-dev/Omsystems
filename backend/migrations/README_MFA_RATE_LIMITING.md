# MFA Rate Limiting Database Migrations

This directory contains database migrations for the MFA distributed rate limiting system.

## Migration Files

### 1. `20240115_mfa_security_events.sql`
Creates the `mfa_security_events` table for immutable audit logging of all MFA security events.

**Features:**
- Immutable audit trail (insert-only)
- HMAC-hashed identifiers (no raw PII)
- Optimized indexes for forensic queries
- Support for suspicious pattern detection
- Partitionable by `created_at` for scaling

**Event Types:**
- Generation: REQUESTED, RATE_LIMITED, SUCCEEDED, FAILED
- Delivery: SUCCEEDED, FAILED
- Verification: REQUESTED, SUCCEEDED, FAILED, RATE_LIMITED
- Challenge: LOCKED, EXPIRED, SUPERSEDED
- Account: TEMPORARILY_LOCKED, LOCKOUT_RELEASED
- Security: IP_BLOCKED, SECURITY_REVIEW_TRIGGERED

### 2. `20240115_mfa_restrictions.sql`
Creates the `mfa_restrictions` table for persistent lockouts and restrictions.

**Features:**
- Long-lived restrictions (beyond Redis TTL)
- Security review holds (indefinite until manual unlock)
- Subject-based restrictions (user, phone, email, IP, device)
- Automatic expiration handling
- Audit trail with metadata

**Restriction Types:**
- `SHORT_COOLDOWN` - Brief delay (60 seconds)
- `GENERATION_BLOCKED` - Temporary OTP generation block (5 minutes)
- `ACCOUNT_TEMPORARILY_LOCKED` - Account-level lock (30 minutes)
- `SECURITY_REVIEW` - Indefinite hold requiring manual review
- `MANUAL_BLOCK` - Admin-imposed restriction

### 3. `20240115_mfa_rate_limiting_rollback.sql`
Rollback script to drop all MFA rate limiting tables.

**WARNING:** This permanently deletes all security event history and restrictions.

## Running Migrations

### Apply Migrations

```bash
# Using psql
psql -U your_user -d your_database -f migrations/20240115_mfa_security_events.sql
psql -U your_user -d your_database -f migrations/20240115_mfa_restrictions.sql

# Or using a migration tool
npm run migrate:up
```

### Rollback Migrations

```bash
psql -U your_user -d your_database -f migrations/20240115_mfa_rate_limiting_rollback.sql
```

## Data Retention

### Security Events
- **Recommended retention:** 90 days for operational data
- **Long-term retention:** 1-2 years for compliance/audit
- **Cleanup:** Use `MfaSecurityEventRepository.deleteOldEvents(daysOld)`

```sql
-- Manual cleanup query (delete events older than 90 days)
DELETE FROM mfa_security_events 
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Restrictions
- Active restrictions are kept indefinitely
- Expired restrictions can be archived/deleted after audit period

```sql
-- Archive expired restrictions older than 30 days
DELETE FROM mfa_restrictions 
WHERE expires_at < NOW() - INTERVAL '30 days';
```

## Partitioning (Optional)

For high-volume systems, partition `mfa_security_events` by month:

```sql
-- Convert to partitioned table
CREATE TABLE mfa_security_events_partitioned (
  LIKE mfa_security_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE mfa_security_events_2024_01 
  PARTITION OF mfa_security_events_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Automate partition creation with pg_partman or cron
```

## Indexes

All tables include optimized indexes for:
- User-based queries (tenant + user + timestamp)
- Challenge-based queries (challenge_id + timestamp)
- Forensic analysis (type + timestamp)
- Suspicious pattern detection (failures by user)
- IP-based correlation (ip_hash + timestamp)

## Performance Considerations

### Write Load
- Security events are write-heavy (every MFA operation)
- Consider batching inserts if > 1000 events/second
- Use async fire-and-forget pattern (already implemented)

### Query Load
- Most queries are time-windowed (last 15-60 minutes)
- Indexes support fast range scans
- Consider read replicas for analytics queries

### Storage
- ~500 bytes per security event (with metadata)
- ~300 bytes per restriction
- 1M events/month ≈ 500MB
- Plan for 6-12 months of data

## Security Considerations

### No PII Storage
- IP addresses are HMAC-hashed (not stored raw)
- Phone numbers are HMAC-hashed
- Device IDs are HMAC-hashed
- Only user IDs (UUIDs) are stored in plain

### HMAC Secret
The HMAC secret for hashing must be:
- At least 32 characters
- Stored securely (environment variable, secrets manager)
- Different from other application secrets
- Rotated periodically (requires re-hashing)

### Access Control
```sql
-- Example grants
GRANT SELECT, INSERT ON mfa_security_events TO app_user;
GRANT SELECT ON mfa_security_events TO readonly_user;
GRANT SELECT ON mfa_security_events TO analytics_user;

-- Restrict updates (immutable audit log)
-- GRANT UPDATE ON mfa_security_events TO app_user; -- DON'T DO THIS

-- Restrictions table needs updates for expiration
GRANT SELECT, INSERT, UPDATE ON mfa_restrictions TO app_user;
```

## Monitoring

### Key Metrics to Track

```sql
-- Rate limit events per hour
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) as events
FROM mfa_security_events
WHERE type IN ('MFA_GENERATION_RATE_LIMITED', 'MFA_VERIFICATION_RATE_LIMITED')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Failed verifications by user
SELECT 
  user_id,
  COUNT(*) as failures
FROM mfa_security_events
WHERE type = 'MFA_VERIFICATION_FAILED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) >= 5
ORDER BY failures DESC;

-- Active lockouts
SELECT 
  restriction_type,
  COUNT(*) as count
FROM mfa_restrictions
WHERE expires_at IS NULL OR expires_at > NOW()
GROUP BY restriction_type;
```

## Troubleshooting

### High Event Volume
- Check for attack patterns (same IP, distributed)
- Review rate limit policies (may be too lenient)
- Consider IP blocking at firewall level

### Lockout Issues
- Use `MfaLockoutPolicyService.unlockUser()` for manual unlock
- Check `mfa_restrictions` table for active locks
- Review security events leading to lockout

### Missing Events
- Ensure `MfaSecurityEventRepository` is passed to MFA service
- Check application logs for event recording errors
- Verify database connection pool isn't exhausted

## Integration Testing

```sql
-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('mfa_security_events', 'mfa_restrictions');

-- Test event insertion
INSERT INTO mfa_security_events (
  tenant_id, user_id, type, method
) VALUES (
  gen_random_uuid(), gen_random_uuid(), 
  'MFA_GENERATION_REQUESTED', 'SMS'
);

-- Test restriction insertion
INSERT INTO mfa_restrictions (
  tenant_id, subject_type, subject_hash, 
  restriction_type, reason, expires_at
) VALUES (
  gen_random_uuid(), 'USER', gen_random_uuid()::text,
  'SHORT_COOLDOWN', 'Test restriction',
  NOW() + INTERVAL '60 seconds'
);
```

## Maintenance Schedule

- **Daily:** Monitor rate limit events and lockouts
- **Weekly:** Review suspicious patterns
- **Monthly:** Archive old security events (> 90 days)
- **Quarterly:** Review and optimize indexes
- **Yearly:** Rotate HMAC secret (requires migration script)
