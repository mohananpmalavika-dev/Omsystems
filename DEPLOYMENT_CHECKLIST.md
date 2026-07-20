# Render Deployment Checklist

Quick checklist for deploying Sentinel Grid with CCTV Infrastructure to Render.

---

## ✅ Pre-Deployment (Local)

### 1. Code Preparation

- [ ] All code changes committed
- [ ] No syntax errors in migrations
- [ ] Package.json updated with migration scripts
- [ ] Environment variables documented

### 2. Test Migrations Locally (Optional but Recommended)

```bash
# Test with local Docker PostgreSQL
npm run migrate:test
```

Expected output:
```
✅ Test database started
✅ Running migrations against test database
✅ All 8 migrations executed successfully
✅ CCTV tables verified
✅ Views verified
✅ All tests passed!
```

### 3. Verify Migration Files

```bash
dir database\migrations
```

Should see:
- `001_initial.sql`
- `002_edge_and_media_contract.sql`
- `003_pilot_seed.sql`
- `004_cctv_infrastructure.sql` ✨ NEW
- `004_b_cctv_infrastructure_seed.sql` ✨ NEW
- `005_organizational_hierarchy_enhancement.sql`
- `006_employee_management_and_auth.sql`
- `007_granular_camera_permissions.sql`

### 4. Generate Secure Keys

```bash
# Generate keys for production
node -e "console.log('MEDIA_GATEWAY_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('EDGE_BRIDGE_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Save these keys - you'll need them for Render environment variables.

### 5. Push to GitHub

```bash
git add .
git commit -m "Add CCTV infrastructure and Render deployment"
git push origin main
```

---

## 🚀 Render Deployment

### Option A: Blueprint (Recommended - Automatic)

1. **Go to Render Dashboard**
   - Visit https://dashboard.render.com

2. **Create New Blueprint**
   - Click "New" → "Blueprint"
   - Connect GitHub repository
   - Select your repository
   - Render detects `render.yaml` automatically

3. **Review Configuration**
   - Verify services:
     - ✅ sentinel-grid-db (PostgreSQL)
     - ✅ sentinel-grid-api (Backend)
     - ✅ sentinel-grid-dashboard (Frontend)
   - Check environment variables are set

4. **Apply Blueprint**
   - Click "Apply"
   - Wait for deployment (10-15 minutes)

5. **Monitor Deployment**
   - Watch build logs for each service
   - Look for migration success messages

### Option B: Manual Setup (More Control)

Follow the detailed steps in [RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md).

---

## 🔧 Post-Deployment Configuration

### 1. Verify Services are Running

- [ ] **Database**: Green status in dashboard
- [ ] **API**: Green status, health check passing
- [ ] **Dashboard**: Green status, accessible

### 2. Check API Health

```bash
# Replace with your actual Render URL
curl https://sentinel-grid-api.onrender.com/health
```

Expected:
```json
{"status":"ok","service":"sentinel-control-plane"}
```

### 3. Verify Migrations Ran

Check build logs for API service:

Look for:
```
🚀 Starting database migrations...
✅ Connected to database
📋 Executing 8 pending migration(s):
✅ 001_initial.sql (245ms)
✅ 002_edge_and_media_contract.sql (123ms)
✅ 003_pilot_seed.sql (89ms)
✅ 004_cctv_infrastructure.sql (312ms) ← CCTV tables
✅ 004_b_cctv_infrastructure_seed.sql (45ms) ← CCTV seed
✅ 005_organizational_hierarchy_enhancement.sql (98ms)
✅ 006_employee_management_and_auth.sql (156ms)
✅ 007_granular_camera_permissions.sql (87ms)
✨ Successfully executed 8 migration(s) in 1155ms
✅ Database is up to date! 🎉
```

### 4. Verify CCTV Tables in Database

```bash
# Get database connection string from Render dashboard
# Use "External Database URL" for remote access

psql $EXTERNAL_DATABASE_URL
```

```sql
-- Check CCTV tables exist
\dt camera*
\dt branch_camera*

-- Expected tables:
-- cameras
-- camera_discoveries
-- camera_specifications ← NEW
-- camera_installation_compliance ← NEW
-- branch_camera_requirements ← NEW

-- Check views
\dv

-- Expected views:
-- branch_camera_coverage_gaps ← NEW
-- camera_compliance_summary ← NEW

-- Check migration tracking
SELECT filename, executed_at FROM schema_migrations ORDER BY executed_at;

-- Should show all 8 migrations
```

### 5. Test CCTV API Endpoints

```bash
# Get branches
curl https://sentinel-grid-api.onrender.com/v1/branches \
  -H "x-user-id: user-global-admin"

# Get branch camera requirements (should be empty initially)
curl https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements \
  -H "x-user-id: user-global-admin"

# Initialize standard requirements for a branch
curl -X POST https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements/initialize \
  -H "x-user-id: user-global-admin"

# Verify requirements were created
curl https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements \
  -H "x-user-id: user-global-admin"
```

### 6. Access Dashboard

```bash
# Open in browser
https://sentinel-grid-dashboard.onrender.com
```

Expected:
- Branch selection screen
- Camera grid layout
- Demo mode or live cameras

---

## 🎯 Initialize CCTV Infrastructure

### For Each Branch

```bash
# 1. Initialize standard camera requirements
curl -X POST https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements/initialize \
  -H "x-user-id: user-global-admin"

# 2. Verify requirements created
curl https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/camera-requirements \
  -H "x-user-id: user-global-admin"

# 3. Check coverage gaps
curl https://sentinel-grid-api.onrender.com/v1/branches/{branchId}/coverage-gaps \
  -H "x-user-id: user-global-admin"
```

### For All Branches (Script)

```bash
# Save this as init-all-branches.sh
#!/bin/bash

API_URL="https://sentinel-grid-api.onrender.com"

# Get all branch IDs
BRANCHES=$(curl -s "$API_URL/v1/branches" \
  -H "x-user-id: user-global-admin" | \
  jq -r '.data[].id')

# Initialize requirements for each branch
for BRANCH_ID in $BRANCHES; do
  echo "Initializing requirements for branch: $BRANCH_ID"
  curl -X POST "$API_URL/v1/branches/$BRANCH_ID/camera-requirements/initialize" \
    -H "x-user-id: user-global-admin"
  echo ""
done

echo "✅ All branches initialized!"
```

---

## 📊 Monitoring Setup

### 1. Enable Render Monitoring

- [ ] Set up uptime monitoring in Render
- [ ] Configure alert emails
- [ ] Set health check intervals

### 2. Check Logs Regularly

```bash
# View API logs
# Render Dashboard → sentinel-grid-api → Logs

# View database metrics
# Render Dashboard → sentinel-grid-db → Metrics
```

### 3. Set Up External Monitoring (Optional)

- [ ] UptimeRobot or Pingdom
- [ ] Error tracking (Sentry, LogRocket)
- [ ] Performance monitoring (New Relic, DataDog)

---

## 🔒 Security Hardening

### 1. Update Environment Variables

- [ ] Change `AUTH_MODE` to `oidc` (after setting up OIDC)
- [ ] Verify secure keys are set (not default values)
- [ ] Remove `DASHBOARD_DEV_USER_ID` after OIDC setup

### 2. Database Security

- [ ] Restrict IP allowlist (if not using Internal URL)
- [ ] Enable SSL certificate verification
- [ ] Rotate database passwords regularly

### 3. API Security

- [ ] Implement rate limiting
- [ ] Add CORS restrictions for production domains
- [ ] Enable request logging and audit trails

---

## 🧪 Testing Checklist

### API Tests

- [ ] Health endpoint responds
- [ ] Authentication works (dev mode)
- [ ] Branches API returns data
- [ ] Cameras API returns data
- [ ] CCTV specifications endpoint works
- [ ] CCTV compliance endpoint works
- [ ] Branch requirements endpoint works
- [ ] Coverage gaps endpoint works

### Dashboard Tests

- [ ] Dashboard loads without errors
- [ ] Branch selection works
- [ ] Camera grid displays
- [ ] Live streaming works (if cameras connected)
- [ ] Navigation works
- [ ] Responsive on mobile

### Database Tests

- [ ] All migrations executed
- [ ] CCTV tables exist
- [ ] CCTV views exist
- [ ] Sample queries work
- [ ] Triggers are active

---

## 🚨 Troubleshooting

### Migration Failed

```bash
# Check which migrations ran
psql $EXTERNAL_DATABASE_URL -c "SELECT * FROM schema_migrations;"

# Re-run specific migration manually
psql $EXTERNAL_DATABASE_URL < database/migrations/004_cctv_infrastructure.sql

# Trigger new deploy
# Render Dashboard → Service → Manual Deploy
```

### Service Won't Start

1. Check environment variables
2. Verify DATABASE_URL uses Internal URL
3. Check build logs for errors
4. Ensure Node version is 22

### Database Connection Issues

1. Use Internal URL for service-to-service
2. Use External URL for local/remote access
3. Check database is running (green status)
4. Verify region matches

### CCTV Endpoints Return 404

1. Check API service logs
2. Verify routes are registered
3. Ensure store methods are implemented
4. Check migration ran successfully

---

## 📋 Documentation Links

- **[RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md)** - Complete deployment guide
- **[CCTV_INFRASTRUCTURE_INTEGRATION.md](CCTV_INFRASTRUCTURE_INTEGRATION.md)** - CCTV integration details
- **[CCTV_IMPLEMENTATION_SUMMARY.md](CCTV_IMPLEMENTATION_SUMMARY.md)** - Implementation summary
- **[CCTV_QUICK_REFERENCE.md](CCTV_QUICK_REFERENCE.md)** - Quick API reference

---

## ✅ Final Verification

Before marking as complete:

- [ ] All services show green status
- [ ] API health check passes
- [ ] Dashboard is accessible
- [ ] All 8 migrations executed successfully
- [ ] CCTV tables and views exist
- [ ] Sample API calls work
- [ ] Branch requirements can be initialized
- [ ] Coverage gaps can be queried
- [ ] Monitoring is set up
- [ ] Documentation is reviewed

---

## 🎉 Success Criteria

Your deployment is successful when:

✅ All services are running (green status)  
✅ Migrations completed (8/8 executed)  
✅ API responds to health checks  
✅ Dashboard loads correctly  
✅ CCTV endpoints are accessible  
✅ Branch requirements can be managed  
✅ Coverage gaps can be tracked  
✅ Database queries work  

---

**Estimated Time**: 15-20 minutes for first deploy  
**Re-deployment Time**: 3-5 minutes  

**Ready to deploy?** Follow the checklist from top to bottom! 🚀
