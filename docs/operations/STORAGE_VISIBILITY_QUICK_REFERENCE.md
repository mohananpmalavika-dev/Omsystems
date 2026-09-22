# Storage Visibility Quick Reference Card

## Problem
Storage data not appearing in **Predictive Operations** dashboard (`/analytics/predictions`)

## Quick Fix (90 seconds)

### Option 1: Automated Fix (Recommended)
```bash
bash scripts/quick-fix-storage.sh
```

### Option 2: Manual Steps
```bash
# 1. Check if data exists
psql -c "SELECT COUNT(*) FROM operational_telemetry WHERE device_type='disk';"

# 2. If count is 0, generate test data
npm run seed:storage

# 3. Verify API
curl "http://localhost:3000/api/control/v1/maintenance/predictive/dashboard?horizonHours=48"

# 4. Refresh browser cache (Ctrl+Shift+R)
```

## Root Causes and Solutions

| Symptom | Root Cause | Solution |
|---------|-----------|----------|
| `volumes.length === 0` | No storage telemetry collected | Run `npm run seed:storage` or configure edge agents |
| UI shows "Unavailable" | Metric fields missing | Check telemetry includes `totalBytes`, `usedBytes`, `dailyWriteRateBytes` |
| Data exists but not visible | User lacks permissions | Grant `recording:view` permission on branch |
| Stale data (>24h old) | Edge agents offline | Restart edge agents: `systemctl restart edge-agent` |

## Verification Checklist

- [ ] Database has storage records: `SELECT COUNT(*) FROM operational_telemetry WHERE device_type='disk' AND created_at > NOW() - INTERVAL '24 hours';`
- [ ] API returns volumes: `GET /v1/maintenance/predictive/dashboard?horizonHours=48`
- [ ] Frontend displays storage card with data
- [ ] User has correct permissions on the branch
- [ ] Edge agents are online and reporting

## Emergency Contacts

| Issue Type | Contact | Action |
|------------|---------|--------|
| No data after 15 min | DevOps Team | Check edge agent logs |
| Permission errors | Security Team | Review user access grants |
| API errors | Backend Team | Check application logs |
| Frontend issues | Frontend Team | Check browser console |

## Monitoring

### Set Up Alerts
```sql
-- Alert if no storage data in 2 hours
SELECT COUNT(*) FROM operational_telemetry 
WHERE device_type='disk' 
  AND created_at > NOW() - INTERVAL '2 hours';
-- Threshold: < 10 records = CRITICAL
```

### Health Check Endpoint
```bash
# Coming soon
GET /v1/health/storage-telemetry
```

## Links

- Full Documentation: `STORAGE_VISIBILITY_FIX.md`
- Diagnostic Script: `scripts/fix-storage-visibility.sql`
- Seed Script: `scripts/seed-storage-telemetry.ts`

---

**Last Updated**: January 2024 | **Version**: 1.0 | **Status**: Production
