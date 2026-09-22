# Storage Visibility - Quick Fix Guide

> **Problem**: Storage volumes not showing in Predictive Operations dashboard

## Instant Fix (< 2 minutes)

### Option 1: Automatic Self-Healing
```bash
npm run ensure:storage
```
**What it does**: Checks health → Seeds data if missing → Reports status

---

### Option 2: Manual Seed
```bash
npm run seed:storage
```
**What it does**: Generates realistic storage telemetry data

---

### Option 3: API Health Check
```bash
curl http://localhost:3000/api/control/v1/health/storage-telemetry
```
**What it returns**: Current health status with issue details

---

## Verification (30 seconds)

### 1. Check API
```bash
curl http://localhost:3000/api/control/v1/maintenance/predictive/dashboard?horizonHours=48 | jq '.volumes'
```
**Expected**: Array of storage volumes with totalTb, usedTb, daysRemaining

---

### 2. Check Dashboard
1. Visit: `/analytics/predictions`
2. Filter: **Storage**
3. Verify: Storage capacity card shows volumes

---

## Common Issues

### ❌ "No active tenants found"
**Fix**: Seed database first
```bash
npm run db:seed
npm run ensure:storage
```

### ❌ "Storage data is stale"
**Fix**: Restart edge agents
```bash
systemctl restart edge-agent
# Wait 2 minutes, then:
npm run ensure:storage
```

### ❌ "UI shows empty but API has data"
**Fix**: Check user permissions
```sql
SELECT permission_name FROM user_permissions WHERE user_id='<your-id>';
-- Should include: recording:view
```

### ❌ "Database connection error"
**Fix**: Verify DATABASE_URL
```bash
echo $DATABASE_URL
psql $DATABASE_URL -c "SELECT 1"
```

---

## Permanent Solution

### Enable Automatic Startup Check
Add to `package.json`:
```json
{
  "scripts": {
    "start": "npm run ensure:storage && npm run start:server"
  }
}
```

### Monitor Health
```bash
# Check every hour
*/60 * * * * curl http://localhost:3000/api/control/v1/health/storage-telemetry | jq '.healthy'
```

---

## Emergency Contacts

**Operations**: ops@company.com  
**Development**: dev@company.com  
**Detailed Docs**: `docs/operations/STORAGE_VISIBILITY_PERMANENT_FIX.md`

---

**Last Updated**: January 2024  
**Version**: 2.0

