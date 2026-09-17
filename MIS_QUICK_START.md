# MIS Reports - Quick Start Guide

**Last Updated:** September 17, 2026  
**For:** Developers, DevOps, System Administrators

---

## 🚀 Deployment (3 Steps)

### 1. Database Migration
```bash
psql -U postgres -d surveillance -f migrations/003_mis_performance_indexes.sql
```

### 2. Restart Backend
```bash
npm run dev  # Development
# OR
pm2 restart surveillance-control-plane  # Production
```

### 3. Test Endpoints
```bash
chmod +x test-mis-endpoints.sh
./test-mis-endpoints.sh YOUR_AUTH_TOKEN
```

**Expected:** 6/6 tests pass ✅

---

## 📍 Endpoints

### Phase 1 Reports (All Live)

```
GET /api/control/v1/reports/executive-kpi
GET /api/control/v1/reports/financial/tco
GET /api/control/v1/reports/financial/roi
GET /api/control/v1/reports/branch-benchmarking
GET /api/control/v1/reports/compliance-scorecard
GET /api/control/v1/reports/mis
```

### Authentication
All endpoints require Bearer token:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/control/v1/reports/executive-kpi
```

---

## 🌐 Frontend URLs

```
http://localhost:10000/mis-dashboard          # Executive Dashboard
http://localhost:10000/reports/financial      # Financial TCO & ROI
http://localhost:10000/reports/benchmarking   # Branch Benchmarking
http://localhost:10000/reports/compliance     # Compliance Scorecard
http://localhost:10000/reports/mis            # MIS Unified Report (NEW)
```

---

## 🔧 Quick Troubleshooting

### Issue: Routes return 404
**Fix:** Routes not registered
```bash
grep "Phase 1 MIS Reports" src/app.ts
npm run dev
```

### Issue: Reports slow (>10s)
**Fix:** Indexes not created
```bash
psql -U postgres -d surveillance -f migrations/003_mis_performance_indexes.sql
```

### Issue: Empty data
**Fix:** No data in database
```bash
# Check if branches exist
psql -U postgres -d surveillance -c \
  "SELECT COUNT(*) FROM nodes WHERE type = 'branch';"
```

### Issue: Navigation links missing
**Fix:** Frontend not rebuilt
```bash
cd dashboard && npm run dev
```

---

## 📊 Performance Targets

| Report | Target Load Time | Expected CPU |
|--------|------------------|--------------|
| Executive KPI | < 3 seconds | < 35% |
| Financial TCO | < 3 seconds | < 30% |
| Branch Benchmarking | < 2 seconds | < 25% |
| Compliance Scorecard | < 3 seconds | < 32% |
| MIS Unified | < 5 seconds | < 40% |

---

## ✅ Deployment Checklist

- [ ] Database migration run successfully
- [ ] Backend server restarted
- [ ] All 6 API tests pass
- [ ] Frontend shows navigation links
- [ ] Reports load with real data
- [ ] No console errors
- [ ] Performance targets met

---

## 📞 Quick Commands

**Check if routes registered:**
```bash
curl http://localhost:3000/api/control/v1/reports/executive-kpi | jq .
```

**Check database indexes:**
```bash
psql -U postgres -d surveillance -c \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_%_tenant%';"
# Expected: 30+
```

**Monitor backend logs:**
```bash
pm2 logs surveillance-control-plane --lines 50
```

**Restart everything:**
```bash
pm2 restart surveillance-control-plane surveillance-dashboard
```

---

## 📚 Documentation

- **Full Deployment Guide:** `MIS_DEPLOYMENT_GUIDE.md`
- **Implementation Summary:** `MIS_CRITICAL_FIXES_COMPLETED.md`
- **Enhancement Roadmap:** `MIS_ENHANCEMENTS_REVIEW.md`

---

## 🎯 Success Indicators

✅ All API endpoints return HTTP 200  
✅ Reports load in < 5 seconds  
✅ No database timeout errors  
✅ Navigation links visible  
✅ Real data shows (not zeros)  
✅ No console errors

**Status:** READY FOR PRODUCTION 🚀
