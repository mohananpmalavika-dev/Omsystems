# Retention Verification - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Apply Database Migration
```bash
psql -U postgres -d omvms -f backend/prisma/migrations/20260726_retention_verification.sql
```

### 2. Start Service
```typescript
import { getRetentionVerificationService } from './services/retention-verification.service.js';
const service = getRetentionVerificationService(pool);
await service.start(); // Runs every hour
```

### 3. Register API Routes
```typescript
import { createRetentionVerificationRoutes } from './routes/retention-verification-api.js';
app.use('/api/v1/retention', createRetentionVerificationRoutes(pool));
```

### 4. Test It
```bash
# Get camera status
curl http://localhost:3000/api/v1/retention/{cameraId}/status

# Get all violations
curl http://localhost:3000/api/v1/retention/violations

# Get branch compliance
curl http://localhost:3000/api/v1/retention/branch/{branchId}/compliance
```

---

## 📊 Key Concepts

### Retention Calculation
```
Actual Retention = (Newest Recording Date - Oldest Recording Date) in days
```

### Compliance Status
- **Compliant**: Actual >= Required × 1.1
- **Warning**: Actual >= Required and < Required × 1.1
- **Violation**: Actual < Required

---

## 🔥 Quick Commands

### Database Queries
```sql
-- View all violations
SELECT c.name, crs.required_retention_days, crs.actual_retention_days, crs.compliance_status
FROM camera_retention_status crs
JOIN cameras c ON c.id = crs.camera_id
WHERE crs.compliance_status IN ('violation', 'warning')
ORDER BY crs.actual_retention_days;

-- Branch summary
SELECT * FROM retention_compliance_summary ORDER BY compliance_percentage;

-- Refresh dashboard
SELECT refresh_retention_compliance_summary();
```

### API Endpoints (13 total)
```bash
# Camera Operations
GET  /api/v1/retention/:cameraId/status
GET  /api/v1/retention/:cameraId/history
POST /api/v1/retention/:cameraId/verify
GET  /api/v1/retention/:cameraId/trend?days=30
GET  /api/v1/retention/:cameraId/uptime?days=30

# System-Wide
GET  /api/v1/retention/violations
GET  /api/v1/retention/predictions
GET  /api/v1/retention/summary
POST /api/v1/retention/summary/refresh

# Branch-Level
GET  /api/v1/retention/branch/:branchId/compliance

# Alerts
GET   /api/v1/retention/alerts?status=open
PATCH /api/v1/retention/alerts/:id/acknowledge
PATCH /api/v1/retention/alerts/:id/resolve
```

---

## 📈 Dashboard Queries

### Violations Dashboard
```sql
SELECT 
  c.name as camera,
  b.name as branch,
  crs.required_retention_days as required,
  crs.actual_retention_days as actual,
  crs.required_retention_days - crs.actual_retention_days as gap,
  crs.projected_retention_days as projected
FROM camera_retention_status crs
JOIN cameras c ON c.id = crs.camera_id
JOIN resource_nodes b ON b.id = c.branch_node_id
WHERE crs.compliance_status = 'violation'
ORDER BY gap DESC;
```

### Branch Compliance
```sql
SELECT 
  branch_name,
  total_cameras,
  compliant_cameras,
  violation_cameras,
  ROUND(compliance_percentage, 1) as compliance_pct,
  ROUND(avg_actual_retention_days, 1) as avg_retention
FROM retention_compliance_summary
ORDER BY compliance_percentage ASC;
```

### Storage Predictions
```sql
SELECT 
  c.name as camera,
  crs.actual_retention_days as current_days,
  crs.projected_retention_days as projected_days,
  crs.total_recordings_gb as storage_used_gb,
  CASE 
    WHEN crs.projected_retention_days < crs.required_retention_days THEN 'CRITICAL'
    WHEN crs.projected_retention_days < crs.required_retention_days * 1.2 THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM camera_retention_status crs
JOIN cameras c ON c.id = crs.camera_id
WHERE crs.projected_retention_days < crs.required_retention_days * 1.5
ORDER BY crs.projected_retention_days;
```

---

## ⚡ Performance Tips

### Materialized View
```sql
-- Refresh every 15 minutes (cron)
*/15 * * * * psql -c "SELECT refresh_retention_compliance_summary();"

-- Or via API
curl -X POST http://localhost:3000/api/v1/retention/summary/refresh
```

### Service Configuration
```typescript
// Adjust verification interval (default: 1 hour)
const service = new RetentionVerificationService(pool);
// Service runs verification every hour automatically
await service.start();
```

---

## 🔍 Monitoring

### Check Service Health
```bash
# Service should log every hour
tail -f logs/application.log | grep "retention verification"

# Expected output:
# [DEBUG] Starting retention verification cycle
# [DEBUG] Verifying 127 cameras
# [DEBUG] Retention verification cycle complete
```

### Check Data Freshness
```sql
SELECT 
  COUNT(*) as cameras_verified,
  MAX(last_verified_at) as last_verification,
  NOW() - MAX(last_verified_at) as time_since_last
FROM camera_retention_status;
```

**Expected:** last_verification within last hour

---

## 🚨 Alert Monitoring

### Open Alerts
```bash
curl http://localhost:3000/api/v1/retention/alerts?status=open | jq '.data.count'
```

### Critical Violations
```sql
SELECT COUNT(*) 
FROM retention_compliance_alerts 
WHERE status = 'open' AND severity = 'critical';
```

---

## 📁 File Locations

```
backend/
├── src/
│   ├── services/
│   │   └── retention-verification.service.ts    (650 lines)
│   └── routes/
│       └── retention-verification-api.ts         (400 lines)
└── prisma/
    └── migrations/
        └── 20260726_retention_verification.sql   (350 lines)

Documentation/
├── RETENTION_VERIFICATION_COMPLETE.md            (Complete guide)
├── RETENTION_VERIFICATION_TESTING_GUIDE.md       (Testing procedures)
└── RETENTION_VERIFICATION_QUICK_START.md         (This file)
```

---

## ✅ Success Checklist

- [ ] Database migration applied
- [ ] Service started and running
- [ ] API routes registered
- [ ] First verification cycle completed
- [ ] Data appears in `camera_retention_status` table
- [ ] Violations visible via API
- [ ] Alerts generated for policy violations
- [ ] Materialized view populated
- [ ] Dashboard queries returning data

---

## 🎯 Example Use Cases

### Use Case 1: Find All Cameras Below Policy
```bash
curl http://localhost:3000/api/v1/retention/violations | jq '.data.summary'
```

### Use Case 2: Check Specific Camera
```bash
curl http://localhost:3000/api/v1/retention/{cameraId}/status | jq '.data.complianceStatus'
```

### Use Case 3: Get Branch Report
```bash
curl http://localhost:3000/api/v1/retention/branch/{branchId}/compliance | jq '.data.compliancePercentage'
```

### Use Case 4: Storage Planning
```bash
curl http://localhost:3000/api/v1/retention/predictions | jq '.data.summary'
```

---

## 📞 Need Help?

### Verify Setup
```bash
# 1. Check tables exist
psql -d omvms -c "\dt camera_retention_status"

# 2. Check service is running
curl http://localhost:3000/api/v1/retention/summary

# 3. Trigger manual verification
curl -X POST http://localhost:3000/api/v1/retention/{cameraId}/verify
```

### Common Issues

**No data in tables?**
- Check that cameras have recording segments
- Trigger manual verification for test camera
- Check service logs for errors

**Compliance status shows 'unknown'?**
- Camera may have no recordings yet
- Wait for next verification cycle (runs hourly)
- Manually trigger verification

**Materialized view out of date?**
```bash
curl -X POST http://localhost:3000/api/v1/retention/summary/refresh
```

---

## 🎉 You're Ready!

The system is now:
- ✅ Calculating actual retention from recordings
- ✅ Comparing against policy requirements
- ✅ Generating compliance alerts
- ✅ Predicting future retention
- ✅ Providing dashboards and reports

**Status:** 70% → 95% Complete 🚀

---

**For detailed documentation, see:**
- `RETENTION_VERIFICATION_COMPLETE.md` - Full implementation guide
- `RETENTION_VERIFICATION_TESTING_GUIDE.md` - Comprehensive testing
