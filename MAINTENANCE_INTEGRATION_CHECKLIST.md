# Maintenance Module 2.8 - Integration Checklist

## Pre-Integration Verification ✓

- [x] Database migration file created: `017_maintenance_extended.sql`
- [x] All schema elements validated (17 tables, 3 views, triggers)
- [x] Route definitions completed: `maintenance-dashboard.routes.ts`
- [x] Store interface extended: `control-plane-store.ts` (+30 methods)
- [x] Reference implementation provided: `store-maintenance-extensions.ts`
- [x] Route registration added to `app.ts`
- [x] Documentation complete (3 guides)

---

## Integration Steps

### Step 1: Copy Store Methods to src/store.ts
**Estimated Time**: 1-2 hours

```bash
# 1. Open src/store.ts and navigate to the MemoryStore class constructor
# 2. Add these arrays to the constructor:

private cameraHealth: any[] = [];
private storageHealth: any[] = [];
private networkHealth: any[] = [];
private upsHealth: any[] = [];
private firmwareInventory: any[] = [];
private softwareVersions: any[] = [];
private spareParts: any[] = [];
private inventoryTransactions: any[] = [];
private maintenanceReports: any[] = [];

# 3. Copy all method implementations from src/store-maintenance-extensions.ts
#    into the MemoryStore class (approximately lines 938-1200)

# Methods to copy:
# - recordCameraHealth()
# - recordStorageHealth()
# - recordNetworkHealth()
# - recordUpsHealth()
# - getHealthCheckSummary()
# - recordFirmwareVersion()
# - listFirmwareUpdatesRequired()
# - recordSoftwareVersion()
# - recordSparePart()
# - recordInventoryTransaction()
# - listLowStockParts()
# - generateMaintenanceReport()
# - listMaintenanceReports()
# - getMaintenanceComplianceStatus()
```

**Verification**:
```bash
npm run typecheck
# Should show no errors related to maintenance types
```

---

### Step 2: Run Database Migration
**Estimated Time**: 5-10 minutes

```bash
# 1. Ensure database is running
docker-compose up postgres -d

# 2. Run migration
npm run migrate

# 3. Verify migration completed
npm run migrate:status
# Should show: 017_maintenance_extended - up

# 4. Verify tables created
psql -U sentinel -d sentinel -c "\dt maintenance_*"
# Should list 17 new tables
```

---

### Step 3: Test Compilation
**Estimated Time**: 2-3 minutes

```bash
npm run typecheck
npm run build
```

**Expected Output**:
- No TypeScript errors
- Build completes successfully
- All maintenance types resolved

---

### Step 4: Start Development Server
**Estimated Time**: 1-2 minutes

```bash
npm run dev
```

**Expected Output**:
```
[app] listening on 0.0.0.0:3000
[maintenance-scheduler] started with tick 30s
```

---

### Step 5: Test Health Endpoints
**Estimated Time**: 10-15 minutes

```bash
# Test dashboard endpoints
curl http://localhost:3000/v1/maintenance/dashboard/health
curl http://localhost:3000/v1/maintenance/dashboard/status

# Expected response format:
# {
#   "healthPercentage": 98,
#   "camerasOnline": 542,
#   "camerasOffline": 3,
#   ...
# }

# Test health monitoring
curl http://localhost:3000/v1/maintenance/health/cameras
curl http://localhost:3000/v1/maintenance/health/storage
curl http://localhost:3000/v1/maintenance/health/network
curl http://localhost:3000/v1/maintenance/health/power

# Test firmware endpoints
curl http://localhost:3000/v1/maintenance/firmware/updates-required

# Test reporting
curl http://localhost:3000/v1/maintenance/reports/metrics

# Test predictive
curl http://localhost:3000/v1/maintenance/predictive/high-risk
```

---

### Step 6: Create Test Data
**Estimated Time**: 30-45 minutes

```bash
# 1. Create test maintenance asset
curl -X POST http://localhost:3000/v1/maintenance/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "category": "camera",
    "assetType": "Hikvision PTZ",
    "make": "Hikvision",
    "model": "DS-2DF8225IX",
    "serialNumber": "SN123456",
    "status": "operational"
  }'

# 2. Create test work order
curl -X POST http://localhost:3000/v1/maintenance/workorders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "workOrderNumber": "WO-001",
    "problem": "Camera offline",
    "severity": "high"
  }'

# 3. Record camera health
curl -X POST http://localhost:3000/v1/maintenance/health/cameras \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "<camera-uuid>",
    "onlineStatus": "online",
    "fps": 30,
    "bitrate": 2048,
    "temperature": 42
  }'
```

---

### Step 7: Run Test Suite
**Estimated Time**: 10-15 minutes

```bash
npm run test

# Should include tests for:
# - Maintenance asset creation
# - Work order management
# - Health monitoring recording
# - Report generation
```

---

### Step 8: Deploy to Staging
**Estimated Time**: Varies by infrastructure

```bash
# 1. Commit changes
git add .
git commit -m "Complete Maintenance Module Integration - Phase 2"

# 2. Build for production
npm run build

# 3. Deploy using your deployment process
# (specific to your infrastructure)

# 4. Run migrations on staging DB
npm run migrate

# 5. Verify endpoints on staging
curl https://staging-api.example.com/v1/maintenance/dashboard/health
```

---

## Post-Integration Verification

### Database
- [ ] 17 new tables exist
- [ ] 3 views created successfully
- [ ] Triggers are active
- [ ] Indexes are present

### API
- [ ] All 20+ new endpoints return 200/201/202
- [ ] Dashboard endpoints return expected structure
- [ ] Health endpoints populate with default data
- [ ] Reporting endpoints generate reports

### Performance
- [ ] Dashboard health query < 100ms
- [ ] Health recording operations < 50ms
- [ ] Report generation < 2 seconds
- [ ] List endpoints with pagination work correctly

### Data Integrity
- [ ] Tenant isolation verified (no data leakage)
- [ ] Audit trails created for all operations
- [ ] Timestamps are accurate
- [ ] User attribution working

### Security
- [ ] Permission checks working
- [ ] Sensitive operations require approval
- [ ] Audit log accessible only to admins
- [ ] No SQL injection vulnerabilities

---

## Rollback Plan

If issues arise after integration:

```bash
# 1. Stop the application
docker-compose down

# 2. Rollback database (if needed)
# Drop migration 017 only:
psql -U sentinel -d sentinel -f database/migrations/017_maintenance_extended.sql.down

# 3. Revert code changes
git revert <commit-hash>

# 4. Restart
npm run dev
```

---

## Monitoring After Integration

### Metrics to Track
- API response times (dashboard, health, reports)
- Database query performance
- Error rates by endpoint
- Health check ingestion rate
- Report generation frequency

### Alerts to Set
- API error rate > 1%
- Dashboard response time > 500ms
- Health check table growth > 1GB/day
- Database connection pool exhaustion

### Log Patterns
```bash
# View maintenance operations
grep "maintenance\." logs/app.log

# Monitor health checks
grep "recordCameraHealth\|recordStorageHealth" logs/app.log

# Check for errors
grep "ERROR.*maintenance" logs/app.log
```

---

## Optimization Opportunities (Post-Launch)

1. **Caching**: Implement Redis for dashboard summaries (5-min TTL)
2. **Archiving**: Move old health checks to cold storage after 6 months
3. **Partitioning**: Partition large tables by date/tenant
4. **Indexing**: Add composite indexes for common queries
5. **Sharding**: Plan for horizontal scaling if DB grows beyond 100GB

---

## Support Contacts

- **Database Issues**: Check migration logs, review schema
- **API Issues**: Review route definitions, check permission grants
- **Performance Issues**: Check database indexes, enable query logging
- **Data Issues**: Review audit trails, check tenant isolation

---

## Timeline

| Task | Estimate | Status |
|------|----------|--------|
| Copy store methods | 1-2 hrs | ⏳ Pending |
| Run migration | 5 min | ⏳ Pending |
| Test compilation | 2-3 min | ⏳ Pending |
| Start dev server | 1-2 min | ⏳ Pending |
| Test endpoints | 10-15 min | ⏳ Pending |
| Create test data | 30-45 min | ⏳ Pending |
| Run test suite | 10-15 min | ⏳ Pending |
| Deploy to staging | Varies | ⏳ Pending |
| **Total** | **~3-4 hours** | **⏳ Ready** |

---

## Success Criteria

✅ All criteria must be met before proceeding to Phase 3

- [ ] All 33+ endpoints return valid responses
- [ ] Dashboard shows accurate health summary
- [ ] Health monitoring records data correctly
- [ ] Reports generate without errors
- [ ] SLA tracking is accurate
- [ ] No TypeScript compilation errors
- [ ] No runtime errors in logs
- [ ] Database queries execute < 100ms
- [ ] User permissions enforced correctly
- [ ] Audit logs record all operations

---

**Ready to Integrate**: YES ✓  
**Date Prepared**: 2026-07-21  
**Prepared By**: System Enhancement Process  
**Next Phase**: Phase 3 - Health Monitoring Service (estimated 1-2 weeks)
